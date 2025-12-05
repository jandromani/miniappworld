-- Postgres transición: controles de liquidación e idempotencia reforzada
-- Obliga a que los pagos exitosos tengan settled_at y limita un éxito por inscripción
ALTER TABLE payments
  ADD CONSTRAINT payments_settled_when_succeeded
  CHECK (status <> 'succeeded' OR settled_at IS NOT NULL);

-- Partial unique aplicado a la partición por defecto; replicar en particiones nuevas
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_successful_buyin_default
  ON payments_default(tournament_entry_id)
  WHERE status = 'succeeded' AND direction = 'buy_in';

-- Índice para payouts recientes
CREATE INDEX IF NOT EXISTS payments_payouts_recent
  ON payments(created_at DESC)
  WHERE direction = 'payout';

-- Tabla de archivo para mover pagos antiguos (opcional)
CREATE TABLE IF NOT EXISTS payments_archive
  (LIKE payments INCLUDING ALL);
