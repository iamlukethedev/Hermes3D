# Hermes3D + Hermes + Tailscale Setup Tutorial

This guide is a step-by-step runbook for the most common production-like setup:

- **Machine A** runs the **Hermes backend** and the **Hermes3D gateway adapter**.
- **Machine B** runs **Hermes3D**.
- **Tailscale** connects both machines securely.

If you follow this exactly, people should avoid the most common confusion: **Hermes3D does not install or run your agent backend for you.**

> **Running `hermes-agent` as your backend?** There is a shorter path. Studio can
> speak that backend's JSON-RPC gateway directly, so no adapter runs on either
> machine and Machine A only needs `hermes serve` plus Tailscale Serve. Follow
> [`docs/hermes-agent-tailscale.md`](docs/hermes-agent-tailscale.md) instead of
> this guide. Everything below applies to the Hermes HTTP API + adapter path.

---

## 0) Architecture and Responsibilities

- **Hermes** is the runtime. It exposes an HTTP API (default `http://localhost:8642`).
- **The gateway adapter** (`npm run hermes-adapter`) speaks the Hermes3D gateway WebSocket protocol on one side and calls the Hermes HTTP API on the other. It listens on `ws://localhost:18789` by default.
- **Hermes3D** is the UI and Studio proxy.
- Hermes3D connects to an already running gateway adapter.
- In this tutorial, the backend and adapter live on a different machine from Hermes3D.

The full chain looks like this:

```text
Browser -> Hermes3D Studio -> gateway adapter (ws) -> Hermes HTTP API
```

---

## 1) Prerequisites

### Machine A (backend host)

- macOS, Linux, or WSL2.
- Internet access.
- A working Hermes installation reachable over HTTP.
- Node.js `20+` and npm `10+` so the bundled adapter can run.
- Ability to install Tailscale.

### Machine B (Hermes3D host)

- Node.js `20+` recommended for this repo.
- npm `10+` recommended.
- Internet access.
- Ability to install Tailscale.

### Accounts and permissions

- A Tailscale account for your tailnet.
- If your tailnet uses device approval, you need Owner/Admin/IT admin access in Tailscale admin.

---

## 2) Start Hermes and the Gateway Adapter on Machine A

### 2.1 Start the Hermes API server

Start Hermes however your installation expects, and confirm the API answers on
the address you plan to use. The adapter defaults to:

```text
http://localhost:8642
```

If Hermes listens somewhere else, set `HERMES_API_URL` before starting the adapter.

### 2.2 Configure the adapter

On **Machine A**, in a Hermes3D checkout, copy `.env.example` to `.env` and set the
Hermes values:

```env
HERMES_API_URL=http://localhost:8642
HERMES_API_KEY=
HERMES_ADAPTER_PORT=18789
HERMES_MODEL=hermes
HERMES_AGENT_NAME=Hermes
```

### 2.3 Run the adapter

```bash
npm run hermes-adapter
```

The adapter now serves the Hermes3D gateway protocol on `ws://127.0.0.1:18789`.

### 2.4 Verify adapter health

From **Machine A**, confirm the Hermes API responds and that port `18789` is
listening. A quick check:

```bash
curl -sS http://localhost:8642/health
ss -ltn | grep 18789
```

You want a healthy Hermes API response and an adapter socket in `LISTEN` state.

### 2.5 Note your gateway token

If you configured a token for the adapter, keep it handy. You will paste it into
Hermes3D in step 6. Store it securely, and do not commit it.

---

## 3) Install and Authorize Tailscale on Both Machines

