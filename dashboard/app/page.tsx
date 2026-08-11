"use client";

import { useEffect, useState } from "react";

import Header from "@/components/Header";
import Panel from "@/components/panels";
import type { MetricsResponse } from "@/lib/types";

import styles from "./page.module.css";

const DEFAULT_REFRESH_SECONDS = 30;
const DEFAULT_TIME_RANGE_MINUTES = 60;

export default function DashboardPage() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(0);

  const refreshSeconds = data?.dashboard.refreshSeconds ?? DEFAULT_REFRESH_SECONDS;
  const timeRangeMinutes = data?.dashboard.timeRangeMinutes ?? DEFAULT_TIME_RANGE_MINUTES;

  // Auto refresh theo `dashboard.refresh_seconds` của config/dashboard.yaml.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/metrics", { cache: "no-store" });
        const payload = (await res.json()) as MetricsResponse;
        if (cancelled) return;
        setData(payload);
        setFetchError(null);
      } catch (err) {
        if (cancelled) return;
        setFetchError(
          `Không gọi được /api/metrics: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        if (!cancelled) {
          setLoaded(true);
          setLastUpdatedMs(Date.now());
        }
      }
    };

    const first = setTimeout(load, 0);
    const timer = setInterval(load, refreshSeconds * 1000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refreshSeconds]);

  // Nhịp 1 giây chỉ để hiển thị đếm ngược tới lần refresh kế tiếp.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsToRefresh =
    lastUpdatedMs === null
      ? refreshSeconds
      : Math.max(
          0,
          refreshSeconds - Math.floor(Math.max(0, nowMs - lastUpdatedMs) / 1000),
        );

  const panels = data?.panels ?? [];
  const passCount = panels.filter((p) => p.pass).length;

  return (
    <div className={styles.page}>
      <Header
        data={data}
        lastUpdated={lastUpdatedMs === null ? null : new Date(lastUpdatedMs)}
        secondsToRefresh={secondsToRefresh}
        timeRangeMinutes={timeRangeMinutes}
        refreshSeconds={refreshSeconds}
      />

      <main className={styles.main}>
        {fetchError ? <div className={styles.errorBanner}>{fetchError}</div> : null}

        {!loaded && data === null ? (
          <div className={styles.state}>
            <span className={styles.spinner} aria-hidden="true" />
            <p className={styles.stateTitle}>Đang đọc data/logs.jsonl…</p>
          </div>
        ) : null}

        {data?.status === "error" ? (
          <div className={`${styles.state} ${styles.stateError}`}>
            <p className={styles.stateTitle}>Không đọc được dashboard contract</p>
            <p className={styles.stateBody}>{data.message}</p>
            <code className={styles.stateCode}>{data.source.configPath}</code>
          </div>
        ) : null}

        {data?.status === "no-data" ? (
          <div className={styles.state}>
            <p className={styles.stateTitle}>
              Chưa có dữ liệu — hãy chạy <code>python scripts/load_test.py</code>
            </p>
            <p className={styles.stateBody}>
              Dashboard đang trỏ tới <code>{data.source.logPath}</code>. Khởi động API
              rồi chạy load test để sinh log; trang này tự làm mới sau mỗi{" "}
              {refreshSeconds} giây.
            </p>
            <code className={styles.stateCode}>
              {"uvicorn app.main:app --reload\npython scripts/load_test.py --concurrency 5"}
            </code>
          </div>
        ) : null}

        {data?.status === "ok" ? (
          <>
            <div className={styles.summary}>
              <span className={styles.summaryLabel}>SLO status</span>
              {panels.map((p) => (
                <span
                  key={p.id}
                  className={`${styles.summaryChip} ${
                    p.pass ? styles.chipPass : styles.chipBreach
                  }`}
                >
                  <span className={styles.summaryDot} />
                  {p.id} · {p.pass ? "PASS" : "BREACH"}
                </span>
              ))}
              <span className={styles.summaryTotal}>
                {passCount}/{panels.length} panel đạt threshold
              </span>
            </div>

            <div className={styles.grid}>
              {panels.map((p) => (
                <Panel key={p.id} panel={p} />
              ))}
            </div>
          </>
        ) : null}
      </main>

      <footer className={styles.footer}>
        <span>
          Nguồn dữ liệu: <code>data/logs.jsonl</code> đọc server-side qua{" "}
          <code>/api/metrics</code>
        </span>
        <span>
          Contract 6 panel: <code>config/dashboard.yaml</code>
        </span>
        <span>
          Cửa sổ {timeRangeMinutes} phút neo vào log mới nhất · auto refresh{" "}
          {refreshSeconds}s
        </span>
      </footer>
    </div>
  );
}
