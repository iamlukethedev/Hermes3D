# Showing outside conversations in the office

Hermes3D is a visualiser, not a chat client. When you talk to your agents
somewhere else — the Hermes desktop app, the TUI, the CLI — the office has no
way to know it happened, so the characters keep working at their desks while a
group chat scrolls past on another screen.

This optional plugin closes that gap. Install it into your backend and the
office reacts to conversations you have anywhere: the agents that replied walk
away from their desks, gather in a circle, face each other, and take turns
talking while the huddle lasts.

It is observation only. The plugin never changes a turn, never delays one, and
never adds a tool — so it costs nothing in prompt tokens and cannot break a
conversation. If the office is closed, or the backend is not reachable, it
silently does nothing.

## Requirements

- The `hermes-agent` backend, connected to Hermes3D through the **Hermes Agent
  (direct)** backend type. See
  [`hermes-agent-tailscale.md`](hermes-agent-tailscale.md) for that setup.
- A pinned `HERMES3D_OFFICE_TOKEN`. An unpinned backend mints a random token
  every start, which nothing else can know. The installer warns you if it is
  missing; pin one with:

```bash
echo "HERMES3D_OFFICE_TOKEN=$(openssl rand -hex 32)" >> ~/.hermes/.env
```

  `~/.hermes/.env` is the only place you need it, even if you run profiles.
  Profiles each have their own `.env`, but this token identifies the one local
  backend they all publish to, so the plugin falls back to the default home
  rather than making you copy the same secret into every profile.

> **Do not pin `HERMES_DASHBOARD_SESSION_TOKEN` in `~/.hermes/.env`.** Hermes
> loads that file with `override=True`, so the pinned value is forced on *every*
> backend the machine starts. The Hermes desktop app mints a fresh token per
> launch and hands it to the backend it spawns; a pin overrides it, and the app
> then fails to start with "the WebSocket (/api/ws) rejected the session token".
> Pin `HERMES3D_OFFICE_TOKEN` instead and pass it to the office backend on the
> command line, as [`hermes-agent-tailscale.md`](hermes-agent-tailscale.md)
> shows. The desktop app keeps minting its own and both run side by side.

## Install

Run the installer from your Hermes3D checkout, on the machine that runs the
backend:

```bash
./plugins/hermes3d-office-bridge/install.sh
```

Then restart anything already running an agent so the plugin loads — the
backend (`hermes serve …`) and, if it is open, the desktop app. A process that
started before the install keeps the old plugin state until it restarts.

Plugins are scoped to a `HERMES_HOME`, and every Hermes profile has its own, so
a plugin installed only in the default home stays silent for every other agent.
The installer copies the plugin into the default home **and each profile**, and
enables it in all of them. Re-running it is safe.

Check it landed:

```bash
hermes plugins list | grep hermes3d          # default home
hermes -p <profile> plugins list | grep hermes3d
```

Both should report `enabled`.

To remove it:

```bash
./plugins/hermes3d-office-bridge/install.sh --uninstall
```

## How it works

```
desktop app / TUI / CLI
        │  you send a group message
        ▼
   hermes-agent  ── post_llm_call ──▶  plugin  ──▶  ws://127.0.0.1:9119/api/pub
                                                            │  channel: hermes3d
                                                            ▼
Hermes3D server  ◀── ws://…/api/events ── dashboard event bus
        │  office.speech
        ▼
    the office     agents gather into a circle
```

The reason a plugin is needed at all: message events on the JSON-RPC gateway go
only to the client that submitted the prompt. An office watching from the
outside sees session activity but never the text, so it cannot tell who spoke.
The plugin republishes each finished turn on the dashboard's event bus, which
fans out to every subscriber.

A published frame carries the profile that spoke, the reply text, the session
id, and a timestamp:

```json
{
  "v": 1,
  "kind": "agent.turn",
  "profile": "pr-reviewer",
  "text": "Good morning! I'm here too.",
  "sessionId": "…",
  "platform": "tui",
  "atMs": 1750000000000
}
```

`profile` is the agent identity — Hermes3D names each character after the
backend profile it represents, so the two line up without a lookup table. A
frame naming a profile the office does not show is ignored.

## What you see in the office

Two or more agents replying inside the same ~25 second window count as a
conversation. When that happens:

- Everyone involved drops what they were doing and walks over, faster than a
  normal stroll, to a circle laid out on free floor near the middle of the
  group.
- On arrival they stand facing the centre and the speaking turn rotates around
  the circle, so the chatter bubbles alternate instead of everyone talking at
  once. A soft murmur plays while any huddle is active (browsers need one click
  on the page before audio is allowed).
- The huddle holds for at least 45 seconds so nobody dissolves it while a
  distant participant is still walking, and it keeps extending while the
  conversation continues. It breaks up once the talking stops.

An agent is only ever in one huddle. If a wider conversation forms, the smaller
one it absorbed is retired rather than left to compete for the same agents.

A standup meeting outranks a huddle: while one is gathering or running, agents
go to the meeting room instead.

## Configuration

Defaults suit a backend on the same machine, which is the only topology the
plugin targets — it always publishes locally and never across a network. To
change them, add to `~/.hermes/config.yaml`:

```yaml
plugins:
  entries:
    hermes3d-office-bridge:
      settings:
        host: 127.0.0.1
        port: 9119
        channel: hermes3d
```

`channel` must match the channel the Hermes3D server subscribes to. Change it
only if something else is already using `hermes3d` on your event bus.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Nothing happens when you chat | Plugin not loaded | Restart the backend after installing; check `hermes plugins list` |
| Works for one agent, not the others | Installed in the default home only | Re-run `install.sh`, which covers every profile |
| Warning about the session token at install | Token not pinned | Add `HERMES3D_OFFICE_TOKEN` to `~/.hermes/.env` and restart |
| The desktop app will not start: "the WebSocket (/api/ws) rejected the session token" | `HERMES_DASHBOARD_SESSION_TOKEN` is pinned in `~/.hermes/.env` and overrides the token the app minted for its own backend | Rename that line to `HERMES3D_OFFICE_TOKEN` and pass it to the office backend on its command line |
| Still silent with everything enabled | A stale `HERMES3D_OFFICE_TOKEN` exported in the shell that started the backend overrides the pinned one | `unset` it, or start the backend from a clean shell |
| One agent replies but no circle forms | A conversation needs two speakers | Ask a question the whole group answers |
| Agents gather but the office is silent | Browser audio is locked until you interact | Click once anywhere on the page |
