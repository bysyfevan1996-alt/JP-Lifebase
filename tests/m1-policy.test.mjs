import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {migrations,applySchema} from '../schema.mjs';
import {runMigrations} from '../migrations.mjs';
import {migrationV2} from '../migration-v2.mjs';
import {createCommunityPolicy} from '../community-policy.mjs';
import {createAuth} from '../auth.mjs';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import {crc32,deflateSync} from 'node:zlib';
import {createTopicAttachments} from '../topic-attachments.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

async function removeTemporary(directory){
 const parent=path.resolve(fileURLToPath(new URL('../artifacts/test-tmp/',import.meta.url)));
 assert(path.resolve(directory).startsWith(parent+path.sep+'m1-'));
 await rm(directory,{recursive:true,force:true});
}

function baseline(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');runMigrations(db,[migrations[0]]);
 db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run('member','Member','member@example.test','original-hash','original-salt','member','2026-01-01');
 db.prepare('INSERT INTO reports(id,topic_id,user_id,reason,created_at) VALUES(?,?,?,?,?)').run('report','topic','member','Original reason','2026-01-01');
 return db;
}

test('M1 appends migration 2 preserving the exact v1 ledger and existing user/report values',()=>{
 const db=baseline();try{
  const ledger=db.prepare('SELECT * FROM schema_migrations').get(),user=db.prepare('SELECT * FROM users').get(),report=db.prepare('SELECT * FROM reports').get();
  assert.equal(migrations[0].checksum,'dbf6ec323e5550109b9722617341c9222155bf2ed5cd800f71504a7a0cb76940');
  assert.deepEqual(applySchema(db),{version:2,applied:[2]});
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations WHERE version=1').get(),ledger);
  const after=db.prepare('SELECT * FROM users').get();for(const [key,value]of Object.entries(user))assert.deepEqual(after[key],value);
  assert.equal(after.banned,0);assert.equal(after.muted,0);
  const reviewed=db.prepare('SELECT * FROM reports').get();for(const [key,value]of Object.entries(report))assert.deepEqual(reviewed[key],value);
  assert.equal(reviewed.status,'open');assert.equal(reviewed.reviewed_by,null);assert.equal(reviewed.reviewed_at,null);
  const all=db.prepare('SELECT * FROM schema_migrations').all();
  assert.deepEqual(applySchema(db),{version:2,applied:[]});migrationV2.up(db);
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations').all(),all);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db.close();}
});

test('M1 constraints enforce Boolean flags, review status and preference/reviewer ownership',()=>{
 const db=baseline();try{
  applySchema(db);
  for(const column of ['banned','muted'])for(const value of [-1,2,null,'invalid'])assert.throws(()=>db.prepare(`UPDATE users SET ${column}=? WHERE id='member'`).run(value));
  for(const value of ['pending','closed',null])assert.throws(()=>db.prepare("UPDATE reports SET status=? WHERE id='report'").run(value));
  for(const value of ['open','reviewing','resolved','dismissed'])db.prepare("UPDATE reports SET status=? WHERE id='report'").run(value);
  assert.throws(()=>db.prepare('INSERT INTO user_preferences VALUES(?,?,?)').run('other','en','now'),/FOREIGN KEY/);
  assert.throws(()=>db.prepare("UPDATE reports SET reviewed_by='missing' WHERE id='report'").run(),/FOREIGN KEY/);
  db.prepare('INSERT INTO user_preferences VALUES(?,?,?)').run('member','zh-CN','now');
  assert.throws(()=>db.prepare('INSERT INTO user_preferences VALUES(?,?,?)').run('member','ja','later'),/UNIQUE/);
  db.exec("DELETE FROM users WHERE id='member'");assert.equal(db.prepare('SELECT count(*) AS n FROM user_preferences').get().n,0);
 }finally{db.close();}
});

test('M1 migration supports either preexisting restriction flag without duplicate ALTER',()=>{
 for(const column of ['banned','muted']){
  const db=baseline();try{
   db.exec(`ALTER TABLE users ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0 CHECK (${column} IN (0,1))`);
   db.prepare(`UPDATE users SET ${column}=1 WHERE id='member'`).run();
   applySchema(db);migrationV2.up(db);
   assert.equal(db.prepare(`SELECT ${column} AS flag FROM users WHERE id='member'`).get().flag,1);
   assert.equal(db.prepare('SELECT count(*) AS n FROM reports').get().n,1);
  }finally{db.close();}
 }
});

function policyFixture({body=async req=>req.input}={}){
 const db=baseline();applySchema(db);
 for(const [id,role]of [['admin','admin'],['second-admin','admin'],['other','member']])db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.test','hash','salt',role,'now');
 const httpError=(status,code)=>Object.assign(Error(code),{status,code});
 const userRequired=req=>{const row=db.prepare('SELECT * FROM users WHERE id=?').get(req.user||'');if(!row)throw httpError(401,'login_required');if(row.banned)throw httpError(403,'account_banned');return {...row,banned:!!row.banned,muted:!!row.muted};};
 const language=value=>{try{const locale=new Intl.Locale(value),tag=Intl.getCanonicalLocales(value)[0];return ['ja','en','ko'].includes(locale.language)?locale.language:tag;}catch{throw httpError(400,'invalid_language');}};
 const policy=createCommunityPolicy({db,httpError,body,json:(res,status,value)=>Object.assign(res,{status,value}),userRequired,language});
 return {db,policy};
}

test('M1 restrictions re-read administrator authority and audit atomically without private fields',()=>{
 const f=policyFixture(),{db,policy}=f;try{
  const admin={id:'admin'},member={id:'member',role:'admin'};
  assert.throws(()=>policy.setUserRestrictions(member,'other',{muted:true}),{status:403});
  assert.throws(()=>policy.setUserRestrictions(admin,'admin',{banned:true}),{status:403,code:'cannot_restrict_self'});
  assert.throws(()=>policy.setUserRestrictions(admin,'second-admin',{banned:true}),{status:403,code:'protected_admin'});
  assert.throws(()=>policy.setUserRestrictions(admin,'missing',{banned:true}),{status:404});
  for(const value of [null,[],{},{muted:1},{banned:true,password:'secret'}])assert.throws(()=>policy.setUserRestrictions(admin,'member',value),{status:400});
  assert.deepEqual(policy.setUserRestrictions(admin,'member',{muted:true}),{id:'member',muted:true,banned:false});
  assert.deepEqual(policy.setUserRestrictions(admin,'member',{muted:true}),{id:'member',muted:true,banned:false});
  const action=db.prepare('SELECT * FROM admin_actions').get();
  assert.equal(db.prepare('SELECT count(*) n FROM admin_actions').get().n,1);assert.equal(action.action,'restrict_user');assert.equal(action.topic_id,'user:member');
  const details=JSON.parse(action.details);assert.deepEqual(details,{before:{banned:false,muted:false},after:{banned:false,muted:true}});
  assert(!action.details.includes('example.test'));assert(!action.details.includes('password'));
  db.exec("CREATE TRIGGER reject_restriction_audit BEFORE INSERT ON admin_actions BEGIN SELECT RAISE(ABORT,'audit unavailable');END");
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('existing-session','member',Date.now()+600000);
  db.prepare('INSERT INTO auth_challenges(id,email,purpose,user_id,code_hash,expires,resend_at,active,eligible) VALUES(?,?,?,?,?,?,?,1,1)').run('grant','member@example.test','reset','member','unused',Date.now()+600000,0);
  db.prepare('INSERT INTO auth_flows(token_hash,challenge_id,step,expires) VALUES(?,?,?,?)').run('grant-token','grant','password',Date.now()+600000);
  assert.throws(()=>policy.setUserRestrictions(admin,'member',{banned:true}),/audit unavailable/);
  assert.equal(db.prepare("SELECT banned FROM users WHERE id='member'").get().banned,0);
  assert.equal(db.prepare("SELECT count(*) n FROM sessions WHERE user_id='member'").get().n,1);
  assert.equal(db.prepare("SELECT count(*) n FROM auth_flows WHERE challenge_id='grant'").get().n,1);
  assert.equal(db.prepare("SELECT active FROM auth_challenges WHERE id='grant'").get().active,1);
  db.exec("UPDATE users SET role='member' WHERE id='admin'");
  assert.throws(()=>policy.setUserRestrictions(admin,'other',{muted:true}),{status:403});
 }finally{db.close();}
});

test('M1 preference writes recheck session identity and restrictions after awaiting request body',async()=>{
 for(const change of ['different-account','logout','banned']){
  let release,signal;const started=new Promise(resolve=>signal=resolve),waiting=new Promise(resolve=>release=resolve);
  const {db,policy}=policyFixture({body:async req=>{signal();await waiting;return req.input;}});
  try{
   const req={method:'POST',headers:{},user:'member',input:{language:'en'}},res={};
   const pending=policy.handle(req,res,new URL('http://localhost/api/me/preferences'));await started;
   if(change==='different-account')req.user='other';else if(change==='logout')req.user=null;else db.exec("UPDATE users SET banned=1 WHERE id='member'");
   const rejection=assert.rejects(pending,error=>change==='different-account'?error.code==='account_changed':change==='logout'?error.status===401:error.code==='account_banned');
   release();await rejection;
   assert.equal(db.prepare('SELECT count(*) n FROM user_preferences').get().n,0);
  }finally{release?.();db.close();}
 }
});

test('M1 posting guard reloads muted status while preference writes permit a muted account',async()=>{
 const {db,policy}=policyFixture();try{
  const req={method:'POST',headers:{'x-expected-user-id':'member'},user:'member',input:{language:'en'}},res={};
  assert.equal(policy.postingRequired(req).id,'member');
  db.exec("UPDATE users SET muted=1 WHERE id='member'");
  assert.throws(()=>policy.postingRequired(req),{status:403,code:'account_muted'});
  assert.equal(await policy.handle(req,res,new URL('http://localhost/api/me/preferences')),true);assert.deepEqual(res.value,{preferences:{language:'en'}});
  req.headers['x-expected-user-id']='other';
  await assert.rejects(policy.handle(req,{},new URL('http://localhost/api/me/preferences')),{status:409,code:'account_changed'});
 }finally{db.close();}
});

test('M1 avatar update cannot commit using an identity or ban status captured before body read',async()=>{
 const temp=new URL('../artifacts/test-tmp/',import.meta.url);await mkdir(temp,{recursive:true});
 for(const change of ['different-account','logout','banned']){
  const directory=await mkdtemp(new URL('m1-auth-race-',temp)),{db}=policyFixture();let release;
  try{
   const cookies={};for(const id of ['member','other']){const token=randomBytes(32).toString('hex');cookies[id]='jpl_session='+token;db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+600000);}
   let signal;const started=new Promise(resolve=>signal=resolve),waiting=new Promise(resolve=>release=resolve);
   const auth=await createAuth({db,dataDir:directory,secure:false,migrate:false,body:async()=>{signal();await waiting;return {avatarData:null};},json:()=>{throw Error('Unexpected avatar write');},language:value=>value,limit:()=>{},text:value=>value,mailer:{configured:false}});
   const req={method:'POST',headers:{cookie:cookies.member}},pending=auth.handle(req,{},'/api/me/avatar');await started;
   if(change==='different-account')req.headers.cookie=cookies.other;else if(change==='logout')req.headers.cookie='';else db.exec("UPDATE users SET banned=1 WHERE id='member'");
   const rejected=assert.rejects(pending,error=>change==='different-account'?error.code==='account_changed':change==='logout'?error.status===401:error.code==='account_banned');release();await rejected;
   if(change==='banned')assert.equal(db.prepare("SELECT count(*) n FROM sessions WHERE user_id='member'").get().n,0);
  }finally{release?.();db.close();await removeTemporary(directory);}
 }
});

