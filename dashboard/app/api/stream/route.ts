import { statSync, unwatchFile, watchFile } from "node:fs";

import { findRepoRoot, logPath } from "@/lib/contract";
import { buildMetricsPayload, toLiveEvent } from "@/lib/payload";

export const dynamic = "force-dynamic";

/** Poll mtime/size của file log. 400ms đủ nhanh để demo mà không đốt CPU. */
const WATCH_INTERVAL_MS = 400;
/** Ping giữ kết nối để proxy không cắt khi log im ắng. */
const HEARTBEAT_MS = 15_000;
/** Chặn không cho một burst load test đẩy hàng chục frame liên tiếp. */
const MIN_PUSH_GAP_MS = 250;

/**
 * Server-Sent Events: đẩy payload mới NGAY khi `data/logs.jsonl` đổi, thay vì
 * đợi hết chu kỳ polling 30 giây. Dùng khi demo trực tiếp — chạy load test và
 * nhìn panel nhúc nhích theo thời gian thực.
 *
 * `/api/metrics` vẫn là đường bảo đảm: client tự quay về polling nếu SSE hỏng.
 */
export async function GET(request: Request) {
  const file = logPath(findRepoRoot());
  const encoder = new TextEncoder();

  let closed = false;
  let pushing = false;
  let lastPushMs = 0;
  let pendingPush = false;
  /** ts của record cuối đã gửi, để chỉ gửi phần thật sự mới cho live feed. */
  let lastSeenTs = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      const push = async (reason: string) => {
        if (closed) return;
        if (pushing) {
          pendingPush = true;
          return;
        }
        pushing = true;
        try {
          const { body, records } = await buildMetricsPayload();
          // Chỉ gửi record mới hơn lần đẩy trước; lần đầu thì giữ 12 dòng cuối.
          const fresh = lastSeenTs
            ? records.filter((record) => record.ts > lastSeenTs)
            : records.slice(-12);
          if (records.length > 0) {
            lastSeenTs = records[records.length - 1].ts;
          }
          send("metrics", { ...body, liveEvents: fresh.map(toLiveEvent), reason });
          lastPushMs = Date.now();
        } catch (err) {
          send("stream-error", { message: (err as Error).message });
        } finally {
          pushing = false;
          if (pendingPush && !closed) {
            pendingPush = false;
            void push("coalesced");
          }
        }
      };

      await push("initial");

      // watchFile dùng polling stat nên ổn định trên mọi OS, khác với fs.watch
      // vốn hay bỏ sót sự kiện append trên macOS.
      const onChange = (curr: { mtimeMs: number; size: number }, prev: { mtimeMs: number; size: number }) => {
        if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size) return;
        const since = Date.now() - lastPushMs;
        if (since < MIN_PUSH_GAP_MS) {
          pendingPush = true;
          return;
        }
        void push("file-changed");
      };
      watchFile(file, { interval: WATCH_INTERVAL_MS }, onChange);

      // Nếu file bị xoá rồi tạo lại (sinh lại dữ liệu), watchFile vẫn theo được
      // đường dẫn, nhưng ta kiểm tra thêm để đẩy lại khi file quay lại.
      const heartbeat = setInterval(() => {
        if (closed) return;
        let exists = true;
        try {
          statSync(file);
        } catch {
          exists = false;
        }
        send("ping", { at: new Date().toISOString(), logExists: exists });
        if (pendingPush) {
          pendingPush = false;
          void push("pending");
        }
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unwatchFile(file, onChange);
        try {
          controller.close();
        } catch {
          /* đã đóng rồi */
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tắt buffering của proxy, nếu không SSE sẽ bị giữ lại thành từng cục.
      "X-Accel-Buffering": "no",
    },
  });
}
