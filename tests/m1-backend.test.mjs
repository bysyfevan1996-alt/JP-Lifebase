import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {scryptSync,randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {applySchema} from '../schema.mjs';
import {testPort} from './test-port.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),temp=path.join(root,'artifacts','test-tmp'),password='test-password-123';
await mkdir(temp,{recursive:true});
function fixture(directory){
 const db=new DatabaseSync(path.join(directory,'community.sqlite'));db.exec('PRAGMA foreign_keys=ON');applySchema(db);
 const cookies={},stamp='2026-10-01T00:00:00Z';
 for(const [id,role]of [['admin','admin'],['admin-two','admin'],['member','member'],['other','member']]){
  const salt='test-salt-'+id,token=randomBytes(32).toString('hex');cookies[id]='jpl_session='+token;
  db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at,email_verified_at,legacy_account,password_version) VALUES(?,?,?,?,?,?,?,?,0,2)').run(id,id,id+'@example.test',scryptSync(password,salt,64).toString('hex'),salt,role,stamp,stamp);
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+3600000);
 }
 db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('m1-topic','Existing topic','Existing content','Existing content','daily','member','member','M','en',stamp,stamp);
 db.close();return cookies;
}
function database(directory,work){const db=new DatabaseSync(path.join(directory,'community.sqlite'));try{db.exec('PRAGMA foreign_keys=ON');return work(db);}finally{db.close();}}
async function launch(directory){
 const env={...process.env,PORT:await testPort(),COOKIE_SECURE:'0',JPL_DATA_DIR:directory,JPL_SEED:'0',NODE_ENV:'test',JPL_TEST_MAIL_OUTBOX:'0'};
 for(const key of Object.keys(env))if(/^(TRANSLATION_|RESEND_|MAIL_)/.test(key)||key==='AUTH_TOKEN_SECRET')delete env[key];
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',data=>errors+=data);
 const base=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(Error('M1 server timeout '+errors));},10000);child.stdout.on('data',data=>{const match=String(data).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});child.once('exit',code=>{clearTimeout(timeout);reject(Error('M1 server exited '+code+' '+errors));});});
 async function request(route,{method='GET',value,cookie='',origin=base,headers={}}={}){
  const response=await fetch(base+route,{method,headers:{...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...headers},body:value===undefined?undefined:JSON.stringify(value)});
  let body;try{body=await response.json();}catch{body=null;}
  return {status:response.status,body,cookie:response.headers.getSetCookie().map(item=>item.split(';')[0]).join('; ')};
 }
 const stop=()=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>{child.once('exit',resolve);child.kill();});
 return {request,stop,base};
}
const cleanup=async directory=>{assert(path.resolve(directory).startsWith(path.resolve(temp)+path.sep+'m1-backend-'));await rm(directory,{recursive:true,force:true});};

test('M1 account preferences are canonical, account scoped, same-origin and persistent',async()=>{
 const directory=await mkdtemp(path.join(temp,'m1-backend-')),cookies=fixture(directory);let app=await launch(directory);
 try{
  assert.equal((await app.request('/api/me/preferences')).status,401);
  const route='/api/me/preferences',member={cookie:cookies.member};
  assert.deepEqual((await app.request(route,member)).body,{preferences:{language:null}});
  assert.deepEqual((await app.request(route,{...member,method:'POST',value:{language:'en-US'}})).body,{preferences:{language:'en'}});
  for(const value of [{},{language:'original'},{language:''},{language:'bad_@'},{language:1},{language:'ja',userId:'other'},{language:'ja',role:'admin'}])assert.equal((await app.request(route,{...member,method:'POST',value})).status,400);
  assert.equal((await app.request(route,{...member,method:'POST',value:{language:'ko'},headers:{'X-Expected-User-Id':'other'}})).body.code,'account_changed');
  assert.equal((await app.request(route,{...member,method:'POST',value:{language:'ko'},origin:'https://foreign.example'})).status,403);
  assert.deepEqual((await app.request(route,{cookie:cookies.other})).body,{preferences:{language:null}});
  assert.equal((await app.request('/api/session',member)).body.user.role,'member');
  await app.stop();app=await launch(directory);
  assert.deepEqual((await app.request(route,member)).body,{preferences:{language:'en'}});
  assert.equal((await app.request(route,{...member,method:'POST',value:{language:'fr-CA'},headers:{'X-Expected-User-Id':'member'}})).status,200);
  assert.equal((await app.request(route,member)).body.preferences.language,'fr-CA');
 }finally{await app.stop();await cleanup(directory);}
});

