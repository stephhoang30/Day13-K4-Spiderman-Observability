import { buildMetricsPayload } from "@/lib/payload";

// Luôn đọc lại logs.jsonl trên từng request — dashboard phải phản ánh file
// hiện tại, không phải bản snapshot lúc build.
export const dynamic = "force-dynamic";

/**
 * Đường polling theo đúng `dashboard.refresh_seconds` của contract.
 * Đây là đường bảo đảm: dashboard vẫn đúng kể cả khi SSE không dùng được.
 */
export async function GET() {
  const { body } = await buildMetricsPayload();
  return Response.json(body, { status: body.status === "error" ? 500 : 200 });
}
