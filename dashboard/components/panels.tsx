"use client";

/**
 * Sáu panel theo đúng contract `config/dashboard.yaml`.
 * Title / unit / threshold đều lấy từ props (đến từ YAML), không hard-code.
 */

import {
  BudgetBars,
  CategoryBarChart,
  Gauge,
  MinuteAreaChart,
  MinuteBarChart,
} from "./charts";
import PanelCard from "./PanelCard";
import styles from "./panels.module.css";

import { fmtInt, fmtNum, fmtUsd, operatorSymbol } from "@/lib/format";
import type {
  CostPanelData,
  ErrorsPanelData,
  LatencyPanelData,
  PanelData,
  QualityPanelData,
  TokensPanelData,
  TrafficPanelData,
} from "@/lib/types";

function sloText(
  aggregation: string,
  operator: "lte" | "gte",
  value: string,
): string {
  return `SLO: ${aggregation} ${operatorSymbol(operator)} ${value}`;
}

/* ----------------------------- 1. latency ----------------------------- */

function LatencyPanel({ p }: { p: LatencyPanelData }) {
  const thr = p.threshold;
  return (
    <PanelCard
      id={p.id}
      title={p.title}
      unit={p.unit}
      pass={p.pass}
      value={fmtInt(p.p95)}
      valueUnit="ms"
      valueLabel={`P95 latency (${thr.aggregation} là chỉ số bị chấm)`}
      thresholdText={sloText(thr.aggregation, thr.operator, `${fmtInt(thr.value)} ms`)}
      stats={[
        { label: "P50", value: `${fmtInt(p.p50)} ms` },
        { label: "P95", value: `${fmtInt(p.p95)} ms` },
        { label: "P99", value: `${fmtInt(p.p99)} ms` },
      ]}
      footer={
        <>
          <span>
            n = {fmtInt(p.sampleCount)} log <code>response_sent</code>
          </span>
          <span>
            field <code>latency_ms</code>
          </span>
        </>
      }
    >
      <CategoryBarChart
        bars={[
          { label: "P50", value: p.p50, display: fmtInt(p.p50) },
          { label: "P95", value: p.p95, display: fmtInt(p.p95), isThresholdBar: true },
          { label: "P99", value: p.p99, display: fmtInt(p.p99) },
        ]}
        threshold={thr.value}
        sloLabel={`SLO ${fmtInt(thr.value)} ms`}
        breach={!p.pass}
      />
    </PanelCard>
  );
}

/* ----------------------------- 2. traffic ----------------------------- */

function TrafficPanel({ p }: { p: TrafficPanelData }) {
  const thr = p.threshold;
  return (
    <PanelCard
      id={p.id}
      title={p.title}
      unit={p.unit}
      pass={p.pass}
      value={fmtNum(p.ratePerMinute, 2)}
      valueUnit="req/min"
      valueLabel={`rate_per_minute = ${fmtInt(p.count)} request ÷ ${fmtInt(
        Math.max(1, p.activeMinutes),
      )} phút có request`}
      thresholdText={sloText(thr.aggregation, thr.operator, `${fmtNum(thr.value, 0)} req/min`)}
      stats={[
        { label: "Total requests", value: fmtInt(p.count) },
        { label: "Peak / minute", value: fmtInt(p.peakPerMinute) },
        { label: "Active minutes", value: fmtInt(p.activeMinutes) },
      ]}
      footer={
        <>
          <span>
            event <code>request_received</code>
          </span>
          <span>bucket 1 phút, trục phủ trọn cửa sổ</span>
        </>
      }
    >
      <MinuteAreaChart
        series={p.series}
        threshold={thr.value}
        sloLabel={`SLO ${operatorSymbol(thr.operator)} ${fmtNum(thr.value, 0)} req/min`}
        breach={!p.pass}
      />
    </PanelCard>
  );
}

/* ------------------------------ 3. errors ----------------------------- */

