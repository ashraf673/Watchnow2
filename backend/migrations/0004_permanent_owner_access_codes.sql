-- Permanent owner access codes. The code hash is reusable until the owner replaces it.
CREATE TABLE IF NOT EXISTS owner_access_codes (
  owner_uid TEXT PRIMARY KEY REFERENCES owners(uid) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
