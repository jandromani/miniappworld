# Matrices de configuración y requisitos por entorno

## Variables clave por entorno

| Variable                            | Local                             | Staging                                | Producción                            |
|-------------------------------------|-----------------------------------|----------------------------------------|----------------------------------------|
| `APP_ID` / `NEXT_PUBLIC_APP_ID`     | Dummy local (ej. `app_local`)     | ID de app staging                      | ID de app productiva                   |
| `DEV_PORTAL_API_KEY`                | `mock` o sandbox                  | Clave de staging con scope limitado    | Clave con rotación y acceso restringido|
| `NEXT_PUBLIC_TREASURY_ADDRESS`      | Address de pruebas (anvil/sepolia) | Address staging whitelisteada          | Address productiva whitelisteada       |
| `NOTIFICATIONS_API_KEYS`            | JSON de claves mock               | Claves con expiración corta            | Claves rotadas mensualmente + revocación|
| `UPSTASH_REDIS_REST_URL/TOKEN`      | Opcional (`QUEUE_DRIVER=memory`)  | Obligatorio para rate limiting shared  | Obligatorio + `AUDIT_LOG_FORWARD_TIMEOUT_MS` ajustado|
| `DATA_ENCRYPTION_KEY`               | Opcional                          | Requerido para cifrar `data/database.json` | Requerido + backup KMS                 |
| `NEXT_PUBLIC_APP_ENV`               | `local`                           | `staging`                              | `production`                           |
| `QUEUE_DRIVER`                      | `memory`                          | `upstash` o `redis`                    | `upstash` o `redis` con DLQ persistente |
| `AUDIT_LOG_HTTP_ENDPOINT`           | Vacío                             | Opcional (webhook QA)                  | Requerido (SIEM/ELK)                   |

## Seguridad
- **CSRF**: habilitado en todos los entornos; bloquear cualquier excepción en producción.
- **Auth de API**: `session_token` debe ser HTTP-Only + SameSite=Lax; en producción exigir `Secure`.
- **Rate limiting**: obligatorio fuera de local; parámetros por defecto `60 req/min` por token/IP.
- **Permisos de claves**: API keys almacenadas en secret manager; nunca en repositorio ni logs.
- **Tokens permitidos**: restringir a whitelist (`WLD`, `USDC`, memecoin configurado) y validar decimales.

## Observabilidad
- **Logs**: rotación activa (`AUDIT_LOG_MAX_SIZE_BYTES`), retención mínima 30 días (staging) y 90 días (producción).
- **Trazas**: habilitar `OTEL_EXPORTER_OTLP_ENDPOINT` en staging y producción; usar sampling 10% en staging y 1-5% en producción.
- **Métricas**: exponer `/metrics` solo tras autenticación o en red interna; enviar a Prometheus/CloudWatch.
- **Alertas**: thresholds mínimos:
  - Errores 5xx > 2% por 5 min → alerta alta.
  - Pagos fallidos consecutivos > 3 → alerta media con incluir payload hash.
  - Latencia p95 de `/api/confirm-payment` > 800 ms → alerta media.

## Checklist por entorno
### Local
- Arrancar con `QUEUE_DRIVER=memory` y `USE_PAYMENT_MOCK=true`.
- Habilitar `DISABLE_LOCAL_STATE=false` para persistir en disco y depurar.
- Revisar `data/.snapshots/` antes de probar features nuevas.

### Staging
- Sin mocks salvo que se indique en el plan de pruebas (activar `FORCE_MOCK_MINIKIT` solo en casos acotados).
- Revisar rotación de logs y reenvío a webhook de QA.
- Ejecutar suite E2E completa antes de liberar a producción.

### Producción
- Modo estricto: sin mocks, `Secure` cookies y CORS limitado a dominios oficiales.
- DLQ activo para colas y reintentos configurados con backoff.
- Verificar dashboard de métricas y alertas activas tras cada despliegue.
