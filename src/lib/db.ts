import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setDatabaseFactory } from "./repository";
export * from "./repository";

let connection: DatabaseSync | undefined;
function localDatabase() {
  if (!connection) {
    if (process.env.VERCEL)
      throw new Error(
        "SQLite local adapter cannot run on Vercel. Configure a cloud database adapter first.",
      );
    const path = process.env.DATABASE_PATH || resolve("data/agentops.sqlite");
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    connection = new DatabaseSync(path);
    connection.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), role TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS records_scope ON records(workspace,kind,created_at);
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), role TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS audit_scope ON audit(workspace,created_at);
      CREATE TABLE IF NOT EXISTS idempotency(workspace TEXT NOT NULL REFERENCES workspaces(id), key TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(workspace,key));
      INSERT OR IGNORE INTO migrations VALUES(1,datetime('now'));`);
  }
  return connection;
}

setDatabaseFactory(localDatabase);
