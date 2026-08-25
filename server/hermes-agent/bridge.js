/**
 * Translates the Hermes3D gateway protocol into hermes-agent's JSON-RPC 2.0 API.
 *
 * hermes-agent has no server that speaks the Hermes3D protocol — that protocol
 * came from OpenClaw. Rather than run a separate adapter process, this module
 * presents a virtual upstream to `gateway-proxy.js`: it exposes the small slice
 * of the `ws` WebSocket surface the proxy actually uses (`readyState`, `send`,
 * `close`, `terminate`, and the open/message/close/error events), so the proxy's
 * connect handling and lifecycle stay untouched.
 *
 * Hermes3D talks in agents and session keys; hermes-agent talks in runtime
 * session ids. A hermes-agent backend is a single agent, so the fleet is
 * synthesised as one entry and session keys are mapped onto runtime sessions
 * that are created or resumed on first use.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");

const { HermesAgentJsonRpcClient, redactUrl } = require("./jsonrpc-client");
const { createOfficeSpeechSubscriber } = require("./office-speech");
const { isManagedFleetAgent, managedProfileWriteError } = require("../managed-fleet");

const resolveAgentFilePath = (agentId, fileName) => {
  const candidates = [];
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, "hermes", "profiles", agentId, fileName));
    candidates.push(path.join(process.env.LOCALAPPDATA, "hermes", fileName));
  }
  const home = os.homedir();
  if (home) {
    candidates.push(path.join(home, ".hermes", "profiles", agentId, fileName));
    candidates.push(path.join(home, ".hermes", fileName));
    candidates.push(path.join(home, ".config", "hermes", "profiles", agentId, fileName));
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "hermes", "profiles", agentId, fileName);
  }
  return path.join(home, ".hermes", "profiles", agentId, fileName);
};

const PACKAGED_SKILL_KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PACKAGED_SKILL_METADATA_RE = /["']skillKey["']\s*:\s*["']([^"']+)["']/i;

const readFrontmatterValue = (content, key) => {
  const match = String(content ?? "").match(
    new RegExp(`^${key}:\\s*(.+?)\\s*$`, "mi"),
  );
  return asString(match?.[1]).replace(/^['"]|['"]$/g, "");
};

const listPackagedSkillEntries = (workspaceDir) => {
  const workspace = asString(workspaceDir);
  if (!workspace) return [];
  const skillsRoot = path.join(workspace, "skills");
  let directories = [];
  try {
    directories = fs.readdirSync(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const emptyRequirements = { bins: [], anyBins: [], env: [], config: [], os: [] };
  return directories.flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const baseDir = path.join(skillsRoot, entry.name);
    const filePath = path.join(baseDir, "SKILL.md");
    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      return [];
    }
    const skillKey = asString(content.match(PACKAGED_SKILL_METADATA_RE)?.[1]);
    if (!PACKAGED_SKILL_KEY_RE.test(skillKey) || skillKey !== entry.name) return [];
    return [{
      name: readFrontmatterValue(content, "name") || skillKey,
      description: readFrontmatterValue(content, "description"),
      source: "hermes-workspace",
      bundled: false,
      filePath,
      baseDir,
      skillKey,
      always: false,
      disabled: false,
      blockedByAllowlist: false,
      eligible: true,
      requirements: { ...emptyRequirements },
      missing: { ...emptyRequirements },
      configChecks: [],
      install: [],
    }];
  });
};

const resolvePackagedSkillFiles = (skillDir, files) => {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Packaged skill files are required.");
  }
  const resolvedSkillDir = path.resolve(skillDir);
  const prefix = `${resolvedSkillDir}${path.sep}`;
  return files.map((file) => {
    const relativePath = asString(file?.relativePath).replace(/\\/g, "/");
    const content = typeof file?.content === "string" ? file.content : null;
    if (
      !relativePath ||
      path.isAbsolute(relativePath) ||
      relativePath.split("/").some((segment) => !segment || segment === "..") ||
      content === null
    ) {
      throw new Error("Packaged skill contains an invalid file entry.");
    }
    const targetPath = path.resolve(resolvedSkillDir, relativePath);
    if (!targetPath.startsWith(prefix)) {
      throw new Error("Packaged skill file resolves outside its skill directory.");
    }
    return { targetPath, content };
  });
};
const {
  KANBAN_TASK_ID_PREFIX,
  toHermes3dKanbanTaskRecord,
  toHermes3dKanbanTaskDetail,
  toHermes3dKanbanTasks,
  toKanbanCreateBody,
  toManagedFleetIntakeBody,
  toManagedFleetPatchBody,
  toKanbanPatchBody,
  kanbanRequest,
} = require("./kanban");

const managedFleetMode = Boolean(
  String(process.env.HERMES3D_FLEET_ROOT ?? "").trim(),
);
const {
  isPullRequestDeliveryCandidate,
  publishTaskPullRequest,
  setPullRequestDeliveryStatus,
} = require("./pr-delivery");

/** Mirrors the numeric WebSocket readyState constants the proxy compares against. */
const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

const AGENT_ID = "hermes";
const AGENT_NAME = "Hermes";
const MAIN_KEY = "main";
const MAIN_SESSION_KEY = `agent:${AGENT_ID}:${MAIN_KEY}`;

/** hermes-agent's `session.create` / `session.resume` can be slow on a cold profile. */
const SESSION_RPC_TIMEOUT_MS = 60_000;

/** A profile database can take a moment to open while hermes-agent is starting. */
const SESSION_LIST_RETRY_DELAYS_MS = [150, 400, 1_000];

/**
 * The slice of the `ws` WebSocket surface `gateway-proxy.js` relies on.
 *
 * @typedef {import("node:events").EventEmitter & {
 *   readyState: number,
 *   send: (raw: string) => void,
 *   close: (code?: number, reason?: string) => void,
 *   terminate: () => void,
 * }} HermesAgentUpstream
 */

const resOk = (id, payload) => ({ type: "res", id, ok: true, payload: payload ?? {} });
const resErr = (id, code, message) => ({ type: "res", id, ok: false, error: { code, message } });

const asString = (value, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const errorMessage = (err) => {
  if (!err) return "hermes-agent request failed";
  if (typeof err === "string") return err;
  return err.message || String(err);
};

const isTransientStateDbUnavailable = (err) =>
  /state\.db unavailable/i.test(errorMessage(err));

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

/** Retry only the known cold-start profile database race. */
const requestSessionListWithRetry = async (
  client,
  params,
  { delays = SESSION_LIST_RETRY_DELAYS_MS, sleep = wait } = {}
) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.request("session.list", params);
    } catch (err) {
      if (!isTransientStateDbUnavailable(err) || attempt >= delays.length) {
        throw err;
      }
      await sleep(delays[attempt]);
    }
  }
};

