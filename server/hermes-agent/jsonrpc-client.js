/**
 * JSON-RPC 2.0 WebSocket client for a hermes-agent backend.
 *
 * hermes-agent exposes its gateway at `/api/ws` and speaks JSON-RPC 2.0, one
 * JSON object per WebSocket frame. Requests carry an `id`; events arrive as
 * notifications with `method: "event"` and no `id`. The server emits a
 * `gateway.ready` event immediately after the socket opens.
 *
 * Auth on an ungated (loopback-bound) backend is a session token on the query
 * string. A backend bound to a non-loopback address rejects `?token=` and
 * requires a single-use ticket instead, which this client does not mint.
 */

const { EventEmitter } = require("node:events");
const { WebSocket } = require("ws");

/** hermes-agent serves its JSON-RPC gateway at this path. */
const HERMES_AGENT_WS_PATH = "/api/ws";

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

/** Close code hermes-agent uses when the credential is missing or wrong. */
const CLOSE_AUTH_FAILED = 4401;

/** Close code hermes-agent uses for host, origin, or peer rejection. */
const CLOSE_FORBIDDEN = 4403;

/**
 * Build the `/api/ws` URL from a user-supplied base.
 *
 * Accepts what someone would reasonably paste into the connect screen: a bare
 * origin, an `https://` origin, or a URL that already carries the path.
 */
const buildJsonRpcUrl = (baseUrl, token) => {
  const raw = typeof baseUrl === "string" ? baseUrl.trim() : "";
  if (!raw) throw new Error("hermes-agent URL is empty.");

  const parsed = new URL(raw);

  if (parsed.protocol === "https:") parsed.protocol = "wss:";
  else if (parsed.protocol === "http:") parsed.protocol = "ws:";
  else if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error(`Unsupported scheme "${parsed.protocol}" for a hermes-agent URL.`);
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  if (!path) parsed.pathname = HERMES_AGENT_WS_PATH;

  if (typeof token === "string" && token.trim()) {
    parsed.searchParams.set("token", token.trim());
  }

  return parsed.toString();
};

/** Strip the token so URLs are safe to log. */
const redactUrl = (url) => String(url).replace(/([?&]token=)[^&]*/gi, "$1***");

const describeCloseCode = (code, reason) => {
  if (code === CLOSE_AUTH_FAILED) {
    return (
      "hermes-agent rejected the credential (4401). If the backend is bound to a " +
      "non-loopback address it requires a login rather than a token; publish it " +
      "over Tailscale Serve from a loopback bind so token auth stays available."
    );
  }
  if (code === CLOSE_FORBIDDEN) {
    return (
      "hermes-agent refused the connection (4403). Its embedded chat may be " +
      "disabled, or the Host/Origin did not match the address it was bound to."
    );
  }
  return `hermes-agent closed the connection (${code})${reason ? `: ${reason}` : ""}`;
};

/**
 * Emits:
 *   "ready"  (payload)          — gateway.ready received
 *   "event"  (type, sessionId, payload)
 *   "close"  (code, reason)
 *   "error"  (Error)
 */
class HermesAgentJsonRpcClient extends EventEmitter {
  constructor({ url, token, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, handshakeTimeoutMs }) {
    super();
    this.url = buildJsonRpcUrl(url, token);
    this.requestTimeoutMs = requestTimeoutMs;
    this.handshakeTimeoutMs = handshakeTimeoutMs;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.ready = false;
    this.closed = false;
  }

  connect() {
    this.ws = new WebSocket(this.url, { handshakeTimeout: this.handshakeTimeoutMs });

    this.ws.on("message", (raw) => this._onMessage(raw));

    this.ws.on("close", (code, reasonBuffer) => {
      const reason = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString() : String(reasonBuffer ?? "");
      this._failAllPending(new Error(describeCloseCode(code, reason)));
      this.ready = false;
      this.closed = true;
      this.emit("close", code, reason);
    });

    this.ws.on("error", (err) => {
      this._failAllPending(err instanceof Error ? err : new Error(String(err)));
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    });

    // The upgrade itself can be rejected before any frame arrives; surface the
    // status rather than letting it look like a generic socket error.
    this.ws.on("unexpected-response", (_req, res) => {
      const status = res?.statusCode;
      const message =
        status === 401
          ? describeCloseCode(CLOSE_AUTH_FAILED, "")
          : `hermes-agent rejected the WebSocket upgrade (HTTP ${status}).`;
      this.emit("error", new Error(message));
    });
  }

  _onMessage(raw) {
    let frame;
    try {
      frame = JSON.parse(String(raw ?? ""));
    } catch {
      return;
    }
    if (!frame || typeof frame !== "object") return;

    if (frame.id !== undefined && frame.id !== null) {
      const entry = this.pending.get(frame.id);
      if (!entry) return;
      this.pending.delete(frame.id);
      clearTimeout(entry.timer);
      if (frame.error) {
        const err = new Error(frame.error.message || "hermes-agent returned an error");
        err.code = frame.error.code;
        err.data = frame.error.data;
        entry.reject(err);
      } else {
        entry.resolve(frame.result ?? {});
      }
      return;
    }

    if (frame.method === "event" && frame.params && typeof frame.params === "object") {
      const { type, session_id: sessionId, payload } = frame.params;
      if (type === "gateway.ready") {
        this.ready = true;
        this.emit("ready", payload ?? {});
        return;
      }
      this.emit("event", type, sessionId ?? "", payload ?? {});
    }
  }

  request(method, params = {}, timeoutMs = this.requestTimeoutMs) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("hermes-agent connection is not open."));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`hermes-agent did not answer "${method}" within ${timeoutMs}ms.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  _failAllPending(err) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
  }

  close(code = 1000, reason = "") {
    this.closed = true;
    try {
      this.ws?.close(code, reason);
    } catch {}
  }

  terminate() {
    this.closed = true;
    try {
      this.ws?.terminate();
    } catch {}
  }
}

module.exports = {
  HermesAgentJsonRpcClient,
  buildJsonRpcUrl,
  redactUrl,
  describeCloseCode,
  HERMES_AGENT_WS_PATH,
};
