# Dashboard Day 13 — Nhóm Spiderman K4

Dashboard 6 panel cho bài lab observability. Đọc trực tiếp `data/logs.jsonl` ở repo root và lấy contract từ `config/dashboard.yaml`.

Phần việc của **Thành viên C — Metrics & Dashboard**.

## Chạy

```bash
cd dashboard
npm install
npm run dev
```

Mở http://localhost:3102.

> Port mặc định là **3102**, không phải 3000/3100 — trên máy demo hai port đó đang bị project khác chiếm. Đổi port bằng `npx next dev -p <port>`.

API lab (`uvicorn app.main:app`) **không cần** chạy cùng lúc: dashboard đọc file log, không gọi API. Nhưng phải có `data/logs.jsonl`, nếu chưa có thì chạy:

```bash
uvicorn app.main:app --reload --env-file .env
python scripts/load_test.py --concurrency 5
```

## Nguồn dữ liệu

| Thứ | Đường dẫn | Ghi chú |
|---|---|---|
| Log | `data/logs.jsonl` | đọc server-side trong `app/api/metrics/route.ts`, không cache |
| Contract | `config/dashboard.yaml` | title, unit, threshold, time range, refresh — **không hard-code trong UI** |

Cửa sổ thời gian 60 phút được neo vào **log mới nhất trong file**, không phải `Date.now()`, vì dữ liệu lab sinh theo từng đợt load test — lấy mốc "bây giờ" sẽ bỏ sót cả đợt chạy trước.

Dòng JSON hỏng bị bỏ qua và đếm riêng (hiện ở thanh header) thay vì làm sập trang.

## Mapping 6 panel

| Panel | Event | Field | Phép tổng hợp | Đơn vị | Threshold |
|---|---|---|---|---|---|
| `latency` | `response_sent` | `latency_ms` | P50 / P95 / P99 | ms | p95 ≤ 3000 |
| `traffic` | `request_received` | — | count, rate/phút | requests_per_minute | rate ≥ 1 |
| `errors` | `request_received`, `request_failed` | `error_type` | error_rate_pct + breakdown | percent | ≤ 2 |
| `cost` | `response_sent` | `cost_usd` | sum theo phút + tổng | usd | total ≤ 2.5 |
| `tokens` | `response_sent` | `tokens_in`, `tokens_out` | sum theo từng field | tokens | ≤ 50000 |
| `quality` | `response_sent` | `quality_score` | mean | score_0_to_1 | mean ≥ 0.75 |

Percentile dùng nearest-rank với đúng công thức index của `app/metrics.py` (kể cả banker's rounding của Python) để số trên dashboard khớp `/metrics`.

## Lớp giải thích dùng khi demo

Ngoài 6 panel, trang có thêm hai thứ để trình bày trước lớp:

**Sơ đồ pipeline** — 8 chặng từ request tới verdict, mỗi chặng hiện số thật đang chảy qua:

```
POST /chat → gán correlation ID → agent xử lý → scrub PII + render JSON
  → ghi data/logs.jsonl → cắt cửa sổ 60 phút → tổng hợp 6 panel → so threshold
```

Bấm một chặng để xem nó làm gì và thành phần nào trong repo chịu trách nhiệm. Nút **"▶ Chạy demo pipeline"** tự chạy lần lượt qua 8 chặng (2.2 giây mỗi chặng) rồi dừng — dùng khi thuyết trình để không phải bấm tay.

**"Đo như thế nào?"** dưới mỗi panel — mở ra từng bước tính ra con số của panel đó, với số thật ở mỗi bước: nguồn → cửa sổ → lọc event → lấy field → công thức → so ngưỡng. Kèm 1–2 **dòng log thật** đã được lọc ra, tô đậm đúng field panel đang dùng, và một ghi chú "Khi bị hỏi" cho phần bảo vệ.

## Đối chiếu số liệu

Số trên dashboard phải khớp với hai nguồn độc lập:

```bash
curl -s http://127.0.0.1:8000/metrics        # counter in-memory trong process API
python scripts/dashboard_metrics.py          # tính lại từ chính file log
```

Lệch nhau nghĩa là có bug thật, không phải sai số hiển thị.

## Cấu trúc

```text
app/api/metrics/route.ts   đọc log + contract, trả JSON cho client
app/page.tsx               bố cục, auto refresh, demo mode
components/Pipeline.tsx    sơ đồ 8 chặng
components/Derivation.tsx  bảng "đo như thế nào" + log thật
components/panels.tsx      6 panel
components/charts.tsx      chart SVG tự vẽ (không dùng thư viện ngoài)
lib/contract.ts            đọc dashboard.yaml + logs.jsonl
lib/metrics.ts             phép tổng hợp của 6 panel
lib/pipeline.ts            dựng các bước giải thích
```

Không dùng thư viện chart ngoài, không CDN, không font ngoài — chart vẽ bằng SVG thuần. Giao diện chỉ có light mode, màu bám thương hiệu VinUni (đỏ `#c72127`, xanh `#134d8b`).
