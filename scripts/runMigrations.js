#!/usr/bin/env node
/*
 * Simple migration + seed runner for SQLite/PostgreSQL.
 * Uses the SQL files under db/migrations/<dialect> and db/seeds/<dialect>.
 */
const fs = require('fs/promises');
const path = require('path');

const DIALECT = (process.env.DB_DIALECT ?? 'sqlite').toLowerCase();
const STATE_DIRECTORY = process.env.STATE_DIRECTORY ?? path.join(process.cwd(), 'data');
const SQLITE_FILENAME = process.env.DB_FILENAME ?? 'app.db';
const DATABASE_URL = process.env.DATABASE_URL;
const SEED_ONLY = process.env.DB_SEED_ONLY === 'true';

async function readSqlFiles(folder) {
  const exists = await fs
    .access(folder)
    .then(() => true)
    .catch(() => false);

  if (!exists) return [];

  const files = (await fs.readdir(folder)).filter((file) => file.endsWith('.sql')).sort();
  const contents = await Promise.all(files.map((file) => fs.readFile(path.join(folder, file), 'utf8')));
  return contents;
}

function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function runSqlite(migrations, seeds) {
  const { Database } = require('better-sqlite3');
  await fs.mkdir(STATE_DIRECTORY, { recursive: true });
  const dbPath = path.join(STATE_DIRECTORY, SQLITE_FILENAME);
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  migrations.forEach((sql) => db.exec(sql));
  seeds.forEach((sql) => db.exec(sql));
}

async function runPostgres(migrations, seeds) {
  const { Client } = require('pg');
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const statements = [...migrations, ...seeds]
    .flatMap(splitStatements)
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(statement);
  }

  await client.end();
}

async function main() {
  const migrationsDir = path.join(process.cwd(), 'db', 'migrations', DIALECT);
  const seedsDir = path.join(process.cwd(), 'db', 'seeds', DIALECT);

  const [migrations, seeds] = await Promise.all([readSqlFiles(migrationsDir), readSqlFiles(seedsDir)]);

  console.log(`[migrate] dialect=${DIALECT}`);
  console.log(`[migrate] migrations: ${migrations.length}, seeds: ${seeds.length}, seedOnly=${SEED_ONLY}`);

  if (DIALECT === 'postgres') {
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL is required for postgres');
    }
    await runPostgres(SEED_ONLY ? [] : migrations, seeds);
  } else {
    await runSqlite(SEED_ONLY ? [] : migrations, seeds);
  }

  console.log('[migrate] completed');
}

main().catch((error) => {
  console.error('[migrate] failed', error);
  process.exitCode = 1;
});
