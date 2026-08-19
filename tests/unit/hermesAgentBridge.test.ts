// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";
import type { AddressInfo } from "node:net";

const { buildJsonRpcUrl, redactUrl } = await import("../../server/hermes-agent/jsonrpc-client");
const { createHermesAgentUpstream, toHermes3dMessages } = await import(
  "../../server/hermes-agent/bridge"
);

type Frame = Record<string, unknown>;
type RpcHandler = (params: Frame, emit: (type: string, payload: Frame) => void) => Frame | void;

/** Read a dotted path out of a decoded frame without widening everything to `any`. */
const at = (source: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], source);

const servers: WebSocketServer[] = [];
const upstreams: { terminate: () => void }[] = [];

afterEach(async () => {
  for (const upstream of upstreams.splice(0)) {
    try {
      upstream.terminate();
    } catch {}
  }
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/**
 * Minimal stand-in for hermes-agent's /api/ws: emits gateway.ready on connect,
 * answers JSON-RPC requests from `handlers`, and lets a handler push events.
 */
const startFakeHermesAgent = async (handlers: Record<string, RpcHandler>) => {
  const wss = new WebSocketServer({ port: 0 });
  servers.push(wss);
  await new Promise<void>((resolve) => wss.on("listening", () => resolve()));

  const received: Frame[] = [];

  wss.on("connection", (ws: WsSocket, req) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    received.push({ __connect: true, path: url.pathname, token: url.searchParams.get("token") });

    const send = (obj: unknown) => ws.send(JSON.stringify(obj));
    const emit = (type: string, payload: Frame) =>
      send({ jsonrpc: "2.0", method: "event", params: { type, session_id: "s1", payload } });

    send({ jsonrpc: "2.0", method: "event", params: { type: "gateway.ready", payload: {} } });

    ws.on("message", (raw) => {
      const request = JSON.parse(String(raw)) as Frame;
      received.push(request);
      const handler = handlers[String(request.method)];
      if (!handler) {
        send({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: "unknown method" },
        });
        return;
      }
      const result = handler((request.params ?? {}) as Frame, emit);
      send({ jsonrpc: "2.0", id: request.id, result: result ?? {} });
    });
  });

  const { port } = wss.address() as AddressInfo;
  return { url: `ws://127.0.0.1:${port}`, received };
};

/** Drive the bridge and collect the frames it sends back toward the browser. */
const openBridge = async (url: string, token = "") => {
  const frames: Frame[] = [];
  const upstream = createHermesAgentUpstream({ url, token });
  upstreams.push(upstream);
  upstream.on("message", (raw: string) => frames.push(JSON.parse(raw) as Frame));

  await new Promise<void>((resolve, reject) => {
    upstream.on("open", () => resolve());
    upstream.on("error", reject);
    setTimeout(() => reject(new Error("bridge did not open")), 5000);
  });

  const send = (frame: Frame) => upstream.send(JSON.stringify(frame));

  const waitFor = async (predicate: (frame: Frame) => boolean, label: string) => {
    const start = Date.now();
    while (Date.now() - start < 5000) {
      const hit = frames.find(predicate);
      if (hit) return hit;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`timed out waiting for ${label}; saw ${JSON.stringify(frames)}`);
  };

  return { upstream, frames, send, waitFor };
};

describe("buildJsonRpcUrl", () => {
  it("appends the gateway path and maps https to wss", () => {
    expect(buildJsonRpcUrl("https://host.ts.net:8443", "abc")).toBe(
      "wss://host.ts.net:8443/api/ws?token=abc",
    );
  });

  it("keeps a path the caller already supplied", () => {
    expect(buildJsonRpcUrl("wss://host.ts.net:8443/api/ws", "")).toBe(
      "wss://host.ts.net:8443/api/ws",
    );
  });

  it("maps http to ws and tolerates a trailing slash", () => {
    expect(buildJsonRpcUrl("http://localhost:9119/", "t")).toBe(
      "ws://localhost:9119/api/ws?token=t",
    );
  });

  it("rejects a scheme that is not http(s) or ws(s)", () => {
    expect(() => buildJsonRpcUrl("ftp://host", "")).toThrow(/Unsupported scheme/);
  });

  it("keeps the token out of logged URLs", () => {
    expect(redactUrl("wss://h/api/ws?token=secret")).toBe("wss://h/api/ws?token=***");
  });
});

