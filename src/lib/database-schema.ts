export const databaseSchema = `
CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), role TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS records_scope ON records(workspace,kind,created_at);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), role TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS audit_scope ON audit(workspace,created_at);
CREATE TABLE IF NOT EXISTS idempotency(workspace TEXT NOT NULL REFERENCES workspaces(id), key TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(workspace,key));
INSERT OR IGNORE INTO migrations VALUES(1,datetime('now'));
`;
