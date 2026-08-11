"use client";

import { fmtClockSeconds } from "@/lib/format";
import type { LiveEvent } from "@/lib/types";

import styles from "./LiveFeed.module.css";

const EVENT_STYLE: Record<string, string> = {
  request_received: styles.evReceived,
  response_sent: styles.evSent,
  request_failed: styles.evFailed,
};

const EVENT_LABEL: Record<string, string> = {
  request_received: "nhận",
  response_sent: "trả lời",
  request_failed: "lỗi",
};

/**
 * Đuôi log trực tiếp. Khi demo, chạy `python scripts/load_test.py` là thấy
 * từng dòng chảy vào đây — bằng chứng trực quan nhất rằng dashboard đang đọc
 * log thật chứ không phải dữ liệu dựng sẵn.
 */
export default function LiveFeed({
  events,
  connected,
  eventsPerMinute,
}: {
  events: LiveEvent[];
  connected: boolean;
  eventsPerMinute: number;
}) {
  return (
    <section className={styles.wrap} aria-label="Log trực tiếp">
      <div className={styles.head}>
        <h2 className={styles.title}>
          <span
            className={`${styles.dot} ${connected ? styles.dotLive : styles.dotIdle}`}
            aria-hidden="true"
          />
          Log đang chảy vào
        </h2>
        <span className={styles.meta}>
          {connected ? (
            <>
              đang nghe <code>data/logs.jsonl</code> · đẩy ngay khi file đổi
            </>
          ) : (
            <>mất kết nối trực tiếp — đang dùng polling 30s</>
          )}
        </span>
        <span className={styles.rate}>
          {eventsPerMinute > 0 ? `${eventsPerMinute} dòng/phút` : "im ắng"}
        </span>
      </div>

      {events.length === 0 ? (
        <p className={styles.empty}>
          Chưa có dòng nào. Chạy <code>python scripts/load_test.py --concurrency 5</code> để
          thấy log chảy vào đây theo thời gian thực.
        </p>
      ) : (
        <ol className={styles.list}>
          {events.map((event, index) => (
            <li
              key={`${event.ts}-${event.correlationId ?? index}-${index}`}
              className={`${styles.row} ${index === 0 ? styles.rowNew : ""}`}
            >
              <span className={styles.time}>{fmtClockSeconds(new Date(event.ts))}</span>
              <span className={`${styles.badge} ${EVENT_STYLE[event.event] ?? ""}`}>
                {EVENT_LABEL[event.event] ?? event.event}
              </span>
              <code className={styles.cid}>{event.correlationId ?? "—"}</code>
              <span className={styles.feature}>{event.feature ?? ""}</span>
              <span className={styles.detail}>
                {event.errorType ? (
                  <strong className={styles.err}>{event.errorType}</strong>
                ) : event.latencyMs !== null ? (
                  <>
                    <strong>{event.latencyMs.toLocaleString("vi-VN")}</strong> ms
                    {event.costUsd !== null ? (
                      <span className={styles.cost}> · ${event.costUsd.toFixed(6)}</span>
                    ) : null}
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
