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

/**
 * Host header used to retry an upgrade a loopback-bound backend refused.
 *
 * A backend bound to loopback only accepts loopback Host values, and Tailscale
 * Serve forwards the client's Host verbatim, so a tailnet URL arrives carrying
 * a name the backend will not accept. Sending a loopback Host instead satisfies
 * the check without weakening it: Serve routes on the published port, and the
 * backend still requires the peer itself to be loopback.
 *
 * This is a fallback rather than the default because a backend bound to an
 * explicit non-loopback address requires the Host to match that address.
 */
const LOOPBACK_HOST_HEADER = "localhost";

/**
 * Upgrade rejections that a different Host header could plausibly fix.
 *
 * A loopback-bound backend refuses a foreign Host on the WebSocket route with
 * HTTP 403 (the HTTP-only Host middleware answers 400, and the post-accept
 * guard closes with 4403). 403 is also how it refuses a bad token, so a retry
 * can be spent on an unrelated failure — that costs one extra handshake and
 * then reports the original error.
 */
const isHostRejection = (closeCode, httpStatus) =>
  closeCode === CLOSE_FORBIDDEN || httpStatus === 400 || httpStatus === 403;

const describeCloseCode = (code, reason, triedLoopbackHost = false) => {
  if (code === CLOSE_AUTH_FAILED) {
    return (
      "hermes-agent rejected the credential (4401). If the backend is bound to a " +
      "non-loopback address it requires a login rather than a token; publish it " +
      "over Tailscale Serve from a loopback bind so token auth stays available."
    );
  }
  if (code === CLOSE_FORBIDDEN) {
    return (
      "hermes-agent refused the connection (4403)." +
      (triedLoopbackHost ? " A loopback Host header was also refused." : "") +
      " Its embedded chat may be disabled, the peer may not be reaching it over " +
      "loopback, or the Host/Origin did not match the address it was bound to."
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
  constructor({
    url,
    token,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    handshakeTimeoutMs = undefined,
    hostHeader = "",
    loopbackHostFallback = true,
    log = () => {},
  }) {
    super();
    this.log = log;
    this.url = buildJsonRpcUrl(url, token);
    this.requestTimeoutMs = requestTimeoutMs;
    this.handshakeTimeoutMs = handshakeTimeoutMs;
    this.hostHeader = typeof hostHeader === "string" ? hostHeader.trim() : "";
    // An explicit Host is a deliberate choice; never second-guess it.
    this.loopbackHostFallback = loopbackHostFallback && !this.hostHeader;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.ready = false;
    this.closed = false;
    this.usedLoopbackHost = false;
    this._retryPending = false;
  }

  connect() {
    this._openSocket(this.hostHeader);
  }

  _openSocket(hostHeader) {
    const options = { handshakeTimeout: this.handshakeTimeoutMs };
    if (hostHeader) options.headers = { Host: hostHeader };

    this.log(
      `[hermes-agent] opening ${redactUrl(this.url)} ` +
        `(Host: ${hostHeader || "default from URL"})`,
    );

    const ws = new WebSocket(this.url, options);
    this.ws = ws;

    ws.on("open", () => this.log("[hermes-agent] upgrade accepted; waiting for gateway.ready"));
    ws.on("message", (raw) => this._onMessage(raw));

    ws.on("close", (code, reasonBuffer) => {
      const reason = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString() : String(reasonBuffer ?? "");
      if (this._retryPending) return;
      if (this._retryWithLoopbackHost(code, undefined)) return;
      this.log(`[hermes-agent] closed (${code})${reason ? `: ${reason}` : ""}`);
      this._failAllPending(new Error(describeCloseCode(code, reason, this.usedLoopbackHost)));
      this.ready = false;
      this.closed = true;
      this.emit("close", code, reason);
    });

    ws.on("error", (err) => {
      // A rejected upgrade also surfaces here; stay quiet while a retry is
      // queued so a recoverable rejection isn't reported as a failure.
      if (this._retryPending) return;
      this._failAllPending(err instanceof Error ? err : new Error(String(err)));
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    });

    // The upgrade itself can be rejected before any frame arrives; surface the
    // status rather than letting it look like a generic socket error.
    ws.on("unexpected-response", (_req, res) => {
      const status = res?.statusCode;
      this.log(`[hermes-agent] upgrade rejected with HTTP ${status}`);
      if (this._retryWithLoopbackHost(undefined, status)) return;
      const message =
        status === 401
          ? describeCloseCode(CLOSE_AUTH_FAILED, "", this.usedLoopbackHost)
          : `hermes-agent rejected the WebSocket upgrade (HTTP ${status}).`;
      this.emit("error", new Error(message));
    });
  }

  /**
   * Reopen with a loopback Host when the backend refused the one we sent.
   *
   * Returns true when a retry was started, so the caller suppresses the
   * failure it was about to report.
   */
  _retryWithLoopbackHost(closeCode, httpStatus) {
    if (!this.loopbackHostFallback || this.usedLoopbackHost || this.closed) return false;
    if (!isHostRejection(closeCode, httpStatus)) return false;

    this.log(
      `[hermes-agent] backend refused the Host header ` +
        `(${closeCode !== undefined ? `close ${closeCode}` : `HTTP ${httpStatus}`}); ` +
        `retrying once with Host: ${LOOPBACK_HOST_HEADER}`,
    );
    this.usedLoopbackHost = true;
    this._retryPending = true;
    const discarded = this.ws;
    try {
      discarded?.removeAllListeners();
      // A rejected handshake still emits "error"; without a listener Node
      // would treat it as unhandled and crash the process.
      discarded?.on("error", () => {});
      discarded?.terminate();
    } catch {}
    // Let the rejected socket finish tearing down before reconnecting.
    setImmediate(() => {
      this._retryPending = false;
      if (this.closed) return;
      this._openSocket(LOOPBACK_HOST_HEADER);
    });
    return true;
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
  LOOPBACK_HOST_HEADER,
};
