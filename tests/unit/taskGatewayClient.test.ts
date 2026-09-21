import { describe, expect, it, vi } from "vitest";

import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import { GatewayResponseError } from "@/lib/gateway/errors";
import {
  commentGatewayTask,
  createGatewayTask,
  deleteGatewayTask,
  dispatchGatewayTasks,
  getGatewayTaskActivity,
  getGatewayTaskDetail,
  isUnsupportedTaskGatewayError,
  listGatewayTasks,
  replyAndResumeGatewayTask,
  updateGatewayTask,
} from "@/lib/tasks/gateway";

describe("task gateway client", () => {
  it("lists tasks via tasks.list", async () => {
    const client = {
      call: vi.fn(async () => ({ tasks: [] })),
    } as unknown as GatewayClient;

    await listGatewayTasks(client);

    expect(client.call).toHaveBeenCalledWith("tasks.list", { includeArchived: true });
  });

  it("creates tasks via tasks.create", async () => {
    const client = {
      call: vi.fn(async () => ({ id: "task-1", title: "Ship board", status: "inbox" })),
    } as unknown as GatewayClient;

    await createGatewayTask(client, {
      title: "Ship board",
      description: "Release the board.",
      status: "inbox",
      source: "hermes3d_manual",
      idempotencyKey: "standup:meeting-1:agent-1",
      maxRuntimeSeconds: 3_600,
      goalMode: true,
      goalMaxTurns: 8,
      workspaceKind: "worktree",
    });

    expect(client.call).toHaveBeenCalledWith(
      "tasks.create",
      expect.objectContaining({
        title: "Ship board",
        description: "Release the board.",
        status: "inbox",
        source: "hermes3d_manual",
        idempotencyKey: "standup:meeting-1:agent-1",
        maxRuntimeSeconds: 3_600,
        goalMode: true,
        goalMaxTurns: 8,
        workspaceKind: "worktree",
      })
    );
  });

  it("nudges the Hermes dispatcher with a bounded worker count", async () => {
    const client = {
      call: vi.fn(async () => ({ spawned: [] })),
    } as unknown as GatewayClient;

    await dispatchGatewayTasks(client, { max: 4 });

    expect(client.call).toHaveBeenCalledWith("tasks.dispatch", { max: 4 });
  });

  it("reads bounded worker activity for a Hermes Kanban task", async () => {
    const client = {
      call: vi.fn(async () => ({
        taskId: "kanban:t_1",
        exists: true,
        sizeBytes: 42,
        content: "working",
      })),
    } as unknown as GatewayClient;

    await getGatewayTaskActivity(client, { id: "kanban:t_1", tail: 30_000 });

    expect(client.call).toHaveBeenCalledWith("tasks.activity", {
      id: "kanban:t_1",
      tail: 30_000,
    });
  });

  it("loads, comments on, and resumes a native Hermes task", async () => {
    const client = {
      call: vi.fn(async () => ({
        taskId: "kanban:t_1",
        nativeStatus: "blocked",
        blockKind: "needs_input",
        blockerReason: "Choose a release window.",
        comments: [],
        eventCount: 0,
        runCount: 1,
      })),
    } as unknown as GatewayClient;

    await getGatewayTaskDetail(client, "kanban:t_1");
    await commentGatewayTask(client, {
      id: "kanban:t_1",
      body: "Use Tuesday morning.",
    });
    await replyAndResumeGatewayTask(client, {
      id: "kanban:t_1",
      reply: "Use Tuesday morning.",
    });

    expect(client.call).toHaveBeenNthCalledWith(1, "tasks.show", {
      id: "kanban:t_1",
    });
    expect(client.call).toHaveBeenNthCalledWith(2, "tasks.comment", {
      id: "kanban:t_1",
      body: "Use Tuesday morning.",
    });
    expect(client.call).toHaveBeenNthCalledWith(3, "tasks.unblock", {
      id: "kanban:t_1",
      reply: "Use Tuesday morning.",
    });
  });

  it("updates and deletes tasks via gateway methods", async () => {
    const client = {
      call: vi.fn(async () => ({ ok: true })),
    } as unknown as GatewayClient;

    await updateGatewayTask(client, "task-1", { status: "done" });
    await deleteGatewayTask(client, "task-1");

    expect(client.call).toHaveBeenCalledWith(
      "tasks.update",
      expect.objectContaining({ id: "task-1", status: "done" })
    );
    expect(client.call).toHaveBeenCalledWith("tasks.delete", { id: "task-1" });
  });

  it("detects unsupported task gateway methods", () => {
    expect(
      isUnsupportedTaskGatewayError(
        new GatewayResponseError({
          code: "METHOD_NOT_FOUND",
          message: "Unknown method tasks.list",
        })
      )
    ).toBe(true);
  });
});
