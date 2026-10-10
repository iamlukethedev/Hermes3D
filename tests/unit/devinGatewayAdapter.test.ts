import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  createDevinGateway,
  createDevinClient,
  mapDevinSessionState,
  DevinApiError,
} = await import("../../server/devin-gateway-adapter.js");

type Frame = Record<string, unknown> & { type?: string; event?: string };

const makeTmpStateFile = () =>
  path.join(mkdtempSync(path.join(tmpdir(), "h3d-devin-")), "state.json");

const collectEvents = (gateway: { subscribeEvents: (fn: (f: Frame) => void) => () => void }) => {
  const events: Frame[] = [];
  const unsubscribe = gateway.subscribeEvents((f) => events.push(f));
  return { events, unsubscribe };
};

const fakeSession = (overrides: Record<string, unknown> = {}) => ({
  session_id: "devin-test-123",
  url: "https://app.devin.ai/sessions/devin-test-123",
  status: "running",
  status_detail: "working",
  title: "Test session",
  tags: [],
  pull_requests: [],
  org_id: "org-test",
  created_at: 1,
  updated_at: 2,
  acus_consumed: 0,
  ...overrides,
});

const makeFakeClient = (overrides: Partial<Record<string, unknown>> = {}) => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record = (method: string, impl: (...args: any[]) => unknown) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return impl(...args);
    };
  const client = {
    calls,
    redact: (v: string) => v,
    verifyCredentials: vi.fn(
      record("verifyCredentials", async () => ({
        principal_type: "service_user",
        service_user_name: "test-su",
        org_id: "org-test",
      }))
    ),
    createSession: vi.fn(
      record("createSession", async (payload: Record<string, unknown>) =>
        fakeSession({ title: payload.title, status: "new" })
      )
    ),
    getSession: vi.fn(
      record("getSession", async () => fakeSession())
    ),
    listSessions: vi.fn(record("listSessions", async () => ({ items: [] }))),
    listSessionMessages: vi.fn(
      record("listSessionMessages", async () => ({ items: [], has_next_page: false }))
    ),
    sendMessage: vi.fn(
      record("sendMessage", async () => fakeSession())
    ),
    terminateSession: vi.fn(record("terminateSession", async () => fakeSession({ status: "exit" }))),
    archiveSession: vi.fn(record("archiveSession", async () => fakeSession())),
  };
  return { ...client, ...overrides };
};

const makeGateway = (clientOverrides = {}, gatewayOverrides = {}) => {
  const client = makeFakeClient(clientOverrides);
  const gateway = createDevinGateway({
    apiKey: "cog_test",
    orgId: "org-test",
    apiBaseUrl: "https://api.devin.ai/v3",
    stateFile: makeTmpStateFile(),
    syncIntervalMs: 0,
    client,
    ...gatewayOverrides,
  });
  return { gateway, client };
};

type GatewayResult = {
  ok: boolean;
  payload?: any;
  error?: { code: string; message: string };
};

type Gateway = ReturnType<typeof createDevinGateway>;

const callGateway = (
  gateway: Gateway,
  ...args: Parameters<Gateway["handleMethod"]>
): Promise<GatewayResult> => gateway.handleMethod(...args) as Promise<GatewayResult>;

describe("mapDevinSessionState", () => {
  it.each([
    [{ status: "new" }, "starting"],
    [{ status: "claimed" }, "starting"],
    [{ status: "resuming" }, "starting"],
    [{ status: "running", status_detail: "working" }, "running"],
    [{ status: "running", status_detail: null }, "running"],
    [{ status: "running", status_detail: "waiting_for_user" }, "waiting_input"],
    [{ status: "running", status_detail: "waiting_for_approval" }, "waiting_approval"],
    [{ status: "running", status_detail: "finished" }, "completed"],
    [{ status: "suspended", status_detail: "inactivity" }, "suspended"],
    [{ status: "exit" }, "completed"],
    [{ status: "error" }, "failed"],
    [null, "idle"],
    [{ status: "mystery" }, "idle"],
  ])("maps %j -> %s", (session, expected) => {
    expect(mapDevinSessionState(session)).toBe(expected);
  });
});

