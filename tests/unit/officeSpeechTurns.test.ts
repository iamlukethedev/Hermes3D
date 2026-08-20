// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  enqueueSpeechTurns,
  SPEECH_QUEUE_MAX,
  SPEECH_TURN_MAX_MS,
  SPEECH_TURN_MIN_MS,
  speechTurnDurationMs,
  type SpeechTurn,
} from "../../src/features/retro-office/core/speechTurns";

const turn = (agentId: string, key: string): SpeechTurn => ({
  agentId,
  key,
  durationMs: SPEECH_TURN_MIN_MS,
});

describe("speechTurnDurationMs", () => {
  it("stays long enough to read and short enough to pass the floor on", () => {
    for (const length of [0, 1, 40, 180, 2_000]) {
      const duration = speechTurnDurationMs(length);
      expect(duration).toBeGreaterThanOrEqual(SPEECH_TURN_MIN_MS);
      expect(duration).toBeLessThanOrEqual(SPEECH_TURN_MAX_MS);
    }
  });

  it("gives a longer reply more time than a shorter one", () => {
    expect(speechTurnDurationMs(150)).toBeGreaterThan(speechTurnDurationMs(20));
  });
});

describe("enqueueSpeechTurns", () => {
  it("queues a burst in arrival order rather than showing it at once", () => {
    const queue = enqueueSpeechTurns(
      [],
      [turn("a", "a:1"), turn("b", "b:1"), turn("c", "c:1")],
    );
    expect(queue.map((entry) => entry.agentId)).toEqual(["a", "b", "c"]);
  });

  it("ignores a reply it has already queued", () => {
    const first = enqueueSpeechTurns([], [turn("a", "a:1")]);
    const second = enqueueSpeechTurns(first, [turn("a", "a:1")]);
    expect(second).toHaveLength(1);
  });

  it("replaces an agent's waiting reply instead of making it speak twice", () => {
    const queue = enqueueSpeechTurns(
      [turn("a", "a:1"), turn("b", "b:1")],
      [turn("a", "a:2")],
    );
    expect(queue.map((entry) => entry.key)).toEqual(["b:1", "a:2"]);
  });

  it("drops the oldest waiting replies once the line is full", () => {
    const incoming = Array.from({ length: SPEECH_QUEUE_MAX + 3 }, (_, index) =>
      turn(`agent-${index}`, `agent-${index}:1`),
    );
    const queue = enqueueSpeechTurns([], incoming);
    expect(queue).toHaveLength(SPEECH_QUEUE_MAX);
    // The survivors are the freshest: a reply that waited out the whole burst
    // is no longer news by the time its turn would arrive.
    expect(queue.map((entry) => entry.agentId)).toEqual(
      incoming.slice(-SPEECH_QUEUE_MAX).map((entry) => entry.agentId),
    );
  });
});
