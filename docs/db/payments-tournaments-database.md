# Esquema de pagos y torneos

Este documento describe el modelo relacional para pagos y torneos, las migraciones
SQL para Postgres/SQLite y la estrategia de transición de datos. Las tablas están
pensadas para integrarse con el flujo de juego descrito en `docs/fase1-functional-design.md`.

## Tablas y restricciones clave

- **players**: referencia canónica del usuario (nullifier de World ID y wallet).
  - `user_id` `TEXT/UUID` PK.
  - `wallet_address` `TEXT` `UNIQUE` y `CHECK(length(wallet_address) > 0)`.
  - `username` `TEXT NOT NULL` `CHECK(length(username) >= 3)`.
- **tournaments**: define el torneo y su buy-in.
  - `buy_in_token` `TEXT` con `CHECK` a (`WLD`, `USDC`, `MEMECOIN`).
  - `buy_in_amount` `NUMERIC` (`INTEGER` en SQLite) `CHECK(buy_in_amount > 0)`.
  - `status` `CHECK` a (`draft`, `open`, `in_progress`, `finished`, `cancelled`).
  - `CHECK(ends_at > starts_at)`.
  - Índices para filtrar por `status`, `starts_at`, `ends_at`.
- **tournament_entries**: inscripción de jugador en torneo.
  - FK a `tournaments` y `players` con `ON DELETE CASCADE`.
  - `UNIQUE(tournament_id, user_id)` para evitar dobles inscripciones.
  - `payment_status` `CHECK` (`pending`, `paid`, `refunded`).
- **payments** (particionada en Postgres): pagos de buy-in o payouts.
  - FK a `tournament_entries` con `ON DELETE CASCADE`.
  - `token_symbol` `CHECK` a (`WLD`, `USDC`, `MEMECOIN`).
  - `status` `CHECK` (`pending`, `succeeded`, `failed`, `refunded`).
  - `direction` `CHECK` (`buy_in`, `payout`).
  - `UNIQUE(external_reference)` para idempotencia.
  - Índices por `status`, `tournament_entry_id` y una partial unique en Postgres
    para permitir solo un pago `succeeded` de buy-in por inscripción.
- **tournament_results**: leaderboard y payouts calculados.
  - PK compuesta `(tournament_id, user_id)`.
  - `rank` `CHECK(rank > 0)` y `prize_amount >= 0`.

## Particionamiento e histórico

- **Postgres**: `payments` se crea como tabla particionada por rango en `created_at`
  con un `DEFAULT` partition. Se recomienda crear particiones mensuales (ej. enero
  2025) y reglas de retención moviendo registros antiguos a `payments_archive`.
- **SQLite**: no soporta particiones; se añade tabla `payments_archive` para mover
  pagos cerrados (ej. con `status IN ('succeeded','refunded')` y `created_at`
  < ahora - 180 días) mediante jobs de mantenimiento.

## Migraciones

### Postgres
- `db/migrations/postgres/001_init.sql`: crea tablas base, índices y partición
  `payments_default`.
- `db/migrations/postgres/002_transition.sql`: añade constraint de liquidación,
  índice parcial de idempotencia de buy-in (aplicado a `payments_default`; debe
  replicarse en cada partición mensual) y tabla de archivo.
- Rollbacks en `db/migrations/postgres/rollback/*.sql`.

### SQLite
- `db/migrations/sqlite/001_init.sql`: mismo esquema ajustado a tipos y `CHECK`
  compatibles.
- `db/migrations/sqlite/002_transition.sql`: añade constraint en `payments` y
  tabla `payments_archive`.
- Rollbacks en `db/migrations/sqlite/rollback/*.sql`.

### Seeds mínimas
- `db/seeds/postgres/seed.sql` y `db/seeds/sqlite/seed.sql` insertan:
  - Un jugador demo.
  - Un torneo abierto.
  - Una inscripción pagada y su registro de pago `succeeded`.

## Estrategia de transición de datos

1. **Export/Import**
   - Exportar datos actuales de pagos/torneos en formato CSV o JSON con claves
     externas explícitas (user_id, tournament_id, entry_id).
   - Importar primero `players`, luego `tournaments`, `tournament_entries` y
     finalmente `payments` respetando FK y `external_reference` para idempotencia.
2. **Doble escritura / backfill**
   - Durante una ventana de convivencia, escribir en las tablas antiguas y en las
     nuevas `payments`/`tournament_entries` mediante feature flag.
   - Ejecutar un backfill que genere `tournament_entries` a partir de partidas
     históricas y cree pagos con `status='succeeded'` para buy-ins ya cobrados.
3. **Ventana de mantenimiento**
   - Si se opta por corte en frío, pausar pagos entrantes, correr migraciones y
     reanudar tras verificar conteos (`COUNT(*)` por tabla vs origen).
   - Para migración en vivo, usar colas con reintentos idempotentes; los eventos
     en vuelo deben persistir el `external_reference` para replays seguros.
4. **Verificación**
   - Checks de integridad: `UNIQUE` en referencias externas, validación de
     sumatoria de `payments` `direction='buy_in'` vs `buy_in_amount` por entrada,
     y conteo de `tournament_entries` por torneo.

## Rollback operativo
- Si falla la transición, ejecutar los scripts de `rollback` en orden inverso y
  revertir el flag de doble escritura. Restaurar backups de particiones/archivos
  si se movieron registros a `payments_archive`.
