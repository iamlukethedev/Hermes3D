/**
 * One speaking turn at a time for scene speech bubbles.
 *
 * A group chat answered by four agents used to raise four full-size bubbles in
 * the same second. They overlap into an unreadable stack, and the office reads
 * as noise rather than a conversation. Replies are therefore queued and granted
 * the floor one at a time, the way people actually take turns.
 *
 * Pure so the ordering and timing rules are testable without a scene.
 */

/** Shortest a bubble stays up — below this it flashes past unread. */
export const SPEECH_TURN_MIN_MS = 3_400;

/** Longest a single reply may hold the floor while others are waiting. */
export const SPEECH_TURN_MAX_MS = 9_000;

/**
 * How many replies may wait for the floor.
 *
 * A burst larger than this would keep the office narrating a conversation long
 * after it ended, so the oldest waiting replies are dropped: by the time their
 * turn arrived they would no longer be news.
 */
export const SPEECH_QUEUE_MAX = 4;

export interface SpeechTurn {
  agentId: string;
  /** Identifies one reply, so the same event is never queued twice. */
  key: string;
  durationMs: number;
}

/** Reading time for a reply of this length, bounded at both ends. */
export const speechTurnDurationMs = (textLength: number): number =>
  Math.min(
    SPEECH_TURN_MAX_MS,
    Math.max(SPEECH_TURN_MIN_MS, 1_800 + textLength * 34),
  );

/**
 * Add replies to the waiting line.
 *
 * An agent holds at most one place in the queue: when it speaks again before
 * its earlier reply reached the floor, the newer text replaces the older one
 * rather than making the same character say two things in a row.
 */
export const enqueueSpeechTurns = (
  queue: SpeechTurn[],
  incoming: SpeechTurn[],
  max: number = SPEECH_QUEUE_MAX,
): SpeechTurn[] => {
  const next = [...queue];
  for (const turn of incoming) {
    if (next.some((queued) => queued.key === turn.key)) continue;
    const supersedes = next.findIndex(
      (queued) => queued.agentId === turn.agentId,
    );
    if (supersedes >= 0) next.splice(supersedes, 1);
    next.push(turn);
  }
  return next.length > max ? next.slice(next.length - max) : next;
};
