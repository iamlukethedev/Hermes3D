// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";
import type { AddressInfo } from "node:net";

const { createHermesAgentUpstream } = await import("../../server/hermes-agent/bridge");

type Frame = Record<string, unknown>;

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stand-in for hermes-agent: like the real gateway, it only sends the
 * `approval` server request to a client that advertised
 * `client.capabilities {server_requests: true}`.
 */
const startFakeHermes = async () => {
  const wss = new WebSocketServer({ port: 0 });
  servers.push(wss);
  await new Promise<void>((resolve) => wss.on("listening", () => resolve()));

  const state = {
    advertised: false,
    answers: [] as Frame[],
    ws: null as WsSocket | null,
  };

  wss.on("connection", (ws: WsSocket, req) => {
    if ((req.url ?? "").startsWith("/api/events")) return;
    state.ws = ws;
    const send = (obj: unknown) => ws.send(JSON.stringify(obj));
    send({ jsonrpc: "2.0", method: "event", params: { type: "gateway.ready", payload: {} } });
    ws.on("message", (raw) => {
      const frame = JSON.parse(String(raw)) as Frame;
      if (frame.method === undefined && frame.id !== undefined) {
        state.answers.push(frame);
        return;
      }
      const reply = (result: Frame) => send({ jsonrpc: "2.0", id: frame.id, result });
      const params = (frame.params ?? {}) as Frame;
      switch (frame.method) {
        case "client.capabilities":
          state.advertised = params.server_requests === true;
          return reply({});
        case "session.create":
          return reply({ session_id: "rt-1", stored_session_id: "st-1" });
        case "prompt.submit":
          reply({});
          if (state.advertised) {
            setTimeout(
              () =>
                send({
                  jsonrpc: "2.0",
                  id: "srq-1",
                  method: "approval",
                  params: {
                    session_id: "rt-1",
                    request_id: "req-1",
                    command: "write AGENTS.md",
                    choices: ["once", "session", "always", "deny"],
                  },
                }),
              20,
            );
          }
          return;
        default:
          return reply({});
      }
    });
  });

  const { port } = wss.address() as AddressInfo;
  return { url: `ws://127.0.0.1:${port}`, state };
};

const openBridgeWithPendingApproval = async () => {
  const agent = await startFakeHermes();
  const frames: Frame[] = [];
  const upstream = createHermesAgentUpstream({ url: agent.url, token: "t" });
  upstreams.push(upstream);
  upstream.on("message", (raw: string) => frames.push(JSON.parse(raw) as Frame));
  await new Promise<void>((resolve, reject) => {
    upstream.on("open", () => resolve());
    upstream.on("error", reject);
  });
  const send = (frame: Frame) => upstream.send(JSON.stringify(frame));
  send({ type: "req", id: "c1", method: "connect", params: {} });
  await sleep(150);
  send({
    type: "req",
    id: "m1",
    method: "chat.send",
    params: { sessionKey: "agent:hermes:main", message: "edit AGENTS.md" },
  });

  const waitFor = async (predicate: (frame: Frame) => boolean) => {
    for (let i = 0; i < 300; i += 1) {
      const hit = frames.find(predicate);
      if (hit) return hit;
      await sleep(10);
    }
    throw new Error(`timed out; saw ${JSON.stringify(frames)}`);
  };
  const requested = await waitFor(
    (f) => f.type === "event" && f.event === "exec.approval.requested",
  );
  const payload = requested.payload as { id: string; request: { command: string } };
  return { agent, frames, send, waitFor, approvalId: payload.id, command: payload.request.command };
};

describe("hermes-agent approval requests", () => {
  it("advertises server_requests and surfaces the approval as exec.approval.requested", async () => {
    const ctx = await openBridgeWithPendingApproval();
    expect(ctx.agent.state.advertised).toBe(true);
    expect(ctx.command).toBe("write AGENTS.md");
  });

  it.each([
    ["allow-once", "once"],
    ["allow-always", "always"],
    ["deny", "deny"],
  ])("answers the server request when the user picks %s", async (decision, choice) => {
    const ctx = await openBridgeWithPendingApproval();
    ctx.send({
      type: "req",
      id: "r1",
      method: "exec.approval.resolve",
      params: { id: ctx.approvalId, decision },
    });
    await ctx.waitFor((f) => f.event === "exec.approval.resolved");
    await sleep(50);
    expect(ctx.agent.state.answers).toEqual([
      { jsonrpc: "2.0", id: "srq-1", result: { choice } },
    ]);
  });

  it("turns request.cancel into a resolved event and ignores late clicks", async () => {
    const ctx = await openBridgeWithPendingApproval();
    ctx.agent.state.ws?.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "event",
        params: { type: "request.cancel", session_id: "rt-1", payload: { id: "srq-1", method: "approval" } },
      }),
    );
    await ctx.waitFor((f) => f.event === "exec.approval.resolved");
    ctx.send({
      type: "req",
      id: "r1",
      method: "exec.approval.resolve",
      params: { id: ctx.approvalId, decision: "allow-once" },
    });
    await sleep(100);
    expect(ctx.agent.state.answers).toEqual([]);
  });

  it("answers unknown server requests with -32601", async () => {
    const ctx = await openBridgeWithPendingApproval();
    ctx.agent.state.ws?.send(
      JSON.stringify({ jsonrpc: "2.0", id: "srq-x", method: "clipboard.read", params: {} }),
    );
    await sleep(100);
    expect(ctx.agent.state.answers).toContainEqual(
      expect.objectContaining({ id: "srq-x", error: expect.objectContaining({ code: -32601 }) }),
    );
  });
});
