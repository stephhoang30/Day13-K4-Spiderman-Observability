# CP3 challenge evidence

## Run

- Challenge ID: `day13-k4-observability-v1`
- Incident: `rag_slow`
- Command: `python scripts/load_test.py --challenge --concurrency 5`
- Result: 5/5 requests returned HTTP 200.

## Metrics

- Latency p50: 3590 ms
- Latency p95: 3652 ms
- Latency p99: 3652 ms
- Official threshold: 2000 ms

The p95 latency exceeded the official threshold by 1652 ms.

## Metrics → trace → log proof

| Layer | Evidence |
| --- | --- |
| Metric | `latency_p95=3652 ms` after the challenge load test. |
| Trace | Trace ID `c1c7e2ca4b0fec3660b8de79c224c155`, session `k4-challenge-s02`. |
| Trace waterfall | `agent.run`: 3548 ms; `rag.retrieve`: 2500 ms; `llm.generate`: 153 ms. |
| Log | `correlation_id=req-c363f4c9`, `feature=monitoring`, `response_sent.latency_ms=3546`. |

## Investigation conclusion

`rag.retrieve` is the dominant span and exceeds the 2000 ms threshold by itself. The
official `rag_slow` incident enables the 2.5-second delay in `app/mock_rag.py`; the
LLM generation is only 153 ms. Therefore the root cause is slow retrieval, not LLM
generation.

## Follow-up

- Fix: apply a bounded timeout/retry policy to retrieval, cache suitable retrieval
  results, and return a safe fallback when retrieval exceeds its budget.
- Prevention: alert on RAG-span p95 latency and add a synthetic probe for feature
  `monitoring`.
- Remaining prompt-version evidence: the configured Langfuse project still does not
  contain `day13-chat:production`, so the application records prompt fallback until
  that shared prompt is created or the local `.env` is pointed at the shared project.
