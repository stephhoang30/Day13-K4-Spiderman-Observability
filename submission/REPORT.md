# Báo cáo Day 13 Observability

## 1. Thông tin nhóm

- Tên nhóm:
- Repository URL:
- Commit SHA cuối:
- Thành viên và vai trò:

## 2. Kết quả kỹ thuật

- Điểm `validate_logs.py`:
- Tổng số traces:
- Số PII leak còn lại:
- Link/đường dẫn dashboard:

## 3. Logging và tracing

- Evidence correlation ID:
- Evidence PII redaction:
- Evidence trace waterfall:
- Giải thích một span đáng chú ý:

## 4. Prompt versioning

- Prompt name:
- Version/label baseline:
- Version/label candidate:
- Trace ID của mỗi version:
- Bằng chứng đổi label hoặc rollback:

## 5. Dashboard, SLO và alerts

- Kết quả `validate_dashboard.py`:
- Evidence dashboard:
- SLO đã chọn và lý do:
- Alert rules và runbook:

## 6. Điều tra challenge

- Challenge ID: `day13-k4-observability-v1`
- Triệu chứng từ metrics: sau load test Challenge (5/5 HTTP 200), latency p95 là 3652 ms, vượt ngưỡng chính thức 2000 ms.
- Trace ID liên quan: `c1c7e2ca4b0fec3660b8de79c224c155` (session `k4-challenge-s02`). Waterfall: `agent.run` 3548 ms, `rag.retrieve` 2500 ms, `llm.generate` 153 ms.
- Log line/correlation ID liên quan: `response_sent`, correlation ID `req-c363f4c9`, feature `monitoring`, latency 3546 ms.
- Root cause: incident `rag_slow` tạo delay 2.5 giây trong retrieval; RAG là span chiếm thời gian chính, không phải LLM.
- Fix action: thêm timeout/retry có giới hạn cho retrieval, cache kết quả phù hợp và fallback an toàn khi quá ngân sách thời gian.
- Preventive measure: alert p95 cho RAG span và synthetic probe cho feature `monitoring`.
- Evidence: [`evidence/cp3-challenge-evidence.md`](evidence/cp3-challenge-evidence.md). Cần bổ sung screenshot metric, waterfall và log vào cùng thư mục trước khi nộp.

## 7. Đóng góp cá nhân

Với mỗi thành viên, ghi rõ nhiệm vụ và link commit/PR tương ứng.

| Thành viên | Phần việc | Commit/PR | Điều đã học |
|---|---|---|---|
| | | | |
