# Observabilidad y respuesta a incidentes

Este playbook describe cómo activar alertas sobre las métricas expuestas en `/api/metrics`, centralizar logs/auditorías y practicar los procedimientos de respuesta a incidentes.

## Métricas base
- `api_failures_total{path,code}` y `alertable_api_failures_total{path,code}`: errores de API por endpoint (pagos, verificación y notificaciones están etiquetados como alertables).
- `db_contention_total{scope}` y `db_deadlock_total{scope}`: colisiones de locks y deadlocks detectados en la capa de persistencia.
- `db_transaction_duration_ms{scope,isolation}`: latencia de transacciones en ms por alcance y nivel de aislamiento.

## Reglas de alerta sugeridas
Usa Alertmanager/Rule Manager de Prometheus para crear reglas con anotaciones que apunten a las runbooks de cada caso. Ejemplos en PromQL:

- **Pagos fallidos (alta prioridad)**
  ```promql
  increase(alertable_api_failures_total{path=~"initiate-payment|confirm-payment"}[5m]) >= 3
  ```
  - Añade una versión adicional con ventana de 15 minutos para identificar degradaciones sostenidas (`>= 10`).
- **Tasa de errores de API**
  ```promql
  rate(api_failures_total[5m]) >= 0.2
  ```
  - Si no hay requests de referencia, usa umbrales absolutos (`increase(...) >= 5`) y ajusta por endpoint con `by (path)`.
- **Contención/locks**
  ```promql
  rate(db_contention_total[5m]) >= 1
  ```
  - Crea otra alerta específica para deadlocks: `rate(db_deadlock_total[5m]) > 0` con severidad crítica.

Anexa labels de servicio (`service="miniappworld"`) y ruta del runbook (`runbook_url`) para facilitar el enrutamiento.

## Centralización de logs y auditorías
- El archivo `data/audit.log` rota por tamaño o cambio de día y purga archivos rotados tras `AUDIT_LOG_RETENTION_DAYS` (30 días por defecto).
- Reenvío soportado sin cambios de código:
  - HTTP/ELK/webhooks: define `AUDIT_LOG_HTTP_ENDPOINT` y `AUDIT_LOG_HTTP_AUTHORIZATION` para enviar cada entrada como `POST` JSON.
  - AWS CloudWatch Logs: configura `AUDIT_LOG_CLOUDWATCH_GROUP`, `AUDIT_LOG_CLOUDWATCH_STREAM` y `AWS_REGION` para publicar y crear recursos automáticamente.
- Recomendado:
  - Activar un collector (Filebeat/Vector/Fluent Bit) que lea `data/*.log` y envíe a tu observability stack (Grafana/Loki u OpenSearch) con retención mínima de 30-45 días.
  - Normalizar el parseo JSON para conservar los campos `type`, `path`, `code` y `scope`, y redactar datos sensibles (ya se pseudonimizan antes de escribirse en disco).
  - Configurar dashboards: errores por endpoint, latencia de transacciones y top de contención de locks; enlaza gráficos a las alertas anteriores.

## Procedimientos de respuesta a incidentes
1. **Detección**: las alertas anteriores deben abrir un incidente en tu herramienta (PagerDuty, Opsgenie) con severidad según ruta (`confirm-payment` > `verify-world-id` > otros).
2. **Triaging rápido** (15 minutos):
   - Revisar panel de métricas para confirmar si el problema es puntual o sostenido.
   - Consultar logs centralizados filtrando por `type=operational_alert` o por `scope` en contención para ubicar la operación específica.
3. **Mitigación**:
   - Pagos: pausar nuevas inscripciones si los fallos persisten, revisar conectividad con Developer Portal y reintentar transacciones pendientes.
   - API genérica: habilitar modo degradado (limitar notificaciones, ampliar timeouts) y validar dependencias externas.
   - Contención/deadlocks: reducir concurrencia del proceso afectado, revisar duración de transacciones y aumentar `DB_BUSY_TIMEOUT_MS` solo si es temporal.
4. **Comunicación**: actualizar cada 30 minutos en el canal de incidentes, registrar línea de tiempo y decisiones.
5. **Cierre y post-mortem**: documentar causa raíz, métricas de impacto y acciones preventivas.

### Simulacros de verificación
Ejecuta estos ejercicios al menos una vez por trimestre para validar cobertura de alertas y dashboards:
- Forzar un pago fallido con datos inválidos en `/api/confirm-payment` y confirmar que se incrementa `alertable_api_failures_total` y dispara la alerta.
- Simular contención ejecutando operaciones concurrentes que tomen el lock del archivo de base de datos y verificar que `db_contention_total` aumenta y aparece en el panel.
- Validar que las entradas de `audit.log` se envían al colector (observa eventos en el dashboard de logs) y que se respetan las políticas de retención.
