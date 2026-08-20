// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  computeConversationSlots,
  CONVERSATION_MIN_RADIUS,
  conversationTalkTurn,
  deriveConversationGroups,
  reconcileConversationGroups,
} from "../../src/features/retro-office/core/conversations";
import type {
  ConversationGroup,
  KnownConversationGroup,
} from "../../src/features/retro-office/core/conversations";
import { planChatterBlip } from "../../src/features/retro-office/systems/conversationChatterAudio";
import { formatAgentSubtitleText } from "../../src/features/retro-office/objects/agents";

const NAMES = {
  allan: "Allan",
  owen: "Owen",
  rev: "Rev",
  samuel: "Samuel",
};

const NOW = 1_000_000;

describe("deriveConversationGroups", () => {
  it("groups two agents speaking inside the same window", () => {
    const groups = deriveConversationGroups({
      samples: [
        { agentId: "allan", text: "Plan is ready.", atMs: NOW - 4_000 },
        { agentId: "owen", text: "Reviewing it now.", atMs: NOW - 1_000 },
      ],
      agentNamesById: NAMES,
      nowMs: NOW,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].participantIds).toEqual(["allan", "owen"]);
    expect(groups[0].id).toBe("allan+owen");
    expect(groups[0].lastActivityMs).toBe(NOW - 1_000);
  });

  it("does not form a group for a single speaker with no mentions", () => {
    const groups = deriveConversationGroups({
      samples: [{ agentId: "allan", text: "Working on it.", atMs: NOW }],
      agentNamesById: NAMES,
      nowMs: NOW,
    });
    expect(groups).toEqual([]);
  });

  it("pulls a mentioned agent into the huddle before it has replied", () => {
    const groups = deriveConversationGroups({
      samples: [
        { agentId: "allan", text: "Owen, can you gate this release?", atMs: NOW },
      ],
      agentNamesById: NAMES,
      nowMs: NOW,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].participantIds).toEqual(["allan", "owen"]);
  });

  it("splits separate mention threads into separate circles", () => {
    const groups = deriveConversationGroups({
      samples: [
        { agentId: "allan", text: "Owen, thoughts?", atMs: NOW - 2_000 },
        { agentId: "owen", text: "Allan, agreed.", atMs: NOW - 1_500 },
        { agentId: "rev", text: "Samuel, fix the CI first.", atMs: NOW - 1_000 },
        { agentId: "samuel", text: "On it, Rev.", atMs: NOW - 500 },
      ],
      agentNamesById: NAMES,
      nowMs: NOW,
    });
    expect(groups.map((group) => group.id)).toEqual([
      "allan+owen",
      "rev+samuel",
    ]);
  });

  it("expires speech outside the window", () => {
    const groups = deriveConversationGroups({
      samples: [
        { agentId: "allan", text: "Old news.", atMs: NOW - 60_000 },
        { agentId: "owen", text: "Fresh reply.", atMs: NOW - 1_000 },
      ],
      agentNamesById: NAMES,
      nowMs: NOW,
    });
    expect(groups).toEqual([]);
  });

  it("is suppressed during a standup meeting", () => {
    const groups = deriveConversationGroups({
      samples: [
        { agentId: "allan", text: "Status.", atMs: NOW },
        { agentId: "owen", text: "Status.", atMs: NOW },
      ],
      agentNamesById: NAMES,
      nowMs: NOW,
      suppressed: true,
    });
    expect(groups).toEqual([]);
  });

  it("ignores speakers the office does not know about", () => {
    const groups = deriveConversationGroups({
      samples: [
        { agentId: "ghost", text: "Boo.", atMs: NOW },
        { agentId: "allan", text: "Hm.", atMs: NOW },
      ],
      agentNamesById: NAMES,
      nowMs: NOW,
    });
    expect(groups).toEqual([]);
  });
});

