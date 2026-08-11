from __future__ import annotations

from .audit import audit_event

STATE = {
    "rag_slow": False,
    "tool_fail": False,
    "cost_spike": False,
}


def enable(name: str) -> None:
    if name not in STATE:
        raise KeyError(f"Unknown incident: {name}")
    STATE[name] = True
    audit_event("incident_enabled", incident=name)



def disable(name: str) -> None:
    if name not in STATE:
        raise KeyError(f"Unknown incident: {name}")
    STATE[name] = False
    audit_event("incident_disabled", incident=name)



def status() -> dict[str, bool]:
    return dict(STATE)
