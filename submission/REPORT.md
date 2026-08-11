# Báo cáo Day 13 Observability

## 1. Thông tin nhóm

- Tên nhóm: **Spiderman** (K4)
- Repository URL: https://github.com/stephhoang30/Day13-K4-Spiderman-Observability
- Commit SHA cuối: `aedfed3cc2fd666d7ae693c973994dec4fdbfe6c` trên `main` (gộp đủ phần việc của cả 5 thành viên).
- Số liệu dashboard và log trong báo cáo được đo tại `d3ce6a5a78616e5bd59a34f7b425a065a03bc938`; các commit sau đó không sinh thêm log nên số liệu vẫn đúng.
- Thành viên và vai trò:

| Mã | Họ tên | MSSV | GitHub | Vai trò | Phạm vi |
|---|---|---|---|---|---|
| A | Nguyễn Quý Dương | 2A202601642 | `Duong-1211` | API & Middleware | CP1 middleware, gán correlation ID, exception handler (mở rộng) |
| B | Hồ Văn Tâm | 2A202601542 | `tomhv4499` | Security Engineer | CP1 PII scrubbing, regex patterns, kiểm chứng log không lộ PII |
| C | Hoàng Công Thành | 2A202601662 | `stephHoang30` | Metrics & Dashboard | CP1/CP2 đo đếm `error_rate_pct`, spec + dashboard 6 nhóm chỉ số |
| D | Nguyễn Hoàng Bảo Minh | 2A202601626 | `minhmap123` | SRE & Alerts Engineer | CP2 SLO, alert rules, alert runbook |
| E | Trần Văn Ngọc | 2A202601512 | `TrNgoc2301` | QA & Chief Investigator | Load test, trace cho sub-component RAG/LLM (mở rộng), dẫn dắt challenge CP3, hoàn thiện báo cáo |

## 2. Kết quả kỹ thuật

| Chỉ số | Giá trị | Bằng chứng |
|---|---|---|
| Điểm `validate_logs.py` | **100/100** | [evidence/validate_logs_final.txt](evidence/validate_logs_final.txt) — 0 record thiếu field, 0 record thiếu enrichment, **61 correlation ID duy nhất**, 0 PII leak |
| Baseline đầu buổi (CP0) | 30/100 | [evidence/validate_logs_baseline.txt](evidence/validate_logs_baseline.txt) — đo trước khi merge phần việc của A và B |
| Tổng số traces | **159** trên Langfuse Cloud | Vượt yêu cầu tối thiểu 10. `tracing_enabled=true` ở `/health`; đếm bằng `client.api.trace.list()` |
| Số PII leak còn lại | **0** | [evidence/pii_redaction.txt](evidence/pii_redaction.txt) |
| `validate_dashboard.py` | `HỢP LỆ: 6/6 panel` | [evidence/validate_dashboard.txt](evidence/validate_dashboard.txt) |
| `python -m pytest -q` | 27 passed | [evidence/validate_dashboard.txt](evidence/validate_dashboard.txt) |
| Dashboard | Next.js trong [`dashboard/`](../dashboard) | [evidence/dashboard.png](evidence/dashboard.png) |

Môi trường: Python 3.11.15, virtualenv `.venv`, đủ `requirements.txt`; Langfuse Cloud (`https://cloud.langfuse.com`), `auth_check() == True`; Node 22 cho dashboard.

> Ghi chú vận hành trên máy demo: port 8000 và 3100 đang bị hai project khác chiếm, nên API lab chạy ở `--port 8010` và dashboard ở `-p 3102`. Dashboard đọc `data/logs.jsonl` nên không phụ thuộc port của API.

## 3. Logging và tracing

> Chủ trì: **A** (middleware, correlation ID) và **B** (PII scrubbing, log enrichment).

- **Evidence correlation ID:** [evidence/correlation_id.txt](evidence/correlation_id.txt). Cùng một `correlation_id` xuất hiện ở cả `request_received` và `response_sent` của một request, đồng thời được trả về ở response header:

  ```text
  correlation_id = req-eda6e648
  x-request-id: req-eda6e648
  x-response-time-ms: 1237.5453329877928
  ```

  Middleware sinh ID dạng `req-<8 hex>`, ưu tiên `x-request-id` do client gửi xuống, và gọi `clear_contextvars()` đầu mỗi request để context không rò rỉ sang request kế tiếp.

