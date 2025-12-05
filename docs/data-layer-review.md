# Revisión de capa de datos

## Puntos de acceso y concurrencia actuales
- El estado persistido vive en `data/database.json` con un lockfile global `data/database.lock`; todas las operaciones de lectura/escritura pasan por `withDbLock`, que abre el lock con `fs.open(..., 'wx')`, espera con reintentos y limpia locks obsoletos antes de leer/modificar la base JSON completa. No hay aislamiento por entidad ni bloqueos granulares.
- La serialización incluye cifrado opcional (AES-GCM con `DATA_ENCRYPTION_KEY`) y se escribe a un archivo temporal antes de hacer `rename`, pero la escritura sigue siendo de base completa.
- Se mantienen caches en memoria para verificaciones de World ID y un auditoría en `data/audit.log` con rotación y reenvío opcional a HTTP/CloudWatch.
- Las operaciones expuestas incluyen:
  - **Pagos**: creación con referencia única, asociación opcional a torneos, historial de estados y auditoría al crear/actualizar.
  - **Torneos**: upsert de definición, alta de participantes idempotente, resultados/prize-pool actualizados con `BigInt`, y registro de payouts confirmados.
  - **Progreso de juego**: upsert por sesión/usuario.

## Requisitos funcionales inferidos
- Integridad de pagos y torneos:
  - Cada pago debe ser único por `reference`, guardar cambios de estado y opcionalmente vincularse a un torneo y a una wallet/usuario verificado.
  - Participantes y resultados dependen de que el torneo y el usuario verificados existan; las altas fallan si no se encuentran.
  - Los payouts se insertan como confirmados con hashes de transacción y datos de wallet.
- Aislamiento/consistencia esperada:
  - Las escrituras asumen exclusión mutua global (un lock para toda la base) y falta de transacciones anidadas, por lo que cualquier operación parcial implica persistir el documento completo.
  - La lógica de negocio (p. ej. sumar `prize_pool` con `BigInt`) se ejecuta en memoria, por lo que requiere transacciones reales para evitar condiciones de carrera en un SGBD.
- Consistencia temporal:
  - Las verificaciones de World ID expiran según `expires_at` y se eliminan durante snapshots/consultas.
  - Auditoría requiere timestamps monotónicos y retención configurable.

## Brechas frente a Postgres/SQLite
- **Bloqueos y concurrencia**: el lockfile es un bloqueo global; no existen bloqueos de fila/tabla ni control de concurrencia optimista. Postgres ofrece `SELECT ... FOR UPDATE` y niveles de aislamiento `READ COMMITTED`/`SERIALIZABLE`; SQLite soporta `IMMEDIATE/EXCLUSIVE` y write-ahead logging, lo que permitiría granuralidad y mejor contención.
- **Transacciones**: actualmente se reescribe el archivo completo por operación; no hay commits parciales ni rollbacks. Migrar a Postgres/SQLite permitiría transacciones reales para pagos, registros de torneo y auditoría, evitando corrupción ante fallos.
- **Integridad referencial**: las verificaciones de existencia de usuarios/torneos son lógicas; no hay claves foráneas ni constraints de unicidad más allá de búsquedas en memoria. Bases relacionales permitirían `UNIQUE` en `reference`, `FOREIGN KEY` entre pagos/torneos/usuarios y checks de estado.
- **Bloqueos de fila para flujos críticos**: operaciones como `updateTournamentResultAndPool` y `updatePaymentStatus` dependen de leer-modificar-escribir en memoria. Postgres puede usar `FOR UPDATE`/`FOR NO KEY UPDATE` para evitar interleaving; SQLite requeriría `BEGIN IMMEDIATE` o `SELECT ... FOR UPDATE` emulado.
- **Extensiones/funciones**: no se usan features específicas, pero Postgres podría aprovechar funciones JSON/UUID y triggers para auditoría; SQLite requeriría soporte de `json1`/`foreign_keys` y generación de UUID (p. ej., `gen_random_uuid()` en Postgres o extensiones equivalentes).
- **Consistencia temporal**: el control de expiración y retención se hace manualmente; en Postgres pueden utilizarse `ON DELETE` con `WHERE` vía policies, `pg_cron` o `TTL` simulada; en SQLite se necesitarían jobs externos.
