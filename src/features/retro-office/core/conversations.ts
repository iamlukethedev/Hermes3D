import { CANVAS_H, CANVAS_W } from "@/features/retro-office/core/constants";

/**
 * Agent-to-agent conversation detection and huddle placement.
 *
 * When Hermes bots talk between themselves, several agents produce speech in
 * the same time window (and usually address each other by name). This module
 * turns that raw speech activity into conversation groups, and lays each group
 * out as a circle of standing slots so the participants visibly gather and face
 * one another. Everything here is pure so the grouping and geometry are
 * testable without a scene.
 */

export interface ConversationSpeechSample {
  agentId: string;
  text: string;
  atMs: number;
}

export interface ConversationGroup {
  /** Sorted participant ids joined with "+" — stable across recomputes. */
  id: string;
  participantIds: string[];
  lastActivityMs: number;
}

export interface ConversationSlot {
  x: number;
  y: number;
  facing: number;
  seatIndex: number;
}

/** How long after the last message a conversation is considered alive. */
export const CONVERSATION_WINDOW_MS = 25_000;

/**
 * Minimum time a huddle exists once formed. A single mention gives only one
 * speech sample; without this floor the circle would dissolve while distant
 * participants are still walking over.
 */
export const CONVERSATION_MIN_LIFETIME_MS = 45_000;

/**
 * While members are still walking to the circle the scene keeps extending the
 * huddle's life in slices of this size, so slow machines (or long walks) don't
 * dissolve a conversation before it visibly happens.
 */
export const CONVERSATION_EN_ROUTE_GRACE_MS = 12_000;

/** Hard ceiling on a huddle's life from formation, extensions included. */
export const CONVERSATION_MAX_LIFETIME_MS = 150_000;

/** Arc distance between neighbours on the circle, in canvas units. */
export const CONVERSATION_SLOT_SPACING = 34;

/** Minimum huddle radius so two agents don't stand nose-to-nose. */
export const CONVERSATION_MIN_RADIUS = 26;

/** How long one agent "speaks" before the turn passes around the circle. */
export const CONVERSATION_TALK_TURN_MS = 1_600;

/** Bubble duration for a single talk pulse. */
export const CONVERSATION_TALK_PULSE_MS = 900;

const FIRST_NAME_MIN_LENGTH = 3;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildNameMatchers = (agentNamesById: Record<string, string>) => {
  const matchers = new Map<string, RegExp>();
  for (const [agentId, name] of Object.entries(agentNamesById)) {
    const firstName = (name ?? "").trim().split(/\s+/)[0] ?? "";
    if (firstName.length < FIRST_NAME_MIN_LENGTH) continue;
    matchers.set(agentId, new RegExp(`\\b${escapeRegExp(firstName)}\\b`, "i"));
  }
  return matchers;
};

/** Union-find over mention edges; returns connected components of size >= 2. */
const connectedComponents = (edges: [string, string][]): string[][] => {
  const parent = new Map<string, string>();
  const find = (node: string): string => {
    let root = node;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    let cursor = node;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor) ?? root;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  for (const [a, b] of edges) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }
  const byRoot = new Map<string, string[]>();
  for (const node of parent.keys()) {
    const root = find(node);
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(node);
    else byRoot.set(root, [node]);
  }
  return [...byRoot.values()];
};

/**
 * Group agents that are talking between themselves.
 *
 * Mentions are the strong signal: a speaker naming another agent links the two
 * (and pulls the named agent over even before it answers). Without mentions,
 * two or more agents speaking inside the same window are treated as one
 * water-cooler huddle — there is no addressee metadata to split them further.
 * Standup meetings already gather everyone, so grouping is suppressed there.
 */