test('M1 banning during an in-flight reset mail prevents activation of its challenge',async()=>{
 const temp=new URL('../artifacts/test-tmp/',import.meta.url);await mkdir(temp,{recursive:true});const directory=await mkdtemp(new URL('m1-mail-race-',temp));
 const {db,policy}=policyFixture();let release;
 try{
  db.exec("UPDATE users SET email_verified_at='verified' WHERE id='member'");
  let signal;const started=new Promise(resolve=>signal=resolve),waiting=new Promise(resolve=>release=resolve);
  const auth=await createAuth({db,dataDir:directory,secure:false,migrate:false,body:async req=>req.input,json:()=>{throw Error('Unexpected reset flow activation');},language:value=>value,limit:()=>{},text:value=>value,mailer:{configured:true,send:async()=>{signal();await waiting;}}});
  const req={method:'POST',headers:{},socket:{remoteAddress:'127.0.0.1'},input:{email:'member@example.test',language:'en'}};
  const pending=auth.handle(req,{},'/api/auth/password/start');await started;
  policy.setUserRestrictions({id:'admin'},'member',{banned:true});
  const rejected=assert.rejects(pending,{status:403,code:'account_banned'});release();await rejected;
  assert.equal(db.prepare("SELECT count(*) n FROM auth_challenges WHERE user_id='member' AND active=1").get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM auth_flows').get().n,0);
  assert.equal(db.prepare('SELECT lock_until FROM auth_send_state').get().lock_until,0);
 }finally{release?.();db.close();await removeTemporary(directory);}
});

function image(){
 const chunk=(name,data)=>{const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(name,4,'ascii');data.copy(out,8);out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(5))),chunk('IEND',Buffer.alloc(0))]);
}

