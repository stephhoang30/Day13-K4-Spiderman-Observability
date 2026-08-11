"""Tính 6 panel dashboard trực tiếp từ data/logs.jsonl theo config/dashboard.yaml.

`validate_dashboard.py` chỉ kiểm tra contract (cấu trúc YAML). Script này đi thêm một
bước: đọc log thật, tính đúng phép tổng hợp của từng panel và so với threshold, nên
số in ra ở đây phải khớp với số hiển thị trên dashboard. Dùng để đối chiếu độc lập
trước khi chụp ảnh evidence.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.cli import configure_utf8_stdio
from app.metrics import percentile


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def read_records(path: Path) -> list[dict]:
    records: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records


def check(threshold: dict, value: float) -> str:
    ok = value <= threshold["value"] if threshold["operator"] == "lte" else value >= threshold["value"]
    marker = "PASS" if ok else "BREACH"
    return f"{marker} (threshold {threshold['aggregation']} {threshold['operator']} {threshold['value']})"


def main() -> int:
    configure_utf8_stdio()
    parser = argparse.ArgumentParser(description="Tính giá trị 6 panel dashboard từ log")
    parser.add_argument("--config", type=Path, default=REPO_ROOT / "config" / "dashboard.yaml")
    parser.add_argument("--logs", type=Path, default=REPO_ROOT / "data" / "logs.jsonl")
    args = parser.parse_args()

    if not args.logs.exists():
        print(f"Không tìm thấy {args.logs}. Chạy API và `python scripts/load_test.py` trước.")
        return 1

    contract = yaml.safe_load(args.config.read_text(encoding="utf-8"))["dashboard"]
    panels = {panel["id"]: panel for panel in contract["panels"]}

    records = [record for record in read_records(args.logs) if record.get("ts")]
    if not records:
        print(f"{args.logs} chưa có log hợp lệ.")
        return 1

    # Cửa sổ 60 phút tính từ log mới nhất, không phải từ thời điểm chạy script:
    # dữ liệu lab được sinh theo đợt nên mốc "bây giờ" sẽ bỏ sót cả đợt chạy trước.
    latest = max(parse_ts(record["ts"]) for record in records)
    window_start = latest - timedelta(minutes=contract["time_range_minutes"])
    window = [record for record in records if parse_ts(record["ts"]) >= window_start]

    received = [r for r in window if r.get("event") == "request_received"]
    sent = [r for r in window if r.get("event") == "response_sent"]
    failed = [r for r in window if r.get("event") == "request_failed"]

    print(f"Dashboard: {contract['title']}")
    print(
        f"Time range: {window_start.isoformat()} -> {latest.isoformat()} "
        f"({contract['time_range_minutes']} phút), refresh {contract['refresh_seconds']}s"
    )
    print(f"Log records trong cửa sổ: {len(window)}")

    # 1. latency — P50/P95/P99 của response_sent.latency_ms
    latencies = [r["latency_ms"] for r in sent if isinstance(r.get("latency_ms"), (int, float))]
    p95 = percentile(latencies, 95)
    print(f"\n[latency] {panels['latency']['title']} ({panels['latency']['unit']})")
    print(
        f"  p50={percentile(latencies, 50):.0f} p95={p95:.0f} "
        f"p99={percentile(latencies, 99):.0f} n={len(latencies)}"
    )
    print(f"  {check(panels['latency']['threshold'], p95)}")

    # 2. traffic — count và request/phút của request_received
    per_minute: dict[str, int] = defaultdict(int)
    for record in received:
        per_minute[parse_ts(record["ts"]).strftime("%H:%M")] += 1
    rate = len(received) / max(1, len(per_minute))
    print(f"\n[traffic] {panels['traffic']['title']} ({panels['traffic']['unit']})")
    print(f"  count={len(received)} phút có dữ liệu={len(per_minute)} rate={rate:.2f}/phút")
    print(f"  theo phút: {dict(sorted(per_minute.items()))}")
    print(f"  {check(panels['traffic']['threshold'], rate)}")

    # 3. errors — error_rate_pct và breakdown theo error_type
    error_rate = (len(failed) / len(received) * 100) if received else 0.0
    breakdown = Counter(record.get("error_type", "unknown") for record in failed)
    print(f"\n[errors] {panels['errors']['title']} ({panels['errors']['unit']})")
    print(f"  request_failed={len(failed)} request_received={len(received)} error_rate={error_rate:.2f}%")
    print(f"  breakdown: {dict(breakdown)}")
    print(f"  {check(panels['errors']['threshold'], error_rate)}")

    # 4. cost — tổng theo phút và toàn cửa sổ
    cost_per_minute: dict[str, float] = defaultdict(float)
    for record in sent:
        cost_per_minute[parse_ts(record["ts"]).strftime("%H:%M")] += float(record.get("cost_usd") or 0)
    total_cost = sum(cost_per_minute.values())
    print(f"\n[cost] {panels['cost']['title']} ({panels['cost']['unit']})")
    print(f"  total={total_cost:.6f} USD")
    print(f"  theo phút: { {k: round(v, 6) for k, v in sorted(cost_per_minute.items())} }")
    print(f"  {check(panels['cost']['threshold'], total_cost)}")

    # 5. tokens — tổng theo từng field
    tokens_in = sum(int(record.get("tokens_in") or 0) for record in sent)
    tokens_out = sum(int(record.get("tokens_out") or 0) for record in sent)
    print(f"\n[tokens] {panels['tokens']['title']} ({panels['tokens']['unit']})")
    print(f"  tokens_in={tokens_in} tokens_out={tokens_out}")
    # threshold sum_by_field áp cho từng field, nên field lớn nhất quyết định PASS/BREACH.
    print(f"  {check(panels['tokens']['threshold'], max(tokens_in, tokens_out))}")

    # 6. quality — mean quality_score
    scores = [float(record["quality_score"]) for record in sent if record.get("quality_score") is not None]
    mean_quality = sum(scores) / len(scores) if scores else 0.0
    print(f"\n[quality] {panels['quality']['title']} ({panels['quality']['unit']})")
    print(f"  mean={mean_quality:.4f} n={len(scores)}")
    print(f"  {check(panels['quality']['threshold'], mean_quality)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