function ErrorsPanel({ p }: { p: ErrorsPanelData }) {
  const thr = p.threshold;
  const maxCount = p.breakdown.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <PanelCard
      id={p.id}
      title={p.title}
      unit={p.unit}
      pass={p.pass}
      value={fmtNum(p.errorRatePct, 2)}
      valueUnit="%"
      valueLabel={`error_rate_pct = ${fmtInt(p.failed)} request_failed ÷ ${fmtInt(
        p.received,
      )} request_received`}
      thresholdText={sloText(thr.aggregation, thr.operator, `${fmtNum(thr.value, 0)} %`)}
      footer={
        <>
          <span>
            events <code>request_received</code> + <code>request_failed</code>
          </span>
          <span>
            field <code>error_type</code>
          </span>
        </>
      }
    >
      <BudgetBars
        rows={[{ label: "error_rate_pct", value: p.errorRatePct, display: `${fmtNum(p.errorRatePct, 2)} %` }]}
        budget={thr.value}
        sloLabel={`SLO ${operatorSymbol(thr.operator)} ${fmtNum(thr.value, 0)} %`}
        breach={!p.pass}
      />

      {p.breakdown.length === 0 ? (
        <div className={styles.noErrors}>
          Không có <code>request_failed</code> nào trong cửa sổ thời gian
        </div>
      ) : (
        <table className={styles.breakdown}>
          <caption>Breakdown theo error_type</caption>
          <thead>
            <tr>
              <th scope="col">error_type</th>
              <th scope="col" className={styles.shareBarCell}>
                share
              </th>
              <th scope="col" className={styles.num}>
                count
              </th>
              <th scope="col" className={styles.num}>
                % of requests
              </th>
            </tr>
          </thead>
          <tbody>
            {p.breakdown.map((row) => (
              <tr key={row.errorType}>
                <td>
                  <span className={styles.errType}>{row.errorType}</span>
                </td>
                <td className={styles.shareBarCell}>
                  <div className={styles.shareTrack}>
                    <div
                      className={styles.shareFill}
                      style={{
                        width: `${maxCount === 0 ? 0 : (row.count / maxCount) * 100}%`,
                      }}
                    />
                  </div>
                </td>
                <td className={styles.num}>{fmtInt(row.count)}</td>
                <td className={styles.num}>
                  {p.received === 0 ? "0.00" : fmtNum((row.count / p.received) * 100, 2)} %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PanelCard>
  );
}

/* ------------------------------- 4. cost ------------------------------ */

function CostPanel({ p }: { p: CostPanelData }) {
  const thr = p.threshold;
  return (
    <PanelCard
      id={p.id}
      title={p.title}
      unit={p.unit}
      pass={p.pass}
      value={fmtUsd(p.total)}
      valueLabel="total cost_usd trong cửa sổ thời gian"
      thresholdText={sloText(thr.aggregation, thr.operator, `$${fmtNum(thr.value, 2)}`)}
      stats={[
        { label: "Total", value: fmtUsd(p.total) },
        { label: "Peak / minute", value: fmtUsd(p.peakMinute) },
        {
          label: "Avg / response",
          value: p.sampleCount === 0 ? "$0.000" : fmtUsd(p.total / p.sampleCount),
        },
      ]}
      footer={
        <>
          <span>
            event <code>response_sent</code>, field <code>cost_usd</code>
          </span>
          <span>sum theo từng phút + tổng cửa sổ</span>
        </>
      }
    >
      <MinuteBarChart series={p.series} valueSuffix="USD" />
      <BudgetBars
        rows={[{ label: "total", value: p.total, display: fmtUsd(p.total) }]}
        budget={thr.value}
        sloLabel={`SLO ${operatorSymbol(thr.operator)} $${fmtNum(thr.value, 2)}`}
        breach={!p.pass}
      />
    </PanelCard>
  );
}

/* ------------------------------ 5. tokens ----------------------------- */

function TokensPanel({ p }: { p: TokensPanelData }) {
  const thr = p.threshold;
  return (
    <PanelCard
      id={p.id}
      title={p.title}
      unit={p.unit}
      pass={p.pass}
      value={fmtInt(p.total)}
      valueUnit="tokens"
      valueLabel={`tokens_in + tokens_out · threshold áp cho từng field (${thr.aggregation})`}
      thresholdText={sloText(thr.aggregation, thr.operator, `${fmtInt(thr.value)} tokens`)}
      stats={[
        { label: "tokens_in", value: fmtInt(p.tokensIn) },
        { label: "tokens_out", value: fmtInt(p.tokensOut) },
        { label: "Sum", value: fmtInt(p.total) },
      ]}
      footer={
        <>
          <span>
            event <code>response_sent</code>
          </span>
          <span>
            fields <code>tokens_in</code>, <code>tokens_out</code>
          </span>
        </>
      }
    >
      <BudgetBars
        rows={[
          { label: "tokens_in", value: p.tokensIn, display: fmtInt(p.tokensIn) },
          { label: "tokens_out", value: p.tokensOut, display: fmtInt(p.tokensOut) },
        ]}
        budget={thr.value}
        sloLabel={`SLO ${operatorSymbol(thr.operator)} ${fmtInt(thr.value)} tokens`}
        breach={!p.pass}
      />
    </PanelCard>
  );
}

/* ----------------------------- 6. quality ----------------------------- */

function QualityPanel({ p }: { p: QualityPanelData }) {
  const thr = p.threshold;
  return (
    <PanelCard
      id={p.id}
      title={p.title}
      unit={p.unit}
      pass={p.pass}
      value={fmtNum(p.mean, 3)}
      valueLabel="mean quality_score (thang 0 → 1)"
      thresholdText={sloText(thr.aggregation, thr.operator, fmtNum(thr.value, 2))}
      stats={[
        { label: "Mean", value: fmtNum(p.mean, 3) },
        { label: "Min", value: fmtNum(p.min, 3) },
        { label: "Max", value: fmtNum(p.max, 3) },
      ]}
      footer={
        <>
          <span>
            n = {fmtInt(p.sampleCount)} log <code>response_sent</code>
          </span>
          <span>
            field <code>quality_score</code>
          </span>
        </>
      }
    >
      <Gauge
        value={p.mean}
        threshold={thr.value}
        display={fmtNum(p.mean, 2)}
        sloLabel={`SLO ${fmtNum(thr.value, 2)}`}
        pass={p.pass}
      />
    </PanelCard>
  );
}

/* ------------------------------ dispatcher ---------------------------- */

export default function Panel({ panel }: { panel: PanelData }) {
  switch (panel.id) {
    case "latency":
      return <LatencyPanel p={panel} />;
    case "traffic":
      return <TrafficPanel p={panel} />;
    case "errors":
      return <ErrorsPanel p={panel} />;
    case "cost":
      return <CostPanel p={panel} />;
    case "tokens":
      return <TokensPanel p={panel} />;
    case "quality":
      return <QualityPanel p={panel} />;
    default:
      return null;
  }
}
