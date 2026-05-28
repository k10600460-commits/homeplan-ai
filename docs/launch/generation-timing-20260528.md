# Generation Timing Benchmark — 20260528

**Model:** claude-sonnet-4-6  |  **N:** 10 (10 succeeded)  |  **Date:** 2026-05-28T15:08:28.735Z

## Individual Results

| # | Status | Time (s) | Output tokens | Cache read | Label |
|---|--------|----------|---------------|------------|-------|
| 1 | OK | 27.10 | 1788 | 0 | Raleigh NC — avg lot, mid budget, family 4 |
| 2 | OK | 31.79 | 2016 | 0 | Raleigh NC — large lot, upper budget, family 5 |
| 3 | OK | 28.27 | 1746 | 0 | Charlotte NC — small lot, low budget, couple |
| 4 | OK | 29.55 | 1983 | 0 | Dallas TX — xl lot, high budget, family 6 |
| 5 | OK | 27.30 | 1817 | 0 | Phoenix AZ — avg lot, mid budget, family 3 |
| 6 | OK | 31.50 | 2010 | 0 | Austin TX — small-mid lot, premium budget, family 4 |
| 7 | OK | 39.18 | 2467 | 0 | Nashville TN — large lot, upper budget, family 5 |
| 8 | OK | 29.18 | 1566 | 0 | Columbus OH — small lot, budget entry, couple |
| 9 | OK | 30.58 | 1959 | 0 | Atlanta GA — avg lot, mid budget, family 4 |
| 10 | OK | 38.65 | 2462 | 0 | Denver CO — xl lot, luxury budget, large family |

## Statistics

| Metric | Value |
|--------|-------|
| Min    | 27.10s |
| Median | 30.07s |
| Mean   | 31.31s |
| P75    | 31.71s |
| P95    | 38.94s |
| Max    | 39.18s |

## Suggested Marketing Copy

- Conservative (covers p95): **"3 proposals in under 39 seconds"**
- Precise (min–median):       **"typically 28–31 seconds"**
- Hero tagline option:         **"3 floor plans in about 31 seconds"**

## Notes

- Times measured from `client.messages.create()` call start to response received (SDK round-trip including Anthropic API network latency).
- System prompt uses `cache_control: ephemeral` — cache_read_tokens > 0 indicates prompt cache hit.
- Run sequentially with 500ms gaps to avoid API burst interference.
- Does NOT include Next.js HTTP overhead, auth checks, or DB calls (~50–200ms additional in production).