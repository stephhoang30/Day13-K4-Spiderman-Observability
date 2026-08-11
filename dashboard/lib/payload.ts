/**
 * Dựng payload cho dashboard. Dùng chung cho hai đường:
 *   - `/api/metrics`  — polling 30s theo đúng contract dashboard.refresh_seconds
 *   - `/api/stream`   — SSE đẩy ngay khi data/logs.jsonl có dòng mới
 *
 * Cả hai phải trả về cùng một cấu trúc, nếu không thì panel sẽ nhảy số khi
 * chuyển giữa live và polling.
 */
import path from "node:path";

import {
  ContractError,
  configPath,
  findRepoRoot,
  loadDashboardContract,
  logPath,
  readLogs,
  type LogRecord,
} from "./contract";
import { buildPanels, filterWindow, resolveWindow } from "./metrics";
import { buildPipeline } from "./pipeline";
import type { LiveEvent, MetricsResponse } from "./types";

const NO_DATA_MESSAGE =
  "Chưa có dữ liệu — hãy chạy `python scripts/load_test.py`";

/** Rút gọn một log record thành dòng cho live feed. */
export function toLiveEvent(record: LogRecord): LiveEvent {
  return {
    ts: record.ts,
    event: record.event,
    correlationId: record.correlation_id ?? null,
    feature: record.feature ?? null,
    latencyMs: record.latency_ms ?? null,
    errorType: record.error_type ?? null,
    costUsd: record.cost_usd ?? null,
  };
}

export interface BuiltPayload {
  body: MetricsResponse;
  /** Toàn bộ record trong cửa sổ, để caller lấy phần mới cho live feed. */
  records: LogRecord[];
}

export async function buildMetricsPayload(): Promise<BuiltPayload> {
  const root = findRepoRoot();
  const cfgFile = configPath(root);
  const logFile = logPath(root);
  const relLog = path.relative(root, logFile);
  const relCfg = path.relative(root, cfgFile);
  const generatedAt = new Date().toISOString();

  let contract;
  try {
    contract = await loadDashboardContract(root);
  } catch (err) {
    const message =
      err instanceof ContractError
        ? err.message
        : `Lỗi không xác định khi đọc contract: ${(err as Error).message}`;
    return {
      records: [],
      body: {
        status: "error",
        message,
        generatedAt,
        dashboard: { title: "AI Observability", timeRangeMinutes: 60, refreshSeconds: 30 },
        window: { from: null, to: null },
        source: {
          logPath: relLog,
          configPath: relCfg,
          totalLines: 0,
          parsed: 0,
          skipped: 0,
          inWindow: 0,
          latestTs: null,
        },
        panels: [],
        pipeline: null,
        liveEvents: [],
      },
    };
  }

  const dashboard = {
    title: contract.title,
    timeRangeMinutes: contract.timeRangeMinutes,
    refreshSeconds: contract.refreshSeconds,
  };

  const logs = await readLogs(logFile);
  const window = resolveWindow(logs.records, contract.timeRangeMinutes);

  if (!logs.exists || window === null) {
    return {
      records: [],
      body: {
        status: "no-data",
        message: NO_DATA_MESSAGE,
        generatedAt,
        dashboard,
        window: { from: null, to: null },
        source: {
          logPath: relLog,
          configPath: relCfg,
          totalLines: logs.totalLines,
          parsed: logs.parsed,
          skipped: logs.skipped,
          inWindow: 0,
          latestTs: null,
        },
        panels: [],
        pipeline: null,
        liveEvents: [],
      },
    };
  }

  const inWindow = filterWindow(logs.records, window);
  const panels = buildPanels(contract, inWindow, window);
  const passCount = panels.filter((panel) => panel.pass).length;

  return {
    records: inWindow,
    body: {
      status: "ok",
      message: null,
      generatedAt,
      dashboard,
      window: {
        from: new Date(window.fromMs).toISOString(),
        to: new Date(window.toMs).toISOString(),
      },
      source: {
        logPath: relLog,
        configPath: relCfg,
        totalLines: logs.totalLines,
        parsed: logs.parsed,
        skipped: logs.skipped,
        inWindow: inWindow.length,
        latestTs: new Date(window.toMs).toISOString(),
      },
      panels,
      pipeline: buildPipeline(contract, logs, inWindow, window, passCount),
      // Mặc định là 12 record cuối; `/api/stream` sẽ thay bằng phần thật sự mới.
      liveEvents: inWindow.slice(-12).map(toLiveEvent),
    },
  };
}
