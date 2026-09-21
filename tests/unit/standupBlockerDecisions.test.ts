import { describe, expect, it } from "vitest";

import {
  synthesizeStandupBlockerDecisions,
  resolveStandupBlocker,
} from "@/lib/office/standup/service";
import { buildStandupTaskCandidates } from "@/features/office/tasks/standupDispatch";
import type {
  StandupMeeting,
  StandupSummaryCard,
} from "@/lib/office/standup/types";

const makeCardWithBlocker = (
  agentId: string,
  currentTask: string,
  blockerText: string
): StandupSummaryCard => {
  const decisionGroup = synthesizeStandupBlockerDecisions({
    agentId,
    agentName: agentId === "build-agent" ? "Build Agent" : "QA Agent",
    currentTask,
    blockerText,
  });
  return {
    agentId,
    agentName: agentId === "build-agent" ? "Build Agent" : "QA Agent",
    speech: currentTask,
    currentTask,
    blockers: [blockerText],
    blockerDecisions: [decisionGroup],
    recentCommits: [],
    activeTickets: [],
    manualNotes: [],
    sourceStates: [],
  };
};

const makeMeeting = (cards: StandupSummaryCard[]): StandupMeeting => ({
  id: "meeting-blocker-1",
  trigger: "manual",
  phase: "in_progress",
  scheduledFor: null,
  startedAt: "2026-08-25T10:00:00.000Z",
  updatedAt: "2026-08-25T10:00:00.000Z",
  completedAt: null,
  currentSpeakerAgentId: cards[0]?.agentId ?? null,
  speakerStartedAt: "2026-08-25T10:00:00.000Z",
  speakerDurationMs: 8_000,
  participantOrder: cards.map((c) => c.agentId),
  arrivedAgentIds: cards.map((c) => c.agentId),
  cards,
});

describe("Standup Blocker Decisions & Alignment", () => {
  describe("synthesizeStandupBlockerDecisions", () => {
    it("synthesizes structured recommendations for Azure CLI auth blockers", () => {
      const group = synthesizeStandupBlockerDecisions({
        agentId: "build-agent",
        agentName: "Build Agent",
        currentTask: "Swap prod 1556965f -> 19dd8123",
        blockerText: "Azure CLI is present but unauthenticated (`az account show` requires `az login`)",
      });

      expect(group.question).toContain("Azure access");
      expect(group.options.length).toBeGreaterThanOrEqual(2);
      const recommended = group.options.find((opt) => opt.isRecommended);
      expect(recommended).toBeDefined();
      expect(recommended?.label).toContain("host Azure operator session");
      expect(recommended?.rationale).toBeDefined();
    });

    it("synthesizes structured recommendations for Git workspace / Docker mount blockers", () => {
      const group = synthesizeStandupBlockerDecisions({
        agentId: "build-agent",
        agentName: "Build Agent",
        currentTask: "Fix Connect beta invites",
        blockerText: "The worker backend is not mounted to the designated Windows worktree: /workspace is empty",
      });

      expect(group.question).toContain("workspace mount");
      const recommended = group.options.find((opt) => opt.isRecommended);
      expect(recommended).toBeDefined();
      expect(recommended?.label).toContain("host Windows worktree");
    });

    it("synthesizes structured recommendations for test / CI check failures", () => {
      const group = synthesizeStandupBlockerDecisions({
        agentId: "qa-agent",
        agentName: "QA Agent",
        currentTask: "Verify payments",
        blockerText: "GitHub checks are failing on commit b97af26b",
      });

      expect(group.question).toContain("failing test/check blocker");
      const recommended = group.options.find((opt) => opt.isRecommended);
      expect(recommended).toBeDefined();
      expect(recommended?.label).toContain("targeted test suite");
    });
  });

  describe("resolveStandupBlocker", () => {
    it("records a selected human decision on the standup card", () => {
      const card = makeCardWithBlocker(
        "build-agent",
        "Swap prod 1556965f -> 19dd8123",
        "Azure CLI is present but unauthenticated"
      );
      const meeting = makeMeeting([card]);

      const updated = resolveStandupBlocker(meeting, {
        agentId: "build-agent",
        blockerIndex: 0,
        optionId: "opt-host-azure",
        decisionText: "Run via host Azure operator session",
      });

      const updatedCard = updated.cards.find((c) => c.agentId === "build-agent");
      expect(updatedCard?.blockerDecisions?.[0]?.selectedDecision).toBeDefined();
      expect(updatedCard?.blockerDecisions?.[0]?.selectedDecision?.text).toBe(
        "Run via host Azure operator session"
      );
      expect(updatedCard?.blockerDecisions?.[0]?.selectedDecision?.optionId).toBe(
        "opt-host-azure"
      );
    });
  });

  describe("buildStandupTaskCandidates with resolved blockers", () => {
    it("dispatches task as unblocked 'working' when a human decision is resolved", () => {
      const card = makeCardWithBlocker(
        "build-agent",
        "Swap prod 1556965f -> 19dd8123",
        "Azure CLI is present but unauthenticated"
      );
      const meeting = makeMeeting([card]);

      // Before resolution: candidate is blocked
      const [candidateBefore] = buildStandupTaskCandidates(meeting);
      expect(candidateBefore?.blocked).toBe(true);
      expect(candidateBefore?.input.status).toBe("needs_attention");

      // After resolution: candidate is unblocked with decision injected into delivery contract
      const resolvedMeeting = resolveStandupBlocker(meeting, {
        agentId: "build-agent",
        blockerIndex: 0,
        decisionText: "Execute swap via authenticated host session",
      });

      const [candidateAfter] = buildStandupTaskCandidates(resolvedMeeting);
      expect(candidateAfter?.blocked).toBe(false);
      expect(candidateAfter?.input.status).toBe("working");
      expect(candidateAfter?.input.description).toContain(
        "[HUMAN DECISION]: Execute swap via authenticated host session"
      );
    });
  });
});
