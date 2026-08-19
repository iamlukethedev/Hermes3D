import { describe, expect, it } from "vitest";

import {
  hasBlockingUpstreamUrlFinding,
  inspectUpstreamGatewayUrl,
} from "@/lib/gateway/upstreamUrlDiagnostics";
import {
  buildGatewayWarnings,
  inspectUpstreamGatewayUrl as inspectUpstreamGatewayUrlFromDoctor,
} from "../../scripts/lib/hermes3doctor-core.mjs";

const codesFor = (url: string) => inspectUpstreamGatewayUrl(url).map((finding) => finding.code);

describe("upstream gateway URL diagnostics", () => {
  it("accepts the adapter endpoints Hermes3D actually speaks to", () => {
    expect(codesFor("ws://localhost:18789")).toEqual([]);
    expect(codesFor("wss://luke-hermes.taildb786a.ts.net")).toEqual([]);
    expect(codesFor("wss://luke-hermes.taildb786a.ts.net:443")).toEqual([]);
  });

  it("ignores empty and unparseable values", () => {
    expect(codesFor("")).toEqual([]);
    expect(codesFor("   ")).toEqual([]);
    expect(codesFor("not a url")).toEqual([]);
  });

  it("flags the hermes-agent dashboard port", () => {
    expect(codesFor("wss://luke-hermes.taildb786a.ts.net:9119")).toContain(
      "hermes_agent_dashboard_port",
    );
  });

  it("flags the hermes-agent JSON-RPC websocket path", () => {
    expect(codesFor("ws://100.64.0.1:1234/api/ws")).toEqual(["hermes_agent_jsonrpc_path"]);
    expect(codesFor("ws://100.64.0.1:1234/api/ws/")).toEqual(["hermes_agent_jsonrpc_path"]);
  });

  it("does not confuse the Studio proxy path with the hermes-agent path", () => {
    expect(codesFor("ws://localhost:3000/api/gateway/ws")).toEqual([]);
  });

  it("stays quiet when the hermes-agent adapter targets that endpoint on purpose", () => {
    // The JSON-RPC path and the dashboard port are the correct destination for
    // this adapter, so the rules that reject them elsewhere must stand down.
    const served = "wss://luke-hermes.taildb786a.ts.net:8443/api/ws";
    expect(codesFor(served)).toContain("hermes_agent_jsonrpc_path");
    expect(inspectUpstreamGatewayUrl(served, "hermes-agent")).toEqual([]);
    expect(inspectUpstreamGatewayUrlFromDoctor(served, "hermes-agent")).toEqual([]);

    const local = "http://localhost:9119";
    expect(codesFor(local)).toContain("hermes_agent_dashboard_port");
    expect(inspectUpstreamGatewayUrl(local, "hermes-agent")).toEqual([]);
    expect(
      buildGatewayWarnings({ gatewayUrl: local, adapterType: "hermes-agent" }),
    ).not.toContainEqual(expect.stringContaining("dashboard"));
  });

  it("still warns the hermes-agent adapter about a non-TLS tailnet port", () => {
    // Suppressing the endpoint rules must not suppress this one: wss:// against
    // a port Tailscale does not terminate TLS on fails for either adapter.
    expect(
      inspectUpstreamGatewayUrl("wss://luke-hermes.taildb786a.ts.net:9119", "hermes-agent").map(
        (finding) => finding.code,
      ),
    ).toEqual(["tls_on_plain_tailnet_port"]);
  });

  it("flags the Hermes OpenAI-compatible API port", () => {
    expect(codesFor("ws://localhost:8642")).toEqual(["hermes_openai_api_port"]);
  });

  it("warns when wss:// targets a tailnet port Tailscale cannot terminate TLS on", () => {
    expect(codesFor("wss://box.ts.net:18789")).toEqual(["tls_on_plain_tailnet_port"]);
    expect(codesFor("wss://box.ts.net:8443")).toEqual([]);
    expect(codesFor("ws://box.ts.net:18789")).toEqual([]);
  });

  it("reports every problem with the URL from the original report", () => {
    const findings = inspectUpstreamGatewayUrl("wss://luke-hermes.taildb786a.ts.net:9119");
    expect(findings.map((finding) => finding.code)).toEqual([
      "hermes_agent_dashboard_port",
      "tls_on_plain_tailnet_port",
    ]);
    expect(hasBlockingUpstreamUrlFinding(findings)).toBe(true);
  });

  it("treats warning-only results as non-blocking", () => {
    expect(hasBlockingUpstreamUrlFinding(inspectUpstreamGatewayUrl("wss://box.ts.net:18789"))).toBe(
      false,
    );
  });

  it("keeps the doctor mirror in sync with the app implementation", () => {
    const urls = [
      "",
      "not a url",
      "ws://localhost:18789",
      "ws://localhost:8642",
      "ws://localhost:3000/api/gateway/ws",
      "ws://100.64.0.1:1234/api/ws",
      "wss://box.ts.net",
      "wss://box.ts.net:443",
      "wss://box.ts.net:8443",
      "wss://box.ts.net:18789",
      "wss://ts.net:18789",
      "wss://luke-hermes.taildb786a.ts.net:9119",
    ];
    for (const url of urls) {
      expect(inspectUpstreamGatewayUrlFromDoctor(url), `mismatch for ${url || "(empty)"}`).toEqual(
        inspectUpstreamGatewayUrl(url),
      );
    }
  });

  it("surfaces the findings through doctor gateway warnings", () => {
    const warnings = buildGatewayWarnings({
      gatewayUrl: "wss://luke-hermes.taildb786a.ts.net:9119",
    });
    expect(warnings.some((warning: string) => warning.includes("hermes-agent dashboard"))).toBe(
      true,
    );
    expect(warnings.some((warning: string) => warning.includes("npm run hermes-adapter"))).toBe(
      true,
    );
  });
});
