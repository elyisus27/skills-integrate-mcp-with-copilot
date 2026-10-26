"""Privacy-conscious analytics for student searches.

Only aggregate facts are stored for each submitted search: a UTC timestamp,
the search type ("id" or "name") and the number of results. The text that was
searched is never written anywhere. Events older than the retention period are
deleted whenever a new event is recorded.
"""

import json
import os
import re
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_RETENTION_DAYS = 90
ID_PATTERN = re.compile(r"^s?\d+$", re.IGNORECASE)

_lock = threading.Lock()


def storage_path() -> Path:
    return Path(
        os.environ.get(
            "ANALYTICS_FILE", str(Path(__file__).parent / "search_analytics.jsonl")
        )
    )


def retention_days() -> int:
    try:
        days = int(os.environ.get("ANALYTICS_RETENTION_DAYS", DEFAULT_RETENTION_DAYS))
    except ValueError:
        return DEFAULT_RETENTION_DAYS
    return days if days > 0 else DEFAULT_RETENTION_DAYS


def classify(query: str) -> str:
    """Emails and student IDs count as "id" searches, everything else "name"."""
    text = query.strip()
    return "id" if "@" in text or ID_PATTERN.match(text) else "name"


def _parse(line: str) -> dict | None:
    try:
        event = json.loads(line)
        datetime.fromisoformat(event["timestamp"])
        if event["type"] in ("id", "name") and isinstance(event["results"], int):
            return event
    except (ValueError, KeyError, TypeError):
        pass
    return None


def _read_events() -> list[dict]:
    try:
        lines = storage_path().read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return []
    return [event for event in map(_parse, lines) if event]


def record_search(query: str, result_count: int, now: datetime | None = None) -> None:
    """Record one submitted search without keeping its text."""
    now = now or datetime.now(timezone.utc)
    event = {
        "timestamp": now.isoformat(timespec="seconds"),
        "type": classify(query),
        "results": int(result_count),
    }
    cutoff = now - timedelta(days=retention_days())
    with _lock:
        kept = [
            existing
            for existing in _read_events()
            if datetime.fromisoformat(existing["timestamp"]) >= cutoff
        ]
        kept.append(event)
        path = storage_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_suffix(path.suffix + ".tmp")
        temp_path.write_text(
            "".join(json.dumps(item) + "\n" for item in kept), encoding="utf-8"
        )
        os.replace(temp_path, path)


def summarize() -> dict:
    """Aggregate counts only; no individual events or query text."""
    with _lock:
        events = _read_events()
    by_type = {"id": 0, "name": 0}
    by_day: dict[str, int] = {}
    no_results = 0
    for event in events:
        by_type[event["type"]] += 1
        day = event["timestamp"][:10]
        by_day[day] = by_day.get(day, 0) + 1
        if event["results"] == 0:
            no_results += 1
    return {
        "total_searches": len(events),
        "by_type": by_type,
        "searches_with_no_results": no_results,
        "by_day": dict(sorted(by_day.items())),
        "retention_days": retention_days(),
    }
