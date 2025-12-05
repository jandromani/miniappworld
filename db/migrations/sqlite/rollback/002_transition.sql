-- Revertir transición SQLite
DROP TABLE IF EXISTS payments_archive;
DROP INDEX IF EXISTS payments_one_successful_buyin;
DROP TRIGGER IF EXISTS payments_require_settled_at;
DROP TRIGGER IF EXISTS payments_require_settled_at_update;
