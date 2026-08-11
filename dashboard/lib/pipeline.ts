/**
 * Lớp giải thích cho phần demo: dựng lại đường đi của dữ liệu và cách từng
 * panel ra được con số cuối cùng.
 *
 * Nguyên tắc: mọi số trong đây phải được tính lại từ CHÍNH tập record đã dùng
 * để dựng panel, không nhận số truyền sẵn. Nếu hai bên lệch nhau thì đó là bug
 * thật cần lộ ra, không phải chi tiết trang trí.
 */
import type { LogRecord, LogReadResult } from "./contract";
import { mean, percentile, type Window } from "./metrics";
import type {
  DashboardContract,
  DerivationSample,
  DerivationStep,
  PanelContract,
  PanelDerivation,
  PipelineData,
  PipelineStage,
} from "./types";

const MINUTE_MS = 60_000;

function fmt(value: number, digits = 0): string {
  return value.toLocaleString("vi-VN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function operatorSymbol(operator: "lte" | "gte"): string {
  return operator === "lte" ? "≤" : "≥";
}

/** Lấy tối đa `limit` dòng log thật làm bằng chứng cho một panel. */
function samplesOf(
  records: LogRecord[],
  highlight: string[],
  limit = 2,
): DerivationSample[] {
  return records.slice(-limit).map((record) => ({
    raw: record.raw,
    highlight,
  }));
}

function thresholdStep(
  panel: PanelContract,
  observed: number,
  digits: number,
): DerivationStep {
  const { aggregation, operator, value } = panel.threshold;
  const pass = operator === "lte" ? observed <= value : observed >= value;
  return {
    kind: "threshold",
    label: "So với threshold trong config/dashboard.yaml",
    expr: `${fmt(observed, digits)} ${operatorSymbol(operator)} ${fmt(value, digits)}  (${aggregation})`,
    result: pass ? "PASS" : "BREACH",
  };
}

function verdictOf(panel: PanelContract, observed: number, digits: number, unit: string): string {
  const { operator, value, aggregation } = panel.threshold;
  const pass = operator === "lte" ? observed <= value : observed >= value;
  const relation = pass ? "vẫn nằm trong" : "đã vượt";
  return `${aggregation} = ${fmt(observed, digits)} ${unit} ${relation} ngưỡng ${operatorSymbol(operator)} ${fmt(value, digits)} ${unit}.`;
}

function minuteBuckets(records: LogRecord[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const record of records) {
    const bucket = Math.floor(record.tsMs / MINUTE_MS) * MINUTE_MS;
    totals.set(bucket, (totals.get(bucket) ?? 0) + 1);
  }
  return totals;
}

/** Bốn chặng đầu mô tả hệ thống sinh log; ba chặng sau là cách dashboard đọc. */
function buildStages(
  logs: LogReadResult,
  inWindow: LogRecord[],
  contract: DashboardContract,
  passCount: number,
): PipelineStage[] {
  const received = inWindow.filter((r) => r.event === "request_received");
  const responded = inWindow.filter((r) => r.event === "response_sent");
  const failed = inWindow.filter((r) => r.event === "request_failed");
  const correlationIds = new Set(
    inWindow.map((r) => r.correlation_id).filter((v): v is string => Boolean(v)),
  );
  // Middleware gán ID cho MỌI endpoint, nên tổng ID luôn ≥ số request /chat.
  // Tách ra để người xem không tưởng là đếm sai.
  const chatIds = new Set(
    inWindow
      .filter((r) => r.service === "api")
      .map((r) => r.correlation_id)
      .filter((v): v is string => Boolean(v)),
  );

  return [
    {
      id: "request",
      label: "Request vào API",
      source: "POST /chat",
      detail:
        "Client gửi câu hỏi. Mỗi request là một đơn vị công việc cần theo dõi được từ đầu tới cuối.",
      value: received.length,
      valueLabel: "request",
    },
    {
      id: "middleware",
      label: "Gán correlation ID",
      source: "app/middleware.py",
      detail:
        "clear_contextvars() để không rò rỉ context của request trước, sinh ID req-<8 hex> (ưu tiên header x-request-id), bind vào structlog rồi trả lại qua header x-request-id. Middleware chạy cho MỌI endpoint nên tổng số ID lớn hơn số request /chat — phần chênh là các lệnh điều khiển /incidents.",
      value: correlationIds.size,
      valueLabel: "ID duy nhất",
      breakdown: [
        { label: "từ /chat", value: chatIds.size },
        { label: "từ endpoint khác", value: correlationIds.size - chatIds.size },
      ],
    },
    {
      id: "agent",
      label: "Agent xử lý",
      source: "app/agent.py",
      detail:
        "retrieve() lấy document → resolve_prompt() lấy prompt theo label → llm.generate(). Mỗi bước là một span trên trace Langfuse.",
      value: responded.length + failed.length,
      valueLabel: "lượt xử lý",
      breakdown: [
        { label: "thành công", value: responded.length },
        { label: "thất bại", value: failed.length },
      ],
    },
    {
      id: "scrub",
      label: "Scrub PII rồi render JSON",
      source: "app/logging_config.py",
      detail:
        "Processor chain: merge_contextvars → add_log_level → TimeStamper → scrub_event → JsonlFileProcessor → JSONRenderer. scrub_event chạy TRƯỚC khi ghi file nên PII không bao giờ chạm đĩa.",
      value: inWindow.length,
      valueLabel: "log record",
      breakdown: [
        { label: "request_received", value: received.length },
        { label: "response_sent", value: responded.length },
        { label: "request_failed", value: failed.length },
      ],
    },
    {
      id: "file",
      label: "Ghi xuống file",
      source: "data/logs.jsonl",
      detail:
        "Mỗi dòng là một JSON độc lập. Dòng hỏng bị bỏ qua và đếm riêng thay vì làm sập dashboard.",
      value: logs.parsed,
      valueLabel: "dòng hợp lệ",
      breakdown: [
        { label: "tổng dòng", value: logs.totalLines },
        { label: "dòng hỏng", value: logs.skipped },
      ],
    },
    {
      id: "window",
      label: `Cắt cửa sổ ${contract.timeRangeMinutes} phút`,
      source: "lib/metrics.ts · resolveWindow()",
      detail:
        "Cửa sổ neo vào log MỚI NHẤT trong file chứ không phải Date.now(), vì dữ liệu lab được sinh theo từng đợt load test.",
      value: inWindow.length,
      valueLabel: "record trong cửa sổ",
    },
    {
      id: "aggregate",
      label: "Tổng hợp 6 panel",
      source: "config/dashboard.yaml",
      detail:
        "Mỗi panel lọc theo event của nó, lấy đúng field rồi áp phép tổng hợp mà contract quy định (percentile, count, rate, sum, mean).",
      value: contract.panels.length,
      valueLabel: "phép tổng hợp",
    },
    {
      id: "verdict",
      label: "So threshold → verdict",
      source: "threshold trong contract",
      detail:
        "Mỗi panel có operator lte/gte và một giá trị ngưỡng. Kết quả là PASS hoặc BREACH — đây là thứ alert sẽ bám vào.",
      value: passCount,
      valueLabel: `PASS / ${contract.panels.length} panel`,
      breakdown: [
        { label: "PASS", value: passCount },
        { label: "BREACH", value: contract.panels.length - passCount },
      ],
    },
  ];
}

function buildDerivation(
  panel: PanelContract,
  inWindow: LogRecord[],
  logs: LogReadResult,
  window: Window,
  contract: DashboardContract,
): PanelDerivation {
  const responses = inWindow.filter((r) => r.event === "response_sent");
  const received = inWindow.filter((r) => r.event === "request_received");
  const failed = inWindow.filter((r) => r.event === "request_failed");

  const head: DerivationStep[] = [
    {
      kind: "source",
      label: "Nguồn dữ liệu",
      expr: "data/logs.jsonl",
      result: `${fmt(logs.parsed)} dòng hợp lệ${logs.skipped > 0 ? ` · ${fmt(logs.skipped)} dòng hỏng bị bỏ qua` : ""}`,
    },
    {
      kind: "window",
      label: `Cửa sổ ${contract.timeRangeMinutes} phút neo vào log mới nhất`,
      expr: `ts ≥ ${new Date(window.fromMs).toISOString()}`,
      result: `${fmt(inWindow.length)} record`,
    },
  ];

  switch (panel.id) {
    case "latency": {
      const values = responses
        .map((r) => r.latency_ms)
        .filter((v): v is number => v !== undefined);
      const p50 = percentile(values, 50);
      const p95 = percentile(values, 95);
      const p99 = percentile(values, 99);
      const idx =
        values.length === 0
          ? 0
          : Math.max(0, Math.min(values.length - 1, Math.round(0.95 * values.length + 0.5) - 1));
      return {
        panelId: panel.id,
        verdict: verdictOf(panel, p95, 0, "ms"),
        steps: [
          ...head,
          {
            kind: "filter",
            label: 'Lọc event == "response_sent"',
            expr: `${fmt(inWindow.length)} record → chỉ giữ response_sent`,
            result: `${fmt(responses.length)} record`,
          },
          {
            kind: "field",
            label: "Lấy field latency_ms",
            expr: "record.latency_ms",
            result: `${fmt(values.length)} giá trị`,
          },
          {
            kind: "formula",
            label: "Sắp xếp tăng dần, nearest-rank percentile",
            expr: `idx = round(p/100 × ${fmt(values.length)} + 0.5) − 1   →  idx(P95) = ${fmt(idx)}`,
            result: `P50 ${fmt(p50)} · P95 ${fmt(p95)} · P99 ${fmt(p99)} ms`,
          },
          thresholdStep(panel, p95, 0),
        ],
        samples: samplesOf(responses, ["latency_ms", "correlation_id"]),
        note:
          values.length === 0
            ? undefined
            : `P50 = ${fmt(p50)} ms nhưng P95 = ${fmt(p95)} ms. Trung bình và P50 gần như không đổi khi một phần nhỏ request bị chậm, nên nhìn trung bình sẽ bỏ sót sự cố — chỉ percentile cao mới lộ tail latency. Đây chính là dấu hiệu của incident rag_slow.`,
      };
    }

    case "traffic": {
      const buckets = minuteBuckets(received);
      const activeMinutes = buckets.size;
      const rate = received.length === 0 ? 0 : received.length / Math.max(1, activeMinutes);
      return {
        panelId: panel.id,
        verdict: verdictOf(panel, rate, 2, "req/phút"),
        steps: [
          ...head,
          {
            kind: "filter",
            label: 'Lọc event == "request_received"',
            expr: `${fmt(inWindow.length)} record → chỉ giữ request_received`,
            result: `${fmt(received.length)} record`,
          },
          {
            kind: "formula",
            label: "Gom vào bucket 1 phút",
            expr: "floor(ts / 60s)",
            result: `${fmt(activeMinutes)} phút có request`,
          },
          {
            kind: "formula",
            label: "rate_per_minute",
            expr: `${fmt(received.length)} request ÷ ${fmt(activeMinutes)} phút`,
            result: `${fmt(rate, 2)} req/phút`,
          },
          thresholdStep(panel, rate, 2),
        ],
        samples: samplesOf(received, ["event", "feature", "correlation_id"]),
        note: "Chia cho số phút THỰC SỰ có request, không chia cho 60, vì load test chạy theo burst — chia cho 60 sẽ kéo rate xuống gần 0 và làm panel vô nghĩa.",
      };
    }

    case "errors": {
      const rate = received.length === 0 ? 0 : (failed.length / received.length) * 100;
      const counts = new Map<string, number>();
      for (const record of failed) {
        const key = record.error_type ?? "unknown";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const breakdown = [...counts.entries()]
        .map(([type, count]) => `${type}: ${count}`)
        .join(" · ");
      return {
        panelId: panel.id,
        verdict: verdictOf(panel, rate, 2, "%"),
        steps: [
          ...head,
          {
            kind: "filter",
            label: 'Mẫu số — lọc event == "request_received"',
            expr: "đếm mọi request đã nhận",
            result: `${fmt(received.length)} record`,
          },
          {
            kind: "filter",
            label: 'Tử số — lọc event == "request_failed"',
            expr: "đếm request trả về lỗi",
            result: `${fmt(failed.length)} record`,
          },
          {
            kind: "formula",
            label: "error_rate_pct",
            expr: `${fmt(failed.length)} ÷ ${fmt(received.length)} × 100`,
            result: `${fmt(rate, 2)} %`,
          },
          {
            kind: "field",
            label: "Breakdown theo field error_type",
            expr: "group by record.error_type",
            result: breakdown || "không có lỗi",
          },
          thresholdStep(panel, rate, 2),
        ],
        samples: samplesOf(failed.length > 0 ? failed : received, ["error_type", "correlation_id"]),
        note: "Cùng công thức này được cài trong app/metrics.py::error_rate_pct() với mẫu số = TRAFFIC + tổng ERRORS. Hai đường đo độc lập (counter in-memory ở /metrics và tính lại từ file log) phải ra cùng một số thì con số mới đáng tin.",
      };
    }

    case "cost": {
      const values = responses
        .map((r) => r.cost_usd)
        .filter((v): v is number => v !== undefined);
      const total = values.reduce((acc, v) => acc + v, 0);
      const perMinute = new Map<number, number>();
      for (const record of responses) {
        if (record.cost_usd === undefined) continue;
        const bucket = Math.floor(record.tsMs / MINUTE_MS) * MINUTE_MS;
        perMinute.set(bucket, (perMinute.get(bucket) ?? 0) + record.cost_usd);
      }
      const peak = [...perMinute.values()].reduce((max, v) => Math.max(max, v), 0);
      return {
        panelId: panel.id,
        verdict: verdictOf(panel, total, 4, "USD"),
        steps: [
          ...head,
          {
            kind: "filter",
            label: 'Lọc event == "response_sent"',
            expr: `${fmt(inWindow.length)} record → chỉ giữ response_sent`,
            result: `${fmt(responses.length)} record`,
          },
          {
            kind: "field",
            label: "Lấy field cost_usd",
            expr: "cost = tokens_in/1M × $3 + tokens_out/1M × $15  (app/agent.py)",
            result: `${fmt(values.length)} giá trị`,
          },
          {
            kind: "formula",
            label: "Tổng theo phút và tổng cửa sổ",
            expr: `sum(cost_usd) · phút cao nhất = $${peak.toFixed(4)}`,
            result: `$${total.toFixed(6)}`,
          },
          thresholdStep(panel, total, 4),
        ],
        samples: samplesOf(responses, ["cost_usd", "tokens_in", "tokens_out"]),
        note: "Khi cost tăng mà traffic phẳng thì vấn đề nằm ở số token mỗi request, không phải ở lượng người dùng — lúc đó phải soi panel Tokens và prompt version.",
      };
    }

    case "tokens": {
      let tokensIn = 0;
      let tokensOut = 0;
      for (const record of responses) {
        tokensIn += record.tokens_in ?? 0;
        tokensOut += record.tokens_out ?? 0;
      }
      const worst = Math.max(tokensIn, tokensOut);
      return {
        panelId: panel.id,
        verdict: verdictOf(panel, worst, 0, "tokens"),
        steps: [
          ...head,
          {
            kind: "filter",
            label: 'Lọc event == "response_sent"',
            expr: `${fmt(inWindow.length)} record → chỉ giữ response_sent`,
            result: `${fmt(responses.length)} record`,
          },
          {
            kind: "field",
            label: "Lấy hai field tokens_in và tokens_out",
            expr: "sum(tokens_in), sum(tokens_out)",
            result: `in ${fmt(tokensIn)} · out ${fmt(tokensOut)}`,
          },
          {
            kind: "formula",
            label: "sum_by_field áp cho TỪNG field",
            expr: `max(${fmt(tokensIn)}, ${fmt(tokensOut)})`,
            result: `${fmt(worst)} tokens`,
          },
          thresholdStep(panel, worst, 0),
        ],
        samples: samplesOf(responses, ["tokens_in", "tokens_out"]),
        note: "Threshold sum_by_field áp riêng cho từng field, nên field lớn hơn quyết định PASS/BREACH — không cộng gộp hai field lại rồi so.",
      };
    }

    case "quality":
    default: {
      const values = responses
        .map((r) => r.quality_score)
        .filter((v): v is number => v !== undefined);
      const avg = mean(values);
      return {
        panelId: panel.id,
        verdict: verdictOf(panel, avg, 4, ""),
        steps: [
          ...head,
          {
            kind: "filter",
            label: 'Lọc event == "response_sent"',
            expr: `${fmt(inWindow.length)} record → chỉ giữ response_sent`,
            result: `${fmt(responses.length)} record`,
          },
          {
            kind: "field",
            label: "Lấy field quality_score",
            expr: "heuristic: có document +0.2 · đủ dài +0.1 · trùng từ khoá +0.1",
            result: `${fmt(values.length)} giá trị`,
          },
          {
            kind: "formula",
            label: "Trung bình",
            expr: `sum(quality_score) ÷ ${fmt(values.length)}`,
            result: avg.toFixed(4),
          },
          thresholdStep(panel, avg, 4),
        ],
        samples: samplesOf(responses, ["quality_score"]),
        note: "Đây là proxy heuristic chứ không phải đánh giá chất lượng thật, nên nhóm chỉ theo dõi xu hướng và không dùng nó để page — một alert dựa trên proxy nhiễu sẽ nhanh chóng bị bỏ qua.",
      };
    }
  }
}

export function buildPipeline(
  contract: DashboardContract,
  logs: LogReadResult,
  inWindow: LogRecord[],
  window: Window,
  passCount: number,
): PipelineData {
  return {
    stages: buildStages(logs, inWindow, contract, passCount),
    derivations: contract.panels.map((panel) =>
      buildDerivation(panel, inWindow, logs, window, contract),
    ),
  };
}
