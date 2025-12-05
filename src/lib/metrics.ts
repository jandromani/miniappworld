import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

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

const dbContentionCounter = getOrCreateCounter('db_contention_total', {
  help: 'Conteo de colisiones de bloqueo/contención por alcance',
  labelNames: ['scope'],
});

const dbDeadlockCounter = getOrCreateCounter('db_deadlock_total', {
  help: 'Conteo de situaciones tipo deadlock detectadas por alcance',
  labelNames: ['scope'],
});

const dbTransactionDuration = getOrCreateHistogram('db_transaction_duration_ms', {
  help: 'Latencia de transacciones por alcance y nivel de aislamiento',
  labelNames: ['scope', 'isolation'],
  buckets: [5, 10, 25, 50, 75, 100, 250, 500, 1000, 2000, 5000],
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

function getOrCreateHistogram(
  name: string,
  options: { help: string; labelNames: string[]; buckets: number[] }
) {
  const existing = registry.getSingleMetric(name);
  if (existing) return existing as Histogram<string>;

  return new Histogram({
    name,
    help: options.help,
    labelNames: options.labelNames,
    buckets: options.buckets,
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

export function recordDbContention(scope: string) {
  dbContentionCounter.labels({ scope }).inc();
}

export function recordDbDeadlock(scope: string) {
  dbDeadlockCounter.labels({ scope }).inc();
}

export function observeDbTransactionDuration(scope: string, isolation: string, durationMs: number) {
  dbTransactionDuration.labels({ scope, isolation }).observe(durationMs);
}

export async function getMetricsSnapshot() {
  return registry.metrics();
}

export const metricsContentType = registry.contentType;
