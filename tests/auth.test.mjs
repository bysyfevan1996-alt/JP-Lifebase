import {testPort} from './test-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,readFile,rename} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {scryptSync,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createMailer} from '../mailer.mjs';
import {createAuth} from '../auth.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),tempRoot=path.join(root,'artifacts','test-tmp');
await mkdir(tempRoot,{recursive:true});
async function launch(dataDir,mail=true){
 const env={...process.env,PORT:await testPort(),COOKIE_SECURE:'0',JPL_DATA_DIR:dataDir,JPL_SEED:'0',NODE_ENV:'test',JPL_TEST_MAIL_OUTBOX:mail?'1':'0'};
 for(const key of Object.keys(env))if(/^(TRANSLATION_|RESEND_|MAIL_)/.test(key)||key==='AUTH_TOKEN_SECRET')delete env[key];
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',c=>stderr+=c);
 const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('startup timeout '+stderr));},10000);child.stdout.on('data',c=>{const m=String(c).match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});child.once('exit',()=>{clearTimeout(timer);reject(new Error('startup failed '+stderr));});});
 async function request(route,value,cookie='',method=value===undefined?'GET':'POST'){
  const response=await fetch(base+route,{method,headers:{Origin:base,...(value===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:value===undefined?undefined:JSON.stringify(value)});
  let body;try{body=await response.json();}catch{body=null;}
  const cookies=response.headers.getSetCookie().map(c=>c.split(';')[0]);return {status:response.status,body,cookie:cookies.join('; '),cookies,headers:response.headers};
 }
 const stop=()=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>{child.once('exit',resolve);child.kill();});
 const outbox=async()=>{try{return (await readFile(path.join(dataDir,'mail-outbox.ndjson'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code==='ENOENT')return [];throw e;}};
 async function start(email,purpose='register',cookie='',extra={}){return request(`/api/auth/${purpose}/start`,{email,language:'en',...extra},cookie);}
 async function verify(start){const code=(await outbox()).findLast(x=>start.body.email===x.email[0]+'***'+x.email.slice(x.email.lastIndexOf('@')))?.code;assert(code);return request('/api/auth/verify',{code},start.cookie);}
 return {base,request,stop,outbox,start,verify};
}
function mutate(data,fn){const db=new DatabaseSync(path.join(data,'community.sqlite'));try{return fn(db);}finally{db.close();}}
function png(red=255){
 function chunk(type,data){const payload=Buffer.concat([Buffer.from(type),data]),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);payload.copy(result,4);let crc=0xffffffff;for(const byte of payload){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
 return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from([0,red,0,0,255]))),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
const cleanup=async data=>{assert(path.resolve(data).startsWith(tempRoot+path.sep+'auth-'));await rm(data,{recursive:true,force:true});};

test('verified registration, persistent 180s cooldown, one-use grants, raw passwords and reset revocation',async()=>{
 const data=await mkdtemp(path.join(tempRoot,'auth-'));let app=await launch(data);
 try{
  assert.equal((await app.request('/api/register',{email:'new@example.test',name:'NewUser',password:'long-password-123'})).body.code,'flow_expired');
  const first=await app.start('new@example.test');assert.equal(first.status,200);assert(first.headers.get('set-cookie').includes('HttpOnly'));assert(first.body.resendAt-Date.now()>178000);
  assert.equal((await app.request('/api/auth/flow',undefined,first.cookie)).body.flow.step,'code');
  assert.equal((await app.request('/api/auth/resend',{language:'en'},first.cookie)).status,429);
  const newFlow=await app.start('new@example.test');assert.equal(newFlow.status,429);assert(Number(newFlow.headers.get('retry-after'))>=178);
  await app.stop();app=await launch(data);assert.equal((await app.start('new@example.test')).status,429);
  const code=(await app.outbox())[0].code;assert.match(code,/^\d{6}$/);
  const dbDump=mutate(data,db=>db.prepare('SELECT * FROM auth_challenges').all());assert(!JSON.stringify(dbDump).includes('"'+code+'"'));
  assert.equal((await app.request('/api/auth/verify',{code:'00000x'},first.cookie)).body.remainingAttempts,4);
  assert.equal((await app.request('/api/auth/verify',{code},first.cookie)).body.step,'profile');
  assert.equal((await app.request('/api/auth/verify',{code},first.cookie)).body.code,'flow_expired');
  assert.equal((await app.request('/api/register',{name:'NewUser',password:'12345678901'},first.cookie)).body.code,'password_length');
  const password='  password 123456  ',created=await app.request('/api/register',{name:'NewUser',password,role:'admin'},first.cookie);assert.equal(created.status,201);assert.equal(created.body.user.role,'member');assert.equal(created.body.user.emailVerified,true);assert.equal(created.body.user.legacyAccount,false);assert.equal(created.body.user.avatar,'N');assert.equal(created.body.user.avatarUrl,null);
  assert.equal((await app.request('/api/register',{name:'OtherUser',password},first.cookie)).body.code,'flow_expired');
  assert.equal((await app.request('/api/login',{email:'new@example.test',password:password.trim()})).status,401);
  const logged=await app.request('/api/login',{email:'new@example.test',password});assert.equal(logged.status,200);
  const reset=await app.start('new@example.test','password');assert.equal(reset.status,200);const resetCode=(await app.outbox()).at(-1).code;if(resetCode!==code)assert.equal((await app.request('/api/auth/verify',{code},reset.cookie)).body.code,'code_invalid');assert.equal((await app.verify(reset)).body.step,'password');
  assert.equal((await app.request('/api/register',{name:'WrongPurpose',password:'long-password-123'},reset.cookie)).body.code,'flow_expired');
  const outboxFile=path.join(data,'mail-outbox.ndjson');await rename(outboxFile,outboxFile+'.saved');await mkdir(outboxFile);
  const complete=await app.request('/api/auth/password/complete',{password:'replacement-password-456'},reset.cookie);assert.equal(complete.status,200);
  await rm(outboxFile,{recursive:true});await rename(outboxFile+'.saved',outboxFile);
  assert.equal((await app.request('/api/session',undefined,logged.cookie)).body.user,null);assert.equal((await app.request('/api/session',undefined,created.cookie)).body.user,null);
  assert.equal((await app.request('/api/auth/password/complete',{password:'another-password-789'},reset.cookie)).body.code,'flow_expired');
  assert.equal((await app.request('/api/login',{email:'new@example.test',password})).status,401);
  assert.equal((await app.request('/api/login',{email:'new@example.test',password:'replacement-password-456'})).status,200);
  const sameName=await app.start('different@example.test');await app.verify(sameName);assert.equal((await app.request('/api/register',{name:'NewUser',password:'long-password-123'},sameName.cookie)).body.code,'name_taken');assert.equal((await app.request('/api/register',{name:'ADMIN',password:'long-password-123'},sameName.cookie)).body.code,'reserved_name');assert.equal((await app.request('/api/register',{name:'badminton',password:'long-password-123'},sameName.cookie)).status,201);
  assert.equal((await app.start('new@example.test')).status,429);
  mutate(data,db=>db.exec('UPDATE auth_send_state SET resend_at=0'));const mailCount=(await app.outbox()).length;
  const duplicate=await app.start('new@example.test');assert.equal(duplicate.status,200);assert.equal((await app.outbox()).length,mailCount);assert.equal((await app.request('/api/auth/verify',{code:'123456'},duplicate.cookie)).body.code,'code_invalid');
  assert.equal((await fetch(app.base+'/account/register')).status,200);
 }finally{await app.stop();await cleanup(data);}
});

test('wrong attempts commit across restart; expired codes and cancel are unusable',async()=>{
 const data=await mkdtemp(path.join(tempRoot,'auth-'));let app=await launch(data);
 try{
  const first=await app.start('lock@example.test'),correct=(await app.outbox())[0].code,wrong=correct==='111111'?'222222':'111111';
  for(let i=0;i<2;i++)assert.equal((await app.request('/api/auth/verify',{code:wrong},first.cookie)).body.code,'code_invalid');
  await app.stop();app=await launch(data);
  for(let i=0;i<2;i++)assert.equal((await app.request('/api/auth/verify',{code:wrong},first.cookie)).body.code,'code_invalid');
  assert.equal((await app.request('/api/auth/verify',{code:wrong},first.cookie)).body.code,'code_locked');
  assert.equal((await app.request('/api/auth/verify',{code:correct},first.cookie)).body.code,'code_locked');
  const expired=await app.start('expired@example.test');mutate(data,db=>db.prepare('UPDATE auth_challenges SET expires=0 WHERE email=?').run('expired@example.test'));
  assert.equal((await app.request('/api/auth/verify',{code:(await app.outbox()).at(-1).code},expired.cookie)).body.code,'code_expired');
  const cancel=await app.start('cancel@example.test');assert.equal((await app.request('/api/auth/cancel',{},cancel.cookie)).status,200);assert.equal((await app.request('/api/auth/flow',undefined,cancel.cookie)).body.flow,null);
  assert.equal(mutate(data,db=>db.prepare('SELECT active FROM auth_challenges WHERE email=?').get('cancel@example.test')).active,0);
  const grant=await app.start('grant@example.test');assert.equal((await app.verify(grant)).status,200);mutate(data,db=>db.exec('UPDATE auth_flows SET grant_expires=0'));
  assert.equal((await app.request('/api/register',{name:'ExpiredGrant',password:'long-password-123'},grant.cookie)).body.code,'flow_expired');
 }finally{await app.stop();await cleanup(data);}
});

test('failed resend preserves old code; successful resend invalidates it; parallel starts reserve one send',async()=>{
 const data=await mkdtemp(path.join(tempRoot,'auth-'));const app=await launch(data),filename=path.join(data,'mail-outbox.ndjson');
 try{
  const first=await app.start('resend@example.test'),old=(await app.outbox())[0].code;
  mutate(data,db=>db.exec('UPDATE auth_send_state SET resend_at=0'));
  await rename(filename,filename+'.saved');await mkdir(filename);
  const failed=await app.request('/api/auth/resend',{language:'en'},first.cookie);assert.equal(failed.status,503);assert.equal(failed.body.code,'mail_send_failed');
  await rm(filename,{recursive:true});await rename(filename+'.saved',filename);
  assert.equal((await app.request('/api/auth/verify',{code:old},first.cookie)).body.step,'profile');
  const next=await app.start('resend@example.test'),previous=(await app.outbox()).at(-1).code;mutate(data,db=>db.exec('UPDATE auth_send_state SET resend_at=0'));
  const resent=await app.request('/api/auth/resend',{language:'en'},next.cookie);assert.equal(resent.status,200);assert.equal((await app.outbox()).length,3);
  assert.equal((await app.request('/api/auth/verify',{code:previous},next.cookie)).body.code,'flow_expired');
  assert.equal((await app.request('/api/auth/verify',{code:previous},resent.cookie)).body.code,'code_invalid');
  assert.equal((await app.verify(resent)).status,200);
  const pair=await Promise.all([app.start('parallel@example.test'),app.start('parallel@example.test')]);assert.deepEqual(pair.map(x=>x.status).sort(),[200,429]);assert.equal((await app.outbox()).filter(x=>x.email==='parallel@example.test').length,1);
 }finally{await app.stop();await cleanup(data);}
});

test('legacy migration preserves data/session/role; unverified email cannot reset before password-bound verification',async()=>{
 const data=await mkdtemp(path.join(tempRoot,'auth-'));let app;
 const db=new DatabaseSync(path.join(data,'community.sqlite')),salt='0123456789abcdef0123456789abcdef',hash=scryptSync('old-password-123',salt,64).toString('hex'),oldToken='a'.repeat(64);
 db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL DEFAULT \'member\',created_at TEXT NOT NULL)');
 db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run('old-id','OldUser','old@example.test',hash,salt,'admin','2026-01-01');db.exec('CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL)');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(oldToken).digest('hex'),'old-id',Date.now()+86400000);db.close();app=await launch(data);
 try{
  const oldSession=await app.request('/api/session',undefined,'jpl_session='+oldToken);assert.equal(oldSession.body.user.name,'OldUser');assert.equal(oldSession.body.user.role,'admin');assert.equal(oldSession.body.user.emailVerified,false);
  const logged=await app.request('/api/login',{email:'old@example.test',password:'  old-password-123  '});assert.equal(logged.status,200);assert.equal(logged.body.user.role,'admin');assert.equal(logged.body.user.emailVerified,false);assert.equal(logged.body.user.legacyAccount,true);
  const reset=await app.start('old@example.test','password');assert.equal(reset.status,200);assert.equal((await app.outbox()).length,0);
  assert.equal((await app.request('/api/auth/verify',{code:'123456'},reset.cookie)).body.code,'code_invalid');
  assert.equal((await app.start('old@example.test','email',logged.cookie,{password:'incorrect-password'})).status,401);
  const verify=await app.start('old@example.test','email',logged.cookie,{password:'  old-password-123  '});assert.equal(verify.status,200);
  const combined=verify.cookie+'; '+logged.cookies.find(x=>x.startsWith('jpl_session='));
  assert.equal((await app.request('/api/auth/verify',{code:(await app.outbox())[0].code},combined)).body.user.emailVerified,true);
  await app.stop();app=await launch(data);assert.equal((await app.request('/api/session',undefined,logged.cookie)).body.user.emailVerified,true);
  assert.equal(mutate(data,db=>db.prepare('SELECT password_version FROM users WHERE id=?').get('old-id')).password_version,1);
  assert.equal((await app.request('/api/login',{email:'old@example.test',password:'old-password-123'})).status,200);
  assert.equal((await app.request('/api/login',{email:'old@example.test',password:'  old-password-123  '})).status,200);
  mutate(data,db=>db.exec('UPDATE auth_send_state SET resend_at=0'));
  const resetNow=await app.start('old@example.test','password');assert.equal((await app.verify(resetNow)).body.step,'password');
  const newPassword='  new password 123  ';assert.equal((await app.request('/api/auth/password/complete',{password:newPassword},resetNow.cookie)).status,200);
  assert.equal(mutate(data,db=>db.prepare('SELECT password_version FROM users WHERE id=?').get('old-id')).password_version,2);
  assert.equal((await app.request('/api/login',{email:'old@example.test',password:newPassword})).status,200);assert.equal((await app.request('/api/login',{email:'old@example.test',password:newPassword.trim()})).status,401);
  assert.equal((await app.outbox()).at(-1).purpose,'password_changed');assert.equal((await app.outbox()).at(-1).code,undefined);
 }finally{await app.stop();await cleanup(data);}
});

