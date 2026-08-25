import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MANAGED_FILES = [
  "IDENTITY.md",
  "SOUL.md",
  "AGENTS.md",
  "USER.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "MEMORY.md",
  "profile.yaml",
  "config.yaml",
  "SKILLS_ALLOWLIST.json",
] as const;

export type ManagedFleetAgent = {
  id: string;
  displayName: string;
  description: string;
  role: string;
  autonomy: string;
  model: { provider: string; default: string; reasoning_effort: string };
  repositoryScope: string[];
  workspace: { mode: string; write: boolean | string };
  toolPolicy: { allow: string[]; deny: string[] };
  skills: string[];
  memory: {
    curated: string;
    learned: string;
    shared_vaults: string;
    promotion: string;
  };
  heartbeat: { enabled: boolean; responsibility: string };
  approvals: string[];
  prohibited: string[];
  hermes3d: {
    desk: string;
    avatar: string;
    avatar_asset?: string;
    avatar_motion?: "standing" | "floating";
    avatar_fit_node?: string;
    avatar_height?: number;
    avatar_hover?: number;
    colour: string;
    group: string;
  };
};

type FleetStatusFile = {
  version: number;
  fleetId: string;
  sourceHash: string;
  generatedAt: string;
  agents: ManagedFleetAgent[];
};

type DeploymentMarker = {
  appliedAt?: string;
  sourceCommit?: string;
  sourceHash?: string;
  files?: Record<string, string>;
};

export type ManagedProfileHealth = {
  agentId: string;
  status: "current" | "drift" | "not-deployed";
  missingFiles: string[];
  changedFiles: string[];
  deployedHash: string | null;
  deployedCommit: string | null;
  appliedAt: string | null;
};

export type ManagedFleetSnapshot = {
  configured: true;
  fleetId: string;
  version: number;
  sourceHash: string;
  generatedAt: string;
  mutationsEnabled: boolean;
  agents: Array<ManagedFleetAgent & { health: ManagedProfileHealth }>;
  recovery: unknown;
  recoveryError: string | null;
};

export type FleetCommand = "validate" | "diff" | "apply" | "rollback" | "reconcile";

const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

const readJson = <T>(filePath: string): T | null => {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
};

export const resolveFleetRoot = (): string | null => {
  const configured = process.env.HERMES3D_FLEET_ROOT?.trim();
  if (!configured || !path.isAbsolute(configured)) return null;
  const resolved = path.resolve(configured);
  if (!existsSync(path.join(resolved, "scripts", "fleet.py"))) return null;
  return resolved;
};

const resolveHermesHome = () => {
  const configured = process.env.HERMES_HOME?.trim();
  if (configured) return path.resolve(configured);
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) return path.join(localAppData, "hermes");
  return path.join(process.env.HOME ?? process.cwd(), ".hermes");
};

const profileHealth = (agentId: string, sourceHash: string): ManagedProfileHealth => {
  const profileRoot = path.join(resolveHermesHome(), "profiles", agentId);
  const markerPath = path.join(profileRoot, ".fleet-deployment.json");
  const marker = readJson<DeploymentMarker>(markerPath);
  if (!marker) {
    return {
      agentId,
      status: "not-deployed",
      missingFiles: MANAGED_FILES.filter((name) => !existsSync(path.join(profileRoot, name))),
      changedFiles: [],
      deployedHash: null,
      deployedCommit: null,
      appliedAt: null,
    };
  }

  const missingFiles: string[] = [];
  const changedFiles: string[] = [];
  for (const name of MANAGED_FILES) {
    const filePath = path.join(profileRoot, name);
    if (!existsSync(filePath)) {
      missingFiles.push(name);
      continue;
    }
    const expected = marker.files?.[name];
    if (expected && sha256(readFileSync(filePath)) !== expected) changedFiles.push(name);
  }
  if (marker.sourceHash !== sourceHash) changedFiles.push("canonical-source");

  return {
    agentId,
    status: missingFiles.length || changedFiles.length ? "drift" : "current",
    missingFiles,
    changedFiles,
    deployedHash: marker.sourceHash ?? null,
    deployedCommit: marker.sourceCommit ?? null,
    appliedAt: marker.appliedAt ?? null,
  };
};

const commandArgs = (command: FleetCommand) => {
  if (command === "rollback") return ["scripts/fleet.py", "rollback", "--latest"];
  if (command === "reconcile") return ["scripts/fleet.py", "reconcile", "--json"];
  return ["scripts/fleet.py", command];
};

export const runFleetCommand = async (command: FleetCommand) => {
  const root = resolveFleetRoot();
  if (!root) throw new Error("Managed fleet is not configured.");
  try {
    const result = await execFileAsync("python", commandArgs(command), {
      cwd: root,
      env: process.env,
      timeout: command === "apply" || command === "rollback" ? 120_000 : 30_000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    return {
      ok: false,
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout?.trim() ?? "",
      stderr: failure.stderr?.trim() || failure.message,
    };
  }
};

const readRecovery = async () => {
  const result = await runFleetCommand("reconcile");
  const raw = result.stdout;
  try {
    return { recovery: JSON.parse(raw) as unknown, recoveryError: result.ok ? null : result.stderr };
  } catch {
    return { recovery: null, recoveryError: result.stderr || "Recovery report was not valid JSON." };
  }
};

export const readManagedFleetSnapshot = async (): Promise<ManagedFleetSnapshot | null> => {
  const root = resolveFleetRoot();
  if (!root) return null;
  const statusPath = path.join(root, ".local", "rendered", "fleet-status.json");
  const status = readJson<FleetStatusFile>(statusPath);
  if (!status || !Array.isArray(status.agents)) return null;
  const { recovery, recoveryError } = await readRecovery();
  return {
    configured: true,
    fleetId: status.fleetId,
    version: status.version,
    sourceHash: status.sourceHash,
    generatedAt: status.generatedAt,
    mutationsEnabled: process.env.HERMES3D_FLEET_MUTATIONS === "1",
    agents: status.agents.map((agent) => ({
      ...agent,
      health: profileHealth(agent.id, status.sourceHash),
    })),
    recovery,
    recoveryError,
  };
};

export const listFleetBackups = () => {
  const backups = path.join(resolveHermesHome(), "fleet-backups");
  if (!existsSync(backups)) return [];
  return readdirSync(backups)
    .map((name) => path.join(backups, name))
    .filter(
      (entry) =>
        !path.basename(entry).startsWith(".") &&
        statSync(entry).isDirectory() &&
        existsSync(path.join(entry, "backup.json"))
    )
    .sort()
    .reverse()
    .map((entry) => path.basename(entry));
};

export const resolveFleetAvatarAsset = (fileName: string): string | null => {
  if (!/^[a-zA-Z0-9._-]+\.glb$/.test(fileName) || path.basename(fileName) !== fileName) {
    return null;
  }
  const root = resolveFleetRoot();
  if (!root) return null;
  const assetsRoot = path.resolve(root, "assets", "avatars");
  const candidate = path.resolve(assetsRoot, fileName);
  if (!candidate.startsWith(`${assetsRoot}${path.sep}`) || !existsSync(candidate)) return null;
  return candidate;
};
