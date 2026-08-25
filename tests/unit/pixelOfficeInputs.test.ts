import { describe, expect, it } from "vitest";

import {
  buildPixelAgentInputs,
  isCleaningActive,
} from "@/features/pixel-office/buildPixelInputs";
import type { OfficeAgent } from "@/features/retro-office/core/types";
import type { OfficeAnimationState } from "@/lib/office/eventTriggers";

const agent = (id: string, status: OfficeAgent["status"] = "idle"): OfficeAgent => ({
  id,
  name: `Agent ${id}`,
  status,
  color: "#4a90d9",
  item: "coffee",
});

const emptyAnimationState = (): OfficeAnimationState => ({
  awaitingApprovalByAgentId: {},
  cleaningCues: [],
  danceUntilByAgentId: {},
  deskHoldByAgentId: {},
  githubHoldByAgentId: {},
  gymHoldByAgentId: {},
  jukeboxHoldByAgentId: {},
  manualGymUntilByAgentId: {},
  pendingStandupRequest: null,
  phoneBoothHoldByAgentId: {},
  phoneCallByAgentId: {},
  qaHoldByAgentId: {},
  smsBoothHoldByAgentId: {},
  skillGymHoldByAgentId: {},
  streamingByAgentId: {},
  textMessageByAgentId: {},
  thinkingByAgentId: {},
  workingUntilByAgentId: {},
});

describe("buildPixelAgentInputs", () => {
  it("maps a bare roster with no animation state", () => {
    const inputs = buildPixelAgentInputs({
      agents: [agent("a", "working"), agent("b", "error")],
      animationState: null,
      nowMs: 1_000,
    });
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({
      id: "a",
      status: "working",
      hold: null,
      dancing: false,
      standup: false,
      streaming: false,
    });
    expect(inputs[1].status).toBe("error");
  });

  it("prioritizes the phone booth hold over the gym hold", () => {
    const state = emptyAnimationState();
    state.phoneBoothHoldByAgentId = { a: true };
    state.gymHoldByAgentId = { a: true };
    const [input] = buildPixelAgentInputs({
      agents: [agent("a")],
      animationState: state,
      nowMs: 1_000,
    });
    expect(input.hold).toBe("phone_booth");
  });

  it("maps each hold kind to its station", () => {
    const cases: Array<[Partial<OfficeAnimationState>, string]> = [
      [{ smsBoothHoldByAgentId: { a: true } }, "sms_booth"],
      [{ gymHoldByAgentId: { a: true } }, "gym"],
      [{ skillGymHoldByAgentId: { a: true } }, "gym"],
      [{ manualGymUntilByAgentId: { a: 2_000 } }, "gym"],
      [{ qaHoldByAgentId: { a: true } }, "qa_lab"],
      [{ githubHoldByAgentId: { a: true } }, "github_desk"],
      [{ jukeboxHoldByAgentId: { a: true } }, "jukebox"],
    ];
    for (const [patch, expected] of cases) {
      const state = { ...emptyAnimationState(), ...patch };
      const [input] = buildPixelAgentInputs({
        agents: [agent("a")],
        animationState: state,
        nowMs: 1_000,
      });
      expect(input.hold).toBe(expected);
    }
  });

  it("expires timed holds and dances by nowMs", () => {
    const state = emptyAnimationState();
    state.manualGymUntilByAgentId = { a: 5_000 };
    state.danceUntilByAgentId = { a: 5_000 };
    const before = buildPixelAgentInputs({
      agents: [agent("a")],
      animationState: state,
      nowMs: 4_999,
    })[0];
    const after = buildPixelAgentInputs({
      agents: [agent("a")],
      animationState: state,
      nowMs: 5_001,
    })[0];
    expect(before.hold).toBe("gym");
    expect(before.dancing).toBe(true);
    expect(after.hold).toBeNull();
    expect(after.dancing).toBe(false);
  });

  it("latches working status through the desk hold and working-until window", () => {
    const state = emptyAnimationState();
    state.workingUntilByAgentId = { a: 5_000 };
    state.deskHoldByAgentId = { b: true };
    const inputs = buildPixelAgentInputs({
      agents: [agent("a"), agent("b"), agent("c", "error")],
      animationState: state,
      nowMs: 4_000,
    });
    expect(inputs[0].status).toBe("working");
    expect(inputs[1].status).toBe("working");
    // Error status always wins over the latch.
    expect(inputs[2].status).toBe("error");
    const expired = buildPixelAgentInputs({
      agents: [agent("a")],
      animationState: state,
      nowMs: 6_000,
    });
    expect(expired[0].status).toBe("idle");
  });

  it("maps streaming, thinking, approval, and standup flags", () => {
    const state = emptyAnimationState();
    state.streamingByAgentId = { a: true };
    state.thinkingByAgentId = { a: true };
    state.awaitingApprovalByAgentId = { a: true };
    state.pendingStandupRequest = {
      key: "k",
      message: "standup",
      requestedAt: 1,
    };
    const [input] = buildPixelAgentInputs({
      agents: [agent("a")],
      animationState: state,
      nowMs: 1_000,
    });
    expect(input.streaming).toBe(true);
    expect(input.thinking).toBe(true);
    expect(input.awaitingApproval).toBe(true);
    expect(input.standup).toBe(true);
  });
});

describe("isCleaningActive", () => {
  it("is false without cues and true with cues", () => {
    expect(isCleaningActive(null)).toBe(false);
    expect(isCleaningActive(emptyAnimationState())).toBe(false);
    const state = emptyAnimationState();
    state.cleaningCues = [
      { id: "c1", agentId: "a", agentName: "Agent a", ts: 1 },
    ];
    expect(isCleaningActive(state)).toBe(true);
  });
});
