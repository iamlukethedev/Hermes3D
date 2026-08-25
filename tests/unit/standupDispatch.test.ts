import { describe, expect, it } from "vitest";

import { buildStandupTaskCandidates } from "@/features/office/tasks/standupDispatch";
import {
  STANDUP_FALLBACK_TASK,
  type StandupMeeting,
  type StandupSummaryCard,
} from "@/lib/office/standup/types";

const makeCard = (
  agentId: string,
  currentTask: string,
  blockers: string[] = [],
): StandupSummaryCard => ({
  agentId,
  agentName: agentId === "qa-agent" ? "QA Agent" : "Build Agent",
  speech: currentTask,
  currentTask,
  blockers,
  recentCommits: [],
  activeTickets: [],
  manualNotes: [],
  sourceStates: [],
});

const makeMeeting = (cards: StandupSummaryCard[]): StandupMeeting => ({
  id: "meeting-1",
  trigger: "manual",
  phase: "complete",
  scheduledFor: null,
  startedAt: "2026-08-25T10:00:00.000Z",
  updatedAt: "2026-08-25T10:01:00.000Z",
  completedAt: "2026-08-25T10:01:00.000Z",
  currentSpeakerAgentId: null,
  speakerStartedAt: null,
  speakerDurationMs: 8_000,
  participantOrder: cards.map((card) => card.agentId),
  arrivedAgentIds: cards.map((card) => card.agentId),
  cards,
});

describe("buildStandupTaskCandidates", () => {
  it("creates one idempotent, assigned, runnable task per unblocked speaker", () => {
    const [candidate] = buildStandupTaskCandidates(
      makeMeeting([makeCard("build-agent", "Implement the checkout fix.")]),
    );

    expect(candidate).toEqual(
      expect.objectContaining({
        agentId: "build-agent",
        blocked: false,
        input: expect.objectContaining({
          title: "Implement the checkout fix.",
          status: "working",
          assignedAgentId: "build-agent",
          channel: "standup",
          idempotencyKey: "standup:meeting-1:build-agent",
          maxRuntimeSeconds: 3_600,
          goalMode: true,
          goalMaxTurns: 8,
          workspaceKind: "worktree",
        }),
      }),
    );
    expect(candidate?.input.description).toContain("[hermes3d:github-pr]");
    expect(candidate?.input.description).toContain("kanban_request_review");
  });

  it("turns the empty-source fallback into a visible role-owned follow-up", () => {
    const [candidate] = buildStandupTaskCandidates(
      makeMeeting([makeCard("qa-agent", STANDUP_FALLBACK_TASK)]),
    );

    expect(candidate?.input.title).toBe(`QA Agent: ${STANDUP_FALLBACK_TASK}`);
    expect(candidate?.input.description).toContain(
      "Complete one concrete, safe next action.",
    );
  });

  it("puts reported blockers into needs-attention instead of dispatching them", () => {
    const [candidate] = buildStandupTaskCandidates(
      makeMeeting([makeCard("qa-agent", "Verify production.", ["Need access."])]),
    );

    expect(candidate?.blocked).toBe(true);
    expect(candidate?.input.status).toBe("needs_attention");
    expect(candidate?.input.description).toContain("- Need access.");
  });
});
