"""Backend module for communicating with the Agent Bus hub HTTP+WS API."""

import json
import urllib.request
import urllib.error

DEFAULT_HUB_URL = "http://localhost:4000"


def publish_event(hub_url: str, event: dict) -> dict:
    """POST an event to the hub. Returns the response JSON."""
    data = json.dumps(event).encode("utf-8")
    req = urllib.request.Request(
        f"{hub_url}/events",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return {"ok": False, "error": body, "status": e.code}
    except urllib.error.URLError as e:
        return {"ok": False, "error": str(e.reason)}


def get_health(hub_url: str) -> dict:
    """GET /health from the hub. Returns stats."""
    req = urllib.request.Request(f"{hub_url}/health", method="GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        return {"ok": False, "error": str(e.reason)}


def read_jsonl_log(log_path: str, last_n: int = 0) -> list[dict]:
    """Read events from a JSONL log file. If last_n > 0, return only last N."""
    events = []
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    events.append(json.loads(line))
    except FileNotFoundError:
        return []
    if last_n > 0:
        events = events[-last_n:]
    return events
