-- Datos semilla mínimos para SQLite
INSERT OR IGNORE INTO players (user_id, wallet_address, username)
VALUES ('player-demo-1', '0xDemoWallet000000000000000000000001', 'demo_player');

INSERT OR IGNORE INTO tournaments (id, name, buy_in_token, buy_in_amount, prize_pool, status, starts_at, ends_at)
VALUES (
  'tournament-demo-1',
  'Demo Open Tournament',
  'WLD',
  100000000000000000,
  0,
  'open',
  datetime('now', '+1 day'),
  datetime('now', '+2 day')
);

INSERT OR IGNORE INTO tournament_entries (id, tournament_id, user_id, payment_status, score, finished_at)
VALUES (
  'entry-demo-1',
  'tournament-demo-1',
  'player-demo-1',
  'paid',
  0,
  NULL
);

INSERT OR IGNORE INTO payments (id, tournament_entry_id, external_reference, provider, token_symbol, amount, direction, status, created_at, settled_at, metadata)
VALUES (
  'payment-demo-1',
  'entry-demo-1',
  'demo-buyin-001',
  'mock-provider',
  'WLD',
  100000000000000000,
  'buy_in',
  'succeeded',
  datetime('now'),
  datetime('now'),
  json('{"note":"seed payment"}')
);

INSERT OR IGNORE INTO tournament_results (tournament_id, user_id, rank, prize_amount)
VALUES (
  'tournament-demo-1',
  'player-demo-1',
  1,
  0
);
