import { createHash } from 'node:crypto';

function up(db) {
  // Add banned/muted to users if missing
  const usersColumns = db.prepare('PRAGMA table_info(users)').all();
  const bannedExists = usersColumns.some(col => col.name === 'banned');
  const mutedExists = usersColumns.some(col => col.name === 'muted');
  
  if (!bannedExists) db.exec(`ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0 CHECK (banned IN (0,1))`);
  if (!mutedExists) db.exec(`ALTER TABLE users ADD COLUMN muted INTEGER NOT NULL DEFAULT 0 CHECK (muted IN (0,1))`);

  // Create user_preferences table if not exists
  db.exec(`CREATE TABLE IF NOT EXISTS user_preferences (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, language TEXT NOT NULL, updated_at TEXT NOT NULL)`);

  // Modify reports table
  const reportsColumns = db.prepare('PRAGMA table_info(reports)').all();
  const hasStatus = reportsColumns.some(col => col.name === 'status');
  const hasReviewedBy = reportsColumns.some(col => col.name === 'reviewed_by');
  const hasReviewedAt = reportsColumns.some(col => col.name === 'reviewed_at');

  if (!hasStatus) {
    db.exec(`ALTER TABLE reports ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed'))`);
  }

  if (!hasReviewedBy) {
    db.exec(`ALTER TABLE reports ADD COLUMN reviewed_by TEXT REFERENCES users(id)`);
  }

  if (!hasReviewedAt) {
    db.exec(`ALTER TABLE reports ADD COLUMN reviewed_at TEXT`);
  }

  // Create index on reports_status_created
  db.exec(`CREATE INDEX IF NOT EXISTS reports_status_created ON reports(status, created_at, id)`);
}

export const migrationV2 = {
  version: 2,
  name: 'community-preferences-moderation',
  checksum: createHash('sha256').update(up.toString()).digest('hex'),
  up
};
