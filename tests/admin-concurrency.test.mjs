import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applySchema} from '../schema.mjs';
import {createCommunityAdmin} from '../community-admin.mjs';

test('management writes recheck identity after a suspended request body before changing records',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');applySchema(db);
 const error=(status,code)=>Object.assign(new Error(code),{status,code});
 try{
  for(const id of ['admin','other'])db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.test','unused','unused','admin','date');
  db.prepare('INSERT INTO topics(id,title,body,excerpt,category,author,avatar,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('topic','Title','Body','Excerpt','daily','Author','A','en','date','date');
  db.prepare('INSERT INTO reports(id,topic_id,user_id,reason,created_at) VALUES(?,?,?,?,?)').run('report','topic','admin','Unchanged private reason','date');
  for(const [route,input]of [['topics/topic',{hidden:true}],['reports/report',{status:'resolved'}],['users/other',{muted:true}]])for(const mode of ['revoked','logout','switched']){
   db.exec("UPDATE users SET role='admin'");let current='admin',active=true,resolve;
   const body=new Promise(done=>resolve=done);
   const manager=createCommunityAdmin({db,migrate:false,body:()=>body,json:()=>{throw Error('Unexpected success');},httpError:error,userRequired:()=>{
    if(!active)throw error(401,'login_required');return db.prepare('SELECT id,role FROM users WHERE id=?').get(current);
   },policy:{setUserRestrictions:()=>{throw Error('Forbidden write reached policy');}}});
   const pending=manager.handle({method:'POST'},{},new URL('http://localhost/api/admin/'+route));
   if(mode==='revoked')db.exec("UPDATE users SET role='member' WHERE id='admin'");
   else if(mode==='logout')active=false;else current='other';
   resolve(input);await assert.rejects(pending,{code:mode==='revoked'?'forbidden':mode==='logout'?'login_required':'account_changed'});
   assert.equal(db.prepare('SELECT hidden FROM topics').get().hidden,0);assert.equal(db.prepare('SELECT status FROM reports').get().status,'open');assert.equal(db.prepare('SELECT count(*) n FROM admin_actions').get().n,0);
  }
 }finally{db.close();}
});
