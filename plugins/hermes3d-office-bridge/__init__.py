"""Publish finished agent turns so a Hermes3D office can visualise them.

Hermes3D renders each backend profile as a character at a desk. To show who is
talking — and to gather the speakers into a conversation circle — the office
needs to know when an agent replied and what it said. Message events on the
JSON-RPC gateway are delivered only to the client that submitted the prompt, so
an office watching from the outside sees nothing when you chat somewhere else.

This plugin closes that gap from inside the backend. It observes every finished
turn through ``post_llm_call`` and republishes a small frame on the dashboard's
event bus, which fans out to any subscriber. Chat wherever you like — the
desktop app, the TUI, the CLI — and the office animates it.

Install it into each profile you want on screen; plugins are scoped to a
``HERMES_HOME``, so a profile without it stays silent. See ``install.sh``.

Observation only: the hook never mutates the turn, never blocks it, and
swallows its own failures.
"""

from __future__ import annotations

import atexit
import logging
import time
from typing import Any, Optional
from urllib.parse import quote

from .publisher import OfficePublisher

_log = logging.getLogger(__name__)

FRAME_VERSION = 1

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 9119
DEFAULT_CHANNEL = "hermes3d"

# The office shows a short preview, not a transcript. Truncating keeps a long
# answer from dominating the event bus.
MAX_TEXT_CHARS = 2_000

_publisher: Optional[OfficePublisher] = None


def build_turn_frame(
    *,
    profile: str,
    text: str,
    session_id: str = "",
    platform: str = "",
    at_ms: Optional[int] = None,
) -> dict:
    """Build the wire frame for one finished turn.

    ``profile`` is the agent identity: Hermes3D names each character after the
    backend profile it represents, so the two line up without a lookup table.
    """
    body = (text or "").strip()
    if len(body) > MAX_TEXT_CHARS:
        body = body[:MAX_TEXT_CHARS].rstrip() + "…"
    return {
        "v": FRAME_VERSION,
        "kind": "agent.turn",
        "profile": profile or "",
        "text": body,
        "sessionId": session_id or "",
        "platform": platform or "",
        "atMs": int(at_ms if at_ms is not None else time.time() * 1000),
    }


def build_publish_url(*, host: str, port: int, channel: str, token: str) -> str:
    """URL for the dashboard publisher endpoint.

    ``/api/pub`` accepts ``?token=`` only on an ungated (loopback) bind, which
    is the topology this plugin targets — it always publishes to the local
    backend, never across a network.
    """
    return (
        f"ws://{host}:{int(port)}/api/pub"
        f"?channel={quote(channel, safe='')}&token={quote(token, safe='')}"
    )


def _default_home_token() -> str:
    """Read the token out of the default home's ``.env``.

    Profiles each get their own ``HERMES_HOME`` and their own ``.env``, so a
    profile-scoped process never sees a token pinned in the default home. That
    matters here because this token is not profile-level config: it identifies
    the one local dashboard every profile on the machine publishes to. Asking
    users to copy the same secret into five ``.env`` files would be worse.
    """
    from pathlib import Path

    try:
        from hermes_constants import get_default_hermes_root

        root = Path(get_default_hermes_root())
    except Exception:
        root = Path.home() / ".hermes"

    try:
        for line in (root / ".env").read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() == "HERMES_DASHBOARD_SESSION_TOKEN":
                return value.strip().strip("'\"")
    except OSError:
        pass
    return ""


def _resolve_token() -> str:
    """The dashboard session token, which is a secret and so lives in the env.

    Pin it in ``~/.hermes/.env`` as ``HERMES_DASHBOARD_SESSION_TOKEN`` — an
    unpinned backend mints a random one per start, which no subscriber can know.
    """
    import os

    return (
        os.environ.get("HERMES_DASHBOARD_SESSION_TOKEN") or ""
    ).strip() or _default_home_token()


def _resolve_profile() -> str:
    """Which profile produced this turn.

    One ``hermes serve`` backend runs every profile, so the answer is per-turn
    rather than per-process; ``get_active_profile_name()`` reflects the profile
    scope in force while the hook runs.
    """
    try:
        from hermes_cli.profiles import get_active_profile_name

        return str(get_active_profile_name() or "")
    except Exception as exc:
        _log.debug("hermes3d-office-bridge: profile lookup failed: %s", exc)
        return ""


def _handle_post_llm_call(**kwargs: Any) -> None:
    if _publisher is None:
        return
    try:
        text = str(kwargs.get("assistant_response") or "").strip()
        if not text:
            return
        frame = build_turn_frame(
            profile=_resolve_profile(),
            text=text,
            session_id=str(kwargs.get("session_id") or ""),
            platform=str(kwargs.get("platform") or ""),
        )
        _publisher.publish(frame)
    except Exception as exc:
        # An office that cannot draw is never a reason to disturb a turn.
        _log.debug("hermes3d-office-bridge: publish skipped: %s", exc)


def register(ctx: Any) -> None:
    global _publisher

    token = _resolve_token()
    if not token:
        _log.warning(
            "hermes3d-office-bridge: HERMES_DASHBOARD_SESSION_TOKEN is unset; "
            "turns will not be published. Pin it in ~/.hermes/.env."
        )
        return

    def setting(key: str, fallback: Any) -> Any:
        try:
            value = ctx.get_config(key, fallback)
        except Exception:
            return fallback
        return fallback if value in (None, "") else value

    _publisher = OfficePublisher(
        build_publish_url(
            host=str(setting("host", DEFAULT_HOST)),
            port=int(setting("port", DEFAULT_PORT)),
            channel=str(setting("channel", DEFAULT_CHANNEL)),
            token=token,
        )
    )
    # A one-shot CLI turn ends its process the moment the hook returns, well
    # before a background send completes. Give the queue a bounded chance to
    # drain so those turns reach the office too, not just long-lived backends.
    atexit.register(_publisher.flush)
    ctx.register_hook("post_llm_call", _handle_post_llm_call)
