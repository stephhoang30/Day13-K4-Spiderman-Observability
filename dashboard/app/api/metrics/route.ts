import path from "node:path";

import {
  ContractError,
  configPath,
  findRepoRoot,
  loadDashboardContract,
  logPath,
  readLogs,
} from "@/lib/contract";
import { buildPanels, filterWindow, resolveWindow } from "@/lib/metrics";
import { buildPipeline } from "@/lib/pipeline";
import type { MetricsResponse } from "@/lib/types";

// Luôn đọc lại logs.jsonl trên từng request — dashboard phải phản ánh file
// hiện tại, không phải bản snapshot lúc build.
export const dynamic = "force-dynamic";

const NO_DATA_MESSAGE =
  "Chưa có dữ liệu — hãy chạy `python scripts/load_test.py`";

export async function GET() {
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
    const body: MetricsResponse = {
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
    };
    return Response.json(body, { status: 500 });
  }

  const dashboard = {
    title: contract.title,
    timeRangeMinutes: contract.timeRangeMinutes,
    refreshSeconds: contract.refreshSeconds,
  };

  const logs = await readLogs(logFile);
  const window = resolveWindow(logs.records, contract.timeRangeMinutes);

  if (!logs.exists || window === null) {
    const body: MetricsResponse = {
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
    };
    return Response.json(body);
  }

  const inWindow = filterWindow(logs.records, window);
  const panels = buildPanels(contract, inWindow, window);
  const passCount = panels.filter((panel) => panel.pass).length;
  const body: MetricsResponse = {
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
  };

  return Response.json(body);
}
