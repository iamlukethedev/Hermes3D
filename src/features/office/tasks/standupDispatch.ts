import {
  STANDUP_FALLBACK_TASK,
  type StandupMeeting,
} from "@/lib/office/standup/types";
import type { GatewayTaskCreateInput } from "@/lib/tasks/gateway";

export type StandupTaskCandidate = {
  agentId: string;
  blocked: boolean;
  input: GatewayTaskCreateInput;
};

const getResolvedDecisions = (card: StandupMeeting["cards"][number]) => {
  return (card.blockerDecisions ?? [])
    .map((group) => group.selectedDecision?.text)
    .filter((text): text is string => Boolean(text));
};

const formatStandupTaskDescription = (
  meeting: StandupMeeting,
  card: StandupMeeting["cards"][number],
) => {
  const lines = [
    `Assigned automatically from Hermes3D standup ${meeting.id}.`,
    "",
    `Objective: ${card.currentTask}`,
  ];
  if (card.activeTickets.length > 0) {
    lines.push(
      "",
      "Active tickets:",
      ...card.activeTickets.map(
        (ticket) => `- ${ticket.key}: ${ticket.title} (${ticket.status})`,
      ),
    );
  }
  const resolvedDecisions = getResolvedDecisions(card);
  if (resolvedDecisions.length > 0) {
    lines.push(
      "",
      "Human alignment & decisions:",
      ...resolvedDecisions.map((decision) => `- [HUMAN DECISION]: ${decision}`),
    );
  }
  const unresolvedBlockers = card.blockers.filter((_, idx) => {
    const decisionGroup = card.blockerDecisions?.[idx];
    return !decisionGroup?.selectedDecision;
  });
  if (unresolvedBlockers.length > 0) {
    lines.push("", "Known blockers:", ...unresolvedBlockers.map((blocker) => `- ${blocker}`));
  }
  if (card.manualNotes.length > 0) {
    lines.push("", "Standup notes:", ...card.manualNotes.map((note) => `- ${note}`));
  }
  lines.push(
    "",
    "[hermes3d:github-pr]",
    "",
    "Delivery contract:",
    "- Complete one concrete, safe next action. It must advance the stated objective; a generic status update is not a result.",
    "- Work only in the project worktree and branch assigned by Hermes Kanban; never edit the user's root checkout.",
    "- Deliver the objective, self-review the diff, and run targeted tests/checks.",
    "- If repository files change, leave a clean worktree with a focused commit, then call kanban_request_review with branch, commit, tests, and changed_files metadata. Hermes3D will push the branch and open/reuse the GitHub PR from the authenticated host.",
    "- Do not call kanban_complete for code that has no review/PR handoff. If no repository change is required, complete with a concrete result or artifact.",
    "- If the objective cannot be confirmed or a dependency/decision is missing, call kanban_block with a specific typed reason instead of inventing requirements.",
  );
  return lines.join("\n");
};

export const buildStandupTaskCandidates = (
  meeting: StandupMeeting,
): StandupTaskCandidate[] =>
  meeting.cards.map((card) => {
    const sourceEventId = `standup:${meeting.id}:${card.agentId}`;
    const isFallback = card.currentTask.trim() === STANDUP_FALLBACK_TASK;
    const hasUnresolvedBlockers =
      card.blockers.length > 0 &&
      card.blockers.some((_, idx) => !card.blockerDecisions?.[idx]?.selectedDecision);
    return {
      agentId: card.agentId,
      blocked: hasUnresolvedBlockers,
      input: {
        title: isFallback
          ? `${card.agentName}: ${STANDUP_FALLBACK_TASK}`
          : card.currentTask,
        description: formatStandupTaskDescription(meeting, card),
        status: hasUnresolvedBlockers ? "needs_attention" : "working",
        assignedAgentId: card.agentId,
        channel: "standup",
        source: "hermes_event",
        sourceEventId,
        idempotencyKey: sourceEventId,
        maxRuntimeSeconds: 3_600,
        goalMode: true,
        goalMaxTurns: 8,
        workspaceKind: "worktree",
      },
    };
  });
