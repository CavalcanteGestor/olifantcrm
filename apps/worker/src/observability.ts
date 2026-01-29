import * as Sentry from "@sentry/node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

let otelStarted = false;

export function initObservability(env: {
  NODE_ENV: string;
  SERVICE_NAME?: string;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_ENABLED?: string;
  SENTRY_DSN?: string;
}) {
  if (env.SENTRY_DSN) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: 0.02
    });
  }

  const enabled = env.OTEL_ENABLED === "1" || env.OTEL_ENABLED === "true";
  if (!enabled || otelStarted) return;
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) return;

  const sdk = new NodeSDK({
    serviceName: env.SERVICE_NAME ?? "crmolifant-worker",
    traceExporter: new OTLPTraceExporter({ url: env.OTEL_EXPORTER_OTLP_ENDPOINT }),
    instrumentations: [getNodeAutoInstrumentations()]
  });

  sdk.start();
  otelStarted = true;
}

export function captureException(err: unknown) {
  try {
    Sentry.captureException(err);
  } catch {
    // noop
  }
}


