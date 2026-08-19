# Hermes Gateway Adapter

Hermes3D runs against Hermes by using the bundled adapter in
[`server/hermes-gateway-adapter.js`](../server/hermes-gateway-adapter.js).

This is the default backend path in this repository.
It is not yet a fully native Studio-side Hermes provider. Instead, it
uses the runtime seam in Studio while Hermes is exposed through a
Hermes3D-compatible WebSocket adapter.

## Architecture

```text
Browser UI <-> Studio runtime/client <-> Hermes gateway adapter <-> Hermes HTTP API
```

The frontend keeps using the Hermes3D gateway protocol. The Hermes adapter
translates that protocol into Hermes HTTP calls and streams the results
back as gateway events.

## Quick start

### 1. Start Hermes

Start your Hermes API server. The default expected endpoint is:

```text
http://localhost:8642
```

### 2. Configure environment

Copy `.env.example` to `.env` and set the Hermes values:

```env
NEXT_PUBLIC_GATEWAY_URL=ws://localhost:18789

HERMES_API_URL=http://localhost:8642
HERMES_API_KEY=
HERMES_ADAPTER_PORT=18789
HERMES_MODEL=hermes
HERMES_AGENT_NAME=Hermes
```

### 3. Start Hermes3D and the adapter

In separate terminals:

```bash
npm run hermes-adapter
npm run dev
```

Then open `http://localhost:3000` and connect to:

```text
ws://localhost:18789
```

In the connect screen, select `Hermes backend`. Hermes3D will persist that
selection in Studio settings and show `Hermes` as the active backend once
the adapter hello response is received.

### 4. Remote Hermes on another machine

The adapter and Hermes3D do not have to run where Hermes runs. Pick whichever
side of the link you would rather keep private.

**Adapter next to Hermes3D.** Only the Hermes HTTP API crosses the network, and
nothing extra runs on the Hermes host:

```text
Browser <-> Studio <-> adapter (localhost:18789) <-> Hermes HTTP API (remote:8642)
```

Bind the Hermes API to the tailnet on the Hermes host, then on the Hermes3D
machine set `HERMES_API_URL` to the remote address and connect to
`ws://localhost:18789`.

**Adapter next to Hermes.** The gateway protocol crosses the network, so the
adapter needs to be published. Keep it on loopback and expose it with Tailscale
Serve, then connect to `wss://<tailnet-host>` with no port. Full walkthrough in
[`TUTORIAL.md`](../TUTORIAL.md).

Do not point the gateway URL at port `9119`. That is the hermes-agent
dashboard's JSON-RPC endpoint, not a Hermes3D gateway, and the two protocols are
not compatible. See the troubleshooting section of the tutorial.

### 5. Optional all-in-one local startup

The repo also includes:

```bash
bash scripts/hermes3d-start.sh
```

That script now resolves the repo root dynamically from the script
location instead of assuming a machine-specific checkout path.

## What this adapter supports

The adapter currently supports the Hermes3D surfaces needed for normal
office use:

- Agent listing, creation, update, and deletion
- Session listing, preview, patch, reset, and history lookup
- Chat send, targeted abort, and run wait
- Config get/set/patch shims needed by the Studio UI
- Models and skills status
- Exec approvals surfaces used by the current UI
- Cron list/add/remove/patch/run
- Multi-agent orchestration tools on the Hermes side

## Hermes orchestration tools

The main Hermes agent acts as an orchestrator with these tools:

| Tool | Description |
|---|---|
| `spawn_agent` | Create a specialist sub-agent |
| `delegate_task` | Send work to a specific agent |
| `list_team` | List active agents, names, and roles |
| `configure_agent` | Update agent name, role, instructions, or settings |
| `dismiss_agent` | Remove an agent from the team |
| `read_agent_context` | Read another agent's recent conversation history for coordination |

Sub-agents appear in the office as separate characters and keep their
own conversation state.

## Production-readiness notes

The adapter behavior worth knowing about:

- `chat.abort` aborts only the requested `runId` or `sessionKey`
  instead of cancelling every active run
- history clears from `sessions.reset`, `agents.delete`, and
  `dismiss_agent` persist to disk immediately
- `scripts/hermes3d-start.sh` resolves the repo root dynamically instead of
  hardcoding one developer's local path

## ACP status

Hermes has a real ACP surface and that remains the preferred long-term
integration direction.

The adapter has not been replaced with ACP yet. The current path uses the
adapter because it works with the existing Hermes3D gateway contract today.

The runtime seam added in Studio is what makes an ACP-backed Hermes
provider feasible as a follow-up without reworking the whole UI again.

## Persistence

Conversation history is stored at:

```text
~/.hermes/hermes3d-history.json
```

It is loaded on startup and updated when conversations change.

## Current limitations

- Hermes is integrated through the adapter path today, not yet through a
  dedicated native Studio provider implementation
- Config and approvals behavior still matches the current adapter contract,
  not a fully Hermes-native settings model
- This path is intended to get Hermes working reliably now while the
  broader runtime-provider architecture continues to mature

## When to use demo mode instead

If you only want to see the office boot without installing Hermes, use:

```bash
npm run demo-gateway
npm run dev
```

That starts a bundled mock gateway for a no-framework Hermes3D demo. Both
adapters default to port `18789`, so run only one of them at a time.