test('M1 mute blocks community writes using an existing session while account settings and reports stay usable',async()=>{
 const directory=await mkdtemp(path.join(temp,'m1-backend-')),cookies=fixture(directory);let app=await launch(directory);
 try{
  const restrict=value=>app.request('/api/admin/users/member',{method:'POST',cookie:cookies.admin,value});
  assert.equal((await restrict({muted:true})).status,200);
  assert.equal((await app.request('/api/session',{cookie:cookies.member})).body.user.muted,true);
  for(const [route,method,value]of [
   ['/api/topics','POST',{title:'Must reject',body:'Must reject',category:'daily'}],
   ['/api/topics/m1-topic/replies','POST',{body:'Must reject'}],
   ['/api/topics/m1-topic','DELETE',undefined],
   ['/api/topic-attachments','POST',{}],
   ['/api/topic-attachments/retain','POST',{attachmentIds:[],expectedUserId:'member'}],
   ['/api/topic-attachments/00000000-0000-4000-8000-000000000000','DELETE',undefined]
  ])assert.equal((await app.request(route,{method,value,cookie:cookies.member})).body.code,'account_muted',route);
  assert.equal((await app.request('/api/me/preferences',{method:'POST',value:{language:'ja'},cookie:cookies.member})).status,200);
  assert.equal((await app.request('/api/me/avatar',{method:'POST',value:{avatarData:null},cookie:cookies.member})).status,200);
  assert.equal((await app.request('/api/topics/m1-topic/report',{method:'POST',value:{reason:'A valid report while muted.'},cookie:cookies.member})).status,201);
  assert.equal((await app.request('/api/me/topics',{cookie:cookies.member})).status,200);
  await app.stop();app=await launch(directory);
  assert.equal((await app.request('/api/session',{cookie:cookies.member})).body.user.muted,true);
  assert.equal((await restrict({muted:false})).status,200);
  assert.equal((await app.request('/api/topics/m1-topic/replies',{method:'POST',value:{body:'Allowed after unmute',language:'en'},cookie:cookies.member})).status,201);
 }finally{await app.stop();await cleanup(directory);}
});

test('M1 bans revoke sessions and auth grants, survive restart, protect admins and cannot revive revoked credentials',async()=>{
 const directory=await mkdtemp(path.join(temp,'m1-backend-')),cookies=fixture(directory);let app=await launch(directory);
 try{
  const route='/api/admin/users/member',admin={method:'POST',cookie:cookies.admin};
  assert.equal((await app.request(route,{method:'POST',cookie:cookies.other,value:{banned:true}})).status,403);
  for(const id of ['admin','admin-two'])assert.equal((await app.request('/api/admin/users/'+id+'',{...admin,value:{banned:true}})).status,403);
  for(const value of [{},{banned:1},{muted:'yes'},{banned:true,role:'admin'}])assert.equal((await app.request(route,{...admin,value})).status,400);
  const grantToken=randomBytes(32).toString('hex'),grantCookie='jpl_auth='+grantToken;
  database(directory,db=>{
   for(const [id,user]of [['pending-member','member'],['pending-other','other'],['pending-register',null]]){
    db.prepare('INSERT INTO auth_challenges(id,email,purpose,user_id,code_hash,expires,resend_at,active,eligible) VALUES(?,?,?,?,?,?,?,1,1)').run(id,(user||'new')+'@example.test',user?'reset':'register',user,'unused',Date.now()+600000,0);
    db.prepare('INSERT INTO auth_flows(token_hash,challenge_id,step,expires,grant_expires) VALUES(?,?,?,?,?)').run(user==='member'?createHash('sha256').update(grantToken).digest('hex'):id,id,user?'password':'profile',Date.now()+900000,Date.now()+900000);
   }
  });
  assert.equal((await app.request('/api/auth/flow',{cookie:grantCookie})).body.flow.step,'password');
  assert.equal((await app.request(route,{...admin,value:{banned:true}})).status,200);
  assert.equal((await app.request('/api/auth/flow',{cookie:grantCookie})).body.flow,null);
  assert.equal((await app.request('/api/session',{cookie:cookies.member})).body.user,null);
  assert.equal((await app.request('/api/me/preferences',{cookie:cookies.member})).status,401);
  assert.equal((await app.request('/api/login',{method:'POST',value:{email:'member@example.test',password:'wrong-password-123'}})).body.code,'invalid_credentials');
  assert.equal((await app.request('/api/login',{method:'POST',value:{email:'member@example.test',password}})).body.code,'account_banned');
  const scoped=database(directory,db=>({sessions:db.prepare("SELECT count(*) n FROM sessions WHERE user_id='member'").get().n,flows:db.prepare('SELECT token_hash FROM auth_flows ORDER BY token_hash').all().map(row=>row.token_hash),active:db.prepare("SELECT active FROM auth_challenges WHERE id='pending-member'").get().active}));
  assert.equal(scoped.sessions,0);assert.equal(scoped.active,0);assert.deepEqual(scoped.flows,['pending-other','pending-register']);
  assert.equal((await app.request('/api/topics',{cookie:cookies.member})).status,200);
  assert.equal((await app.request('/api/denki/catalog',{cookie:cookies.member})).status,200);
  assert.equal((await app.request('/api/contact',{method:'POST',cookie:cookies.member,value:{name:'Contact',email:'member@example.test',message:'Public contact remains independently rate limited.'}})).status,201);
  assert.equal((await app.request('/api/translate',{method:'POST',cookie:cookies.member,value:{target:'zh-CN',source:'en',items:{text:'Public'}}})).body.code,'manual_language');
  await app.stop();app=await launch(directory);
  assert.equal((await app.request('/api/login',{method:'POST',value:{email:'member@example.test',password}})).body.code,'account_banned');
  assert.equal((await app.request(route,{...admin,value:{banned:false}})).status,200);
  assert.equal((await app.request('/api/auth/password/complete',{method:'POST',cookie:grantCookie,value:{password:'must-not-revive-123'}})).body.code,'flow_expired');
  assert.equal((await app.request('/api/session',{cookie:cookies.member})).body.user,null);
  assert.equal((await app.request('/api/login',{method:'POST',value:{email:'member@example.test',password}})).status,200);
  assert.equal(database(directory,db=>db.prepare("SELECT count(*) n FROM auth_flows WHERE challenge_id='pending-member'").get().n),0);
 }finally{await app.stop();await cleanup(directory);}
});

