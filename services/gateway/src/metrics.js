/**
 * Prometheus metrics for the API gateway service.
 */
import { Registry, Counter, Histogram, Gauge } from "prom-client";

export const register = new Registry();
register.setDefaultLabels({ service: "gateway" });

export const httpRequestsTotal = new Counter({
  name: "gateway_http_requests_total",
  help: "Total HTTP requests handled by the gateway",
  labelNames: ["method", "route", "status_code"],
  registers: [register]
});

export const httpRequestDuration = new Histogram({
  name: "gateway_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register]
});

export const activeRequests = new Gauge({
  name: "gateway_active_requests",
  help: "Number of requests currently being processed",
  registers: [register]
});

export const rateLimitHitsTotal = new Counter({
  name: "gateway_rate_limit_hits_total",
  help: "Number of requests rejected by rate limiter",
  registers: [register]
});
