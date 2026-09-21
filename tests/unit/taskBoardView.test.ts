import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskBoardView } from "@/features/office/tasks/TaskBoardView";
import type { TaskBoardCard } from "@/features/office/tasks/types";
import type { AgentState } from "@/features/agents/state/store";
import type { CronJobSummary } from "@/lib/cron/types";

const createCard = (overrides: Partial<TaskBoardCard> = {}): TaskBoardCard => ({
  id: "task-1",
  title: "New task",
  description: "",
  status: "inbox",
  source: "hermes3d_manual",
  sourceEventId: null,
  assignedAgentId: null,
  createdAt: "2026-03-29T10:00:00.000Z",
  updatedAt: "2026-03-29T10:00:00.000Z",
  playbookJobId: null,
  runId: null,
  channel: null,
  externalThreadId: null,
  lastActivityAt: null,
  notes: [],
  isArchived: false,
  isInferred: false,
  model: null,
  skills: [],
  subagentCount: 0,
  scheduledFor: null,
  learnedSkill: false,
  ...overrides,
});

const createAgent = (): AgentState => ({
  agentId: "agent-1",
  name: "Agent One",
  sessionKey: "agent:agent-1:main",
  status: "idle",
  sessionCreated: true,
  awaitingUserInput: false,
  hasUnseenActivity: false,
  outputLines: [],
  lastResult: null,
  lastDiff: null,
  runId: null,
  runStartedAt: null,
  streamText: null,
  thinkingTrace: null,
  latestOverride: null,
  latestOverrideKind: null,
  lastAssistantMessageAt: null,
  lastActivityAt: null,
  latestPreview: null,
  lastUserMessage: null,
  draft: "",
  sessionSettingsSynced: true,
  historyLoadedAt: null,
  historyFetchLimit: null,
  historyFetchedCount: null,
  historyMaybeTruncated: false,
  toolCallingEnabled: true,
  showThinkingTraces: true,
  model: "openai/gpt-5",
  thinkingLevel: "medium",
  avatarSeed: "seed-1",
  avatarUrl: null,
});

const createCronJob = (): CronJobSummary => ({
  id: "job-1",
  name: "Morning review",
  agentId: "agent-1",
  enabled: true,
  updatedAtMs: Date.now(),
  schedule: { kind: "every", everyMs: 60_000 },
  sessionTarget: "isolated",
  wakeMode: "now",
  payload: { kind: "agentTurn", message: "Review new tasks." },
  state: {},
});