test('mail availability is explicit and production cannot enable the test outbox',async()=>{
 const data=await mkdtemp(path.join(tempRoot,'auth-'));const app=await launch(data,false);
 try{assert.equal((await app.start('off@example.test')).body.code,'mail_unavailable');assert.equal((await app.outbox()).length,0);
  assert.equal(createMailer({dataDir:data,env:{NODE_ENV:'production',JPL_TEST_MAIL_OUTBOX:'1'}}).configured,false);
  let sent;const mailer=createMailer({dataDir:data,env:{MAIL_PROVIDER:'resend',RESEND_API_KEY:'private-test-key',MAIL_FROM:'Test <no-reply@example.test>'},fetchImpl:async(url,options)=>{sent={url,options};return {ok:true,json:async()=>({id:'test-mail'})};}});
  await mailer.send({email:'only@example.test',code:'001234',purpose:'register',language:'ko',id:'challenge-test'});assert.equal(sent.url,'https://api.resend.com/emails');assert.equal(sent.options.headers['Idempotency-Key'],'jpl-auth-challenge-test');assert.equal(JSON.parse(sent.options.body).to[0],'only@example.test');assert(JSON.parse(sent.options.body).text.includes('001234'));
  for(const language of ['ja','en','ko','zh-CN','zh-TW']){
   const subjects=[];for(const purpose of ['register','reset','legacy']){await mailer.send({email:'only@example.test',code:'001234',purpose,language,id:'test-'+purpose});const message=JSON.parse(sent.options.body);subjects.push(message.subject);assert(message.text.includes('001234'));assert(message.html.includes('001234'));assert(message.html.includes(message.subject.replace('Japan Life Base — ','')));assert(message.text.includes(message.html.match(/<p style="font-size:15px;line-height:1.7">([^<]+)<\/p>/)[1]));}
   assert.equal(new Set(subjects).size,3);await mailer.notifyPasswordChanged({email:'only@example.test',language,id:'notice-test'});assert(!JSON.parse(sent.options.body).text.includes('001234'));
  }
  const failing=createMailer({dataDir:data,env:{MAIL_PROVIDER:'resend',RESEND_API_KEY:'private-test-key',MAIL_FROM:'sender@example.test'},fetchImpl:async()=>{throw new Error('provider might contain a secret');}});await assert.rejects(failing.notifyPasswordChanged({email:'only@example.test',language:'en',id:'failed-notice'}),e=>e.code==='mail_send_failed'&&!e.message.includes('secret'));
 }finally{await app.stop();await cleanup(data);}
});