- **Evidence PII redaction:** [evidence/pii_redaction.txt](evidence/pii_redaction.txt). Input gốc trong `data/sample_queries.jsonl` có email, số điện thoại và số thẻ; log chỉ còn placeholder:

  ```text
  "message_preview": "What is your refund policy? My email is [REDACTED_EMAIL]"
  "message_preview": "Here is my phone [REDACTED_PHONE_VN], what should be logged?"
  "message_preview": "What is the policy for PII and credit card [REDACTED_CREDIT_CARD]?"
  ```

  `scrub_event` được đăng ký **trước** `JSONRenderer` và `JsonlFileProcessor`, nên dữ liệu được che trước khi JSON được render và ghi xuống file. Bộ pattern hiện có: `email`, `phone_vn`, `cccd`, `credit_card`, `passport`, `address_vn`.

- **Evidence trace waterfall:** commit `a7d39da` của E bọc span riêng cho RAG và LLM, nên trace tách được ba tầng thay vì một khối duy nhất. Ví dụ trace `c1c7e2ca4b0fec3660b8de79c224c155`:

  ```text
  agent.run        3548 ms
  ├─ rag.retrieve  2500 ms   ← 70 % tổng thời gian
  └─ llm.generate   153 ms
  ```

  Ảnh waterfall: [evidence/cp3-rag-waterfall.png](evidence/cp3-rag-waterfall.png).

- **Giải thích một span đáng chú ý:** `rag.retrieve` chiếm 2500/3548 ms (~70 %) trong khi `llm.generate` chỉ 153 ms. Nếu không tách span, cả request chỉ hiện thành một khối 3548 ms và rất dễ kết luận nhầm là "LLM chậm" — đây chính là lý do phải bọc span cho từng sub-component chứ không chỉ đo ở tầng API.

## 4. Prompt versioning

> **Chưa hoàn thiện.** Kiểm tra thực tế trên Langfuse: trace đang ghi `prompt_source=local-fallback`, `prompt_version=local-v1`, nghĩa là SDK đã bật nhưng **prompt `day13-chat` chưa tồn tại trên project**, nên app rơi về template local.

- Prompt name: `day13-chat` (từ `LANGFUSE_PROMPT_NAME`)
- Version/label baseline: *chưa tạo* — cần version 1 gắn label `baseline` + `production`
- Version/label candidate: *chưa tạo* — cần version 2 gắn label `candidate`
- Trace ID của mỗi version: *chưa có*
- Bằng chứng đổi label hoặc rollback: *chưa có*

Theo [docs/PROMPT_VERSIONING.md](../docs/PROMPT_VERSIONING.md): tạo prompt giữ đúng ba biến `{{feature}}`, `{{docs}}`, `{{message}}`, chạy cùng input với hai label, rồi promote/rollback `production`.

## 5. Dashboard, SLO và alerts

### 5.1 Kết quả validator

```text
$ python scripts/validate_dashboard.py
HỢP LỆ: 6/6 panel có trong dashboard contract.
```

### 5.2 Dashboard

Ứng dụng [`dashboard/`](../dashboard) viết bằng Next.js (App Router, TypeScript), giao diện sáng, đọc `data/logs.jsonl` **server-side** qua route `/api/metrics` và lấy threshold/unit/title trực tiếp từ `config/dashboard.yaml` — đổi contract thì dashboard đổi theo, không hard-code.

Ảnh: [evidence/dashboard.png](evidence/dashboard.png) — nhìn được tên panel, đơn vị, time range 60 phút, auto refresh 30 giây, threshold/SLO line và trạng thái PASS/BREACH của từng panel.

Ngoài 6 panel, trang có thêm lớp giải thích dùng khi demo trước lớp — ảnh: [evidence/dashboard-cach-do.png](evidence/dashboard-cach-do.png):

- **Sơ đồ pipeline 8 chặng** từ `POST /chat` → gán correlation ID → agent xử lý → scrub PII + render JSON → ghi `data/logs.jsonl` → cắt cửa sổ 60 phút → tổng hợp 6 panel → so threshold. Mỗi chặng hiện số thật đang chảy qua và trỏ đúng file chịu trách nhiệm, bấm vào xem chặng đó làm gì. Có nút chạy demo tự động qua 8 chặng.
- **"Đo như thế nào?"** dưới mỗi panel: mở ra từng bước tính ra con số (nguồn → cửa sổ → lọc event → lấy field → công thức → so ngưỡng) với số thật ở mỗi bước, kèm 1–2 **dòng log thật** đã tô đậm đúng field panel đang dùng. Ví dụ panel errors: `121 dòng hợp lệ` → `58 request_received` → `6 request_failed` → `6 ÷ 58 × 100 = 10,34 %` → `10,34 ≤ 2` → **BREACH**.

