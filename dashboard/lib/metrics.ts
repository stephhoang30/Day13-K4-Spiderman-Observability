import type { LogRecord } from "./contract";
import type {
  DashboardContract,
  PanelContract,
  PanelData,
  PanelThreshold,
  SeriesPoint,
} from "./types";

const MINUTE_MS = 60_000;

/**
 * round() của Python dùng banker's rounding (half-to-even). Copy lại để
 * percentile ở dashboard khớp chính xác với `app/metrics.py::percentile`.
 */
function roundHalfToEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Nearest-rank percentile, cùng công thức với `app/metrics.py`. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const items = [...values].sort((a, b) => a - b);
  const raw = roundHalfToEven((p / 100) * items.length + 0.5) - 1;
  const idx = Math.max(0, Math.min(items.length - 1, raw));
  return items[idx];
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function floorToMinute(ms: number): number {
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

/**
 * Tạo chuỗi bucket 1 phút phủ trọn cửa sổ [from, to] để trục thời gian luôn
 * thể hiện đúng 60 phút, kể cả khi dữ liệu chỉ dồn vào vài phút.
 */
function minuteSeries(
  fromMs: number,
  toMs: number,
  totals: Map<number, number>,
): SeriesPoint[] {
  const start = floorToMinute(fromMs);
  const end = floorToMinute(toMs);
  const points: SeriesPoint[] = [];
  for (let t = start; t <= end; t += MINUTE_MS) {
    points.push({ t: new Date(t).toISOString(), value: totals.get(t) ?? 0 });
  }
  return points;
}

function evaluate(threshold: PanelThreshold, observed: number | null): boolean {
  if (observed === null) return false;
  return threshold.operator === "lte"
    ? observed <= threshold.value
    : observed >= threshold.value;
}

export interface Window {
  fromMs: number;
  toMs: number;
}

/**
 * Cửa sổ 60 phút được neo vào log MỚI NHẤT trong file (không phải Date.now()),
 * vì dữ liệu lab được sinh theo từng đợt load test.
 */
export function resolveWindow(
  records: LogRecord[],
  timeRangeMinutes: number,
): Window | null {
  if (records.length === 0) return null;
  let latest = -Infinity;
  for (const r of records) {
    if (r.tsMs > latest) latest = r.tsMs;
  }
  if (!Number.isFinite(latest)) return null;
  return { fromMs: latest - timeRangeMinutes * MINUTE_MS, toMs: latest };
}

function withinWindow(record: LogRecord, w: Window): boolean {
  return record.tsMs >= w.fromMs && record.tsMs <= w.toMs;
}

export function filterWindow(records: LogRecord[], w: Window): LogRecord[] {
  return records.filter((r) => withinWindow(r, w));
}

function buildPanel(
  panel: PanelContract,
  records: LogRecord[],
  w: Window,
): PanelData {
  const responses = records.filter((r) => r.event === "response_sent");
  const received = records.filter((r) => r.event === "request_received");
  const failed = records.filter((r) => r.event === "request_failed");

  switch (panel.id) {
    case "latency": {
      const values = responses
        .map((r) => r.latency_ms)
        .filter((v): v is number => v !== undefined);
      const p50 = percentile(values, 50);
      const p95 = percentile(values, 95);
      const p99 = percentile(values, 99);
      const aggs: Record<string, number> = { p50, p95, p99 };
      const observed = aggs[panel.threshold.aggregation] ?? null;
      return {
        id: "latency",
        title: panel.title,
        unit: panel.unit,
        threshold: panel.threshold,
        observed,
        pass: evaluate(panel.threshold, observed),
        sampleCount: values.length,
        p50: round(p50, 1),
        p95: round(p95, 1),
        p99: round(p99, 1),
      };
    }

    case "traffic": {
      const totals = new Map<number, number>();
      for (const r of received) {
        const bucket = floorToMinute(r.tsMs);
        totals.set(bucket, (totals.get(bucket) ?? 0) + 1);
      }
      const series = minuteSeries(w.fromMs, w.toMs, totals);
      const count = received.length;
      const activeMinutes = totals.size;
      const peakPerMinute = series.reduce((max, p) => Math.max(max, p.value), 0);
      // rate_per_minute = count / số phút thực sự có request (mean của bucket
      // 1m không rỗng). Dữ liệu lab chạy theo burst nên chia cho 60 sẽ bóp méo.
      const ratePerMinute = count === 0 ? 0 : count / Math.max(1, activeMinutes);
      const aggs: Record<string, number> = {
        count,
        rate_per_minute: ratePerMinute,
      };
      const observed = aggs[panel.threshold.aggregation] ?? null;
      return {
        id: "traffic",
        title: panel.title,
        unit: panel.unit,
        threshold: panel.threshold,
        observed: observed === null ? null : round(observed, 2),
        pass: evaluate(panel.threshold, observed),
        sampleCount: count,
        count,
        ratePerMinute: round(ratePerMinute, 2),
        peakPerMinute,
        activeMinutes,
        series,
      };
    }

    case "errors": {
      const counts = new Map<string, number>();
      for (const r of failed) {
        const key = r.error_type ?? "unknown";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const breakdown = [...counts.entries()]
        .map(([errorType, count]) => ({ errorType, count }))
        .sort((a, b) => b.count - a.count || a.errorType.localeCompare(b.errorType));
      const errorRatePct =
        received.length === 0 ? 0 : (failed.length / received.length) * 100;
      const aggs: Record<string, number> = {
        error_rate_pct: errorRatePct,
        count_by_value: failed.length,
      };
      const observed = aggs[panel.threshold.aggregation] ?? null;
      return {
        id: "errors",
        title: panel.title,
        unit: panel.unit,
        threshold: panel.threshold,
        observed: observed === null ? null : round(observed, 2),
        pass: evaluate(panel.threshold, observed),
        sampleCount: received.length + failed.length,
        errorRatePct: round(errorRatePct, 2),
        received: received.length,
        failed: failed.length,
        breakdown,
      };
    }

    case "cost": {
      const totals = new Map<number, number>();
      let total = 0;
      let samples = 0;
      for (const r of responses) {
        if (r.cost_usd === undefined) continue;
        samples += 1;
        total += r.cost_usd;
        const bucket = floorToMinute(r.tsMs);
        totals.set(bucket, (totals.get(bucket) ?? 0) + r.cost_usd);
      }
      const series = minuteSeries(w.fromMs, w.toMs, totals).map((p) => ({
        t: p.t,
        value: round(p.value, 6),
      }));
      const peakMinute = series.reduce((max, p) => Math.max(max, p.value), 0);
      const aggs: Record<string, number> = {
        total,
        sum_by_minute: peakMinute,
      };
      const observed = aggs[panel.threshold.aggregation] ?? null;
      return {
        id: "cost",
        title: panel.title,
        unit: panel.unit,
        threshold: panel.threshold,
        observed: observed === null ? null : round(observed, 6),
        pass: evaluate(panel.threshold, observed),
        sampleCount: samples,
        total: round(total, 6),
        peakMinute,
        series,
      };
    }

    case "tokens": {
      let tokensIn = 0;
      let tokensOut = 0;
      let samples = 0;
      for (const r of responses) {
        if (r.tokens_in === undefined && r.tokens_out === undefined) continue;
        samples += 1;
        tokensIn += r.tokens_in ?? 0;
        tokensOut += r.tokens_out ?? 0;
      }
      // sum_by_field: threshold áp cho TỪNG field, nên lấy field lớn nhất.
      const worstField = Math.max(tokensIn, tokensOut);
      const aggs: Record<string, number> = {
        sum_by_field: worstField,
        total: tokensIn + tokensOut,
      };
      const observed = aggs[panel.threshold.aggregation] ?? null;
      return {
        id: "tokens",
        title: panel.title,
        unit: panel.unit,
        threshold: panel.threshold,
        observed,
        pass: evaluate(panel.threshold, observed),
        sampleCount: samples,
        tokensIn,
        tokensOut,
        total: tokensIn + tokensOut,
      };
    }

    case "quality":
    default: {
      const values = responses
        .map((r) => r.quality_score)
        .filter((v): v is number => v !== undefined);
      const avg = mean(values);
      const aggs: Record<string, number> = { mean: avg };
      const observed = aggs[panel.threshold.aggregation] ?? null;
      return {
        id: "quality",
        title: panel.title,
        unit: panel.unit,
        threshold: panel.threshold,
        observed: observed === null ? null : round(observed, 4),
        pass: evaluate(panel.threshold, observed),
        sampleCount: values.length,
        mean: round(avg, 4),
        min: values.length ? round(Math.min(...values), 4) : 0,
        max: values.length ? round(Math.max(...values), 4) : 0,
      };
    }
  }
}

export function buildPanels(
  contract: DashboardContract,
  records: LogRecord[],
  w: Window,
): PanelData[] {
  return contract.panels.map((panel) => buildPanel(panel, records, w));
}