/** hermes-agent history rows use `text` or `content` or nested `message`. */
const toHermes3dMessages = (messages) => {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant" || m.message?.role === "user" || m.message?.role === "assistant"))
    .map((m) => {
      const role = m.role || m.message?.role || "assistant";
      let content = "";
      if (typeof m.text === "string" && m.text) {
        content = m.text;
      } else if (typeof m.content === "string" && m.content) {
        content = m.content;
      } else if (typeof m.message?.content === "string" && m.message.content) {
        content = m.message.content;
      } else if (typeof m.message?.text === "string" && m.message.text) {
        content = m.message.text;
      } else if (Array.isArray(m.content)) {
        content = m.content.map((p) => (typeof p === "string" ? p : p?.text || p?.content || "")).filter(Boolean).join("\n");
      } else if (Array.isArray(m.message?.content)) {
        content = m.message.content.map((p) => (typeof p === "string" ? p : p?.text || p?.content || "")).filter(Boolean).join("\n");
      }
      return {
        role,
        content: content || (typeof m.content === "string" ? m.content : ""),
      };
    });
};

const parseTimestampMs = (value) => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const DURATION_UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/**
 * hermes-agent stores a schedule as one string; Hermes3D wants a tagged union.
 *
 * The string is a 5-field cron expression, a duration such as "30m", or an ISO
 * timestamp for a one-shot job.
 */
const toHermes3dSchedule = (raw) => {
  const value = asString(raw);
  if (!value) return { kind: "cron", expr: "" };

  const duration = /^every\s+(\d+)\s*([smhd])$/i.exec(value) || /^(\d+)\s*([smhd])$/i.exec(value);
  if (duration) {
    const unit = DURATION_UNIT_MS[duration[2].toLowerCase()];
    if (unit) return { kind: "every", everyMs: Number(duration[1]) * unit };
  }

  if (value.split(/\s+/).length === 5) return { kind: "cron", expr: value };

  const at = parseTimestampMs(value);
  if (at !== undefined) return { kind: "at", at: value };

  return { kind: "cron", expr: value };
};

const CRON_STATUSES = new Set(["ok", "error", "skipped"]);

/**
 * Translate hermes-agent cron rows into Hermes3D's `CronJobSummary`.
 *
 * The two shapes disagree on nearly every field: hermes-agent uses `job_id`, a
 * schedule string, `prompt_preview`, ISO timestamps, and a `state` *string*,
 * while Hermes3D expects `id`, a schedule object, a `payload` object, epoch
 * milliseconds, and a `state` object. Forwarding the raw rows crashes the
 * office task board, which reads `job.payload.kind` unguarded.
 */
const toHermes3dCronJobs = (jobs, agentId = AGENT_ID) => {
  if (!Array.isArray(jobs)) return [];
  return jobs
    .filter((job) => job && typeof job === "object")
    .map((job) => {
      const nextRunAtMs = parseTimestampMs(job.next_run_at);
      const lastRunAtMs = parseTimestampMs(job.last_run_at);
      const lastStatus = asString(job.last_status).toLowerCase();
      const lastError = asString(job.last_fire_error) || asString(job.last_delivery_error);
      const message =
        asString(job.prompt_preview) || asString(job.name) || "Scheduled job";

      return {
        id: asString(job.job_id) || asString(job.id),
        name: asString(job.name) || asString(job.job_id) || "Scheduled job",
        agentId,
        description: asString(job.prompt_preview) || undefined,
        enabled: job.enabled !== false,
        updatedAtMs: lastRunAtMs ?? nextRunAtMs ?? Date.now(),
        schedule: toHermes3dSchedule(job.schedule),
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        payload: { kind: "agentTurn", message },
        state: {
          ...(nextRunAtMs !== undefined ? { nextRunAtMs } : {}),
          ...(lastRunAtMs !== undefined ? { lastRunAtMs } : {}),
          ...(asString(job.state).toLowerCase() === "running"
            ? { runningAtMs: Date.now() }
            : {}),
          ...(CRON_STATUSES.has(lastStatus) ? { lastStatus } : {}),
          ...(lastError ? { lastError } : {}),
        },
        delivery: { mode: asString(job.deliver) && job.deliver !== "none" ? "announce" : "none" },
      };
    })
    .filter((job) => job.id);
};

/** Used when the backend predates `profiles.list` or the call fails. */
const fallbackAgent = () => ({
  id: AGENT_ID,
  name: AGENT_NAME,
  workspace: "",
  identity: { name: AGENT_NAME, emoji: "🤖" },
  role: "",
  profile: "",
});

/** Title-case a profile directory name for display ("allan" -> "Allan"). */
const toDisplayName = (name) =>
  name ? name.charAt(0).toUpperCase() + name.slice(1) : "";

/**
 * Turn hermes-agent's profile list into Hermes3D agents.
 *
 * A profile is the backend's unit of identity — its own model, skills, memory
 * and sessions — which is exactly what Hermes3D calls an agent. Collapsing them
 * into one entry hides the operator's whole fleet, so each profile gets a desk.
 *
 * The `profile` field is what routes sessions back; the default profile carries
 * an empty string because omitting `profile` means "launch profile" upstream.
 */
