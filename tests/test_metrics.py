from __future__ import annotations

from collections.abc import Iterator

import pytest

from app import metrics
from app.metrics import percentile


def test_percentile_basic() -> None:
    assert percentile([100, 200, 300, 400], 50) >= 100


@pytest.fixture()
def empty_metrics() -> Iterator[None]:
    """Metrics là state toàn cục nên phải dọn trước và sau mỗi test."""
    buckets = (
        metrics.REQUEST_LATENCIES,
        metrics.REQUEST_COSTS,
        metrics.REQUEST_TOKENS_IN,
        metrics.REQUEST_TOKENS_OUT,
        metrics.QUALITY_SCORES,
    )

    def reset() -> None:
        metrics.TRAFFIC = 0
        for bucket in buckets:
            bucket.clear()
        metrics.ERRORS.clear()

    reset()
    yield
    reset()


def _record_success(count: int) -> None:
    for _ in range(count):
        metrics.record_request(
            latency_ms=100, cost_usd=0.001, tokens_in=50, tokens_out=100, quality_score=0.8
        )


def test_error_rate_is_zero_before_any_traffic(empty_metrics: None) -> None:
    assert metrics.requests_received() == 0
    assert metrics.error_rate_pct() == 0.0


def test_error_rate_counts_failed_over_received(empty_metrics: None) -> None:
    # Panel errors: count(request_failed) / count(request_received) * 100.
    _record_success(3)
    metrics.record_error("RuntimeError")

    assert metrics.requests_received() == 4
    assert metrics.error_rate_pct() == 25.0


def test_snapshot_exposes_error_rate_for_dashboard_panel(empty_metrics: None) -> None:
    _record_success(49)
    metrics.record_error("RuntimeError")

    snapshot = metrics.snapshot()

    assert snapshot["requests_received"] == 50
    assert snapshot["errors_total"] == 1
    # 2% là threshold của panel errors trong config/dashboard.yaml (operator lte).
    assert snapshot["error_rate_pct"] == 2.0
    assert snapshot["error_breakdown"] == {"RuntimeError": 1}


def test_error_rate_breaches_threshold_when_failures_dominate(empty_metrics: None) -> None:
    _record_success(9)
    for _ in range(3):
        metrics.record_error("RuntimeError")

    assert metrics.error_rate_pct() == 25.0
    assert metrics.error_rate_pct() > 2  # vượt threshold panel errors
