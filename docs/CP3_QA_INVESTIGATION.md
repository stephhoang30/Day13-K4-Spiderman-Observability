# CP3 — QA & Chief Investigator runbook

## Phần đã sẵn sàng

- `agent.run` là trace orchestration (`chain`).
- `rag.retrieve` là child tool span; nó sẽ thể hiện khoảng 2.5 giây khi incident `rag_slow` được bật.
- `llm.generate` là child generation. Input, output và retrieved documents không được capture để tránh ghi nội dung người dùng vào trace.

## Chạy challenge

1. Chạy API: `uvicorn app.main:app --reload --env-file .env`.
2. Kiểm tra `GET /health` trả `ok: true` và `tracing_enabled: true`. Nếu là `false`, vẫn chạy được load test nhưng chưa có evidence Langfuse.
3. Bật incident chính thức: `python scripts/inject_incident.py`.
4. Chạy tải: `python scripts/load_test.py --challenge --concurrency 5`.
5. Mở `/metrics`, sau đó mở một trace trong Langfuse thuộc feature `monitoring`.

## Kết luận cần chứng minh

Challenge `day13-k4-observability-v1` dùng incident `rag_slow` và ngưỡng `2000 ms`.

1. **Metrics:** p95 latency vượt 2000 ms khi chạy cohort challenge.
2. **Trace:** waterfall có `rag.retrieve` là span chậm (~2500 ms), lớn hơn `llm.generate` (~150 ms).
3. **Logs:** tìm `response_sent`/`request_received` cùng correlation ID của trace để xác nhận request feature `monitoring`.
4. **Root cause:** mock RAG cố ý sleep 2.5 giây khi cờ `rag_slow` bật; không phải LLM chậm.
5. **Fix:** đặt timeout/retry có giới hạn cho retrieval, cache kết quả phù hợp và fallback khi retrieval quá thời hạn.
6. **Preventive measure:** alert cho RAG span p95 và dashboard tách latency RAG/LLM; chạy synthetic probe cho feature `monitoring`.

## Evidence cần lưu

Lưu vào `submission/evidence/` và điền đường dẫn, trace ID, correlation ID thật vào mục 6 của `submission/REPORT.md`:

- Screenshot `/metrics` sau load test.
- Screenshot trace waterfall có `rag.retrieve` và `llm.generate`.
- Một log JSON cùng correlation ID.
- Screenshot/dòng output load test và commit chứa phần trace QA.

Không ghi trace ID, correlation ID hoặc kết quả đo bịa vào report trước khi chạy challenge.