### 5.3 Đo đếm `error_rate_pct` (phần việc của C)

Bổ sung `requests_received()`, `error_rate_pct()` và ba field mới trong `snapshot()` của [`app/metrics.py`](../app/metrics.py), đúng định nghĩa panel `errors`:

```text
error_rate_pct        = count(request_failed) / count(request_received) * 100
count(request_received) = TRAFFIC (thành công) + tổng ERRORS (thất bại)
```

Kiểm chứng chéo bằng **hai đường đo hoàn toàn độc lập** — counter in-memory trong process API, và tính lại từ file log bằng `scripts/dashboard_metrics.py` — cho cùng một kết quả:

| Chỉ số | `/metrics` (in-memory) | `dashboard_metrics.py` (từ `data/logs.jsonl`) | Dashboard |
|---|---:|---:|---:|
| requests_received | 58 | 58 | 58 |
| errors_total | 6 | 6 | 6 |
| **error_rate_pct** | **10.34 %** | **10.34 %** | **10.34 %** |
| latency P50 / P95 / P99 | 1068 / 3653 / 3769 ms | 1068 / 3653 / 3769 ms | 1068 / 3653 / 3769 ms |
| tokens_in / tokens_out | 1707 / 6936 | 1707 / 6936 | 1707 / 6936 |
| total_cost_usd | 0.1092 | 0.109161 | 0.109 |
| quality_avg | 0.8788 | 0.8788 | 0.879 |

### 5.4 Trạng thái 6 panel tại thời điểm chụp

Cửa sổ 60 phút, 121 log record hợp lệ (0 dòng hỏng):

| Panel | Giá trị | Đơn vị | Threshold | Kết quả |
|---|---|---|---|---|
| Latency percentiles | P50 1068 / **P95 3653** / P99 3769 | ms | p95 ≤ 3000 | **BREACH** |
| Request traffic | 58 request, 9.67/phút, 6 phút có traffic | requests_per_minute | rate ≥ 1 | PASS |
| Error rate and breakdown | **10.34 %** (`RuntimeError`: 6) | percent | ≤ 2 | **BREACH** |
| Cost over time | 0.109161 | usd | total ≤ 2.5 | PASS |
| Input and output tokens | in 1707 / out 6936 | tokens | ≤ 50000 | PASS |
| Quality proxy | 0.8788 | score_0_to_1 | mean ≥ 0.75 | PASS |

Hai panel BREACH là **chủ ý**, theo mục "Cách kiểm tra runtime" của [docs/DASHBOARD_SETUP.md](../docs/DASHBOARD_SETUP.md) — mục tiêu là chứng minh panel phản ứng đúng hướng chứ không phải biểu đồ tĩnh:

1. **Baseline** 30 request (3 đợt, concurrency 5) — mọi panel PASS.
2. **Bật `tool_fail`** → 6 request lỗi `RuntimeError` ("Vector store timeout") → panel Errors nhảy từ 0 % lên 10.34 %, breakdown chỉ đúng một loại lỗi.
3. **Bật `rag_slow`** → P95 nhảy từ ~1.1 s lên 3653 ms, vượt hẳn SLO line 3000 ms, trong khi **P50 gần như không đổi (1068 ms)** — đúng chữ ký của tail latency chứ không phải quá tải toàn hệ thống.
4. **Tắt incident**, chạy đợt recovery — Traffic/Cost/Quality trở lại vùng bình thường.

### 5.5 SLO đã chọn và lý do

| SLI | Objective | Target | Vì sao |
|---|---|---|---|
| `latency_p95_ms` | 3000 ms | 99.5 % | Dùng P95 thay vì trung bình: trong đợt `rag_slow`, trung bình bị pha loãng bởi request nhanh, còn P95 phơi bày ngay 3653 ms. |
| `error_rate_pct` | 2 % | 99.0 % | Lỗi 5xx là mất dịch vụ hoàn toàn nên ngưỡng phải chặt hơn ngưỡng latency. |
| `daily_cost_usd` | 2.5 USD | 100 % | Hard budget cho token; cửa sổ 60 phút hiện mới dùng 0.109 USD. |
| `quality_score_avg` | 0.75 | 95 % | Chỉ là proxy heuristic, dùng theo dõi xu hướng, không dùng để page. |