const toHermes3dAgents = (profiles) => {
  if (!Array.isArray(profiles)) return [];
  const allowlist = (process.env.HERMES3D_AGENT_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const blocklist = (process.env.HERMES3D_AGENT_BLOCKLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const agents = profiles
    .filter((p) => p && typeof p === "object" && asString(p.name))
    .filter((p) => {
      const name = asString(p.name).toLowerCase();
      if (allowlist.length > 0 && !allowlist.includes(name)) return false;
      if (blocklist.length > 0 && blocklist.includes(name)) return false;
      return true;
    })
    .map((p) => {
      const name = asString(p.name);
      const isDefault = p.is_default === true;
      const display = asString(p.display_name) || toDisplayName(name);
      // The long profile descriptions read as a role ("Allan — technical
      // planner…"); keep the part after the dash so the desk label stays short.
      const description = asString(p.description);
      const role = description.includes("—")
        ? description.split("—").slice(1).join("—").trim()
        : description;
      return {
        id: name,
        name: display,
        workspace: asString(p.path),
        identity: { name: display, emoji: isDefault ? "🤖" : "🧑‍💻" },
        role,
        model: asString(p.model),
        isDefault,
        profile: isDefault ? "" : name,
      };
    });
  return agents;
};

const resolveDefaultAgentId = (agents) => {
  const explicit = agents.find((a) => a.isDefault);
  return explicit?.id ?? agents[0]?.id ?? AGENT_ID;
};

function createHermesAgentUpstream(options) {
  const {
    url,
    token,
    handshakeTimeoutMs,
    log = () => {},
    logError = () => {},
  } = options || {};

  const upstream = /** @type {HermesAgentUpstream} */ (new EventEmitter());
  upstream.readyState = CONNECTING;

  let client;
  try {
    client = new HermesAgentJsonRpcClient({ url, token, handshakeTimeoutMs, log });
  } catch (err) {
    // Defer so the caller can attach listeners before the failure lands.
    setImmediate(() => upstream.emit("error", err));
    upstream.readyState = CLOSED;
    upstream.send = () => {};
    upstream.close = () => {};
    upstream.terminate = () => {};
    return upstream;
  }

  /** sessionKey -> { runtimeId, storedId, title } */
  const sessions = new Map();
  /** runtime session id -> sessionKey */
  const sessionKeyByRuntimeId = new Map();
  /**
   * Hermes3D agents, one per hermes-agent profile.
   *
   * Profiles are the backend's fleet: each is a fully isolated instance with
   * its own model, skills, memory, and session store. Resolved once at connect
   * because the set only changes when the operator creates or deletes one.
   */
  let agentRoster = [fallbackAgent()];
  let defaultAgentId = AGENT_ID;
  /** Optional feed of turns driven from other clients; see ./office-speech.js. */
  let officeSpeech = null;
  /** runId -> { sessionKey, runtimeId, buffer, aborted } */
  const activeRuns = new Map();
  /** sessionKey -> runId, so session-scoped events find their run. */
  const runBySessionKey = new Map();
  /** task id -> last host-side GitHub delivery attempt timestamp. */
  const pullRequestDeliveryAttempts = new Map();
  /** Prevent overlapping poll cycles from publishing the same branch twice. */
  const pullRequestDeliveriesInFlight = new Set();

  let seq = 0;
  let closed = false;

  const schedulePullRequestDelivery = (task) => {
    if (!isPullRequestDeliveryCandidate(task)) return;
    const taskId = asString(task.id);
    if (!taskId || pullRequestDeliveriesInFlight.has(taskId)) return;
    const now = Date.now();
    const lastAttemptAt = pullRequestDeliveryAttempts.get(taskId) ?? 0;
    if (now - lastAttemptAt < 5 * 60_000) return;
    pullRequestDeliveryAttempts.set(taskId, now);
    pullRequestDeliveriesInFlight.add(taskId);

    void (async () => {
      let nextBody = asString(task.body);
      try {
        const delivery = await publishTaskPullRequest(task);
        if (delivery.status === "skipped") return;
        nextBody = delivery.body;
        log(
          `[hermes-agent] GitHub PR ${delivery.status} for ${taskId}: ${delivery.url}`,
        );
      } catch (err) {
        const detail = errorMessage(err).slice(0, 400);
        nextBody = setPullRequestDeliveryStatus(
          task.body,
          `blocked — ${detail || "unknown host-side delivery error"}`,
        );
        log(`[hermes-agent] GitHub PR delivery blocked for ${taskId}: ${detail}`);
      }

      if (nextBody !== asString(task.body)) {
        try {
          await kanbanRequest({
            wsUrl: url,
            token,
            useLoopbackHost: client.usedLoopbackHost,
            method: "PATCH",
            path: `/tasks/${encodeURIComponent(taskId)}`,
            body: { body: nextBody },
          });
        } catch (err) {
          log(
            `[hermes-agent] failed to persist GitHub delivery status for ${taskId}: ${errorMessage(err)}`,
          );
        }
      }
    })().finally(() => {
      pullRequestDeliveriesInFlight.delete(taskId);
    });
  };

  const emitFrame = (frame) => {
    if (closed) return;
    upstream.emit("message", JSON.stringify(frame));
  };

  const emitEvent = (event, payload) => {
    emitFrame({ type: "event", event, seq: seq++, payload });
  };

  const emitChat = (runId, sessionKey, state, extra) => {
    emitEvent("chat", { runId, sessionKey, state, ...extra });
  };

  // --- session mapping ------------------------------------------------------

  const rememberSession = (sessionKey, result) => {
    const runtimeId = asString(result?.session_id);
    if (!runtimeId) throw new Error("hermes-agent did not return a session id.");
    const entry = {
      runtimeId,
      storedId: asString(result?.stored_session_id) || asString(result?.session_key),
      title: asString(result?.info?.title) || asString(result?.title),
    };
    sessions.set(sessionKey, entry);
    sessionKeyByRuntimeId.set(runtimeId, sessionKey);
    return entry;
  };

  /**
   * Split `agent:<agentId>:<tail>` into the agent and the stored session id.
   */
  const parseSessionKey = (sessionKey) => {
    const parts = String(sessionKey ?? "").split(":");
    if (parts[0] !== "agent" || parts.length < 3) {
      return { agentId: defaultAgentId, tail: "" };
    }
    return { agentId: parts[1] || defaultAgentId, tail: parts.slice(2).join(":") };
  };

  /**
   * The `profile` value to send upstream for an agent.
   *
   * Empty means "the launch profile", which is what hermes-agent expects for
   * the default; naming it explicitly is unnecessary and, for a backend with no
   * profiles at all, would be rejected.
   */
  const profileForAgent = (agentId) => {
    const agent = agentRoster.find((a) => a.id === agentId);
    return agent ? asString(agent.profile) : "";
  };

  /** Main session of whichever agent is default; the roster is known only at runtime. */
  const defaultMainKey = () => `agent:${defaultAgentId}:${MAIN_KEY}`;

  /**
   * Resolve the runtime session backing a Hermes3D session key, creating or
   * resuming one on hermes-agent the first time the key is used.
   *
   * The agent segment of the key selects the profile, so a prompt sent to
   * `agent:allan:main` runs with Allan's model, skills, and session store.
   */
  const ensureSession = async (sessionKey) => {
    const existing = sessions.get(sessionKey);
    if (existing?.runtimeId) return existing;

    const { agentId, tail } = parseSessionKey(sessionKey);
    const profile = profileForAgent(agentId);
    const scope = profile ? { profile } : {};

    // A key of the form `agent:<id>:<storedId>` refers to a stored hermes-agent
    // session; anything else starts a fresh one.
    if (tail && tail !== MAIN_KEY) {
      try {
        const resumed = await client.request(
          "session.resume",
          { session_id: tail, omit_messages: false, ...scope },
          SESSION_RPC_TIMEOUT_MS
        );
        return rememberSession(sessionKey, resumed);
      } catch (err) {
        log(`[hermes-agent] resume of "${tail}" failed, creating a new session: ${errorMessage(err)}`);
      }
    }

    const created = await client.request("session.create", scope, SESSION_RPC_TIMEOUT_MS);
    log(`[hermes-agent] session for "${sessionKey}" -> profile "${profile || "(default)"}"`);
    return rememberSession(sessionKey, created);
  };

  // --- upstream event fan-out ----------------------------------------------

  client.on("event", (type, runtimeSessionId, payload) => {
    const sessionKey = sessionKeyByRuntimeId.get(runtimeSessionId);
    if (!sessionKey) return;
    const runId = runBySessionKey.get(sessionKey);
    const run = runId ? activeRuns.get(runId) : null;

    switch (type) {
      case "message.start":
        if (run) run.buffer = "";
        return;

      case "message.delta": {
        if (!run || run.aborted) return;
        const text = typeof payload?.text === "string" ? payload.text : "";
        if (!text) return;
        run.buffer += text;
        emitChat(runId, sessionKey, "delta", {
          message: { role: "assistant", content: run.buffer },
        });
        return;
      }

      case "message.complete": {
        if (!run) return;
        const finalText =
          typeof payload?.text === "string" && payload.text ? payload.text : run.buffer;
        if (run.aborted) {
          emitChat(runId, sessionKey, "aborted", {});
        } else if (payload?.status === "error" || payload?.error) {
          emitChat(runId, sessionKey, "error", {
            errorMessage: asString(payload?.error, "hermes-agent reported an error"),
          });
        } else {
          emitChat(runId, sessionKey, "final", {
            stopReason: "end_turn",
            message: { role: "assistant", content: finalText },
          });
          emitEvent("presence", {
            sessions: {
              recent: [{ key: sessionKey, updatedAt: Date.now() }],
              byAgent: [
                {
                  agentId: parseSessionKey(sessionKey).agentId,
                  recent: [{ key: sessionKey, updatedAt: Date.now() }],
                },
              ],
            },
          });
        }
        activeRuns.delete(runId);
        runBySessionKey.delete(sessionKey);
        return;
      }

      case "tool.start":
        if (!run) return;
        emitEvent("agent", {
          runId,
          sessionKey,
          stream: "tool",
          data: { phase: "start", name: asString(payload?.name), text: asString(payload?.context) },
        });
        return;

      case "tool.complete":
        if (!run) return;
        emitEvent("agent", {
          runId,
          sessionKey,
          stream: "tool",
          data: { phase: "complete", name: asString(payload?.name), text: asString(payload?.summary) },
        });
        return;

      case "reasoning.delta":
      case "thinking.delta":
        if (!run) return;
        emitEvent("agent", {
          runId,
          sessionKey,
          stream: "reasoning",
          data: { phase: "delta", text: typeof payload?.text === "string" ? payload.text : "" },
        });
        return;

      case "status.update":
        if (!run) return;
        emitEvent("agent", {
          runId,
          sessionKey,
          stream: "lifecycle",
          data: { phase: asString(payload?.kind, "status"), text: asString(payload?.text) },
        });
        return;

      case "approval.request":
        emitEvent("exec.approval.requested", {
          id: asString(payload?.request_id),
          request: { command: asString(payload?.command), cwd: asString(payload?.cwd) },
          createdAtMs: Date.now(),
          expiresAtMs: Date.now() + 120_000,
        });
        return;

      case "error":
        if (!run) return;
        emitChat(runId, sessionKey, "error", {
          errorMessage: asString(payload?.message, "hermes-agent reported an error"),
        });
        activeRuns.delete(runId);
        runBySessionKey.delete(sessionKey);
        return;

      default:
    }
  });

  // --- method dispatch ------------------------------------------------------

  /** Load the fleet once per connection; a backend without profiles keeps one agent. */
  const loadAgentRoster = async () => {
    try {
      const result = await client.request("profiles.list", {}, SESSION_RPC_TIMEOUT_MS);
      const mapped = toHermes3dAgents(result?.profiles);
      if (mapped.length > 0) {
        agentRoster = mapped;
        defaultAgentId = resolveDefaultAgentId(mapped);
        log(`[hermes-agent] ${mapped.length} profile(s) mapped to agents: ${mapped.map((a) => a.id).join(", ")}`);
        return;
      }
      log("[hermes-agent] profiles.list returned nothing; using a single agent");
    } catch (err) {
      log(`[hermes-agent] profiles.list unavailable (${errorMessage(err)}); using a single agent`);
    }
  };

  /**
   * Relay a turn published by the office bridge plugin.
   *
   * The plugin names the profile that spoke, and Hermes3D names each agent
   * after its profile, so the two line up directly. A turn from a profile this
   * connection does not know about is dropped rather than guessed at.
   */
  const handlePublishedTurn = (turn) => {
    const agent = agentRoster.find((a) => a.id === turn.profile);
    if (!agent) {
      log(`[office-speech] no agent for profile "${turn.profile}"; turn ignored`);
      return;
    }
    emitEvent("office.speech", {
      agentId: agent.id,
      name: agent.name,
      text: turn.text,
      atMs: turn.atMs,
      sessionId: turn.sessionId,
    });
  };

  const startOfficeSpeech = () => {
    if (officeSpeech) return;
    officeSpeech = createOfficeSpeechSubscriber({
      url,
      token,
      onTurn: handlePublishedTurn,
      log,
    });
  };

  const handleConnect = async (id) => {
    await loadAgentRoster();
    // Only worth subscribing once the roster exists to map turns onto.
    startOfficeSpeech();
    const agents = agentRoster.map((a) => ({
      agentId: a.id,
      name: a.name,
      isDefault: a.id === defaultAgentId,
    }));
    return resOk(id, {
      type: "hello-ok",
      protocol: 3,
      // The client trusts this over the configured type once connected, so
      // report what the backend actually is — hermes-agent capabilities
      // (native kanban, profile fleet) hang off this detection.
      adapterType: "hermes-agent",
      features: {
        methods: [
          "agents.list",
          "agents.files.get",
          "agents.files.set",
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
          "exec.approvals.get",
          "exec.approvals.set",
          "exec.approval.resolve",
          "wake",
          "skills.status",
          "skills.packaged.install",
          "models.list",
          "tasks.list",
          "tasks.show",
          "tasks.activity",
          "tasks.comment",
          "tasks.unblock",
          "tasks.create",
          "tasks.update",
          "tasks.dispatch",
          "cron.list",
        ],
        events: ["chat", "agent", "presence", "heartbeat", "cron"],
      },
      snapshot: {
        health: { agents, defaultAgentId },
        sessionDefaults: { mainKey: MAIN_KEY },
      },
      auth: { role: "operator", scopes: ["operator.admin", "operator.approvals"] },
      policy: { tickIntervalMs: 30_000 },
    });
  };

  const readKanbanTaskDetail = async (taskId) => {
    const payload = await kanbanRequest({
      wsUrl: url,
      token,
      useLoopbackHost: client.usedLoopbackHost,
      method: "GET",
      path: `/tasks/${encodeURIComponent(taskId)}`,
    });
    return toHermes3dKanbanTaskDetail(payload);
  };

  const handleMethod = async (method, params, id) => {
    const p = params || {};

    switch (method) {
      case "agents.list":
        return resOk(id, {
          defaultId: defaultAgentId,
          mainKey: MAIN_KEY,
          agents: agentRoster.map(({ id: agentId, name, workspace, identity, role }) => ({
            id: agentId,
            name,
            workspace,
            identity,
            role,
          })),
        });

      case "agents.files.get": {
        const agentId = asString(p?.agentId) || "default";
        const name = asString(p?.name) || "SOUL.md";
        const filePath = resolveAgentFilePath(agentId, name);
        if (filePath && fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, "utf8");
            return resOk(id, { file: { missing: false, content, path: filePath } });
          } catch (e) {
            return resOk(id, { file: { missing: true } });
          }
        }
        return resOk(id, { file: { missing: true } });
      }

      case "agents.files.set": {
        const agentId = asString(p?.agentId) || "default";
        if (isManagedFleetAgent(agentId)) {
          return resError(id, -32003, managedProfileWriteError(agentId));
        }
        const name = asString(p?.name) || "SOUL.md";
        const content = typeof p?.content === "string" ? p.content : "";
        const filePath = resolveAgentFilePath(agentId, name);
        if (filePath) {
          try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, content, "utf8");
            return resOk(id, { ok: true, path: filePath });
          } catch (e) {
            return resError(id, -32603, `Failed to save file: ${errorMessage(e)}`);
          }
        }
        return resOk(id, {});
      }

      case "config.get":
        return resOk(id, {
          config: { gateway: { reload: { mode: "hot" } } },
          hash: "hermes-agent",
          exists: true,
          path: "",
        });

      case "config.patch":
      case "config.set":
        return resOk(id, { hash: "hermes-agent" });

      case "sessions.list": {
        // Each profile keeps its own session store, so the stored rows have to
        // be read per agent; they're local SQLite reads, so fan out in parallel.
        const perAgent = await Promise.all(
          agentRoster.map(async (agent) => {
            const profile = asString(agent.profile);
            let stored = [];
            try {
              const result = await requestSessionListWithRetry(client, {
                limit: 20,
                ...(profile ? { profile } : {}),
              });
              stored = Array.isArray(result?.sessions) ? result.sessions : [];
            } catch (err) {
              log(`[hermes-agent] session.list for "${agent.id}" failed: ${errorMessage(err)}`);
            }
            return [
              {
                key: `agent:${agent.id}:${MAIN_KEY}`,
                agentId: agent.id,
                updatedAt: Date.now(),
                displayName: "Main",
                origin: { label: agent.name, provider: "hermes" },
                modelProvider: "hermes",
              },
              ...stored.map((s) => ({
                key: `agent:${agent.id}:${asString(s.id)}`,
                agentId: agent.id,
                updatedAt: typeof s.started_at === "number" ? s.started_at * 1000 : null,
                displayName: asString(s.title, "Session"),
                origin: { label: agent.name, provider: "hermes" },
                modelProvider: "hermes",
              })),
            ];
          })
        );
        return resOk(id, { sessions: perAgent.flat() });
      }

      case "sessions.preview": {
        const keys = Array.isArray(p.keys) ? p.keys : [];
        const limit = typeof p.limit === "number" ? p.limit : 8;
        const maxChars = typeof p.maxChars === "number" ? p.maxChars : 240;
        const previews = await Promise.all(
          keys.map(async (key) => {
            const entry = sessions.get(key);
            if (!entry?.runtimeId) return { key, status: "empty", items: [] };
            try {
              const history = await client.request("session.history", {
                session_id: entry.runtimeId,
              });
              const items = toHermes3dMessages(history?.messages)
                .slice(-limit)
                .map((m) => ({
                  role: m.role,
                  text: m.content.slice(0, maxChars),
                  timestamp: Date.now(),
                }));
              return { key, status: items.length ? "ok" : "empty", items };
            } catch {
              return { key, status: "empty", items: [] };
            }
          })
        );
        return resOk(id, { ts: Date.now(), previews });
      }

      case "sessions.patch": {
        const key = asString(p.key, defaultMainKey());
        const model = typeof p.model === "string" ? p.model.trim() : "";
        if (model) {
          try {
            const entry = await ensureSession(key);
            await client.request("config.set", {
              key: "model",
              value: model,
              session_id: entry.runtimeId,
            });
          } catch (err) {
            log(`[hermes-agent] model switch failed: ${errorMessage(err)}`);
          }
        }
        return resOk(id, {
          ok: true,
          key,
          entry: { thinkingLevel: p.thinkingLevel },
          resolved: { model: model || undefined, modelProvider: "hermes" },
        });
      }

      case "sessions.reset": {
        const key = asString(p.key, defaultMainKey());
        const entry = sessions.get(key);
        if (entry?.runtimeId) {
          sessionKeyByRuntimeId.delete(entry.runtimeId);
          try {
            await client.request("session.close", { session_id: entry.runtimeId });
          } catch {}
        }
        sessions.delete(key);
        return resOk(id, { ok: true });
      }

      case "chat.send": {
        const sessionKey = asString(p.sessionKey, defaultMainKey());
        const text =
          typeof p.message === "string" ? p.message.trim() : String(p.message ?? "").trim();
        const runId = asString(p.idempotencyKey) || randomUUID();
        if (!text) return resOk(id, { status: "no-op", runId });

        let entry;
        try {
          entry = await ensureSession(sessionKey);
        } catch (err) {
          return resErr(id, "hermes_agent.session_failed", errorMessage(err));
        }

        activeRuns.set(runId, { sessionKey, runtimeId: entry.runtimeId, buffer: "", aborted: false });
        runBySessionKey.set(sessionKey, runId);

        try {
          await client.request("prompt.submit", { session_id: entry.runtimeId, text });
        } catch (err) {
          activeRuns.delete(runId);
          runBySessionKey.delete(sessionKey);
          return resErr(id, "hermes_agent.prompt_failed", errorMessage(err));
        }

        return resOk(id, { status: "started", runId });
      }

      case "chat.abort": {
        const runId = asString(p.runId);
        const sessionKey = asString(p.sessionKey);
        const targets = runId
          ? [runId]
          : [...activeRuns.entries()]
              .filter(([, run]) => run.sessionKey === sessionKey)
              .map(([rid]) => rid);

        let aborted = 0;
        for (const rid of targets) {
          const run = activeRuns.get(rid);
          if (!run) continue;
          run.aborted = true;
          aborted += 1;
          try {
            await client.request("session.interrupt", { session_id: run.runtimeId });
          } catch (err) {
            log(`[hermes-agent] interrupt failed: ${errorMessage(err)}`);
          }
        }
        return resOk(id, { ok: true, aborted });
      }

      case "chat.history": {
        const sessionKey = asString(p.sessionKey, defaultMainKey());
        const entry = sessions.get(sessionKey);
        if (!entry?.runtimeId) return resOk(id, { sessionKey, messages: [] });
        try {
          const history = await client.request("session.history", {
            session_id: entry.runtimeId,
          });
          return resOk(id, { sessionKey, messages: toHermes3dMessages(history?.messages) });
        } catch (err) {
          log(`[hermes-agent] session.history failed: ${errorMessage(err)}`);
          return resOk(id, { sessionKey, messages: [] });
        }
      }

      case "agent.wait": {
        const runId = asString(p.runId);
        const timeoutMs = typeof p.timeoutMs === "number" ? p.timeoutMs : 30_000;
        const start = Date.now();
        while (activeRuns.has(runId) && Date.now() - start < timeoutMs) {
          await new Promise((r) => setTimeout(r, 100));
        }
        return resOk(id, { status: activeRuns.has(runId) ? "running" : "done" });
      }

      case "status": {
        const recent = [...sessions.keys()].map((key) => ({ key, updatedAt: Date.now() }));
        const byAgent = agentRoster.map((agent) => ({
          agentId: agent.id,
          recent: recent.filter((entry) => parseSessionKey(entry.key).agentId === agent.id),
        }));
        return resOk(id, { sessions: { recent, byAgent } });
      }

      case "wake": {
        const text = asString(p.text);
        if (!text) return resOk(id, { ok: true });
        try {
          const entry = await ensureSession(defaultMainKey());
          await client.request("prompt.submit", { session_id: entry.runtimeId, text });
        } catch (err) {
          log(`[hermes-agent] wake failed: ${errorMessage(err)}`);
        }
        return resOk(id, { ok: true });
      }

      case "models.list": {
        try {
          const result = await client.request("model.options", {});
          const options = Array.isArray(result?.options) ? result.options : [];
          const models = options
            .map((o) => asString(o?.id) || asString(o?.slug) || asString(o?.model))
            .filter(Boolean)
            .map((modelId) => ({ id: modelId, name: modelId }));
          return resOk(id, { models: models.length ? models : [{ id: "hermes", name: "hermes" }] });
        } catch {
          return resOk(id, { models: [{ id: "hermes", name: "hermes" }] });
        }
      }

      case "skills.status": {
        const agentId = asString(p.agentId) || defaultAgentId;
        const agent = agentRoster.find((candidate) => candidate.id === agentId);
        const workspaceDir = asString(agent?.workspace);
        const managedSkillsDir = workspaceDir ? path.join(workspaceDir, "skills") : "";
        const profile = profileForAgent(agentId);
        try {
          await client.request("skills.manage", {
            action: "list",
            ...(profile ? { profile } : {}),
          });
          return resOk(id, {
            workspaceDir,
            managedSkillsDir,
            skills: listPackagedSkillEntries(workspaceDir),
          });
        } catch {
          return resOk(id, {
            workspaceDir,
            managedSkillsDir,
            skills: listPackagedSkillEntries(workspaceDir),
          });
        }
      }

      case "skills.packaged.install": {
        const agentId = asString(p.agentId) || defaultAgentId;
        const agent = agentRoster.find((candidate) => candidate.id === agentId);
        const workspaceDir = asString(agent?.workspace);
        const skillKey = asString(p.skillKey);
        if (!workspaceDir) {
          return resErr(
            id,
            "hermes_agent.skills_workspace_missing",
            `No profile workspace is available for agent "${agentId}".`,
          );
        }
        if (!PACKAGED_SKILL_KEY_RE.test(skillKey)) {
          return resErr(
            id,
            "hermes_agent.skills_package_invalid",
            "Packaged skill key is invalid.",
          );
        }
        const skillDir = path.resolve(workspaceDir, "skills", skillKey);
        try {
          const files = resolvePackagedSkillFiles(skillDir, p.files);
          for (const file of files) {
            fs.mkdirSync(path.dirname(file.targetPath), { recursive: true });
            fs.writeFileSync(file.targetPath, file.content, "utf8");
          }
          return resOk(id, {
            installed: true,
            installedPath: skillDir,
            source: "hermes-workspace",
            skillKey,
          });
        } catch (err) {
          return resErr(
            id,
            "hermes_agent.skills_package_install_failed",
            errorMessage(err),
          );
        }
      }

      case "cron.list": {
        try {
          // cron.manage reads the launch profile's scheduler, so the jobs
          // belong to whichever agent that profile maps to.
          const result = await client.request("cron.manage", { action: "list" });
          return resOk(id, { jobs: toHermes3dCronJobs(result?.jobs, defaultAgentId) });
        } catch (err) {
          log(`[hermes-agent] cron.manage failed: ${errorMessage(err)}`);
          return resOk(id, { jobs: [] });
        }
      }

      case "exec.approvals.get":
        return resOk(id, {
          path: "",
          exists: true,
          hash: "hermes-agent",
          file: {
            version: 1,
            defaults: { security: "full", ask: "off", autoAllowSkills: true },
            agents: {},
          },
        });

      case "exec.approvals.set":
        return resOk(id, { hash: "hermes-agent" });

      case "exec.approval.resolve": {
        const requestId = asString(p.id);
        const decision = asString(p.decision, "deny");
        const runtimeId = [...sessions.values()][0]?.runtimeId;
        if (requestId && runtimeId) {
          try {
            await client.request("approval.respond", {
              session_id: runtimeId,
              request_id: requestId,
              choice: decision === "allow" ? "once" : "deny",
            });
          } catch (err) {
            log(`[hermes-agent] approval.respond failed: ${errorMessage(err)}`);
          }
        }
        return resOk(id, { ok: true });
      }

      // Kanban is built into hermes-agent — the board rides the same origin
      // and session token as the JSON-RPC gateway, so the office task board
      // reflects the real `hermes kanban` board with nothing to install.
      case "tasks.list": {
        try {
          const includeArchived = p.includeArchived === false ? "false" : "true";
          const board = await kanbanRequest({
            wsUrl: url,
            token,
            useLoopbackHost: client.usedLoopbackHost,
            method: "GET",
            path: `/board?include_archived=${includeArchived}`,
          });
          for (const column of Array.isArray(board?.columns) ? board.columns : []) {
            for (const task of Array.isArray(column?.tasks) ? column.tasks : []) {
              schedulePullRequestDelivery(task);
            }
          }
          return resOk(id, { tasks: toHermes3dKanbanTasks(board) });
        } catch (err) {
          // A hidden/disabled kanban plugin or older backend is not an error
          // state for the office — the board just has no hermes tasks.
          log(`[hermes-agent] kanban board unavailable: ${errorMessage(err)}`);
          return resOk(id, { tasks: [] });
        }
      }

      case "tasks.show": {
        const rawId = asString(p.id);
        if (!rawId.startsWith(KANBAN_TASK_ID_PREFIX)) {
          return resErr(
            id,
            "hermes_agent.tasks_show_unsupported",
            "Only Hermes kanban tasks expose native task details on this backend.",
          );
        }
        try {
          const detail = await readKanbanTaskDetail(
            rawId.slice(KANBAN_TASK_ID_PREFIX.length),
          );
          if (!detail) {
            return resErr(
              id,
              "hermes_agent.tasks_show_failed",
              "hermes-agent did not return task details.",
            );
          }
          return resOk(id, detail);
        } catch (err) {
          return resErr(id, "hermes_agent.tasks_show_failed", errorMessage(err));
        }
      }

      case "tasks.comment": {
        const rawId = asString(p.id);
        const body = asString(p.body).trim();
        if (!rawId.startsWith(KANBAN_TASK_ID_PREFIX)) {
          return resErr(
            id,
            "hermes_agent.tasks_comment_unsupported",
            "Only Hermes kanban tasks accept comments on this backend.",
          );
        }
        if (!body) {
          return resErr(
            id,
            "hermes_agent.tasks_comment_invalid",
            "Comment text is required.",
          );
        }
        const taskId = rawId.slice(KANBAN_TASK_ID_PREFIX.length);
        try {
          await kanbanRequest({
            wsUrl: url,
            token,
            useLoopbackHost: client.usedLoopbackHost,
            method: "POST",
            path: `/tasks/${encodeURIComponent(taskId)}/comments`,
            body: { body, author: "hermes3d-user" },
          });
          const detail = await readKanbanTaskDetail(taskId);
          if (!detail) {
            return resErr(
              id,
              "hermes_agent.tasks_comment_failed",
              "Comment was saved, but refreshed task details were unavailable.",
            );
          }
          return resOk(id, detail);
        } catch (err) {
          return resErr(id, "hermes_agent.tasks_comment_failed", errorMessage(err));
        }
      }

      case "tasks.unblock": {
        const rawId = asString(p.id);
        const reply = asString(p.reply).trim();
        if (!rawId.startsWith(KANBAN_TASK_ID_PREFIX)) {
          return resErr(
            id,
            "hermes_agent.tasks_unblock_unsupported",
            "Only Hermes kanban tasks can be resumed on this backend.",
          );
        }
        if (!reply) {
          return resErr(
            id,
            "hermes_agent.tasks_unblock_invalid",
            "A reply is required before resuming the task.",
          );
        }
        const taskId = rawId.slice(KANBAN_TASK_ID_PREFIX.length);
        try {
          await kanbanRequest({
            wsUrl: url,
            token,
            useLoopbackHost: client.usedLoopbackHost,
            method: "POST",
            path: `/tasks/${encodeURIComponent(taskId)}/comments`,
            body: { body: reply, author: "hermes3d-user" },
          });
          await kanbanRequest({
            wsUrl: url,
            token,
            useLoopbackHost: client.usedLoopbackHost,
            method: "PATCH",
            path: `/tasks/${encodeURIComponent(taskId)}`,
            body: { status: "ready" },
          });

          let dispatchWarning = null;
          try {
            await kanbanRequest({
              wsUrl: url,
              token,
              useLoopbackHost: client.usedLoopbackHost,
              method: "POST",
              path: "/dispatch?max=1",
            });
          } catch (err) {
            dispatchWarning = `Task is ready, but the dispatcher could not be nudged: ${errorMessage(err)}`;
            log(`[hermes-agent] ${dispatchWarning}`);
          }

          const detail = await readKanbanTaskDetail(taskId);
          if (!detail) {
            return resErr(
              id,
              "hermes_agent.tasks_unblock_failed",
              "Task was resumed, but refreshed task details were unavailable.",
            );
          }
          return resOk(id, { ...detail, dispatchWarning });
        } catch (err) {
          return resErr(id, "hermes_agent.tasks_unblock_failed", errorMessage(err));
        }
      }

      case "tasks.activity": {
        const rawId = asString(p.id);
        if (!rawId.startsWith(KANBAN_TASK_ID_PREFIX)) {
          return resErr(
            id,
            "hermes_agent.tasks_activity_unsupported",
            "Only Hermes kanban tasks expose worker activity on this backend.",
          );
        }
        const taskId = rawId.slice(KANBAN_TASK_ID_PREFIX.length);
        const requestedTail = Number(p.tail);
        const tail = Number.isFinite(requestedTail)
          ? Math.max(1_000, Math.min(200_000, Math.round(requestedTail)))
          : 24_000;
        try {
          const result = await kanbanRequest({
            wsUrl: url,
            token,
            useLoopbackHost: client.usedLoopbackHost,
            method: "GET",
            path: `/tasks/${encodeURIComponent(taskId)}/log?tail=${tail}`,
          });
          return resOk(id, {
            taskId: rawId,
            exists: result?.exists !== false,
            sizeBytes: Number(result?.size_bytes) || 0,
            content: asString(result?.content),
          });
        } catch (err) {
          return resErr(id, "hermes_agent.tasks_activity_failed", errorMessage(err));
        }
      }

      case "tasks.create": {
        const mappedCreateBody = toKanbanCreateBody(p);
        const createBody = managedFleetMode
          ? toManagedFleetIntakeBody(mappedCreateBody)
          : mappedCreateBody;
        if (!createBody) {
          return resErr(
            id,
            "hermes_agent.tasks_create_invalid",
            "Task title is required.",
          );
        }
        try {
          let result = await kanbanRequest({
            wsUrl: url,
            token,
            useLoopbackHost: client.usedLoopbackHost,
            method: "POST",
            path: "/tasks",
            body: createBody,
          });
          let task = result?.task;
          const desiredStatus = managedFleetMode
            ? null
            : toKanbanPatchBody({ status: p.status }).status;
          if (
            task &&
            desiredStatus &&
            desiredStatus !== "ready" &&
            asString(task.status) !== desiredStatus
          ) {
            result = await kanbanRequest({
              wsUrl: url,
              token,
              useLoopbackHost: client.usedLoopbackHost,
              method: "PATCH",
              path: `/tasks/${encodeURIComponent(asString(task.id))}`,
              body: { status: desiredStatus },
            });
            task = result?.task;
          }
          const record = toHermes3dKanbanTaskRecord(task);
          if (!record) {
            return resErr(
              id,
              "hermes_agent.tasks_create_failed",
              "hermes-agent did not return the created task.",
            );
          }
          return resOk(id, record);
        } catch (err) {
          return resErr(id, "hermes_agent.tasks_create_failed", errorMessage(err));
        }
      }

      case "tasks.update": {
        const rawId = asString(p.id);
        if (!rawId.startsWith(KANBAN_TASK_ID_PREFIX)) {
          return resErr(
            id,
            "hermes_agent.tasks_update_unsupported",
            "Only Hermes kanban tasks can be updated on this backend.",
          );
        }
        const taskId = rawId.slice(KANBAN_TASK_ID_PREFIX.length);
        try {
          const mappedPatchBody = toKanbanPatchBody(p);
          const updateBody = managedFleetMode
            ? toManagedFleetPatchBody(mappedPatchBody)
            : mappedPatchBody;
          const result = await kanbanRequest({
            wsUrl: url,
            token,
            useLoopbackHost: client.usedLoopbackHost,
            method:
              managedFleetMode && Object.keys(updateBody).length === 0
                ? "GET"
                : "PATCH",
            path: `/tasks/${encodeURIComponent(taskId)}`,
            ...(Object.keys(updateBody).length > 0 ? { body: updateBody } : {}),
          });
          const record = toHermes3dKanbanTaskRecord(result?.task);
          if (!record) {
            return resErr(
              id,
              "hermes_agent.tasks_update_failed",
              "hermes-agent did not return the updated task.",
            );
          }
          return resOk(id, record);
        } catch (err) {
          return resErr(id, "hermes_agent.tasks_update_failed", errorMessage(err));
        }
      }

      case "tasks.dispatch": {
        if (managedFleetMode) {
          return resOk(id, {
            spawned: [],
            skipped: "managed-supervisor-owned",
          });
        }
        const requestedMax = Number(p.max);
        const max = Number.isFinite(requestedMax)
          ? Math.max(1, Math.min(32, Math.round(requestedMax)))
          : 8;
        try {
          const result = await kanbanRequest({
            wsUrl: url,
            token,
            useLoopbackHost: client.usedLoopbackHost,
            method: "POST",
            path: `/dispatch?max=${max}`,
          });
          return resOk(id, result);
        } catch (err) {
          return resErr(id, "hermes_agent.tasks_dispatch_failed", errorMessage(err));
        }
      }

      default:
        log(`[hermes-agent] unhandled method: ${method}`);
        return resOk(id, {});
    }
  };

  // --- virtual WebSocket surface -------------------------------------------

  upstream.send = (raw) => {
    let frame;
    try {
      frame = JSON.parse(String(raw ?? ""));
    } catch {
      return;
    }
    if (!frame || frame.type !== "req") return;

    const { id, method, params } = frame;
    const respond = (result) => emitFrame(result);

    if (method === "connect") {
      handleConnect(id).then(respond, (err) =>
        respond(resErr(id, "hermes_agent.connect_failed", errorMessage(err)))
      );
      return;
    }

    handleMethod(method, params, id).then(respond, (err) => {
      logError(`[hermes-agent] method "${method}" failed.`, err);
      respond(resErr(id, "hermes_agent.request_failed", errorMessage(err)));
    });
  };

  const stopOfficeSpeech = () => {
    officeSpeech?.close();
    officeSpeech = null;
  };

  upstream.close = (code, reason) => {
    closed = true;
    upstream.readyState = CLOSED;
    stopOfficeSpeech();
    client.close(code, reason);
  };

  upstream.terminate = () => {
    closed = true;
    upstream.readyState = CLOSED;
    stopOfficeSpeech();
    client.terminate();
  };

  client.on("ready", () => {
    upstream.readyState = OPEN;
    log(`[hermes-agent] JSON-RPC gateway ready at ${redactUrl(client.url)}`);
    upstream.emit("open");
  });

  client.on("close", (code, reason) => {
    closed = true;
    upstream.readyState = CLOSED;
    stopOfficeSpeech();
    upstream.emit("close", code, Buffer.from(String(reason ?? "")));
  });

  client.on("error", (err) => {
    upstream.emit("error", err);
  });

  client.connect();

  return upstream;
}

module.exports = {
  createHermesAgentUpstream,
  toHermes3dMessages,
  toHermes3dCronJobs,
  toHermes3dSchedule,
  toHermes3dAgents,
  resolveDefaultAgentId,
  requestSessionListWithRetry,
  isTransientStateDbUnavailable,
  MAIN_SESSION_KEY,
  AGENT_ID,
};