describe("TaskBoardView", () => {
  afterEach(() => {
    cleanup();
  });

  it("distinguishes active Hermes workers from tracked working cards", () => {
    render(
      createElement(TaskBoardView, {
        title: "Hermes Task Board",
        subtitle: "Track tasks.",
        agents: [createAgent()],
        cardsByStatus: {
          inbox: [],
          scheduled: [],
          working: [
            createCard({ id: "kanban:t_active", status: "working" }),
            createCard({ id: "shared-history-card", status: "working" }),
          ],
          needs_attention: [],
          done: [],
        },
        selectedCard: null,
        activeRuns: [],
        cronJobs: [],
        cronLoading: false,
        cronError: null,
        onCreateCard: vi.fn(),
        onMoveCard: vi.fn(),
        onSelectCard: vi.fn(),
        onUpdateCard: vi.fn(),
        onDeleteCard: vi.fn(),
        onRefreshCronJobs: vi.fn(),
      }),
    );

    expect(screen.getByText("1 Hermes worker active")).toBeInTheDocument();
    expect(screen.getByText("1 tracked card marked working")).toBeInTheDocument();
    expect(screen.queryByText("2 working")).not.toBeInTheDocument();
  });

  it("routes task edits through callbacks", () => {
    const onCreateCard = vi.fn();
    const onMoveCard = vi.fn();
    const onSelectCard = vi.fn();
    const onUpdateCard = vi.fn();
    const onDeleteCard = vi.fn();
    const onRefreshCronJobs = vi.fn();
    const selectedCard = createCard();

    render(
      createElement(TaskBoardView, {
        title: "Kanban",
        subtitle: "Track tasks.",
        agents: [createAgent()],
        cardsByStatus: {
          inbox: [selectedCard],
          scheduled: [],
          working: [],
          needs_attention: [],
          done: [],
        },
        selectedCard,
        activeRuns: [{ runId: "run-1", agentId: "agent-1", label: "Agent One" }],
        cronJobs: [createCronJob()],
        cronLoading: false,
        cronError: null,
        onCreateCard,
        onMoveCard,
        onSelectCard,
        onUpdateCard,
        onDeleteCard,
        onRefreshCronJobs,
      })
    );

    fireEvent.click(screen.getAllByRole("button", { name: /new task/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /new task/i })[1]!);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Create marketing website" },
    });
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "working" },
    });
    fireEvent.change(screen.getByLabelText("Assigned agent"), {
      target: { value: "agent-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete task/i }));

    expect(onCreateCard).toHaveBeenCalledTimes(1);
    expect(onRefreshCronJobs).toHaveBeenCalledTimes(1);
    expect(onSelectCard).toHaveBeenCalledWith(null);
    expect(onUpdateCard).toHaveBeenCalledWith("task-1", { title: "Create marketing website" });
    expect(onMoveCard).toHaveBeenCalledWith("task-1", "working");
    expect(onUpdateCard).toHaveBeenCalledWith("task-1", { assignedAgentId: "agent-1" });
    expect(onDeleteCard).toHaveBeenCalledWith("task-1");
  });

  it("lets a human reply to and resume a blocked Hermes task", async () => {
    const selectedCard = createCard({
      id: "kanban:t_blocked",
      status: "needs_attention",
      nativeStatus: "blocked",
      blockKind: "needs_input",
      blockerReason: "Choose the deployment window.",
    });
    const detail = {
      taskId: selectedCard.id,
      nativeStatus: "blocked",
      blockKind: "needs_input",
      blockerReason: "Choose the deployment window.",
      comments: [
        {
          id: "comment-1",
          author: "build-agent",
          body: "BLOCKED: Choose the deployment window.",
          createdAt: "2026-08-25T10:00:00.000Z",
        },
      ],
      eventCount: 1,
      runCount: 1,
    };
    const onLoadTaskDetail = vi.fn(async () => detail);
    const onReplyAndResumeTask = vi.fn(async () => ({
      ...detail,
      nativeStatus: "ready",
      comments: [
        ...detail.comments,
        {
          id: "comment-2",
          author: "hermes3d-user",
          body: "Deploy Tuesday morning.",
          createdAt: "2026-08-25T10:05:00.000Z",
        },
      ],
    }));

    render(
      createElement(TaskBoardView, {
        title: "Kanban",
        subtitle: "Track tasks.",
        agents: [createAgent()],
        cardsByStatus: {
          inbox: [],
          scheduled: [],
          working: [],
          needs_attention: [selectedCard],
          done: [],
        },
        selectedCard,
        activeRuns: [],
        cronJobs: [],
        cronLoading: false,
        cronError: null,
        onCreateCard: vi.fn(),
        onMoveCard: vi.fn(),
        onSelectCard: vi.fn(),
        onUpdateCard: vi.fn(),
        onDeleteCard: vi.fn(),
        onLoadTaskDetail,
        onAddTaskComment: vi.fn(async () => detail),
        onReplyAndResumeTask,
        onRefreshCronJobs: vi.fn(),
      }),
    );

    expect(screen.getAllByText("Human input required").length).toBeGreaterThan(0);
    expect(screen.getByText("Choose the deployment window.")).toBeInTheDocument();
    await screen.findByText("BLOCKED: Choose the deployment window.");

    fireEvent.change(screen.getByLabelText("Your reply to Hermes"), {
      target: { value: "Deploy Tuesday morning." },
    });
    fireEvent.click(screen.getByRole("button", { name: /reply & resume/i }));

    await waitFor(() => {
      expect(onReplyAndResumeTask).toHaveBeenCalledWith(
        "kanban:t_blocked",
        "Deploy Tuesday morning.",
      );
    });
    expect(
      await screen.findByText("Reply sent. The task is ready for a Hermes worker."),
    ).toBeInTheDocument();
  });
});
