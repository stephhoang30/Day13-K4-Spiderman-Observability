"use client";

import { fmtClockSeconds, fmtDateTime, fmtInt } from "@/lib/format";
import type { MetricsResponse } from "@/lib/types";

import styles from "./Header.module.css";

export default function Header({
  data,
  lastUpdated,
  secondsToRefresh,
  timeRangeMinutes,
  refreshSeconds,
  liveConnected,
}: {
  data: MetricsResponse | null;
  lastUpdated: Date | null;
  secondsToRefresh: number;
  timeRangeMinutes: number;
  refreshSeconds: number;
  liveConnected: boolean;
}) {
  const win = data?.window ?? { from: null, to: null };
  const src = data?.source;

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          {/* Logo tĩnh nằm ở dashboard/public/vinuni_logo.svg */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.logo} src="/vinuni_logo.svg" alt="Logo VinUniversity" />
          <span className={styles.divider} />
          <div className={styles.titles}>
            <h1 className={styles.title}>Day 13 AI Observability</h1>
            <p className={styles.subtitle}>Nhóm Spiderman — K4</p>
          </div>
        </div>

        <div className={styles.chips}>
          {/* Live là kênh phụ đẩy ngay khi file log đổi; polling 30s bên dưới
              vẫn là đường bảo đảm theo contract. */}
          <span
            className={`${styles.chip} ${liveConnected ? styles.chipLive : styles.chipPlain}`}
          >
            <span
              className={`${styles.live} ${liveConnected ? "" : styles.liveIdle}`}
              aria-hidden="true"
            />
            <span className={styles.chipLabel}>{liveConnected ? "LIVE" : "OFFLINE"}</span>
            <span className={styles.mono}>{liveConnected ? "SSE" : "polling"}</span>
          </span>
          <span className={`${styles.chip} ${styles.chipBlue}`}>
            <span className={styles.chipLabel}>Time range</span>
            <span className={styles.mono}>{timeRangeMinutes} phút</span>
          </span>
          <span className={`${styles.chip} ${styles.chipRed}`}>
            <span
              className={`${styles.live} ${lastUpdated ? "" : styles.liveIdle}`}
              aria-hidden="true"
            />
            <span className={styles.chipLabel}>Auto refresh</span>
            <span className={styles.mono}>{refreshSeconds}s</span>
          </span>
          <span className={`${styles.chip} ${styles.chipPlain}`}>
            <span className={styles.chipLabel}>Cập nhật</span>
            <span className={styles.mono}>{fmtClockSeconds(lastUpdated)}</span>
            <span className={styles.chipLabel}>· làm mới sau</span>
            <span className={styles.mono}>{secondsToRefresh}s</span>
          </span>
        </div>
      </div>

      <div className={styles.windowBar}>
        <span className={styles.windowItem}>
          Cửa sổ dữ liệu ({timeRangeMinutes} phút, giờ địa phương):
          <strong>{fmtDateTime(win.from)}</strong>
          <span className={styles.arrow}>→</span>
          <strong>{fmtDateTime(win.to)}</strong>
        </span>
        <span className={styles.windowItem}>
          Nguồn: <code>{src?.logPath ?? "data/logs.jsonl"}</code>
        </span>
        <span className={styles.windowItem}>
          Contract: <code>{src?.configPath ?? "config/dashboard.yaml"}</code>
        </span>
        {src ? (
          <span className={styles.windowItem}>
            Log: <strong>{fmtInt(src.inWindow)}</strong> trong cửa sổ /{" "}
            <strong>{fmtInt(src.parsed)}</strong> hợp lệ
            {src.skipped > 0 ? ` · ${fmtInt(src.skipped)} dòng hỏng bị bỏ qua` : ""}
          </span>
        ) : null}
      </div>
    </header>
  );
}
