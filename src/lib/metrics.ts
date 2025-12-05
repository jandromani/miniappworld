import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

type FailureLabels = { path: string; code: string };

const registry = getOrCreateRegistry();

const apiFailureCounter = getOrCreateCounter('api_failures_total', {
  help: 'Conteo de respuestas de error por endpoint y código',
  labelNames: ['path', 'code'],
});

const alertableFailureCounter = getOrCreateCounter('alertable_api_failures_total', {
  help: 'Conteo de errores críticos que deberían generar alertas',
  labelNames: ['path', 'code'],
});

const ALERT_PATHS = new Set(['initiate-payment', 'confirm-payment', 'verify-world-id', 'send-notification']);

function getOrCreateRegistry() {
  const globalWithRegistry = global as typeof globalThis & { __metrics_registry?: Registry; __metrics_collected__?: boolean };

  if (!globalWithRegistry.__metrics_registry) {
    globalWithRegistry.__metrics_registry = new Registry();
  }

  if (!globalWithRegistry.__metrics_collected__) {
    collectDefaultMetrics({ register: globalWithRegistry.__metrics_registry });
    globalWithRegistry.__metrics_collected__ = true;
  }

  return globalWithRegistry.__metrics_registry;
}

function getOrCreateCounter(name: string, options: { help: string; labelNames: (keyof FailureLabels)[] }) {
  const existing = registry.getSingleMetric(name);
  if (existing) return existing as Counter<FailureLabels>;

  return new Counter<FailureLabels>({
    name,
    help: options.help,
    labelNames: options.labelNames as string[],
    registers: [registry],
  });
}

function serializeAlert(labels: FailureLabels) {
  return JSON.stringify({
    type: 'operational_alert',
    timestamp: new Date().toISOString(),
    path: labels.path,
    code: labels.code,
    severity: 'error',
  });
}

export function recordApiFailureMetric(path?: string, code?: string) {
  if (!path) return;

  const labels: FailureLabels = { path, code: code ?? 'unknown' };
  apiFailureCounter.labels(labels).inc();

  if (ALERT_PATHS.has(path)) {
    alertableFailureCounter.labels(labels).inc();
    console.error(serializeAlert(labels));
  }
}

export async function getMetricsSnapshot() {
  return registry.metrics();
}

export const metricsContentType = registry.contentType;
