import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {applySchema} from '../schema.mjs';
import {changeTopicFlags} from '../topic-state.mjs';

function fixture(filename=':memory:'){
 const db=new DatabaseSync(filename);db.exec('PRAGMA foreign_keys=ON');applySchema(db);
 db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run('admin','Admin','admin@example.test','unused','unused','admin','date');
 db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run('author','Author','author@example.test','unused','unused','member','date');
 db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('topic','Original title','Original body','Original excerpt','daily','author','Author','A','en','created','unchanged');
 db.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?,?)').run('reply','topic','admin','Original reply','Original quote','en','created');
 return db;
}
const admin={id:'admin',role:'admin'},author={id:'author',role:'member'};
test('author removal is reversible, idempotent, audited and cannot restore or pin',()=>{
 const db=fixture();try{
  const topic=db.prepare('SELECT * FROM topics').get();
  for(const input of [{operator:{id:'other',role:'member'},hidden:true,allowAuthor:true},{operator:author,hidden:false,allowAuthor:true},{operator:author,pinned:true,allowAuthor:true}])assert.throws(()=>changeTopicFlags(db,{topicId:'topic',...input}),{code:'forbidden'});
  const input={topicId:'topic',operator:author,hidden:true,allowAuthor:true,action:'author_hide'};
  assert.deepEqual(changeTopicFlags(db,input),{id:'topic',hidden:true,pinned:false});changeTopicFlags(db,input);
  assert.equal(db.prepare('SELECT count(*) n FROM admin_actions').get().n,1);
  assert.equal(db.prepare('SELECT body FROM posts').get().body,'Original reply');
  changeTopicFlags(db,{topicId:'topic',operator:admin,hidden:false});
  assert.deepEqual(db.prepare('SELECT * FROM topics').get(),topic);
  assert.equal(db.prepare('SELECT count(*) n FROM admin_actions').get().n,2);
  db.exec("CREATE TRIGGER audit_rejected BEFORE INSERT ON admin_actions BEGIN SELECT RAISE(ABORT,'audit rejected'); END");
  assert.throws(()=>changeTopicFlags(db,input),/audit rejected/);assert.equal(db.prepare('SELECT hidden FROM topics').get().hidden,0);
 }finally{db.close();}
});
test('operator hide/restore requires an explicit existing admin and never deletes records',async()=>{
 const temporary=new URL('../artifacts/test-tmp/',import.meta.url);await mkdir(temporary,{recursive:true});const directory=await mkdtemp(fileURLToPath(new URL('topic-state-',temporary)));
 const filename=path.join(directory,'test.sqlite');let db;
 try{
  db=fixture(filename);db.close();db=null;
  const run=args=>spawnSync(process.execPath,[fileURLToPath(new URL('../ops/admin.mjs',import.meta.url)),...args],{env:{...process.env,JPL_DB:filename},encoding:'utf8'});
  assert.notEqual(run(['hide-topic','topic']).status,0);
  assert.notEqual(run(['hide-topic','topic','author@example.test']).status,0);
  assert.equal(run(['hide-topic','topic','admin@example.test']).status,0);
  db=new DatabaseSync(filename);assert.equal(db.prepare('SELECT hidden FROM topics').get().hidden,1);assert.equal(db.prepare('SELECT count(*) n FROM posts').get().n,1);db.close();db=null;
  assert.equal(run(['restore-topic','topic','admin@example.test']).status,0);
  db=new DatabaseSync(filename);assert.equal(db.prepare('SELECT hidden FROM topics').get().hidden,0);assert.equal(db.prepare('SELECT count(*) n FROM admin_actions').get().n,2);
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});
