import { describe, expect, it } from "vitest";

import type { AgentState } from "@/features/agents/state/store";
import { buildOfficeDeskMonitor } from "@/lib/office/deskMonitor";

const createAgent = (overrides?: Partial<AgentState>): AgentState => ({
  agentId: "agent-1",
  name: "Agent One",
  sessionKey: "agent:agent-1:main",
  status: "idle",
  sessionCreated: true,
  awaitingUserInput: false,
  hasUnseenActivity: false,
  outputLines: [],
  lastResult: null,
  lastDiff: null,
  runId: null,
  runStartedAt: null,
  streamText: null,
  thinkingTrace: null,
  latestOverride: null,
  latestOverrideKind: null,
  lastAssistantMessageAt: null,
  lastActivityAt: null,
  latestPreview: null,
  lastUserMessage: null,
  draft: "",
  queuedMessages: [],
  sessionSettingsSynced: true,
  historyLoadedAt: null,
  historyFetchLimit: null,
  historyFetchedCount: null,
  historyMaybeTruncated: false,
  toolCallingEnabled: true,
  showThinkingTraces: true,
  transcriptEntries: [],
  transcriptRevision: 0,
  transcriptSequenceCounter: 0,
  sessionEpoch: 0,
  lastHistoryRequestRevision: null,
  lastAppliedHistoryRequestId: null,
  model: "openai/gpt-5",
  thinkingLevel: "medium",
  avatarSeed: null,
  avatarUrl: null,
  ...(overrides ?? {}),
});

describe("buildOfficeDeskMonitor", () => {
  it("builds a live coding monitor from runtime state", () => {
    const monitor = buildOfficeDeskMonitor(
      createAgent({
        status: "running",
        outputLines: ["> implement a desk monitor."],
        streamText: "Updating the office scene right now.",
        thinkingTrace: "Scanning camera controls.",
        latestPreview: "Updating the office scene.",
        lastActivityAt: 1_000,
      }),
    );

    expect(monitor.mode).toBe("coding");
    expect(monitor.live).toBe(true);
    expect(monitor.entries.some((entry) => entry.kind === "user")).toBe(true);
    expect(
      monitor.entries.some(
        (entry) =>
          entry.kind === "assistant" &&
          entry.text.includes("Updating the office scene"),
      ),
    ).toBe(true);
  });

  it("shows live Kanban worker logs even when the chat session is idle", () => {
    const monitor = buildOfficeDeskMonitor(createAgent(), {
      taskId: "kanban:t_1",
      taskTitle: "Review the release",
      taskStatus: "working",
      runId: "31",
      logContent:
        "Query: work kanban task t_1\n\u001b[2;3m**Inspecting the repository**\u001b[0m\n┊ 💻 $ git status  0.3s",
      updatedAt: 3_000,
    });

    expect(monitor.mode).toBe("coding");
    expect(monitor.live).toBe(true);
    expect(monitor.subtitle).toContain("Review the release");
    expect(monitor.task).toEqual({
      id: "kanban:t_1",
      title: "Review the release",
      status: "working",
      runId: "31",
    });
    expect(monitor.editor).toBeNull();
    expect(monitor.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "thinking", text: "Inspecting the repository" }),
        expect.objectContaining({ kind: "tool", text: expect.stringContaining("git status") }),
      ]),
    );
  });

  it("keeps a useful Kanban activity history instead of only the last six lines", () => {
    const logLines = [
      "# Dispatch",
      "# ------------------------------",
      ...Array.from({ length: 12 }, (_, index) => `**Progress update ${index + 1}**`),
    ];
    const monitor = buildOfficeDeskMonitor(createAgent(), {
      taskId: "kanban:t_2",
      taskTitle: "Implement the verified fix",
      logContent: logLines.join("\n"),
      updatedAt: 4_000,
    });

    expect(monitor.entries).toHaveLength(13);
    expect(monitor.entries.some((entry) => entry.text.includes("---"))).toBe(false);
    expect(monitor.entries[0]).toMatchObject({ text: "# Dispatch" });
    expect(monitor.entries.at(-1)).toMatchObject({
      kind: "thinking",
      text: "Progress update 12",
    });
  });

  it("keeps a completed Kanban transcript without presenting it as live", () => {
    const monitor = buildOfficeDeskMonitor(createAgent(), {
      taskId: "kanban:t_done",
      taskTitle: "Verify the completed fix",
      taskStatus: "done",
      runId: "32",
      logContent: "**Tests passed**\n┊ 💻 $ git status",
      updatedAt: 5_000,
    });

    expect(monitor.task?.status).toBe("done");
    expect(monitor.live).toBe(false);
    expect(monitor.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Tests passed", live: false }),
      ]),
    );
  });

  it("detects browser activity and extracts the current url", () => {
    const monitor = buildOfficeDeskMonitor(
      createAgent({
        status: "running",
        outputLines: [
          "[[tool]] browser.navigate\nurl: https://example.com/dashboard",
          "[[tool-result]] browser.navigate\nNavigation complete.",
        ],
        latestPreview: "Browsing example.com.",
        lastActivityAt: 2_000,
      }),
    );

    expect(monitor.mode).toBe("browser");
    expect(monitor.browserUrl).toBe("https://example.com/dashboard");
    expect(monitor.subtitle).toContain("example.com");
  });

  it("builds a fake editor document for coding mode", () => {
    const monitor = buildOfficeDeskMonitor(
      createAgent({
        status: "running",
        lastUserMessage: "Create a contact form page",
        outputLines: ["> Create a contact form page"],
        latestPreview: "Building the contact form page.",
      }),
    );

    expect(monitor.mode).toBe("coding");
    expect(monitor.editor?.fileName).toBe("ContactForm.tsx");
    expect(
      monitor.editor?.lines.some((line) => line.includes("Contact us")),
    ).toBe(true);
  });

  it("uses waiting mode when the agent needs user input", () => {
    const monitor = buildOfficeDeskMonitor(
      createAgent({
        awaitingUserInput: true,
        latestPreview: "Please choose the next step.",
      }),
    );

    expect(monitor.mode).toBe("waiting");
    expect(monitor.title).toBe("Waiting");
  });
});