test('avatar upload, binary serving, existing topic/reply updates and default fallback',async()=>{
 const data=await mkdtemp(path.join(tempRoot,'auth-'));const app=await launch(data);
 try{
  const start=await app.start('avatar@example.test');await app.verify(start);const registered=await app.request('/api/register',{name:'AvatarUser',password:'avatar-password-123'},start.cookie),session=registered.cookie;assert.equal(registered.status,201);
  const created=await app.request('/api/topics',{title:'Avatar topic',body:'A topic with an avatar.',category:'daily',language:'en'},session),id=created.body.topic.id;
  assert.equal((await app.request('/api/topics/'+id+'/replies',{body:'An existing reply.',language:'en'},session)).status,201);
  assert.equal((await app.request('/api/me/avatar',{avatarData:png()})).status,401);
  assert.equal((await app.request('/api/me/avatar',{avatarData:'data:image/svg+xml;base64,PHN2Zz4='},session)).body.code,'invalid_avatar');
  const upload=await app.request('/api/me/avatar',{avatarData:png()},session);assert.equal(upload.status,200);const url=upload.body.user.avatarUrl;assert.match(url,/^\/api\/avatars\/.+\/[a-f0-9]{64}$/);
  const response=await fetch(app.base+url);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(png().split(',')[1],'base64'));
  const detail=await app.request('/api/topics/'+id+'?lang=original');assert.equal(detail.body.topic.avatarUrl,url);assert(detail.body.posts.every(p=>p.avatarUrl===url));assert.equal((await app.request('/api/topics')).body.topics[0].avatarUrl,url);
  const cross=await fetch(app.base+'/api/me/avatar',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json',Cookie:session},body:JSON.stringify({avatarData:null})});assert.equal(cross.status,403);
  const removed=await app.request('/api/me/avatar',{avatarData:null},session);assert.equal(removed.body.user.avatarUrl,null);assert.equal(removed.body.user.avatar,'A');assert.equal((await fetch(app.base+url)).status,404);assert.equal((await app.request('/api/topics/'+id+'?lang=original')).body.posts[1].avatarUrl,null);
 }finally{await app.stop();await cleanup(data);}
});

