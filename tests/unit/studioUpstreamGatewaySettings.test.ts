import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const makeTempDir = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

describe("server studio upstream gateway settings", () => {
  const priorStateDir = process.env.HERMES_STATE_DIR;
  const priorGatewayUrl = process.env.HERMES3D_GATEWAY_URL;
  const priorGatewayToken = process.env.HERMES3D_GATEWAY_TOKEN;
  const priorGatewayAdapterType = process.env.HERMES3D_GATEWAY_ADAPTER_TYPE;
  let tempDir: string | null = null;

  afterEach(() => {
    if (priorStateDir === undefined) delete process.env.HERMES_STATE_DIR;
    else process.env.HERMES_STATE_DIR = priorStateDir;
    if (priorGatewayUrl === undefined) delete process.env.HERMES3D_GATEWAY_URL;
    else process.env.HERMES3D_GATEWAY_URL = priorGatewayUrl;
    if (priorGatewayToken === undefined) delete process.env.HERMES3D_GATEWAY_TOKEN;
    else process.env.HERMES3D_GATEWAY_TOKEN = priorGatewayToken;
    if (priorGatewayAdapterType === undefined) delete process.env.HERMES3D_GATEWAY_ADAPTER_TYPE;
    else process.env.HERMES3D_GATEWAY_ADAPTER_TYPE = priorGatewayAdapterType;
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("falls back to hermes.json token/port when studio settings are missing", async () => {
    tempDir = makeTempDir("studio-upstream-hermes-defaults");
    process.env.HERMES_STATE_DIR = tempDir;

    fs.writeFileSync(
      path.join(tempDir, "hermes.json"),
      JSON.stringify({ gateway: { port: 18790, auth: { token: "tok" } } }, null, 2),
      "utf8"
    );

    const { loadUpstreamGatewaySettings } = await import("../../server/studio-settings");
    const settings = loadUpstreamGatewaySettings(process.env);
    expect(settings.url).toBe("ws://localhost:18790");
    expect(settings.token).toBe("tok");
  });

  it("keeps a configured url and fills token from hermes.json when missing", async () => {
    tempDir = makeTempDir("studio-upstream-url-keep");
    process.env.HERMES_STATE_DIR = tempDir;

    fs.mkdirSync(path.join(tempDir, "hermes3d"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "hermes3d", "settings.json"),
      JSON.stringify({ gateway: { url: "ws://gateway.example:18789", token: "" } }, null, 2),
      "utf8"
    );
    fs.writeFileSync(
      path.join(tempDir, "hermes.json"),
      JSON.stringify({ gateway: { port: 18789, auth: { token: "tok-local" } } }, null, 2),
      "utf8"
    );

    const { loadUpstreamGatewaySettings } = await import("../../server/studio-settings");
    const settings = loadUpstreamGatewaySettings(process.env);
    expect(settings.url).toBe("ws://gateway.example:18789");
    expect(settings.token).toBe("tok-local");
  });

  it("loads gateway settings from documented environment variables", async () => {
    tempDir = makeTempDir("studio-upstream-env");
    process.env.HERMES_STATE_DIR = tempDir;
    process.env.HERMES3D_GATEWAY_URL = "ws://env.example:9120";
    process.env.HERMES3D_GATEWAY_TOKEN = "env-token";
    process.env.HERMES3D_GATEWAY_ADAPTER_TYPE = "hermes-agent";

    const { loadUpstreamGatewaySettings } = await import("../../server/studio-settings");
    const settings = loadUpstreamGatewaySettings(process.env);
    expect(settings).toEqual({
      url: "ws://env.example:9120",
      token: "env-token",
      adapterType: "hermes-agent",
      settingsPath: path.join(tempDir, "hermes3d", "settings.json"),
    });
  });
});