Tailscale docs: [Serve overview](https://tailscale.com/kb/1312/serve), [Serve CLI](https://tailscale.com/docs/reference/tailscale-cli/serve), and [Device approval](https://tailscale.com/kb/1099/device-approval).

### 3.1 Install Tailscale

Install Tailscale on **Machine A** and **Machine B** using official installers: [Tailscale downloads](https://tailscale.com/download).

### 3.2 Join both machines to the same tailnet

On each machine:

```bash
tailscale up
tailscale status
```

Confirm both machines appear in the same tailnet.

### 3.3 If your tailnet requires approval, approve devices

In Tailscale admin:

1. Open [Machines](https://login.tailscale.com/admin/machines).
2. Find devices marked **Needs approval**.
3. Approve both Machine A and Machine B.

Without this, the machines cannot communicate over tailnet traffic.

---

## 4) Expose the Gateway Through Tailscale on Machine A

Keep the adapter bound locally (`127.0.0.1:18789`) and publish it through Tailscale Serve:

```bash
tailscale serve --yes --bg --https=443 http://127.0.0.1:18789
tailscale serve status
```

Notes:

- Newer Tailscale CLI uses `--https=443`.
- If you are on older docs/commands, you may see syntax like `--https 443`. Use `tailscale serve --help` on your installed version.

### 4.1 Confirm the public tailnet URL

You need the `https://<gateway-host>.<tailnet>.ts.net` host.

This host is what Hermes3D will use as `wss://<gateway-host>.<tailnet>.ts.net`.

---

## 5) Install and Run Hermes3D on Machine B

On **Machine B**:

```bash
git clone https://github.com/iamlukethedev/Hermes3D.git hermes3d
cd hermes3d
npm install
cp .env.example .env
npm run dev
```

Then open:

- `http://localhost:3000`

---

## 6) Connect Hermes3D to Hermes

In the Hermes3D connection UI:

1. Choose **Hermes backend**.
2. Set **Gateway URL** to:
   - `wss://<gateway-host>.<tailnet>.ts.net`
3. Paste the gateway token from Machine A, if you configured one.
4. Click **Connect**.

Important:

- Use `wss://` for Tailscale HTTPS endpoints.
- Use `ws://localhost:18789` only when the adapter is local to the same machine as Hermes3D or when using an SSH tunnel.

---

## 7) SSH Tunnel Alternative

If you would rather not use Tailscale, forward the adapter port over SSH from
**Machine B**:

```bash
ssh -L 18789:127.0.0.1:18789 user@<gateway-host>
```

Leave that session open, then point Hermes3D at `ws://localhost:18789`. The
tunnel makes the remote adapter look local to Studio, so no `wss://` is needed.

---

## 8) Verification Checklist

Run this checklist in order:

1. The Hermes API responds on Machine A at the URL in `HERMES_API_URL`.
2. `npm run hermes-adapter` is running on Machine A and listening on `18789`.
3. `tailscale status` on both machines shows connected devices in same tailnet.
4. `tailscale serve status` on Machine A shows active Serve config for port `443` to `127.0.0.1:18789`.
5. Hermes3D connect UI uses `wss://...ts.net` plus a valid token.
6. Hermes3D UI shows gateway connected and loads agents.

---

## 9) Troubleshooting

### Connecting to the hermes-agent dashboard port (`9119`) instead of the adapter

This is the most common wrong turn, because `9119` is the port the
hermes-agent dashboard prints on startup.

Hermes3D cannot connect to it. That port serves the dashboard's JSON-RPC 2.0
gateway on `/api/ws`, guarded by single-use tickets, and it does not terminate
TLS. Hermes3D speaks a different protocol: it sends a `connect` frame and waits
for `hello-ok`. Even with correct credentials the handshake never completes, so
no username, password, or token will make `wss://<host>:9119` work.

Point Hermes3D at `npm run hermes-adapter` instead, as in sections 2 and 4. The
adapter is the component that speaks the Hermes3D gateway protocol, and it
reaches Hermes over the OpenAI-compatible HTTP API on port `8642`.

The dashboard username and password are unrelated to Hermes3D. They belong to
`HERMES_DASHBOARD_BASIC_AUTH_USERNAME` / `_PASSWORD` and only gate the
hermes-agent web dashboard. If your Hermes API requires a credential, that is
`HERMES_API_KEY` on the adapter.

`npm run doctor` flags this URL shape, and so does the connect screen.

### `EPROTO` or `wrong version number`

- Usually means protocol mismatch.
- Fix: if your endpoint is HTTPS/Tailscale Serve, use `wss://...`.
- Do not use `wss://` against a plain `ws://` endpoint.

### `401` or auth errors from Hermes3D

- Re-copy the gateway token configured for the adapter on Machine A.
- Confirm the adapter auth mode and token are current.

### Hermes3D connects but no agents appear

- Confirm the adapter can actually reach the Hermes API: check the adapter logs for HTTP errors against `HERMES_API_URL`.
- Confirm `HERMES_API_KEY` is set if your Hermes deployment requires one.

### Tailscale URL works nowhere

- Confirm both devices are approved in Tailscale admin if device approval is enabled.
- Re-run:
  - `tailscale status`.
  - `tailscale serve status`.
- Recreate serve config if needed:
  - `tailscale serve reset`.
  - `tailscale serve --yes --bg --https=443 http://127.0.0.1:18789`.

### The backend itself is unhealthy

- Restart the Hermes API server and confirm it answers directly with `curl`.
- Restart `npm run hermes-adapter` afterwards so it reconnects cleanly.
- Run `npm run doctor` from the Hermes3D checkout for a grouped diagnostics report.

---

## 10) Security Notes

- Keep the adapter bound to loopback unless you have a deliberate reason not to.
- Do not commit tokens into git or `.env` files intended for sharing.
- Prefer Tailscale Serve or an SSH tunnel over exposing raw gateway ports publicly.
- Set `STUDIO_ACCESS_TOKEN` whenever Studio itself binds to anything other than localhost.

---

## References

- Hermes adapter setup and scope: [`docs/hermes-gateway.md`](docs/hermes-gateway.md).
- Runtime profiles and backend selection: [`docs/runtime-profiles.md`](docs/runtime-profiles.md).
- Tailscale Serve: [tailscale.com/kb/1312/serve](https://tailscale.com/kb/1312/serve).
- Tailscale serve CLI: [tailscale.com/docs/reference/tailscale-cli/serve](https://tailscale.com/docs/reference/tailscale-cli/serve).
- Tailscale device approval: [tailscale.com/kb/1099/device-approval](https://tailscale.com/kb/1099/device-approval).
