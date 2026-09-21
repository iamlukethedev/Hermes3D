"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import type { AgentState } from "@/features/agents/state/store";
import {
  sortTaskBoardCards,
  taskBoardReducer,
} from "@/features/office/tasks/taskBoardState";
import {
  defaultTaskBoardPreference,
  normalizeTaskBoardStatus,
  type TaskBoardCard,
  type TaskBoardExplicitEvent,
  type TaskBoardSource,
  type TaskBoardStatus,
} from "@/features/office/tasks/types";
import type { RunRecord } from "@/features/office/hooks/useRunLog";
import { type OfficeStandupController } from "@/features/office/hooks/useOfficeStandupController";
import { buildStandupTaskCandidates } from "@/features/office/tasks/standupDispatch";
import type { StandupMeeting } from "@/lib/office/standup/types";
import { extractText, isHeartbeatPrompt } from "@/lib/text/message-extract";
import {
  formatCronPayload,
  formatCronSchedule,
  listCronJobs,
  type CronJobSummary,
} from "@/lib/cron/types";
import {
  parseAgentIdFromSessionKey,
  type EventFrame,
  type GatewayClient,
  type GatewayStatus,
} from "@/lib/gateway/GatewayClient";
import {
  resolveTaskBoardPreference,
  type StudioTaskBoardPreference,
} from "@/lib/studio/settings";
import type { StudioSettingsCoordinator } from "@/lib/studio/coordinator";
import {
  commentGatewayTask,
  createGatewayTask,
  dispatchGatewayTasks,
  getGatewayTaskDetail,
  isKanbanManagedTaskId,
  isUnsupportedTaskGatewayError,
  listGatewayTasks,
  replyAndResumeGatewayTask,
  updateGatewayTask,
  type GatewayTaskDetailResult,
  type GatewayTaskRecord,
  type GatewayTaskUpdateInput,
} from "@/lib/tasks/gateway";
import { fetchJson } from "@/lib/http";
import {
  archiveSharedTaskRecord,
  listSharedTaskRecords,
  TaskStoreRequestError,
  upsertSharedTaskRecord,
} from "@/lib/tasks/shared-store-client";
import type { SharedTaskRecord } from "@/lib/tasks/shared-store";
import { randomUUID } from "@/lib/uuid";

