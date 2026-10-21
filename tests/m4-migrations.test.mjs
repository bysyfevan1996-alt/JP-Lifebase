import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {runMigrations} from '../migrations.mjs';
import {applySchema,migrations,SCHEMA_VERSION} from '../schema.mjs';

const frozen=[
 'dbf6ec323e5550109b9722617341c9222155bf2ed5cd800f71504a7a0cb76940',
 '2c1a99efbab0bee6f50d577bda04147534981d3b816ef416d39f157101f9b024',
 '861376274b820af6c8d434bc3cf5a8688f8b803d6678275472c477e3fae42aa0',
];
test('M4 appends migration4 without rewriting legacy users, sessions, revisions, attachments or frozen ledger',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');try{
  assert.deepEqual(migrations.slice(0,3).map(item=>item.checksum),frozen);runMigrations(db,migrations.slice(0,3));
  const date='2026-01-01T00:00:00Z';
  db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run('legacy','Original Name','original@example.test','hash-original','salt-original','admin',date);
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run('original-token-hash','legacy',9999999999999);
  db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('t','Original title','Original body','Excerpt','daily','legacy','Original Name','O','ja',date,date);
  db.prepare('INSERT INTO posts(id,topic_id,user_id,body,language,created_at) VALUES(?,?,?,?,?,?)').run('p','t','legacy','Original reply','en',date);
  db.prepare('INSERT INTO content_revisions(kind,content_id,version,title,body,body_format,language,editor_id,edited_at) VALUES(?,?,?,?,?,?,?,?,?)').run('topic','t',1,'Original title','Original body','plain','ja','legacy',date);
  db.prepare('INSERT INTO topic_attachments(id,user_id,topic_id,post_id,upload_id,payload_hash,bytes,width,height,created_at,expires_at,position) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('a','legacy','t','p','upload','digest',Buffer.from([1,2,3]),1,1,123,456,0);
  const tables=['users','sessions','topics','posts','content_revisions','topic_attachments'],before=Object.fromEntries(tables.map(table=>[table,db.prepare('SELECT * FROM '+table).all()]));
  const ledger=db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  assert.equal(SCHEMA_VERSION,4);assert.deepEqual(applySchema(db),{version:4,applied:[4]});
  for(const table of tables)assert.deepEqual(db.prepare('SELECT * FROM '+table).all(),before[table],table);
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations WHERE version<=3 ORDER BY version').all(),ledger);assert.deepEqual(applySchema(db),{version:4,applied:[]});
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('SELECT count(*) AS n FROM community_notifications').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM community_events').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM user_handles').get().n,0);
 }finally{db.close();}
});

test('M4 unique constraints reject duplicate reactions, subscriptions and event recipients',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');try{
  applySchema(db);const date='2026-01-01T00:00:00Z';db.prepare('INSERT INTO users(id,name,email,password,salt,created_at) VALUES(?,?,?,?,?,?)').run('u','User','u@example.test','hash','salt',date);db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('t','Title','Body','Excerpt','daily','u','User','U','en',date,date);
  db.prepare('INSERT INTO user_handles(user_id,handle,created_at) VALUES(?,?,?)').run('u','u_unique',date);
  db.prepare('INSERT INTO community_events(id,event_key,type,topic_id,kind,content_id,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run('e','unique-event','reply','t','topic','t','u',date);
  db.prepare('INSERT INTO community_notifications(id,event_id,user_id,type,created_at) VALUES(?,?,?,?,?)').run('n','e','u','reply',date);assert.throws(()=>db.prepare('INSERT INTO community_notifications(id,event_id,user_id,type,created_at) VALUES(?,?,?,?,?)').run('n2','e','u','mention',date));
  db.prepare('INSERT INTO content_reactions(kind,content_id,user_id,reaction,created_at) VALUES(?,?,?,?,?)').run('topic','t','u','like',date);assert.throws(()=>db.prepare('INSERT INTO content_reactions(kind,content_id,user_id,reaction,created_at) VALUES(?,?,?,?,?)').run('topic','t','u','helpful',date));
  db.prepare('INSERT INTO topic_subscriptions(topic_id,user_id,mode,updated_at) VALUES(?,?,?,?)').run('t','u','tracking',date);assert.throws(()=>db.prepare('INSERT INTO topic_subscriptions(topic_id,user_id,mode,updated_at) VALUES(?,?,?,?)').run('t','u','watching',date));assert.throws(()=>db.prepare("UPDATE topic_subscriptions SET mode='invalid'").run());
 }finally{db.close();}
});
