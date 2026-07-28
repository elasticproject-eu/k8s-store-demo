// k6 API load test for the aks-store-demo backend services.
//
// Purpose: generate a repeatable, browser-free HTTP workload against
// order-service, product-service and makeline-service for benchmarking purposes
//
// Usage:
//   k6 run benchmark/k6-api-load.js
//
// Point it at whatever you're testing (kind, K8s + port-forward,
// K8s + ingress, ...) via env vars:
//   k6 run \
//     -e PRODUCT_URL=http://localhost:3002 \
//     -e ORDER_URL=http://localhost:3000 \
//     -e MAKELINE_URL=http://localhost:3001 \
//     -e SLEEP_S=0 -e JITTER_MS=10 \
//     benchmark/k6-api-load.js
//
// SLEEP_S sets the fixed think-time (seconds) between a VU's iterations;
// defaults to 0 (throughput/saturation mode). JITTER_MS adds a small random
// amount on top (default 10ms) so VUs don't stay phase-locked and fire in
// synchronized bursts, even with SLEEP_S=0 — see vu_think() below.
//
// Useful flags:
//   --vus 20 --duration 2m          override the default load shape
//   --summary-trend-stats "avg,min,med,p(90),p(95),p(99),max"
//   --out json=results.json          save results for later analysis
//
// What to look at afterwards (k6's built-in per-request timing metrics,
// broken out automatically per URL/tag by k6's end-of-test summary):
//   http_req_connecting      TCP handshake time            -> "connection speed"
//   http_req_tls_handshaking TLS handshake time             -> "connection speed"
//   http_req_waiting         time-to-first-byte (TTFB)      -> processing overhead
//   http_req_duration        total request time             -> end-to-end overhead
//   iteration_duration       full workflow latency

import http from "k6/http"
import { check, group, sleep } from "k6"
import { Counter } from "k6/metrics"

const PRODUCT_URL = __ENV.PRODUCT_URL || "http://localhost:3002"
const ORDER_URL = __ENV.ORDER_URL || "http://localhost:3000"
const MAKELINE_URL = __ENV.MAKELINE_URL || "http://localhost:3001"
const SLEEP_S = Number(__ENV.SLEEP_S ?? 0)
const JITTER_MS = Number(__ENV.JITTER_MS ?? 10)

const orderErrors = new Counter("order_errors")

// Sleeps SLEEP_S seconds plus a few random JITTER_MS milliseconds. The
// jitter is re-rolled every call, so VUs' phases drift apart over the run
// instead of staying locked together and firing every request in sync.
// This never affects http_req_duration/http_req_connecting/etc — those are
// measured strictly inside the http.get/http.post calls, before this runs.
function vu_think() {
  sleep(SLEEP_S + Math.random() * (JITTER_MS / 1000))
}

export const options = {
  scenarios: {
    // Steady, low-concurrency read traffic against product-service.
    product_reads: {
      executor: "constant-vus",
      exec: "productReads",
      vus: Number(__ENV.PRODUCT_VUS || 5),
      duration: __ENV.DURATION || "2m",
    },
    // End-to-end order placement -> pickup workflow (order-service ->
    // rabbitmq -> makeline-service -> documentdb). Exercises the full
    // service-to-service call chain
    order_workflow: {
      executor: "constant-vus",
      exec: "orderWorkflow",
      vus: Number(__ENV.ORDER_VUS || 5),
      duration: __ENV.DURATION || "2m",
      startTime: "5s", // let product_reads warm up first
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
  },
}

export function productReads() {
  group("product-service", () => {
    const list = http.get(`${PRODUCT_URL}/`, { tags: { name: "product_list" } })
    check(list, { "product list 200": (r) => r.status === 200 })

    const products = list.json()
    if (Array.isArray(products) && products.length > 0) {
      const pick = products[Math.floor(Math.random() * products.length)]
      const detail = http.get(`${PRODUCT_URL}/${pick.id}`, { tags: { name: "product_detail" } })
      check(detail, { "product detail 200": (r) => r.status === 200 })
    }

    const health = http.get(`${PRODUCT_URL}/health`, { tags: { name: "product_health" } })
    check(health, { "product health 200": (r) => r.status === 200 })
  })

  vu_think()
}

export function orderWorkflow() {
  group("order-service", () => {
    const payload = JSON.stringify({
      customerId: `k6-${__VU}-${__ITER}`,
      items: [
        { productId: 1, quantity: 1, price: 10 },
        { productId: 2, quantity: 2, price: 20 },
      ],
    })

    const res = http.post(`${ORDER_URL}/`, payload, {
      headers: { "Content-Type": "application/json" },
      tags: { name: "order_create" },
    })
    const ok = check(res, { "order accepted (201)": (r) => r.status === 201 })
    if (!ok) orderErrors.add(1)
  })

  group("makeline-service", () => {
    // Drain the queue into documentdb, mirroring what virtual-worker does.
    const fetch = http.get(`${MAKELINE_URL}/order/fetch`, { tags: { name: "makeline_fetch" } })
    check(fetch, { "makeline fetch 200": (r) => r.status === 200 })

    const health = http.get(`${MAKELINE_URL}/health`, { tags: { name: "makeline_health" } })
    check(health, { "makeline health 200": (r) => r.status === 200 })
  })

  vu_think()
}
