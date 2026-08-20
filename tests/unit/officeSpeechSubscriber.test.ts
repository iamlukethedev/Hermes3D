import { describe, expect, it } from "vitest";

const { MAX_TURN_AGE_MS, buildEventsUrl, parseTurnFrame } = await import(
  "../../server/hermes-agent/office-speech"
);

const NOW = 1_700_000_000_000;

const frame = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: 1,
    kind: "agent.turn",
    profile: "pr-fixer",
    text: "Good morning!",
    sessionId: "20260820_104030_9942e6",
    atMs: NOW,
    ...overrides,
  });

describe("buildEventsUrl", () => {
  it("points a bare origin at the subscriber endpoint", () => {
    const url = new URL(buildEventsUrl("ws://localhost:9119", "secret", "hermes3d"));
    expect(url.pathname).toBe("/api/events");
    expect(url.searchParams.get("channel")).toBe("hermes3d");
    expect(url.searchParams.get("token")).toBe("secret");
  });

  it("upgrades http and https to their WebSocket schemes", () => {
    expect(buildEventsUrl("http://localhost:9119", "t", "c")).toMatch(/^ws:/);
    expect(buildEventsUrl("https://box.ts.net:10000", "t", "c")).toMatch(/^wss:/);
  });

  it("replaces a gateway path rather than appending to it", () => {
    const url = new URL(buildEventsUrl("ws://localhost:9119/api/ws", "t", "c"));
    expect(url.pathname).toBe("/api/events");
  });

  it("omits the token when none is configured", () => {
    const url = new URL(buildEventsUrl("ws://localhost:9119", "", "c"));
    expect(url.searchParams.has("token")).toBe(false);
  });

  it.each([
    ["an empty url", ""],
    ["an unsupported scheme", "ftp://localhost:9119"],
  ])("rejects %s", (_label, input) => {
    expect(() => buildEventsUrl(input, "t", "c")).toThrow();
  });
});

describe("parseTurnFrame", () => {
  it("accepts a well-formed turn", () => {
    expect(parseTurnFrame(frame(), NOW)).toEqual({
      profile: "pr-fixer",
      text: "Good morning!",
      sessionId: "20260820_104030_9942e6",
      atMs: NOW,
    });
  });

  it.each([
    ["malformed json", "{not json"],
    ["another publisher's frame", JSON.stringify({ kind: "something.else" })],
    ["a turn with no profile", frame({ profile: "" })],
    ["a turn with no text", frame({ text: "  " })],
  ])("ignores %s", (_label, input) => {
    expect(parseTurnFrame(input, NOW)).toBeNull();
  });

  it("drops a stale turn from a reconnect backlog", () => {
    expect(parseTurnFrame(frame({ atMs: NOW - MAX_TURN_AGE_MS - 1 }), NOW)).toBeNull();
  });

  it("treats a turn with no timestamp as current", () => {
    expect(parseTurnFrame(frame({ atMs: undefined }), NOW)?.atMs).toBe(NOW);
  });
});
