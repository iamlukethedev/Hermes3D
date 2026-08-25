import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import { GatewayResponseError } from "@/lib/gateway/errors";
import type { TaskBoardCard, TaskBoardStatus } from "@/features/office/tasks/types";

export type GatewayTaskRecord = {
  id: string;
  title: string;
  description?: string | null;
  status: TaskBoardStatus;
  source?: TaskBoardCard["source"];
  sourceEventId?: string | null;
  assignedAgentId?: string | null;
  createdAt: string;
  updatedAt: string;
  playbookJobId?: string | null;
  runId?: string | null;
  channel?: string | null;
  externalThreadId?: string | null;
  lastActivityAt?: string | null;
  notes?: string[];
  archived?: boolean;
  /** Native Hermes status before it is collapsed into an office column. */
  nativeStatus?: string | null;
  /** Typed Hermes blocker category, for example `needs_input` or `capability`. */
  blockKind?: string | null;
  blockerReason?: string | null;
};

export type GatewayTasksListResult = {
  tasks: GatewayTaskRecord[];
};

export type GatewayTaskCreateInput = {
  title: string;
  description?: string;
  status?: TaskBoardStatus;
  assignedAgentId?: string | null;
  playbookJobId?: string | null;
  runId?: string | null;
  channel?: string | null;
  externalThreadId?: string | null;
  notes?: string[];
  source?: TaskBoardCard["source"];
  sourceEventId?: string | null;
  idempotencyKey?: string | null;
  maxRuntimeSeconds?: number | null;
  goalMode?: boolean;
  goalMaxTurns?: number | null;
  workspaceKind?: "scratch" | "dir" | "worktree";
  workspacePath?: string | null;
  projectId?: string | null;
};

export type GatewayTaskDispatchResult = {
  spawned?: unknown[];
  [key: string]: unknown;
};

export type GatewayTaskActivityResult = {
  taskId: string;
  exists: boolean;
  sizeBytes: number;
  content: string;
};

export type GatewayTaskComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string | null;
};

export type GatewayTaskDetailResult = {
  taskId: string;
  nativeStatus: string | null;
  blockKind: string | null;
  blockerReason: string | null;
  comments: GatewayTaskComment[];
  eventCount: number;
  runCount: number;
  /** The task was unblocked even if the best-effort dispatcher nudge failed. */
  dispatchWarning?: string | null;
};

export type GatewayTaskUpdateInput = {
  title?: string;
  description?: string;
  status?: TaskBoardStatus;
  assignedAgentId?: string | null;
  playbookJobId?: string | null;
  runId?: string | null;
  channel?: string | null;
  externalThreadId?: string | null;
  notes?: string[];
  archived?: boolean;
};

const trimOrUndefined = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
};

/**
 * Cards fed from a backend-managed board (hermes-agent's built-in kanban)
 * carry this id prefix. Their mutations must round-trip through the gateway
 * instead of the local shared store, or the next board refresh would fight a
 * divergent local copy.
 */
export const KANBAN_TASK_ID_PREFIX = "kanban:";

export const isKanbanManagedTaskId = (id: string): boolean =>
  id.startsWith(KANBAN_TASK_ID_PREFIX);

export const isUnsupportedTaskGatewayError = (error: unknown): boolean => {
  if (!(error instanceof GatewayResponseError)) return false;
  const code = error.code.trim().toUpperCase();
  const message = error.message.trim().toLowerCase();
  if (code === "METHOD_NOT_FOUND" || code === "NOT_IMPLEMENTED") return true;
  if (code !== "INVALID_REQUEST" && code !== "NOT_FOUND") {
    return message.includes("unknown method") || message.includes("not implemented");
  }
  return (
    message.includes("unknown method") ||
    message.includes("not implemented") ||
    message.includes("tasks.") ||
    message.includes("task ")
  );
};

export const listGatewayTasks = async (
  client: GatewayClient,
  params: { includeArchived?: boolean } = {}
): Promise<GatewayTasksListResult> => {
  return client.call<GatewayTasksListResult>("tasks.list", {
    includeArchived: params.includeArchived ?? true,
  });
};

