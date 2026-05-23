/**
 * Example k6 script (run after `brew install k6` or see https://k6.io/docs/get-started/installation/).
 * Targets HTTP health endpoints — extend with k6 WebSocket API for socket load.
 *
 * k6 run scripts/loadtest/k6-health.js
 */
import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 20,
  duration: "30s"
};

const GATEWAY = __ENV.GATEWAY || "http://127.0.0.1:4000";

export default function () {
  const res = http.get(`${GATEWAY}/health`);
  check(res, { "status 200": (r) => r.status === 200 });
}
