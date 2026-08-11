/**
 * Kiểu dữ liệu dùng chung giữa Route Handler (server) và dashboard (client).
 *
 * Contract gốc nằm ở `config/dashboard.yaml` tại repo root — title / unit /
 * threshold đều đọc từ file đó, không hard-code trong UI.
 */

export type ThresholdOperator = "lte" | "gte";

export interface PanelThreshold {
  aggregation: string;
  operator: ThresholdOperator;
  value: number;
}

/** Một panel như mô tả trong config/dashboard.yaml. */
export interface PanelContract {
  id: string;
  title: string;
  source: string;
  events: string[];
  fields: string[];
  aggregations: string[];
  query: string;
  unit: string;
  threshold: PanelThreshold;
}

export interface DashboardContract {
  schemaVersion: number;
  title: string;
  timeRangeMinutes: number;
  refreshSeconds: number;
  panels: PanelContract[];
}

/** Một điểm trong chuỗi theo phút. `t` là ISO UTC của đầu phút. */
export interface SeriesPoint {
  t: string;
  value: number;
}

interface PanelBase {
  id: string;
  title: string;
  unit: string;
  threshold: PanelThreshold;
  /** Giá trị được so với threshold (đúng theo `threshold.aggregation`). */
  observed: number | null;
  pass: boolean;
  /** Số log line đóng góp vào panel này trong cửa sổ thời gian. */
  sampleCount: number;
}

export interface LatencyPanelData extends PanelBase {
  id: "latency";
  p50: number;
  p95: number;
  p99: number;
}

export interface TrafficPanelData extends PanelBase {
  id: "traffic";
  count: number;
  ratePerMinute: number;
  peakPerMinute: number;
  activeMinutes: number;
  series: SeriesPoint[];
}

export interface ErrorBreakdownRow {
  errorType: string;
  count: number;
}

export interface ErrorsPanelData extends PanelBase {
  id: "errors";
  errorRatePct: number;
  received: number;
  failed: number;
  breakdown: ErrorBreakdownRow[];
}

export interface CostPanelData extends PanelBase {
  id: "cost";
  total: number;
  peakMinute: number;
  series: SeriesPoint[];
}

export interface TokensPanelData extends PanelBase {
  id: "tokens";
  tokensIn: number;
  tokensOut: number;
  total: number;
}

export interface QualityPanelData extends PanelBase {
  id: "quality";
  mean: number;
  min: number;
  max: number;
}

export type PanelData =
  | LatencyPanelData
  | TrafficPanelData
  | ErrorsPanelData
  | CostPanelData
  | TokensPanelData
  | QualityPanelData;

export type DashboardStatus = "ok" | "no-data" | "error";

/**
 * Một chặng trong đường đi của dữ liệu, từ lúc request vào API tới lúc ra
 * verdict PASS/BREACH. Dùng cho sơ đồ pipeline khi demo.
 */
export interface PipelineStage {
  id: string;
  /** Tên ngắn hiển thị trong sơ đồ. */
  label: string;
  /** Thành phần thật trong repo chịu trách nhiệm chặng này. */
  source: string;
  /** Một câu giải thích chặng này làm gì. */
  detail: string;
  /** Con số thật đang chảy qua chặng này. */
  value: number;
  valueLabel: string;
  /** Các số phụ, ví dụ tách theo loại event. */
  breakdown?: { label: string; value: number }[];
}

/** Một bước trong cách tính ra con số của panel. */
export interface DerivationStep {
  /** Việc đang làm: lọc, lấy field, áp công thức, so ngưỡng. */
  kind: "source" | "window" | "filter" | "field" | "formula" | "threshold";
  label: string;
  /** Biểu thức đúng như đang chạy, đã thay số thật vào. */
  expr: string;
  result: string;
}

/** Một dòng log thật đóng góp vào panel, kèm field cần soi. */
export interface DerivationSample {
  raw: string;
  highlight: string[];
}

export interface PanelDerivation {
  panelId: string;
  /** Câu chốt: vì sao panel này PASS hay BREACH. */
  verdict: string;
  steps: DerivationStep[];
  samples: DerivationSample[];
  /** Ghi chú dành riêng cho lúc bảo vệ, ví dụ vì sao dùng P95. */
  note?: string;
}

export interface PipelineData {
  stages: PipelineStage[];
  derivations: PanelDerivation[];
}

export interface MetricsResponse {
  status: DashboardStatus;
  /** Thông điệp hiển thị khi chưa có dữ liệu hoặc có lỗi đọc file. */
  message: string | null;
  generatedAt: string;
  dashboard: {
    title: string;
    timeRangeMinutes: number;
    refreshSeconds: number;
  };
  /** Cửa sổ thời gian thực tế đang xét (ISO UTC), tính lùi từ log mới nhất. */
  window: { from: string | null; to: string | null };
  source: {
    logPath: string;
    configPath: string;
    totalLines: number;
    parsed: number;
    skipped: number;
    inWindow: number;
    /** ts của log mới nhất trong file (mốc neo cửa sổ 60 phút). */
    latestTs: string | null;
  };
  panels: PanelData[];
  /** Lớp giải thích: đường đi dữ liệu và cách tính từng panel. */
  pipeline: PipelineData | null;
}
