// @vitest-environment node
import { describe, expect, it } from "vitest";

const {
  redactActivityText,
  extractSessionId,
  buildSessionActivityEntries,
  buildKanbanActivityEntries,
  mergeActivityEntries,
  buildActivityRevision,
} = await import("../../server/hermes-agent/activity");

describe("Hermes Kanban activity projection", () => {
  it("discovers the worker session from the task or bounded worker log", () => {
    expect(extractSessionId({ session_id: "stored-task-session" }, "")).toBe(
      "stored-task-session",
    );
    expect(
      extractSessionId({}, "Query: do work\r\nsession_id: 20260829_155553_eb2584\r\n"),
    ).toBe("20260829_155553_eb2584");
  });

  it("projects visible output and tools without exposing reasoning fields", () => {
    const entries = buildSessionActivityEntries([
      {
        id: 1,
        role: "assistant",
        content: "Checking the registered worktree.",
        reasoning_content: "private chain of thought",
        timestamp: 1_788_000_000,
        tool_calls: [
          {
            function: {
              name: "terminal",
              arguments: JSON.stringify({ command: "git status --short" }),
            },
          },
        ],
      },
      {
        id: 2,
        role: "tool",
        tool_name: "terminal",
        content: "working tree clean\nmore output",
        timestamp: 1_788_000_001,
      },
    ]);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "assistant",
          text: "Checking the registered worktree.",
        }),
        expect.objectContaining({ kind: "tool", text: "terminal: git status --short" }),
        expect.objectContaining({
          kind: "tool",
          text: "terminal result: working tree clean",
        }),
      ]),
    );
    expect(JSON.stringify(entries)).not.toContain("private chain of thought");
  });

  it("redacts credential-shaped values from commands and results", () => {
    const githubToken = `ghp_${"a".repeat(24)}`;
    expect(redactActivityText(`Authorization: Bearer abcdef123 ${githubToken}`)).toBe(
      "Authorization: Bearer [REDACTED] [REDACTED_GITHUB_TOKEN]",
    );
    expect(redactActivityText("api_key=super-secret-value")).toBe(
      "api_key=[REDACTED]",
    );
  });

  it("adds meaningful lifecycle updates and blocked reasons", () => {
    const entries = buildKanbanActivityEntries([
      {
        id: 10,
        kind: "claimed",
        run_id: 170,
        created_at: 1_788_000_000,
      },
      {
        id: 11,
        kind: "heartbeat",
        run_id: 170,
        created_at: 1_788_000_010,
        payload: { note: "Verified all intake cards." },
      },
      {
        id: 12,
        kind: "blocked",
        run_id: 170,
        created_at: 1_788_000_020,
        payload: { reason: "Judge authentication failed." },
      },
    ]);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "progress", text: expect.stringContaining("run 170") }),
        expect.objectContaining({ kind: "progress", text: "Verified all intake cards." }),
        expect.objectContaining({ kind: "error", text: "Judge authentication failed." }),
      ]),
    );
  });

  it("merges activity chronologically and produces a changing revision", () => {
    const merged = mergeActivityEntries(
      [{ kind: "tool", text: "second", timestampMs: 2 }],
      [{ kind: "progress", text: "first", timestampMs: 1 }],
    );
    expect(merged.map((entry: { text: string }) => entry.text)).toEqual([
      "first",
      "second",
    ]);
    expect(
      buildActivityRevision({
        logSize: 42,
        events: [{ id: 11 }],
        messages: [{ id: 22 }],
      }),
    ).toBe("42:11:22:1");
  });
});
