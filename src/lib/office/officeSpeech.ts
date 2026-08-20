/**
 * Office feed entries for turns driven from outside Hermes3D.
 *
 * A hermes-agent backend sends message events only to the client that started
 * the prompt, so chatting in the desktop app or the TUI leaves the office
 * blind. The companion plugin (`plugins/hermes3d-office-bridge`) republishes
 * each finished turn, the server bridge forwards it as an `office.speech`
 * gateway event, and this turns that event into the same kind of feed entry a
 * locally driven reply produces.
 *
 * Feeding the normal reply path is what makes the rest work for free: the 3D
 * scene already derives conversation huddles from reply activity, so agents
 * answering the same group message gather into a circle without any
 * conversation-specific plumbing here.
 */

export interface OfficeSpeechFeedEvent {
  id: string;
  name: string;
  text: string;
  ts: number;
  kind: "reply";
}

/**
 * A turn older than this is ignored. Reconnecting can replay a short backlog,
 * and stale speech would gather idle characters for a conversation that has
 * already finished.
 */
export const OFFICE_SPEECH_MAX_AGE_MS = 20_000;

interface ParseOptions {
  nowMs?: number;
  normalizeText?: (value: string) => string;
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/**
 * Validate an `office.speech` payload.
 *
 * Returns null for anything unusable — a missing agent, empty text, or a turn
 * that arrived too late to be worth animating.
 */
export const toOfficeSpeechFeedEvent = (
  payload: unknown,
  options: ParseOptions = {},
): OfficeSpeechFeedEvent | null => {
  const { nowMs = Date.now(), normalizeText = (value: string) => value.trim() } =
    options;

  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  const id = asString(record.agentId);
  if (!id) return null;

  const text = normalizeText(asString(record.text));
  if (!text) return null;

  const rawTs = record.atMs;
  const ts = typeof rawTs === "number" && Number.isFinite(rawTs) ? rawTs : nowMs;
  if (nowMs - ts > OFFICE_SPEECH_MAX_AGE_MS) return null;

  return {
    id,
    name: asString(record.name) || "Agent",
    text,
    ts,
    kind: "reply",
  };
};