test('login throttle exposes its actual retry interval',async()=>{
 const data=await mkdtemp(path.join(tempRoot,'auth-'));const app=await launch(data);
 try{for(let i=0;i<12;i++)assert.equal((await app.request('/api/login',{email:'unknown@example.test'})).status,401);const limited=await app.request('/api/login',{email:'unknown@example.test'});assert.equal(limited.status,429);assert(limited.body.retryAfter>=890);assert.equal(Number(limited.headers.get('retry-after')),limited.body.retryAfter);}
 finally{await app.stop();await cleanup(data);}
});

test('persistent hourly email, daily email and hourly IP mail quotas cannot be bypassed with new flows',async()=>{
 const data=await mkdtemp(path.join(tempRoot,'auth-'));let app=await launch(data);
 const hash=value=>createHash('sha256').update(value).digest('hex'),mail='quota@example.test',ip=hash('127.0.0.1');
 try{
  assert.equal((await app.start(mail)).status,200);
  mutate(data,db=>{db.exec('UPDATE auth_send_state SET resend_at=0');for(let i=0;i<4;i++)db.prepare('INSERT INTO auth_mail_usage VALUES(?,?,?,?)').run('hour-'+i,hash(mail),ip,Date.now()-1000);});
  assert.equal((await app.start(mail)).body.code,'rate_limited');await app.stop();app=await launch(data);assert.equal((await app.start(mail,'password')).body.code,'rate_limited');
  mutate(data,db=>{db.exec('DELETE FROM auth_mail_usage');for(let i=0;i<10;i++)db.prepare('INSERT INTO auth_mail_usage VALUES(?,?,?,?)').run('day-'+i,hash(mail),ip,Date.now()-7200000);});
  assert.equal((await app.start(mail)).body.code,'rate_limited');
  mutate(data,db=>{db.exec('DELETE FROM auth_mail_usage');for(let i=0;i<30;i++)db.prepare('INSERT INTO auth_mail_usage VALUES(?,?,?,?)').run('ip-'+i,hash('different'+i+'@example.test'),ip,Date.now()-1000);});
  assert.equal((await app.start('other@example.test')).body.code,'rate_limited');assert.equal((await app.outbox()).length,1);
 }finally{await app.stop();await cleanup(data);}
});

