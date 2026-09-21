// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  TASK_BOARD_STATUSES,
  isTaskBoardStatus,
} from "../../src/features/office/tasks/types";

const {
  KANBAN_TASK_ID_PREFIX,
  toHermes3dKanbanTaskDetail,
  toHermes3dKanbanTaskRecord,
  toHermes3dKanbanTasks,
  toKanbanCreateBody,
  toManagedFleetIntakeBody,
  toManagedFleetPatchBody,
  toKanbanPatchBody,
  kanbanOriginFromWsUrl,
} = await import("../../server/hermes-agent/kanban");

const HERMES_STATUSES = [
  "triage",
  "todo",
  "scheduled",
  "ready",
  "running",
  "blocked",
  "review",
  "done",
  "archived",
] as const;

const sampleTask = (overrides: Record<string, unknown> = {}) => ({
  id: "t_4925f3b7",
  title: "Ship the release",
  body: "Cut the tag and publish.",
  assignee: "pr-fixer",
  status: "ready",
  created_at: 1_787_223_224,
  started_at: null,
  completed_at: null,
  last_heartbeat_at: null,
  current_run_id: null,
  session_id: null,
  latest_summary: null,
  result: null,
  last_failure_error: null,
  block_kind: null,
  ...overrides,
});

const mustMap = (task: Record<string, unknown>) => {
  const record = toHermes3dKanbanTaskRecord(task);
  expect(record).not.toBeNull();
  return record as NonNullable<typeof record>;
};

describe("toHermes3dKanbanTaskRecord", () => {
  it("maps every hermes status onto a valid office column", () => {
    for (const status of HERMES_STATUSES) {
      const record = mustMap(sampleTask({ status }));
      expect(isTaskBoardStatus(record.status)).toBe(true);
    }
  });

  it("keeps dispatcher truth visible: running is the only working column", () => {
    for (const status of HERMES_STATUSES) {
      const record = mustMap(sampleTask({ status }));
      expect(record.status === "working").toBe(status === "running");
    }
  });

  it("prefixes the id and converts epoch seconds to ISO timestamps", () => {
    const record = mustMap(sampleTask({ current_run_id: 15 }));
    expect(record.id).toBe(`${KANBAN_TASK_ID_PREFIX}t_4925f3b7`);
    expect(record.createdAt).toBe(new Date(1_787_223_224 * 1000).toISOString());
    expect(record.channel).toBe("kanban");
    expect(record.assignedAgentId).toBe("pr-fixer");
    expect(record.runId).toBe("15");
    expect(record.archived).toBe(false);
  });

  it("marks archived tasks and surfaces summaries as notes", () => {
    const record = mustMap(
      sampleTask({
        status: "archived",
        latest_summary: "Merged and deployed.",
        result: "All checks green.",
      }),
    );
    expect(record.archived).toBe(true);
    expect(record.notes).toEqual([
      "Merged and deployed.",
      "Result: All checks green.",
    ]);
  });

  it("rejects rows without an id or title", () => {
    expect(toHermes3dKanbanTaskRecord(sampleTask({ id: "" }))).toBeNull();
    expect(toHermes3dKanbanTaskRecord(sampleTask({ title: "  " }))).toBeNull();
    expect(toHermes3dKanbanTaskRecord(null)).toBeNull();
  });
});

describe("toHermes3dKanbanTasks", () => {
  it("flattens the board columns into one task list", () => {
    const board = {
      columns: [
        { name: "todo", tasks: [sampleTask({ id: "t_1", status: "todo" })] },
        { name: "running", tasks: [sampleTask({ id: "t_2", status: "running" })] },
        { name: "done", tasks: [] },
      ],
    };
    const tasks = toHermes3dKanbanTasks(board);
    expect(tasks.map((task) => task.id)).toEqual([
      `${KANBAN_TASK_ID_PREFIX}t_1`,
      `${KANBAN_TASK_ID_PREFIX}t_2`,
    ]);
  });

  it("returns an empty list for malformed payloads", () => {
    expect(toHermes3dKanbanTasks(null)).toEqual([]);
    expect(toHermes3dKanbanTasks({})).toEqual([]);
    expect(toHermes3dKanbanTasks({ columns: [{ tasks: [{}] }] })).toEqual([]);
  });
});

describe("toKanbanPatchBody", () => {
  it("maps every office column to a status a human may set upstream", () => {
    // PATCH rejects `running` — only the dispatcher claims into it. Dragging
    // toward "working" must queue the task as `ready` instead.
    for (const status of TASK_BOARD_STATUSES) {
      const body = toKanbanPatchBody({ status });
      expect(body.status).toBeDefined();
      expect(body.status).not.toBe("running");
    }
    expect(toKanbanPatchBody({ status: "working" }).status).toBe("ready");
    expect(toKanbanPatchBody({ status: "inbox" }).status).toBe("todo");
    expect(toKanbanPatchBody({ status: "needs_attention" }).status).toBe(
      "blocked",
    );
    expect(toKanbanPatchBody({ status: "done" }).status).toBe("done");
  });

  it("lets the archive flag win over a simultaneous status change", () => {
    expect(toKanbanPatchBody({ status: "working", archived: true }).status).toBe(
      "archived",
    );
  });

  it("maps title, description, and assignee onto the kanban fields", () => {
    expect(
      toKanbanPatchBody({
        title: "  New title ",
        description: "Body text.",
        assignedAgentId: "pr-reviewer",
      }),
    ).toEqual({
      title: "New title",
      body: "Body text.",
      assignee: "pr-reviewer",
    });
    // Explicit unassignment sends the empty string the PATCH API expects.
    expect(toKanbanPatchBody({ assignedAgentId: null }).assignee).toBe("");
    expect(toKanbanPatchBody({})).toEqual({});
  });
});

