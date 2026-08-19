/**
 * Static checks for the upstream gateway URL a user types into the connect UI.
 *
 * Hermes3D speaks its own gateway protocol: the client opens a socket, sends a
 * `connect` frame, and waits for `hello-ok`. Several nearby Hermes endpoints
 * listen on well-known ports but speak something else entirely, so pointing at
 * them can never succeed no matter which credentials are supplied. Catching
 * those here turns a 13s connect timeout into an explanation.
 *
 * `scripts/lib/hermes3doctor-core.mjs` mirrors these rules for the CLI doctor,
 * which runs under plain node and cannot import TypeScript. `tests/unit/
 * upstreamUrlDiagnostics.test.ts` asserts the two stay in agreement.
 */

export type UpstreamUrlFindingSeverity = "error" | "warning";

export type UpstreamUrlFinding = {
  code: string;
  severity: UpstreamUrlFindingSeverity;
  message: string;
  fix: string;
};

/** Default port of the hermes-agent dashboard / JSON-RPC gateway. */
export const HERMES_AGENT_DASHBOARD_PORT = "9119";

/** Default port of the Hermes OpenAI-compatible HTTP API. */
export const HERMES_OPENAI_API_PORT = "8642";

/** Websocket path served by the hermes-agent dashboard backend. */
export const HERMES_AGENT_WS_PATH = "/api/ws";

/** Ports Tailscale Serve can terminate TLS on. */
const TAILSCALE_TLS_PORTS = new Set(["443", "8443", "10000"]);

const HERMES_AGENT_ENDPOINT_FIX =
  "Hermes3D connects through its own adapter, not the hermes-agent dashboard. " +
  "Run `npm run hermes-adapter` with HERMES_API_URL pointing at the Hermes " +
  "OpenAI-compatible API (port 8642), then connect to the adapter on port 18789.";

const isTailnetHostname = (hostname: string) =>
  hostname === "ts.net" || hostname.endsWith(".ts.net");

export const inspectUpstreamGatewayUrl = (rawUrl: unknown): UpstreamUrlFinding[] => {
  const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!url) return [];

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }

  const findings: UpstreamUrlFinding[] = [];
  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port;
  const path = parsed.pathname.replace(/\/+$/, "");

  if (port === HERMES_AGENT_DASHBOARD_PORT) {
    findings.push({
      code: "hermes_agent_dashboard_port",
      severity: "error",
      message:
        `Port ${HERMES_AGENT_DASHBOARD_PORT} is the hermes-agent dashboard, which speaks ` +
        "JSON-RPC 2.0 over /api/ws with single-use ticket auth. Hermes3D cannot talk to it.",
      fix: HERMES_AGENT_ENDPOINT_FIX,
    });
  }

  if (path === HERMES_AGENT_WS_PATH) {
    findings.push({
      code: "hermes_agent_jsonrpc_path",
      severity: "error",
      message:
        `${HERMES_AGENT_WS_PATH} is the hermes-agent JSON-RPC endpoint, not a Hermes3D gateway.`,
      fix: HERMES_AGENT_ENDPOINT_FIX,
    });
  }

  if (port === HERMES_OPENAI_API_PORT) {
    findings.push({
      code: "hermes_openai_api_port",
      severity: "error",
      message:
        `Port ${HERMES_OPENAI_API_PORT} is the Hermes OpenAI-compatible HTTP API. It serves ` +
        "/v1/chat/completions over HTTP and has no gateway websocket.",
      fix:
        "Set HERMES_API_URL to this address and run `npm run hermes-adapter`, then point the " +
        "gateway URL at the adapter instead.",
    });
  }

  if (protocol === "wss:" && port && !TAILSCALE_TLS_PORTS.has(port) && isTailnetHostname(hostname)) {
    findings.push({
      code: "tls_on_plain_tailnet_port",
      severity: "warning",
      message:
        `wss:// expects TLS, but Tailscale only terminates TLS on ports ${[...TAILSCALE_TLS_PORTS].join(", ")}. ` +
        `Port ${port} on a tailnet host is almost certainly plain HTTP.`,
      fix:
        "Either use ws:// against this port, or expose the service with " +
        "`tailscale serve --https=443 http://127.0.0.1:<port>` and connect to wss://<host> with no port.",
    });
  }

  return findings;
};

export const hasBlockingUpstreamUrlFinding = (findings: readonly UpstreamUrlFinding[]): boolean =>
  findings.some((finding) => finding.severity === "error");
