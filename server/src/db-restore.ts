// Staged database restore.
//
// better-sqlite3's online backup can only write to a file destination, and a
// live WAL connection would overwrite any file swapped underneath it. So a
// restore is staged here and applied at boot, before the database is opened:
// the current live database is copied to data/backups first, then the staged
// snapshot becomes julie.db and the WAL/SHM sidecars are cleared.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const MARKER = path.join(config.dataDir, "restore-pending.json");
const STAGED = path.join(config.dataDir, "julie-restore-staged.db");

function backupFileToStaged(file: string): string {
  const src = path.join(config.dataDir, "backups", file);
  if (!fs.existsSync(src)) throw new Error("backup not found");
  return src;
}

// Called by the restore route: copy the chosen snapshot to the staging path
// and record it. Nothing destructive happens to the live database here.
export function stageRestore(file: string): void {
  if (!/^[a-zA-Z0-9._-]+\.db$/.test(file)) throw new Error("invalid filename");
  const src = backupFileToStaged(file);
  fs.copyFileSync(src, STAGED);
  try { fs.chmodSync(STAGED, 0o600); } catch { /* best effort */ }
  fs.writeFileSync(MARKER, JSON.stringify({ file, stagedAt: new Date().toISOString() }), { mode: 0o600 });
}

export function pendingRestore(): string | null {
  if (!fs.existsSync(MARKER)) return null;
  if (!fs.existsSync(STAGED)) {
    fs.rmSync(MARKER, { force: true });
    return null;
  }
  try {
    const marker = JSON.parse(fs.readFileSync(MARKER, "utf8"));
    return typeof marker.file === "string" ? marker.file : "staged snapshot";
  } catch {
    return "staged snapshot";
  }
}

// Called from db.ts before the live Database is constructed. Returns the
// restored filename when a staged restore was applied, otherwise null.
export function applyStagedRestore(): string | null {
  if (!fs.existsSync(MARKER)) return null;
  if (!fs.existsSync(STAGED)) {
    fs.rmSync(MARKER, { force: true });
    return null;
  }
  let restoredFile = "staged snapshot";
  try {
    const marker = JSON.parse(fs.readFileSync(MARKER, "utf8"));
    if (typeof marker.file === "string") restoredFile = marker.file;
  } catch { /* keep generic label */ }

  // Safety copy of the database being replaced.
  if (fs.existsSync(config.dbPath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safetyDir = path.join(config.dataDir, "backups");
    fs.mkdirSync(safetyDir, { recursive: true, mode: 0o700 });
    const safety = path.join(safetyDir, `pre-restore-${stamp}.db`);
    fs.copyFileSync(config.dbPath, safety);
    try { fs.chmodSync(safety, 0o600); } catch { /* best effort */ }
  }

  fs.renameSync(STAGED, config.dbPath);
  for (const suffix of ["-wal", "-shm"]) {
    fs.rmSync(`${config.dbPath}${suffix}`, { force: true });
  }
  try { fs.chmodSync(config.dbPath, 0o600); } catch { /* best effort */ }
  fs.rmSync(MARKER, { force: true });
  return restoredFile;
}
