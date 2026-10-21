import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {runMigrations,schemaVersion} from '../migrations.mjs';
import {applySchema,migrations} from '../schema.mjs';

const migration=(version,up,extra={})=>({version,name:'step-'+version,checksum:String(version).repeat(64),up,...extra});
const fresh=()=>{const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');return db;};
test('migrations adopt existing records once and append a later version without rewriting the ledger',()=>{
 const db=fresh();try{
  assert.equal(schemaVersion(db),0);
  db.exec('CREATE TABLE existing(id TEXT PRIMARY KEY,value BLOB); INSERT INTO existing VALUES(\'old\',X\'010203\')');
  const steps=[migration(1,db=>db.exec('ALTER TABLE existing ADD COLUMN extra TEXT'))];
  assert.deepEqual(runMigrations(db,steps),{version:1,applied:[1]});
  const old=db.prepare('SELECT * FROM schema_migrations').get();
  assert.deepEqual(runMigrations(db,steps),{version:1,applied:[]});
  steps.push(migration(2,db=>db.exec('CREATE TABLE another(id TEXT)')));
  assert.deepEqual(runMigrations(db,steps),{version:2,applied:[2]});
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations WHERE version=1').get(),old);
  assert.equal(Buffer.from(db.prepare('SELECT value FROM existing').get().value).toString('hex'),'010203');
  assert.equal(schemaVersion(db),2);
 }finally{db.close();}
});
test('migration errors roll back all pending DDL and ledger entries',()=>{
 const db=fresh();try{
  assert.throws(()=>runMigrations(db,[migration(1,db=>db.exec('CREATE TABLE rolled_back(id TEXT)')),migration(2,()=>{throw Error('fixture failure');})]),/fixture failure/);
  assert.equal(schemaVersion(db),0);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('schema_migrations','rolled_back')").all().length,0);
  assert.throws(()=>runMigrations(db,[migration(1,()=>Promise.resolve())]));
  assert.equal(schemaVersion(db),0);
 }finally{db.close();}
});
test('changed, future and gapped migration ledgers fail closed without altering existing data',()=>{
 const db=fresh();try{
  const steps=[migration(1,db=>db.exec('CREATE TABLE preserved(id INTEGER);INSERT INTO preserved VALUES(7)'))];
  runMigrations(db,steps);
  const before=db.prepare('SELECT * FROM schema_migrations').all();
  for(const bad of [[{...steps[0],checksum:'a'.repeat(64)}],[{...steps[0],name:'renamed'}],[],[steps[0],migration(3,()=>{})]]){
   assert.throws(()=>runMigrations(db,bad));assert.deepEqual(db.prepare('SELECT * FROM schema_migrations').all(),before);
   assert.equal(db.prepare('SELECT id FROM preserved').get().id,7);
  }
  db.prepare('INSERT INTO schema_migrations VALUES(?,?,?,?)').run(3,'step-3','3'.repeat(64),'test');
  assert.throws(()=>runMigrations(db,[...steps,migration(2,()=>{}),migration(3,()=>{})]));
 }finally{db.close();}
});
test('migration validation and foreign-key safety happen before a baseline is committed',()=>{
 const db=fresh();try{
  for(const bad of [null,{},[migration(2,()=>{})],[migration(1,null)],[migration(1,()=>{},{checksum:'bad'})]])assert.throws(()=>runMigrations(db,bad));
  assert.equal(schemaVersion(db),0);
  db.exec('PRAGMA foreign_keys=OFF');assert.throws(()=>runMigrations(db,[migration(1,()=>{})]));
  db.exec('CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES(99); PRAGMA foreign_keys=ON');
  assert.throws(()=>runMigrations(db,[migration(1,()=>{})]));assert.equal(schemaVersion(db),0);
 }finally{db.close();}
});
test('frozen community baseline preserves legacy passwords, sessions, original posts and repeats safely',()=>{
 const db=fresh();try{
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',created_at TEXT NOT NULL);INSERT INTO users VALUES('legacy','Legacy','legacy@example.test','original-hash','original-salt','admin','2026-01-01')");
  const old=db.prepare('SELECT * FROM users').get();
  assert.deepEqual(applySchema(db),{version:4,applied:[1,2,3,4]});
  for(const [key,value]of Object.entries(old))assert.equal(db.prepare('SELECT * FROM users').get()[key],value);
  assert.deepEqual(applySchema(db),{version:4,applied:[]});
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db.close();}
});

test('M3 appends to an exact schema2 ledger without changing existing content or legacy language',()=>{
 const db=fresh();try{
  runMigrations(db,migrations.slice(0,2));
  db.prepare('INSERT INTO users(id,name,email,password,salt,created_at) VALUES(?,?,?,?,?,?)').run('u','User','u@example.test','password-original','salt-original','created');
  db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('t','Original title','Original **literal** body','Excerpt','daily','u','User','U','ja','created','updated');
  db.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?,?)').run('p','t','u','Original reply','Legacy quote','en','created');
  const beforeTopic=db.prepare('SELECT * FROM topics').get(),beforePost=db.prepare('SELECT * FROM posts').get(),beforeLedger=db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  assert.deepEqual(applySchema(db),{version:4,applied:[3,4]});
  for(const [table,before]of [['topics',beforeTopic],['posts',beforePost]]){const after=db.prepare('SELECT * FROM '+table).get();for(const [key,value]of Object.entries(before))assert.deepEqual(after[key],value);assert.equal(after.content_version,1);assert.equal(after.edited_at,null);}
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations WHERE version<3 ORDER BY version').all(),beforeLedger);
  assert.deepEqual(applySchema(db),{version:4,applied:[]});
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});
