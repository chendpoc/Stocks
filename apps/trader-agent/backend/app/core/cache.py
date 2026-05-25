from __future__ import annotations

from dataclasses import dataclass
from time import monotonic
from typing import Generic, TypeVar

K = TypeVar("K")
V = TypeVar("V")


@dataclass(frozen=True)
class _CacheEntry(Generic[V]):
    value: V
    expires_at: float


class TTLCache(Generic[K, V]):
    """Small process-local TTL cache for Phase 0 local runtime use."""

    def __init__(self, default_ttl_seconds: float = 60.0) -> None:
        if default_ttl_seconds <= 0:
            raise ValueError("default_ttl_seconds must be positive")
        self._default_ttl_seconds = default_ttl_seconds
        self._entries: dict[K, _CacheEntry[V]] = {}

    def get(self, key: K) -> V | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        if entry.expires_at <= monotonic():
            self._entries.pop(key, None)
            return None
        return entry.value

    def set(self, key: K, value: V, ttl_seconds: float | None = None) -> None:
        ttl = self._default_ttl_seconds if ttl_seconds is None else ttl_seconds
        if ttl <= 0:
            raise ValueError("ttl_seconds must be positive")
        self._entries[key] = _CacheEntry(value=value, expires_at=monotonic() + ttl)

    def delete(self, key: K) -> None:
        self._entries.pop(key, None)

    def clear(self) -> None:
        self._entries.clear()
