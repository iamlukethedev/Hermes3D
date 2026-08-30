import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentAvatarCreatorModal } from "@/features/agents/components/AgentAvatarCreatorModal";
import { createDefaultAgentAvatarProfile } from "@/lib/avatars/profile";

vi.mock("@/features/agents/components/AgentAvatarPreview3D", () => ({
  AgentAvatarPreview3D: () => <div data-testid="avatar-preview-3d">preview</div>,
}));

describe("AgentAvatarCreatorModal", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("saves the edited avatar profile", async () => {
    const initialProfile = createDefaultAgentAvatarProfile("seed-a");
    const onSave = vi.fn(async () => {});

    render(
      <AgentAvatarCreatorModal
        open
        agentId="agent-1"
        agentName="Agent One"
        initialProfile={initialProfile}
        onClose={() => {}}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Backpack" }));
    fireEvent.click(screen.getByRole("button", { name: "Save avatar" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        seed: "seed-a",
        accessories: expect.objectContaining({
          backpack: !initialProfile.accessories.backpack,
        }),
      })
    );
  });

  it("applies one of six female presets and keeps it editable", async () => {
    const initialProfile = createDefaultAgentAvatarProfile("seed-a");
    const onSave = vi.fn(async () => {});

    render(
      <AgentAvatarCreatorModal
        open
        agentId="agent-1"
        agentName="Agent One"
        initialProfile={initialProfile}
        onClose={() => {}}
        onSave={onSave}
      />
    );

    expect(screen.getAllByRole("button", { name: /^Apply .+ preset$/ })).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Apply Hot preset" }));
    fireEvent.click(screen.getByRole("button", { name: "Long wave" }));
    fireEvent.click(screen.getByRole("button", { name: "Save avatar" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        seed: initialProfile.seed,
        body: initialProfile.body,
        hair: expect.objectContaining({ style: "long-wave" }),
        clothing: expect.objectContaining({
          topStyle: "tee",
          bottomStyle: "hot-pants",
        }),
        accessories: initialProfile.accessories,
      })
    );
  });
});