describe("toKanbanCreateBody", () => {
  it("maps a standup assignment onto the Hermes create API", () => {
    expect(
      toKanbanCreateBody({
        title: "  Verify the release ",
        description: "Run the smoke tests.",
        assignedAgentId: "qa-agent",
        idempotencyKey: "standup:meeting-1:qa-agent",
        maxRuntimeSeconds: 3_600,
        goalMode: true,
        goalMaxTurns: 8,
        workspaceKind: "worktree",
      }),
    ).toEqual({
      title: "Verify the release",
      body: "Run the smoke tests.",
      assignee: "qa-agent",
      idempotency_key: "standup:meeting-1:qa-agent",
      max_runtime_seconds: 3_600,
      goal_mode: true,
      goal_max_turns: 8,
      workspace_kind: "worktree",
    });
  });

  it("keeps native review and typed blocker semantics for the office", () => {
    const record = mustMap(
      sampleTask({
        status: "blocked",
        block_kind: "needs_input",
        last_failure_error: "Choose the release window.",
      }),
    );
    expect(record.nativeStatus).toBe("blocked");
    expect(record.blockKind).toBe("needs_input");
    expect(record.blockerReason).toBe("Choose the release window.");
  });

  it("rejects a create request without a title", () => {
    expect(toKanbanCreateBody({ title: "  " })).toBeNull();
  });

  it("routes managed-fleet standup work to scratch triage without a project", () => {
    const body = toKanbanCreateBody({
      title: "Implement the checkout fix",
      assignedAgentId: "crush-engineer",
      workspaceKind: "worktree",
      workspacePath: "C:/GitHub/HermesProjects/.worktrees/unsafe",
      projectId: "p_untrusted",
    });

    expect(toManagedFleetIntakeBody(body)).toEqual({
      title: "Implement the checkout fix",
      body: "Requested specialist (untrusted intake hint): crush-engineer",
      assignee: "crush-lead",
      triage: true,
      workspace_kind: "scratch",
    });
  });
});

describe("toManagedFleetPatchBody", () => {
  it("keeps wording edits but strips lifecycle and routing mutations", () => {
    const mapped = toKanbanPatchBody({
      title: "  Clarified intake  ",
      description: "Bounded acceptance criteria",
      assignedAgentId: "crush-engineer",
      status: "working",
      archived: true,
    });

    expect(toManagedFleetPatchBody(mapped)).toEqual({
      title: "Clarified intake",
      body: "Bounded acceptance criteria",
    });
  });

  it("turns a managed status-only update into an inert patch", () => {
    expect(toManagedFleetPatchBody(toKanbanPatchBody({ status: "working" }))).toEqual({});
  });
});

describe("toHermes3dKanbanTaskDetail", () => {
  it("maps the task conversation and falls back to the latest BLOCKED comment", () => {
    const detail = toHermes3dKanbanTaskDetail({
      task: sampleTask({ status: "blocked", block_kind: "needs_input" }),
      comments: [
        {
          id: 3,
          author: "build-agent",
          body: "BLOCKED: Which API contract should I preserve?",
          created_at: 1_787_223_300,
        },
      ],
      events: [{ id: 1 }],
      runs: [{ id: 2 }],
    });
    if (!detail) throw new Error("Expected mapped task detail.");

    expect(detail).toEqual(
      expect.objectContaining({
        taskId: `${KANBAN_TASK_ID_PREFIX}t_4925f3b7`,
        nativeStatus: "blocked",
        blockKind: "needs_input",
        blockerReason: "Which API contract should I preserve?",
        eventCount: 1,
        runCount: 1,
      }),
    );
    expect(detail.comments[0]).toEqual(
      expect.objectContaining({
        id: "3",
        author: "build-agent",
        body: "BLOCKED: Which API contract should I preserve?",
      }),
    );
  });
});

describe("kanbanOriginFromWsUrl", () => {
  it("derives the http(s) origin from the gateway WebSocket URL", () => {
    expect(kanbanOriginFromWsUrl("ws://127.0.0.1:9119/api/ws")).toEqual({
      protocol: "http:",
      hostname: "127.0.0.1",
      port: "9119",
    });
    expect(kanbanOriginFromWsUrl("wss://box.ts.net:8443/api/ws")).toEqual({
      protocol: "https:",
      hostname: "box.ts.net",
      port: "8443",
    });
  });
});