export const createGatewayTask = async (
  client: GatewayClient,
  input: GatewayTaskCreateInput
): Promise<GatewayTaskRecord> => {
  const title = trimOrUndefined(input.title);
  if (!title) throw new Error("Task title is required.");
  return client.call<GatewayTaskRecord>("tasks.create", {
    title,
    ...(trimOrUndefined(input.description) ? { description: trimOrUndefined(input.description) } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.assignedAgentId !== undefined ? { assignedAgentId: input.assignedAgentId } : {}),
    ...(input.playbookJobId !== undefined ? { playbookJobId: input.playbookJobId } : {}),
    ...(input.runId !== undefined ? { runId: input.runId } : {}),
    ...(input.channel !== undefined ? { channel: trimOrUndefined(input.channel) ?? null } : {}),
    ...(input.externalThreadId !== undefined
      ? { externalThreadId: trimOrUndefined(input.externalThreadId) ?? null }
      : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.sourceEventId !== undefined ? { sourceEventId: input.sourceEventId } : {}),
    ...(input.idempotencyKey !== undefined
      ? { idempotencyKey: trimOrUndefined(input.idempotencyKey) ?? null }
      : {}),
    ...(input.maxRuntimeSeconds !== undefined
      ? { maxRuntimeSeconds: input.maxRuntimeSeconds }
      : {}),
    ...(input.goalMode !== undefined ? { goalMode: input.goalMode } : {}),
    ...(input.goalMaxTurns !== undefined
      ? { goalMaxTurns: input.goalMaxTurns }
      : {}),
    ...(input.workspaceKind !== undefined
      ? { workspaceKind: input.workspaceKind }
      : {}),
    ...(input.workspacePath !== undefined
      ? { workspacePath: trimOrUndefined(input.workspacePath) ?? null }
      : {}),
    ...(input.projectId !== undefined
      ? { projectId: trimOrUndefined(input.projectId) ?? null }
      : {}),
  });
};

export const getGatewayTaskActivity = async (
  client: GatewayClient,
  params: { id: string; tail?: number },
): Promise<GatewayTaskActivityResult> => {
  const id = trimOrUndefined(params.id);
  if (!id) throw new Error("Task id is required.");
  const requestedTail = params.tail ?? 24_000;
  const tail = Number.isFinite(requestedTail)
    ? Math.max(1_000, Math.min(200_000, Math.round(requestedTail)))
    : 24_000;
  return client.call<GatewayTaskActivityResult>("tasks.activity", { id, tail });
};

export const getGatewayTaskDetail = async (
  client: GatewayClient,
  id: string,
): Promise<GatewayTaskDetailResult> => {
  const taskId = trimOrUndefined(id);
  if (!taskId) throw new Error("Task id is required.");
  return client.call<GatewayTaskDetailResult>("tasks.show", { id: taskId });
};

export const commentGatewayTask = async (
  client: GatewayClient,
  params: { id: string; body: string },
): Promise<GatewayTaskDetailResult> => {
  const id = trimOrUndefined(params.id);
  const body = trimOrUndefined(params.body);
  if (!id) throw new Error("Task id is required.");
  if (!body) throw new Error("Comment is required.");
  return client.call<GatewayTaskDetailResult>("tasks.comment", { id, body });
};

export const replyAndResumeGatewayTask = async (
  client: GatewayClient,
  params: { id: string; reply: string },
): Promise<GatewayTaskDetailResult> => {
  const id = trimOrUndefined(params.id);
  const reply = trimOrUndefined(params.reply);
  if (!id) throw new Error("Task id is required.");
  if (!reply) throw new Error("A reply is required before resuming the task.");
  return client.call<GatewayTaskDetailResult>("tasks.unblock", { id, reply });
};

export const dispatchGatewayTasks = async (
  client: GatewayClient,
  params: { max?: number } = {},
): Promise<GatewayTaskDispatchResult> => {
  const requestedMax = params.max ?? 8;
  const max = Number.isFinite(requestedMax)
    ? Math.max(1, Math.min(32, Math.round(requestedMax)))
    : 8;
  return client.call<GatewayTaskDispatchResult>("tasks.dispatch", { max });
};

export const updateGatewayTask = async (
  client: GatewayClient,
  id: string,
  patch: GatewayTaskUpdateInput
): Promise<GatewayTaskRecord> => {
  const taskId = trimOrUndefined(id);
  if (!taskId) throw new Error("Task id is required.");
  return client.call<GatewayTaskRecord>("tasks.update", {
    id: taskId,
    ...(patch.title !== undefined ? { title: trimOrUndefined(patch.title) ?? "" } : {}),
    ...(patch.description !== undefined
      ? { description: trimOrUndefined(patch.description) ?? "" }
      : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.assignedAgentId !== undefined ? { assignedAgentId: patch.assignedAgentId } : {}),
    ...(patch.playbookJobId !== undefined ? { playbookJobId: patch.playbookJobId } : {}),
    ...(patch.runId !== undefined ? { runId: patch.runId } : {}),
    ...(patch.channel !== undefined ? { channel: trimOrUndefined(patch.channel) ?? null } : {}),
    ...(patch.externalThreadId !== undefined
      ? { externalThreadId: trimOrUndefined(patch.externalThreadId) ?? null }
      : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
  });
};

export const deleteGatewayTask = async (client: GatewayClient, id: string) => {
  const taskId = trimOrUndefined(id);
  if (!taskId) throw new Error("Task id is required.");
  return client.call<{ ok: boolean; removed?: boolean }>("tasks.delete", { id: taskId });
};