describe("loopback Host fallback", () => {
  /**
   * Stands in for a loopback-bound hermes-agent behind Tailscale Serve, which
   * forwards the client's Host verbatim: the tailnet name is refused with 4403
   * and only a loopback Host gets through.
   */
  const startHostStrictAgent = async () => {
    const wss = new WebSocketServer({ port: 0 });
    servers.push(wss);
    await new Promise<void>((resolve) => wss.on("listening", () => resolve()));

    const hostsSeen: string[] = [];
    wss.on("connection", (ws: WsSocket, req) => {
      const host = String(req.headers.host ?? "");
      hostsSeen.push(host);
      const hostOnly = host.split(":")[0].toLowerCase();
      if (!["localhost", "127.0.0.1", "::1"].includes(hostOnly)) {
        ws.close(4403, "host_mismatch");
        return;
      }
      ws.send(JSON.stringify({ jsonrpc: "2.0", method: "event", params: { type: "gateway.ready", payload: {} } }));
    });

    const { port } = wss.address() as AddressInfo;
    return { port, hostsSeen };
  };

  it("retries with a loopback Host when the backend refuses the forwarded one", async () => {
    const { port, hostsSeen } = await startHostStrictAgent();
    const { HermesAgentJsonRpcClient } = await import("../../server/hermes-agent/jsonrpc-client");

    // 127.0.0.1 resolves, but the Host header carries a name the backend rejects.
    const client = new HermesAgentJsonRpcClient({ url: `ws://127.0.0.1:${port}`, token: "t" });
    client.hostHeader = "luke-hermes.taildb786a.ts.net";
    client.loopbackHostFallback = true;

    const ready = new Promise<void>((resolve, reject) => {
      client.on("ready", () => resolve());
      client.on("close", (code: number) => reject(new Error(`closed ${code}`)));
      setTimeout(() => reject(new Error("never became ready")), 5000);
    });
    client.connect();
    await ready;

    expect(hostsSeen[0]).toBe("luke-hermes.taildb786a.ts.net");
    expect(hostsSeen[1]).toBe("localhost");
    expect(client.usedLoopbackHost).toBe(true);
    client.terminate();
  });

  it("retries when the upgrade is refused with HTTP 403 before accepting", async () => {
    // How a loopback-bound hermes-agent actually refuses a foreign Host on
    // /api/ws: the handshake is rejected outright rather than accepted-then-closed.
    const hostsSeen: string[] = [];
    const wss = new WebSocketServer({
      port: 0,
      verifyClient: ({ req }, done) => {
        const host = String(req.headers.host ?? "");
        hostsSeen.push(host);
        done(host.split(":")[0].toLowerCase() === "localhost", 403);
      },
    });
    servers.push(wss);
    await new Promise<void>((resolve) => wss.on("listening", () => resolve()));
    wss.on("connection", (ws: WsSocket) => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", method: "event", params: { type: "gateway.ready", payload: {} } }));
    });
    const { port } = wss.address() as AddressInfo;

    const { HermesAgentJsonRpcClient } = await import("../../server/hermes-agent/jsonrpc-client");
    const client = new HermesAgentJsonRpcClient({ url: `ws://127.0.0.1:${port}`, token: "t" });
    client.hostHeader = "luke-hermes.taildb786a.ts.net";

    const ready = new Promise<void>((resolve, reject) => {
      client.on("ready", () => resolve());
      client.on("error", (e: Error) => reject(e));
      setTimeout(() => reject(new Error("never became ready")), 5000);
    });
    client.connect();
    await ready;

    expect(hostsSeen[0]).toBe("luke-hermes.taildb786a.ts.net");
    expect(hostsSeen[1]).toBe("localhost");
    client.terminate();
  });

  it("gives up after one retry rather than looping", async () => {
    const wss = new WebSocketServer({ port: 0 });
    servers.push(wss);
    await new Promise<void>((resolve) => wss.on("listening", () => resolve()));
    let attempts = 0;
    wss.on("connection", (ws: WsSocket) => {
      attempts += 1;
      ws.close(4403, "host_mismatch");
    });
    const { port } = wss.address() as AddressInfo;

    const { HermesAgentJsonRpcClient } = await import("../../server/hermes-agent/jsonrpc-client");
    const client = new HermesAgentJsonRpcClient({ url: `ws://127.0.0.1:${port}`, token: "t" });

    const closed = new Promise<number>((resolve) => client.on("close", (code: number) => resolve(code)));
    client.connect();
    expect(await closed).toBe(4403);
    expect(attempts).toBe(2);
  });
});

