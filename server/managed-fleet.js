"use strict";

const fs = require("node:fs");
const path = require("node:path");

let cachedPath = null;
let cachedMtime = -1;
let cachedAgentIds = new Set();

const resolveFleetStatusPath = () => {
  const root = String(process.env.HERMES3D_FLEET_ROOT || "").trim();
  if (!root || !path.isAbsolute(root)) return null;
  return path.join(path.resolve(root), ".local", "rendered", "fleet-status.json");
};

const readManagedAgentIds = () => {
  const statusPath = resolveFleetStatusPath();
  if (!statusPath) return new Set();
  try {
    const mtime = fs.statSync(statusPath).mtimeMs;
    if (statusPath === cachedPath && mtime === cachedMtime) return cachedAgentIds;
    const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    const ids = Array.isArray(status?.agents)
      ? status.agents
          .map((agent) => (typeof agent?.id === "string" ? agent.id.trim() : ""))
          .filter(Boolean)
      : [];
    cachedPath = statusPath;
    cachedMtime = mtime;
    cachedAgentIds = new Set(ids);
    return cachedAgentIds;
  } catch {
    cachedPath = statusPath;
    cachedMtime = -1;
    cachedAgentIds = new Set();
    return cachedAgentIds;
  }
};

const isManagedFleetAgent = (agentId) => {
  const normalized = typeof agentId === "string" ? agentId.trim() : "";
  return Boolean(normalized) && readManagedAgentIds().has(normalized);
};

const managedProfileWriteError = (agentId) =>
  `Agent ${agentId} is managed by the canonical fleet. Edit the fleet source, then validate, preview, and apply.`;

module.exports = { isManagedFleetAgent, managedProfileWriteError, readManagedAgentIds };
