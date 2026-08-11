import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import type {
  DashboardContract,
  PanelContract,
  PanelThreshold,
  ThresholdOperator,
} from "./types";

/**
 * Đọc contract + log file từ repo root (thư mục cha của `dashboard/`).
 * Chỉ chạy server-side trong Route Handler.
 */

const CONFIG_RELATIVE = path.join("config", "dashboard.yaml");
const LOG_RELATIVE = path.join("data", "logs.jsonl");

/** Đi ngược lên từ cwd để tìm repo root (chỗ có `config/dashboard.yaml`). */
export function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(dir, CONFIG_RELATIVE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: `dashboard/` nằm ngay trong repo root.
  return path.resolve(process.cwd(), "..");
}

export function configPath(root: string): string {
  return path.join(root, CONFIG_RELATIVE);
}

export function logPath(root: string): string {
  return path.join(root, LOG_RELATIVE);
}

export class ContractError extends Error {}

function asStringList(value: unknown, where: string): string[] {
  if (!Array.isArray(value)) {
    throw new ContractError(`'${where}' phải là danh sách`);
  }
  return value.map((item) => String(item));
}

function parseThreshold(value: unknown, panelId: string): PanelThreshold {
  if (typeof value !== "object" || value === null) {
    throw new ContractError(`'${panelId}.threshold' phải là object`);
  }
  const raw = value as Record<string, unknown>;
  const operator = String(raw.operator);
  if (operator !== "lte" && operator !== "gte") {
    throw new ContractError(
      `'${panelId}.threshold.operator' chỉ nhận 'lte' hoặc 'gte'`,
    );
  }
  const numeric = Number(raw.value);
  if (!Number.isFinite(numeric)) {
    throw new ContractError(`'${panelId}.threshold.value' phải là số`);
  }
  return {
    aggregation: String(raw.aggregation),
    operator: operator as ThresholdOperator,
    value: numeric,
  };
}

function parsePanel(value: unknown): PanelContract {
  if (typeof value !== "object" || value === null) {
    throw new ContractError("Mỗi panel phải là một YAML object");
  }
  const raw = value as Record<string, unknown>;
  const id = String(raw.id ?? "");
  if (!id) throw new ContractError("Panel thiếu 'id'");
  return {
    id,
    title: String(raw.title ?? id),
    source: String(raw.source ?? LOG_RELATIVE),
    events: asStringList(raw.events, `${id}.events`),
    fields: asStringList(raw.fields, `${id}.fields`),
    aggregations: asStringList(raw.aggregations, `${id}.aggregations`),
    query: String(raw.query ?? ""),
    unit: String(raw.unit ?? ""),
    threshold: parseThreshold(raw.threshold, id),
  };
}

/** Đọc và validate `config/dashboard.yaml`. */
export async function loadDashboardContract(
  root: string,
): Promise<DashboardContract> {
  const file = configPath(root);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new ContractError(`Không đọc được dashboard contract: ${file}`);
  }

  let payload: unknown;
  try {
    payload = parseYaml(text);
  } catch (err) {
    throw new ContractError(
      `dashboard.yaml không phải YAML hợp lệ: ${(err as Error).message}`,
    );
  }

  const root_ = (payload as Record<string, unknown> | null)?.dashboard;
  if (typeof root_ !== "object" || root_ === null) {
    throw new ContractError("Thiếu object 'dashboard' trong dashboard.yaml");
  }
  const dash = root_ as Record<string, unknown>;
  const panels = dash.panels;
  if (!Array.isArray(panels) || panels.length === 0) {
    throw new ContractError("'dashboard.panels' phải là danh sách không rỗng");
  }

  return {
    schemaVersion: Number(dash.schema_version ?? 1),
    title: String(dash.title ?? "AI Observability"),
    timeRangeMinutes: Number(dash.time_range_minutes ?? 60),
    refreshSeconds: Number(dash.refresh_seconds ?? 30),
    panels: panels.map(parsePanel),
  };
}

export interface LogRecord {
  ts: string;
  tsMs: number;
  event: string;
  level?: string;
  service?: string;
  correlation_id?: string;
  feature?: string;
  model?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  quality_score?: number;
  error_type?: string;
}

export interface LogReadResult {
  exists: boolean;
  totalLines: number;
  parsed: number;
  skipped: number;
  records: LogRecord[];
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Đọc `data/logs.jsonl`. Dòng hỏng / thiếu `ts` / thiếu `event` bị bỏ qua và
 * đếm vào `skipped` thay vì làm sập route.
 */
export async function readLogs(file: string): Promise<LogReadResult> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return { exists: false, totalLines: 0, parsed: 0, skipped: 0, records: [] };
  }

  const lines = text.split("\n");
  const records: LogRecord[] = [];
  let totalLines = 0;
  let skipped = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    totalLines += 1;

    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      skipped += 1;
      continue;
    }
    if (typeof raw !== "object" || raw === null) {
      skipped += 1;
      continue;
    }

    const obj = raw as Record<string, unknown>;
    const ts = stringOrUndefined(obj.ts);
    const event = stringOrUndefined(obj.event);
    if (!ts || !event) {
      skipped += 1;
      continue;
    }
    const tsMs = Date.parse(ts);
    if (!Number.isFinite(tsMs)) {
      skipped += 1;
      continue;
    }

    records.push({
      ts,
      tsMs,
      event,
      level: stringOrUndefined(obj.level),
      service: stringOrUndefined(obj.service),
      correlation_id: stringOrUndefined(obj.correlation_id),
      feature: stringOrUndefined(obj.feature),
      model: stringOrUndefined(obj.model),
      latency_ms: numberOrUndefined(obj.latency_ms),
      tokens_in: numberOrUndefined(obj.tokens_in),
      tokens_out: numberOrUndefined(obj.tokens_out),
      cost_usd: numberOrUndefined(obj.cost_usd),
      quality_score: numberOrUndefined(obj.quality_score),
      error_type: stringOrUndefined(obj.error_type),
    });
  }

  return {
    exists: true,
    totalLines,
    parsed: records.length,
    skipped,
    records,
  };
}