test('M1 attachment upload and renewal recheck restrictions after streaming or JSON body awaits',async()=>{
 for(const mode of ['upload','retain'])for(const change of ['muted','banned','different-account']){
  let release,signal;const started=new Promise(resolve=>signal=resolve),waiting=new Promise(resolve=>release=resolve),f=policyFixture(),{db,policy}=f;
  try{
   const service=createTopicAttachments({db,migrate:false,httpError:(status,code)=>Object.assign(Error(code),{status,code}),limit:()=>{},userRequired:policy.postingRequired,readUserRequired:req=>({id:req.user}),body:async()=>{signal();await waiting;return {attachmentIds:[],expectedUserId:'member'};},json:()=>{throw Error('Unexpected attachment mutation');}});
   const bytes=image();const req=mode==='upload'?Readable.from((async function*(){yield bytes.subarray(0,20);signal();await waiting;yield bytes.subarray(20);})()):{method:'POST'};
   req.method='POST';req.user='member';req.headers={'content-type':'image/png','x-expected-user-id':'member','x-client-upload-id':'00000000-0000-4000-8000-000000000000'};
   const pending=service.handle(req,{},new URL('http://localhost/api/topic-attachments'+(mode==='retain'?'/retain':'')));await started;
   if(change==='different-account')req.user='other';else db.exec(`UPDATE users SET ${change}=1 WHERE id='member'`);
   const rejected=assert.rejects(pending,error=>change==='different-account'?error.code==='account_changed':error.code==='account_'+change);release();await rejected;
   assert.equal(db.prepare('SELECT count(*) n FROM topic_attachments').get().n,0);
  }finally{release?.();db.close();}
 }
});