describe("computeConversationSlots", () => {
  const participants = [
    { id: "allan", x: 300, y: 300 },
    { id: "owen", x: 420, y: 320 },
  ];

  it("places every participant on a circle around the shared centre", () => {
    const slots = computeConversationSlots({ participants });
    expect(slots.size).toBe(2);
    const [a, b] = [...slots.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    // Two slots sit on opposite sides of the circle.
    expect(distance).toBeGreaterThanOrEqual(CONVERSATION_MIN_RADIUS * 2 - 2);
    expect(distance).toBeLessThanOrEqual(CONVERSATION_MIN_RADIUS * 2 + 2);
  });

  it("faces each slot toward the centre", () => {
    const slots = computeConversationSlots({ participants });
    const points = [...slots.values()];
    const centerX = (points[0].x + points[1].x) / 2;
    const centerY = (points[0].y + points[1].y) / 2;
    for (const slot of points) {
      const expected = Math.atan2(centerX - slot.x, centerY - slot.y);
      expect(slot.facing).toBeCloseTo(expected, 5);
    }
  });

  it("assigns distinct seat indexes", () => {
    const four = [
      { id: "a", x: 100, y: 100 },
      { id: "b", x: 200, y: 100 },
      { id: "c", x: 100, y: 200 },
      { id: "d", x: 200, y: 200 },
    ];
    const slots = computeConversationSlots({ participants: four });
    expect(new Set([...slots.values()].map((slot) => slot.seatIndex)).size).toBe(
      4,
    );
  });

  it("moves the circle to walkable ground when the centroid is blocked", () => {
    // Everything within 40 units of the centroid (360, 310) is blocked.
    const blockedZone = (x: number, y: number) =>
      Math.hypot(x - 360, y - 310) > 120;
    const slots = computeConversationSlots({
      participants,
      isFree: blockedZone,
    });
    for (const slot of slots.values()) {
      expect(blockedZone(slot.x, slot.y)).toBe(true);
    }
  });

  it("returns nothing for fewer than two participants", () => {
    expect(
      computeConversationSlots({ participants: [{ id: "a", x: 0, y: 0 }] })
        .size,
    ).toBe(0);
  });
});

describe("conversationTalkTurn", () => {
  it("rotates the speaking turn around the circle", () => {
    const size = 3;
    const turnMs = 1_600;
    for (let seat = 0; seat < size; seat += 1) {
      const at = seat * turnMs + 10;
      for (let other = 0; other < size; other += 1) {
        expect(conversationTalkTurn(at, other, size, turnMs)).toBe(
          other === seat,
        );
      }
    }
  });

  it("never fires for an empty group", () => {
    expect(conversationTalkTurn(0, 0, 0)).toBe(false);
  });
});

describe("planChatterBlip", () => {
  it("stays within audible-but-quiet bounds", () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const plan = planChatterBlip(() => roll);
      expect(plan.delayMs).toBeGreaterThanOrEqual(260);
      expect(plan.delayMs).toBeLessThanOrEqual(900);
      expect(plan.frequencyHz).toBeGreaterThanOrEqual(165);
      expect(plan.frequencyHz).toBeLessThanOrEqual(355);
      expect(plan.durationMs).toBeGreaterThanOrEqual(70);
      expect(plan.durationMs).toBeLessThanOrEqual(160);
      expect(plan.gain).toBeLessThanOrEqual(0.044);
      expect([1, 2]).toContain(plan.syllables);
    }
  });
});

describe("formatAgentSubtitleText", () => {
  it("keeps a short role untouched", () => {
    expect(formatAgentSubtitleText("release gatekeeper")).toBe(
      "release gatekeeper",
    );
  });

  it("keeps only the first clause of a long description", () => {
    expect(
      formatAgentSubtitleText(
        "technical planner and business systems analyst for Smartways. Converts Jira tickets into concrete implementation plans.",
      ),
    ).toBe("technical planner…");
  });

  it("cuts at a word boundary instead of mid-word", () => {
    expect(
      formatAgentSubtitleText(
        "senior full-stack software developer for Smartways",
      ),
    ).toBe("senior full-stack…");
  });

  it("collapses whitespace and handles empties", () => {
    expect(formatAgentSubtitleText("   ")).toBe("");
    expect(formatAgentSubtitleText("qa\n  lead")).toBe("qa lead");
  });
});

describe("reconcileConversationGroups", () => {
  const group = (ids: string[], lastActivityMs = NOW): ConversationGroup => ({
    id: [...ids].sort().join("+"),
    participantIds: [...ids].sort(),
    lastActivityMs,
  });
  const known = (
    entries: [ConversationGroup, number][],
  ): Map<string, KnownConversationGroup> =>
    new Map(
      entries.map(([entry, formedAtMs]) => [entry.id, { group: entry, formedAtMs }]),
    );

  it("keeps a huddle's formation time when its membership repeats", () => {
    const state = known([[group(["allan", "owen"], NOW - 9_000), NOW - 30_000]]);
    reconcileConversationGroups({
      derived: [group(["allan", "owen"])],
      known: state,
      nowMs: NOW,
    });
    expect([...state.keys()]).toEqual(["allan+owen"]);
    expect(state.get("allan+owen")?.formedAtMs).toBe(NOW - 30_000);
    expect(state.get("allan+owen")?.group.lastActivityMs).toBe(NOW);
  });

  it("treats a shrunken group as activity on the huddle already standing", () => {
    const state = known([
      [group(["allan", "owen", "rev"], NOW - 9_000), NOW - 30_000],
    ]);
    reconcileConversationGroups({
      derived: [group(["allan", "owen"])],
      known: state,
      nowMs: NOW,
    });
    // Re-seating the circle here would restart the walk for everyone.
    expect([...state.keys()]).toEqual(["allan+owen+rev"]);
    expect(state.get("allan+owen+rev")?.formedAtMs).toBe(NOW - 30_000);
    expect(state.get("allan+owen+rev")?.group.lastActivityMs).toBe(NOW);
  });

  it("retires the smaller huddle a grown conversation absorbed", () => {
    const state = known([[group(["allan", "owen"]), NOW - 5_000]]);
    reconcileConversationGroups({
      derived: [group(["allan", "owen", "rev"])],
      known: state,
      nowMs: NOW,
    });
    expect([...state.keys()]).toEqual(["allan+owen+rev"]);
  });

  it("never leaves an agent in two huddles at once", () => {
    const state = known([[group(["allan", "owen"]), NOW - 5_000]]);
    reconcileConversationGroups({
      derived: [group(["owen", "samuel"])],
      known: state,
      nowMs: NOW,
    });
    expect([...state.keys()]).toEqual(["owen+samuel"]);
  });

  it("leaves an unrelated huddle running", () => {
    const state = known([[group(["allan", "owen"]), NOW - 5_000]]);
    reconcileConversationGroups({
      derived: [group(["rev", "samuel"])],
      known: state,
      nowMs: NOW,
    });
    expect([...state.keys()].sort()).toEqual(["allan+owen", "rev+samuel"]);
  });
});
