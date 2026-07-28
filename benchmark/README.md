# API load test benchmark

A repeatable, browser-free HTTP load test for this app's backend
microservices, without the overhead of the Playwright suite in
[`tests/`](../tests). Everything here talks to the services' HTTP APIs
directly.

## What's here

- **`k6-api-load.js`** — steady-state request latency, throughput, and
  connection-time overhead (TCP/TLS handshake) under load.

## Steady-state latency & throughput (`k6-api-load.js`)

Requires [k6](https://k6.io/docs/get-started/installation/).

```bash
k6 run --out json=results.json benchmark/k6-api-load.js
```

Point it at your services with env vars if they're not on localhost's
default ports (order-service :3000, makeline-service :3001,
product-service :3002):

```bash
k6 run \
  -e PRODUCT_URL=http://localhost:3002 \
  -e ORDER_URL=http://localhost:3000 \
  -e MAKELINE_URL=http://localhost:3001 \
  -e PRODUCT_VUS=10 -e ORDER_VUS=10 -e DURATION=3m \
  -e SLEEP_S=0 -e JITTER_MS=10 \
  benchmark/k6-api-load.js
```

On Kubernetes, `kubectl port-forward` each service to a local port first,
or run k6 from inside the cluster (e.g. as a Job) and use the Kubernetes
Service DNS names instead.

The script runs two scenarios in parallel:

- `product_reads` — read-only GETs against product-service. Low
  concurrency by design, so per-request overhead isn't hidden by queueing.
- `order_workflow` — the full order-service → RabbitMQ → makeline-service
  → DocumentDB path, which exercises the whole service-to-service call
  chain, where per-hop overhead compounds the most.

k6's built-in per-request timings do most of the work for you — no custom
instrumentation needed. Look for these in the end-of-run summary (or the
JSON output):

| Metric | What it tells you |
|---|---|
| `http_req_connecting` | TCP handshake time — "connection speed" |
| `http_req_tls_handshaking` | TLS handshake time — "connection speed" |
| `http_req_waiting` | time-to-first-byte — server-side processing |
| `http_req_duration` | total request time — end-to-end overhead |
| `http_req_failed` | request failure/timeout rate |

Get more granular percentiles with:

```bash
k6 run --summary-trend-stats "avg,min,med,p(90),p(95),p(99),max" benchmark/k6-api-load.js
```

## Quick one-off connection timing (no k6)

For a fast sanity check of TCP/TLS overhead on a single endpoint, `curl`'s
timing breakdown is a lighter-weight alternative to k6:

```bash
curl -w '@-' -o /dev/null -s http://localhost:3002/health <<'EOF'
    dns: %{time_namelookup}s
connect: %{time_connect}s
    tls: %{time_appconnect}s
   ttfb: %{time_starttransfer}s
  total: %{time_total}s
EOF
```
