-- Revertir cambios de 002_transition
DROP TABLE IF EXISTS payments_archive;
DROP INDEX IF EXISTS payments_payouts_recent;
DROP INDEX IF EXISTS payments_one_successful_buyin_default;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_settled_when_succeeded;
