/**
 * Hermes kanban board access for the hermes-agent bridge.
 *
 * Kanban ships inside hermes-agent itself — every `hermes serve` backend
 * exposes the board over HTTP on the same origin as the JSON-RPC gateway,
 * authenticated with the same session token. This module maps the office task
 * board onto that API so the kanban desk works without installing anything.
 *
 * Status vocabularies differ on purpose. The office has five columns; hermes
 * has nine states with dispatcher semantics. Reads collapse hermes states into
 * office columns; writes pick the human-legal hermes transition. `running` is
 * claim-only upstream (the dispatcher owns it), so dragging a card toward
 * "working" queues it as `ready` and the dispatcher takes it from there.
 */

const http = require("node:http");
const https = require("node:https");

/** Office card ids carry this prefix so mutations can be routed back here. */
const KANBAN_TASK_ID_PREFIX = "kanban:";

/** hermes status -> office column. */
const READ_STATUS = {
  triage: "inbox",
  todo: "inbox",
  scheduled: "scheduled",
  ready: "scheduled",
  running: "working",
  blocked: "needs_attention",
  review: "needs_attention",
  done: "done",
  archived: "done",
};

/** Office column -> hermes status a human is allowed to set. */
const WRITE_STATUS = {
  inbox: "todo",
  scheduled: "ready",
  working: "ready",
  needs_attention: "blocked",
  done: "done",
};

const asTrimmed = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : "";

const asIdentifier = (value) => {
  const text = asTrimmed(value);
  if (text) return text;
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
};

/** Kanban stores epoch seconds; the office wants ISO strings. */
const toIsoTime = (seconds) => {
  const numeric = Number(seconds);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Date(numeric * 1000).toISOString();
};

const NOTE_MAX_CHARS = 280;

const toNote = (label, value) => {
  const text = asTrimmed(value);
  if (!text) return null;
  const clipped =
    text.length > NOTE_MAX_CHARS ? `${text.slice(0, NOTE_MAX_CHARS - 1)}…` : text;
  return label ? `${label}: ${clipped}` : clipped;
};

/** One hermes kanban task -> the office `GatewayTaskRecord` shape. */
const toHermes3dKanbanTaskRecord = (task) => {
  if (!task || typeof task !== "object") return null;
  const taskId = asTrimmed(task.id);
  const title = asTrimmed(task.title);
  if (!taskId || !title) return null;

  const status = READ_STATUS[asTrimmed(task.status)] ?? "inbox";
  const createdAt = toIsoTime(task.created_at) ?? new Date(0).toISOString();
  const updatedAt =
    toIsoTime(task.completed_at) ?? toIsoTime(task.started_at) ?? createdAt;
  const notes = [
    toNote("", task.latest_summary),
    toNote("Result", task.result),
    toNote("Blocked", task.last_failure_error),
  ].filter(Boolean);

  return {
    id: `${KANBAN_TASK_ID_PREFIX}${taskId}`,
    title,
    description: typeof task.body === "string" ? task.body : "",
    status,
    source: "hermes_event",
    sourceEventId: null,
    assignedAgentId: asTrimmed(task.assignee) || null,
    createdAt,
    updatedAt,
    playbookJobId: null,
    runId: asIdentifier(task.current_run_id) || null,
    channel: "kanban",
    externalThreadId: asTrimmed(task.session_id) || null,
    lastActivityAt: toIsoTime(task.last_heartbeat_at) ?? updatedAt,
    notes,
    archived: asTrimmed(task.status) === "archived",
    nativeStatus: asTrimmed(task.status) || null,
    blockKind: asTrimmed(task.block_kind) || null,
    blockerReason: asTrimmed(task.last_failure_error) || null,
  };
};

const toHermes3dKanbanComment = (comment) => {
  if (!comment || typeof comment !== "object") return null;
  const body = asTrimmed(comment.body);
  if (!body) return null;
  const createdAt = toIsoTime(comment.created_at);
  return {
    id:
      asIdentifier(comment.id) ||
      `${createdAt ?? "unknown"}:${asTrimmed(comment.author) || "user"}:${body.slice(0, 32)}`,
    author: asTrimmed(comment.author) || "user",
    body,
    createdAt,
  };
};

/** Full task drawer payload from `GET /tasks/{id}` -> office detail shape. */
const toHermes3dKanbanTaskDetail = (payload) => {
  const record = toHermes3dKanbanTaskRecord(payload?.task);
  if (!record) return null;
  const comments = (Array.isArray(payload?.comments) ? payload.comments : [])
    .map(toHermes3dKanbanComment)
    .filter(Boolean);
  const blockedComment = [...comments]
    .reverse()
    .find((comment) => /^BLOCKED\s*:/i.test(comment.body));
  const blockerReason =
    record.blockerReason ||
    (blockedComment ? blockedComment.body.replace(/^BLOCKED\s*:\s*/i, "") : null);

  return {
    taskId: record.id,
    nativeStatus: record.nativeStatus,
    blockKind: record.blockKind,
    blockerReason,
    comments,
    eventCount: Array.isArray(payload?.events) ? payload.events.length : 0,
    runCount: Array.isArray(payload?.runs) ? payload.runs.length : 0,
  };
};

