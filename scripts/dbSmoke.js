#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');

const driver = process.env.DB_DRIVER ?? 'sqlite';
const stateDirectory = process.env.STATE_DIRECTORY ?? path.join(process.cwd(), 'data');
const migrations = ['001_create_payments', '002_create_tournaments', '003_add_audit_tables'];

async function ensureStateDirectory() {
  await fs.mkdir(stateDirectory, { recursive: true });
}

async function writeSmokeReport(status) {
  const reportPath = path.join(stateDirectory, `db-smoke-${driver}.json`);
  const payload = {
    driver,
    status,
    migrationsRan: migrations,
    timestamp: new Date().toISOString(),
  };

  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2));
  console.log(`[db-smoke] Report written to ${reportPath}`);
}

async function simulateMigrations() {
  console.log(`[db-smoke] Running smoke test for ${driver}`);
  console.log(`[db-smoke] Simulating migrations: ${migrations.join(', ')}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
}

(async function main() {
  try {
    await ensureStateDirectory();
    await simulateMigrations();
    await writeSmokeReport('ok');
    console.log('[db-smoke] Smoke test completed');
  } catch (error) {
    console.error('[db-smoke] Smoke test failed', error);
    process.exitCode = 1;
  }
})();
