import { describe, expect, it } from "vitest";

import {
  OFFICE_SPEECH_MAX_AGE_MS,
  toOfficeSpeechFeedEvent,
} from "@/lib/office/officeSpeech";

const NOW = 1_700_000_000_000;

const payload = (overrides: Record<string, unknown> = {}) => ({
  agentId: "pr-fixer",
  name: "Pr Fixer",
  text: "Good morning!",
  atMs: NOW,
  sessionId: "20260820_104030_9942e6",
  ...overrides,
});

describe("toOfficeSpeechFeedEvent", () => {
  it("turns a published turn into a reply feed entry", () => {
    expect(toOfficeSpeechFeedEvent(payload(), { nowMs: NOW })).toEqual({
      id: "pr-fixer",
      name: "Pr Fixer",
      text: "Good morning!",
      ts: NOW,
      kind: "reply",
    });
  });

  it("keys the entry on the agent id so the scene attributes the speech", () => {
    const event = toOfficeSpeechFeedEvent(payload({ agentId: "pr-reviewer" }), {
      nowMs: NOW,
    });
    expect(event?.id).toBe("pr-reviewer");
  });

  it("applies the caller's text normaliser", () => {
    const event = toOfficeSpeechFeedEvent(payload({ text: "a   b" }), {
      nowMs: NOW,
      normalizeText: (value) => value.replace(/\s+/g, " ").toUpperCase(),
    });
    expect(event?.text).toBe("A B");
  });

  it("falls back to a generic name when the payload omits one", () => {
    const event = toOfficeSpeechFeedEvent(payload({ name: "" }), { nowMs: NOW });
    expect(event?.name).toBe("Agent");
  });

  it("defaults the timestamp when the payload has none", () => {
    const event = toOfficeSpeechFeedEvent(payload({ atMs: undefined }), {
      nowMs: NOW,
    });
    expect(event?.ts).toBe(NOW);
  });

  it.each([
    ["a non-object payload", "nope"],
    ["a null payload", null],
    ["a missing agent id", payload({ agentId: "" })],
    ["text that is only whitespace", payload({ text: "   " })],
  ])("rejects %s", (_label, input) => {
    expect(toOfficeSpeechFeedEvent(input, { nowMs: NOW })).toBeNull();
  });

  it("drops a stale turn so a reconnect backlog cannot huddle idle agents", () => {
    const stale = payload({ atMs: NOW - OFFICE_SPEECH_MAX_AGE_MS - 1 });
    expect(toOfficeSpeechFeedEvent(stale, { nowMs: NOW })).toBeNull();
  });

  it("keeps a turn that is old but still inside the window", () => {
    const recent = payload({ atMs: NOW - OFFICE_SPEECH_MAX_AGE_MS + 1_000 });
    expect(toOfficeSpeechFeedEvent(recent, { nowMs: NOW })).not.toBeNull();
  });
});
