/**
 * Soft synthesized chatter played while agents huddle in a conversation.
 *
 * No audio assets: speech is faked with short filtered triangle blips. A
 * single evenly-spaced blip sounds like a ticking clock, so blips are grouped
 * into word-like utterances — a burst of syllables around a per-utterance base
 * pitch, ending on a falling (or occasionally rising, questioning) note — and
 * consecutive utterances alternate between a lower and a higher voice so the
 * murmur reads as back-and-forth conversation. Browsers keep an AudioContext
 * suspended until a user gesture, so the scene calls `unlock()` from a pointer
 * handler; until then scheduling runs silently and simply produces no sound.
 */

export type ChatterVoice = "low" | "high";

export interface ChatterSyllablePlan {
  frequencyHz: number;
  durationMs: number;
  /** Silence between this syllable and the next one. */
  gapMs: number;
}

export interface ChatterUtterancePlan {
  syllables: ChatterSyllablePlan[];
  gain: number;
  /** Silence after the utterance before the next voice answers. */
  pauseAfterMs: number;
}

/** Randomized-but-bounded utterance; extracted for tests. */
export const planChatterUtterance = (
  voice: ChatterVoice,
  random: () => number = Math.random,
): ChatterUtterancePlan => {
  const baseHz = voice === "low" ? 125 + random() * 45 : 205 + random() * 65;
  const syllableCount = 2 + Math.floor(random() * 4);
  const questioning = random() < 0.3;

  const syllables: ChatterSyllablePlan[] = [];
  for (let index = 0; index < syllableCount; index += 1) {
    const isLast = index === syllableCount - 1;
    // Wander around the base like unstressed/stressed syllables; the final
    // one falls for a statement or rises for a question.
    const contour = isLast
      ? questioning
        ? 1.22
        : 0.8
      : 0.92 + random() * 0.18;
    syllables.push({
      frequencyHz: baseHz * contour,
      durationMs: 60 + random() * 60,
      gapMs: isLast ? 0 : 30 + random() * 60,
    });
  }

  // Occasionally leave a longer lull so the murmur breathes.
  const lullMs = random() < 0.18 ? 700 + random() * 900 : 0;
  return {
    syllables,
    gain: 0.05 + random() * 0.03,
    pauseAfterMs: 380 + random() * 620 + lullMs,
  };
};

/** Total footprint of an utterance on the clock, excluding the pause. */
export const chatterUtteranceDurationMs = (
  plan: ChatterUtterancePlan,
): number =>
  plan.syllables.reduce(
    (sum, syllable) => sum + syllable.durationMs + syllable.gapMs,
    0,
  );

export class ConversationChatterAudio {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeConversationCount = 0;
  private disposed = false;
  private voice: ChatterVoice = "low";

  setActiveConversationCount(count: number) {
    if (this.disposed) return;
    const next = Math.max(0, count);
    const wasIdle = this.activeConversationCount === 0;
    this.activeConversationCount = next;
    if (next > 0 && wasIdle && this.timer === null) this.scheduleNext();
    if (next === 0) this.stopTimer();
  }

  /** Call from a user-gesture handler so the browser lets audio start. */
  unlock() {
    if (this.disposed) return;
    const context = this.ensureContext();
    if (context && context.state === "suspended") {
      void context.resume().catch(() => {});
    }
  }

  dispose() {
    this.disposed = true;
    this.stopTimer();
    if (this.context && this.context.state !== "closed") {
      void this.context.close().catch(() => {});
    }
    this.context = null;
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.context = new Ctor();
    } catch {
      this.context = null;
    }
    return this.context;
  }

  private stopTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext() {
    if (this.disposed || this.activeConversationCount === 0) {
      this.timer = null;
      return;
    }
    // Mostly alternate voices so it sounds like an exchange; sometimes the
    // same voice keeps going, like someone finishing a thought.
    if (Math.random() < 0.72) {
      this.voice = this.voice === "low" ? "high" : "low";
    }
    const plan = planChatterUtterance(this.voice);
    this.playUtterance(plan);
    // More simultaneous conversations pause less between utterances.
    const pause = plan.pauseAfterMs / Math.sqrt(this.activeConversationCount);
    this.timer = setTimeout(
      () => this.scheduleNext(),
      chatterUtteranceDurationMs(plan) + pause,
    );
  }

  private playUtterance(plan: ChatterUtterancePlan) {
    if (this.disposed || this.activeConversationCount === 0) return;
    const context = this.ensureContext();
    if (!context || context.state !== "running") return;

    let at = context.currentTime + 0.01;
    for (const syllable of plan.syllables) {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      const filter = context.createBiquadFilter();
      const duration = syllable.durationMs / 1000;

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(syllable.frequencyHz, at);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(60, syllable.frequencyHz * 0.82),
        at + duration,
      );
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1000, at);
      gainNode.gain.setValueAtTime(0.0001, at);
      gainNode.gain.exponentialRampToValueAtTime(plan.gain, at + duration * 0.3);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, at + duration);

      oscillator.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.02);

      at += duration + syllable.gapMs / 1000;
    }
  }
}