const TASK_EVENT_NAMES = new Set([
  "task_created",
  "task_updated",
  "task_status_changed",
  "task_assigned",
  "task_linked_to_run",
  "task_deleted",
  "task_archived",
  "playbook_triggered",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const stableIdFragment = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

const truncateTitle = (value: string, fallback: string) => {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const firstLine = trimmed.split("\n")[0]?.trim() ?? trimmed;
  if (firstLine.length <= 96) return firstLine;
  return `${firstLine.slice(0, 93).trimEnd()}...`;
};

const normalizeTaskRequestText = (value: string) =>
  value
    .replace(/^\s*>\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();

const TASK_REQUEST_PREFIX_RE =
  /^(?:please\s+|pls\s+|can you\s+|could you\s+|would you\s+|will you\s+|i need you to\s+|help me\s+|let'?s\s+)/i;

const TASK_REQUEST_VERB_RE =
  /\b(?:re[sc]?[ea]rch|check|find|look up|search|summarize|review|analy[sz]e|investigate|create|build|make|write|draft|plan|prepare|generate|fix|update|implement|refactor|debug|compare|collect|compile|send|schedule|call|message|reply|respond|explain|walk through|show me|give me|tell me|look into|set up|setup|deploy|configure|test|monitor|fetch|download|upload|add|remove|delete|clean|install|run|execute|list|describe|outline|figure out|sort out)\b/i;

const CONVERSATIONAL_MESSAGE_RE =
  /^(?:\?+|hi|hello|hey|yo|sup|ping|test|are you there|you there|still there|ok|okay|k|kk|yes|yeah|yep|no|nope|nah|thanks|thank you|thx|cool|nice|great|awesome|sounds good|got it|understood|roger|lol|what'?s up|how are you|good morning|good afternoon|good evening)[!.? ]*$/i;

const CONVERSATIONAL_QUESTION_RE =
  /^(?:are you there|you there|still there|can you hear me|hello\??|hi\??|how are you|what'?s up)[!.? ]*$/i;

export const isActionableTaskRequest = (value: string): boolean => {
  const text = normalizeTaskRequestText(value);
  if (!text) return false;
  if (isHeartbeatPrompt(text)) return false;

  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();

  if (!/[a-z0-9]/i.test(normalized)) return false;
  if (CONVERSATIONAL_MESSAGE_RE.test(normalized)) return false;
  if (CONVERSATIONAL_QUESTION_RE.test(normalized)) return false;
  if (normalized.length <= 3) return false;

  if (TASK_REQUEST_PREFIX_RE.test(normalized)) return true;
  if (TASK_REQUEST_VERB_RE.test(normalized)) return true;

  const words = normalized.split(" ").filter(Boolean);
  if (words.length <= 2) return false;

  if (
    /^(?:what|which|who|where|when|why|how)\b/.test(normalized) &&
    !/\b(?:status|progress|issue|problem|error|bug|latest|news|docs|documentation|plan|report|summary)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  // Enough substance to be a real request.
  if (words.length >= 4) return true;

  return /[?.!]$/.test(normalized) && words.length >= 3;
};

const makeCard = (
  input: Partial<TaskBoardCard> & Pick<TaskBoardCard, "id" | "title">,
): TaskBoardCard => {
  const nowIso = new Date().toISOString();
  return {
    id: input.id,
    title: input.title.trim() || "Untitled task",
    description: input.description?.trim() ?? "",
    status: input.status ?? "inbox",
    source: input.source ?? "hermes3d_manual",
    sourceEventId: input.sourceEventId ?? null,
    assignedAgentId: input.assignedAgentId ?? null,
    createdAt: input.createdAt ?? nowIso,
    updatedAt: input.updatedAt ?? nowIso,
    playbookJobId: input.playbookJobId ?? null,
    runId: input.runId ?? null,
    channel: input.channel ?? null,
    externalThreadId: input.externalThreadId ?? null,
    lastActivityAt: input.lastActivityAt ?? null,
    notes: input.notes ? [...input.notes] : [],
    isArchived: input.isArchived ?? false,
    isInferred: input.isInferred ?? false,
    model: input.model ?? null,
    skills: input.skills ? [...input.skills] : [],
    subagentCount: input.subagentCount ?? 0,
    scheduledFor: input.scheduledFor ?? null,
    learnedSkill: input.learnedSkill ?? false,
    nativeStatus: input.nativeStatus ?? null,
    blockKind: input.blockKind ?? null,
    blockerReason: input.blockerReason ?? null,
  };
};

const resolveAgentIdFromSession = (
  agents: AgentState[],
  sessionKey: string | null,
): string | null => {
  const trimmed = sessionKey?.trim() ?? "";
  if (!trimmed) return null;
  return (
    agents.find((agent) => agent.sessionKey === trimmed)?.agentId ??
    parseAgentIdFromSessionKey(trimmed)
  );
};

export const parseExplicitTaskEvent = (
  event: EventFrame,
): TaskBoardExplicitEvent | null => {
  if (!TASK_EVENT_NAMES.has(event.event)) return null;
  const payload = isRecord(event.payload) ? event.payload : {};
  const taskId =
    trimOrNull(payload.taskId) ??
    trimOrNull(payload.id) ??
    (event.event === "playbook_triggered"
      ? (trimOrNull(payload.playbookJobId) ?? trimOrNull(payload.jobId))
      : null);
  if (!taskId) return null;
  const sourceEventId = `${event.event}:${event.seq ?? stableIdFragment(JSON.stringify(payload))}`;
  return {
    kind: event.event as TaskBoardExplicitEvent["kind"],
    frame: event,
    taskId,
    title: trimOrNull(payload.title) ?? trimOrNull(payload.name),
    description: trimOrNull(payload.description) ?? trimOrNull(payload.text),
    status: normalizeTaskBoardStatus(payload.status),
    assignedAgentId:
      trimOrNull(payload.assignedAgentId) ??
      trimOrNull(payload.agentId) ??
      null,
    playbookJobId:
      trimOrNull(payload.playbookJobId) ?? trimOrNull(payload.jobId) ?? null,
    runId: trimOrNull(payload.runId),
    channel: trimOrNull(payload.channel),
    externalThreadId:
      trimOrNull(payload.externalThreadId) ??
      trimOrNull(payload.threadId) ??
      trimOrNull(payload.conversationId),
    occurredAt:
      trimOrNull(payload.occurredAt) ??
      trimOrNull(payload.timestamp) ??
      new Date().toISOString(),
    sourceEventId,
    archived:
      event.event === "task_archived" || event.event === "task_deleted"
        ? true
        : undefined,
  };
};

const buildCardFromExplicitEvent = (
  explicit: TaskBoardExplicitEvent,
  existing?: TaskBoardCard | null,
): TaskBoardCard => {
  const fallbackTitle =
    explicit.kind === "playbook_triggered" ? "Triggered playbook task" : "Task";
  return makeCard({
    ...(existing ?? {}),
    id: explicit.taskId,
    title: explicit.title ?? existing?.title ?? fallbackTitle,
    description: explicit.description ?? existing?.description ?? "",
    status:
      explicit.status ??
      existing?.status ??
      (explicit.kind === "playbook_triggered" ? "scheduled" : "inbox"),
    source:
      explicit.kind === "playbook_triggered" ? "playbook" : "hermes_event",
    sourceEventId: explicit.sourceEventId,
    assignedAgentId:
      explicit.assignedAgentId ?? existing?.assignedAgentId ?? null,
    createdAt: existing?.createdAt ?? explicit.occurredAt,
    updatedAt: explicit.occurredAt,
    playbookJobId: explicit.playbookJobId ?? existing?.playbookJobId ?? null,
    runId: explicit.runId ?? existing?.runId ?? null,
    channel: explicit.channel ?? existing?.channel ?? null,
    externalThreadId:
      explicit.externalThreadId ?? existing?.externalThreadId ?? null,
    lastActivityAt: explicit.occurredAt,
    notes: existing?.notes ?? [],
    isArchived: explicit.archived ?? existing?.isArchived ?? false,
    isInferred: false,
  });
};

const buildCardFromGatewayTask = (
  task: GatewayTaskRecord,
  existing?: TaskBoardCard | null,
): TaskBoardCard =>
  makeCard({
    ...(existing ?? {}),
    id: task.id,
    title: task.title,
    description: task.description ?? existing?.description ?? "",
    status: task.status,
    source: task.source ?? existing?.source ?? "hermes_event",
    sourceEventId: task.sourceEventId ?? existing?.sourceEventId ?? null,
    assignedAgentId: task.assignedAgentId ?? existing?.assignedAgentId ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    playbookJobId: task.playbookJobId ?? existing?.playbookJobId ?? null,
    runId: task.runId ?? existing?.runId ?? null,
    channel: task.channel ?? existing?.channel ?? null,
    externalThreadId:
      task.externalThreadId ?? existing?.externalThreadId ?? null,
    lastActivityAt:
      task.lastActivityAt ?? existing?.lastActivityAt ?? task.updatedAt,
    notes: task.notes ?? existing?.notes ?? [],
    isArchived: task.archived ?? existing?.isArchived ?? false,
    isInferred: false,
    nativeStatus: task.nativeStatus ?? existing?.nativeStatus ?? null,
    blockKind: task.blockKind ?? existing?.blockKind ?? null,
    blockerReason: task.blockerReason ?? existing?.blockerReason ?? null,
  });

const buildCardFromSharedTaskRecord = (
  task: SharedTaskRecord,
  existing?: TaskBoardCard | null,
): TaskBoardCard =>
  makeCard({
    ...(existing ?? {}),
    id: task.id,
    title: task.title,
    description: task.description ?? existing?.description ?? "",
    status: task.status,
    source: task.source ?? existing?.source ?? "hermes3d_manual",
    sourceEventId: task.sourceEventId ?? existing?.sourceEventId ?? null,
    assignedAgentId: task.assignedAgentId ?? existing?.assignedAgentId ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    playbookJobId: task.playbookJobId ?? existing?.playbookJobId ?? null,
    runId: task.runId ?? existing?.runId ?? null,
    channel: task.channel ?? existing?.channel ?? null,
    externalThreadId:
      task.externalThreadId ?? existing?.externalThreadId ?? null,
    lastActivityAt:
      task.lastActivityAt ?? existing?.lastActivityAt ?? task.updatedAt,
    notes: task.notes ?? existing?.notes ?? [],
    isArchived: task.isArchived ?? existing?.isArchived ?? false,
    isInferred: false,
  });

const cardTextKey = (card: Pick<TaskBoardCard, "title" | "assignedAgentId">) =>
  `${card.assignedAgentId ?? "-"}:${normalizeTaskRequestText(card.title).toLowerCase()}`;

const matchesExplicitCard = (
  candidate: TaskBoardCard,
  explicitCard: TaskBoardCard,
) => {
  if (candidate.id === explicitCard.id) return true;
  if (
    candidate.sourceEventId &&
    explicitCard.sourceEventId &&
    candidate.sourceEventId === explicitCard.sourceEventId
  ) {
    return true;
  }
  if (
    candidate.externalThreadId &&
    explicitCard.externalThreadId &&
    candidate.externalThreadId === explicitCard.externalThreadId
  ) {
    return true;
  }
  return cardTextKey(candidate) === cardTextKey(explicitCard);
};

const deriveChatRequestCard = (
  event: EventFrame,
  agents: AgentState[],
  options: {
    source: TaskBoardSource;
    isInferred: boolean;
  },
): TaskBoardCard | null => {
  if (event.event !== "chat") return null;
  const payload = isRecord(event.payload) ? event.payload : {};
  const sessionKey = trimOrNull(payload.sessionKey);
  const message = isRecord(payload.message) ? payload.message : null;
  const role = trimOrNull(message?.role);
  if (role !== "user") return null;
  const text = normalizeTaskRequestText(extractText(message)?.trim() ?? "");
  if (!isActionableTaskRequest(text)) return null;
  const agentId = resolveAgentIdFromSession(agents, sessionKey);
  if (!agentId) return null;
  const sequence = trimOrNull(payload.seq) ?? String(payload.seq ?? "");
  const id = `chat:${sessionKey ?? agentId}:${sequence || stableIdFragment(text)}`;
  const timestamp =
    trimOrNull((message ?? payload).timestamp) ??
    trimOrNull((message ?? payload).createdAt) ??
    new Date().toISOString();
  return makeCard({
    id,
    title: truncateTitle(text, "Incoming request"),
    description: text,
    status: "inbox",
    sourceEventId: id,
    assignedAgentId: agentId,
    createdAt: timestamp,
    updatedAt: timestamp,
    runId: trimOrNull(payload.runId),
    channel: trimOrNull(payload.channel),
    externalThreadId:
      trimOrNull(payload.threadId) ??
      trimOrNull(payload.conversationId) ??
      sessionKey,
    lastActivityAt: timestamp,
    source: options.source,
    isInferred: options.isInferred,
  });
};

export const deriveRecoveredAgentRequestCard = (
  agent: AgentState,
): TaskBoardCard | null => {
  const transcriptEntries = Array.isArray(agent.transcriptEntries)
    ? agent.transcriptEntries
    : [];
  for (let index = transcriptEntries.length - 1; index >= 0; index -= 1) {
    const entry = transcriptEntries[index];
    if (!entry || entry.role !== "user") continue;
    const text = normalizeTaskRequestText(entry.text);
    if (!isActionableTaskRequest(text)) continue;
    const timestamp =
      typeof entry.timestampMs === "number" &&
      Number.isFinite(entry.timestampMs)
        ? new Date(entry.timestampMs).toISOString()
        : typeof agent.lastActivityAt === "number" &&
            Number.isFinite(agent.lastActivityAt)
          ? new Date(agent.lastActivityAt).toISOString()
          : new Date().toISOString();
    const requestKey = `history:${agent.sessionKey}:${entry.sequenceKey}`;
    return makeCard({
      id: requestKey,
      title: truncateTitle(text, "Recovered request"),
      description: text,
      status: "inbox",
      source: "hermes_event",
      sourceEventId: requestKey,
      assignedAgentId: agent.agentId,
      createdAt: timestamp,
      updatedAt: timestamp,
      runId: entry.runId ?? agent.runId,
      externalThreadId: agent.sessionKey,
      lastActivityAt: timestamp,
      isInferred: false,
    });
  }

  const fallbackText = normalizeTaskRequestText(
    agent.lastUserMessage?.trim() ?? "",
  );
  if (!isActionableTaskRequest(fallbackText)) return null;
  const fallbackTimestamp =
    typeof agent.lastActivityAt === "number" &&
    Number.isFinite(agent.lastActivityAt)
      ? new Date(agent.lastActivityAt).toISOString()
      : new Date().toISOString();
  const fallbackKey = `history:${agent.sessionKey}:fallback:${stableIdFragment(
    `${fallbackText}:${fallbackTimestamp}`,
  )}`;
  return makeCard({
    id: fallbackKey,
    title: truncateTitle(fallbackText, "Recovered request"),
    description: fallbackText,
    status: "inbox",
    source: "hermes_event",
    sourceEventId: fallbackKey,
    assignedAgentId: agent.agentId,
    createdAt: fallbackTimestamp,
    updatedAt: fallbackTimestamp,
    runId: agent.runId,
    externalThreadId: agent.sessionKey,
    lastActivityAt: fallbackTimestamp,
    isInferred: false,
  });
};

export const deriveFallbackChatCard = (
  event: EventFrame,
  agents: AgentState[],
): TaskBoardCard | null =>
  deriveChatRequestCard(event, agents, {
    source: "fallback_inferred",
    isInferred: true,
  });

export const deriveLiveSessionTaskCard = (
  event: EventFrame,
  agents: AgentState[],
): TaskBoardCard | null =>
  deriveChatRequestCard(event, agents, {
    source: "hermes_event",
    isInferred: false,
  });

export const syncCardWithLinkedRun = (
  card: TaskBoardCard,
  runLog: RunRecord[],
): TaskBoardCard => {
  if (!card.runId) return card;
  const run = runLog.find((entry) => entry.runId === card.runId);
  if (!run) return card;
  const status: TaskBoardStatus =
    run.endedAt === null
      ? "working"
      : run.outcome === "error"
        ? "needs_attention"
        : "done";
  const updatedAt = new Date(run.endedAt ?? run.startedAt).toISOString();
  return {
    ...card,
    assignedAgentId: card.assignedAgentId ?? run.agentId,
    status,
    updatedAt,
    lastActivityAt: updatedAt,
  };
};

const syncCardWithAgent = (
  card: TaskBoardCard,
  agents: AgentState[],
): TaskBoardCard => {
  if (!card.assignedAgentId) return card;
  const agent = agents.find((entry) => entry.agentId === card.assignedAgentId);
  if (!agent) return card;
  if (agent.awaitingUserInput && card.status !== "done") {
    return {
      ...card,
      status: "needs_attention",
      lastActivityAt: new Date(
        agent.lastActivityAt ?? Date.now(),
      ).toISOString(),
    };
  }
  return card;
};

const compareDuplicatePriority = (
  left: TaskBoardCard,
  right: TaskBoardCard,
) => {
  const leftDone = left.status === "done" ? 1 : 0;
  const rightDone = right.status === "done" ? 1 : 0;
  if (leftDone !== rightDone) return rightDone - leftDone;
  const leftActive = left.status === "working" ? 1 : 0;
  const rightActive = right.status === "working" ? 1 : 0;
  if (leftActive !== rightActive) return rightActive - leftActive;
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
};

export const shouldDispatchCompletedStandup = (
  previous: { id: string; phase: string } | null,
  meeting: Pick<StandupMeeting, "id" | "phase" | "taskDispatch">,
) =>
  meeting.phase === "complete" &&
  meeting.taskDispatch?.status !== "dispatched" &&
  previous?.id === meeting.id &&
  previous.phase !== "complete";

/**
 * Only locally mirrored Hermes events need title-based de-duplication.
 * Backend Kanban cards already have stable ids and idempotency keys; treating
 * a fresh standup card as a duplicate of an older completed card archives the
 * real backend task while its worker is starting.
 */
export const findDuplicateMirroredTaskCardIds = (
  cards: TaskBoardCard[],
): string[] => {
  const grouped = new Map<string, TaskBoardCard[]>();
  for (const card of cards) {
    if (
      card.isArchived ||
      card.source !== "hermes_event" ||
      isKanbanManagedTaskId(card.id)
    ) {
      continue;
    }
    const titleKey = normalizeTaskRequestText(card.title).toLowerCase();
    if (!titleKey) continue;
    const groupKey = `${card.assignedAgentId ?? "-"}:${card.externalThreadId ?? "-"}:${titleKey}`;
    const matches = grouped.get(groupKey);
    if (matches) {
      matches.push(card);
    } else {
      grouped.set(groupKey, [card]);
    }
  }

  const duplicateIds: string[] = [];
  for (const matches of grouped.values()) {
    if (matches.length <= 1) continue;
    const sorted = [...matches].sort(compareDuplicatePriority);
    duplicateIds.push(...sorted.slice(1).map((card) => card.id));
  }
  return duplicateIds;
};

/**
 * Deduplicate cards for presentation on the task board.
 * When multiple cards share the exact same normalized title, assignee, and status column,
 * only the most recently updated / detailed card is shown.
 */
export const deduplicateTaskCards = (
  cards: TaskBoardCard[],
): TaskBoardCard[] => {
  const grouped = new Map<string, TaskBoardCard[]>();
  const passThrough: TaskBoardCard[] = [];

  for (const card of cards) {
    if (card.isArchived) continue;
    const titleKey = normalizeTaskRequestText(card.title).toLowerCase().trim();
    if (!titleKey) {
      passThrough.push(card);
      continue;
    }
    const groupKey = `${card.assignedAgentId ?? "-"}:${card.status}:${titleKey}`;
    const matches = grouped.get(groupKey);
    if (matches) {
      matches.push(card);
    } else {
      grouped.set(groupKey, [card]);
    }
  }

  const result: TaskBoardCard[] = [...passThrough];
  for (const matches of grouped.values()) {
    if (matches.length === 1) {
      result.push(matches[0]);
    } else {
      const sorted = [...matches].sort((a, b) => {
        const timeA = Date.parse(a.updatedAt || a.createdAt || "0") || 0;
        const timeB = Date.parse(b.updatedAt || b.createdAt || "0") || 0;
        if (timeB !== timeA) return timeB - timeA;
        if ((b.notes?.length ?? 0) !== (a.notes?.length ?? 0)) {
          return (b.notes?.length ?? 0) - (a.notes?.length ?? 0);
        }
        return b.id.localeCompare(a.id);
      });
      result.push(sorted[0]);
    }
  }
  return result;
};

const buildPlaybookCards = (
  jobs: CronJobSummary[],
  existingCards: TaskBoardCard[],
): TaskBoardCard[] =>
  jobs.map((job) => {
    const existing =
      existingCards.find((card) => card.playbookJobId === job.id) ??
      existingCards.find((card) => card.id === `playbook:${job.id}`) ??
      null;
    const jobState = job.state ?? {};
    const inferredStatus: TaskBoardStatus = jobState.runningAtMs
      ? "working"
      : jobState.lastStatus === "error"
        ? "needs_attention"
        : existing?.status === "done"
          ? "done"
          : "scheduled";
    return makeCard({
      ...(existing ?? {}),
      id: existing?.id ?? `playbook:${job.id}`,
      title: existing?.title ?? job.name,
      description:
        existing?.description ||
        `${formatCronSchedule(job.schedule)}\n${formatCronPayload(job.payload)}`,
      status: inferredStatus,
      source: "playbook",
      sourceEventId: existing?.sourceEventId ?? `cron:${job.id}`,
      assignedAgentId: existing?.assignedAgentId ?? job.agentId ?? null,
      createdAt: existing?.createdAt ?? new Date(job.updatedAtMs).toISOString(),
      updatedAt: new Date(job.updatedAtMs).toISOString(),
      playbookJobId: job.id,
      runId: existing?.runId ?? null,
      channel: existing?.channel ?? null,
      externalThreadId: existing?.externalThreadId ?? null,
      lastActivityAt: new Date(
        jobState.runningAtMs ?? jobState.lastRunAtMs ?? job.updatedAtMs,
      ).toISOString(),
      notes: existing?.notes ?? [],
      isArchived: existing?.isArchived ?? false,
      isInferred: true,
    });
  });

const buildStandupSeedCards = (
  standup: OfficeStandupController,
  existingCards: TaskBoardCard[],
): TaskBoardCard[] => {
  const config = standup.config;
  if (!config) return [];
  return Object.entries(config.manualByAgentId)
    .map(([agentId, entry]) => {
      const title = entry.currentTask.trim();
      const note = entry.note.trim();
      const blockers = entry.blockers.trim();
      if (!title && !note && !blockers) return null;
      const existing =
        existingCards.find((card) => card.id === `standup:${agentId}`) ?? null;
      const notes = [note, ...normalizeNoteLines(existing?.notes ?? [])];
      return makeCard({
        ...(existing ?? {}),
        id: existing?.id ?? `standup:${agentId}`,
        title:
          existing?.title ??
          truncateTitle(title || note || blockers, "Standup task"),
        description:
          existing?.description ||
          [title, blockers ? `Blockers: ${blockers}` : "", note]
            .filter(Boolean)
            .join("\n"),
        status:
          blockers.length > 0
            ? "needs_attention"
            : existing?.status === "done"
              ? "done"
              : (existing?.status ?? "inbox"),
        source: "fallback_inferred",
        sourceEventId: existing?.sourceEventId ?? `standup:${agentId}`,
        assignedAgentId: agentId,
        createdAt:
          existing?.createdAt ?? entry.updatedAt ?? new Date().toISOString(),
        updatedAt:
          entry.updatedAt ?? existing?.updatedAt ?? new Date().toISOString(),
        playbookJobId: existing?.playbookJobId ?? null,
        runId: existing?.runId ?? null,
        channel: existing?.channel ?? null,
        externalThreadId: existing?.externalThreadId ?? null,
        lastActivityAt: entry.updatedAt ?? existing?.lastActivityAt ?? null,
        notes,
        isArchived: existing?.isArchived ?? false,
        isInferred: true,
      });
    })
    .filter((card): card is TaskBoardCard => Boolean(card));
};

const normalizeNoteLines = (notes: string[]) =>
  notes
    .map((note) => note.trim())
    .filter(Boolean)
    .slice(0, 8);

type TaskCaptureDebugState = {
  lastStatus: "idle" | "detected" | "persisted" | "failed" | "unsupported";
  lastUpdatedAt: string | null;
  lastTitle: string | null;
  lastTaskId: string | null;
  lastSessionKey: string | null;
  lastMessage: string | null;
  detectedCount: number;
};

const buildActiveRunOptions = (runs: RunRecord[]) =>
  runs
    .filter((run) => run.endedAt === null)
    .map((run) => ({
      runId: run.runId,
      agentId: run.agentId,
      label: `${run.agentName} · ${run.trigger.toUpperCase()} · ${new Date(
        run.startedAt,
      ).toLocaleTimeString()}`,
    }));

export const useTaskBoardController = ({
  gatewayUrl,
  settingsCoordinator,
  client,
  status,
  cronEnabled = true,
  agents,
  runLog,
  standup,
}: {
  gatewayUrl: string;
  settingsCoordinator: StudioSettingsCoordinator;
  client: GatewayClient;
  status: GatewayStatus;
  cronEnabled?: boolean;
  agents: AgentState[];
  runLog: RunRecord[];
  standup: OfficeStandupController;
}) => {
  const [state, dispatch] = useReducer(
    taskBoardReducer,
    defaultTaskBoardPreference(),
  );
  const stateRef = useRef(state);
  const refreshStandupMeeting = standup.refreshMeeting;
  const hydratedRef = useRef(false);
  const recoveredAgentRequestKeyRef = useRef<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [cronJobs, setCronJobs] = useState<CronJobSummary[]>([]);
  const [cronLoading, setCronLoading] = useState(false);
  const [cronError, setCronError] = useState<string | null>(null);
  const [sharedTasksLoading, setSharedTasksLoading] = useState(false);
  const [sharedTasksError, setSharedTasksError] = useState<string | null>(null);
  const [sharedTasksSupported, setSharedTasksSupported] = useState(true);
  const [taskCaptureDebug, setTaskCaptureDebug] =
    useState<TaskCaptureDebugState>({
      lastStatus: "idle",
      lastUpdatedAt: null,
      lastTitle: null,
      lastTaskId: null,
      lastSessionKey: null,
      lastMessage: null,
      detectedCount: 0,
    });
  const [gatewayTasksLoading, setGatewayTasksLoading] = useState(false);
  const [gatewayTasksError, setGatewayTasksError] = useState<string | null>(
    null,
  );
  const [gatewayTasksSupported, setGatewayTasksSupported] = useState<
    "unknown" | "supported" | "unsupported"
  >("unknown");
  const sharedRefreshInFlightRef = useRef(false);
  const lastPersistedTaskBoardSnapshotRef = useRef<string | null>(null);
  const observedStandupMeetingRef = useRef<{
    id: string;
    phase: string;
  } | null>(null);
  const dispatchingStandupMeetingIdRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const archiveMatchingInferredCards = useCallback(
    (explicitCard: TaskBoardCard) => {
      for (const card of stateRef.current.cards) {
        if (!card.isInferred || card.isArchived) continue;
        if (!matchesExplicitCard(card, explicitCard)) continue;
        dispatch({
          type: "update",
          cardId: card.id,
          patch: {
            isArchived: true,
            updatedAt: explicitCard.updatedAt,
          },
        });
      }
    },
    [],
  );

  const applyGatewayTaskRecord = useCallback(
    (task: GatewayTaskRecord) => {
      const existing =
        stateRef.current.cards.find((card) => card.id === task.id) ?? null;
      const nextCard = buildCardFromGatewayTask(task, existing);
      dispatch({ type: "upsert", card: nextCard });
      archiveMatchingInferredCards(nextCard);
      return nextCard;
    },
    [archiveMatchingInferredCards],
  );

  const applySharedTaskRecord = useCallback(
    (task: SharedTaskRecord) => {
      const existing =
        stateRef.current.cards.find((card) => card.id === task.id) ?? null;
      const nextCard = buildCardFromSharedTaskRecord(task, existing);
      dispatch({ type: "upsert", card: nextCard });
      archiveMatchingInferredCards(nextCard);
      return nextCard;
    },
    [archiveMatchingInferredCards],
  );

  const persistLiveSessionTask = useCallback(
    async (task: TaskBoardCard) => {
      if (!sharedTasksSupported) return;
      try {
        const saved = await upsertSharedTaskRecord({
          ...task,
          id: task.id,
          title: task.title,
          source: "hermes_event",
          sourceEventId: task.sourceEventId ?? task.id,
          isInferred: false,
        });
        applySharedTaskRecord(saved);
        setTaskCaptureDebug((current) => ({
          ...current,
          lastStatus: "persisted",
          lastUpdatedAt: saved.updatedAt,
          lastTitle: saved.title,
          lastTaskId: saved.id,
          lastSessionKey: saved.externalThreadId,
          lastMessage: "Inbound request persisted to shared task store.",
        }));
      } catch (error) {
        if (error instanceof TaskStoreRequestError && error.status === 404) {
          setSharedTasksSupported(false);
          setSharedTasksError(
            "Shared task store route is unavailable. Restart the dev server to enable task sync.",
          );
          setTaskCaptureDebug((current) => ({
            ...current,
            lastStatus: "unsupported",
            lastUpdatedAt: new Date().toISOString(),
            lastTitle: task.title,
            lastTaskId: task.id,
            lastSessionKey: task.externalThreadId,
            lastMessage: "Shared task store route is unavailable.",
          }));
          return;
        }
        setSharedTasksError(
          error instanceof Error
            ? error.message
            : "Failed to sync live request into shared task store.",
        );
        setTaskCaptureDebug((current) => ({
          ...current,
          lastStatus: "failed",
          lastUpdatedAt: new Date().toISOString(),
          lastTitle: task.title,
          lastTaskId: task.id,
          lastSessionKey: task.externalThreadId,
          lastMessage:
            error instanceof Error
              ? error.message
              : "Failed to sync live request into shared task store.",
        }));
      }
    },
    [applySharedTaskRecord, sharedTasksSupported],
  );

  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    setLoading(true);
    const task = async () => {
      const settings = await settingsCoordinator.loadSettings({ maxAgeMs: 0 });
      const preference: StudioTaskBoardPreference = settings
        ? resolveTaskBoardPreference(settings, gatewayUrl)
        : defaultTaskBoardPreference();
      if (cancelled) return;
      dispatch({ type: "hydrate", preference });
      hydratedRef.current = true;
      setLoading(false);
    };
    void task().catch((error) => {
      if (cancelled) return;
      console.error("Failed to load task board settings.", error);
      dispatch({ type: "hydrate", preference: defaultTaskBoardPreference() });
      hydratedRef.current = true;
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [gatewayUrl, settingsCoordinator]);

  useEffect(() => {
    if (!hydratedRef.current || !gatewayUrl.trim()) return;
    const nextSnapshot = JSON.stringify({
      gatewayUrl,
      cards: state.cards,
      selectedCardId: state.selectedCardId,
    });
    if (lastPersistedTaskBoardSnapshotRef.current === nextSnapshot) {
      return;
    }
    lastPersistedTaskBoardSnapshotRef.current = nextSnapshot;
    settingsCoordinator.schedulePatch(
      {
        taskBoard: {
          [gatewayUrl]: {
            cards: state.cards,
            selectedCardId: state.selectedCardId,
          },
        },
      },
      150,
    );
  }, [gatewayUrl, settingsCoordinator, state.cards, state.selectedCardId]);

  const refreshCronJobs = useCallback(async () => {
    if (!cronEnabled || status !== "connected") {
      setCronJobs([]);
      setCronError(null);
      setCronLoading(false);
      return;
    }
    setCronLoading(true);
    setCronError(null);
    try {
      const result = await listCronJobs(client, { includeDisabled: true });
      setCronJobs(result.jobs);
    } catch (error) {
      setCronError(
        error instanceof Error ? error.message : "Failed to load playbooks.",
      );
    } finally {
      setCronLoading(false);
    }
  }, [client, cronEnabled, status]);

  const refreshSharedTasks = useCallback(async () => {
    if (!sharedTasksSupported) {
      setSharedTasksLoading(false);
      return;
    }
    if (sharedRefreshInFlightRef.current) return;
    sharedRefreshInFlightRef.current = true;
    setSharedTasksLoading(true);
    setSharedTasksError(null);
    try {
      const tasks = await listSharedTaskRecords();
      setSharedTasksSupported(true);
      for (const task of tasks) {
        applySharedTaskRecord(task);
      }
    } catch (error) {
      if (error instanceof TaskStoreRequestError && error.status === 404) {
        setSharedTasksSupported(false);
        setSharedTasksError(
          "Shared task store route is unavailable. Restart the dev server to enable task sync.",
        );
        return;
      }
      setSharedTasksError(
        error instanceof Error
          ? error.message
          : "Failed to load shared task store.",
      );
    } finally {
      sharedRefreshInFlightRef.current = false;
      setSharedTasksLoading(false);
    }
  }, [applySharedTaskRecord, sharedTasksSupported]);

  const refreshRemoteTasks = useCallback(async () => {
    if (status !== "connected") {
      setGatewayTasksLoading(false);
      setGatewayTasksError(null);
      return;
    }
    setGatewayTasksLoading(true);
    setGatewayTasksError(null);
    try {
      const result = await listGatewayTasks(client, { includeArchived: true });
      setGatewayTasksSupported("supported");
      for (const task of result.tasks) {
        applyGatewayTaskRecord(task);
      }
    } catch (error) {
      if (isUnsupportedTaskGatewayError(error)) {
        setGatewayTasksSupported("unsupported");
        setGatewayTasksError(null);
        return;
      }
      setGatewayTasksError(
        error instanceof Error
          ? error.message
          : "Failed to load tasks from Hermes.",
      );
    } finally {
      setGatewayTasksLoading(false);
    }
  }, [applyGatewayTaskRecord, client, status]);

  const saveStandupTaskDispatch = useCallback(
    async (taskDispatch: {
      status: "pending" | "queueing" | "dispatched" | "failed";
      queuedAgentIds: string[];
      blockedAgentIds: string[];
      error: string | null;
    }) => {
      await fetchJson("/api/office/standup/meeting", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "task_dispatch", taskDispatch }),
      });
      await refreshStandupMeeting();
    },
    [refreshStandupMeeting],
  );

  useEffect(() => {
    void refreshCronJobs();
  }, [refreshCronJobs]);

  useEffect(() => {
    void refreshSharedTasks();
  }, [refreshSharedTasks]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshSharedTasks();
    }, 4_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshSharedTasks]);

  useEffect(() => {
    void refreshRemoteTasks();
  }, [refreshRemoteTasks]);

  useEffect(() => {
    const meeting = standup.meeting;
    if (!meeting) {
      observedStandupMeetingRef.current = null;
      return;
    }
    if (meeting.phase !== "complete") {
      observedStandupMeetingRef.current = {
        id: meeting.id,
        phase: meeting.phase,
      };
      return;
    }

    const previous = observedStandupMeetingRef.current;
    const reachedCompletionHere = shouldDispatchCompletedStandup(previous, meeting);
    if (!reachedCompletionHere) {
      // A restart is a read-only reconnection. Never replay an old pending or
      // failed handoff merely because the browser mounted again; an operator
      // must explicitly retry it from the durable Kanban state.
      observedStandupMeetingRef.current = { id: meeting.id, phase: meeting.phase };
      return;
    }
    if (meeting.taskDispatch?.status === "dispatched") {
      observedStandupMeetingRef.current = { id: meeting.id, phase: meeting.phase };
      return;
    }
    // Preserve the active-phase observation until the gateway reconnects so a
    // brief disconnect at the end of standup does not lose the handoff.
    if (status !== "connected") return;
    if (dispatchingStandupMeetingIdRef.current === meeting.id) return;

    observedStandupMeetingRef.current = { id: meeting.id, phase: meeting.phase };
    dispatchingStandupMeetingIdRef.current = meeting.id;
    void (async () => {
      const queuedAgentIds: string[] = [];
      const blockedAgentIds: string[] = [];
      const errors: string[] = [];
      try {
        await saveStandupTaskDispatch({
          status: "queueing",
          queuedAgentIds,
          blockedAgentIds,
          error: null,
        });
        const candidates = buildStandupTaskCandidates(meeting);
        for (const candidate of candidates) {
          const existingCard = stateRef.current.cards.find(
            (c) =>
              !c.isArchived &&
              c.status !== "done" &&
              c.assignedAgentId === candidate.agentId &&
              c.sourceEventId === candidate.input.sourceEventId,
          );
          if (existingCard) {
            try {
              const updated = await updateGatewayTask(client, existingCard.id, {
                description: candidate.input.description,
                status: candidate.input.status,
              });
              applyGatewayTaskRecord(updated);
              queuedAgentIds.push(candidate.agentId);
              if (candidate.blocked) blockedAgentIds.push(candidate.agentId);
            } catch (error) {
              errors.push(
                `${candidate.agentId}: ${
                  error instanceof Error ? error.message : "Task update failed."
                }`,
              );
              queuedAgentIds.push(candidate.agentId);
              if (candidate.blocked) blockedAgentIds.push(candidate.agentId);
            }
            continue;
          }
          try {
            const task = await createGatewayTask(client, candidate.input);
            applyGatewayTaskRecord(task);
            queuedAgentIds.push(candidate.agentId);
            if (candidate.blocked) blockedAgentIds.push(candidate.agentId);
          } catch (error) {
            errors.push(
              `${candidate.agentId}: ${
                error instanceof Error ? error.message : "Task creation failed."
              }`,
            );
          }
        }

        const runnableCount = queuedAgentIds.length - blockedAgentIds.length;
        if (runnableCount > 0) {
          try {
            await dispatchGatewayTasks(client, { max: runnableCount });
          } catch (error) {
            errors.push(
              error instanceof Error
                ? `Dispatcher: ${error.message}`
                : "Dispatcher could not be started.",
            );
          }
        }
        await saveStandupTaskDispatch({
          status: errors.length > 0 ? "failed" : "dispatched",
          queuedAgentIds,
          blockedAgentIds,
          error: errors.length > 0 ? errors.join(" ") : null,
        });
        await refreshRemoteTasks();
      } catch (error) {
        setGatewayTasksError(
          error instanceof Error
            ? error.message
            : "Failed to dispatch standup tasks.",
        );
        try {
          await saveStandupTaskDispatch({
            status: "failed",
            queuedAgentIds,
            blockedAgentIds,
            error:
              error instanceof Error
                ? error.message
                : "Failed to dispatch standup tasks.",
          });
        } catch {}
      } finally {
        if (dispatchingStandupMeetingIdRef.current === meeting.id) {
          dispatchingStandupMeetingIdRef.current = null;
        }
      }
    })();
  }, [
    applyGatewayTaskRecord,
    client,
    refreshRemoteTasks,
    saveStandupTaskDispatch,
    standup.meeting,
    status,
  ]);

  // Backend-managed boards (hermes kanban) change from outside this client —
  // workers claim tasks, the dispatcher completes them — so keep polling while
  // the gateway actually serves tasks.
  useEffect(() => {
    if (gatewayTasksSupported !== "supported" || status !== "connected") return;
    const intervalId = window.setInterval(() => {
      void refreshRemoteTasks();
    }, 12_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [gatewayTasksSupported, refreshRemoteTasks, status]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const playbookCards = buildPlaybookCards(cronJobs, stateRef.current.cards);
    const standupCards = buildStandupSeedCards(standup, stateRef.current.cards);
    if (playbookCards.length === 0 && standupCards.length === 0) return;
    dispatch({
      type: "upsertMany",
      cards: [...playbookCards, ...standupCards],
    });
  }, [cronJobs, standup]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const nextCards = stateRef.current.cards.map((card) =>
      syncCardWithAgent(syncCardWithLinkedRun(card, runLog), agents),
    );
    const changed = nextCards.some(
      (card, index) => card !== stateRef.current.cards[index],
    );
    if (!changed) return;
    dispatch({
      type: "hydrate",
      preference: { ...stateRef.current, cards: sortTaskBoardCards(nextCards) },
    });
  }, [agents, runLog]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    for (const agent of agents) {
      const recoveredTask = deriveRecoveredAgentRequestCard(agent);
      if (!recoveredTask) continue;
      const requestKey = recoveredTask.sourceEventId ?? recoveredTask.id;
      if (recoveredAgentRequestKeyRef.current[agent.agentId] === requestKey) {
        continue;
      }
      recoveredAgentRequestKeyRef.current[agent.agentId] = requestKey;
      const hasPersistedMatch = stateRef.current.cards.some(
        (card) =>
          !card.isInferred &&
          !card.isArchived &&
          matchesExplicitCard(recoveredTask, card),
      );
      setTaskCaptureDebug((current) => ({
        lastStatus: hasPersistedMatch ? current.lastStatus : "detected",
        lastUpdatedAt: recoveredTask.updatedAt,
        lastTitle: recoveredTask.title,
        lastTaskId: recoveredTask.id,
        lastSessionKey: recoveredTask.externalThreadId,
        lastMessage: hasPersistedMatch
          ? "Recovered request already exists on the board."
          : "Recovered latest user request from agent history/state.",
        detectedCount: hasPersistedMatch
          ? current.detectedCount
          : current.detectedCount + 1,
      }));
      if (hasPersistedMatch) continue;
      dispatch({ type: "upsert", card: recoveredTask });
      void persistLiveSessionTask(recoveredTask);
    }
  }, [agents, persistLiveSessionTask]);

  const selectCard = useCallback((cardId: string | null) => {
    dispatch({ type: "select", cardId });
  }, []);

  const createManualCard = useCallback(
    async (input?: Partial<TaskBoardCard>) => {
      const card = makeCard({
        id: `manual:${randomUUID()}`,
        title: input?.title?.trim() || "New task",
        description: input?.description ?? "",
        status: input?.status ?? "inbox",
        source: "hermes3d_manual",
        assignedAgentId: input?.assignedAgentId ?? null,
        playbookJobId: input?.playbookJobId ?? null,
        runId: input?.runId ?? null,
        channel: input?.channel ?? null,
        externalThreadId: input?.externalThreadId ?? null,
        notes: input?.notes ?? [],
        isInferred: false,
      });
      try {
        const saved = await upsertSharedTaskRecord({
          ...card,
          isInferred: false,
        });
        const nextCard = applySharedTaskRecord(saved);
        dispatch({ type: "select", cardId: nextCard.id });
        return nextCard;
      } catch (error) {
        setSharedTasksError(
          error instanceof Error
            ? error.message
            : "Failed to create task in shared store.",
        );
        dispatch({ type: "upsert", card });
        dispatch({ type: "select", cardId: card.id });
        return card;
      }
    },
    [applySharedTaskRecord],
  );

  // Kanban cards live on the hermes backend; writing them to the shared file
  // store would create a divergent local copy that the next board refresh
  // fights. Round-trip the patch through the gateway and apply its truth.
  const persistKanbanCardPatch = useCallback(
    async (
      cardId: string,
      patch: GatewayTaskUpdateInput,
      revertCard: TaskBoardCard,
    ) => {
      try {
        const updated = await updateGatewayTask(client, cardId, patch);
        applyGatewayTaskRecord(updated);
      } catch (error) {
        dispatch({ type: "upsert", card: revertCard });
        setGatewayTasksError(
          error instanceof Error
            ? error.message
            : "Failed to update the Hermes kanban task.",
        );
      }
    },
    [applyGatewayTaskRecord, client],
  );

  const loadTaskDetail = useCallback(
    async (cardId: string): Promise<GatewayTaskDetailResult> => {
      return getGatewayTaskDetail(client, cardId);
    },
    [client],
  );

  const addTaskComment = useCallback(
    async (cardId: string, body: string): Promise<GatewayTaskDetailResult> => {
      return commentGatewayTask(client, { id: cardId, body });
    },
    [client],
  );

  const replyAndResumeTask = useCallback(
    async (cardId: string, reply: string): Promise<GatewayTaskDetailResult> => {
      const detail = await replyAndResumeGatewayTask(client, {
        id: cardId,
        reply,
      });
      await refreshRemoteTasks();
      return detail;
    },
    [client, refreshRemoteTasks],
  );

  const updateCard = useCallback(
    async (cardId: string, patch: Partial<TaskBoardCard>) => {
      const existing =
        stateRef.current.cards.find((card) => card.id === cardId) ?? null;
      dispatch({ type: "update", cardId, patch });
      if (!existing || existing.isInferred) return;
      if (isKanbanManagedTaskId(cardId)) {
        await persistKanbanCardPatch(
          cardId,
          {
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.description !== undefined
              ? { description: patch.description }
              : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.assignedAgentId !== undefined
              ? { assignedAgentId: patch.assignedAgentId }
              : {}),
            ...(patch.isArchived !== undefined
              ? { archived: patch.isArchived }
              : {}),
          },
          existing,
        );
        return;
      }
      try {
        const updated = await upsertSharedTaskRecord({
          ...existing,
          ...patch,
          id: cardId,
          title: (patch.title ?? existing.title).trim() || existing.title,
          updatedAt: new Date().toISOString(),
          isInferred: false,
        });
        applySharedTaskRecord(updated);
      } catch (error) {
        dispatch({ type: "upsert", card: existing });
        setSharedTasksError(
          error instanceof Error
            ? error.message
            : "Failed to update task in shared store.",
        );
      }
    },
    [applySharedTaskRecord, persistKanbanCardPatch],
  );

  const moveCard = useCallback(
    async (cardId: string, nextStatus: TaskBoardStatus) => {
      const existing =
        stateRef.current.cards.find((card) => card.id === cardId) ?? null;
      dispatch({ type: "move", cardId, status: nextStatus });
      if (!existing || existing.isInferred) return;
      if (isKanbanManagedTaskId(cardId)) {
        await persistKanbanCardPatch(cardId, { status: nextStatus }, existing);
        return;
      }
      try {
        const updated = await upsertSharedTaskRecord({
          ...existing,
          id: cardId,
          title: existing.title,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
          isInferred: false,
        });
        applySharedTaskRecord(updated);
      } catch (error) {
        dispatch({ type: "upsert", card: existing });
        setSharedTasksError(
          error instanceof Error
            ? error.message
            : "Failed to move task in shared store.",
        );
      }
    },
    [applySharedTaskRecord, persistKanbanCardPatch],
  );

  const removeCard = useCallback(
    async (cardId: string) => {
      const existing =
        stateRef.current.cards.find((card) => card.id === cardId) ?? null;
      if (!existing) return;
      if (existing.isInferred) {
        dispatch({
          type: "update",
          cardId,
          patch: {
            isArchived: true,
            updatedAt: new Date().toISOString(),
          },
        });
        return;
      }
      dispatch({ type: "update", cardId, patch: { isArchived: true } });
      if (isKanbanManagedTaskId(cardId)) {
        await persistKanbanCardPatch(cardId, { archived: true }, existing);
        return;
      }
      try {
        const archived = await archiveSharedTaskRecord(cardId);
        applySharedTaskRecord(archived);
      } catch (error) {
        dispatch({ type: "upsert", card: existing });
        setSharedTasksError(
          error instanceof Error
            ? error.message
            : "Failed to archive task in shared store.",
        );
      }
    },
    [applySharedTaskRecord, persistKanbanCardPatch],
  );

  const lastDedupeSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hydratedRef.current) return;
    // Patch Hermes Phase 2: snapshot guard prevents re-entering the dedupe
    // loop when state.cards is replaced by a structurally-identical array
    // (upstream dispatch churn). Without this, the effect dispatches
    // `upsert` to mark duplicates archived → state.cards new ref →
    // effect re-runs → "Maximum update depth exceeded" in dev mode.
    const snapshot = JSON.stringify(
      stateRef.current.cards
        .filter(
          (card) =>
            !card.isArchived &&
            card.source === "hermes_event" &&
            !isKanbanManagedTaskId(card.id),
        )
        .map((card) => ({
          id: card.id,
          title: card.title,
          assignedAgentId: card.assignedAgentId ?? null,
          externalThreadId: card.externalThreadId ?? null,
        })),
    );
    if (lastDedupeSnapshotRef.current === snapshot) return;
    lastDedupeSnapshotRef.current = snapshot;
    for (const duplicateId of findDuplicateMirroredTaskCardIds(
      stateRef.current.cards,
    )) {
      void updateCard(duplicateId, {
        isArchived: true,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [state.cards, updateCard]);

  const ingestGatewayEvent = useCallback(
    (event: EventFrame) => {
      const explicit = parseExplicitTaskEvent(event);
      if (explicit) {
        setGatewayTasksSupported("supported");
        if (explicit.kind === "task_deleted") {
          dispatch({ type: "remove", cardId: explicit.taskId });
          return;
        }
        const existing =
          stateRef.current.cards.find((card) => card.id === explicit.taskId) ??
          null;
        const nextCard = buildCardFromExplicitEvent(explicit, existing);
        dispatch({
          type: "upsert",
          card: nextCard,
        });
        archiveMatchingInferredCards(nextCard);
        return;
      }

      const liveSessionTask = deriveLiveSessionTaskCard(event, agents);
      if (liveSessionTask) {
        setTaskCaptureDebug((current) => ({
          lastStatus: "detected",
          lastUpdatedAt: liveSessionTask.updatedAt,
          lastTitle: liveSessionTask.title,
          lastTaskId: liveSessionTask.id,
          lastSessionKey: liveSessionTask.externalThreadId,
          lastMessage:
            "Inbound user request detected and queued for persistence.",
          detectedCount: current.detectedCount + 1,
        }));
        const hasPersistedMatch = stateRef.current.cards.some(
          (card) =>
            !card.isInferred &&
            !card.isArchived &&
            matchesExplicitCard(liveSessionTask, card),
        );
        if (!hasPersistedMatch) {
          dispatch({ type: "upsert", card: liveSessionTask });
        }
        void persistLiveSessionTask(liveSessionTask);
        return;
      }

      if (event.event === "agent") {
        const payload = isRecord(event.payload) ? event.payload : {};
        const sessionKey = trimOrNull(payload.sessionKey);
        const runId = trimOrNull(payload.runId);
        const data = isRecord(payload.data) ? payload.data : {};
        const phase = trimOrNull(data.phase);
        const agentId = resolveAgentIdFromSession(agents, sessionKey);
        if (!agentId || !runId || !phase) return;
        const candidates = stateRef.current.cards
          .filter(
            (card) =>
              card.assignedAgentId === agentId &&
              !card.isArchived &&
              (card.runId === runId || (!card.runId && card.status !== "done")),
          )
          .sort(
            (left, right) =>
              Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
          );
        const candidate = candidates[0];

        if (!candidate && phase === "start") {
          // Hermes started an agent run -- trust that as the classification signal.
          const agent = agents.find((a) => a.agentId === agentId);
          const userText = normalizeTaskRequestText(
            agent?.lastUserMessage?.trim() ?? "",
          );
          if (userText) {
            const nowIso = new Date().toISOString();
            const cardId = `run:${sessionKey ?? agentId}:${runId}`;
            const newCard = makeCard({
              id: cardId,
              title: truncateTitle(userText, "Incoming request"),
              description: userText,
              status: "working",
              source: "hermes_event",
              sourceEventId: cardId,
              assignedAgentId: agentId,
              createdAt: nowIso,
              updatedAt: nowIso,
              runId,
              externalThreadId: sessionKey,
              lastActivityAt: nowIso,
              isInferred: true,
            });
            dispatch({ type: "upsert", card: newCard });
            void persistLiveSessionTask(newCard);
          }
          return;
        }

        if (!candidate) return;
        if (phase === "start") {
          void updateCard(candidate.id, {
            runId,
            status: "working",
            lastActivityAt: new Date().toISOString(),
          });
          return;
        }
        if (phase === "error") {
          void updateCard(candidate.id, {
            runId,
            status: "needs_attention",
            lastActivityAt: new Date().toISOString(),
          });
          return;
        }
        if (phase === "end") {
          void updateCard(candidate.id, {
            runId,
            status: "done",
            lastActivityAt: new Date().toISOString(),
          });
        }
      }
    },
    [agents, archiveMatchingInferredCards, persistLiveSessionTask, updateCard],
  );

  const selectedCard = state.selectedCardId
    ? (state.cards.find((card) => card.id === state.selectedCardId) ?? null)
    : null;

  const cardsByStatus = useMemo(() => {
    const deduplicated = deduplicateTaskCards(state.cards);
    const grouped = {
      inbox: [] as TaskBoardCard[],
      scheduled: [] as TaskBoardCard[],
      working: [] as TaskBoardCard[],
      needs_attention: [] as TaskBoardCard[],
      done: [] as TaskBoardCard[],
    };
    for (const card of deduplicated) {
      if (card.isArchived) continue;
      grouped[card.status].push(card);
    }
    return grouped;
  }, [state.cards]);

  const activeRuns = useMemo(() => buildActiveRunOptions(runLog), [runLog]);

  const visibleCardCount = useMemo(
    () =>
      Object.values(cardsByStatus).reduce(
        (total, cards) => total + cards.length,
        0,
      ),
    [cardsByStatus],
  );

  const taskCaptureDebugInfo = useMemo(
    () => ({
      ...taskCaptureDebug,
      visibleCardCount,
      totalCardCount: state.cards.length,
      sharedTasksSupported,
      sharedTasksLoading,
      sharedTasksError,
    }),
    [
      sharedTasksError,
      sharedTasksLoading,
      sharedTasksSupported,
      state.cards.length,
      taskCaptureDebug,
      visibleCardCount,
    ],
  );

  return {
    state,
    loading,
    sharedTasksLoading,
    sharedTasksError,
    gatewayTasksLoading,
    gatewayTasksError,
    gatewayTasksSupported,
    cronJobs,
    cronLoading,
    cronError,
    cardsByStatus,
    selectedCard,
    activeRuns,
    taskCaptureDebug: taskCaptureDebugInfo,
    loadTaskDetail,
    addTaskComment,
    replyAndResumeTask,
    createManualCard,
    updateCard,
    moveCard,
    removeCard,
    selectCard,
    refreshCronJobs,
    refreshSharedTasks,
    refreshRemoteTasks,
    ingestGatewayEvent,
  };
};
