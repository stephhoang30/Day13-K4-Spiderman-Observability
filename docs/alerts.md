# Alert Runbook

Các alert dưới đây dựa trên triệu chứng người dùng hoặc SLO, không phụ thuộc vào tên implementation nội bộ.

## Alert 1 — High latency P95

- **Tên:** `high_latency_p95`
- **Severity:** `warning`
- **SLI/SLO liên quan:** `latency_p95_ms`; P95 latency phải dưới `3000 ms` với target `99.5%`.
- **Điều kiện kích hoạt:** `latency_p95 > 3000ms for 5 minutes`.
- **Ảnh hưởng tới người dùng:** Người dùng phải chờ lâu khi gửi câu hỏi; request có thể bị timeout hoặc trải nghiệm chat bị gián đoạn.
- **Ba bước kiểm tra đầu tiên:**
  1. Xác nhận alert trên dashboard: kiểm tra P95 có thực sự vượt `3000 ms` trong 5 phút và xem traffic có tăng đột biến không.
  2. Mở một số trace chậm trong cùng khoảng thời gian; xác định span nào chiếm nhiều thời gian nhất (RAG, model hoặc tool).
  3. Đối chiếu logs theo `correlation_id` của trace chậm để tìm timeout, retry, lỗi upstream hoặc incident đang được bật.
- **Mitigation tạm thời:** Giảm concurrency/load test, tắt scenario gây chậm nếu đang practice incident, giảm số lượng tài liệu RAG hoặc chuyển sang model/tool nhanh hơn nếu có fallback.
- **Owner:** `on-call-engineer`

## Alert 2 — Elevated error rate

- **Tên:** `elevated_error_rate`
- **Severity:** `critical`
- **SLI/SLO liên quan:** `error_rate_pct`; error rate phải dưới `2%` với target `99.0%`.
- **Điều kiện kích hoạt:** `error_rate_pct > 2 for 3 minutes`.
- **Ảnh hưởng tới người dùng:** Nhiều request thất bại, người dùng không nhận được câu trả lời hoặc phải thử lại nhiều lần.
- **Ba bước kiểm tra đầu tiên:**
  1. Xác nhận tỷ lệ lỗi và số request bị ảnh hưởng trên dashboard; kiểm tra alert có phải do traffic tăng hoặc dữ liệu thiếu không.
  2. Lấy các request lỗi gần nhất và lần theo `correlation_id` từ logs tới trace để xác định lỗi xảy ra ở bước nào.
  3. Kiểm tra error type, HTTP status, timeout/retry và tình trạng các dependency như model, RAG hoặc tool; đối chiếu với thời điểm deploy/config change.
- **Mitigation tạm thời:** Rollback thay đổi gần nhất nếu có, bật fallback model/tool, giảm traffic hoặc tạm dừng chức năng đang lỗi; tiếp tục theo dõi error rate sau mitigation.
- **Owner:** `on-call-engineer`

## Alert 3 — Cost budget exceeded

- **Tên:** `cost_budget_exceeded`
- **Severity:** `warning`
- **SLI/SLO liên quan:** `daily_cost_usd`; chi phí mục tiêu không vượt quá `$2.5/ngày`, target `100%`.
- **Điều kiện kích hoạt:** `daily_cost_usd > 2.5`.
- **Ảnh hưởng tới người dùng:** Không nhất thiết gây lỗi ngay, nhưng có thể dẫn tới throttling, giới hạn request hoặc phải giảm chất lượng dịch vụ để kiểm soát chi phí.
- **Ba bước kiểm tra đầu tiên:**
  1. Xác nhận daily cost đã vượt `$2.5` và kiểm tra tốc độ tăng chi phí theo thời gian trên dashboard.
  2. Phân tích token usage, số request, model và feature để tìm nguồn tạo chi phí bất thường.
  3. Đối chiếu các request/trace có token hoặc latency cao với `user_id_hash`, `session_id` và `correlation_id`; kiểm tra load test hoặc incident practice có đang chạy không.
- **Mitigation tạm thời:** Giới hạn rate/concurrency, giảm token budget hoặc chuyển sang model rẻ hơn, tạm dừng load test và bật budget guard để ngăn chi phí tiếp tục tăng.
- **Owner:** `team-lead`