describe("profiles as agents", () => {
  // Verbatim rows from a live hermes-agent `profiles.list`.
  const backendProfiles = [
    {
      name: "default",
      path: "/Users/lukeai1/.hermes",
      is_default: true,
      model: "claude-haiku-4-5-20251001",
      description: "",
      display_name: "",
    },
    {
      name: "allan",
      path: "/Users/lukeai1/.hermes/profiles/allan",
      is_default: false,
      model: "claude-haiku-4-5-20251001",
      description:
        "Allan — technical planner and business systems analyst for Smartways. Converts Jira tickets into plans.",
      display_name: "",
    },
    {
      name: "andrew",
      path: "/Users/lukeai1/.hermes/profiles/andrew",
      is_default: false,
      model: "claude-opus-4-8",
      description: "Andrew — senior full-stack software developer for Smartways.",
      display_name: "",
    },
  ];

  it("gives every profile its own agent", async () => {
    const { toHermes3dAgents } = await import("../../server/hermes-agent/bridge");
    const agents = toHermes3dAgents(backendProfiles);
    expect(agents.map((a) => a.id)).toEqual(["default", "allan", "andrew"]);
    expect(agents.map((a) => a.name)).toEqual(["Default", "Allan", "Andrew"]);
  });

  it("routes non-default agents by profile and leaves the default unnamed", async () => {
    const { toHermes3dAgents } = await import("../../server/hermes-agent/bridge");
    const [def, allan] = toHermes3dAgents(backendProfiles);
    // An empty profile means "launch profile" upstream; naming it is wrong.
    expect(def.profile).toBe("");
    expect(allan.profile).toBe("allan");
  });

  it("uses the description after the dash as the role", async () => {
    const { toHermes3dAgents } = await import("../../server/hermes-agent/bridge");
    const allan = toHermes3dAgents(backendProfiles)[1];
    expect(allan.role.startsWith("technical planner")).toBe(true);
  });

  it("picks the flagged profile as the default agent", async () => {
    const { toHermes3dAgents, resolveDefaultAgentId } = await import(
      "../../server/hermes-agent/bridge"
    );
    expect(resolveDefaultAgentId(toHermes3dAgents(backendProfiles))).toBe("default");
  });

  it("ignores unusable rows", async () => {
    const { toHermes3dAgents } = await import("../../server/hermes-agent/bridge");
    expect(toHermes3dAgents([null, {}, "x", { name: "" }])).toEqual([]);
    expect(toHermes3dAgents(undefined)).toEqual([]);
  });

  it("advertises every profile and creates sessions against the right one", async () => {
    const createCalls: Frame[] = [];
    const agent = await startFakeHermesAgent({
      "profiles.list": () => ({ profiles: backendProfiles }),
      "session.create": (params) => {
        createCalls.push(params);
        return { session_id: `rt-${createCalls.length}` };
      },
      "prompt.submit": () => ({}),
    });
    const bridge = await openBridge(agent.url);

    bridge.send({ type: "req", id: "c1", method: "connect", params: {} });
    await bridge.waitFor((f) => f.type === "res" && f.id === "c1", "hello-ok");

    bridge.send({ type: "req", id: "a1", method: "agents.list", params: {} });
    const listed = await bridge.waitFor((f) => f.type === "res" && f.id === "a1", "agents.list");
    expect((at(listed, "payload.agents") as unknown[]).length).toBe(3);

    // A prompt aimed at Allan's desk must run under Allan's profile.
    bridge.send({
      type: "req",
      id: "s1",
      method: "chat.send",
      params: { sessionKey: "agent:allan:main", message: "hi" },
    });
    await bridge.waitFor((f) => f.type === "res" && f.id === "s1", "chat.send");
    expect(createCalls.at(-1)).toEqual({ profile: "allan" });

    // The default agent must NOT send a profile — that means "launch profile".
    bridge.send({
      type: "req",
      id: "s2",
      method: "chat.send",
      params: { sessionKey: "agent:default:main", message: "hi" },
    });
    await bridge.waitFor((f) => f.type === "res" && f.id === "s2", "chat.send default");
    expect(createCalls.at(-1)).toEqual({});
  });

  it("falls back to a single agent when the backend has no profiles.list", async () => {
    const agent = await startFakeHermesAgent({});
    const bridge = await openBridge(agent.url);
    bridge.send({ type: "req", id: "c1", method: "connect", params: {} });
    const res = await bridge.waitFor((f) => f.type === "res" && f.id === "c1", "hello-ok");
    expect((at(res, "payload.snapshot.health.agents") as unknown[]).length).toBe(1);
    expect(at(res, "payload.snapshot.health.defaultAgentId")).toBe("hermes");
  });
});

