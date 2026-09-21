import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  readManagedFleetSnapshot,
  resolveFleetAvatarAsset,
  resolveFleetRoot,
} from "@/lib/fleet/managedProfiles";
import { authorizeFleetRequest, fleetSessionHeaders } from "@/lib/fleet/requestAuth";

const savedEnvironment = {
  HERMES3D_FLEET_ROOT: process.env.HERMES3D_FLEET_ROOT,
  HERMES3D_FLEET_MUTATIONS: process.env.HERMES3D_FLEET_MUTATIONS,
  HERMES_HOME: process.env.HERMES_HOME,
  HERMES_DASHBOARD_SESSION_TOKEN: process.env.HERMES_DASHBOARD_SESSION_TOKEN,
};

afterEach(() => {
  for (const [name, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("managed fleet status", () => {
  it("requires the configured same-origin fleet session guard", () => {
    process.env.HERMES_DASHBOARD_SESSION_TOKEN = "test-session-token";
    const allowed = new Request("http://127.0.0.1:3000/api/fleet", {
      headers: { ...fleetSessionHeaders, "sec-fetch-site": "same-origin" },
    });
    const crossOrigin = new Request("http://127.0.0.1:3000/api/fleet", {
      headers: {
        ...fleetSessionHeaders,
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    });
    const missingHeader = new Request("http://127.0.0.1:3000/api/fleet");

    expect(authorizeFleetRequest(allowed)).toEqual({ ok: true });
    expect(authorizeFleetRequest(crossOrigin)).toMatchObject({ ok: false, status: 403 });
    expect(authorizeFleetRequest(missingHeader)).toMatchObject({ ok: false, status: 401 });
  });

  it("returns canonical policy and marks a missing live projection as not deployed", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes3d-managed-source-"));
    const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), "hermes3d-managed-live-"));
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(root, ".local", "rendered"), { recursive: true });
    fs.mkdirSync(path.join(root, "assets", "avatars"), { recursive: true });
    fs.writeFileSync(path.join(root, "assets", "avatars", "agent.glb"), "model");
    fs.writeFileSync(
      path.join(root, "scripts", "fleet.py"),
      "import json\nprint(json.dumps({'counts': {}, 'tasks': []}))\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, ".local", "rendered", "fleet-status.json"),
      JSON.stringify({
        version: 1,
        fleetId: "test-fleet",
        sourceHash: "abc123",
        generatedAt: "2026-08-25T00:00:00Z",
        agents: [
          {
            id: "build-agent",
            displayName: "Build Agent",
            description: "Implementation worker",
            role: "Engineer",
            autonomy: "pr-worker",
            model: { provider: "openai-codex", default: "gpt", reasoning_effort: "high" },
            repositoryScope: ["hermes3d"],
            workspace: { mode: "assigned-worktree-only", write: true },
            toolPolicy: { allow: ["terminal"], deny: ["merge"] },
            skills: ["software-development"],
            memory: {
              curated: "MEMORY.md",
              learned: "local-unverified",
              shared_vaults: "ro",
              promotion: "human-approved",
            },
            heartbeat: { enabled: false, responsibility: "dispatched-work-only" },
            approvals: ["high-risk-promotion"],
            prohibited: ["merge", "deploy"],
            hermes3d: { desk: "desk_1", avatar: "engineer", colour: "#000", group: "HQ" },
          },
        ],
      }),
      "utf8"
    );
    process.env.HERMES3D_FLEET_ROOT = root;
    process.env.HERMES_HOME = hermesHome;
    process.env.HERMES3D_FLEET_MUTATIONS = "1";

    expect(resolveFleetRoot()).toBe(path.resolve(root));
    expect(resolveFleetAvatarAsset("agent.glb")).toBe(
      path.join(path.resolve(root), "assets", "avatars", "agent.glb")
    );
    expect(resolveFleetAvatarAsset("../secret.glb")).toBeNull();
    const snapshot = await readManagedFleetSnapshot();
    expect(snapshot?.fleetId).toBe("test-fleet");
    expect(snapshot?.mutationsEnabled).toBe(true);
    expect(snapshot?.agents[0].health.status).toBe("not-deployed");
    expect(snapshot?.agents[0].health.missingFiles).toContain("SOUL.md");
    expect(snapshot?.recovery).toEqual({ counts: {}, tasks: [] });
  });
});
