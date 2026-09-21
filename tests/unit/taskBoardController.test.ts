import { describe, expect, it } from "vitest";

import type { AgentState } from "@/features/agents/state/store";
import type { RunRecord } from "@/features/office/hooks/useRunLog";
import {
  deduplicateTaskCards,
  deriveFallbackChatCard,
  deriveRecoveredAgentRequestCard,
  deriveLiveSessionTaskCard,
  findDuplicateMirroredTaskCardIds,
  isActionableTaskRequest,
  parseExplicitTaskEvent,
  shouldDispatchCompletedStandup,
  syncCardWithLinkedRun,
} from "@/features/office/tasks/useTaskBoardController";

const makeAgent = (overrides: Partial<AgentState> = {}) =>
  ({
    agentId: "agent-1",
    name: "Agent One",
    sessionKey: "agent:agent-1:main",
    awaitingUserInput: false,
    ...overrides,
  }) as AgentState;

describe("task board controller helpers", () => {
  it("never replays a completed standup handoff just because the UI restarted", () => {
    const meeting = {
      id: "standup-1",
      phase: "complete" as const,
      taskDispatch: {
        status: "failed" as const,
        queuedAgentIds: ["agent-1"],
        blockedAgentIds: [],
        updatedAt: "2026-08-25T19:00:00.000Z",
        error: "backend unavailable",
      },
    };

    expect(shouldDispatchCompletedStandup(null, meeting)).toBe(false);
    expect(
      shouldDispatchCompletedStandup(
        { id: "standup-1", phase: "in_progress" },
        meeting,
      ),
    ).toBe(true);
    expect(
      shouldDispatchCompletedStandup(
        { id: "standup-1", phase: "complete" },
        meeting,
      ),
    ).toBe(false);
  });

  it("never archives backend Kanban cards as title duplicates", () => {
    const makeCard = (id: string, status: "working" | "done") => ({
      id,
      title: "Review current priorities and complete the next safe action.",
      description: "",
      status,
      source: "hermes_event" as const,
      sourceEventId: null,
      assignedAgentId: "agent-1",
      createdAt: "2026-08-25T10:00:00.000Z",
      updatedAt:
        status === "done"
          ? "2026-08-25T10:05:00.000Z"
          : "2026-08-25T11:00:00.000Z",
      playbookJobId: null,
      runId: null,
      channel: "kanban",
      externalThreadId: null,
      lastActivityAt: null,
      notes: [],
      isArchived: false,
      isInferred: false,
      model: null,
      skills: [] as string[],
      subagentCount: 0,
      scheduledFor: null,
      learnedSkill: false,
    });

    expect(
      findDuplicateMirroredTaskCardIds([
        makeCard("kanban:t_previous", "done"),
        makeCard("kanban:t_new", "working"),
      ]),
    ).toEqual([]);
  });

  it("deduplicates multiple cards sharing the same normalized title, assignee, and status", () => {
    const makeCard = (id: string, title: string, updatedAt: string) => ({
      id,
      title,
      description: "",
      status: "needs_attention" as const,
      source: "hermes_event" as const,
      sourceEventId: null,
      assignedAgentId: "agent-1",
      createdAt: "2026-08-25T10:00:00.000Z",
      updatedAt,
      playbookJobId: null,
      runId: null,
      channel: "kanban",
      externalThreadId: null,
      lastActivityAt: null,
      notes: [],
      isArchived: false,
      isInferred: false,
      model: null,
      skills: [] as string[],
      subagentCount: 0,
      scheduledFor: null,
      learnedSkill: false,
    });

    const cards = [
      makeCard("t_1", "fix(connect): stop inviting members who paused Connect themselves", "2026-08-25T10:00:00.000Z"),
      makeCard("t_2", "fix(connect): stop inviting members who paused Connect themselves", "2026-08-25T11:00:00.000Z"),
      makeCard("t_3", "fix(connect): stop inviting members who paused Connect themselves", "2026-08-25T09:00:00.000Z"),
      makeCard("t_other", "Another unique task", "2026-08-25T10:00:00.000Z"),
    ];

    const deduplicated = deduplicateTaskCards(cards);
    expect(deduplicated).toHaveLength(2);
    const retainedDuplicate = deduplicated.find((c) => c.title.includes("stop inviting"));
    expect(retainedDuplicate?.id).toBe("t_2");
    expect(retainedDuplicate?.updatedAt).toBe("2026-08-25T11:00:00.000Z");
  });

  it("parses explicit Hermes task events", () => {
    const parsed = parseExplicitTaskEvent({
      type: "event",
      event: "task_status_changed",
      seq: 42,
      payload: {
        taskId: "task-42",
        title: "Ship the kanban board",
        status: "review",
        assignedAgentId: "agent-1",
        runId: "run-1",
      },
      // Legacy "review" payload status maps onto needs_attention below.
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        taskId: "task-42",
        title: "Ship the kanban board",
        status: "needs_attention",
        assignedAgentId: "agent-1",
        runId: "run-1",
        sourceEventId: "task_status_changed:42",
      }),
    );
  });

  it("derives fallback cards from user chat requests", () => {
    const card = deriveFallbackChatCard(
      {
        type: "event",
        event: "chat",
        payload: {
          sessionKey: "agent:agent-1:main",
          seq: 7,
          channel: "telegram",
          message: {
            role: "user",
            content: [{ type: "text", text: "Create a website for me." }],
          },
        },
      },
      [makeAgent()],
    );

    expect(card).toEqual(
      expect.objectContaining({
        id: "chat:agent:agent-1:main:7",
        title: "Create a website for me.",
        assignedAgentId: "agent-1",
        channel: "telegram",
        source: "fallback_inferred",
      }),
    );
  });

  it("treats plain inbound user asks as live session tasks", () => {
    const card = deriveLiveSessionTaskCard(
      {
        type: "event",
        event: "chat",
        payload: {
          sessionKey: "agent:agent-1:main",
          seq: 8,
          channel: "telegram",
          message: {
            role: "user",
            content: [{ type: "text", text: "Can you check the latest news on Hermes?" }],
          },
        },
      },
      [makeAgent()],
    );

    expect(card).toEqual(
      expect.objectContaining({
        id: "chat:agent:agent-1:main:8",
        title: "Can you check the latest news on Hermes?",
        assignedAgentId: "agent-1",
        channel: "telegram",
        externalThreadId: "agent:agent-1:main",
        source: "hermes_event",
        isInferred: false,
      }),
    );
  });

  it("filters conversational messages out of task capture", () => {
    expect(isActionableTaskRequest("?")).toBe(false);
    expect(isActionableTaskRequest("are you there")).toBe(false);
    expect(isActionableTaskRequest("thanks")).toBe(false);
    expect(isActionableTaskRequest("Can you research about Paul Brady in Tulsa, OK?")).toBe(
      true
    );
  });

  it("accepts messages with common verb typos", () => {
    expect(isActionableTaskRequest("Rearch who is Luke the dev")).toBe(true);
    expect(isActionableTaskRequest("Reserch best practices for React")).toBe(true);
    expect(isActionableTaskRequest("Resarch the latest trends")).toBe(true);
  });

  it("accepts 5+ word messages without punctuation", () => {
    expect(isActionableTaskRequest("do a deep dive into kubernetes networking")).toBe(true);
    expect(isActionableTaskRequest("check the logs from last deployment")).toBe(true);
  });

  it("rejects very short non-verb messages", () => {
    expect(isActionableTaskRequest("ok sure")).toBe(false);
    expect(isActionableTaskRequest("hi")).toBe(false);
  });

  it("recovers latest user asks from agent transcript history", () => {
    const card = deriveRecoveredAgentRequestCard(
      makeAgent({
        lastActivityAt: Date.parse("2026-03-30T20:00:00.000Z"),
        transcriptEntries: [
          {
            entryId: "assistant-1",
            role: "assistant",
            kind: "assistant",
            text: "Sure, I'll check.",
            sessionKey: "agent:agent-1:main",
            runId: "run-1",
            source: "history",
            timestampMs: Date.parse("2026-03-30T20:00:05.000Z"),
            sequenceKey: 2,
            confirmed: true,
            fingerprint: "assistant-1",
          },
          {
            entryId: "user-1",
            role: "user",
            kind: "user",
            text: "Can you check the latest news on Hermes?",
            sessionKey: "agent:agent-1:main",
            runId: null,
            source: "history",
            timestampMs: Date.parse("2026-03-30T20:00:00.000Z"),
            sequenceKey: 1,
            confirmed: true,
            fingerprint: "user-1",
          },
        ],
      }),
    );

    expect(card).toEqual(
      expect.objectContaining({
        id: "history:agent:agent-1:main:1",
        title: "Can you check the latest news on Hermes?",
        assignedAgentId: "agent-1",
        externalThreadId: "agent:agent-1:main",
        source: "hermes_event",
        isInferred: false,
      }),
    );
  });

  it("does not recover conversational transcript entries as tasks", () => {
    const card = deriveRecoveredAgentRequestCard(
      makeAgent({
        lastActivityAt: Date.parse("2026-03-30T20:00:00.000Z"),
        transcriptEntries: [
          {
            entryId: "user-1",
            role: "user",
            kind: "user",
            text: "are you there",
            sessionKey: "agent:agent-1:main",
            runId: null,
            source: "history",
            timestampMs: Date.parse("2026-03-30T20:00:00.000Z"),
            sequenceKey: 1,
            confirmed: true,
            fingerprint: "user-1",
          },
        ],
      }),
    );

    expect(card).toBeNull();
  });

  it("updates linked run cards to done or needs_attention", () => {
    const baseCard = {
      id: "task-1",
      title: "Review patch",
      description: "",
      status: "working" as const,
      source: "hermes3d_manual" as const,
      sourceEventId: null,
      assignedAgentId: "agent-1",
      createdAt: "2026-03-29T10:00:00.000Z",
      updatedAt: "2026-03-29T10:00:00.000Z",
      playbookJobId: null,
      runId: "run-1",
      channel: null,
      externalThreadId: null,
      lastActivityAt: null,
      notes: [],
      isArchived: false,
      isInferred: false,
      model: null,
      skills: [] as string[],
      subagentCount: 0,
      scheduledFor: null,
      learnedSkill: false,
    };
    const okRun: RunRecord = {
      runId: "run-1",
      agentId: "agent-1",
      agentName: "Agent One",
      startedAt: Date.parse("2026-03-29T10:00:00.000Z"),
      endedAt: Date.parse("2026-03-29T10:03:00.000Z"),
      outcome: "ok",
      trigger: "user",
    };
    const errorRun: RunRecord = {
      ...okRun,
      outcome: "error",
    };

    expect(syncCardWithLinkedRun(baseCard, [okRun]).status).toBe("done");
    expect(syncCardWithLinkedRun(baseCard, [errorRun]).status).toBe("needs_attention");
  });
});
