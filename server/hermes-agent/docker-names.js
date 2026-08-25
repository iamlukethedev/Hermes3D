const { execFile } = require("node:child_process");

const LEGACY_HERMES_CONTAINER_NAME = /^hermes-([a-f0-9]{8})$/i;
const DOCKER_NAME_LIMIT = 128;
const DEFAULT_SYNC_INTERVAL_MS = 5_000;
const DOCKER_LIST_FORMAT =
  '{{.Names}}\t{{.Label "hermes-profile"}}\t{{.Label "hermes-task-id"}}';

const asErrorMessage = (error) => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return String(error || "Unknown Docker error");
};

const isEnabled = (raw) =>
  ["1", "true", "yes", "on"].includes(String(raw || "").trim().toLowerCase());

const sanitizeDockerNameSegment = (raw, fallback, maxLength = 40) => {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .replace(/-{2,}/g, "-");
  return (normalized || fallback).slice(0, maxLength).replace(/[_.-]+$/g, "") || fallback;
};

const formatTaskSegment = (taskId) => {
  const normalized = String(taskId || "").trim().toLowerCase();
  if (!normalized || normalized === "default") return "default";
  if (normalized === "prompt-backend-probe") return "probe";
  return sanitizeDockerNameSegment(normalized.replace(/^t_/, "t-"), "task", 48);
};

const buildReadableHermesContainerName = ({ currentName, profile, taskId }) => {
  const match = String(currentName || "").trim().match(LEGACY_HERMES_CONTAINER_NAME);
  if (!match) return null;

  const suffix = match[1].toLowerCase();
  const profileSegment = sanitizeDockerNameSegment(profile, "default", 32);
  const taskSegment = formatTaskSegment(taskId);
  const fixedLength = "hermes---".length + profileSegment.length + suffix.length;
  const taskBudget = Math.max(8, DOCKER_NAME_LIMIT - fixedLength);
  const boundedTask = taskSegment.slice(0, taskBudget).replace(/[_.-]+$/g, "") || "task";
  return `hermes-${profileSegment}-${boundedTask}-${suffix}`;
};

const parseHermesContainerRows = (stdout) =>
  String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [currentName = "", profile = "", taskId = ""] = line.split("\t");
      return { currentName, profile, taskId };
    });

const runDocker = (args) =>
  new Promise((resolve, reject) => {
    execFile(
      "docker",
      args,
      { windowsHide: true, encoding: "utf8", timeout: 15_000 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });

const syncReadableHermesContainerNames = async ({ docker = runDocker } = {}) => {
  const stdout = await docker([
    "ps",
    "-a",
    "--filter",
    "label=hermes-agent=1",
    "--format",
    DOCKER_LIST_FORMAT,
  ]);
  const renamed = [];
  for (const row of parseHermesContainerRows(stdout)) {
    const desiredName = buildReadableHermesContainerName(row);
    if (!desiredName || desiredName === row.currentName) continue;
    await docker(["rename", row.currentName, desiredName]);
    renamed.push({ from: row.currentName, to: desiredName });
  }
  return renamed;
};

const startReadableHermesContainerNameSync = ({
  enabled = isEnabled(process.env.HERMES3D_READABLE_DOCKER_NAMES),
  docker = runDocker,
  intervalMs = DEFAULT_SYNC_INTERVAL_MS,
  log = console.info,
  logError = console.warn,
} = {}) => {
  if (!enabled) return () => {};

  let stopped = false;
  let inFlight = false;
  let errorReported = false;
  const refresh = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const renamed = await syncReadableHermesContainerNames({ docker });
      for (const item of renamed) {
        log(`[docker-names] ${item.from} -> ${item.to}`);
      }
      errorReported = false;
    } catch (error) {
      if (!errorReported) {
        logError(`[docker-names] readable Hermes names unavailable: ${asErrorMessage(error)}`);
        errorReported = true;
      }
    } finally {
      inFlight = false;
    }
  };

  void refresh();
  const timer = setInterval(() => void refresh(), Math.max(1_000, intervalMs));
  if (typeof timer.unref === "function") timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
};

module.exports = {
  DOCKER_LIST_FORMAT,
  buildReadableHermesContainerName,
  isEnabled,
  parseHermesContainerRows,
  sanitizeDockerNameSegment,
  startReadableHermesContainerNameSync,
  syncReadableHermesContainerNames,
};
