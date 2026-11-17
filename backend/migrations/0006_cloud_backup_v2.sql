-- Cloud Backup v2 foundation: variants share one photo row; commands survive device offline periods.
ALTER TABLE photos ADD COLUMN original_drive_file_id TEXT;
ALTER TABLE photos ADD COLUMN original_byte_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN original_uploaded_at INTEGER;
ALTER TABLE photos ADD COLUMN thumbnail_byte_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN original_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE upload_sessions ADD COLUMN photo_id TEXT;
ALTER TABLE upload_sessions ADD COLUMN asset_type TEXT NOT NULL DEFAULT 'thumbnail' CHECK (asset_type IN ('thumbnail','original'));
CREATE TABLE IF NOT EXISTS device_commands (
 command_id TEXT PRIMARY KEY,
 owner_uid TEXT NOT NULL REFERENCES owners(uid) ON DELETE CASCADE,
 device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
 action TEXT NOT NULL CHECK (action IN ('upload_all','cancel_all','upload_selected')),
 payload_json TEXT NOT NULL DEFAULT '{}',
 created_at INTEGER NOT NULL,
 delivered_at INTEGER,
 applied_at INTEGER,
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','applied'))
);
CREATE INDEX IF NOT EXISTS idx_device_commands_pending ON device_commands(device_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_photos_original_pending ON photos(owner_uid,device_id,original_pending,captured_at);
