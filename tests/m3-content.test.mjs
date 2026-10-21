import {testPort} from './test-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {crc32,deflateSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temporaryRoot=path.join(root,'artifacts','test-tmp');
function legacyFixture(directory){
 const db=new DatabaseSync(path.join(directory,'community.sqlite'));
 db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',created_at TEXT NOT NULL);
 CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE topics(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,excerpt TEXT NOT NULL,category TEXT NOT NULL,user_id TEXT REFERENCES users(id),author TEXT NOT NULL,avatar TEXT NOT NULL,tone INTEGER NOT NULL DEFAULT 0,pinned INTEGER NOT NULL DEFAULT 0,language TEXT NOT NULL,seed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE posts(id TEXT PRIMARY KEY,topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,quote TEXT,language TEXT NOT NULL,created_at TEXT NOT NULL);`);
 const tokens={},date='2026-10-01T00:00:00.000Z';
 for(const [id,name,role]of [['operator','OperatorTest','admin'],['author','AuthorTest','member'],['reader','ReaderTest','member']]){
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,name,id+'@example.test','unused-test-password','unused-test-salt',role,date);
  const token=randomBytes(32).toString('hex');tokens[id]='jpl_session='+token;
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+3600000);
 }
 db.prepare('INSERT INTO topics VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('legacy-topic','Legacy title','<b>Legacy literal text</b>','Legacy excerpt','daily','author','AuthorTest','A',0,0,'en',0,date,date);
 db.prepare('INSERT INTO topics VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('other-topic','Other title','Other source body','Other excerpt','daily','author','AuthorTest','A',0,0,'en',0,date,date);
 db.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?,?)').run('legacy-reply','legacy-topic','reader','Legacy reply','Legacy quote','en',date);
 db.close();return tokens;
}
async function launch(directory,extraEnv={}){
 const env={...process.env,PORT:await testPort(),COOKIE_SECURE:'0',JPL_DATA_DIR:directory,JPL_SEED:'0',NODE_ENV:'test',JPL_TEST_MAIL_OUTBOX:'0'};
 for(const key of Object.keys(env))if(/^(TRANSLATION_|RESEND_|MAIL_)/.test(key)||key==='AUTH_TOKEN_SECRET')delete env[key];
 Object.assign(env,extraEnv);
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',bytes=>errors+=bytes);
 const base=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill();reject(new Error('Startup timeout: '+errors));},10000);
  child.stdout.on('data',bytes=>{const match=String(bytes).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
  child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code+': '+errors));});
 });
 async function request(route,{method='GET',value,cookie='',origin=base,bytes,headers={}}={}){
  const response=await fetch(base+route,{method,headers:{...(method==='GET'?{}:{'Content-Type':bytes?'image/png':'application/json',...(origin?{Origin:origin}:{})}),...(cookie?{Cookie:cookie}:{}),...headers},body:bytes??(value===undefined?undefined:JSON.stringify(value))});
  const isJson=response.headers.get('content-type')?.includes('application/json');
  return {status:response.status,body:isJson?await response.json():Buffer.from(await response.arrayBuffer()),headers:response.headers};
 }
 const stop=()=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>{child.once('exit',resolve);child.kill();});
 return {base,request,stop};
}
async function fixture(extraEnv={}){
 await mkdir(temporaryRoot,{recursive:true});const directory=await mkdtemp(path.join(temporaryRoot,'m3-content-'));
 const tokens=legacyFixture(directory);let app;
 try{app=await launch(directory,extraEnv);}catch(error){await rm(directory,{recursive:true,force:true});throw error;}
 const context={directory,tokens,app};
 context.restart=async()=>{await context.app.stop();context.app=await launch(directory,extraEnv);};
 context.close=async()=>{await context.app.stop();assert(path.resolve(directory).startsWith(temporaryRoot+path.sep+'m3-content-'));await rm(directory,{recursive:true,force:true});};
 return context;
}
function database(context,work){const db=new DatabaseSync(path.join(context.directory,'community.sqlite'));try{return work(db);}finally{db.close();}}
const api=(kind,id,action)=>`/api/content/${kind}/${id}/${action}`;
const edit=(f,kind,id,value={},who='author')=>f.app.request(api(kind,id,'edit'),{method:'POST',cookie:f.tokens[who]||'',value:{expectedVersion:1,expectedUserId:who,body:'Edited body content',bodyFormat:'markdown',language:'und',...value}});
const visibility=(f,kind,id,hidden,who='author')=>f.app.request(api(kind,id,'visibility'),{method:'POST',cookie:f.tokens[who]||'',value:{hidden,expectedUserId:who}});
const reply=(f,value={},who='reader',topicId='legacy-topic')=>f.app.request(`/api/topics/${topicId}/replies`,{method:'POST',cookie:f.tokens[who]||'',value:{body:'A new reply body',expectedUserId:who,language:'und',...value}});
const detail=f=>f.app.request('/api/topics/legacy-topic?lang=original');

test('M3 editing preserves legacy plain content, checks owner identity and optimistic versions, and records immutable history',async()=>{
 const f=await fixture();try{
  const source=await f.app.request(api('topic','legacy-topic','source'));
  assert.equal(source.status,200);assert.equal(source.body.content.version,1);assert.equal(source.body.content.bodyFormat,'plain');assert.equal(source.body.content.body,'<b>Legacy literal text</b>');
  assert.equal((await edit(f,'topic','legacy-topic',{},'reader')).status,403);
  assert.equal((await edit(f,'topic','legacy-topic',{},'anonymous')).status,401);
  assert.equal((await edit(f,'topic','legacy-topic',{expectedUserId:'reader'})).body.code,'account_changed');
  assert.equal((await f.app.request(api('topic','legacy-topic','history'))).status,401);
  assert.equal((await f.app.request(api('topic','legacy-topic','history'),{cookie:f.tokens.reader})).status,403);
  const changed=await edit(f,'topic','legacy-topic',{title:'Edited title',body:'## Changed heading\n\nEdited body with **formatting**.'});
  assert.equal(changed.status,200);assert.equal(changed.body.content.version,2);assert.equal(changed.body.content.bodyFormat,'markdown');assert.equal(changed.body.content.language,'und');assert(changed.body.content.editedAt);
  const conflict=await edit(f,'topic','legacy-topic',{title:'Stale edit must not win'});
  assert.equal(conflict.status,409);assert.equal(conflict.body.code,'revision_conflict');
  assert.equal((await f.app.request(api('topic','legacy-topic','source'))).body.content.title,'Edited title');
  for(const who of ['author','operator']){
   const history=await f.app.request(api('topic','legacy-topic','history'),{cookie:f.tokens[who]});
   assert.equal(history.status,200);assert.deepEqual(history.body.revisions.map(r=>r.version),[2,1]);assert.equal(history.body.revisions[1].body,'<b>Legacy literal text</b>');assert.equal(history.body.revisions[1].bodyFormat,'plain');
  }
  const admin=await edit(f,'topic','legacy-topic',{expectedVersion:2,body:'Administrator edit content'},'operator');
  assert.equal(admin.status,200);assert.equal(admin.body.content.version,3);assert.equal(admin.body.content.userId,'author');
  const audited=database(f,db=>db.prepare("SELECT action FROM admin_actions WHERE topic_id='legacy-topic' AND action='edit_topic'").all());assert.equal(audited.length,2);
  await f.restart();assert.equal((await f.app.request(api('topic','legacy-topic','source'))).body.content.version,3);
 }finally{await f.close();}
});

test('M3 protected mutations reject muted or banned accounts and invalid edit boundaries without losing content',async()=>{
 const f=await fixture();try{
  for(const field of ['muted']){
   database(f,db=>db.prepare(`UPDATE users SET ${field}=1 WHERE id='author'`).run());
   assert([401,403].includes((await edit(f,'topic','legacy-topic')).status));
   assert([401,403].includes((await visibility(f,'topic','legacy-topic',true)).status));
   database(f,db=>db.prepare(`UPDATE users SET ${field}=0 WHERE id='author'`).run());
  }
  for(const value of [{expectedVersion:0},{expectedVersion:'1'},{expectedVersion:1.2},{body:'    '},{body:'x'.repeat(12001)},{body:'valid\0bad'},{title:'ab'},{title:'x'.repeat(141)},{bodyFormat:'html'},{language:'original'}]){
   const result=await edit(f,'topic','legacy-topic',value);assert.equal(result.status,400,JSON.stringify(value).slice(0,120));
  }
  assert.equal((await f.app.request(api('topic','legacy-topic','source'))).body.content.version,1);
  assert.equal((await edit(f,'post','legacy-reply',{body:'x'.repeat(6001)},'reader')).status,400);
  const result=await edit(f,'post','legacy-reply',{body:'Edited reply **Markdown**'},'reader');assert.equal(result.status,200);assert.equal(result.body.content.version,2);
  assert.equal((await edit(f,'post','legacy-reply',{},'author')).status,403);
  // Banned sessions are revoked by the server; test this after owner operations.
  database(f,db=>db.prepare("UPDATE users SET banned=1 WHERE id='author'").run());
  const banned=await edit(f,'topic','legacy-topic');assert.equal(banned.status,403);assert.equal(banned.body.code,'account_banned');
  assert.equal((await visibility(f,'topic','legacy-topic',true)).status,401);
 }finally{await f.close();}
});

test('M3 reply Markdown and account-scoped request IDs replay across restart and reject content/account conflicts',async()=>{
 const f=await fixture();try{
  const value={body:'  ## Reply heading\n\nText with **formatting**.  ',bodyFormat:'markdown',clientRequestId:randomUUID()};
  const results=await Promise.all(Array.from({length:6},()=>reply(f,value)));
  assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===200).length,5);
  const id=results[0].body.post.id;assert(results.every(r=>r.body.post.id===id));assert.equal(results[0].body.post.body,value.body);assert.equal(results[0].body.post.bodyFormat,'markdown');assert.equal(results[0].body.post.version,1);
  assert.equal((await reply(f,{...value,body:'Changed replay body'})).body.code,'request_conflict');
  assert.equal((await reply(f,{...value,expectedUserId:'author'})).body.code,'account_changed');
  const another=await reply(f,value,'author');assert.equal(another.status,201);assert.notEqual(another.body.post.id,id);
  await f.restart();const replay=await reply(f,value);assert.equal(replay.status,200);assert.equal(replay.body.post.id,id);assert.equal(replay.body.replayed,true);
  assert.equal((await reply(f,{body:'x'.repeat(6001)})).status,400);
  assert.equal((await reply(f,{bodyFormat:'html'})).status,400);
  assert.equal((await reply(f,{clientRequestId:'not-uuid'})).status,400);
  const snapshot=await detail(f);assert.equal(snapshot.body.topic.replies,3);assert.equal(snapshot.body.posts.find(p=>p.id===id).bodyFormat,'markdown');
  const legacy=snapshot.body.posts.find(p=>p.id==='legacy-reply');assert.equal(legacy.bodyFormat,'plain');assert.equal(legacy.quote,'Legacy quote');
 }finally{await f.close();}
});

test('M3 structured quotes validate same-topic original versions and redact sources after recoverable hiding',async()=>{
 const f=await fixture();try{
  const ref={kind:'post',id:'legacy-reply',version:1,excerpt:'Legacy reply'};
  for(const quotes of [[{...ref,excerpt:'Invented quote'}],[{...ref,version:0}],[{...ref,kind:'topic',id:'other-topic',excerpt:'Other source body'}],Array.from({length:7},()=>ref),[{...ref,excerpt:'x'.repeat(1501)}]])assert.equal((await reply(f,{quotes})).status,400);
  assert.equal((await reply(f,{quotes:[{...ref,version:2}]})).body.code,'quote_version_conflict');
  const made=await reply(f,{quotes:[ref],body:'Response to this source.'},'author');assert.equal(made.status,201);
  assert.deepEqual(made.body.post.quoteRefs,[{...ref,topicId:'legacy-topic',author:'ReaderTest',available:true}]);
  assert.equal((await visibility(f,'post','legacy-reply',true,'author')).status,403);
  assert.equal((await visibility(f,'post','legacy-reply',true,'reader')).status,200);
  for(const action of ['source','history'])assert.equal((await f.app.request(api('post','legacy-reply',action),{cookie:f.tokens.operator})).status,404);
  const snapshot=await detail(f);assert.equal(snapshot.body.topic.replies,1);assert(!snapshot.body.posts.some(p=>p.id==='legacy-reply'));
  const unavailable=snapshot.body.posts.find(p=>p.id===made.body.post.id).quoteRefs[0];assert.equal(unavailable.available,false);assert(!Object.hasOwn(unavailable,'excerpt'));assert(!Object.hasOwn(unavailable,'author'));
  assert.equal((await reply(f,{quotes:[ref]})).status,404);
  assert.equal((await edit(f,'post','legacy-reply',{},'reader')).status,404);
  assert.equal((await visibility(f,'post','legacy-reply',false,'reader')).status,403);
  const hiddenList=await f.app.request(api('topic','legacy-topic','hidden-replies'),{cookie:f.tokens.operator});assert.equal(hiddenList.status,200);assert.equal(hiddenList.body.posts[0].id,'legacy-reply');assert(!Object.hasOwn(hiddenList.body.posts[0],'body'));
  assert.equal((await f.app.request(api('topic','legacy-topic','hidden-replies'),{cookie:f.tokens.reader})).status,403);
  assert.equal((await visibility(f,'post','legacy-reply',false,'operator')).status,200);
  assert.equal((await detail(f)).body.topic.replies,2);assert.equal((await f.app.request(api('post',made.body.post.id,'source'))).body.content.quoteRefs[0].available,true);
  assert.equal((await visibility(f,'topic','legacy-topic',true)).status,200);
  assert.equal((await f.app.request(api('post',made.body.post.id,'source'))).status,404);
  assert.equal((await visibility(f,'topic','legacy-topic',false,'operator')).status,200);
 }finally{await f.close();}
});

function tinyPng(){
 const chunk=(type,data=Buffer.alloc(0))=>{const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);Buffer.from(type).copy(result,4);data.copy(result,8);result.writeUInt32BE(crc32(result.subarray(4,-4)),result.length-4);return result;};
 const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(5))),chunk('IEND')]);
}
test('M3 reply images bind to the reply, survive edits, disappear with hidden parents and recover without duplication',async()=>{
 const f=await fixture();try{
  const image=tinyPng(),upload=await f.app.request('/api/topic-attachments',{method:'POST',cookie:f.tokens.reader,bytes:image,headers:{'x-client-upload-id':randomUUID(),'x-expected-user-id':'reader'}});
  assert.equal(upload.status,201);const attachment=upload.body.attachment;
  assert.equal((await reply(f,{attachmentIds:[attachment.id]},'author')).status,400);
  const made=await reply(f,{attachmentIds:[attachment.id],clientRequestId:randomUUID()});assert.equal(made.status,201);const id=made.body.post.id;
  assert.equal(made.body.post.attachments.length,1);assert.equal((await detail(f)).body.topic.attachments.length,0);
  assert.equal((await f.app.request(attachment.url)).status,200);
  const edited=await edit(f,'post',id,{body:'Reply edited with attached image'},'reader');assert.equal(edited.status,200);assert.equal(edited.body.content.attachments[0].id,attachment.id);
  assert.equal((await reply(f,{attachmentIds:[attachment.id]})).status,400);
  assert.equal((await visibility(f,'post',id,true,'reader')).status,200);assert.equal((await f.app.request(attachment.url)).status,404);
  assert.equal((await visibility(f,'post',id,false,'operator')).status,200);assert.equal((await f.app.request(attachment.url)).status,200);
  assert.equal((await visibility(f,'topic','legacy-topic',true)).status,200);assert.equal((await f.app.request(attachment.url)).status,404);
  assert.equal((await visibility(f,'topic','legacy-topic',false,'operator')).status,200);assert.equal((await f.app.request(attachment.url)).status,200);
  database(f,db=>{assert.equal(db.prepare('SELECT count(*) AS n FROM topic_attachments WHERE post_id=?').get(id).n,1);assert.equal(db.prepare('SELECT count(*) AS n FROM posts WHERE id=?').get(id).n,1);});
 }finally{await f.close();}
});
