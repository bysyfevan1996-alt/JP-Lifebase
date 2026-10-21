import {testPort} from './test-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
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
 db.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?,?)').run('legacy-reply','legacy-topic','reader','Legacy reply','Legacy quote','en',date);
 db.close();return tokens;
}

async function launch(directory,translationUrl){
 const env={...process.env,PORT:await testPort(),COOKIE_SECURE:'0',JPL_DATA_DIR:directory,JPL_SEED:'0',NODE_ENV:'test',JPL_TEST_MAIL_OUTBOX:'0'};
 for(const key of Object.keys(env))if(/^(TRANSLATION_|RESEND_|MAIL_)/.test(key)||key==='AUTH_TOKEN_SECRET')delete env[key];
 if(translationUrl)Object.assign(env,{TRANSLATION_BASE_URL:translationUrl,TRANSLATION_API_KEY:'isolated-test-only',TRANSLATION_MODEL:'isolated-test-only'});
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',bytes=>errors+=bytes);
 const base=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill();reject(new Error('Startup timeout: '+errors));},10000);
  child.stdout.on('data',bytes=>{const match=String(bytes).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
  child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code+': '+errors));});
 });
 async function request(route,{method='GET',value,cookie='',origin=base}={}){
  const response=await fetch(base+route,{method,headers:{...(method==='GET'?{}:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})}),...(cookie?{Cookie:cookie}:{})},body:value===undefined?undefined:JSON.stringify(value)});
  return {status:response.status,body:await response.json(),headers:response.headers};
 }
 const stop=()=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>{child.once('exit',resolve);child.kill();});
 return {base,request,stop};
}

async function fixture(translationUrl){
 await mkdir(temporaryRoot,{recursive:true});
 const directory=await mkdtemp(path.join(temporaryRoot,'topic-posting-'));
 const tokens=legacyFixture(directory);
 let app;
 try{app=await launch(directory,translationUrl);}catch(error){assert(path.resolve(directory).startsWith(temporaryRoot+path.sep+'topic-posting-'));await rm(directory,{recursive:true,force:true});throw error;}
 const context={directory,tokens,app};
 context.restart=async()=>{await context.app.stop();context.app=await launch(directory,translationUrl);};
 context.close=async()=>{await context.app.stop();assert(path.resolve(directory).startsWith(temporaryRoot+path.sep+'topic-posting-'));await rm(directory,{recursive:true,force:true});};
 return context;
}

function inspect(directory,work){
 const db=new DatabaseSync(path.join(directory,'community.sqlite'),{readOnly:true});
 try{return work(db);}finally{db.close();}
}

const payload=(extra={})=>({title:'New topic title',body:'This is the topic body.',category:'daily',language:'en',...extra});
const create=(context,value,cookie=context.tokens.author)=>context.app.request('/api/topics',{method:'POST',value,cookie});

