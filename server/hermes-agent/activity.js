/**
 * Build the observable, redacted activity feed shown for a Hermes Kanban run.
 *
 * The monitor intentionally excludes model reasoning fields and never forwards
 * complete tool results. It exposes the useful operational trace: visible
 * assistant output, tool names plus bounded safe arguments/results, and Kanban
 * lifecycle events.
 */

const ACTIVITY_ENTRY_LIMIT = 120;
const ASSISTANT_TEXT_LIMIT = 3_000;
const TOOL_TEXT_LIMIT = 500;

const asText = (value) => (typeof value === "string" ? value : "");

const redactActivityText = (value) => {
  let text = asText(value);
  if (!text) return "";
  const replacements = [
    [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]"],
    [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]"],
    [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_API_KEY]"],
    [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]"],
    [/(\bBearer\s+)[^\s,;"']+/gi, "$1[REDACTED]"],
    [/(https?:\/\/)[^\s/:@]+:[^\s/@]+@/gi, "$1[REDACTED]@"],
    [
      /(\b(?:access[_-]?token|auth[_-]?token|session[_-]?token|password|passwd|secret|api[_-]?key|connection[_-]?string)\s*[:=]\s*)(["']?)[^\s,;"'}]+\2/gi,
      "$1[REDACTED]",
    ],
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  return text;
};

const clip = (value, limit) => {
  const text = redactActivityText(value).trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

const toTimestampMs = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? Math.round(value * 1_000) : Math.round(value);
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return toTimestampMs(numeric);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const extractSessionId = (task, logContent) => {
  const taskSessionId = asText(task?.session_id).trim();
  if (taskSessionId) return taskSessionId;
  const match = asText(logContent).match(/(?:^|\r?\n)\s*session_id:\s*([^\s]+)\s*/i);
  return match?.[1]?.trim() || null;
};

const parseToolArguments = (toolCall) => {
  const raw = toolCall?.function?.arguments;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const describeToolCall = (toolCall) => {
  const name = asText(toolCall?.function?.name).trim() || "tool";
  const args = parseToolArguments(toolCall);
  if (!args) return name;

  const safeValue =
    args.command ??
    args.cmd ??
    args.path ??
    args.task_id ??
    args.taskId ??
    args.id ??
    args.query ??
    args.url ??
    null;
  if (typeof safeValue !== "string" && typeof safeValue !== "number") return name;
  const detail = clip(String(safeValue), TOOL_TEXT_LIMIT);
  return detail ? `${name}: ${detail}` : name;
};

const summarizeToolResult = (message) => {
  const name = asText(message?.tool_name).trim() || "tool";
  const raw = asText(message?.content);
  const firstUsefulLine = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  const preview = clip(firstUsefulLine || "completed", TOOL_TEXT_LIMIT);
  return `${name} result: ${preview}`;
};

const buildSessionActivityEntries = (messages) => {
  const entries = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || typeof message !== "object" || message.display_kind === "hidden") continue;
    const timestampMs = toTimestampMs(message.timestamp);
    if (message.role === "assistant") {
      const visible = clip(message.display_content || message.content, ASSISTANT_TEXT_LIMIT);
      if (visible) entries.push({ kind: "assistant", text: visible, timestampMs });
      for (const toolCall of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
        entries.push({ kind: "tool", text: describeToolCall(toolCall), timestampMs });
      }
      continue;
    }
    if (message.role === "tool") {
      entries.push({ kind: "tool", text: summarizeToolResult(message), timestampMs });
    }
  }
  return entries;
};

const describeKanbanEvent = (event) => {
  const kind = asText(event?.kind).trim().toLowerCase();
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const runId = event?.run_id ?? payload.run_id;
  const suffix = runId === null || runId === undefined ? "" : ` (run ${runId})`;
  if (kind === "created") return { kind: "progress", text: "Task entered the Hermes queue." };
  if (kind === "claimed") return { kind: "progress", text: `Worker claimed the task${suffix}.` };
  if (kind === "spawned") return { kind: "progress", text: `Worker process started${suffix}.` };
  if (kind === "heartbeat" && asText(payload.note).trim()) {
    return { kind: "progress", text: clip(payload.note, ASSISTANT_TEXT_LIMIT) };
  }
  if (kind === "blocked") {
    return {
      kind: "error",
      text: clip(payload.reason || "Task blocked.", ASSISTANT_TEXT_LIMIT),
    };
  }
  if (["failed", "timed_out", "cancelled"].includes(kind)) {
    return { kind: "error", text: `Task ${kind.replace("_", " ")}${suffix}.` };
  }
  if (["completed", "done", "review", "promoted"].includes(kind)) {
    return { kind: "progress", text: `Task ${kind}${suffix}.` };
  }
  return null;
};

const buildKanbanActivityEntries = (events) =>
  (Array.isArray(events) ? events : [])
    .map((event) => {
      const described = describeKanbanEvent(event);
      if (!described) return null;
      return { ...described, timestampMs: toTimestampMs(event.created_at) };
    })
    .filter(Boolean);

const mergeActivityEntries = (...groups) => {
  const seen = new Set();
  return groups
    .flat()
    .filter((entry) => {
      if (!entry?.text) return false;
      const key = `${entry.kind}:${entry.text}:${entry.timestampMs ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => (left.timestampMs ?? 0) - (right.timestampMs ?? 0))
    .slice(-ACTIVITY_ENTRY_LIMIT);
};

const buildActivityRevision = ({ logSize, events, messages }) => {
  const lastEvent = Array.isArray(events) ? events.at(-1) : null;
  const lastMessage = Array.isArray(messages) ? messages.at(-1) : null;
  return [
    Number(logSize) || 0,
    lastEvent?.id ?? "-",
    lastMessage?.id ?? lastMessage?.timestamp ?? "-",
    Array.isArray(messages) ? messages.length : 0,
  ].join(":");
};

module.exports = {
  redactActivityText,
  extractSessionId,
  buildSessionActivityEntries,
  buildKanbanActivityEntries,
  mergeActivityEntries,
  buildActivityRevision,
};
