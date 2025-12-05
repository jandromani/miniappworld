# Plan de despliegue gradual de la nueva base de datos

Este documento describe cómo activar gradualmente la nueva base de datos relacional (Postgres o SQLite), cómo verificar el estado después de migraciones y cómo recuperar el servicio ante fallos.

## Feature flag de activación
- **Bandera `DB_ROLLOUT_ENABLED`**: controla si el servicio usa la nueva base o el almacenamiento actual basado en archivos.
- **Modos**:
  - `off`: utiliza únicamente el backend actual.
  - `shadow`: escribe en ambas bases pero lee de la actual para validar integridad sin impacto de usuario.
  - `on`: todas las operaciones de lectura/escritura usan la nueva base.
- **Controles operativos**:
  - Propagar la bandera por variables de entorno en los pods/funciones.
  - Registrar cada decisión de ruta (`shadow` u `on`) en logs de auditoría con `user_id`, `payment_reference` y tipo de operación (anónimos cuando aplique).

## Scripts y verificaciones post-migración
- **Scripts recomendados** (automatizados en CI o runbooks manuales):
  - `scripts/dbSmoke.js`: comprueba conectividad y simula la ejecución de migraciones mínimas para el driver activo (`DB_DRIVER`).
  - `scripts/dataSnapshots.js verify`: asegura que las snapshots históricas pueden restaurarse sobre el nuevo esquema sin pérdidas.
- **Checks esenciales después de migrar**:
  - Conteo de filas por tabla comparado con el origen (pagos, participantes, auditoría de estatus).
  - Validación de claves únicas (`payment_reference`, `tournament_id + user_id`).
  - Tiempo de respuesta de lecturas críticas (<200 ms en rutas de pago) con `prom-client`.
  - Alertas de bloqueo prolongado (>5 s) y reintentos.

## Playbooks de rollback
- **Rollback suave**: cambiar `DB_ROLLOUT_ENABLED=off`, drenar el tráfico y purgar conexiones a la base nueva.
- **Rollback con divergencia**:
  - Congelar escrituras (mantenimiento), exportar difs de auditoría de la nueva base y rehidratarlos en el backend anterior.
  - Revalidar contadores de pagos confirmados vs. transacciones en cadena antes de reabrir tráfico.
- **Puntos de control**: mantener backups incrementales de la nueva base antes de cada incremento de tráfico (>10%).

## Instrumentación de logs y métricas
- **Logs estructurados**:
  - `transaction_status`, `lock_wait_ms`, `driver` (`postgres`/`sqlite`), `reference`, `tournament_id`.
  - Resultado (`committed`/`rolled_back`) y razón de rollback.
- **Métricas** (exponer en `/metrics` vía `prom-client`):
  - Contador `db_transactions_total{driver,status}`.
  - Histograma `db_lock_wait_seconds_bucket{driver}` para tiempos de bloqueo.
  - Contador `db_conflicts_total{driver}` para detectar contención.
- **Alertas sugeridas**:
  - % de conflictos >2% durante 5 minutos.
  - P99 de espera de bloqueo >3 s.
  - Caídas de éxito en confirmación de pagos <98% en 10 minutos.

## Estrategia de despliegue gradual
1. Activar `shadow` en un entorno canary y validar métricas de contención/concurrencia.
2. Mover 10% del tráfico a `on`, monitorear conflictos y latencia.
3. Escalar progresivamente (25%, 50%, 100%) solo si las alertas se mantienen verdes.
4. Documentar cada paso y dejar evidencia en el tablero de incidentes.
