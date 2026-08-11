"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Derivation from "@/components/Derivation";
import Header from "@/components/Header";
import LiveFeed from "@/components/LiveFeed";
import Panel from "@/components/panels";
import Pipeline from "@/components/Pipeline";
import type { LiveEvent, MetricsResponse } from "@/lib/types";

import styles from "./page.module.css";

const DEFAULT_REFRESH_SECONDS = 30;
const DEFAULT_TIME_RANGE_MINUTES = 60;
/** Mỗi chặng pipeline sáng bao lâu khi chạy chế độ demo. */
const DEMO_STEP_MS = 2200;
/** Số dòng giữ lại trong live feed. */
const FEED_LIMIT = 40;
/** Cửa sổ tính "dòng/phút" cho live feed. */
const RATE_WINDOW_MS = 60_000;

export default function DashboardPage() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [stageIndex, setStageIndex] = useState<number | null>(null);
  const [openPanelId, setOpenPanelId] = useState<string | null>(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [feed, setFeed] = useState<LiveEvent[]>([]);
  const seenKeys = useRef<Set<string>>(new Set());

  const refreshSeconds = data?.dashboard.refreshSeconds ?? DEFAULT_REFRESH_SECONDS;
  const timeRangeMinutes = data?.dashboard.timeRangeMinutes ?? DEFAULT_TIME_RANGE_MINUTES;

  // Gộp payload mới vào state, đồng thời nối các dòng log mới vào live feed.
  const applyPayload = useCallback((payload: MetricsResponse) => {
    setData(payload);
    setFetchError(null);
    setLastUpdatedMs(Date.now());
    setLoaded(true);

    const incoming = payload.liveEvents ?? [];
    if (incoming.length === 0) return;

    // Dedup PHẢI làm ngoài updater: React StrictMode gọi updater hai lần, nếu
    // mutate Set bên trong thì lượt thứ hai sẽ lọc sạch và feed luôn rỗng.
    const key = (event: LiveEvent) =>
      `${event.ts}|${event.event}|${event.correlationId ?? ""}`;
    const fresh = incoming.filter((event) => !seenKeys.current.has(key(event)));
    if (fresh.length === 0) return;
    for (const event of fresh) seenKeys.current.add(key(event));

    // Mới nhất lên đầu; updater thuần nên gọi lại bao nhiêu lần cũng ra một kết quả.
    const ordered = [...fresh].reverse();
    setFeed((prev) => {
      const next = [...ordered, ...prev].slice(0, FEED_LIMIT);
      if (seenKeys.current.size > FEED_LIMIT * 20) {
        seenKeys.current = new Set(next.map(key));
      }
      return next;
    });
  }, []);

  // Đường trực tiếp: SSE đẩy ngay khi data/logs.jsonl đổi.
  // EventSource tự reconnect nên không cần vòng retry thủ công.
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const source = new EventSource("/api/stream");

    source.addEventListener("metrics", (event) => {
      try {
        applyPayload(JSON.parse((event as MessageEvent).data) as MetricsResponse);
        setLiveConnected(true);
      } catch {
        /* frame hỏng thì bỏ qua, polling vẫn giữ dashboard đúng */
      }
    });
    source.addEventListener("ping", () => setLiveConnected(true));
    source.onopen = () => setLiveConnected(true);
    source.onerror = () => setLiveConnected(false);

    return () => {
      source.close();
      setLiveConnected(false);
    };
  }, [applyPayload]);

  // Đường bảo đảm: polling theo `dashboard.refresh_seconds` của contract.
  // Vẫn chạy song song với SSE để dashboard đúng kể cả khi stream chết.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/metrics", { cache: "no-store" });
        const payload = (await res.json()) as MetricsResponse;
        if (cancelled) return;
        applyPayload(payload);
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
  }, [refreshSeconds, applyPayload]);

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
  const stages = data?.pipeline?.stages ?? [];
  // Nhịp log thật trong 60 giây gần nhất, tính theo ts của chính log.
  const eventsPerMinute = feed.filter(
    (event) => nowMs - Date.parse(event.ts) < RATE_WINDOW_MS,
  ).length;
  const openPanel = panels.find((p) => p.id === openPanelId) ?? null;
  const openDerivation =
    data?.pipeline?.derivations.find((d) => d.panelId === openPanelId) ?? null;

  // Chế độ demo: chạy tuần tự qua từng chặng pipeline rồi tự dừng ở chặng cuối.
  useEffect(() => {
    if (!demoRunning || stages.length === 0) return;
    const id = setInterval(() => {
      setStageIndex((prev) => {
        const next = prev === null ? 0 : prev + 1;
        if (next >= stages.length) {
          setDemoRunning(false);
          return stages.length - 1;
        }
        return next;
      });
    }, DEMO_STEP_MS);
    return () => clearInterval(id);
  }, [demoRunning, stages.length]);

  const startDemo = useCallback(() => {
    setOpenPanelId(null);
    setStageIndex(0);
    setDemoRunning(true);
  }, []);

  const stopDemo = useCallback(() => {
    setDemoRunning(false);
    setStageIndex(null);
  }, []);

  const selectStage = useCallback((index: number | null) => {
    setDemoRunning(false);
    setStageIndex(index);
  }, []);

  const togglePanel = useCallback((id: string) => {
    setDemoRunning(false);
    setOpenPanelId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className={styles.page}>
      <Header
        data={data}
        lastUpdated={lastUpdatedMs === null ? null : new Date(lastUpdatedMs)}
        secondsToRefresh={secondsToRefresh}
        timeRangeMinutes={timeRangeMinutes}
        refreshSeconds={refreshSeconds}
        liveConnected={liveConnected}
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
              <button
                type="button"
                className={`${styles.demoButton} ${demoRunning ? styles.demoStop : ""}`}
                onClick={demoRunning ? stopDemo : startDemo}
              >
                {demoRunning ? "■ Dừng demo" : "▶ Chạy demo pipeline"}
              </button>
            </div>

            <LiveFeed
              events={feed}
              connected={liveConnected}
              eventsPerMinute={eventsPerMinute}
            />

            {stages.length > 0 ? (
              <Pipeline
                stages={stages}
                activeIndex={stageIndex}
                onSelect={selectStage}
                demoRunning={demoRunning}
              />
            ) : null}

            {openPanel && openDerivation ? (
              <Derivation
                panel={openPanel}
                derivation={openDerivation}
                onClose={() => setOpenPanelId(null)}
              />
            ) : null}

            <div className={styles.grid}>
              {panels.map((p) => (
                <div key={p.id} className={styles.panelSlot}>
                  <Panel panel={p} />
                  <button
                    type="button"
                    className={`${styles.explain} ${
                      openPanelId === p.id ? styles.explainOpen : ""
                    }`}
                    onClick={() => togglePanel(p.id)}
                    aria-expanded={openPanelId === p.id}
                  >
                    {openPanelId === p.id ? "Đang xem cách đo ▲" : "Đo như thế nào? ▼"}
                  </button>
                </div>
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
