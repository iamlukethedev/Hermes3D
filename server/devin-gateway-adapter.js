"use strict";

/**
 * Devin Gateway Adapter — Hermes3D gateway protocol -> Devin REST API (v3).
 *
 * Speaks the same WebSocket gateway protocol as server/demo-gateway-adapter.js,
 * but every "agent" is a persistent virtual-employee profile bound to real
 * Devin sessions. chat.send creates a Devin session (or posts a message to the
 * bound session) and a sync loop polls the Devin API, translating session
 * status and messages into `chat` / `presence` / `devin` gateway events.
 *
 * Environment variables:
 *   DEVIN_API_KEY           Service user credential (cog_*) or PAT. Required in real mode.
 *   DEVIN_ORG_ID            Organization ID (org-*). Required in real mode.
 *   DEVIN_API_BASE_URL      API base URL            (default: https://api.devin.ai/v3)
 *   DEVIN_GATEWAY_HOST      WebSocket bind host     (default: 127.0.0.1)
 *   DEVIN_GATEWAY_PORT      WebSocket port          (default: 18790)
 *   DEVIN_SYNC_INTERVAL_MS  Poll interval           (default: 10000)
 *   DEVIN_ALLOWED_REPOS     Comma-separated repo allowlist for session creation
 *                           (e.g. "owner/repo,owner/other"). Empty = any repo.
 *   DEVIN_DEFAULT_REPOS     Comma-separated repos attached to new sessions when
 *                           the request does not specify one.
 *   DEVIN_MODE              Reserved for future use (default: real)
 *   DEVIN_REQUEST_TIMEOUT_MS  Per-request timeout   (default: 20000)
 *   HERMES_STATE_DIR        State directory override (default: ~/.hermes)
 *
 * The API key never leaves this process; nothing is exposed to the browser.
 */

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const { WebSocketServer } = require("ws");

// ---------------------------------------------------------------------------
// .env loading (same convention as hermes-gateway-adapter.js)
// ---------------------------------------------------------------------------

function loadDotenvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadRuntimeEnv() {
  const cwd = process.cwd();
  loadDotenvFile(path.join(cwd, ".env.local"));
  loadDotenvFile(path.join(cwd, ".env"));
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class DevinApiError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ status?: number | null, retryable?: boolean, details?: unknown }} [extra]
   */
  constructor(code, message, { status = null, retryable = false, details = null } = {}) {
    super(message);
    this.name = "DevinApiError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

const DEVIN_ERROR = {
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  RATE_LIMITED: "rate_limited",
  INVALID: "invalid_request",
  UNAVAILABLE: "devin_unavailable",
  NOT_CONFIGURED: "not_configured",
};

// ---------------------------------------------------------------------------
// Devin REST client (v3, organization scope)
// ---------------------------------------------------------------------------

function createDevinClient({ baseUrl, apiKey, orgId, timeoutMs = 20000, fetchImpl = fetch }) {
  const root = String(baseUrl || "https://api.devin.ai/v3").replace(/\/+$/, "");

  const orgBase = () => `${root}/organizations/${encodeURIComponent(orgId)}`;

  const redact = (value) => {
    if (typeof value !== "string") return value;
    let out = value;
    if (apiKey) out = out.split(apiKey).join("[REDACTED]");
    return out.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
  };

  const mapError = async (res) => {
    let detail = "";
    let payload = null;
    try {
      payload = await res.json();
      detail =
        (typeof payload?.detail === "string" && payload.detail) ||
        (typeof payload?.title === "string" && payload.title) ||
        "";
    } catch {
      /* non-JSON body */
    }
    const base = `Devin API HTTP ${res.status}${detail ? `: ${detail}` : ""}`;
    if (res.status === 401) return new DevinApiError(DEVIN_ERROR.UNAUTHENTICATED, base, { status: 401 });
    if (res.status === 403) return new DevinApiError(DEVIN_ERROR.FORBIDDEN, base, { status: 403 });
    if (res.status === 404) return new DevinApiError(DEVIN_ERROR.NOT_FOUND, base, { status: 404 });
    if (res.status === 429)
      return new DevinApiError(DEVIN_ERROR.RATE_LIMITED, base, { status: 429, retryable: true });
    if (res.status === 400 || res.status === 409 || res.status === 422)
      return new DevinApiError(DEVIN_ERROR.INVALID, base, { status: res.status, details: payload });
    if (res.status >= 500)
      return new DevinApiError(DEVIN_ERROR.UNAVAILABLE, base, { status: res.status, retryable: true });
    return new DevinApiError(DEVIN_ERROR.UNAVAILABLE, base, { status: res.status });
  };

  const request = async (method, url, { body, retry = true, maxAttempts = 3 } = {}) => {
    if (!apiKey) {
      throw new DevinApiError(
        DEVIN_ERROR.NOT_CONFIGURED,
        "DEVIN_API_KEY is not set. Configure it in the gateway environment."
      );
    }
    let lastError = null;
    const attempts = retry ? maxAttempts : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        if (res.status >= 400) {
          const err = await mapError(res);
          if (!err.retryable || attempt + 1 >= attempts) throw err;
          lastError = err;
        } else {
          const text = await res.text();
          return text ? JSON.parse(text) : {};
        }
      } catch (err) {
        if (err instanceof DevinApiError && !err.retryable) throw err;
        const normalized =
          err instanceof DevinApiError
            ? err
            : new DevinApiError(
                DEVIN_ERROR.UNAVAILABLE,
                redact(err instanceof Error ? err.message : String(err)),
                { retryable: true }
              );
        if (attempt + 1 >= attempts) throw normalized;
        lastError = normalized;
      } finally {
        clearTimeout(timer);
      }
      // Exponential backoff: 500ms, 1000ms, 2000ms...
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
    throw lastError || new DevinApiError(DEVIN_ERROR.UNAVAILABLE, "Devin API request failed");
  };

  const get = (p, query) => {
    const qs = query
      ? "?" +
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";
    return request("GET", `${root}${p}${qs}`);
  };

  return {
    redact,
    /** GET /self — verifies credentials, returns principal info. */
    verifyCredentials: () => get("/self"),
    /** POST /organizations/{org}/sessions */
    createSession: (payload) =>
      request("POST", `${orgBase()}/sessions`, { body: payload, retry: false }),
    /** GET /organizations/{org}/sessions/{devinId} */
    getSession: (devinId) => get(`/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(devinId)}`),
    /** GET /organizations/{org}/sessions?first=&after=&tags=... */
    listSessions: (query = {}) =>
      get(`/organizations/${encodeURIComponent(orgId)}/sessions`, query),
    /** GET /organizations/{org}/sessions/{devinId}/messages */
    listSessionMessages: (devinId, { after, first } = {}) =>
      get(
        `/organizations/${encodeURIComponent(orgId)}/sessions/${encodeURIComponent(devinId)}/messages`,
        { after, first }
      ),
    /** POST /organizations/{org}/sessions/{devinId}/messages */
    sendMessage: (devinId, message) =>
      request("POST", `${orgBase()}/sessions/${encodeURIComponent(devinId)}/messages`, {
        body: { message },
        retry: false,
      }),
    /** DELETE /organizations/{org}/sessions/{devinId}?archive= */
    terminateSession: (devinId, { archive = false } = {}) =>
      request(
        "DELETE",
        `${orgBase()}/sessions/${encodeURIComponent(devinId)}?archive=${archive ? "true" : "false"}`,
        { retry: false }
      ),
    /** POST /organizations/{org}/sessions/{devinId}/archive */
    archiveSession: (devinId) =>
      request("POST", `${orgBase()}/sessions/${encodeURIComponent(devinId)}/archive`, {
        retry: false,
      }),
  };
}

