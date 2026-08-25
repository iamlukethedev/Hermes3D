import { describe, expect, it, vi } from "vitest";

import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import { installPackagedSkillViaGatewayAgent } from "@/lib/skills/install-gateway";

describe("skills install gateway", () => {
  it("uses the Hermes Agent direct installer when skill status omits workspace paths", async () => {
    const call = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      expect(method).toBe("skills.packaged.install");
      expect(params).toMatchObject({
        agentId: "build-agent",
        skillKey: "task-manager",
      });
      expect(params?.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ relativePath: "SKILL.md" }),
        ]),
      );
      return {
        installed: true,
        installedPath:
          "C:\\Users\\Utilisateur\\AppData\\Local\\hermes\\profiles\\build-agent\\skills\\task-manager",
        source: "hermes-workspace",
        skillKey: "task-manager",
      };
    });
    const client = {
      call,
      getLastHello: () => ({
        features: { methods: ["skills.status", "skills.packaged.install"] },
      }),
    } as unknown as GatewayClient;

    const result = await installPackagedSkillViaGatewayAgent({
      client,
      request: {
        packageId: "task-manager",
        source: "hermes-workspace",
        workspaceDir: undefined as unknown as string,
        managedSkillsDir: undefined as unknown as string,
        agentId: "build-agent",
        agentName: "Build-agent",
      },
    });

    expect(result).toMatchObject({
      installed: true,
      skillKey: "task-manager",
      source: "hermes-workspace",
    });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("creates a temporary installer agent and installs a workspace skill", async () => {
    const call = vi.fn(async (method: string) => {
      if (method === "agents.create") {
        return { agentId: "installer-1" };
      }
      if (method === "config.get") {
        return {
          exists: true,
          hash: "hash-1",
          config: {
            agents: {
              list: [{ id: "installer-1", tools: {} }],
            },
          },
        };
      }
      if (method === "config.set") {
        return { ok: true };
      }
      if (method === "config.patch") {
        return { ok: true };
      }
      if (method === "agents.list") {
        return { mainKey: "main" };
      }
      if (method === "chat.send") {
        return { runId: "run-1", status: "started" };
      }
      if (method === "agent.wait") {
        return { ok: true };
      }
      throw new Error(`Unexpected method: ${method}`);
    });

    const result = await installPackagedSkillViaGatewayAgent({
      client: { call } as unknown as GatewayClient,
      request: {
        packageId: "todo-board",
        source: "hermes-workspace",
        workspaceDir: "/home/hermes/workspace-demo",
        managedSkillsDir: "/home/hermes/.hermes/skills",
      },
    });

    expect(result).toEqual({
      installed: true,
      installedPath: "/home/hermes/workspace-demo/skills/todo-board",
      source: "hermes-workspace",
      skillKey: "todo-board",
    });
    expect(call).toHaveBeenCalledWith("agents.create", {
      name: expect.stringContaining("Skill Installer"),
      workspace: "/home/hermes/workspace-demo",
    });
    expect(call).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        sessionKey: "agent:installer-1:main",
        deliver: false,
      })
    );
    expect(call).toHaveBeenCalledWith("agent.wait", { runId: "run-1", timeoutMs: 60_000 });
    expect(call).toHaveBeenCalledWith(
      "config.patch",
      expect.objectContaining({
        baseHash: "hash-1",
      })
    );
  });

  it("cleans up the temporary installer agent when install fails", async () => {
    const call = vi.fn(async (method: string) => {
      if (method === "agents.create") {
        return { agentId: "installer-2" };
      }
      if (method === "config.get") {
        return {
          exists: true,
          hash: "hash-2",
          config: {
            agents: {
              list: [{ id: "installer-2", tools: {} }],
            },
          },
        };
      }
      if (method === "config.set") {
        return { ok: true };
      }
      if (method === "agents.list") {
        return { mainKey: "main" };
      }
      if (method === "chat.send") {
        throw new Error("chat failed");
      }
      if (method === "config.patch") {
        return { ok: true };
      }
      throw new Error(`Unexpected method: ${method}`);
    });

    await expect(
      installPackagedSkillViaGatewayAgent({
        client: { call } as unknown as GatewayClient,
        request: {
          packageId: "todo-board",
          source: "hermes-workspace",
          workspaceDir: "/home/hermes/workspace-demo",
          managedSkillsDir: "/home/hermes/.hermes/skills",
        },
      })
    ).rejects.toThrow("chat failed");

    expect(call).toHaveBeenCalledWith(
      "config.patch",
      expect.objectContaining({
        baseHash: "hash-2",
      })
    );
  });

  it("rejects installs when the gateway reports the global root workspace", async () => {
    const call = vi.fn();

    await expect(
      installPackagedSkillViaGatewayAgent({
        client: { call } as unknown as GatewayClient,
        request: {
          packageId: "todo-board",
          source: "hermes-workspace",
          workspaceDir: "/home/pi/.hermes/workspace",
          managedSkillsDir: "/home/pi/.hermes/skills",
          agentId: "soundhermes",
          agentName: "soundhermes",
        },
      })
    ).rejects.toThrow(/gateway root workspace/i);

    expect(call).toHaveBeenCalledTimes(3);
    expect(call).toHaveBeenNthCalledWith(1, "agents.files.get", {
      agentId: "soundhermes",
      name: "IDENTITY.md",
    });
  });

  it("repairs the workspace from agent file provenance before creating the installer agent", async () => {
    const call = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === "agents.files.get") {
        expect(params).toEqual({ agentId: "main", name: "IDENTITY.md" });
        return {
          workspace: "/home/pi/.hermes/workspace",
          file: {
            missing: false,
            content: "# IDENTITY",
            path: "/home/pi/.hermes/workspace-main/IDENTITY.md",
          },
        };
      }
      if (method === "agents.create") {
        return { agentId: "installer-3" };
      }
      if (method === "config.get") {
        return {
          exists: true,
          hash: "hash-3",
          config: {
            agents: {
              list: [{ id: "installer-3", tools: {} }],
            },
          },
        };
      }
      if (method === "config.set") {
        return { ok: true };
      }
      if (method === "config.patch") {
        return { ok: true };
      }
      if (method === "agents.list") {
        return { mainKey: "main" };
      }
      if (method === "chat.send") {
        return { runId: "run-3", status: "started" };
      }
      if (method === "agent.wait") {
        return { ok: true };
      }
      throw new Error(`Unexpected method: ${method}`);
    });

    const result = await installPackagedSkillViaGatewayAgent({
      client: { call } as unknown as GatewayClient,
      request: {
        packageId: "todo-board",
        source: "hermes-workspace",
        workspaceDir: "/home/pi/.hermes/workspace",
        managedSkillsDir: "/home/pi/.hermes/skills",
        agentId: "main",
        agentName: "main",
      },
    });

    expect(result.installedPath).toBe("/home/pi/.hermes/workspace-main/skills/todo-board");
    expect(call).toHaveBeenCalledWith("agents.create", {
      name: expect.stringContaining("Skill Installer"),
      workspace: "/home/pi/.hermes/workspace-main",
    });
  });
});
