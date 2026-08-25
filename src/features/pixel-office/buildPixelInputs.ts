// Maps live Hermes office state (roster + animation holds) into the pixel
// simulation's input shape. Pure so it stays unit-testable.

import type { OfficeAgent } from "@/features/retro-office/core/types";
import type { OfficeAnimationState } from "@/lib/office/eventTriggers";
import type { PixelAgentInput } from "@/features/pixel-office/types";

export const buildPixelAgentInputs = (params: {
  agents: OfficeAgent[];
  animationState: OfficeAnimationState | null;
  nowMs: number;
}): PixelAgentInput[] => {
  const { agents, animationState, nowMs } = params;
  return agents.map((agent) => {
    const id = agent.id;
    const hold: PixelAgentInput["hold"] = !animationState
      ? null
      : animationState.phoneBoothHoldByAgentId[id]
        ? "phone_booth"
        : animationState.smsBoothHoldByAgentId[id]
          ? "sms_booth"
          : animationState.gymHoldByAgentId[id] ||
              animationState.skillGymHoldByAgentId[id] ||
              (animationState.manualGymUntilByAgentId[id] ?? 0) > nowMs
            ? "gym"
            : animationState.qaHoldByAgentId[id]
              ? "qa_lab"
              : animationState.githubHoldByAgentId[id]
                ? "github_desk"
                : animationState.jukeboxHoldByAgentId[id]
                  ? "jukebox"
                  : null;
    return {
      id,
      name: agent.name,
      status: agent.status,
      color: agent.color,
      streaming: Boolean(animationState?.streamingByAgentId[id]),
      thinking: Boolean(animationState?.thinkingByAgentId[id]),
      awaitingApproval: Boolean(animationState?.awaitingApprovalByAgentId[id]),
      dancing: (animationState?.danceUntilByAgentId[id] ?? 0) > nowMs,
      hold,
      standup: Boolean(animationState?.pendingStandupRequest),
    };
  });
};

export const isCleaningActive = (
  animationState: OfficeAnimationState | null,
): boolean => Boolean(animationState && animationState.cleaningCues.length > 0);