// ---------------------------------------------------------------------------
// Devin status -> office visual state mapping
// ---------------------------------------------------------------------------

const DEVIN_VISUAL_STATES = [
  "idle",
  "starting",
  "running",
  "waiting_input",
  "waiting_approval",
  "suspended",
  "completed",
  "failed",
  "cancelled",
  "unreachable",
];

function mapDevinSessionState(session) {
  if (!session || typeof session !== "object") return "idle";
  const status = session.status;
  const detail = session.status_detail;
  if (status === "running") {
    if (detail === "waiting_for_user") return "waiting_input";
    if (detail === "waiting_for_approval") return "waiting_approval";
    if (detail === "finished") return "completed";
    return "running";
  }
  if (status === "new" || status === "claimed" || status === "resuming") return "starting";
  if (status === "suspended") return "suspended";
  if (status === "exit") return "completed";
  if (status === "error") return "failed";
  return "idle";
}

const TERMINAL_STATES = new Set(["completed", "failed", "cancelled", "unreachable"]);

// Synthesized transient placeholders — safe to drop once a real reply follows.
const TRANSIENT_PLACEHOLDER_TEXTS = new Set([
  "Devin is waiting for your input.",
  "Devin is waiting for an approval in the Devin app.",
  "Devin suspended the session (idle). Send a message to resume it.",
]);

// ---------------------------------------------------------------------------
// State store (JSON file; consistent with existing ~/.hermes persistence)
// ---------------------------------------------------------------------------

const DEFAULT_AGENT_PROFILES = [
  { id: "devin-orchestrator", name: "Devin", role: "Orchestrator" },
  { id: "devin-backend", name: "Devin Backend Engineer", role: "Backend" },
  { id: "devin-frontend", name: "Devin Frontend Engineer", role: "Frontend" },
  { id: "devin-qa", name: "Devin QA Engineer", role: "QA" },
  { id: "devin-devops", name: "Devin DevOps Engineer", role: "DevOps" },
  { id: "devin-reviewer", name: "Devin Code Reviewer", role: "Code Review" },
];

