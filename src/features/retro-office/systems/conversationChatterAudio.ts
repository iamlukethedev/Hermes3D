/**
 * Soft synthesized murmur played while agents huddle in a conversation.
 *
 * No audio assets: each "utterance" is one or two short filtered triangle
 * blips with randomized pitch, so a circle of talking agents sounds like
 * distant chatter. Browsers keep an AudioContext suspended until a user
 * gesture, so the scene calls `unlock()` from a pointer handler; until then
 * scheduling runs silently and simply produces no sound.
 */

export interface ChatterBlipPlan {
  delayMs: number;
  frequencyHz: number;
  durationMs: number;
  gain: number;
  syllables: 1 | 2;
}

/** Randomized-but-bounded plan; extracted for tests. */
export const planChatterBlip = (random: () => number = Math.random): ChatterBlipPlan => ({
  delayMs: 260 + random() * 640,
  frequencyHz: 165 + random() * 190,
  durationMs: 70 + random() * 90,
  gain: 0.024 + random() * 0.02,
  syllables: random() < 0.4 ? 2 : 1,
});

export class ConversationChatterAudio {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeConversationCount = 0;
  private disposed = false;

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
    const plan = planChatterBlip();
    // More simultaneous conversations chatter a bit more often.
    const delay = plan.delayMs / Math.sqrt(this.activeConversationCount);
    this.timer = setTimeout(() => {
      this.playBlip(plan);
      this.scheduleNext();
    }, delay);
  }

  private playBlip(plan: ChatterBlipPlan) {
    if (this.disposed || this.activeConversationCount === 0) return;
    const context = this.ensureContext();
    if (!context || context.state !== "running") return;

    const startAt = context.currentTime + 0.01;
    const playSyllable = (at: number, frequency: number) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      const filter = context.createBiquadFilter();
      const duration = plan.durationMs / 1000;

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, at);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(60, frequency * 0.78),
        at + duration,
      );
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(900, at);
      gainNode.gain.setValueAtTime(0.0001, at);
      gainNode.gain.exponentialRampToValueAtTime(plan.gain, at + duration * 0.25);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, at + duration);

      oscillator.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.02);
    };

    playSyllable(startAt, plan.frequencyHz);
    if (plan.syllables === 2) {
      playSyllable(
        startAt + plan.durationMs / 1000 + 0.05,
        plan.frequencyHz * 1.22,
      );
    }
  }
}
