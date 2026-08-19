# Connect Hermes3D to a remote hermes-agent over Tailscale

This is the **direct** path: Studio talks to a `hermes-agent` backend's JSON-RPC
gateway itself, with no adapter process anywhere. It replaces the older
adapter walkthrough in [`TUTORIAL.md`](../TUTORIAL.md) when your backend is
`hermes-agent`.

Two machines are involved:

- **Machine A** — the Hermes host, where `hermes-agent` and your profiles live.
- **Machine B** — wherever you run Hermes3D and open the browser.

```text
Browser <-> Studio server (Machine B) <-> Tailscale <-> hermes serve (Machine A)
                     |                                        |
             JSON-RPC bridge, in-process              bound to 127.0.0.1
```

## Why Machine A has to run something

Hermes3D is only a viewer — it has no agent of its own. Something on Machine A
must be listening or there is nothing to connect to. The goal is not "run
nothing," it is "start it once and never think about it again," which
[step 4](#4-keep-it-running) covers.

You may already run `hermes dashboard` on Machine A. Studio can't reuse it:
a dashboard bound to a public address is *gated*, and in gated mode a WebSocket
upgrade requires a single-use ticket minted from a browser login. A loopback
bind accepts a plain session token instead, which is what makes the
zero-login setup below possible.

---

## Machine A — the Hermes host

### 1. Pin a session token

This is the shared secret between the two machines. Generate one and store it
in `~/.hermes/.env` — Hermes loads that file at startup, so every later
`hermes serve` picks it up with no extra flags:

```bash
echo "HERMES_DASHBOARD_SESSION_TOKEN=$(openssl rand -hex 32)" >> ~/.hermes/.env
grep HERMES_DASHBOARD_SESSION_TOKEN ~/.hermes/.env   # copy this for Machine B
```

Pinning the token matters. Leave it unset and `hermes serve` invents a fresh
random one on every start, so Studio's saved token stops matching after each
restart.

If you use profiles, `.env` is per-profile — write it to the `HERMES_HOME` of
the profile you intend to serve.

### 2. Start the backend on loopback

```bash
hermes serve --host 127.0.0.1 --port 9120 --skip-build
```

Notes:

- Keep `--host 127.0.0.1`. Binding to the tailnet address directly would turn
  on the login gate and break token auth. `hermes serve --help` says the same
  thing: *"Bind 127.0.0.1 + tunnel to keep it local."*
- Port `9120` is just an example. Use anything free — avoid `9119` if you also
  run `hermes dashboard`, since that is its default.
- `--skip-build` skips the web UI build. `serve` is headless and never shows a
  browser UI, so the build is wasted work here.
- `hermes serve --status` lists running servers. `hermes serve --stop` stops
  **all** Hermes web servers on the machine, not just this one.

If you would rather not keep the token in `.env`, pass it inline instead —
either form works:

```bash
HERMES_DASHBOARD_SESSION_TOKEN=<your-token> \
  hermes serve --host 127.0.0.1 --port 9120 --skip-build
```

### 3. Publish it on the tailnet

```bash
tailscale serve --yes --bg --https=10000 http://127.0.0.1:9120
tailscale serve status
```

Pick a `--https` port that is actually free on the tailnet host. `443` is the
natural choice, but if something else already answers there — another reverse
proxy, an unrelated service — the upgrade request never reaches Hermes and you
get a confusing `401`. `10000` and `8443` are the usual alternates.

Verify the tunnel end to end before touching Machine B:

```bash
curl -s -H "Host: localhost" https://<machine-a>.<tailnet>.ts.net:10000/api/status
```

You want JSON back. An **empty response with the port still open** means
Tailscale Serve is configured but the backend behind it is gone — the usual
cause is that `hermes serve` was stopped.

### 4. Keep it running

Without this, closing the terminal or rebooting takes the office offline.

Neither unit below carries the token: Hermes reads it from `~/.hermes/.env` on
its own, so the secret stays out of your service definitions.

**macOS (launchd).** Save as
`~/Library/LaunchAgents/dev.hermes3d.serve.plist`, substituting the output of
`command -v hermes` for the program path:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.hermes3d.serve</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/hermes</string>
    <string>serve</string>
    <string>--host</string><string>127.0.0.1</string>
    <string>--port</string><string>9120</string>
    <string>--skip-build</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/hermes-serve.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/dev.hermes3d.serve.plist
```

**Linux (systemd user unit).** Save as
`~/.config/systemd/user/hermes-serve.service`:

```ini
[Unit]
Description=Hermes backend for Hermes3D
After=network-online.target

[Service]
ExecStart=%h/.local/bin/hermes serve --host 127.0.0.1 --port 9120 --skip-build
Restart=always

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now hermes-serve
loginctl enable-linger "$USER"   # keeps it up when you are not logged in
```

Tailscale Serve settings persist across reboots on their own once set with
`--bg`, so step 3 does not need repeating.

---

## Machine B — the Hermes3D host

```bash
git clone https://github.com/iamlukethedev/Hermes3D.git hermes3d
cd hermes3d && npm install && cp .env.example .env && npm run dev
```

Open `http://localhost:3000` and fill in the connect screen:

| Field | Value |
|---|---|
| Backend | **Hermes Agent (direct)** |
| Gateway URL | `wss://<machine-a>.<tailnet>.ts.net:10000` |
| Token | the token from step 1 |

Give the **server root**, not `/api/ws` — Studio appends the path itself. Use
`wss://`, because Tailscale Serve terminates TLS.

To preconfigure it instead of using the UI, set these in `.env`:

```env
HERMES3D_GATEWAY_ADAPTER_TYPE=hermes-agent
HERMES3D_GATEWAY_URL=wss://<machine-a>.<tailnet>.ts.net:10000
HERMES3D_GATEWAY_TOKEN=<your-token>
```

You should land in the office with one character per `hermes-agent` profile.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `wrong version number` / `EPROTO` | `wss://` against a plaintext port | Use the port you passed to `--https`, not the `hermes serve` port |
| Gateway closes, HTTP `403` | Token mismatch | Studio's token must equal `HERMES_DASHBOARD_SESSION_TOKEN`. If it worked until a restart, the token was never pinned — see [step 1](#1-pin-a-session-token) |
| Gateway closes, HTTP `401` | Pointed at a gated server | You are hitting `hermes dashboard` (public bind) rather than the loopback `hermes serve`. Gated servers reject `?token=` entirely |
| Port open, empty response | Backend stopped | `hermes serve --status` on Machine A; see [step 4](#4-keep-it-running) |
| `400 Invalid Host header` | Tailscale forwards the tailnet hostname to a loopback-bound server | Handled automatically — Studio retries with `Host: localhost`. Seeing it means you are on an older build |
| Connects, only one agent | Backend has one profile | Each `hermes-agent` profile becomes one office character |

For a live check of what Machine A is exposing:

```bash
curl -s -H "Host: localhost" https://<machine-a>.<tailnet>.ts.net:10000/api/status
```

`auth_required: false` confirms you reached the loopback server through the
tunnel, which is the configuration token auth needs.

---

## Security notes

- The session token is a bearer credential for your whole agent. Treat it like
  an API key: never commit it, and rotate it by restarting with a new value.
- Nothing here is exposed to the public internet. `hermes serve` binds to
  loopback, and Tailscale Serve publishes only inside your tailnet.
- Anyone on your tailnet who learns the token can reach the backend. Use
  Tailscale ACLs if your tailnet has members who should not have access.