describe("createDevinClient", () => {
  it("throws not_configured without an API key", async () => {
    const client = createDevinClient({
      baseUrl: "https://api.devin.ai/v3",
      apiKey: "",
      orgId: "org-test",
    });
    await expect(client.getSession("devin-1")).rejects.toMatchObject({
      code: "not_configured",
    });
  });

  it("maps HTTP errors to typed DevinApiError codes", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ detail: "nope" }), { status: 403 }));
    const client = createDevinClient({
      baseUrl: "https://api.devin.ai/v3",
      apiKey: "cog_test",
      orgId: "org-test",
      fetchImpl,
    });
    await expect(client.getSession("devin-1")).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });

  it("retries 429 responses with backoff before succeeding", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response("{}", { status: 429 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(fakeSession()), { status: 200 }));
      const client = createDevinClient({
        baseUrl: "https://api.devin.ai/v3",
        apiKey: "cog_test",
        orgId: "org-test",
        fetchImpl,
      });
      const promise = client.getSession("devin-1");
      await vi.advanceTimersByTimeAsync(10_000);
      const res = await promise;
      expect(res.session_id).toBe("devin-test-123");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(fetchImpl.mock.calls[0][0]).toContain("/organizations/org-test/sessions/devin-1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry non-idempotent session creation on failure", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 500 }));
    const client = createDevinClient({
      baseUrl: "https://api.devin.ai/v3",
      apiKey: "cog_test",
      orgId: "org-test",
      fetchImpl,
    });
    await expect(client.createSession({ prompt: "x" })).rejects.toMatchObject({ status: 500 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("devin-gateway-adapter protocol", () => {
  it("lists default Devin agent profiles", async () => {
    const { gateway } = makeGateway();
    const res = await callGateway(gateway, "agents.list", {}, "1", () => {});
    expect(res.ok).toBe(true);
    const names = res.payload.agents.map((a: { name: string }) => a.name);
    expect(names).toContain("Devin Backend Engineer");
    expect(names).toContain("Devin QA Engineer");
    expect(res.payload.defaultId).toBe("devin-orchestrator");
  });

  it("rejects chat.send when not configured", async () => {
    const gateway = createDevinGateway({
      apiKey: "",
      orgId: "",
      stateFile: makeTmpStateFile(),
      syncIntervalMs: 0,
      client: makeFakeClient(),
    });
    const res = await callGateway(gateway, 
      "chat.send",
      { sessionKey: "agent:devin-backend:main", message: "build a thing" },
      "1",
      () => {}
    );
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("not_configured");
  });

  it("chat.send creates a Devin session and binds it", async () => {
    const { gateway, client } = makeGateway();
    const { events, unsubscribe } = collectEvents(gateway);
    const res = await callGateway(gateway, 
      "chat.send",
      {
        sessionKey: "agent:devin-backend:main",
        message: "Desenvolva um backend Java Spring Boot com PostgreSQL",
      },
      "1",
      () => {}
    );
    unsubscribe();
    expect(res.ok).toBe(true);
    expect(res.payload.status).toBe("started");
    expect(client.createSession).toHaveBeenCalledTimes(1);
    const payload = client.createSession.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.prompt).toContain("Spring Boot");
    expect(payload.tags).toContain("hermes3d");
    const binding = gateway._state.bindings.get("agent:devin-backend:main");
    expect(binding.devinSessionId).toBe("devin-test-123");
    expect(events.some((f) => f.event === "devin")).toBe(true);
  });

  it("chat.send posts a message when a session is already bound", async () => {
    const { gateway, client } = makeGateway();
    await callGateway(gateway, 
      "devin.agent.bind",
      { agentId: "devin-backend", devinSessionId: "devin-test-123" },
      "b",
      () => {}
    );
    const res = await callGateway(gateway, 
      "chat.send",
      { sessionKey: "agent:devin-backend:main", message: "follow up" },
      "2",
      () => {}
    );
    expect(res.ok).toBe(true);
    expect(client.sendMessage).toHaveBeenCalledWith("devin-test-123", "follow up");
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it("enforces the repo allowlist on session creation", async () => {
    const { gateway, client } = makeGateway({}, { allowedRepos: ["acme/api"] });
    const res = await callGateway(gateway, 
      "chat.send",
      {
        sessionKey: "agent:devin-backend:main",
        message: "deploy",
        repos: ["evil/repo"],
      },
      "1",
      () => {}
    );
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("forbidden");
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it("chat.abort terminates the bound Devin session", async () => {
    const { gateway, client } = makeGateway();
    await callGateway(gateway, 
      "devin.agent.bind",
      { agentId: "devin-backend", devinSessionId: "devin-test-123" },
      "b",
      () => {}
    );
    const res = await callGateway(gateway, 
      "chat.abort",
      { sessionKey: "agent:devin-backend:main" },
      "a",
      () => {}
    );
    expect(res.ok).toBe(true);
    expect(client.terminateSession).toHaveBeenCalledWith("devin-test-123");
    expect(gateway._state.sessionMeta.get("agent:devin-backend:main").state).toBe("cancelled");
  });

  it("sessions.reset unbinds without deleting the remote session", async () => {
    const { gateway, client } = makeGateway();
    await callGateway(gateway, 
      "devin.agent.bind",
      { agentId: "devin-backend", devinSessionId: "devin-test-123" },
      "b",
      () => {}
    );
    const res = await callGateway(gateway, 
      "sessions.reset",
      { key: "agent:devin-backend:main" },
      "r",
      () => {}
    );
    expect(res.ok).toBe(true);
    expect(gateway._state.bindings.has("agent:devin-backend:main")).toBe(false);
    expect(client.terminateSession).not.toHaveBeenCalled();
  });

  it("agents.create registers a profile and rejects disallowed repos", async () => {
    const { gateway } = makeGateway({}, { allowedRepos: ["acme/api"] });
    const okRes = await callGateway(gateway, 
      "agents.create",
      { name: "Release Bot", role: "Release", repos: ["acme/api"] },
      "1",
      () => {}
    );
    expect(okRes.ok).toBe(true);
    await expect(
      callGateway(gateway,
        "agents.create",
        { name: "Bad", repos: ["other/repo"] },
        "2",
        () => {}
      )
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("surfaces agent profiles and bindings in sessions.list", async () => {
    const { gateway } = makeGateway();
    await callGateway(gateway, 
      "devin.agent.bind",
      { agentId: "devin-qa", devinSessionId: "devin-test-123" },
      "b",
      () => {}
    );
    const res = await callGateway(gateway, "sessions.list", {}, "1", () => {});
    const qa = res.payload.sessions.find(
      (s: { agentId: string }) => s.agentId === "devin-qa"
    );
    expect(qa.devin.sessionId).toBe("devin-test-123");
    expect(qa.devin.state).toBe("running");
    expect(qa.modelProvider).toBe("devin");
  });

  it("devin.health reports principal info", async () => {
    const { gateway } = makeGateway();
    const res = await callGateway(gateway, "devin.health", {}, "1", () => {});
    expect(res.payload.configured).toBe(true);
    expect(res.payload.health.ok).toBe(true);
    expect(res.payload.health.serviceUserName).toBe("test-su");
  });

  it("devin.sync pulls messages into history and emits chat deltas", async () => {
    const messages = {
      items: [
        {
          event_id: "event-1",
          source: "user",
          message: "hello",
          created_at: 10,
        },
        {
          event_id: "event-2",
          source: "devin",
          message: "Working on it.",
          created_at: 11,
        },
      ],
      has_next_page: false,
      end_cursor: "cur-1",
    };
    const { gateway, client } = makeGateway({
      listSessionMessages: vi.fn(async () => messages),
    });
    await callGateway(gateway, 
      "devin.agent.bind",
      { agentId: "devin-backend", devinSessionId: "devin-test-123" },
      "b",
      () => {}
    );
    // Open a run so deltas are emitted.
    await callGateway(gateway, 
      "chat.send",
      { sessionKey: "agent:devin-backend:main", message: "continue" },
      "r1",
      () => {}
    );
    const { events, unsubscribe } = collectEvents(gateway);
    await gateway.syncAllSessions();
    unsubscribe();
    const history = gateway._state.history.get("agent:devin-backend:main");
    expect(history.some((m: { eventId?: string }) => m.eventId === "event-2")).toBe(true);
    expect(events.some((f) => f.event === "devin")).toBe(true);
    // Second sync must not duplicate messages (dedup via cursor).
    await gateway.syncAllSessions();
    const history2 = gateway._state.history.get("agent:devin-backend:main");
    const event2Count = history2.filter(
      (m: { eventId?: string }) => m.eventId === "event-2"
    ).length;
    expect(event2Count).toBe(1);
    expect(client.listSessionMessages).toHaveBeenCalled();
  });

  it("merges the API echo of the user message instead of duplicating it", async () => {
    const { gateway } = makeGateway({
      listSessionMessages: vi.fn(async () => ({
        items: [
          { event_id: "event-u1", source: "user", message: "hello devin", created_at: 10 },
          { event_id: "event-d1", source: "devin", message: "Hi! How can I help?", created_at: 11 },
        ],
        has_next_page: false,
        end_cursor: null,
      })),
    });
    await callGateway(gateway,
      "devin.agent.bind",
      { agentId: "devin-backend", devinSessionId: "devin-echo" },
      "b",
      () => {}
    );
    // chat.send pushes the user message locally (no eventId yet).
    await callGateway(gateway,
      "chat.send",
      { sessionKey: "agent:devin-backend:main", message: "hello devin" },
      "r1",
      () => {}
    );
    await gateway.syncAllSessions();
    const history = gateway._state.history.get("agent:devin-backend:main");
    const userCopies = history.filter(
      (m: { role: string; content: string }) => m.role === "user" && m.content === "hello devin"
    );
    expect(userCopies).toHaveLength(1);
    expect(userCopies[0].eventId).toBe("event-u1");
    expect(history.some((m: { eventId?: string }) => m.eventId === "event-d1")).toBe(true);
  });

  it("closes an active run when the Devin session is suspended", async () => {
    const { gateway, client } = makeGateway({
      getSession: vi.fn(async () => fakeSession({ status: "suspended", status_detail: "inactivity" })),
      listSessionMessages: vi.fn(async () => ({ items: [], has_next_page: false })),
    });
    await callGateway(gateway,
      "devin.agent.bind",
      { agentId: "devin-backend", devinSessionId: "devin-susp" },
      "b",
      () => {}
    );
    const { events, unsubscribe } = collectEvents(gateway);
    await callGateway(gateway,
      "chat.send",
      { sessionKey: "agent:devin-backend:main", message: "work please" },
      "r1",
      () => {}
    );
    await gateway.syncAllSessions();
    unsubscribe();
    const finals = events.filter(
      (f) =>
        f.event === "chat" &&
        (f.payload as { state?: string } | undefined)?.state === "final"
    );
    expect(finals.length).toBeGreaterThan(0);
    const history = gateway._state.history.get("agent:devin-backend:main");
    expect(history[history.length - 1].role).toBe("assistant");
    expect(client.getSession).toHaveBeenCalled();
  });

  it("marks a session unreachable when the API returns 404", async () => {
    const getSession = vi
      .fn()
      .mockResolvedValueOnce(fakeSession({ session_id: "devin-gone" }))
      .mockRejectedValue(
        new DevinApiError("not_found", "Devin API HTTP 404", { status: 404 })
      );
    const { gateway } = makeGateway({
      getSession,
      listSessionMessages: vi.fn(async () => ({ items: [] })),
    });
    const bindRes = await callGateway(gateway, 
      "devin.agent.bind",
      { agentId: "devin-backend", devinSessionId: "devin-gone" },
      "b",
      () => {}
    );
    expect(bindRes.ok).toBe(true);
    await gateway.syncAllSessions();
    expect(gateway._state.sessionMeta.get("agent:devin-backend:main").state).toBe("unreachable");
  });

  it("persists and reloads agent profiles and bindings from disk", async () => {
    const stateFile = makeTmpStateFile();
    const client = makeFakeClient();
    const gw1 = createDevinGateway({
      apiKey: "cog_test",
      orgId: "org-test",
      stateFile,
      syncIntervalMs: 0,
      client,
    });
    await callGateway(gw1, 
      "devin.agent.bind",
      { agentId: "devin-backend", devinSessionId: "devin-test-123" },
      "b",
      () => {}
    );
    // Flush the debounced persist.
    await new Promise((resolve) => setTimeout(resolve, 600));
    const gw2 = createDevinGateway({
      apiKey: "cog_test",
      orgId: "org-test",
      stateFile,
      syncIntervalMs: 0,
      client: makeFakeClient(),
    });
    expect(gw2._state.bindings.get("agent:devin-backend:main")?.devinSessionId).toBe(
      "devin-test-123"
    );
    expect(gw2._state.agents.has("devin-orchestrator")).toBe(true);
    rmSync(path.dirname(stateFile), { recursive: true, force: true });
  });
});
