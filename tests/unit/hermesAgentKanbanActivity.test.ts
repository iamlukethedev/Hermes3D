// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";
import http from "node:http";
import type { AddressInfo } from "node:net";

const {
  DEFAULT_KANBAN_ACTIVITY_INTERVAL_MS,
  resolveKanbanActivityIntervalMs,
  boardsWithRunningWork,
  toKanbanActivities,
  diffKanbanActivities,
  createKanbanActivityWatcher,
} = await import("../../server/hermes-agent/kanban-activity");
const { createHermesAgentUpstream } = await import("../../server/hermes-agent/bridge");

type Frame = Record<string, unknown>;

const worker = (overrides: Record<string, unknown> = {}) => ({
  run_id: 7,
  task_id: "t_31a05e38",
  task_title: "Draw two illustrations",
  task_status: "running",
  task_assignee: "designer",
  profile: "designer",
  worker_pid: 4242,
  started_at: 1_791_500_000,
  ...overrides,
});

describe("resolveKanbanActivityIntervalMs", () => {
  it("defaults when unset or invalid", () => {
    expect(resolveKanbanActivityIntervalMs({})).toBe(DEFAULT_KANBAN_ACTIVITY_INTERVAL_MS);
    expect(resolveKanbanActivityIntervalMs({ HERMES3D_KANBAN_ACTIVITY_INTERVAL_MS: "soon" })).toBe(
      DEFAULT_KANBAN_ACTIVITY_INTERVAL_MS,
    );
  });

  it("treats 0 as disabled and clamps tiny intervals", () => {
    expect(resolveKanbanActivityIntervalMs({ HERMES3D_KANBAN_ACTIVITY_INTERVAL_MS: "0" })).toBe(0);
    expect(resolveKanbanActivityIntervalMs({ HERMES3D_KANBAN_ACTIVITY_INTERVAL_MS: "50" })).toBe(2_000);
    expect(resolveKanbanActivityIntervalMs({ HERMES3D_KANBAN_ACTIVITY_INTERVAL_MS: "30000" })).toBe(30_000);
  });
});

describe("boardsWithRunningWork", () => {
  it("keeps only boards reporting a running card", () => {
    expect(
      boardsWithRunningWork({
        boards: [
          { slug: "default", counts: { done: 3 } },
          { slug: "tech-woman", counts: { running: 1, todo: 2 } },
          { slug: "", counts: { running: 4 } },
          null,
        ],
      }),
    ).toEqual(["tech-woman"]);
    expect(boardsWithRunningWork(undefined)).toEqual([]);
  });
});

describe("toKanbanActivities", () => {
  it("maps workers onto known agents by profile, falling back to the assignee", () => {
    const activities = toKanbanActivities(
      [
        { board: "tech-woman", response: { workers: [worker()] } },
        {
          board: "atlas",
          response: { workers: [worker({ profile: "", task_assignee: "builder", task_id: "t_b", run_id: 9 })] },
        },
      ],
      new Set(["designer", "builder"]),
    );
    expect([...activities.values()]).toEqual([
      {
        key: "kanban:tech-woman:t_31a05e38:7",
        agentId: "designer",
        board: "tech-woman",
        taskId: "t_31a05e38",
        title: "Draw two illustrations",
        startedAtMs: 1_791_500_000_000,
      },
      expect.objectContaining({ key: "kanban:atlas:t_b:9", agentId: "builder" }),
    ]);
  });

  it("drops workers for profiles the office does not show and junk rows", () => {
    const activities = toKanbanActivities(
      [{ board: "b", response: { workers: [worker({ profile: "ghost" }), worker({ task_id: "" }), "x", null] } }],
      new Set(["designer"]),
    );
    expect(activities.size).toBe(0);
  });
});

describe("diffKanbanActivities", () => {
  it("reports runs that appeared and runs that ended", () => {
    const a = { key: "a" };
    const b = { key: "b" };
    const c = { key: "c" };
    const { started, ended } = diffKanbanActivities(
      new Map([
        ["a", a],
        ["b", b],
      ]),
      new Map([
        ["b", b],
        ["c", c],
      ]),
    );
    expect(started).toEqual([c]);
    expect(ended).toEqual([a]);
  });
});

describe("createKanbanActivityWatcher", () => {
  const makeWatcher = (responses: Array<Record<string, unknown> | Error>) => {
    const events: string[] = [];
    let call = 0;
    const watcher = createKanbanActivityWatcher({
      intervalMs: 0, // driven manually through poll()
      request: async (path: string) => {
        if (path === "/boards") {
          const next = responses[Math.min(call, responses.length - 1)];
          call += 1;
          if (next instanceof Error) throw next;
          return {
            boards: [{ slug: "b1", counts: { running: (next.workers as unknown[]).length } }],
            __workers: next,
          };
        }
        const current = responses[Math.min(call - 1, responses.length - 1)];
        return current;
      },
      getKnownAgentIds: () => new Set(["designer", "builder"]),
      onStart: (activity: { agentId: string }) => events.push(`start:${activity.agentId}`),
      onEnd: (activity: { agentId: string }) => events.push(`end:${activity.agentId}`),
      onStillActive: (activity: { agentId: string }) => events.push(`still:${activity.agentId}`),
    });
    return { watcher, events };
  };

  it("emits start, re-announces live runs, then emits end", async () => {
    const { watcher, events } = makeWatcher([
      { workers: [worker()] },
      { workers: [worker()] },
      { workers: [] },
    ]);
    await watcher.poll();
    await watcher.poll();
    await watcher.poll();
    expect(events).toEqual(["start:designer", "still:designer", "end:designer"]);
    expect(watcher.snapshot()).toEqual([]);
  });

  it("keeps the previous snapshot when a poll fails", async () => {
    const { watcher, events } = makeWatcher([{ workers: [worker()] }, new Error("backend restarting")]);
    await watcher.poll();
    await watcher.poll();
    expect(events).toEqual(["start:designer"]);
    expect(watcher.snapshot()).toHaveLength(1);
  });
});

