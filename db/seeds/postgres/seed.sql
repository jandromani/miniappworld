-- Datos semilla mínimos para entornos de prueba
INSERT INTO players (user_id, wallet_address, username)
VALUES ('00000000-0000-0000-0000-000000000001', '0xDemoWallet000000000000000000000001', 'demo_player')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO tournaments (id, name, buy_in_token, buy_in_amount, prize_pool, status, starts_at, ends_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Demo Open Tournament',
  'WLD',
  100000000000000000,
  0,
  'open',
  now() + interval '1 day',
  now() + interval '2 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tournament_entries (id, tournament_id, user_id, payment_status, payment_reference, score, finished_at)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000001',
  'paid',
  'demo-buyin-001',
  0,
  NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO payments (id, tournament_entry_id, external_reference, provider, token_symbol, amount, direction, status, created_at, settled_at, metadata)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'demo-buyin-001',
  'mock-provider',
  'WLD',
  100000000000000000,
  'buy_in',
  'succeeded',
  now(),
  now(),
  jsonb_build_object('note', 'seed payment')
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tournament_results (tournament_id, user_id, rank, prize_amount)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000001',
  1,
  0
)
ON CONFLICT (tournament_id, user_id) DO NOTHING;
