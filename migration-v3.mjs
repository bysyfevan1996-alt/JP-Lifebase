import {createHash} from 'node:crypto';

function up(db){
 db.exec(`ALTER TABLE topics ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1 CHECK(content_version>=1);
 ALTER TABLE topics ADD COLUMN edited_at TEXT;
 ALTER TABLE topics ADD COLUMN release_order INTEGER;
 ALTER TABLE posts ADD COLUMN body_format TEXT NOT NULL DEFAULT 'plain' CHECK(body_format IN ('plain','markdown'));
 ALTER TABLE posts ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1 CHECK(content_version>=1);
 ALTER TABLE posts ADD COLUMN edited_at TEXT;
 ALTER TABLE posts ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1));
 ALTER TABLE topic_attachments ADD COLUMN post_id TEXT REFERENCES posts(id);
 CREATE INDEX posts_visible_topic ON posts(topic_id,hidden,created_at,id);
 CREATE INDEX attachments_post ON topic_attachments(post_id,position);
 CREATE TABLE content_revisions(
  kind TEXT NOT NULL CHECK(kind IN ('topic','post')),content_id TEXT NOT NULL,version INTEGER NOT NULL,
  title TEXT,body TEXT NOT NULL,body_format TEXT NOT NULL,language TEXT NOT NULL,
  editor_id TEXT REFERENCES users(id),edited_at TEXT NOT NULL,PRIMARY KEY(kind,content_id,version)
 );
 CREATE TABLE content_quotes(
  post_id TEXT NOT NULL REFERENCES posts(id),position INTEGER NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('topic','post')),source_id TEXT NOT NULL,
  source_topic_id TEXT NOT NULL REFERENCES topics(id),source_version INTEGER NOT NULL,
  excerpt TEXT NOT NULL,PRIMARY KEY(post_id,position)
 );
 CREATE TABLE reply_create_requests(
  user_id TEXT NOT NULL REFERENCES users(id),client_request_id TEXT NOT NULL,payload_hash TEXT NOT NULL,
  post_id TEXT NOT NULL REFERENCES posts(id),created_at TEXT NOT NULL,PRIMARY KEY(user_id,client_request_id)
 );
 CREATE TABLE content_translations(
  kind TEXT NOT NULL,content_id TEXT NOT NULL,version INTEGER NOT NULL,target TEXT NOT NULL,
  source_language TEXT NOT NULL,rules_version TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,
  PRIMARY KEY(kind,content_id,version,target,source_language,rules_version)
 );
 CREATE TABLE content_translation_quotas(
  principal TEXT NOT NULL,day TEXT NOT NULL,requests INTEGER NOT NULL DEFAULT 0,characters INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(principal,day)
 );`);
}
export const migrationV3={version:3,name:'content-revisions-quotes-translations',checksum:createHash('sha256').update(up.toString()).digest('hex'),up};
