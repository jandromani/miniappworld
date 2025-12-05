-- SQLite transición: idempotencia y archivo
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_successful_buyin
  ON payments(tournament_entry_id)
  WHERE status='succeeded' AND direction='buy_in';

CREATE TRIGGER IF NOT EXISTS payments_require_settled_at
BEFORE INSERT ON payments
WHEN NEW.status='succeeded' AND NEW.settled_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'settled_at required for succeeded payments');
END;

CREATE TRIGGER IF NOT EXISTS payments_require_settled_at_update
BEFORE UPDATE ON payments
WHEN NEW.status='succeeded' AND NEW.settled_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'settled_at required for succeeded payments');
END;

CREATE TABLE IF NOT EXISTS payments_archive (
  id TEXT PRIMARY KEY,
  tournament_entry_id TEXT NOT NULL,
  external_reference TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  amount INTEGER NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  settled_at DATETIME,
  metadata TEXT DEFAULT '{}'
);
