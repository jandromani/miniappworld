-- SQLite inicial: jugadores, torneos, inscripciones y pagos
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  user_id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL CHECK (length(username) >= 3),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  buy_in_token TEXT NOT NULL CHECK (buy_in_token IN ('WLD','USDC','MEMECOIN')),
  buy_in_amount INTEGER NOT NULL CHECK (buy_in_amount > 0),
  prize_pool INTEGER NOT NULL DEFAULT 0 CHECK (prize_pool >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft','open','in_progress','finished','cancelled')),
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (julianday(ends_at) > julianday(starts_at))
);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_tournaments_ends_at ON tournaments(ends_at);

CREATE TABLE IF NOT EXISTS tournament_entries (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','refunded')),
  payment_reference TEXT,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  finished_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament ON tournament_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_user ON tournament_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_reference ON tournament_entries(payment_reference) WHERE payment_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tournament_entry_id TEXT REFERENCES tournament_entries(id) ON DELETE SET NULL,
  tournament_id TEXT REFERENCES tournaments(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES players(user_id) ON DELETE SET NULL,
  external_reference TEXT NOT NULL UNIQUE,
  payment_type TEXT NOT NULL DEFAULT 'tournament' CHECK (payment_type IN ('quick_match','tournament')),
  provider TEXT NOT NULL,
  token_symbol TEXT NOT NULL CHECK (token_symbol IN ('WLD','USDC','MEMECOIN')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  direction TEXT NOT NULL CHECK (direction IN ('buy_in','payout')),
  status TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','refunded')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at DATETIME,
  metadata TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_payments_entry ON payments(tournament_entry_id);
CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments(status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_external_reference ON payments(external_reference);

CREATE TABLE IF NOT EXISTS tournament_results (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank > 0),
  prize_amount INTEGER NOT NULL DEFAULT 0 CHECK (prize_amount >= 0),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_results_rank ON tournament_results(tournament_id, rank);
