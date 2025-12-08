# Observabilidad y resiliencia

Este repositorio expone métricas Prometheus y utilidades de pruebas de carga para verificar la migración de base de datos/cola.

## Métricas añadidas
- `payment_initiation_duration_ms{status}`: histograma de latencia en la creación de pagos (p95/p99 recomendados en dashboards).
- `payment_confirmation_duration_ms{status}`: histograma de latencia al confirmar pagos end-to-end.
- `tournament_join_latency_ms{status}`: latencia de inscripción a torneos (se incrementa al persistir el participante).
- `queue_latency_ms{queue,status}` y `queue_size{queue}`: latencia y tamaño de la cola de despacho de notificaciones.
- `workflow_errors_total{stage,reason}`: contador de errores de negocio (pagos, inscripciones, notificaciones).
- Métricas existentes (`api_failures_total`, `alertable_api_failures_total`, etc.) siguen disponibles y pueden cruzarse en Grafana.

Las métricas se exponen en `/api/metrics` (sin caché). Configura Prometheus para scrapear `https://<host>/api/metrics`.

## Dashboards y alarmas
- Importa `docs/grafana-dashboard.json` en Grafana y selecciona el datasource de Prometheus.
- Paneles incluidos: latencia de pago (p95), latencia de inscripción, errores por flujo y tamaño de cola.
- Alertas sugeridas (Prometheus rule):
  - `histogram_quantile(0.95, sum(rate(payment_confirmation_duration_ms_bucket[5m])) by (le)) > 1000` durante 10m -> degradación severa.
  - `sum(increase(workflow_errors_total[5m])) by (stage) > 5` -> investigar picos de errores de negocio.
  - `queue_size{queue="notification_dispatch"} > 10` durante 5m -> posible atasco en notificaciones.

## SLA de referencia
- Pagos (inicio/confirmación): p95 < 800 ms, p99 < 1500 ms.
- Inscripción a torneo: p95 < 700 ms, p99 < 1200 ms.
- Errores de flujo: < 1% de las solicitudes, con objetivo duro < 2%.
- Cola de notificaciones: tamaño medio < 5; tiempo de despacho p95 < 500 ms.

## Pruebas de carga
Se añadió `scripts/loadtest.mjs` (usa `autocannon`). Variables clave:
- `LOADTEST_TARGET` (URL base), `LOADTEST_USERS` (conexiones concurrentes), `LOADTEST_DURATION` (segundos).
- `LOADTEST_TOURNAMENT_ID`, `LOADTEST_USER_ID`, `LOADTEST_WALLET_ADDRESS`, `LOADTEST_SESSION_COOKIE`, `LOADTEST_CSRF_TOKEN` para cumplir validaciones de los endpoints.
- `LOADTEST_NOTIFICATION_WALLETS` coma-separado para las wallets receptoras; `LOADTEST_OUTPUT` para elegir archivo de resultados.

Ejemplo:
```bash
LOADTEST_TARGET=http://localhost:3000 \
LOADTEST_USERS=25 \
LOADTEST_DURATION=60 \
LOADTEST_TOURNAMENT_ID=test-tournament \
LOADTEST_USER_ID=user-123 \
LOADTEST_WALLET_ADDRESS=0xabc... \
LOADTEST_SESSION_COOKIE="SESSION=..." \
LOADTEST_CSRF_TOKEN=... \
node scripts/loadtest.mjs
```

El script genera un `loadtest-results.json` con latencias, throughput y errores agregados; úsalo junto con las métricas de Prometheus para validar el SLA.

## Interpretación rápida
- Si `workflow_errors_total` sube junto a `api_failures_total`, revisar logs de auditoría y causas de validación.
- Si `queue_size{queue="notification_dispatch"}` crece y `queue_latency_ms` supera el SLA, reducir la tasa de envío en el script o escalar el worker de notificaciones.
- Ajustar índices o concurrencia de workers dependiendo de la correlación entre `db_transaction_duration_ms` y los histogramas de pago/inscripción.
