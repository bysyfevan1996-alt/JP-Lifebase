import {createHash} from 'node:crypto';

function up(db){
 db.exec(`CREATE TABLE user_handles(
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,created_at TEXT NOT NULL
 );
 CREATE TABLE community_events(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,event_key TEXT NOT NULL UNIQUE,type TEXT NOT NULL,
  topic_id TEXT NOT NULL REFERENCES topics(id),kind TEXT NOT NULL CHECK(kind IN ('topic','post')),
  content_id TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL
 );
 CREATE INDEX community_events_topic_seq ON community_events(topic_id,seq);
 CREATE TABLE community_notifications(
  id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES community_events(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('mention','quote','reply','reaction','answer')),
  created_at TEXT NOT NULL,read_at TEXT,UNIQUE(event_id,user_id)
 );
 CREATE INDEX community_notifications_recipient ON community_notifications(user_id,created_at DESC,id DESC);
 CREATE TABLE content_mentions(
  kind TEXT NOT NULL CHECK(kind IN ('topic','post')),content_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(kind,content_id,user_id)
 );
 CREATE TABLE topic_subscriptions(
  topic_id TEXT NOT NULL REFERENCES topics(id),user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('watching','tracking','normal','muted')),
  seen_event_seq INTEGER NOT NULL DEFAULT 0 CHECK(seen_event_seq>=0),updated_at TEXT NOT NULL,PRIMARY KEY(topic_id,user_id)
 );
 CREATE TABLE content_reactions(
  kind TEXT NOT NULL CHECK(kind IN ('topic','post')),content_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK(reaction IN ('like','thanks','helpful')),created_at TEXT NOT NULL,
  PRIMARY KEY(kind,content_id,user_id)
 );
 CREATE INDEX content_reactions_target ON content_reactions(kind,content_id,reaction);
 CREATE TABLE topic_bookmarks(
  topic_id TEXT NOT NULL REFERENCES topics(id),user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,PRIMARY KEY(topic_id,user_id)
 );
 CREATE INDEX topic_bookmarks_recipient ON topic_bookmarks(user_id,created_at DESC,topic_id DESC);
 CREATE TABLE topic_answers(
  topic_id TEXT PRIMARY KEY REFERENCES topics(id),post_id TEXT NOT NULL REFERENCES posts(id),
  chosen_by TEXT NOT NULL REFERENCES users(id),chosen_at TEXT NOT NULL
 );`);
}
export const migrationV4={version:4,name:'community-notifications-and-interactions',checksum:createHash('sha256').update(up.toString()).digest('hex'),up};