/** The whole `GET /board` response -> a flat office task list. */
const toHermes3dKanbanTasks = (board) => {
  const columns = Array.isArray(board?.columns) ? board.columns : [];
  const records = [];
  for (const column of columns) {
    const tasks = Array.isArray(column?.tasks) ? column.tasks : [];
    for (const task of tasks) {
      const record = toHermes3dKanbanTaskRecord(task);
      if (record) records.push(record);
    }
  }
  return records;
};

/**
 * An office task patch -> the kanban `PATCH /tasks/{id}` body.
 *
 * Archiving wins over any simultaneous status change: the office models
 * archive as a flag while hermes models it as a status.
 */
const toKanbanPatchBody = (patch) => {
  const body = {};
  const title = asTrimmed(patch?.title);
  if (title) body.title = title;
  if (typeof patch?.description === "string") body.body = patch.description;
  if (patch?.assignedAgentId !== undefined) {
    body.assignee = asTrimmed(patch.assignedAgentId) || "";
  }
  const status = WRITE_STATUS[asTrimmed(patch?.status)];
  if (status) body.status = status;
  if (patch?.archived === true) body.status = "archived";
  return body;
};

/** An office task create request -> the kanban `POST /tasks` body. */
const toKanbanCreateBody = (input) => {
  const title = asTrimmed(input?.title);
  if (!title) return null;
  const body = { title };
  if (typeof input?.description === "string") body.body = input.description;
  const assignee = asTrimmed(input?.assignedAgentId);
  if (assignee) body.assignee = assignee;
  const idempotencyKey = asTrimmed(input?.idempotencyKey);
  if (idempotencyKey) body.idempotency_key = idempotencyKey;
  const maxRuntimeSeconds = Number(input?.maxRuntimeSeconds);
  if (Number.isFinite(maxRuntimeSeconds) && maxRuntimeSeconds > 0) {
    body.max_runtime_seconds = Math.round(maxRuntimeSeconds);
  }
  if (input?.goalMode === true) body.goal_mode = true;
  const goalMaxTurns = Number(input?.goalMaxTurns);
  if (Number.isFinite(goalMaxTurns) && goalMaxTurns > 0) {
    body.goal_max_turns = Math.round(goalMaxTurns);
  }
  const workspaceKind = asTrimmed(input?.workspaceKind);
  if (["scratch", "dir", "worktree"].includes(workspaceKind)) {
    body.workspace_kind = workspaceKind;
  }
  const workspacePath = asTrimmed(input?.workspacePath);
  if (workspacePath) body.workspace_path = workspacePath;
  const projectId = asTrimmed(input?.projectId);
  if (projectId) body.project_id = projectId;
  return body;
};

/** ws(s):// gateway URL -> the http(s) origin serving the kanban plugin API. */
const kanbanOriginFromWsUrl = (wsUrl) => {
  const parsed = new URL(String(wsUrl));
  const protocol =
    parsed.protocol === "wss:" || parsed.protocol === "https:" ? "https:" : "http:";
  return { protocol, hostname: parsed.hostname, port: parsed.port };
};

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Minimal JSON client for `/api/plugins/kanban/*`.
 *
 * Uses node's http module rather than fetch because the Tailscale Serve
 * topology sometimes requires overriding the Host header to a loopback name —
 * the same fallback the WebSocket client negotiates — and fetch forbids that.
 */
const kanbanRequest = ({ wsUrl, token, useLoopbackHost, method, path, body }) =>
  new Promise((resolve, reject) => {
    let origin;
    try {
      origin = kanbanOriginFromWsUrl(wsUrl);
    } catch (err) {
      reject(err);
      return;
    }
    const transport = origin.protocol === "https:" ? https : http;
    const payload = body === undefined ? null : JSON.stringify(body);
    const request = transport.request(
      {
        protocol: origin.protocol,
        hostname: origin.hostname,
        port: origin.port || undefined,
        method,
        path: `/api/plugins/kanban${path}`,
        headers: {
          Accept: "application/json",
          "X-Hermes-Session-Token": String(token ?? ""),
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
          ...(useLoopbackHost ? { Host: "127.0.0.1" } : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const statusCode = response.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            let detail = text.slice(0, 300);
            try {
              detail = JSON.parse(text)?.detail ?? detail;
            } catch {}
            reject(
              new Error(`kanban API responded with HTTP ${statusCode}: ${detail}`),
            );
            return;
          }
          try {
            resolve(text ? JSON.parse(text) : {});
          } catch {
            reject(new Error("kanban API returned invalid JSON."));
          }
        });
      },
    );
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("kanban API request timed out."));
    });
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });

module.exports = {
  KANBAN_TASK_ID_PREFIX,
  toHermes3dKanbanTaskRecord,
  toHermes3dKanbanTaskDetail,
  toHermes3dKanbanTasks,
  toKanbanCreateBody,
  toKanbanPatchBody,
  kanbanOriginFromWsUrl,
  kanbanRequest,
};
