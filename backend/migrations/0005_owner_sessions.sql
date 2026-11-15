-- Short-lived owner sessions for activation-code-only Watchnow logins.
CREATE TABLE IF NOT EXISTS owner_sessions (
  token_hash TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES owners(uid) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_owner_sessions_owner ON owner_sessions(owner_uid, expires_at);