test('a reset finishing while another email is in flight revokes that pending challenge too',async()=>{
 const data=await mkdtemp(path.join(tempRoot,'auth-')),db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',created_at TEXT NOT NULL);CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL)");
 let signalStarted,releaseSend;const started=new Promise(resolve=>signalStarted=resolve),released=new Promise(resolve=>releaseSend=resolve);
 try{
  const auth=await createAuth({db,dataDir:data,secure:false,body:async req=>req.payload,json:(res,status,value)=>Object.assign(res,{status,body:value}),language:x=>x,limit:()=>{},text:x=>x,mailer:{configured:true,send:async()=>{signalStarted();await released;},notifyPasswordChanged:async()=>{}}});
  db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at,email_verified_at,legacy_account,password_version) VALUES(?,?,?,?,?,?,?,?,0,2)').run('race-user','RaceUser','race@example.test','old-digest','old-salt','member','2026-01-01','2026-01-01');
  db.prepare('INSERT INTO auth_challenges(id,email,purpose,user_id,code_hash,expires,resend_at,eligible,active) VALUES(?,?,?,?,?,?,?,?,1)').run('existing-reset','race@example.test','reset','race-user','unused',Date.now()+600000,0,1);
  const token='f'.repeat(64);db.prepare('INSERT INTO auth_flows(token_hash,challenge_id,step,expires,grant_expires) VALUES(?,?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),'existing-reset','password',Date.now()+900000,Date.now()+900000);
  const request=(payload,cookie='')=>({method:'POST',payload,headers:{cookie},socket:{remoteAddress:'127.0.0.1'}});
  const pending=auth.handle(request({email:'race@example.test',language:'en'}),{},'/api/auth/password/start');await started;
  const result={};await auth.handle(request({password:'replacement-password-123'},'jpl_auth='+token),result,'/api/auth/password/complete');assert.equal(result.status,200);
  const rejected=assert.rejects(pending,e=>e.code==='mail_send_failed');releaseSend();await rejected;
  assert.equal(db.prepare('SELECT count(*) AS count FROM auth_flows').get().count,0);assert.equal(db.prepare('SELECT count(*) AS count FROM auth_challenges WHERE active=1').get().count,0);assert.equal(db.prepare('SELECT lock_until FROM auth_send_state').get().lock_until,0);
 }finally{releaseSend?.();db.close();await cleanup(data);}
});