describe("toHermes3dCronJobs", () => {
  // Verbatim row shape returned by a live hermes-agent `cron.manage` list.
  const agentJob = {
    job_id: "f43da87997a8",
    name: "Daily token spend - morning briefing",
    prompt_preview: "Run `hermes insights --days 1` and extract today's data.",
    schedule: "0 7 * * *",
    repeat: "forever",
    deliver: "origin",
    next_run_at: "2026-08-19T07:00:00-05:00",
    last_run_at: "2026-08-18T07:00:40.472539-05:00",
    last_status: "ok",
    last_delivery_error: null,
    last_fire_error: null,
    enabled: true,
    state: "scheduled",
  };

  it("fills in the fields the office task board reads unguarded", async () => {
    const { toHermes3dCronJobs } = await import("../../server/hermes-agent/bridge");
    const [job] = toHermes3dCronJobs([agentJob]);

    // These four are exactly what crashed the office page when forwarded raw.
    expect(job.id).toBe("f43da87997a8");
    expect(job.payload).toEqual({ kind: "agentTurn", message: agentJob.prompt_preview });
    expect(job.schedule).toEqual({ kind: "cron", expr: "0 7 * * *" });
    expect(typeof job.state).toBe("object");
    expect(job.state.lastStatus).toBe("ok");
    expect(job.state.nextRunAtMs).toBe(Date.parse(agentJob.next_run_at));
    expect(Number.isFinite(job.updatedAtMs)).toBe(true);
  });

  it("marks a running job so the board can show it as working", async () => {
    const { toHermes3dCronJobs } = await import("../../server/hermes-agent/bridge");
    const [job] = toHermes3dCronJobs([{ ...agentJob, state: "running" }]);
    expect(typeof job.state.runningAtMs).toBe("number");
  });

  it("surfaces a failure so the board can flag it", async () => {
    const { toHermes3dCronJobs } = await import("../../server/hermes-agent/bridge");
    const [job] = toHermes3dCronJobs([
      { ...agentJob, last_status: "error", last_fire_error: "boom" },
    ]);
    expect(job.state.lastStatus).toBe("error");
    expect(job.state.lastError).toBe("boom");
  });

  it("drops rows with no id and tolerates junk", async () => {
    const { toHermes3dCronJobs } = await import("../../server/hermes-agent/bridge");
    expect(toHermes3dCronJobs([{}, null, "nope", { name: "no id" }])).toEqual([]);
    expect(toHermes3dCronJobs(undefined)).toEqual([]);
  });

  it("reads the other schedule spellings hermes-agent emits", async () => {
    const { toHermes3dSchedule } = await import("../../server/hermes-agent/bridge");
    expect(toHermes3dSchedule("30m")).toEqual({ kind: "every", everyMs: 1_800_000 });
    expect(toHermes3dSchedule("every 2h")).toEqual({ kind: "every", everyMs: 7_200_000 });
    expect(toHermes3dSchedule("0 9 * * *")).toEqual({ kind: "cron", expr: "0 9 * * *" });
    expect(toHermes3dSchedule("2026-06-01T09:00:00Z")).toEqual({
      kind: "at",
      at: "2026-06-01T09:00:00Z",
    });
  });
});

