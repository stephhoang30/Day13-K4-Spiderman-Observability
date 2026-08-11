"use client";

/**
 * Chart primitives — inline SVG viết tay, không dùng thư viện chart ngoài,
 * không gọi CDN. Mọi màu lấy từ CSS variable trong app/globals.css.
 */

import type { SeriesPoint } from "@/lib/types";
import { fmtClock } from "@/lib/format";

import styles from "./charts.module.css";

const BLUE = "var(--brand-blue)";
const RED = "var(--brand-red)";
const GREEN = "var(--pass)";

function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) return [0];
  const step = max / count;
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

function shortNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  if (abs >= 10) return value.toFixed(0);
  if (abs >= 1) return value.toFixed(1);
  if (abs === 0) return "0";
  if (abs >= 0.01) return value.toFixed(3);
  return value.toFixed(4);
}

/* ------------------------------------------------------------------ */
/* Bar chart dọc + đường threshold (dùng cho latency P50/P95/P99)       */
/* ------------------------------------------------------------------ */

export interface CategoryBar {
  label: string;
  value: number;
  display: string;
  /** Bar này chính là giá trị bị so với threshold. */
  isThresholdBar?: boolean;
}

export function CategoryBarChart({
  bars,
  threshold,
  sloLabel,
  breach,
}: {
  bars: CategoryBar[];
  threshold: number;
  sloLabel: string;
  breach: boolean;
}) {
  const W = 480;
  const H = 196;
  const padL = 44;
  const padR = 92;
  const padT = 26;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const dataMax = bars.reduce((m, b) => Math.max(m, b.value), 0);
  const yMax = Math.max(dataMax * 1.2, threshold * 1.18, 1);
  const y = (v: number) => padT + plotH - (v / yMax) * plotH;

  const slot = plotW / bars.length;
  const barW = Math.min(58, slot * 0.5);
  const sloY = y(threshold);

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Bar chart ${bars.map((b) => b.label).join(", ")} với SLO line ${sloLabel}`}
    >
      {niceTicks(yMax).map((t) => (
        <g key={t}>
          <line className={styles.grid} x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} />
          <text className={styles.tickLabel} x={padL - 8} y={y(t) + 3} textAnchor="end">
            {shortNumber(t)}
          </text>
        </g>
      ))}

      {bars.map((b, i) => {
        const cx = padL + slot * i + slot / 2;
        const top = y(b.value);
        const fill = b.isThresholdBar && breach ? RED : b.isThresholdBar ? BLUE : "var(--brand-blue-mid)";
        return (
          <g key={b.label}>
            <rect
              x={cx - barW / 2}
              y={top}
              width={barW}
              height={Math.max(2, padT + plotH - top)}
              rx={3}
              fill={fill}
              opacity={b.isThresholdBar ? 1 : 0.62}
            />
            <text className={styles.valueLabel} x={cx} y={top - 7} textAnchor="middle">
              {b.display}
            </text>
            <text className={styles.catLabel} x={cx} y={padT + plotH + 17} textAnchor="middle">
              {b.label}
            </text>
          </g>
        );
      })}

      <line className={styles.axis} x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} />

      <line className={styles.sloLine} x1={padL} x2={padL + plotW + 6} y1={sloY} y2={sloY} />
      <text className={styles.sloLabel} x={padL + plotW + 12} y={sloY + 4}>
        {sloLabel}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Trục thời gian dùng chung cho chuỗi theo phút                        */
/* ------------------------------------------------------------------ */

function timeTicks(series: SeriesPoint[]): { idx: number; label: string }[] {
  if (series.length === 0) return [];
  const wanted = Math.min(5, series.length);
  const out: { idx: number; label: string }[] = [];
  for (let i = 0; i < wanted; i += 1) {
    const idx = Math.round((i * (series.length - 1)) / Math.max(1, wanted - 1));
    out.push({ idx, label: fmtClock(series[idx].t) });
  }
  return out;
}

function EmptySeries({ w, h }: { w: number; h: number }) {
  return (
    <text className={styles.emptyNote} x={w / 2} y={h / 2} textAnchor="middle">
      Không có điểm dữ liệu trong cửa sổ
    </text>
  );
}

/* ------------------------------------------------------------------ */
/* Area/line chart theo phút (traffic)                                  */
/* ------------------------------------------------------------------ */

export function MinuteAreaChart({
  series,
  threshold,
  sloLabel,
  breach,
}: {
  series: SeriesPoint[];
  threshold: number;
  sloLabel: string;
  breach: boolean;
}) {
  const W = 480;
  const H = 196;
  const padL = 40;
  const padR = 96;
  const padT = 20;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const dataMax = series.reduce((m, p) => Math.max(m, p.value), 0);
  const yMax = Math.max(dataMax * 1.25, threshold * 1.8, 2);
  const y = (v: number) => padT + plotH - (v / yMax) * plotH;
  const x = (i: number) =>
    padL + (series.length <= 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);

  const line = series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area =
    series.length > 0
      ? `${line} L ${x(series.length - 1).toFixed(1)} ${padT + plotH} L ${x(0).toFixed(1)} ${padT + plotH} Z`
      : "";
  const sloY = y(threshold);
  const stroke = breach ? RED : BLUE;

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Area chart số request mỗi phút với SLO line ${sloLabel}`}
    >
      {niceTicks(yMax).map((t) => (
        <g key={t}>
          <line className={styles.grid} x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} />
          <text className={styles.tickLabel} x={padL - 8} y={y(t) + 3} textAnchor="end">
            {shortNumber(t)}
          </text>
        </g>
      ))}

      {series.length === 0 ? (
        <EmptySeries w={W} h={H} />
      ) : (
        <>
          <path d={area} fill={stroke} opacity={0.13} />
          <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
          {series.map((p, i) =>
            p.value > 0 ? <circle key={p.t} cx={x(i)} cy={y(p.value)} r={2.6} fill={stroke} /> : null,
          )}
        </>
      )}

      <line className={styles.axis} x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} />
      {timeTicks(series).map((t) => (
        <text
          key={t.idx}
          className={styles.tickLabel}
          x={x(t.idx)}
          y={padT + plotH + 15}
          textAnchor="middle"
        >
          {t.label}
        </text>
      ))}

      <line className={styles.sloLine} x1={padL} x2={padL + plotW + 6} y1={sloY} y2={sloY} />
      <text className={styles.sloLabel} x={padL + plotW + 12} y={sloY + 4}>
        {sloLabel}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Bar chart theo phút (cost)                                           */
