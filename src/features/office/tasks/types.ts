import type { EventFrame } from "@/lib/gateway/GatewayClient";

// The board mirrors the Hermes agent task lifecycle:
//   inbox            — request captured from any platform, not started yet.
//   scheduled        — queued for later by the cron scheduler / a playbook.
//   working          — the agent is actively executing (tools, terminal, subagents).
//   needs_attention  — blocked on a human: command approval, question, or an error.
//   done             — finished; may have produced a new skill for the learning loop.
export const TASK_BOARD_STATUSES = [
  "inbox",
  "scheduled",
  "working",
  "needs_attention",
  "done",
] as const;

export type TaskBoardStatus = (typeof TASK_BOARD_STATUSES)[number];

/** Statuses from the pre-Hermes board mapped onto the new lifecycle. */
const LEGACY_STATUS_MAP: Record<string, TaskBoardStatus> = {
  todo: "inbox",
  in_progress: "working",
  blocked: "needs_attention",
  review: "needs_attention",
};

export const TASK_BOARD_SOURCES = [
  "hermes_event",
  "hermes3d_manual",
  "playbook",
  "fallback_inferred",
] as const;

export type TaskBoardSource = (typeof TASK_BOARD_SOURCES)[number];

export type TaskBoardCard = {
  id: string;
  title: string;
  description: string;
  status: TaskBoardStatus;
  source: TaskBoardSource;
  sourceEventId: string | null;
  assignedAgentId: string | null;
  createdAt: string;
  updatedAt: string;
  playbookJobId: string | null;
  runId: string | null;
  /** Platform the request arrived from (telegram, discord, slack, cli, …). */
  channel: string | null;
  externalThreadId: string | null;
  lastActivityAt: string | null;
  notes: string[];
  isArchived: boolean;
  isInferred: boolean;
  /** LLM the Hermes agent used for this task (e.g. "hermes-4-405b"). */
  model: string | null;
  /** Skills the agent used or created while working on this task. */
  skills: string[];
  /** Number of isolated subagents spawned for parallel workstreams. */
  subagentCount: number;
  /** When a scheduled (cron/playbook) task is due to run, ISO timestamp. */
  scheduledFor: string | null;
  /** True when the learning loop distilled this task into a new skill. */
  learnedSkill: boolean;
};

export type TaskBoardPreference = {
  cards: TaskBoardCard[];
  selectedCardId: string | null;
};

export type TaskBoardPreferencePatch = {
  cards?: TaskBoardCard[];
  selectedCardId?: string | null;
};

export type TaskBoardExplicitEventKind =
  | "task_created"
  | "task_updated"
  | "task_status_changed"
  | "task_assigned"
  | "task_linked_to_run"
  | "task_deleted"
  | "task_archived"
  | "playbook_triggered";

export type TaskBoardExplicitEvent = {
  kind: TaskBoardExplicitEventKind;
  frame: EventFrame;
  taskId: string;
  title?: string | null;
  description?: string | null;
  status?: TaskBoardStatus | null;
  assignedAgentId?: string | null;
  playbookJobId?: string | null;
  runId?: string | null;
  channel?: string | null;
  externalThreadId?: string | null;
  occurredAt: string;
  sourceEventId: string;
  archived?: boolean;
};

export const defaultTaskBoardPreference = (): TaskBoardPreference => ({
  cards: [],
  selectedCardId: null,
});

export const isTaskBoardStatus = (value: unknown): value is TaskBoardStatus =>
  typeof value === "string" &&
  (TASK_BOARD_STATUSES as readonly string[]).includes(value);

/**
 * Maps any persisted status — current or legacy (todo, in_progress, blocked,
 * review) — onto the Hermes lifecycle. Returns null for unknown values.
 */
export const normalizeTaskBoardStatus = (
  value: unknown,
): TaskBoardStatus | null => {
  if (isTaskBoardStatus(value)) return value;
  if (typeof value === "string" && value in LEGACY_STATUS_MAP) {
    return LEGACY_STATUS_MAP[value];
  }
  return null;
};

export const isTaskBoardSource = (value: unknown): value is TaskBoardSource =>
  typeof value === "string" &&
  (TASK_BOARD_SOURCES as readonly string[]).includes(value);
