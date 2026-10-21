// Frozen adoption of the pre-M0 schema. Append migrations; do not edit version 1.
import {createHash} from 'node:crypto';
import {runMigrations} from './migrations.mjs';
const coreSchema=`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS topics(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,excerpt TEXT NOT NULL,category TEXT NOT NULL,user_id TEXT REFERENCES users(id),author TEXT NOT NULL,avatar TEXT NOT NULL,tone INTEGER NOT NULL DEFAULT 0,pinned INTEGER NOT NULL DEFAULT 0,language TEXT NOT NULL,seed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,quote TEXT,language TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS posts_topic ON posts(topic_id,created_at);
CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS translations(cache_key TEXT PRIMARY KEY,value TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS translation_usage(day TEXT PRIMARY KEY,characters INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,topic_id TEXT NOT NULL,user_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
`;
function legacyAuth(db){
 const columns=new Set(db.prepare('PRAGMA table_info(users)').all().map(c=>c.name));
 for(const [name,type] of Object.entries({email_verified_at:'TEXT',legacy_account:'INTEGER NOT NULL DEFAULT 1',password_version:'INTEGER NOT NULL DEFAULT 1',avatar_data:'BLOB',avatar_hash:'TEXT'}))if(!columns.has(name))db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
 db.exec(`CREATE TABLE IF NOT EXISTS auth_challenges(id TEXT PRIMARY KEY,email TEXT NOT NULL,purpose TEXT NOT NULL,user_id TEXT,code_hash TEXT NOT NULL,expires INTEGER NOT NULL,resend_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 0,eligible INTEGER NOT NULL DEFAULT 1,language TEXT NOT NULL DEFAULT 'en');
 CREATE INDEX IF NOT EXISTS auth_challenge_email ON auth_challenges(email,purpose);
 CREATE TABLE IF NOT EXISTS auth_flows(token_hash TEXT PRIMARY KEY,challenge_id TEXT NOT NULL,step TEXT NOT NULL DEFAULT 'code',expires INTEGER NOT NULL,grant_expires INTEGER);
 CREATE TABLE IF NOT EXISTS auth_send_state(scope TEXT PRIMARY KEY,resend_at INTEGER NOT NULL DEFAULT 0,lock_until INTEGER NOT NULL DEFAULT 0,lock_token TEXT);
 CREATE TABLE IF NOT EXISTS auth_mail_usage(id TEXT PRIMARY KEY,email_hash TEXT NOT NULL,ip_hash TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS auth_mail_usage_time ON auth_mail_usage(created_at);`);
 if(!db.prepare('PRAGMA table_info(auth_challenges)').all().some(c=>c.name==='language'))db.exec("ALTER TABLE auth_challenges ADD COLUMN language TEXT NOT NULL DEFAULT 'en'");
}

function legacyPosting(db){
 const columns=new Set(db.prepare('PRAGMA table_info(topics)').all().map(column=>column.name));
 if(!columns.has('body_format'))db.exec("ALTER TABLE topics ADD COLUMN body_format TEXT NOT NULL DEFAULT 'plain' CHECK(body_format IN ('plain','markdown'))");
 db.exec(`CREATE TABLE IF NOT EXISTS topic_create_requests(
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL,payload_hash TEXT NOT NULL,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,client_request_id)
 );
 CREATE TABLE IF NOT EXISTS topic_tags(topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,tag_id TEXT NOT NULL,PRIMARY KEY(topic_id,tag_id));
 CREATE INDEX IF NOT EXISTS topic_tags_filter ON topic_tags(tag_id,topic_id);`);
}


function legacyAdmin(db){
 const columns=new Set(db.prepare('PRAGMA table_info(topics)').all().map(column=>column.name));
 if(!columns.has('hidden'))db.exec('ALTER TABLE topics ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
 db.exec(`CREATE INDEX IF NOT EXISTS topics_visibility_updated ON topics(hidden,updated_at);
 CREATE TABLE IF NOT EXISTS admin_actions(
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL,topic_id TEXT NOT NULL,
  action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL
 );`);
}
function legacyAttachments(db){
 db.exec(`CREATE TABLE IF NOT EXISTS topic_attachments(
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,upload_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,bytes BLOB NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,
  created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id,upload_id)
 );`);
 if(!db.prepare('PRAGMA table_info(topic_attachments)').all().some(c=>c.name==='position'))db.exec('ALTER TABLE topic_attachments ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
 db.exec(`CREATE INDEX IF NOT EXISTS topic_attachments_pending ON topic_attachments(user_id,expires_at) WHERE topic_id IS NULL;
 CREATE INDEX IF NOT EXISTS topic_attachments_topic ON topic_attachments(topic_id,position);`);
}
function baseline(db){
 db.exec(coreSchema);legacyAuth(db);legacyAdmin(db);legacyPosting(db);legacyAttachments(db);
 db.exec('CREATE TABLE IF NOT EXISTS denki_datasets(version TEXT PRIMARY KEY,sha256 TEXT NOT NULL,payload TEXT NOT NULL,imported_at TEXT NOT NULL)');
}
const checksum=createHash('sha256').update([coreSchema,legacyAuth.toString(),legacyAdmin.toString(),legacyPosting.toString(),legacyAttachments.toString(),baseline.toString()].join('\n')).digest('hex');
import {migrationV2} from './migration-v2.mjs';
export const migrations=Object.freeze([{version:1,name:'existing-community-baseline',checksum,up:baseline},migrationV2]);
export const SCHEMA_VERSION=2;
export function applySchema(db){return runMigrations(db,migrations);}
