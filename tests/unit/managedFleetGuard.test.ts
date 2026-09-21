import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalFleetRoot = process.env.HERMES3D_FLEET_ROOT;

afterEach(() => {
  if (originalFleetRoot === undefined) delete process.env.HERMES3D_FLEET_ROOT;
  else process.env.HERMES3D_FLEET_ROOT = originalFleetRoot;
  vi.resetModules();
});

describe("managed fleet write guard", () => {
  it("recognizes only IDs from the configured generated manifest", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes3d-fleet-"));
    const rendered = path.join(root, ".local", "rendered");
    fs.mkdirSync(rendered, { recursive: true });
    fs.writeFileSync(
      path.join(rendered, "fleet-status.json"),
      JSON.stringify({ agents: [{ id: "build-agent" }, { id: "qa-agent" }] })
    );
    process.env.HERMES3D_FLEET_ROOT = root;

    const fleet = await import("../../server/managed-fleet.js");
    expect(fleet.isManagedFleetAgent("build-agent")).toBe(true);
    expect(fleet.isManagedFleetAgent("default")).toBe(false);
    expect(fleet.managedProfileWriteError("build-agent")).toContain("validate, preview, and apply");
  });
});