Nguồn: [`config/slo.yaml`](../config/slo.yaml).

### 5.6 Alert rules và runbook

Ba alert symptom-based trong [`config/alert_rules.yaml`](../config/alert_rules.yaml), runbook tương ứng trong [docs/alerts.md](../docs/alerts.md):

| Alert | Severity | Điều kiện | Owner |
|---|---|---|---|
| `high_latency_p95` | warning | `latency_p95 > 3000ms for 5 minutes` | on-call-engineer |
| `elevated_error_rate` | critical | `error_rate_pct > 2 for 3 minutes` | on-call-engineer |
| `cost_budget_exceeded` | warning | `daily_cost_usd > 2.5` | team-lead |

> Ngưỡng alert `elevated_error_rate` đã thống nhất ở **> 2 %**, khớp với SLO và dashboard `error_rate_pct ≤ 2 %`; không còn vùng mù 2–5 %.

## 6. Điều tra challenge

> Chủ trì: **E** (Trần Văn Ngọc) — commit `a7d39da` bọc span RAG/LLM, `625bb6d` hoàn tất điều tra.

- Challenge ID: `day13-k4-observability-v1`
- Thông số chính thức: `incident=rag_slow`, `seed=1304`, `affected_feature=monitoring`, `latency_threshold_ms=2000`, 5 query
- **Triệu chứng từ metrics:** sau load test challenge (5/5 HTTP 200), latency P95 = **3652 ms**, vượt ngưỡng chính thức 2000 ms.
- **Trace ID liên quan:** `c1c7e2ca4b0fec3660b8de79c224c155` (session `k4-challenge-s02`). Waterfall: `agent.run` 3548 ms → `rag.retrieve` **2500 ms** → `llm.generate` 153 ms.
- **Log line/correlation ID liên quan:** `response_sent`, correlation ID `req-c363f4c9`, feature `monitoring`, `latency_ms=3546`.
- **Root cause:** incident `rag_slow` chèn delay 2.5 giây vào bước retrieval trong `app/mock_rag.py`. RAG là span chiếm gần như toàn bộ thời gian, **không phải** LLM — `llm.generate` chỉ 153 ms.
- **Fix action:** đặt timeout + retry có giới hạn cho retrieval, cache kết quả phù hợp, và trả fallback an toàn khi retrieval vượt ngân sách thời gian.
- **Preventive measure:** alert P95 riêng cho span RAG (không chỉ P95 tổng), và synthetic probe cho feature `monitoring`.
- Evidence: [`evidence/cp3-challenge-evidence.md`](evidence/cp3-challenge-evidence.md), [`docs/CP3_QA_INVESTIGATION.md`](../docs/CP3_QA_INVESTIGATION.md), và 4 ảnh do E chụp: [metrics](evidence/cp3-metrics.png) · [waterfall RAG](evidence/cp3-rag-waterfall.png) · [log correlation](evidence/cp3-log-correlation.png) · [load test](evidence/cp3-load-test.png).

**Luồng Metrics → Traces → Logs khớp nhau ở cả ba lớp:**

| Lớp | Bằng chứng | Con số |
|---|---|---|
| Metrics | P95 sau load test challenge | 3652 ms (ngưỡng 2000 ms) |
| Traces | span `rag.retrieve` trong trace `c1c7e2ca…` | 2500 ms / tổng 3548 ms |
| Logs | `response_sent` với `correlation_id=req-c363f4c9` | `latency_ms=3546` |

Ba con số cùng chỉ về một nguyên nhân và lệch nhau chỉ vài ms (phần overhead ngoài span), nên kết luận đứng vững chứ không phải suy đoán từ một lớp.

Lệnh chạy CP3:

```bash
python scripts/inject_incident.py
python scripts/load_test.py --challenge --concurrency 5
```

## 7. Đóng góp cá nhân