test('old topics default to plain and posting validates formats, whitespace and existing permissions',async()=>{
 const context=await fixture();
 try{
  let detail=await context.app.request('/api/topics/legacy-topic?lang=original');
  assert.equal(detail.body.topic.bodyFormat,'plain');assert.equal(detail.body.topic.body,'<b>Legacy literal text</b>');
  assert(detail.body.posts.every(post=>post.bodyFormat==='plain'));assert.equal(detail.body.posts.length,2);
  inspect(context.directory,db=>{
   const column=db.prepare('PRAGMA table_info(topics)').all().find(column=>column.name==='body_format');
   assert.equal(column.dflt_value,"'plain'");assert.equal(column.notnull,1);
   assert.equal(db.prepare('SELECT body_format FROM topics WHERE id=?').get('legacy-topic').body_format,'plain');
  });
  for(const bodyFormat of [null,'','html',false,[],{}])assert.equal((await create(context,payload({bodyFormat}))).body.code,'invalid_body_format');
  for(const clientRequestId of [null,'','not-a-uuid',' '+randomUUID(),randomUUID().replaceAll('-',''),'00000000-0000-4000-0000-000000000000',42]){
   const rejected=await create(context,payload({clientRequestId}));assert.equal(rejected.status,400);assert.equal(rejected.body.code,'invalid_client_request_id');
  }
  for(const body of [' 1234 ','\0valid body',(' '+('x'.repeat(12000)))])assert.equal((await create(context,payload({body,bodyFormat:'markdown'}))).status,400);
  for(const expectedUserId of ['author',null,42,{},'']){
   const changed=await create(context,payload({expectedUserId,clientRequestId:randomUUID()}),context.tokens.reader);
   assert.equal(changed.status,409);assert.equal(changed.body.code,'account_changed');
  }
  inspect(context.directory,db=>{assert.equal(db.prepare('SELECT count(*) AS n FROM topics').get().n,1);assert.equal(db.prepare('SELECT count(*) AS n FROM topic_create_requests').get().n,0);});
  const plain=await create(context,payload({body:'  Plain body with spaces  '}));
  assert.equal(plain.status,201);assert.equal(plain.body.replayed,false);assert.equal(plain.body.topic.body,'Plain body with spaces');assert.equal(plain.body.topic.bodyFormat,'plain');
  const raw='  ## Heading\n\n    indented code\n\n  ';
  const markdown=await create(context,payload({body:raw,bodyFormat:'markdown'}));
  assert.equal(markdown.status,201);assert.equal(markdown.body.topic.body,raw);assert.equal(markdown.body.topic.bodyFormat,'markdown');
  detail=await context.app.request('/api/topics/'+markdown.body.topic.id+'?lang=original');
  assert.equal(detail.body.posts.length,1);assert.equal(detail.body.topic.replies,0);assert.equal(detail.body.posts[0].body,raw);assert.equal(detail.body.posts[0].bodyFormat,'markdown');
  const listed=await context.app.request('/api/topics?lang=original');assert.equal(listed.body.topics.find(topic=>topic.id===markdown.body.topic.id).bodyFormat,'markdown');
  for(const lang of ['ja','en','ko','zh-CN','zh-TW']){
   const manual=await context.app.request('/api/topics/'+markdown.body.topic.id+'?lang='+lang);
   assert.equal(manual.body.topic.body,raw);assert.equal(manual.body.translation.automatic,false);assert.equal(manual.body.translation.unavailable,false);
  }
  const unavailable=await context.app.request('/api/topics/'+markdown.body.topic.id+'?lang=fr');
  assert.equal(unavailable.body.topic.body,raw);assert.equal(unavailable.body.translation.unavailable,true);assert.equal(unavailable.body.topic.original.bodyFormat,'markdown');
  const repeatedLegacy=await create(context,payload({body:'  Plain body with spaces  ',bodyFormat:'plain'}));
  assert.equal(repeatedLegacy.status,201);assert.notEqual(repeatedLegacy.body.topic.id,plain.body.topic.id);
  const boundary=await create(context,payload({body:' '+('x'.repeat(12000))+' '}));
  assert.equal(boundary.status,201);assert.equal(boundary.body.topic.body.length,12000);
  await context.restart();
  const markdownBoundary=await create(context,payload({body:('x'.repeat(11998))+'  ',bodyFormat:'markdown'}));
  assert.equal(markdownBoundary.status,201);assert.equal(markdownBoundary.body.topic.body.length,12000);assert(markdownBoundary.body.topic.body.endsWith('  '));
  const plainRequest=payload({body:'  Canonical plain body  ',clientRequestId:randomUUID()});
  const canonicalPlain=await create(context,plainRequest);
  assert.equal(canonicalPlain.status,201);
  const explicitPlain=await create(context,{...plainRequest,body:'Canonical plain body',bodyFormat:'plain'});
  assert.equal(explicitPlain.status,200);assert.equal(explicitPlain.body.topic.id,canonicalPlain.body.topic.id);
  assert.equal((await create(context,payload(),'')).status,401);
  assert.equal((await create(context,payload({category:'site'}))).status,400);
  assert.equal((await create(context,payload({category:'not-a-category'}))).status,400);
  for(const origin of ['https://other.test',context.app.base.replace('127.0.0.1','localhost'),null]){
   assert.equal((await context.app.request('/api/topics',{method:'POST',value:payload(),cookie:context.tokens.author,origin})).body.code,'invalid_origin');
  }
  assert.equal((await create(context,payload({category:'site'}),context.tokens.operator)).status,201);
  detail=await context.app.request('/api/topics/legacy-topic?lang=original');assert.equal(detail.body.topic.bodyFormat,'plain');assert.equal(detail.body.posts.length,2);
 }finally{await context.close();}
});

