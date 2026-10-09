/**
 * Kanban worker activity for the hermes-agent bridge.
 *
 * Agents in a hermes-agent backend do most of their unattended work as kanban
 * workers: the dispatcher claims a card and spawns a worker process for the
 * assignee profile. Those runs never touch the JSON-RPC gateway the office is
 * connected to, so without this module every character sits idle while the
 * team is busy.
 *
 * The kanban plugin already lists live workers per board
 * (`GET /api/plugins/kanban/workers/active`). This module polls it across every
 * board that has a running card and turns the difference between two polls
 * into run start / end notifications, keyed by the worker run, so the bridge
 * can drive the same `agent` lifecycle events a locally started chat produces.
 *
 * Read-only: nothing here changes a card, a run, or a board.
 */

const DEFAULT_KANBAN_ACTIVITY_INTERVAL_MS = 15_000;

const asTrimmed = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : "";

/**
 * Resolve the polling interval. `HERMES3D_KANBAN_ACTIVITY_INTERVAL_MS=0`
 * disables the watcher; anything unparsable falls back to the default.
 *
 * @param {Record<string, string | undefined>} [env]
 */
const resolveKanbanActivityIntervalMs = (env = process.env) => {
  const raw = asTrimmed(env?.HERMES3D_KANBAN_ACTIVITY_INTERVAL_MS);
  if (!raw) return DEFAULT_KANBAN_ACTIVITY_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_KANBAN_ACTIVITY_INTERVAL_MS;
  if (parsed === 0) return 0;
  // Never hammer the backend, whatever the configuration says.
  return Math.max(2_000, Math.floor(parsed));
};

/** Slugs of boards worth asking about: those reporting a running card. */
const boardsWithRunningWork = (boardsResponse) => {
  const boards = Array.isArray(boardsResponse?.boards) ? boardsResponse.boards : [];
  return boards
    .filter((board) => board && Number(board?.counts?.running) > 0)
    .map((board) => asTrimmed(board.slug))
    .filter(Boolean);
};

/**
 * Flatten `/workers/active` responses into activity records.
 *
 * A worker maps onto an office agent through its profile (falling back to the
 * card assignee); a worker whose profile the office does not show is dropped,
 * like a published speech turn for an unknown profile.
 *
 * @param {Array<{ board: string, response: any }>} perBoard
 * @param {Set<string>} knownAgentIds
 */
const toKanbanActivities = (perBoard, knownAgentIds) => {
  const activities = new Map();
  for (const { board, response } of perBoard) {
    const workers = Array.isArray(response?.workers) ? response.workers : [];
    for (const worker of workers) {
      if (!worker || typeof worker !== "object") continue;
      const agentId = asTrimmed(worker.profile) || asTrimmed(worker.task_assignee);
      if (!agentId || !knownAgentIds.has(agentId)) continue;
      const taskId = asTrimmed(worker.task_id);
      const runId = worker.run_id ?? "";
      if (!taskId) continue;
      const key = `kanban:${board}:${taskId}:${runId}`;
      activities.set(key, {
        key,
        agentId,
        board,
        taskId,
        title: asTrimmed(worker.task_title) || taskId,
        startedAtMs: Number(worker.started_at) > 0 ? Number(worker.started_at) * 1000 : null,
      });
    }
  }
  return activities;
};

/**
 * Compare two snapshots. Returns the runs that appeared and the ones that are
 * gone; both are lists of activity records.
 */
const diffKanbanActivities = (previous, next) => {
  const started = [];
  const ended = [];
  for (const [key, activity] of next) {
    if (!previous.has(key)) started.push(activity);
  }
  for (const [key, activity] of previous) {
    if (!next.has(key)) ended.push(activity);
  }
  return { started, ended };
};

/**
 * Poll kanban workers and report run start / end.
 *
 * A failed poll keeps the previous snapshot rather than ending every run, so a
 * slow or restarting backend does not make the whole office stand up at once.
 *
 * @param {{
 *   request: (path: string) => Promise<any>,
 *   getKnownAgentIds: () => Set<string>,
 *   onStart: (activity: any) => void,
 *   onEnd: (activity: any) => void,
 *   onStillActive?: (activity: any) => void,
 *   intervalMs?: number,
 *   initialDelayMs?: number,
 *   log?: (message: string) => void,
 * }} options
 */
const createKanbanActivityWatcher = ({
  request,
  getKnownAgentIds,
  onStart,
  onEnd,
  onStillActive = () => {},
  intervalMs = DEFAULT_KANBAN_ACTIVITY_INTERVAL_MS,
  initialDelayMs = 1_000,
  log = () => {},
}) => {
  let current = new Map();
  let timer = null;
  let firstPoll = null;
  let stopped = false;
  let inFlight = false;
  let lastErrorMessage = "";

  const poll = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const boards = boardsWithRunningWork(await request("/boards"));
      const perBoard = [];
      for (const board of boards) {
        const response = await request(
          `/workers/active?board=${encodeURIComponent(board)}`,
        );
        perBoard.push({ board, response });
      }
      if (stopped) return;
      const next = toKanbanActivities(perBoard, getKnownAgentIds());
      const { started, ended } = diffKanbanActivities(current, next);
      current = next;
      lastErrorMessage = "";
      const startedKeys = new Set(started.map((activity) => activity.key));
      for (const activity of ended) onEnd(activity);
      for (const activity of started) onStart(activity);
      // Re-announce runs that were already live. A browser that connected (or
      // finished loading its agents) after the start was sent would otherwise
      // never learn about it; repeating a start for the same run is idempotent.
      for (const activity of next.values()) {
        if (!startedKeys.has(activity.key)) onStillActive(activity);
      }
    } catch (err) {
      const message = err?.message || String(err);
      // Log once per distinct failure; a hidden kanban plugin would otherwise
      // fill the log every few seconds.
      if (message !== lastErrorMessage) {
        lastErrorMessage = message;
        log(`[kanban-activity] poll failed: ${message}`);
      }
    } finally {
      inFlight = false;
    }
  };

  const start = () => {
    if (stopped || timer || !(intervalMs > 0)) return;
    // Give the browser a moment to finish the handshake and load its agents.
    firstPoll = setTimeout(() => void poll(), Math.max(0, initialDelayMs));
    firstPoll.unref?.();
    timer = setInterval(() => void poll(), intervalMs);
    timer.unref?.();
  };

  const stop = () => {
    stopped = true;
    if (firstPoll) clearTimeout(firstPoll);
    if (timer) clearInterval(timer);
    firstPoll = null;
    timer = null;
  };

  return {
    start,
    stop,
    poll,
    /** Live runs as of the last successful poll. */
    snapshot: () => [...current.values()],
  };
};

module.exports = {
  DEFAULT_KANBAN_ACTIVITY_INTERVAL_MS,
  resolveKanbanActivityIntervalMs,
  boardsWithRunningWork,
  toKanbanActivities,
  diffKanbanActivities,
  createKanbanActivityWatcher,
};
