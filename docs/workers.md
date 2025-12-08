# Workers de colas

La aplicación usa **BullMQ** sobre Redis para procesar pagos y notificaciones de forma asíncrona e idempotente.

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `REDIS_URL` | URL de conexión a Redis (requerida). |
| `QUEUE_PREFIX` | Prefijo de las colas, útil para aislar entornos (por defecto `miniappworld`). |
| `QUEUE_MAX_RETRIES` | Reintentos por job (por defecto `5`). |
| `QUEUE_BACKOFF_MS` | Backoff exponencial inicial en ms (por defecto `2000`). |
| `WORKER_CONCURRENCY` | Concurrencia base de los workers (por defecto `5`). |
| `PAYMENT_WORKER_CONCURRENCY` | Concurrencia específica del worker de pagos (opcional). |
| `NOTIFICATION_WORKER_CONCURRENCY` | Concurrencia específica del worker de notificaciones (opcional). |
| `WORKER_LOCK_DURATION_MS` | Duración del lock para evitar duplicados/stalls (por defecto `30000`). |

## Arranque de workers

1. Exporta las variables anteriores, incluyendo `REDIS_URL`.
2. Ejecuta los workers:

```bash
npm run workers:start            # Levanta pagos + notificaciones en el mismo proceso
npm run workers:payments         # Solo el worker de pagos
npm run workers:notifications    # Solo el worker de notificaciones
```

## Responsabilidades

- **Pagos (`payments:process`)**: confirma el pago de manera idempotente, actualiza el estado en la base de datos, incrementa el pozo del torneo y registra al usuario si aún no figura como participante. Usa locks en Redis para balancear entre réplicas.
- **Notificaciones (`notifications:send`)**: envía notificaciones push/email con reintentos y backoff, deduplicando por `jobId`.

Los jobs son deduplicados mediante `jobId` (referencia de pago o hash del payload) y cuentan con reintentos con backoff exponencial para recuperarse de fallos transitorios. Para supervisión se recomienda exponer métricas/healthchecks del proceso según el orquestador que se use (K8s probes, ECS health check, etc.).