| Thành viên | Phần việc | Commit/PR | Điều đã học |
|---|---|---|---|
| A — Nguyễn Quý Dương | `app/middleware.py`: `clear_contextvars()`, sinh correlation ID `req-<8 hex>` (ưu tiên header `x-request-id`), bind vào structlog, trả header `x-request-id` + `x-response-time-ms` | `ed10f83` | |
| B — Hồ Văn Tâm | `app/logging_config.py` (đăng ký `scrub_event` trước JSONRenderer), `app/pii.py` (thêm `passport`, `address_vn`), `app/main.py` (log enrichment `user_id_hash`/`session_id`/`feature`/`model`/`env`) | `7433995`, `76de046`, `d3ce6a5`, `fc34782` | |
| C — Hoàng Công Thành | `requests_received()` / `error_rate_pct()` + 3 field mới trong `snapshot()` ([app/metrics.py](../app/metrics.py)); 4 test mới ([tests/test_metrics.py](../tests/test_metrics.py)); [scripts/dashboard_metrics.py](../scripts/dashboard_metrics.py) tính 6 panel từ log để đối chiếu; dashboard Next.js 6 panel + lớp pipeline giải thích cách đo ([dashboard/](../dashboard)); thu thập evidence dashboard | `41d9fff`, `306afaa`, `85859ef`, `3c789b9` | Trung bình che mất sự cố: khi `rag_slow` bật, P50 chỉ nhích nhẹ (1068 ms) còn P95 vọt lên 3653 ms — chỉ percentile cao mới lộ tail latency. Và một chỉ số chỉ đáng tin khi đo được từ hai nguồn độc lập (counter in-memory và file log) mà vẫn ra cùng kết quả. Ngoài ra, threshold phải nhất quán giữa dashboard, SLO và alert — lệch nhau thì sinh ra vùng mù không ai được báo. |
| D — Nguyễn Hoàng Bảo Minh | `config/slo.yaml` (4 SLI kèm giải thích), `config/alert_rules.yaml` (3 alert symptom-based), `docs/alerts.md` (runbook); **bonus:** cost guard `MAX_OUTPUT_TOKENS`, audit log riêng (`app/audit.py` → `data/audit.jsonl`), anomaly detector (`scripts/detect_anomalies.py`) | `29b0244`, `f5cf5c5` | |
| E — Trần Văn Ngọc | Bọc span RAG/LLM (`app/agent.py`, `app/mock_rag.py`, `app/mock_llm.py`, `tests/test_tracing_adapter.py`); điều tra CP3 và nối Metrics → Traces → Logs; `docs/CP3_QA_INVESTIGATION.md`, `submission/evidence/cp3-challenge-evidence.md` | `a7d39da`, `625bb6d`, `92b7ed4` | |

### Việc còn lại trước khi nộp

1. **Prompt versioning (mục 4) — chưa ai làm.** Tạo prompt `day13-chat` v1/v2 trên Langfuse, chạy hai label, promote rồi rollback `production`, lưu trace ID. Đây là mục trống duy nhất còn lại và đang kéo điểm A1.
2. **Đã thống nhất ngưỡng error rate** giữa alert (`> 2 %`) và SLO/dashboard (`≤ 2 %`).
3. Chụp bổ sung ảnh còn thiếu theo [docs/grading-evidence.md](../docs/grading-evidence.md): danh sách ≥ 10 traces, hai prompt version và thao tác rollback. (Ảnh CP3 và waterfall đã có từ commit `92b7ed4` của E.)
4. Cập nhật commit SHA cuối vào mục 1 sau khi merge xong toàn nhóm.

## 8. Cost optimization, audit log và automation

### Cost optimization

Incident `cost_spike` làm output tokens tăng gấp 4 lần. Đã triển khai cost guard bằng biến môi trường `MAX_OUTPUT_TOKENS=180` để giới hạn completion tokens trước khi tính chi phí.

| Đo lường | Total cost | Output tokens |
|---|---:|---:|
| Before — cap 720 | `$0.0350` | `2296` |
| After — cap 180 | `$0.0140` | `900` |

Kết quả: chi phí giảm khoảng `60%` trên cùng 5 challenge queries khi `cost_spike` được bật.

### Audit log

Các sự kiện enable/disable incident được ghi riêng vào `data/audit.jsonl` thông qua `AUDIT_LOG_PATH`, không trộn với application logs.

### Custom automation

Chạy anomaly detector bằng:

```bash
python scripts/detect_anomalies.py
```

Script phát hiện JSONL không hợp lệ, PII có thể bị rò rỉ, latency vượt SLO và error events.
