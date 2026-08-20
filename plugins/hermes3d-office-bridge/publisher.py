"""Best-effort publisher onto the Hermes dashboard event bus.

The dashboard rebroadcasts whatever arrives on ``/api/pub`` to every
``/api/events`` subscriber on the same channel, so shipping one frame per
finished turn is all Hermes3D needs to animate a conversation.

Everything here is deliberately failure-tolerant. An agent turn must never
slow down, block on, or fail because of the office: sends happen on a daemon
thread, a full queue drops the frame, a dead socket reconnects with backoff,
and a missing ``websockets`` install makes the publisher inert rather than
raising into the hook.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import time
from typing import Any, Optional, Tuple

try:
    from websockets.sync.client import connect as ws_connect
except ImportError:  # pragma: no cover - websockets ships with hermes-agent
    ws_connect = None  # type: ignore[assignment]

_log = logging.getLogger(__name__)

_QUEUE_MAX = 128
_CONNECT_TIMEOUT_S = 2.0

# Bound on how long process exit waits for queued frames. Long enough to cover
# a loopback connect, short enough that a one-shot CLI still feels instant. A
# backend that is simply not running refuses immediately and costs nothing.
_FLUSH_TIMEOUT_S = 3.0

# Retry gaps after a failed connect. The office is a nicety, so a backend that
# is down or gated should cost one short attempt every so often, not a storm.
_BACKOFF_S: Tuple[float, ...] = (1.0, 2.0, 5.0, 15.0, 30.0)

# A turn that has been sitting in the queue longer than this is dropped rather
# than published. Stale speech would make idle characters huddle for no reason.
_MAX_FRAME_AGE_S = 20.0

_STOP = object()


class OfficePublisher:
    """Ship JSON frames to ``/api/pub`` without ever blocking the caller."""

    def __init__(self, url: str) -> None:
        self._url = url
        self._queue: "queue.Queue[Any]" = queue.Queue(maxsize=_QUEUE_MAX)
        self._socket: Optional[Any] = None
        self._worker: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._failures = 0
        self._next_attempt_at = 0.0
        # Frames queued but not yet handled, so `flush` knows when it is done.
        self._pending = 0
        self._inert = ws_connect is None
        if self._inert:
            _log.debug("hermes3d-office-bridge: websockets missing; publisher inert")

    def publish(self, frame: dict) -> bool:
        """Queue one frame. Returns False when it was dropped."""
        if self._inert:
            return False
        try:
            line = json.dumps(frame, ensure_ascii=False)
        except (TypeError, ValueError) as exc:
            _log.debug("hermes3d-office-bridge: unserialisable frame: %s", exc)
            return False

        self._ensure_worker()
        try:
            self._queue.put_nowait((time.monotonic(), line))
        except queue.Full:
            return False
        with self._lock:
            self._pending += 1
        return True

    def _ensure_worker(self) -> None:
        with self._lock:
            if self._worker is not None and self._worker.is_alive():
                return
            self._worker = threading.Thread(
                target=self._drain,
                name="hermes3d-office-bridge",
                daemon=True,
            )
            self._worker.start()

    def _connect(self) -> bool:
        """Open the socket, honouring the backoff gate. Never raises."""
        if self._socket is not None:
            return True
        if time.monotonic() < self._next_attempt_at:
            return False
        try:
            self._socket = ws_connect(  # type: ignore[misc]
                self._url,
                open_timeout=_CONNECT_TIMEOUT_S,
                max_size=None,
            )
        except Exception as exc:
            self._socket = None
            gap = _BACKOFF_S[min(self._failures, len(_BACKOFF_S) - 1)]
            self._failures += 1
            self._next_attempt_at = time.monotonic() + gap
            _log.debug("hermes3d-office-bridge: connect failed (%s); retry in %ss", exc, gap)
            return False

        self._failures = 0
        self._next_attempt_at = 0.0
        return True

    def _drain(self) -> None:
        while True:
            item = self._queue.get()
            if item is _STOP:
                self._close_socket()
                return
            try:
                if not isinstance(item, tuple):
                    continue
                queued_at, line = item
                if time.monotonic() - queued_at > _MAX_FRAME_AGE_S:
                    continue
                if not self._connect():
                    continue
                try:
                    self._socket.send(line)  # type: ignore[union-attr]
                except Exception as exc:
                    _log.debug("hermes3d-office-bridge: send failed: %s", exc)
                    self._close_socket()
            finally:
                with self._lock:
                    self._pending -= 1

    def flush(self, timeout: float = _FLUSH_TIMEOUT_S) -> None:
        """Give queued frames a bounded chance to go out before the process ends.

        The sender is a daemon thread, so a short-lived process — a one-shot
        CLI turn, a slash worker — would otherwise exit while the frame is
        still queued and the socket is not even open yet. Returns as soon as
        the queue is handled, whether each frame was sent or dropped.
        """
        if self._inert:
            return
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                if self._pending <= 0:
                    return
            time.sleep(0.02)

    def _close_socket(self) -> None:
        socket, self._socket = self._socket, None
        if socket is None:
            return
        try:
            socket.close()
        except Exception:
            pass

    def close(self) -> None:
        self._inert = True
        try:
            self._queue.put_nowait(_STOP)
        except queue.Full:
            pass