test('account-scoped topic requests replay concurrently and after restart without consuming topic limits or making replies',async()=>{
 const context=await fixture();
 try{
  const value=payload({body:'  ## One original topic\n\nOriginal body.  ',bodyFormat:'markdown',clientRequestId:randomUUID()});
  const concurrent=await Promise.all(Array.from({length:10},()=>create(context,value)));
  assert.equal(concurrent.filter(result=>result.status===201).length,1);assert.equal(concurrent.filter(result=>result.status===200).length,9);
  const id=concurrent[0].body.topic.id,updatedAt=concurrent[0].body.topic.updatedAt;
  assert(concurrent.every(result=>result.body.topic.id===id));assert.equal(concurrent.filter(result=>result.body.replayed).length,9);
  const canonical=await create(context,{...value,title:' '+value.title+' ',language:'EN',clientRequestId:value.clientRequestId.toUpperCase()});
  assert.equal(canonical.status,200);assert.equal(canonical.body.topic.id,id);
  const expectedAccount=await create(context,{...value,expectedUserId:'author'});assert.equal(expectedAccount.status,200);assert.equal(expectedAccount.body.topic.id,id);
  for(const changed of [{title:'A changed topic title'},{body:value.body+' changed'},{category:'work'},{language:'ja'},{bodyFormat:'plain'}]){
   const conflict=await create(context,{...value,...changed});assert.equal(conflict.status,409);assert.equal(conflict.body.code,'request_conflict');
  }
  const otherAccount=await create(context,value,context.tokens.reader);
  assert.equal(otherAccount.status,201);assert.notEqual(otherAccount.body.topic.id,id);
  for(let index=0;index<3;index++)assert.equal((await create(context,{...value,clientRequestId:randomUUID()})).status,201);
  for(let index=0;index<12;index++){
   const replay=await create(context,value);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.topic.updatedAt,updatedAt);
  }
  const limited=await create(context,{...value,clientRequestId:randomUUID()});assert.equal(limited.status,429);assert.equal(limited.body.code,'rate_limited');
  assert(Number(limited.headers.get('retry-after'))>0);assert.equal((await create(context,value)).status,200);
  inspect(context.directory,db=>{
   assert.equal(db.prepare('SELECT count(*) AS n FROM topics WHERE id=?').get(id).n,1);
   assert.equal(db.prepare('SELECT count(*) AS n FROM topic_create_requests WHERE client_request_id=?').get(value.clientRequestId).n,2);
   assert.equal(db.prepare('SELECT count(*) AS n FROM posts WHERE topic_id=?').get(id).n,0);
  });
  await context.restart();
  const persisted=await create(context,value);assert.equal(persisted.status,200);assert.equal(persisted.body.topic.id,id);assert.equal(persisted.body.topic.updatedAt,updatedAt);
  const reply=await context.app.request('/api/topics/'+id+'/replies',{method:'POST',cookie:context.tokens.reader,value:{body:'One actual reply',language:'en'}});
  assert.equal(reply.status,201);assert.equal(reply.body.post.bodyFormat,'plain');
  const before=await context.app.request('/api/topics/'+id+'?lang=original');
  const afterReplay=await create(context,value);assert.equal(afterReplay.status,200);assert.equal(afterReplay.body.topic.replies,1);assert.equal(afterReplay.body.topic.updatedAt,before.body.topic.updatedAt);
  const after=await context.app.request('/api/topics/'+id+'?lang=original');assert.equal(after.body.posts.length,2);assert.equal(after.body.posts[1].bodyFormat,'plain');
 }finally{await context.close();}
});

