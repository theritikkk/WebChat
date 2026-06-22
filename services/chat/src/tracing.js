/**
 * OpenTelemetry distributed tracing setup.
 *
 * MUST be imported as the very first import in the service entry point
 * so that auto-instrumentation patches Node.js core modules (http, net, etc.)
 * before any other code runs.
 *
 * Usage (in index.js — line 1):
 *   import "./tracing.js";
 *
 * Environment variables:
 *   OTEL_SERVICE_NAME      — e.g. "webchat-chat" (falls back to SERVICE_NAME below)
 *   OTEL_EXPORTER_OTLP_ENDPOINT — e.g. "http://otel-collector:4318" (defaults to localhost)
 *   OTEL_ENABLED           — set to "false" to disable tracing entirely (e.g. dev without collector)
 *
 * Collector setup (Docker Compose / K8s):
 *   Any OpenTelemetry-compatible collector works: Jaeger, Zipkin, Grafana Tempo, etc.
 *   Example docker-compose snippet:
 *     otel-collector:
 *       image: otel/opentelemetry-collector-contrib:latest
 *       ports:
 *         - "4317:4317"   # gRPC
 *         - "4318:4318"   # HTTP
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const SERVICE_NAME    = process.env.OTEL_SERVICE_NAME    || "webchat-chat";
const OTEL_ENDPOINT   = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
const OTEL_ENABLED    = process.env.OTEL_ENABLED !== "false";

if (OTEL_ENABLED) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]:    SERVICE_NAME,
      [SEMRESATTRS_SERVICE_VERSION]: "1.0.0",
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${OTEL_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy filesystem instrumentation in production
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.log(`[tracing] OpenTelemetry enabled → ${OTEL_ENDPOINT} (service: ${SERVICE_NAME})`);

  // Graceful shutdown: flush all pending spans before the process exits
  process.on("SIGTERM", () => sdk.shutdown().catch(console.error));
  process.on("SIGINT",  () => sdk.shutdown().catch(console.error));
} else {
  console.log("[tracing] OpenTelemetry disabled (OTEL_ENABLED=false)");
}
