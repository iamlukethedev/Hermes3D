import { describe, expect, it } from "vitest";

import { shouldApplyKanbanTaskBlocker } from "@/lib/office/standup/service";

describe("standup task source selection", () => {
  it("does not attach an unrelated old Kanban blocker to a manual task", () => {
    expect(
      shouldApplyKanbanTaskBlocker({
        manualTask: "SumUp Webhook & Credit Refund Tier-2 Automation",
        kanbanTask: "Fix: Connect beta invite wave selection",
        kanbanBlocker: "Task is blocked in Kanban",
      }),
    ).toBe(false);
  });

  it("keeps the blocker when the Kanban task is the selected task", () => {
    expect(
      shouldApplyKanbanTaskBlocker({
        manualTask: "",
        kanbanTask: "Fix: Connect beta invite wave selection",
        kanbanBlocker: "Task is blocked in Kanban",
      }),
    ).toBe(true);
  });

  it("keeps the blocker when manual configuration names the same Kanban task", () => {
    expect(
      shouldApplyKanbanTaskBlocker({
        manualTask: " Fix: Connect beta invite wave selection ",
        kanbanTask: "fix: connect beta invite wave selection",
        kanbanBlocker: "Task is blocked in Kanban",
      }),
    ).toBe(true);
  });
});
