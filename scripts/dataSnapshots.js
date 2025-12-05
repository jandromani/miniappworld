#!/usr/bin/env node
"use strict";

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const SNAPSHOT_ROOT = path.join(DATA_DIR, ".snapshots");
const RESTORE_STAGING_PREFIX = ".restore-staging-";

function parseArgs(rawArgs) {
  const args = rawArgs.slice();
  const command = args.shift();
  const options = {};
  while (args.length) {
    const token = args.shift();
    if (!token.startsWith("--")) {
      continue;
    }
    const [key, value] = token.replace(/^--/, "").split("=");
    if (value !== undefined) {
      options[key] = value;
      continue;
    }
    const next = args[0];
    if (next && !next.startsWith("--")) {
      options[key] = args.shift();
    } else {
      options[key] = true;
    }
  }
  return { command, options };
}

async function ensureDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(SNAPSHOT_ROOT, { recursive: true });
}

async function listSnapshotFolders() {
  try {
    const entries = await fs.readdir(SNAPSHOT_ROOT, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function loadMetadata(snapshotId) {
  const metadataPath = path.join(SNAPSHOT_ROOT, snapshotId, "metadata.json");
  try {
    const content = await fs.readFile(metadataPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function collectStats(targetPath) {
  const hash = crypto.createHash("sha256");
  let fileCount = 0;
  let sizeBytes = 0;

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      const relative = path.relative(targetPath, entryPath);
      if (relative.startsWith("metadata.json")) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile()) {
        fileCount += 1;
        const data = await fs.readFile(entryPath);
        hash.update(relative);
        hash.update(data);
        sizeBytes += data.length;
      }
    }
  }

  await walk(targetPath);

  return {
    fileCount,
    sizeBytes,
    hash: hash.digest("hex"),
  };
}

async function copyDataToSnapshot(destination) {
  const filter = (source) => {
    const relative = path.relative(DATA_DIR, source);
    if (!relative || relative === ".") {
      return true;
    }
    if (relative.startsWith(path.relative(DATA_DIR, SNAPSHOT_ROOT))) {
      return false;
    }
    if (relative.startsWith(RESTORE_STAGING_PREFIX)) {
      return false;
    }
    return true;
  };

  await fs.cp(DATA_DIR, destination, { recursive: true, filter });
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

async function createSnapshot(label) {
  await ensureDirectories();
  const timestamp = new Date().toISOString().replace(/[:]/g, "-");
  const snapshotId = `${timestamp}${label ? `-${label.replace(/\s+/g, "-")}` : ""}`;
  const snapshotPath = path.join(SNAPSHOT_ROOT, snapshotId);
  await fs.mkdir(snapshotPath, { recursive: true });

  await copyDataToSnapshot(snapshotPath);

  const stats = await collectStats(snapshotPath);
  const metadata = {
    id: snapshotId,
    createdAt: new Date().toISOString(),
    label: label || null,
    source: path.relative(ROOT_DIR, DATA_DIR),
    fileCount: stats.fileCount,
    sizeBytes: stats.sizeBytes,
    checksum: stats.hash,
  };
  await fs.writeFile(path.join(snapshotPath, "metadata.json"), JSON.stringify(metadata, null, 2));

  console.log(`Snapshot created: ${snapshotId}`);
  console.log(`Files: ${metadata.fileCount} | Size: ${formatBytes(metadata.sizeBytes)}`);
}

async function listSnapshots() {
  await ensureDirectories();
  const ids = await listSnapshotFolders();
  const snapshots = [];
  for (const id of ids) {
    const metadata = (await loadMetadata(id)) || { id, createdAt: null };
    const stats = metadata.createdAt ? null : await collectStats(path.join(SNAPSHOT_ROOT, id));
    snapshots.push({
      id,
      createdAt: metadata.createdAt,
      label: metadata.label || null,
      fileCount: metadata.fileCount || (stats ? stats.fileCount : null),
      sizeBytes: metadata.sizeBytes || (stats ? stats.sizeBytes : null),
    });
  }

  snapshots.sort((a, b) => (b.createdAt || "")?.localeCompare(a.createdAt || ""));

  if (!snapshots.length) {
    console.log("No hay snapshots todavía. Ejecuta 'create' para generar uno.");
    return;
  }

  console.log("Snapshots disponibles (ordenados por fecha de creación):");
  snapshots.forEach((snap) => {
    const sizeLabel = snap.sizeBytes != null ? formatBytes(snap.sizeBytes) : "--";
    console.log(`- ${snap.id} | ${snap.createdAt || "fecha desconocida"} | ${sizeLabel} | etiqueta: ${snap.label || "(sin etiqueta)"}`);
  });
}

async function resolveSnapshotId(preference) {
  if (preference && preference !== "latest") {
    return preference;
  }
  const ids = await listSnapshotFolders();
  if (!ids.length) {
    throw new Error("No hay snapshots disponibles para restaurar.");
  }
  const decorated = await Promise.all(
    ids.map(async (id) => {
      const metadata = await loadMetadata(id);
      return { id, createdAt: metadata?.createdAt || "" };
    })
  );
  decorated.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return decorated[0].id;
}

async function clearDataDirectory() {
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === path.basename(SNAPSHOT_ROOT)) {
      continue;
    }
    if (entry.name.startsWith(RESTORE_STAGING_PREFIX)) {
      continue;
    }
    await fs.rm(path.join(DATA_DIR, entry.name), { recursive: true, force: true });
  }
}

async function restoreSnapshot(preference) {
  await ensureDirectories();
  const snapshotId = await resolveSnapshotId(preference);
  const snapshotPath = path.join(SNAPSHOT_ROOT, snapshotId);
  const snapshotExists = await fs
    .stat(snapshotPath)
    .then((stat) => stat.isDirectory())
    .catch(() => false);
  if (!snapshotExists) {
    throw new Error(`Snapshot '${snapshotId}' no encontrado en ${SNAPSHOT_ROOT}`);
  }

  const stagingDir = path.join(DATA_DIR, `${RESTORE_STAGING_PREFIX}${Date.now()}`);
  await fs.mkdir(stagingDir, { recursive: true });
  await fs.cp(snapshotPath, stagingDir, {
    recursive: true,
    filter: (source) => path.basename(source) !== "metadata.json",
  });

  await clearDataDirectory();
  await fs.cp(stagingDir, DATA_DIR, { recursive: true });
  await fs.rm(stagingDir, { recursive: true, force: true });

  console.log(`Restaurado snapshot '${snapshotId}' en ${path.relative(ROOT_DIR, DATA_DIR)}`);
}

async function verifySnapshot(maxAgeHours = 24) {
  await ensureDirectories();
  const snapshotId = await resolveSnapshotId("latest");
  const metadata = await loadMetadata(snapshotId);
  if (!metadata?.createdAt) {
    throw new Error("El snapshot más reciente no tiene metadata; crea uno nuevo antes de desplegar.");
  }
  const createdAt = new Date(metadata.createdAt);
  const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  if (Number.isNaN(ageHours)) {
    throw new Error("No se pudo interpretar la fecha de creación del snapshot más reciente.");
  }
  if (ageHours > maxAgeHours) {
    throw new Error(
      `El snapshot más reciente (${metadata.id}) tiene ${ageHours.toFixed(1)}h; genera uno más fresco (< ${maxAgeHours}h) antes de desplegar.`
    );
  }
  console.log(
    `Snapshot OK para deploy: ${metadata.id} (${ageHours.toFixed(1)}h de antigüedad, ${metadata.fileCount} archivos, ${formatBytes(
      metadata.sizeBytes || 0
    )}).`
  );
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  try {
    switch (command) {
      case "create":
        await createSnapshot(options.label || options.tag || null);
        break;
      case "list":
        await listSnapshots();
        break;
      case "restore":
        await restoreSnapshot(options.snapshot || options.id || options.latest ? options.snapshot || options.id || "latest" : null);
        break;
      case "verify": {
        const maxAge = options["max-age-hours"] || options.maxAgeHours || options.maxAge;
        const parsed = maxAge ? Number(maxAge) : 24;
        await verifySnapshot(parsed);
        break;
      }
      default:
        console.log("Uso: node scripts/dataSnapshots.js <command> [options]");
        console.log("Commands:");
        console.log("  create [--label <texto>]");
        console.log("  list");
        console.log("  restore [--snapshot <id>|--id <id>|--latest]");
        console.log("  verify [--max-age-hours <n>]");
        process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