test('hidden and author-removed requests stay inaccessible and retain recoverable receipts',async()=>{
 const context=await fixture();
 try{
  const value=payload({bodyFormat:'markdown',clientRequestId:randomUUID()}),created=await create(context,value),id=created.body.topic.id;
  const moderate=hidden=>context.app.request('/api/admin/topics/'+id,{method:'POST',cookie:context.tokens.operator,value:{hidden}});
  assert.equal((await moderate(true)).status,200);
  const hidden=await create(context,value);assert.equal(hidden.status,404);assert.equal(hidden.body.code,'topic_not_found');assert.equal(hidden.body.topic,undefined);
  assert.equal((await context.app.request('/api/topics/'+id+'?lang=original')).status,404);
  assert.equal((await moderate(false)).status,200);assert.equal((await create(context,value)).body.topic.id,id);
  assert.equal((await context.app.request('/api/topics/'+id,{method:'DELETE',cookie:context.tokens.reader})).status,403);
  assert.equal((await context.app.request('/api/topics/'+id,{method:'DELETE',cookie:context.tokens.author})).status,200);
  let removed=await create(context,value);assert.equal(removed.status,404);assert.equal(removed.body.code,'topic_not_found');
  inspect(context.directory,db=>{
   assert.equal(db.prepare('SELECT topic_id FROM topic_create_requests WHERE user_id=? AND client_request_id=?').get('author',value.clientRequestId).topic_id,id);
   assert.equal(db.prepare('SELECT hidden FROM topics WHERE id=?').get(id).hidden,1);
  });
  await context.restart();assert.equal((await create(context,value)).status,404);
  assert.equal((await create(context,{...value,title:'Changed after deletion'})).body.code,'request_conflict');
  assert.equal((await moderate(false)).status,200);assert.equal((await create(context,value)).body.topic.id,id);
  // Legacy permanently removed receipts still must not recreate a topic.
  const removedDb=new DatabaseSync(path.join(context.directory,'community.sqlite'));
  try{removedDb.exec('PRAGMA foreign_keys=ON');removedDb.prepare('DELETE FROM topics WHERE id=?').run(id);}finally{removedDb.close();}
  const gone=await create(context,value);assert.equal(gone.status,410);assert.equal(gone.body.code,'request_gone');
  assert.equal((await context.app.request('/api/topics?lang=original')).body.topics.length,1);
 }finally{await context.close();}
});

test('maintained tags persist in detail and list, and server filtering happens before the result limit',async()=>{
 const context=await fixture();
 try{
  const catalog=await context.app.request('/api/tags');
  assert.equal(catalog.status,200);assert.equal(catalog.body.tags.length,15);
  assert(catalog.body.tags.some(tag=>tag.id==='visa'&&tag.labelKey==='tagVisa'));
  for(const tagIds of [null,['unknown'],['visa','visa'],['rent','moving','electricity','gas','visa','residence']]){
   const invalid=await create(context,payload({tagIds,clientRequestId:randomUUID()}));
   assert.equal(invalid.status,400);assert.equal(invalid.body.code,'invalid_tags');
  }
  const input=payload({tagIds:['visa','moving'],bodyFormat:'markdown',clientRequestId:randomUUID()});
  const tagged=await create(context,input),id=tagged.body.topic.id;
  assert.equal(tagged.status,201);assert.deepEqual(tagged.body.topic.tagIds,['moving','visa']);
  const replay=await create(context,{...input,tagIds:['moving','visa']});
  assert.equal(replay.status,200);assert.equal(replay.body.topic.id,id);
  const changed=await create(context,{...input,tagIds:['visa']});
  assert.equal(changed.status,409);assert.equal(changed.body.code,'request_conflict');
  const detail=await context.app.request('/api/topics/'+id+'?lang=original');
  assert.deepEqual(detail.body.topic.tagIds,['moving','visa']);
  const untagged=await create(context,payload({tagIds:['food']}));assert.equal(untagged.status,201);
  const db=new DatabaseSync(path.join(context.directory,'community.sqlite'));
  try{
   const insert=db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,tone,pinned,language,seed,created_at,updated_at,body_format) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
   db.exec('BEGIN IMMEDIATE');
   for(let index=0;index<251;index++)insert.run(randomUUID(),'Newer unrelated topic','Unrelated test body','Unrelated test excerpt','daily','author','AuthorTest','A',0,0,'en',0,'9999-01-01T00:00:00.000Z','9999-01-01T00:00:00.000Z','plain');
   db.exec('COMMIT');
  }finally{db.close();}
  const limited=await context.app.request('/api/topics?lang=original');
  assert.equal(limited.body.topics.length,250);assert(!limited.body.topics.some(topic=>topic.id===id));
  const filtered=await context.app.request('/api/topics?tag=visa&lang=original');
  assert.equal(filtered.status,200);assert.deepEqual(filtered.body.topics.map(topic=>topic.id),[id]);
  assert.equal((await context.app.request('/api/topics?tag=unknown')).status,400);
  await context.restart();
  assert.deepEqual((await context.app.request('/api/topics/'+id+'?lang=original')).body.topic.tagIds,['moving','visa']);
  assert.equal((await context.app.request('/api/admin/topics/'+id,{method:'POST',cookie:context.tokens.operator,value:{hidden:true}})).status,200);
  assert.deepEqual((await context.app.request('/api/topics?tag=visa&lang=original')).body.topics,[]);
  inspect(context.directory,db=>{assert.equal(db.prepare('SELECT count(*) AS n FROM topic_tags WHERE topic_id=?').get(id).n,2);});
 }finally{await context.close();}
});