describe("toHermes3dMessages", () => {
  it("renames text to content and drops non-conversational rows", () => {
    expect(
      toHermes3dMessages([
        { role: "user", text: "hi" },
        { role: "tool", name: "terminal" },
        { role: "assistant", text: "hello" },
      ]),
    ).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("returns an empty list for a missing transcript", () => {
    expect(toHermes3dMessages(undefined)).toEqual([]);
  });
});

describe("hermes-agent bridge", () => {
  it("sends the token as a query param on /api/ws", async () => {
    const agent = await startFakeHermesAgent({});
    await openBridge(agent.url, "tok-123");

    expect(agent.received.find((frame) => frame.__connect)).toMatchObject({
      path: "/api/ws",
      token: "tok-123",
    });
  });

  it("answers connect with a hello-ok advertising one agent", async () => {
    const agent = await startFakeHermesAgent({});
    const bridge = await openBridge(agent.url);

    bridge.send({ type: "req", id: "c1", method: "connect", params: {} });
    const res = await bridge.waitFor((f) => f.type === "res" && f.id === "c1", "hello-ok");

    expect(res.ok).toBe(true);
    expect(at(res, "payload.type")).toBe("hello-ok");
    expect(at(res, "payload.snapshot.health.agents")).toHaveLength(1);
    expect(at(res, "payload.snapshot.health.defaultAgentId")).toBe("hermes");
  });

  it("turns chat.send into prompt.submit and streams deltas into chat events", async () => {
    const agent = await startFakeHermesAgent({
      "session.create": () => ({ session_id: "s1", stored_session_id: "stored-1" }),
      "prompt.submit": (_params, emit) => {
        setTimeout(() => {
          emit("message.start", {});
          emit("message.delta", { text: "Hel" });
          emit("message.delta", { text: "lo" });
          emit("message.complete", { text: "Hello", status: "complete" });
        }, 10);
        return { status: "streaming" };
      },
    });
    const bridge = await openBridge(agent.url);

    bridge.send({
      type: "req",
      id: "m1",
      method: "chat.send",
      params: { sessionKey: "agent:hermes:main", message: "hi", idempotencyKey: "run-1" },
    });

    const started = await bridge.waitFor((f) => f.type === "res" && f.id === "m1", "chat.send res");
    expect(started.payload).toMatchObject({ status: "started", runId: "run-1" });

    const submitted = agent.received.find((frame) => frame.method === "prompt.submit");
    expect(submitted?.params).toMatchObject({ session_id: "s1", text: "hi" });

    const final = await bridge.waitFor(
      (f) => f.event === "chat" && at(f, "payload.state") === "final",
      "final chat event",
    );
    expect(at(final, "payload.message")).toEqual({ role: "assistant", content: "Hello" });
    expect(at(final, "payload.runId")).toBe("run-1");

    // Deltas accumulate, so the browser always receives the full text so far.
    const deltas = bridge.frames.filter(
      (f) => f.event === "chat" && at(f, "payload.state") === "delta",
    );
    expect(deltas.map((frame) => at(frame, "payload.message.content"))).toEqual(["Hel", "Hello"]);
  });

  it("reports a failed prompt as an error response rather than a silent hang", async () => {
    const agent = await startFakeHermesAgent({
      "session.create": () => ({ session_id: "s1" }),
    });
    const bridge = await openBridge(agent.url);

    bridge.send({
      type: "req",
      id: "m2",
      method: "chat.send",
      params: { sessionKey: "agent:hermes:main", message: "hi" },
    });

    const res = await bridge.waitFor((f) => f.type === "res" && f.id === "m2", "chat.send failure");
    expect(res.ok).toBe(false);
    expect(at(res, "error.code")).toBe("hermes_agent.prompt_failed");
  });

  it("maps chat.abort onto session.interrupt", async () => {
    const agent = await startFakeHermesAgent({
      "session.create": () => ({ session_id: "s1" }),
      "prompt.submit": () => ({ status: "streaming" }),
      "session.interrupt": () => ({ status: "interrupted" }),
    });
    const bridge = await openBridge(agent.url);

    bridge.send({
      type: "req",
      id: "m3",
      method: "chat.send",
      params: { sessionKey: "agent:hermes:main", message: "hi", idempotencyKey: "run-9" },
    });
    await bridge.waitFor((f) => f.type === "res" && f.id === "m3", "chat.send res");

    bridge.send({ type: "req", id: "a1", method: "chat.abort", params: { runId: "run-9" } });
    const res = await bridge.waitFor((f) => f.type === "res" && f.id === "a1", "abort res");

    expect(res.payload).toMatchObject({ ok: true, aborted: 1 });
    expect(agent.received.some((frame) => frame.method === "session.interrupt")).toBe(true);
  });

  it("surfaces stored hermes-agent sessions alongside the main key", async () => {
    const agent = await startFakeHermesAgent({
      "session.list": () => ({
        sessions: [{ id: "20260409_abc", title: "Yesterday's chat", started_at: 1000 }],
      }),
    });
    const bridge = await openBridge(agent.url);

    bridge.send({ type: "req", id: "s1", method: "sessions.list", params: {} });
    const res = await bridge.waitFor((f) => f.type === "res" && f.id === "s1", "sessions.list");

    const sessions = at(res, "payload.sessions") as { key: string }[];
    expect(sessions.map((session) => session.key)).toEqual(
      expect.arrayContaining(["agent:hermes:main", "agent:hermes:20260409_abc"]),
    );
  });

  it("keeps working when an optional upstream method is unavailable", async () => {
    const agent = await startFakeHermesAgent({});
    const bridge = await openBridge(agent.url);

    bridge.send({ type: "req", id: "k1", method: "models.list", params: {} });
    const res = await bridge.waitFor((f) => f.type === "res" && f.id === "k1", "models.list");

    expect(res.ok).toBe(true);
    expect(at(res, "payload.models")).not.toHaveLength(0);
  });
});