/* ------------------------------------------------------------------ */

export function MinuteBarChart({
  series,
  valueSuffix,
}: {
  series: SeriesPoint[];
  valueSuffix: string;
}) {
  const W = 480;
  const H = 150;
  const padL = 46;
  const padR = 14;
  const padT = 16;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const dataMax = series.reduce((m, p) => Math.max(m, p.value), 0);
  const yMax = dataMax > 0 ? dataMax * 1.2 : 1;
  const y = (v: number) => padT + plotH - (v / yMax) * plotH;
  const slot = plotW / Math.max(1, series.length);
  const barW = Math.max(2, Math.min(22, slot * 0.72));

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Bar chart ${valueSuffix} theo từng phút`}
    >
      {niceTicks(yMax, 2).map((t) => (
        <g key={t}>
          <line className={styles.grid} x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} />
          <text className={styles.tickLabel} x={padL - 8} y={y(t) + 3} textAnchor="end">
            {shortNumber(t)}
          </text>
        </g>
      ))}

      {series.length === 0 ? (
        <EmptySeries w={W} h={H} />
      ) : (
        series.map((p, i) => {
          if (p.value <= 0) return null;
          const top = y(p.value);
          return (
            <rect
              key={p.t}
              x={padL + slot * i + (slot - barW) / 2}
              y={top}
              width={barW}
              height={Math.max(1.5, padT + plotH - top)}
              rx={1.5}
              fill={BLUE}
              opacity={0.85}
            />
          );
        })
      )}

      <line className={styles.axis} x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} />
      {timeTicks(series).map((t) => (
        <text
          key={t.idx}
          className={styles.tickLabel}
          x={padL + slot * t.idx + slot / 2}
          y={padT + plotH + 15}
          textAnchor="middle"
        >
          {t.label}
        </text>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Budget bar ngang — thang 0 → threshold, SLO line vẽ ngay trên thang  */
/* ------------------------------------------------------------------ */

export interface BudgetRow {
  label: string;
  value: number;
  display: string;
}

export function BudgetBars({
  rows,
  budget,
  sloLabel,
  breach,
}: {
  rows: BudgetRow[];
  budget: number;
  sloLabel: string;
  breach: boolean;
}) {
  const W = 480;
  const rowH = 40;
  const headerH = 22;
  const padL = 92;
  const padR = 16;
  const H = headerH + rows.length * rowH + 12;
  const trackW = W - padL - padR;

  const dataMax = rows.reduce((m, r) => Math.max(m, r.value), 0);
  const scaleMax = Math.max(budget * 1.22, dataMax * 1.06, 1e-9);
  const sloX = padL + (budget / scaleMax) * trackW;

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Budget bars so với ${sloLabel}`}
    >
      <text className={styles.sloLabel} x={sloX} y={12} textAnchor="middle">
        {sloLabel}
      </text>
      <line className={styles.sloLine} x1={sloX} x2={sloX} y1={headerH - 6} y2={H - 8} />

      {rows.map((r, i) => {
        const cy = headerH + i * rowH + rowH / 2 - 4;
        const w = Math.max(2, (r.value / scaleMax) * trackW);
        const over = r.value > budget;
        return (
          <g key={r.label}>
            <text className={styles.catLabel} x={padL - 10} y={cy + 4} textAnchor="end">
              {r.label}
            </text>
            <rect x={padL} y={cy - 11} width={trackW} height={22} rx={4} fill="var(--grid)" />
            <rect
              x={padL}
              y={cy - 11}
              width={w}
              height={22}
              rx={4}
              fill={over || breach ? RED : BLUE}
            />
            <text
              className={styles.valueLabel}
              x={padL + w + 8}
              y={cy + 5}
              textAnchor="start"
            >
              {r.display}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Gauge nửa vòng 0 → 1 (quality)                                       */
/* ------------------------------------------------------------------ */

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function Gauge({
  value,
  threshold,
  display,
  sloLabel,
  pass,
}: {
  value: number;
  threshold: number;
  display: string;
  sloLabel: string;
  pass: boolean;
}) {
  const W = 480;
  const H = 196;
  const cx = W / 2;
  const cy = 156;
  const r = 104;
  const clamped = Math.max(0, Math.min(1, value));
  const valueEnd = 180 + 180 * clamped;
  const thrAngle = 180 + 180 * Math.max(0, Math.min(1, threshold));
  const [tx0, ty0] = polar(cx, cy, r - 17, thrAngle);
  const [tx1, ty1] = polar(cx, cy, r + 17, thrAngle);
  const [lx, ly] = polar(cx, cy, r + 32, thrAngle);
  const color = pass ? GREEN : RED;

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Gauge quality score ${display} với SLO ${sloLabel}`}
    >
      <path
        d={arcPath(cx, cy, r, 180, 360)}
        fill="none"
        stroke="var(--grid)"
        strokeWidth={20}
        strokeLinecap="round"
      />
      {clamped > 0 && (
        <path
          d={arcPath(cx, cy, r, 180, valueEnd)}
          fill="none"
          stroke={color}
          strokeWidth={20}
          strokeLinecap="round"
        />
      )}

      <line className={styles.sloLine} x1={tx0} y1={ty0} x2={tx1} y2={ty1} />
      <text className={styles.sloLabel} x={lx} y={ly} textAnchor="middle">
        {sloLabel}
      </text>

      <text
        x={cx}
        y={cy - 16}
        textAnchor="middle"
        style={{ fontSize: 40, fontWeight: 700, fill: color }}
      >
        {display}
      </text>
      <text className={styles.axisLabel} x={cx} y={cy + 6} textAnchor="middle">
        mean quality_score
      </text>

      <text className={styles.tickLabel} x={cx - r} y={cy + 20} textAnchor="middle">
        0.00
      </text>
      <text className={styles.tickLabel} x={cx + r} y={cy + 20} textAnchor="middle">
        1.00
      </text>
    </svg>
  );
}