function createStateStore(stateFile) {
  const state = {
    agents: new Map(),
    /** sessionKey -> { devinSessionId, url, title, createdAt } */
    bindings: new Map(),
    /** sessionKey -> [{role, content, eventId?, createdAt?}] */
    history: new Map(),
    /** sessionKey -> last seen Devin message event_id */
    cursors: new Map(),
    /** sessionKey -> { state, status, statusDetail, pullRequests, acus, lastSyncAt, lastError } */
    sessionMeta: new Map(),
  };

  let persistTimer = null;

  const persist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try {
        const data = {
          version: 1,
          agents: [...state.agents.values()],
          bindings: Object.fromEntries(state.bindings),
          history: Object.fromEntries(state.history),
          cursors: Object.fromEntries(state.cursors),
          sessionMeta: Object.fromEntries(state.sessionMeta),
        };
        fs.mkdirSync(path.dirname(stateFile), { recursive: true });
        const tmp = `${stateFile}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
        fs.renameSync(tmp, stateFile);
      } catch (err) {
        console.warn("[devin-gateway] Could not persist state:", err.message);
      }
    }, 400);
  };

  const load = () => {
    try {
      if (!fs.existsSync(stateFile)) return false;
      const data = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      if (!data || typeof data !== "object") return false;
      for (const agent of data.agents || []) {
        if (agent && typeof agent.id === "string") state.agents.set(agent.id, agent);
      }
      for (const [k, v] of Object.entries(data.bindings || {})) state.bindings.set(k, v);
      for (const [k, v] of Object.entries(data.history || {})) {
        if (Array.isArray(v)) state.history.set(k, v);
      }
      for (const [k, v] of Object.entries(data.cursors || {})) {
        if (typeof v === "string") state.cursors.set(k, v);
      }
      for (const [k, v] of Object.entries(data.sessionMeta || {})) state.sessionMeta.set(k, v);
      return true;
    } catch (err) {
      console.warn("[devin-gateway] Could not load state:", err.message);
      return false;
    }
  };

  const seedDefaults = () => {
    if (state.agents.size === 0) {
      for (const profile of DEFAULT_AGENT_PROFILES) {
        state.agents.set(profile.id, { ...profile, workspace: `/devin/${profile.id}` });
      }
      persist();
    }
  };

  return { state, load, persist, seedDefaults };
}

// ---------------------------------------------------------------------------
// Gateway adapter factory
// ---------------------------------------------------------------------------

function createDevinGateway(options = {}) {
  const apiKey = options.apiKey ?? process.env.DEVIN_API_KEY ?? "";
  const orgId = options.orgId ?? process.env.DEVIN_ORG_ID ?? "";
  const apiBaseUrl = options.apiBaseUrl ?? process.env.DEVIN_API_BASE_URL ?? "https://api.devin.ai/v3";
  const syncIntervalMs = options.syncIntervalMs ??
    parseInt(process.env.DEVIN_SYNC_INTERVAL_MS || "10000", 10);
  const timeoutMs = options.timeoutMs ??
    parseInt(process.env.DEVIN_REQUEST_TIMEOUT_MS || "20000", 10);
  const stateDir =
    options.stateDir ||
    process.env.HERMES_STATE_DIR ||
    path.join(os.homedir() || os.tmpdir(), ".hermes");
  const stateFile = options.stateFile || path.join(stateDir, "devin-gateway", "state.json");
  const toRepoList = (value) =>
    (Array.isArray(value) ? value : String(value ?? ""))
      .toString()
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  const allowedRepos = new Set(
    toRepoList(options.allowedRepos ?? process.env.DEVIN_ALLOWED_REPOS)
  );
  const defaultRepos = toRepoList(options.defaultRepos ?? process.env.DEVIN_DEFAULT_REPOS);
  const devinMode = options.devinMode ?? process.env.DEVIN_DEFAULT_MODE ?? null;
  const maxAcuLimit = options.maxAcuLimit ??
    (process.env.DEVIN_MAX_ACU_LIMIT ? parseInt(process.env.DEVIN_MAX_ACU_LIMIT, 10) : null);

  const client = options.client || createDevinClient({
    baseUrl: apiBaseUrl,
    apiKey,
    orgId,
    timeoutMs,
    fetchImpl: options.fetchImpl,
  });

  const store = createStateStore(stateFile);
  const { state } = store;
  const loaded = store.load();
  if (!loaded) store.seedDefaults();

  const MAIN_KEY = "main";
  const MODELS = [{ id: "devin/default", name: "Devin", provider: "devin" }];
  const activeSendEventFns = new Set();
  /** runId -> { runId, sessionKey, agentId, devinSessionId, fromEventId, aborted, done } */
  const activeRuns = new Map();
  /** sessionKey -> runId currently collecting output */
  const sessionRuns = new Map();
  /** chat.send idempotencyKeys already accepted (bounded LRU-ish) */
  const sentIdempotencyKeys = new Set();
  const sessionSettings = new Map();
  const agentFiles = new Map();
  let syncTimer = null;
  let syncInFlight = false;
  let lastHealth = { ok: false, checkedAt: 0, error: "not_checked" };

  const isConfigured = () => Boolean(apiKey && orgId);

  function randomId() {
    return randomUUID().replace(/-/g, "");
  }

  function sessionKeyFor(agentId) {
    return `agent:${agentId}:${MAIN_KEY}`;
  }

  function getHistory(sessionKey) {
    if (!state.history.has(sessionKey)) state.history.set(sessionKey, []);
    return state.history.get(sessionKey);
  }

  function resOk(id, payload) {
    return { type: "res", id, ok: true, payload: payload ?? {} };
  }

  function resErr(id, code, message) {
    return { type: "res", id, ok: false, error: { code, message } };
  }

  function sanitize(err) {
    const raw = err instanceof Error ? err.message : String(err);
    return client.redact ? client.redact(raw) : raw;
  }

  function broadcastEvent(frame) {
    for (const send of activeSendEventFns) {
      try {
        send(frame);
      } catch {}
    }
  }

  function agentListPayload() {
    return [...state.agents.values()].map((agent) => ({
      id: agent.id,
      name: agent.name,
      workspace: agent.workspace,
      identity: { name: agent.name, emoji: "🤖" },
      role: agent.role,
      repos: agent.repos || [],
    }));
  }

  function defaultAgentId() {
    return state.agents.has("devin-orchestrator")
      ? "devin-orchestrator"
      : [...state.agents.keys()][0] || "devin-orchestrator";
  }

  function emitPresence(sessionKey, agentId) {
    broadcastEvent({
      type: "event",
      event: "presence",
      payload: {
        sessions: {
          recent: [{ key: sessionKey, updatedAt: Date.now() }],
          byAgent: [{ agentId, recent: [{ key: sessionKey, updatedAt: Date.now() }] }],
        },
      },
    });
  }

  function emitDevinSessionEvent(sessionKey, extra = {}) {
    const meta = state.sessionMeta.get(sessionKey) || {};
    const binding = state.bindings.get(sessionKey) || null;
    broadcastEvent({
      type: "event",
      event: "devin",
      payload: {
        kind: "session",
        sessionKey,
        devinSessionId: binding?.devinSessionId ?? null,
        state: meta.state || "idle",
        status: meta.status || null,
        statusDetail: meta.statusDetail || null,
        pullRequests: meta.pullRequests || [],
        acusConsumed: meta.acusConsumed ?? null,
        url: binding?.url ?? null,
        title: meta.title ?? binding?.title ?? null,
        lastError: meta.lastError ?? null,
        ...extra,
      },
    });
  }

  function agentIdForSessionKey(sessionKey) {
    return sessionKey.startsWith("agent:") ? sessionKey.split(":")[1] : defaultAgentId();
  }

  function assertReposAllowed(repos) {
    if (!Array.isArray(repos) || repos.length === 0) return [];
    if (allowedRepos.size === 0) return repos;
    const rejected = repos.filter((r) => !allowedRepos.has(r));
    if (rejected.length > 0) {
      throw new DevinApiError(
        DEVIN_ERROR.FORBIDDEN,
        `Repos not in DEVIN_ALLOWED_REPOS allowlist: ${rejected.join(", ")}`
      );
    }
    return repos;
  }

  function requireConfigured() {
    if (!isConfigured()) {
      throw new DevinApiError(
        DEVIN_ERROR.NOT_CONFIGURED,
        "Devin gateway is not configured. Set DEVIN_API_KEY and DEVIN_ORG_ID in the gateway environment."
      );
    }
  }

  // -------------------------------------------------------------- sync loop

  async function syncSession(sessionKey) {
    const binding = state.bindings.get(sessionKey);
    if (!binding?.devinSessionId) return;
    const meta = state.sessionMeta.get(sessionKey) || {};
    if (TERMINAL_STATES.has(meta.state)) return;

    let session;
    try {
      session = await client.getSession(binding.devinSessionId);
    } catch (err) {
      if (err instanceof DevinApiError && err.code === DEVIN_ERROR.NOT_FOUND) {
        state.sessionMeta.set(sessionKey, {
          ...meta,
          state: "unreachable",
          lastError: "Session no longer accessible via the Devin API.",
          lastSyncAt: Date.now(),
        });
        store.persist();
        emitDevinSessionEvent(sessionKey);
      }
      return;
    }

    const prevState = meta.state || "idle";
    const nextState = mapDevinSessionState(session);
    const nextMeta = {
      state: nextState,
      status: session.status ?? null,
      statusDetail: session.status_detail ?? null,
      title: session.title ?? meta.title ?? null,
      pullRequests: Array.isArray(session.pull_requests) ? session.pull_requests : [],
      acusConsumed: typeof session.acus_consumed === "number" ? session.acus_consumed : null,
      structuredOutput: session.structured_output ?? null,
      lastSyncAt: Date.now(),
      lastError: null,
    };
    state.sessionMeta.set(sessionKey, nextMeta);

    // Pull new messages. The `after` param expects the opaque end_cursor from a
    // previous page — NOT an event_id — so we always walk pages from the start
    // and rely on event_id dedup (bounded to keep polling cheap).
    let newItemCount = 0;
    let historyDirty = false;
    const lateAssistantMessages = [];
    try {
      const history = getHistory(sessionKey);
      let after = null;
      let truncated = false;
      for (let pageNum = 0; pageNum < 10; pageNum += 1) {
        const page = await client.listSessionMessages(binding.devinSessionId, {
          first: 200,
          ...(after ? { after } : {}),
        });
        const items = Array.isArray(page?.items) ? page.items : [];
        for (const item of items) {
          const role = item.source === "devin" ? "assistant" : "user";
          const content = typeof item.message === "string" ? item.message : "";
          if (!content) continue;
          const alreadySeen =
            item.event_id != null &&
            history.some((entry) => entry.eventId === item.event_id);
          if (!alreadySeen) {
            // The API echoes the user's own message back; merge it into the
            // locally-pushed entry (which has no eventId) instead of duplicating.
            const echoIndex =
              item.event_id != null
                ? history.findIndex(
                    (entry) => !entry.eventId && entry.role === role && entry.content === content
                  )
                : -1;
            if (echoIndex >= 0) {
              history[echoIndex] = {
                ...history[echoIndex],
                eventId: item.event_id,
                createdAt: item.created_at ?? history[echoIndex].createdAt,
              };
              historyDirty = true;
            } else {
              // A real Devin reply supersedes a trailing synthesized
              // placeholder ("waiting for your input", "suspended", ...).
              const lastEntry = history[history.length - 1];
              if (role === "assistant" && lastEntry?.synthetic) {
                history.splice(history.length - 1, 1);
              }
              history.push({
                role,
                content,
                eventId: item.event_id,
                createdAt: item.created_at ?? null,
              });
              newItemCount += 1;
              if (role === "assistant") {
                // Stream only newly-seen assistant content to active runs —
                // replaying the full list each tick would duplicate transcripts.
                let streamed = false;
                for (const run of activeRuns.values()) {
                  if (run.sessionKey !== sessionKey || run.done) continue;
                  streamed = true;
                  run.transcript = run.transcript ? `${run.transcript}\n\n${content}` : content;
                  broadcastEvent({
                    type: "event",
                    event: "chat",
                    payload: {
                      runId: run.runId,
                      sessionKey,
                      state: "delta",
                      message: { role: "assistant", content: run.transcript },
                    },
                  });
                }
                // No active run consumed this message (e.g. it landed after the
                // run closed on waiting_*/suspended). Queue a `final` so the
                // client surfaces it immediately instead of waiting for a
                // history refresh that may never fire while the agent is idle.
                if (!streamed) lateAssistantMessages.push(content);
              }
            }
          }
        }
        if (page?.has_next_page && page?.end_cursor) {
          after = page.end_cursor;
        } else {
          truncated = false;
          break;
        }
        truncated = true;
      }
      if (truncated) {
        console.warn(
          `[devin-gateway] message history for ${sessionKey} exceeds page limit; oldest sync window reached`
        );
      }
      // Drop leftover local echoes that a remote item (same role+content,
      // carrying an eventId) already covers — fixes pre-dedup duplicates too.
      const covered = new Set(
        history.filter((e) => e.eventId).map((e) => `${e.role}::${e.content}`)
      );
      for (let i = history.length - 1; i >= 0; i -= 1) {
        const entry = history[i];
        if (!entry.eventId && covered.has(`${entry.role}::${entry.content}`)) {
          history.splice(i, 1);
          historyDirty = true;
        }
      }
      // Remove stale synthesized placeholders sitting before a real Devin
      // reply — a trailing one stays, since it reflects the current state.
      // Legacy entries (written before the `synthetic` flag) are matched by
      // the known transient texts.
      let lastRealAssistantIdx = -1;
      for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i].eventId && history[i].role === "assistant") {
          lastRealAssistantIdx = i;
          break;
        }
      }
      if (lastRealAssistantIdx > 0) {
        for (let i = lastRealAssistantIdx - 1; i >= 0; i -= 1) {
          const entry = history[i];
          if (
            entry.role === "assistant" &&
            !entry.eventId &&
            (entry.synthetic || TRANSIENT_PLACEHOLDER_TEXTS.has(entry.content))
          ) {
            history.splice(i, 1);
            lastRealAssistantIdx -= 1;
            historyDirty = true;
          }
        }
      }
      // Surface assistant messages that arrived after the run closed — a
      // runless `final` is processed by the client and triggers a history
      // refresh, so the reply shows up in the open chat panel right away.
      for (const content of lateAssistantMessages) {
        broadcastEvent({
          type: "event",
          event: "chat",
          payload: {
            runId: null,
            sessionKey,
            state: "final",
            stopReason: "end_turn",
            message: { role: "assistant", content },
          },
        });
      }
      if (newItemCount > 0 || historyDirty) store.persist();
    } catch (err) {
      console.warn(`[devin-gateway] message sync failed for ${sessionKey}:`, sanitize(err));
    }

    const stateChanged = prevState !== nextState;
    if (stateChanged || itemsChanged(nextMeta, meta) || newItemCount > 0) {
      store.persist();
      emitPresence(sessionKey, agentIdForSessionKey(sessionKey));
      emitDevinSessionEvent(sessionKey);
    }

    // Close out runs when the Devin turn ends (or the session idles out).
    if (
      TERMINAL_STATES.has(nextState) ||
      nextState === "waiting_input" ||
      nextState === "waiting_approval" ||
      nextState === "suspended"
    ) {
      for (const run of [...activeRuns.values()]) {
        if (run.sessionKey !== sessionKey || run.done) continue;
        run.done = true;
        activeRuns.delete(run.runId);
        sessionRuns.delete(sessionKey);
        const finalText =
          run.transcript ||
          (nextState === "waiting_input"
            ? "Devin is waiting for your input."
            : nextState === "waiting_approval"
              ? "Devin is waiting for an approval in the Devin app."
              : nextState === "suspended"
                ? "Devin suspended the session (idle). Send a message to resume it."
                : `Session ${nextState}.`);
        // Persist synthesized terminal text so chat.history ends with an
        // assistant entry — the client treats a user-tail history as an
        // orphaned run and would keep the agent in "running" forever.
        if (!run.transcript) {
          const history = getHistory(sessionKey);
          const lastEntry = history[history.length - 1];
          if (!(lastEntry && lastEntry.role === "assistant" && lastEntry.content === finalText)) {
            history.push({
              role: "assistant",
              content: finalText,
              synthetic: true,
              createdAt: Math.floor(Date.now() / 1000),
            });
            store.persist();
          }
        }
        if (nextState === "failed" || nextState === "unreachable") {
          broadcastEvent({
            type: "event",
            event: "chat",
            payload: {
              runId: run.runId,
              sessionKey,
              state: "error",
              errorMessage: finalText,
            },
          });
        } else {
          broadcastEvent({
            type: "event",
            event: "chat",
            payload: {
              runId: run.runId,
              sessionKey,
              state: "final",
              stopReason: "end_turn",
              message: { role: "assistant", content: finalText },
            },
          });
        }
      }
    }
  }

  function itemsChanged(next, prev) {
    return (
      next.status !== prev.status ||
      next.statusDetail !== prev.statusDetail ||
      JSON.stringify(next.pullRequests) !== JSON.stringify(prev.pullRequests || [])
    );
  }

  async function syncAllSessions() {
    if (syncInFlight || !isConfigured()) return;
    syncInFlight = true;
    try {
      for (const sessionKey of state.bindings.keys()) {
        try {
          await syncSession(sessionKey);
        } catch (err) {
          console.warn(`[devin-gateway] sync failed for ${sessionKey}:`, sanitize(err));
        }
      }
    } finally {
      syncInFlight = false;
    }
  }

  function startSyncLoop() {
    if (syncTimer || syncIntervalMs <= 0) return;
    syncTimer = setInterval(() => {
      void syncAllSessions();
    }, syncIntervalMs);
    if (typeof syncTimer.unref === "function") syncTimer.unref();
  }

  async function refreshHealth() {
    if (!isConfigured()) {
      lastHealth = { ok: false, checkedAt: Date.now(), error: DEVIN_ERROR.NOT_CONFIGURED };
      return lastHealth;
    }
    try {
      const principal = await client.verifyCredentials();
      lastHealth = {
        ok: true,
        checkedAt: Date.now(),
        principalType: principal?.principal_type ?? null,
        serviceUserName: principal?.service_user_name ?? null,
        orgId: principal?.org_id ?? orgId,
      };
    } catch (err) {
      lastHealth = {
        ok: false,
        checkedAt: Date.now(),
        error: err instanceof DevinApiError ? err.code : "unavailable",
        message: sanitize(err),
      };
    }
    return lastHealth;
  }

  // -------------------------------------------------------------- chat.send

  async function startDevinRun({ sessionKey, agentId, message, runId, repos }) {
    const agent = state.agents.get(agentId);
    const binding = state.bindings.get(sessionKey);

    const run = {
      runId,
      sessionKey,
      agentId,
      transcript: "",
      done: false,
      aborted: false,
      abort: () => {
        run.aborted = true;
      },
    };
    activeRuns.set(runId, run);
    sessionRuns.set(sessionKey, runId);

    try {
      if (binding?.devinSessionId) {
        // Continue an existing Devin session (auto-resumes if suspended).
        await client.sendMessage(binding.devinSessionId, message);
        const meta = state.sessionMeta.get(sessionKey) || {};
        state.sessionMeta.set(sessionKey, {
          ...meta,
          // A fresh user message means Devin is resuming work — don't keep a
          // waiting_* state or the next sync tick would close the run early.
          state: TERMINAL_STATES.has(meta.state) ? meta.state : "starting",
          status: meta.status === "suspended" ? "resuming" : meta.status,
          lastError: null,
        });
        store.persist();
        emitDevinSessionEvent(sessionKey);
      } else {
        // Create a new Devin session bound to this agent's conversation.
        const sessionRepos = assertReposAllowed(
          repos.length > 0 ? repos : agent?.repos?.length ? agent.repos : defaultRepos
        );
        const payload = {
          prompt: message,
          title: message.slice(0, 80),
          tags: ["hermes3d", `hermes3d-agent:${agentId}`],
          ...(sessionRepos.length > 0 ? { repos: sessionRepos } : {}),
          ...(devinMode ? { devin_mode: devinMode } : {}),
          ...(maxAcuLimit ? { max_acu_limit: maxAcuLimit } : {}),
        };
        const session = await client.createSession(payload);
        const devinSessionId = session.session_id;
        state.bindings.set(sessionKey, {
          devinSessionId,
          url: session.url ?? null,
          title: session.title ?? payload.title,
          createdAt: Date.now(),
        });
        run.devinSessionId = devinSessionId;
        state.sessionMeta.set(sessionKey, {
          state: mapDevinSessionState(session),
          status: session.status ?? "new",
          statusDetail: session.status_detail ?? null,
          title: session.title ?? payload.title,
          pullRequests: session.pull_requests ?? [],
          acusConsumed: session.acus_consumed ?? null,
          lastSyncAt: Date.now(),
          lastError: null,
        });
        store.persist();
        emitDevinSessionEvent(sessionKey);
        emitPresence(sessionKey, agentId);
      }

      const history = getHistory(sessionKey);
      history.push({ role: "user", content: message, createdAt: Math.floor(Date.now() / 1000) });
      store.persist();

      // Immediate sync so the first Devin response arrives quickly.
      setImmediate(() => syncSession(sessionKey).catch(() => {}));
      return { status: "started", runId };
    } catch (err) {
      activeRuns.delete(runId);
      sessionRuns.delete(sessionKey);
      throw err;
    }
  }

  // -------------------------------------------------------------- methods

  async function handleMethod(method, params, id, _sendEvent) {
    const p = params || {};

    switch (method) {
      case "agents.list":
        return resOk(id, { defaultId: defaultAgentId(), mainKey: MAIN_KEY, agents: agentListPayload() });

      case "agents.create": {
        const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Devin Agent";
        const role = typeof p.role === "string" ? p.role.trim() : "";
        const slug =
          name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "devin-agent";
        const agentId = `${slug}-${randomId().slice(0, 6)}`;
        const repos = assertReposAllowed(Array.isArray(p.repos) ? p.repos : []);
        state.agents.set(agentId, {
          id: agentId,
          name,
          role,
          workspace: `/devin/${slug}`,
          repos,
        });
        store.persist();
        broadcastEvent({
          type: "event",
          event: "presence",
          payload: { sessions: { recent: [], byAgent: [] } },
        });
        return resOk(id, { agentId, name, workspace: `/devin/${slug}` });
      }

      case "agents.update": {
        const agentId = typeof p.agentId === "string" ? p.agentId.trim() : "";
        const agent = state.agents.get(agentId);
        if (!agent) return resErr(id, "not_found", `Agent ${agentId} not found`);
        if (typeof p.name === "string" && p.name.trim()) agent.name = p.name.trim();
        if (typeof p.role === "string") agent.role = p.role.trim();
        if (Array.isArray(p.repos)) agent.repos = assertReposAllowed(p.repos);
        store.persist();
        return resOk(id, { ok: true, removedBindings: 0 });
      }

      case "agents.delete": {
        const agentId = typeof p.agentId === "string" ? p.agentId.trim() : "";
        if (!agentId || agentId === defaultAgentId()) {
          return resOk(id, { ok: true, removedBindings: 0 });
        }
        if (state.agents.has(agentId)) {
          state.agents.delete(agentId);
          const key = sessionKeyFor(agentId);
          // Unbind locally — the remote Devin session is left untouched.
          state.bindings.delete(key);
          state.history.delete(key);
          state.cursors.delete(key);
          state.sessionMeta.delete(key);
          store.persist();
        }
        return resOk(id, { ok: true, removedBindings: 0 });
      }

      case "agents.files.get": {
        const key = `${p.agentId || defaultAgentId()}/${p.name || ""}`;
        const content = agentFiles.get(key);
        return resOk(id, { file: content !== undefined ? { content } : { missing: true } });
      }

      case "agents.files.set": {
        const key = `${p.agentId || defaultAgentId()}/${p.name || ""}`;
        agentFiles.set(key, typeof p.content === "string" ? p.content : "");
        return resOk(id, {});
      }

      case "config.get":
        return resOk(id, {
          config: { gateway: { reload: { mode: "hot" } } },
          hash: "devin-gateway",
          exists: true,
          path: stateFile,
        });

      case "config.patch":
      case "config.set":
        return resOk(id, { hash: "devin-gateway" });

      case "exec.approvals.get":
        return resOk(id, {
          path: "",
          exists: true,
          hash: "devin-approvals",
          file: {
            version: 1,
            defaults: { security: "full", ask: "off", autoAllowSkills: true },
            agents: {},
          },
        });

      case "exec.approvals.set":
        return resOk(id, { hash: "devin-approvals" });

      case "exec.approval.resolve":
        return resErr(
          id,
          "unsupported_method",
          "Devin approvals are managed in the Devin app. Open the session URL to approve."
        );

      case "models.list":
        return resOk(id, { models: MODELS });

      case "skills.status":
        return resOk(id, { skills: [] });

      case "cron.list":
        return resOk(id, { jobs: [] });

      case "cron.add":
      case "cron.run":
      case "cron.remove":
      case "cron.patch":
        return resErr(id, "unsupported_method", `Devin runtime does not support ${method}.`);

      case "sessions.list": {
        const sessions = [...state.agents.values()].map((agent) => {
          const sessionKey = sessionKeyFor(agent.id);
          const binding = state.bindings.get(sessionKey);
          const meta = state.sessionMeta.get(sessionKey) || {};
          return {
            key: sessionKey,
            agentId: agent.id,
            updatedAt: binding ? Date.now() : null,
            displayName: "Main",
            origin: { label: agent.name, provider: "devin" },
            model: "devin/default",
            modelProvider: "devin",
            devin: {
              sessionId: binding?.devinSessionId ?? null,
              url: binding?.url ?? null,
              state: meta.state ?? "idle",
            },
          };
        });
        return resOk(id, { sessions });
      }

      case "sessions.preview": {
        const keys = Array.isArray(p.keys) ? p.keys : [];
        const limit = typeof p.limit === "number" ? p.limit : 8;
        const maxChars = typeof p.maxChars === "number" ? p.maxChars : 240;
        const previews = keys.map((key) => {
          const history = getHistory(key);
          if (history.length === 0) return { key, status: "empty", items: [] };
          const items = history.slice(-limit).map((msg) => ({
            role: msg.role === "assistant" ? "assistant" : "user",
            text: String(msg.content || "").slice(0, maxChars),
            timestamp: msg.createdAt ? msg.createdAt * 1000 : Date.now(),
          }));
          return { key, status: "ok", items };
        });
        return resOk(id, { ts: Date.now(), previews });
      }

      case "sessions.patch": {
        const key = typeof p.key === "string" ? p.key : sessionKeyFor(defaultAgentId());
        const current = sessionSettings.get(key) || {};
        const next = { ...current };
        if (p.thinkingLevel !== undefined) next.thinkingLevel = p.thinkingLevel;
        sessionSettings.set(key, next);
        return resOk(id, {
          ok: true,
          key,
          entry: { thinkingLevel: next.thinkingLevel },
          resolved: { model: "devin/default", modelProvider: "devin" },
        });
      }

      case "sessions.reset": {
        // Clears local history and unbinds: the next chat.send starts a fresh
        // Devin session. The remote session is intentionally left untouched.
        const key = typeof p.key === "string" ? p.key : sessionKeyFor(defaultAgentId());
        state.history.delete(key);
        state.bindings.delete(key);
        state.cursors.delete(key);
        state.sessionMeta.delete(key);
        store.persist();
        return resOk(id, { ok: true });
      }

      case "chat.send": {
        const sessionKey =
          typeof p.sessionKey === "string" ? p.sessionKey : sessionKeyFor(defaultAgentId());
        const agentId = agentIdForSessionKey(sessionKey);
        const message =
          typeof p.message === "string" ? p.message.trim() : String(p.message || "").trim();
        const runId =
          typeof p.idempotencyKey === "string" && p.idempotencyKey ? p.idempotencyKey : randomId();
        if (!message) return resOk(id, { status: "no-op", runId });
        if (!state.agents.has(agentId)) {
          return resErr(id, "not_found", `Agent ${agentId} not found`);
        }
        // Honor the protocol idempotencyKey: a retried chat.send must not
        // create a second Devin session or resend the message.
        if (typeof p.idempotencyKey === "string" && p.idempotencyKey) {
          if (sentIdempotencyKeys.has(p.idempotencyKey)) {
            return resOk(id, { status: "started", runId: p.idempotencyKey, deduplicated: true });
          }
          if (sentIdempotencyKeys.size > 500) {
            sentIdempotencyKeys.delete(sentIdempotencyKeys.keys().next().value);
          }
          sentIdempotencyKeys.add(p.idempotencyKey);
        }
        try {
          requireConfigured();
        } catch (err) {
          return resErr(id, err.code, sanitize(err));
        }
        const repos = Array.isArray(p.repos) ? p.repos : [];
        try {
          await startDevinRun({ sessionKey, agentId, message, runId, repos });
        } catch (err) {
          const code = err instanceof DevinApiError ? err.code : "internal_error";
          return resErr(id, code, sanitize(err));
        }
        return resOk(id, { status: "started", runId });
      }

      case "chat.abort": {
        // Terminates the bound Devin session (the only cancellation the API exposes).
        const runId = typeof p.runId === "string" ? p.runId.trim() : "";
        const sessionKey = typeof p.sessionKey === "string" ? p.sessionKey.trim() : "";
        let aborted = 0;
        const targets = new Set();
        if (runId && activeRuns.has(runId)) targets.add(activeRuns.get(runId).sessionKey);
        if (sessionKey) {
          for (const run of activeRuns.values()) {
            if (run.sessionKey === sessionKey) targets.add(sessionKey);
          }
          if (!runId) targets.add(sessionKey);
        }
        for (const key of targets) {
          const binding = state.bindings.get(key);
          for (const [rid, run] of activeRuns.entries()) {
            if (run.sessionKey === key) {
              run.done = true;
              activeRuns.delete(rid);
              sessionRuns.delete(key);
              broadcastEvent({
                type: "event",
                event: "chat",
                payload: { runId: rid, sessionKey: key, state: "aborted" },
              });
            }
          }
          if (binding?.devinSessionId && isConfigured()) {
            try {
              await client.terminateSession(binding.devinSessionId);
            } catch (err) {
              console.warn("[devin-gateway] terminate failed:", sanitize(err));
            }
          }
          // Terminal marker so chat.history no longer ends on the user
          // message — otherwise the client re-marks the agent as running.
          getHistory(key).push({
            role: "assistant",
            content: "Run aborted.",
            synthetic: true,
            createdAt: Math.floor(Date.now() / 1000),
          });
          const meta = state.sessionMeta.get(key) || {};
          state.sessionMeta.set(key, { ...meta, state: "cancelled", lastSyncAt: Date.now() });
          aborted += 1;
        }
        if (aborted > 0) store.persist();
        for (const key of targets) emitDevinSessionEvent(key);
        return resOk(id, { ok: true, aborted });
      }

      case "chat.history": {
        const key = typeof p.sessionKey === "string" ? p.sessionKey : sessionKeyFor(defaultAgentId());
        return resOk(id, { sessionKey: key, messages: getHistory(key) });
      }

      case "agent.wait": {
        const runId = typeof p.runId === "string" ? p.runId : "";
        const timeoutMs = typeof p.timeoutMs === "number" ? p.timeoutMs : 30000;
        const start = Date.now();
        while (activeRuns.has(runId) && Date.now() - start < timeoutMs) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return resOk(id, { status: activeRuns.has(runId) ? "running" : "done" });
      }

      case "status": {
        const recent = [...state.bindings.keys()].map((key) => ({
          key,
          updatedAt: Date.now(),
        }));
        return resOk(id, {
          sessions: {
            recent,
            byAgent: [...state.agents.keys()].map((agentId) => ({
              agentId,
              recent: recent.filter((entry) => entry.key.includes(`:${agentId}:`)),
            })),
          },
        });
      }

      case "wake":
        return resOk(id, { ok: true });

      // ------------------------------------------------------------ devin.*

      case "devin.health": {
        const health = await refreshHealth();
        return resOk(id, {
          configured: isConfigured(),
          orgId: orgId || null,
          baseUrl: apiBaseUrl,
          syncIntervalMs,
          allowedRepos: [...allowedRepos],
          health,
        });
      }

      case "devin.sessions.list": {
        const sessions = [...state.bindings.entries()].map(([sessionKey, binding]) => {
          const meta = state.sessionMeta.get(sessionKey) || {};
          return {
            sessionKey,
            agentId: agentIdForSessionKey(sessionKey),
            devinSessionId: binding.devinSessionId,
            url: binding.url ?? null,
            title: meta.title ?? binding.title ?? null,
            state: meta.state ?? "idle",
            status: meta.status ?? null,
            statusDetail: meta.statusDetail ?? null,
            pullRequests: meta.pullRequests ?? [],
            acusConsumed: meta.acusConsumed ?? null,
            createdAt: binding.createdAt ?? null,
            lastSyncAt: meta.lastSyncAt ?? null,
            lastError: meta.lastError ?? null,
          };
        });
        return resOk(id, { sessions, configured: isConfigured() });
      }

      case "devin.session.get": {
        requireConfigured();
        const devinSessionId =
          typeof p.devinSessionId === "string" && p.devinSessionId
            ? p.devinSessionId
            : state.bindings.get(typeof p.sessionKey === "string" ? p.sessionKey : "")
                ?.devinSessionId;
        if (!devinSessionId) return resErr(id, "not_found", "No Devin session bound.");
        try {
          const session = await client.getSession(devinSessionId);
          return resOk(id, {
            session,
            state: mapDevinSessionState(session),
          });
        } catch (err) {
          const code = err instanceof DevinApiError ? err.code : "internal_error";
          return resErr(id, code, sanitize(err));
        }
      }

      case "devin.session.terminate": {
        requireConfigured();
        const devinSessionId =
          typeof p.devinSessionId === "string" && p.devinSessionId
            ? p.devinSessionId
            : state.bindings.get(typeof p.sessionKey === "string" ? p.sessionKey : "")
                ?.devinSessionId;
        if (!devinSessionId) return resErr(id, "not_found", "No Devin session bound.");
        const archive = p.archive === true;
        try {
          await client.terminateSession(devinSessionId, { archive });
        } catch (err) {
          const code = err instanceof DevinApiError ? err.code : "internal_error";
          return resErr(id, code, sanitize(err));
        }
        const key = typeof p.sessionKey === "string" ? p.sessionKey : null;
        if (key) {
          const meta = state.sessionMeta.get(key) || {};
          state.sessionMeta.set(key, { ...meta, state: "cancelled", lastSyncAt: Date.now() });
          store.persist();
          emitDevinSessionEvent(key);
        }
        return resOk(id, { ok: true });
      }

      case "devin.session.archive": {
        requireConfigured();
        const devinSessionId =
          typeof p.devinSessionId === "string" && p.devinSessionId
            ? p.devinSessionId
            : state.bindings.get(typeof p.sessionKey === "string" ? p.sessionKey : "")
                ?.devinSessionId;
        if (!devinSessionId) return resErr(id, "not_found", "No Devin session bound.");
        try {
          await client.archiveSession(devinSessionId);
        } catch (err) {
          const code = err instanceof DevinApiError ? err.code : "internal_error";
          return resErr(id, code, sanitize(err));
        }
        return resOk(id, { ok: true });
      }

      case "devin.agent.bind": {
        // Attach an existing Devin session to an agent's conversation.
        requireConfigured();
        const agentId = typeof p.agentId === "string" ? p.agentId.trim() : "";
        const devinSessionId = typeof p.devinSessionId === "string" ? p.devinSessionId.trim() : "";
        if (!agentId || !devinSessionId) {
          return resErr(id, "invalid_request", "agentId and devinSessionId are required.");
        }
        if (!state.agents.has(agentId)) {
          return resErr(id, "not_found", `Agent ${agentId} not found`);
        }
        try {
          const session = await client.getSession(devinSessionId);
          const sessionKey = sessionKeyFor(agentId);
          state.bindings.set(sessionKey, {
            devinSessionId: session.session_id ?? devinSessionId,
            url: session.url ?? null,
            title: session.title ?? null,
            createdAt: Date.now(),
          });
          state.sessionMeta.set(sessionKey, {
            state: mapDevinSessionState(session),
            status: session.status ?? null,
            statusDetail: session.status_detail ?? null,
            title: session.title ?? null,
            pullRequests: session.pull_requests ?? [],
            acusConsumed: session.acus_consumed ?? null,
            lastSyncAt: Date.now(),
            lastError: null,
          });
          store.persist();
          emitDevinSessionEvent(sessionKey);
          return resOk(id, { ok: true, sessionKey });
        } catch (err) {
          const code = err instanceof DevinApiError ? err.code : "internal_error";
          return resErr(id, code, sanitize(err));
        }
      }

      case "devin.repos.list":
        return resOk(id, { allowedRepos: [...allowedRepos], defaultRepos });

      case "devin.sync": {
        await syncAllSessions();
        return resOk(id, { ok: true });
      }

      default:
        return resOk(id, {});
    }
  }

  // -------------------------------------------------------------- WS server

  function startAdapter({ port, host } = {}) {
    const listenPort = port ?? parseInt(process.env.DEVIN_GATEWAY_PORT || "18790", 10);
    const listenHost = host ?? process.env.DEVIN_GATEWAY_HOST ?? "127.0.0.1";

    const httpServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Hermes3D Devin Gateway Adapter\n");
    });

    const wss = new WebSocketServer({ server: httpServer });
    wss.on("connection", (ws) => {
      let connected = false;
      let globalSeq = 0;

      const send = (frame) => {
        if (ws.readyState !== ws.OPEN) return;
        ws.send(JSON.stringify(frame));
      };

      const sendEventFn = (frame) => {
        if (frame.type === "event" && typeof frame.seq !== "number") {
          frame.seq = globalSeq++;
        }
        send(frame);
      };

      activeSendEventFns.add(sendEventFn);
      send({ type: "event", event: "connect.challenge", payload: { nonce: randomId() } });

      ws.on("message", async (raw) => {
        let frame;
        try {
          frame = JSON.parse(raw.toString("utf8"));
        } catch {
          return;
        }
        if (!frame || typeof frame !== "object" || frame.type !== "req") return;
        const { id, method, params } = frame;
        if (typeof id !== "string" || typeof method !== "string") return;

        if (method === "connect") {
          connected = true;
          const health = await refreshHealth();
          send({
            type: "res",
            id,
            ok: true,
            payload: {
              type: "hello-ok",
              protocol: 3,
              adapterType: "devin",
              features: {
                methods: [
                  "agents.list",
                  "agents.create",
                  "agents.delete",
                  "agents.update",
                  "sessions.list",
                  "sessions.preview",
                  "sessions.patch",
                  "sessions.reset",
                  "chat.send",
                  "chat.abort",
                  "chat.history",
                  "agent.wait",
                  "status",
                  "config.get",
                  "config.set",
                  "config.patch",
                  "agents.files.get",
                  "agents.files.set",
                  "exec.approvals.get",
                  "exec.approvals.set",
                  "exec.approval.resolve",
                  "wake",
                  "skills.status",
                  "models.list",
                  "cron.list",
                  "devin.health",
                  "devin.sessions.list",
                  "devin.session.get",
                  "devin.session.terminate",
                  "devin.session.archive",
                  "devin.agent.bind",
                  "devin.repos.list",
                  "devin.sync",
                ],
                events: ["chat", "presence", "heartbeat", "devin"],
              },
              snapshot: {
                health: {
                  agents: [...state.agents.values()].map((agent) => ({
                    agentId: agent.id,
                    name: agent.name,
                    isDefault: agent.id === defaultAgentId(),
                  })),
                  defaultAgentId: defaultAgentId(),
                },
                sessionDefaults: { mainKey: MAIN_KEY },
                devin: {
                  configured: isConfigured(),
                  orgId: orgId || null,
                  healthOk: health.ok,
                },
              },
              auth: { role: "operator", scopes: ["operator.admin"] },
              policy: { tickIntervalMs: 30000 },
            },
          });
          if (isConfigured()) startSyncLoop();
          return;
        }

        if (!connected) {
          send(resErr(id, "not_connected", "Send connect first."));
          return;
        }

        try {
          send(await handleMethod(method, params, id, sendEventFn));
        } catch (error) {
          send(resErr(id, "internal_error", sanitize(error)));
        }
      });

      ws.on("close", () => activeSendEventFns.delete(sendEventFn));
      ws.on("error", () => activeSendEventFns.delete(sendEventFn));
    });

    httpServer.listen(listenPort, listenHost, () => {
      console.log(`[devin-gateway] Listening on ws://${listenHost}:${listenPort}`);
      console.log(
        isConfigured()
          ? `[devin-gateway] Devin API: ${apiBaseUrl} (org ${orgId})`
          : "[devin-gateway] WARNING: DEVIN_API_KEY / DEVIN_ORG_ID not set — running unconfigured."
      );
    });

    return httpServer;
  }

  return {
    handleMethod,
    startAdapter,
    syncAllSessions,
    syncSession,
    refreshHealth,
    mapDevinSessionState,
    /** Test/embedding hook: subscribe to gateway events without a WS client. */
    subscribeEvents(fn) {
      activeSendEventFns.add(fn);
      return () => activeSendEventFns.delete(fn);
    },
    _state: state,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  loadRuntimeEnv();
  const gateway = createDevinGateway();
  gateway.startAdapter();
}

module.exports = {
  createDevinGateway,
  createDevinClient,
  createStateStore,
  mapDevinSessionState,
  DevinApiError,
  DEVIN_ERROR,
  DEVIN_VISUAL_STATES,
};
