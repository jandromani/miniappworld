-- Postgres inicial: jugadores, torneos, inscripciones y pagos particionados
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS players (
  user_id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL CHECK (char_length(username) >= 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  buy_in_token TEXT NOT NULL CHECK (buy_in_token IN ('WLD','USDC','MEMECOIN')),
  buy_in_amount NUMERIC(30,0) NOT NULL CHECK (buy_in_amount > 0),
  prize_pool NUMERIC(30,0) NOT NULL DEFAULT 0 CHECK (prize_pool >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft','open','in_progress','finished','cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_tournaments_ends_at ON tournaments(ends_at);
CREATE INDEX IF NOT EXISTS idx_tournaments_id_status_dates ON tournaments(id, status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS tournament_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','refunded')),
  payment_reference TEXT,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament ON tournament_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_user ON tournament_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_reference ON tournament_entries(payment_reference) WHERE payment_reference IS NOT NULL;

-- Tabla particionada por fecha de creación para facilitar archivo mensual
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_entry_id UUID REFERENCES tournament_entries(id) ON DELETE SET NULL,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  user_id UUID REFERENCES players(user_id) ON DELETE SET NULL,
  external_reference TEXT NOT NULL UNIQUE,
  payment_type TEXT NOT NULL DEFAULT 'tournament' CHECK (payment_type IN ('quick_match','tournament')),
  provider TEXT NOT NULL,
  token_symbol TEXT NOT NULL CHECK (token_symbol IN ('WLD','USDC','MEMECOIN')),
  amount NUMERIC(30,0) NOT NULL CHECK (amount > 0),
  direction TEXT NOT NULL CHECK (direction IN ('buy_in','payout')),
  status TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::JSONB
) PARTITION BY RANGE (created_at);

-- Partición por defecto para no fallar si no se crea una mensual
CREATE TABLE IF NOT EXISTS payments_default PARTITION OF payments DEFAULT;

CREATE INDEX IF NOT EXISTS idx_payments_entry ON payments(tournament_entry_id);
CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments(status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_external_reference ON payments(external_reference);

CREATE TABLE IF NOT EXISTS tournament_results (
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank > 0),
  prize_amount NUMERIC(30,0) NOT NULL DEFAULT 0 CHECK (prize_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_results_rank ON tournament_results(tournament_id, rank);