export const deriveConversationGroups = (options: {
  samples: ConversationSpeechSample[];
  agentNamesById: Record<string, string>;
  nowMs: number;
  windowMs?: number;
  suppressed?: boolean;
}): ConversationGroup[] => {
  const {
    samples,
    agentNamesById,
    nowMs,
    windowMs = CONVERSATION_WINDOW_MS,
    suppressed = false,
  } = options;
  if (suppressed) return [];

  const active = samples.filter(
    (sample) =>
      sample.text.trim() !== "" &&
      nowMs - sample.atMs <= windowMs &&
      sample.atMs <= nowMs + 1_000 &&
      agentNamesById[sample.agentId] !== undefined,
  );
  if (active.length === 0) return [];

  const lastSpokeAtByAgentId = new Map<string, number>();
  for (const sample of active) {
    lastSpokeAtByAgentId.set(
      sample.agentId,
      Math.max(lastSpokeAtByAgentId.get(sample.agentId) ?? 0, sample.atMs),
    );
  }

  const matchers = buildNameMatchers(agentNamesById);
  const mentionEdges: [string, string][] = [];
  for (const sample of active) {
    for (const [otherId, matcher] of matchers) {
      if (otherId === sample.agentId) continue;
      if (matcher.test(sample.text)) mentionEdges.push([sample.agentId, otherId]);
    }
  }

  const speakerIds = [...lastSpokeAtByAgentId.keys()];
  const memberships =
    mentionEdges.length > 0
      ? connectedComponents(mentionEdges)
      : speakerIds.length >= 2
        ? [speakerIds]
        : [];

  return memberships
    .filter((ids) => ids.length >= 2)
    .map((ids) => {
      const participantIds = [...ids].sort();
      const lastActivityMs = participantIds.reduce(
        (max, id) => Math.max(max, lastSpokeAtByAgentId.get(id) ?? 0),
        0,
      );
      return { id: participantIds.join("+"), participantIds, lastActivityMs };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
};

export interface KnownConversationGroup {
  group: ConversationGroup;
  formedAtMs: number;
}

/**
 * Fold freshly derived groups into the huddles already on the floor.
 *
 * Membership churns as speech samples age in and out of the window, and the
 * naive "add whatever was derived" rule let two huddles claim the same agent —
 * which hands that agent two circles and leaves it walking between them
 * forever. Three cases, in order:
 *
 * - Same membership: the huddle continues, keep its formation time and slots.
 * - Subset of a live huddle: a speaker's sample simply aged out. Still the same
 *   conversation, so it counts as activity rather than re-seating the circle.
 * - Anything else: the derived group is the fresher truth and retires every
 *   huddle it overlaps, so no agent is ever in two groups.
 */
export const reconcileConversationGroups = (options: {
  derived: ConversationGroup[];
  known: Map<string, KnownConversationGroup>;
  nowMs: number;
}): Map<string, KnownConversationGroup> => {
  const { derived, known, nowMs } = options;
  for (const group of derived) {
    const entry = known.get(group.id);
    if (entry) {
      entry.group = group;
      continue;
    }
    const containing = [...known.values()].find((other) =>
      group.participantIds.every((id) =>
        other.group.participantIds.includes(id),
      ),
    );
    if (containing) {
      containing.group = {
        ...containing.group,
        lastActivityMs: Math.max(
          containing.group.lastActivityMs,
          group.lastActivityMs,
        ),
      };
      continue;
    }
    for (const [otherId, other] of known) {
      if (
        otherId !== group.id &&
        other.group.participantIds.some((id) =>
          group.participantIds.includes(id),
        )
      ) {
        known.delete(otherId);
      }
    }
    known.set(group.id, { group, formedAtMs: nowMs });
  }
  return known;
};

// Rings of candidate centres, nearest first; the outer rings let a huddle
// escape a whole blocked furniture cluster rather than just a single desk.
const CENTER_CANDIDATE_OFFSETS: [number, number][] = [
  [0, 0],
  [45, 0],
  [-45, 0],
  [0, 45],
  [0, -45],
  [70, 70],
  [-70, 70],
  [70, -70],
  [-70, -70],
  [110, 0],
  [-110, 0],
  [0, 110],
  [0, -110],
  [150, 0],
  [-150, 0],
  [0, 150],
  [0, -150],
  [150, 150],
  [-150, 150],
  [150, -150],
  [-150, -150],
  [210, 0],
  [-210, 0],
  [0, 210],
  [0, -210],
];

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * Lay a conversation group out as a circle of standing slots.
 *
 * The circle is centred near the participants' centroid, nudged to the first
 * candidate spot where every slot is walkable, so huddles don't form inside
 * desks or walls. Agents are assigned slots in the order of their bearing from
 * the centre, which keeps walking paths from crossing. Facing uses the scene's
 * rotation convention (`atan2(dx, dy)` toward the centre).
 */
export const computeConversationSlots = (options: {
  participants: { id: string; x: number; y: number }[];
  isFree?: (x: number, y: number) => boolean;
  canvasWidth?: number;
  canvasHeight?: number;
}): Map<string, ConversationSlot> => {
  const {
    participants,
    isFree = () => true,
    canvasWidth = CANVAS_W,
    canvasHeight = CANVAS_H,
  } = options;
  const count = participants.length;
  const slots = new Map<string, ConversationSlot>();
  if (count < 2) return slots;

  const margin = 60;
  const centroidX = clamp(
    participants.reduce((sum, p) => sum + p.x, 0) / count,
    margin,
    canvasWidth - margin,
  );
  const centroidY = clamp(
    participants.reduce((sum, p) => sum + p.y, 0) / count,
    margin,
    canvasHeight - margin,
  );
  const radius = Math.max(
    CONVERSATION_MIN_RADIUS,
    (CONVERSATION_SLOT_SPACING * count) / (2 * Math.PI),
  );

  const slotPointsAt = (cx: number, cy: number) =>
    Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
      return {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });

  // Prefer the first fully free candidate; otherwise take the one with the
  // most walkable slots so a crowded floor still yields a usable circle.
  let centerX = centroidX;
  let centerY = centroidY;
  let bestFreeCount = -1;
  for (const [offsetX, offsetY] of CENTER_CANDIDATE_OFFSETS) {
    const cx = clamp(centroidX + offsetX, margin, canvasWidth - margin);
    const cy = clamp(centroidY + offsetY, margin, canvasHeight - margin);
    const points = slotPointsAt(cx, cy);
    const freeCount =
      (isFree(cx, cy) ? 1 : 0) +
      points.reduce((sum, point) => sum + (isFree(point.x, point.y) ? 1 : 0), 0);
    if (freeCount > bestFreeCount) {
      bestFreeCount = freeCount;
      centerX = cx;
      centerY = cy;
    }
    if (freeCount === count + 1) break;
  }

  const points = slotPointsAt(centerX, centerY);
  // Hand out slots in bearing order so nobody walks through the circle.
  const ordered = [...participants].sort((a, b) => {
    const bearingA = Math.atan2(a.y - centerY, a.x - centerX);
    const bearingB = Math.atan2(b.y - centerY, b.x - centerX);
    return bearingA - bearingB || a.id.localeCompare(b.id);
  });
  const pointsByBearing = [...points].sort((a, b) => {
    const bearingA = Math.atan2(a.y - centerY, a.x - centerX);
    const bearingB = Math.atan2(b.y - centerY, b.x - centerX);
    return bearingA - bearingB;
  });

  ordered.forEach((participant, index) => {
    const point = pointsByBearing[index] ?? points[index];
    slots.set(participant.id, {
      x: Math.round(point.x),
      y: Math.round(point.y),
      facing: Math.atan2(centerX - point.x, centerY - point.y),
      seatIndex: index,
    });
  });
  return slots;
};

/**
 * Whose turn it is to "speak" in the huddle — rotates around the circle so the
 * chatter bubbles alternate instead of everyone talking at once.
 */
export const conversationTalkTurn = (
  nowMs: number,
  seatIndex: number,
  groupSize: number,
  turnMs: number = CONVERSATION_TALK_TURN_MS,
): boolean => {
  if (groupSize <= 0) return false;
  return Math.floor(nowMs / turnMs) % groupSize === seatIndex % groupSize;
};
