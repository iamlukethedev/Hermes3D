const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const STATE_DIRNAME = ".hermes";

const resolveUserPath = (input) => {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, os.homedir());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
};

const resolveDefaultHomeDir = () => {
  const home = os.homedir();
  if (home) {
    try {
      if (fs.existsSync(home)) return home;
    } catch {}
  }
  return os.tmpdir();
};

const resolveStateDir = (env = process.env) => {
  const override = env.HERMES_STATE_DIR?.trim();
  if (override) return resolveUserPath(override);
  return path.join(resolveDefaultHomeDir(), STATE_DIRNAME);
};

const resolveStudioSettingsPath = (env = process.env) => {
  return path.join(resolveStateDir(env), "hermes3d", "settings.json");
};

const readJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const DEFAULT_GATEWAY_URL = "ws://localhost:18789";
const HERMES_CONFIG_FILENAME = "hermes.json";

const isRecord = (value) => Boolean(value && typeof value === "object");

const readHermesGatewayDefaults = (env = process.env) => {
  try {
    const stateDir = resolveStateDir(env);
    const configPath = path.join(stateDir, HERMES_CONFIG_FILENAME);
    const parsed = readJsonFile(configPath);
    if (!isRecord(parsed)) return null;
    const gateway = isRecord(parsed.gateway) ? parsed.gateway : null;
    if (!gateway) return null;
    const auth = isRecord(gateway.auth) ? gateway.auth : null;
    const token = typeof auth?.token === "string" ? auth.token.trim() : "";
    const port =
      typeof gateway.port === "number" && Number.isFinite(gateway.port) ? gateway.port : null;
    if (!token) return null;
    const url = port ? `ws://localhost:${port}` : "";
    if (!url) return null;
    return { url, token, adapterType: "hermes" };
  } catch {
    return null;
  }
};

const loadUpstreamGatewaySettings = (env = process.env) => {
  const settingsPath = resolveStudioSettingsPath(env);
  const parsed = readJsonFile(settingsPath);
  const gateway = parsed && typeof parsed === "object" ? parsed.gateway : null;
  const configuredUrl = typeof gateway?.url === "string" ? gateway.url.trim() : "";
  const configuredToken = typeof gateway?.token === "string" ? gateway.token.trim() : "";
  const configuredAdapterType =
    typeof gateway?.adapterType === "string" && gateway.adapterType.trim()
      ? gateway.adapterType.trim()
      : "";
  const envUrl = typeof env.HERMES3D_GATEWAY_URL === "string" ? env.HERMES3D_GATEWAY_URL.trim() : "";
  const envToken =
    typeof env.HERMES3D_GATEWAY_TOKEN === "string" ? env.HERMES3D_GATEWAY_TOKEN.trim() : "";
  const envAdapterType =
    typeof env.HERMES3D_GATEWAY_ADAPTER_TYPE === "string"
      ? env.HERMES3D_GATEWAY_ADAPTER_TYPE.trim()
      : "";
  const url = configuredUrl || envUrl;
  const token = configuredToken || envToken;
  const adapterType = configuredAdapterType || envAdapterType || "hermes";
  if (!token && adapterType === "hermes") {
    const defaults = readHermesGatewayDefaults(env);
    if (defaults) {
      return {
        url: url || defaults.url,
        token: defaults.token,
        adapterType,
        settingsPath,
      };
    }
  }
  return {
    url: url || DEFAULT_GATEWAY_URL,
    token,
    adapterType,
    settingsPath,
  };
};

module.exports = {
  resolveStateDir,
  resolveStudioSettingsPath,
  loadUpstreamGatewaySettings,
};
