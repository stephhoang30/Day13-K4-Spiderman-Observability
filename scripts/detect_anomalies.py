"""Phát hiện anomaly đơn giản từ structured logs."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml


EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?:\+84|0)(?:\d[ .-]?){8,10}")
CARD = re.compile(r"\b(?:\d[ -]?){13,19}\b")


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect anomalies in JSONL logs")
    parser.add_argument("--log", default="data/logs.jsonl")
    parser.add_argument("--slo", default="config/slo.yaml")
    args = parser.parse_args()

    slo = yaml.safe_load(Path(args.slo).read_text(encoding="utf-8"))
    latency_limit = slo["slis"]["latency_p95_ms"]["objective"]
    anomalies: list[tuple[str, dict]] = []

    path = Path(args.log)
    if not path.exists():
        print(f"Log file not found: {path}", file=sys.stderr)
        return 2

    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            anomalies.append(("invalid_json", {"line": line_no}))
            continue

        text = json.dumps(record, ensure_ascii=False)
        if EMAIL.search(text) or PHONE.search(text) or CARD.search(text):
            anomalies.append(("possible_pii_leak", {"line": line_no}))

        latency = record.get("latency_ms")
        if isinstance(latency, (int, float)) and latency > latency_limit:
            anomalies.append(("latency_above_slo", {"line": line_no, "latency_ms": latency}))

        if record.get("event") in {"request_failed", "error"}:
            anomalies.append(("error_event", {"line": line_no, "error_type": record.get("error_type")}))

    print(f"Scanned {len(path.read_text(encoding='utf-8').splitlines())} log records")
    if not anomalies:
        print("No anomalies detected")
        return 0

    for kind, detail in anomalies:
        print(f"[{kind}] {detail}")
    print(f"Anomalies detected: {len(anomalies)}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
