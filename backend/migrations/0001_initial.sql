-- Partypark central Drive photo-backup schema
-- Apply once to the Cloudflare D1 database bound as env.DB.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS owners (
  uid TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS activation_codes (
  code_hash TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES owners(uid) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_activation_owner ON activation_codes(owner_uid);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES owners(uid) ON DELETE CASCADE,
  device_name TEXT NOT NULL DEFAULT 'Android device',
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_devices_owner ON devices(owner_uid);

CREATE TABLE IF NOT EXISTS photos (
  photo_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES owners(uid) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  byte_size INTEGER NOT NULL DEFAULT 0,
  captured_at INTEGER,
  uploaded_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('uploading','ready','delete_pending'))
);
CREATE INDEX IF NOT EXISTS idx_photos_owner_device ON photos(owner_uid, device_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_expiry ON photos(expires_at);

CREATE TABLE IF NOT EXISTS upload_sessions (
  session_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES owners(uid) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  drive_session_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_upload_expiry ON upload_sessions(expires_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
