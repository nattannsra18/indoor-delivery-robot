from __future__ import annotations

from collections import OrderedDict, deque
from threading import Lock
import time
from typing import Callable


class SlidingWindowRateLimiter:
    """Small process-local limiter for low-volume security boundaries."""

    def __init__(
        self,
        *,
        max_keys: int = 10_000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max_keys = max_keys
        self._clock = clock
        self._lock = Lock()
        self._attempts: OrderedDict[str, deque[float]] = OrderedDict()

    def check(self, key: str, *, limit: int, window_seconds: int) -> int | None:
        """Record an attempt and return Retry-After seconds when rejected."""
        now = self._clock()
        cutoff = now - window_seconds
        with self._lock:
            attempts = self._attempts.setdefault(key, deque())
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()
            self._attempts.move_to_end(key)
            if len(attempts) >= limit:
                return max(1, int(attempts[0] + window_seconds - now + 0.999))
            attempts.append(now)
            while len(self._attempts) > self._max_keys:
                self._attempts.popitem(last=False)
        return None

    def clear(self) -> None:
        with self._lock:
            self._attempts.clear()


robot_enrollment_limiter = SlidingWindowRateLimiter()