test('automatic translation preserves Markdown bodies and format while translating ordinary text and replies',async()=>{
 const calls=[];
 const provider=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=JSON.parse(Buffer.concat(chunks).toString('utf8')),items=JSON.parse(request.messages[1].content);calls.push(items);
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(Object.fromEntries(Object.entries(items).map(([key,value])=>[key,'French: '+value])))}}]}));
 });
 const providerPort=await testPort();
 await new Promise(resolve=>provider.listen(Number(providerPort),'127.0.0.1',resolve));
 let context;
 try{
  context=await fixture('http://127.0.0.1:'+provider.address().port);
  const raw='  ## Markdown heading\n\n'+('content '.repeat(30))+'\n\n    code must stay intact  ';
  const created=await create(context,payload({body:raw,bodyFormat:'markdown',clientRequestId:randomUUID()})),id=created.body.topic.id;
  const detail=await context.app.request('/api/topics/'+id+'?lang=fr');
  assert.equal(detail.status,200);assert.equal(detail.body.topic.body,raw);assert.equal(detail.body.topic.bodyFormat,'markdown');assert(detail.body.topic.title.startsWith('French: '));
  assert.equal(detail.body.topic.original.body,raw);assert.equal(detail.body.topic.original.bodyFormat,'markdown');
  assert.equal(detail.body.posts[0].body,raw);assert.equal(detail.body.posts[0].original.bodyFormat,'markdown');assert.equal(detail.body.posts[0].translation.automatic,false);
  assert.equal(detail.body.topic.translation.unavailable,true);assert.equal(detail.body.translation.unavailable,true);assert.equal(detail.body.translation.automatic,true);
  assert(calls.length>0);assert(calls.every(items=>Object.keys(items).every(key=>!key.endsWith('_body'))));
  assert(calls.every(items=>!Object.values(items).includes(raw)));
  const callCount=calls.length;
  for(const lang of ['original','ja','en','ko','zh-CN','zh-TW'])assert.equal((await context.app.request('/api/topics/'+id+'?lang='+lang)).body.topic.body,raw);
  assert.equal(calls.length,callCount);
  assert.equal((await context.app.request('/api/topics/'+id+'/replies',{method:'POST',cookie:context.tokens.reader,value:{body:'Reply to translate',language:'en'}})).status,201);
  const withReply=await context.app.request('/api/topics/'+id+'?lang=fr');
  assert.equal(withReply.body.topic.body,raw);assert.equal(withReply.body.translation.unavailable,true);assert.equal(withReply.body.posts[1].body,'French: Reply to translate');assert.equal(withReply.body.posts[1].original.bodyFormat,'plain');
  const plain=await create(context,payload({body:'Ordinary body to translate',bodyFormat:'plain'}));
  const translated=await context.app.request('/api/topics/'+plain.body.topic.id+'?lang=fr');
  assert.equal(translated.body.topic.body,'French: Ordinary body to translate');assert.equal(translated.body.topic.original.body,'Ordinary body to translate');assert.equal(translated.body.topic.original.bodyFormat,'plain');assert.equal(translated.body.translation.unavailable,false);
 }finally{if(context)await context.close();await new Promise(resolve=>provider.close(resolve));}
});