// --- bridge integration ----------------------------------------------------

const servers: Array<{ close: (cb: () => void) => void }> = [];
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
 * One HTTP server playing hermes-agent: /api/ws speaks just enough JSON-RPC for
 * the bridge to connect and list profiles; /api/plugins/kanban/* serves
 * whatever the test sets in `kanban.workers`.
 */
const startFakeBackend = async () => {
  const kanban = { workers: [] as Record<string, unknown>[], tokens: [] as string[] };
  const server = http.createServer((req, res) => {
    kanban.tokens.push(String(req.headers["x-hermes-session-token"] ?? ""));
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/plugins/kanban/boards") {
      res.end(JSON.stringify({ boards: [{ slug: "tech-woman", counts: { running: kanban.workers.length } }] }));
      return;
    }
    if (url.pathname === "/api/plugins/kanban/workers/active") {
      res.end(JSON.stringify({ workers: kanban.workers, count: kanban.workers.length }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws: WsSocket) => {
    const send = (obj: unknown) => ws.send(JSON.stringify(obj));
    send({ jsonrpc: "2.0", method: "event", params: { type: "gateway.ready", payload: {} } });
    ws.on("message", (raw) => {
      const request = JSON.parse(String(raw)) as Frame;
      if (request.method === "profiles.list") {
        send({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            profiles: [
              { name: "default", is_default: true },
              { name: "designer", display_name: "Designer" },
            ],
          },
        });
        return;
      }
      send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "unknown method" } });
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return { url: `ws://127.0.0.1:${port}`, kanban };
};

describe("hermes-agent bridge kanban activity", () => {
  it("turns a running kanban worker into agent lifecycle events", async () => {
    const backend = await startFakeBackend();
    backend.kanban.workers = [worker()];

    const frames: Frame[] = [];
    const upstream = createHermesAgentUpstream({
      url: backend.url,
      token: "tok-1",
      kanbanActivityIntervalMs: 2_000,
    });
    upstreams.push(upstream);
    upstream.on("message", (raw: string) => frames.push(JSON.parse(raw) as Frame));
    await new Promise<void>((resolve, reject) => {
      upstream.on("open", () => resolve());
      upstream.on("error", reject);
    });

    const waitFor = async (predicate: (frame: Frame) => boolean, label: string, timeoutMs = 6000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const hit = frames.find(predicate);
        if (hit) return hit;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`timed out waiting for ${label}; saw ${JSON.stringify(frames)}`);
    };

    upstream.send(JSON.stringify({ type: "req", id: "c1", method: "connect", params: {} }));
    await waitFor((f) => f.type === "res" && f.id === "c1", "hello-ok");

    const isLifecycle = (phase: string) => (f: Frame) =>
      f.event === "agent" &&
      (f.payload as Frame)?.stream === "lifecycle" &&
      ((f.payload as Frame).data as Frame)?.phase === phase;

    const started = await waitFor(isLifecycle("start"), "lifecycle start");
    expect(started.payload).toEqual({
      runId: "kanban:tech-woman:t_31a05e38:7",
      sessionKey: "agent:designer:kanban:tech-woman:t_31a05e38:7",
      stream: "lifecycle",
      data: { phase: "start", text: "Draw two illustrations" },
    });
    const speech = await waitFor((f) => f.event === "office.speech", "office.speech");
    expect(speech.payload).toMatchObject({
      agentId: "designer",
      name: "Designer",
      text: "Kanban: Draw two illustrations",
    });
    expect(backend.kanban.tokens.every((t) => t === "tok-1")).toBe(true);

    backend.kanban.workers = [];
    const ended = await waitFor(isLifecycle("end"), "lifecycle end");
    expect((ended.payload as Frame).runId).toBe("kanban:tech-woman:t_31a05e38:7");
  }, 15_000);

  it("stays quiet when disabled", async () => {
    const backend = await startFakeBackend();
    backend.kanban.workers = [worker()];
    const frames: Frame[] = [];
    const upstream = createHermesAgentUpstream({ url: backend.url, token: "t", kanbanActivityIntervalMs: 0 });
    upstreams.push(upstream);
    upstream.on("message", (raw: string) => frames.push(JSON.parse(raw) as Frame));
    await new Promise<void>((resolve) => upstream.on("open", () => resolve()));
    upstream.send(JSON.stringify({ type: "req", id: "c1", method: "connect", params: {} }));
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(frames.some((f) => f.event === "agent")).toBe(false);
    expect(backend.kanban.tokens).toHaveLength(0);
  });
});
