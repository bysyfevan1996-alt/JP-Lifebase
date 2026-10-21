import {testPort} from './test-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseMarkdown} from '../dist/markdown-core.js';

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
 db.prepare('INSERT INTO topics VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('legacy-topic','Legacy title','A bill is 9,715 yen for 303 kWh. See https://example.test/2026/09?q=9715','Legacy excerpt','daily','author','AuthorTest','A',0,0,'en',0,date,date);
 db.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?,?)').run('legacy-reply','legacy-topic','reader','Reply body 123','Legacy quote must remain original 789','en',date);
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
 async function request(route,{method='GET',value,cookie='',origin=base}={}){
  const response=await fetch(base+route,{method,headers:{...(method==='GET'?{}:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})}),...(cookie?{Cookie:cookie}:{})},body:value===undefined?undefined:JSON.stringify(value)});
  return {status:response.status,body:await response.json(),headers:response.headers};
 }
 const stop=()=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>{child.once('exit',resolve);child.kill();});
 return {base,request,stop};
}
async function fixture(extraEnv={}){
 await mkdir(temporaryRoot,{recursive:true});const directory=await mkdtemp(path.join(temporaryRoot,'m3-translation-'));
 const tokens=legacyFixture(directory);let app;
 try{app=await launch(directory,extraEnv);}catch(error){await rm(directory,{recursive:true,force:true});throw error;}
 const context={directory,tokens,app};
 context.restart=async()=>{await context.app.stop();context.app=await launch(directory,extraEnv);};
 context.close=async()=>{await context.app.stop();assert(path.resolve(directory).startsWith(temporaryRoot+path.sep+'m3-translation-'));await rm(directory,{recursive:true,force:true});};
 return context;
}
function database(context,work){const db=new DatabaseSync(path.join(context.directory,'community.sqlite'));try{return work(db);}finally{db.close();}}
async function provider(transform=items=>Object.fromEntries(Object.entries(items).map(([key,value])=>[key,'Translated: '+value]))){
 const calls=[];
 const server=http.createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=JSON.parse(Buffer.concat(chunks).toString('utf8')),items=JSON.parse(request.messages[1].content);calls.push({items,request});
   const output=await transform(items,request,res);
   if(!res.writableEnded){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}));}
  }catch{if(!res.writableEnded){res.writeHead(500);res.end();}}
 });
 const port=await testPort();await new Promise(resolve=>server.listen(Number(port),'127.0.0.1',resolve));
 return {calls,env:{TRANSLATION_BASE_URL:'http://127.0.0.1:'+server.address().port,TRANSLATION_API_KEY:'isolated-test-only',TRANSLATION_MODEL:'isolated-test-only'},close:()=>new Promise(resolve=>server.close(resolve))};
}
const translate=(f,target='ja',expectedVersion=1,kind='topic',id='legacy-topic',cookie='')=>f.app.request(`/api/content/${kind}/${id}/translate`,{method:'POST',cookie,value:{target,expectedVersion}});
const edit=(f,value={})=>f.app.request('/api/content/topic/legacy-topic/edit',{method:'POST',cookie:f.tokens.author,value:{expectedVersion:1,expectedUserId:'author',body:'Updated original content 456',bodyFormat:'plain',language:'en',...value}});
const hide=(f,hidden=true)=>f.app.request('/api/content/topic/legacy-topic/visibility',{method:'POST',cookie:f.tokens.author,value:{hidden,expectedUserId:'author'}});

test('M3 translation requires explicit clicks including five UI languages, protects numbers and URLs, caches by version and survives restart',async()=>{
 const p=await provider(),f=await fixture(p.env);try{
  const changed=await edit(f,{body:'Original body 303 at https://example.test/2026/09',language:'und'});assert.equal(changed.status,200);
  for(const target of ['ja','en','ko','zh-CN','zh-TW','fr']){
   const ordinary=await f.app.request('/api/topics/legacy-topic?lang='+target);assert.equal(ordinary.status,200);assert.equal(ordinary.body.topic.body,changed.body.content.body);
  }
  assert.equal(p.calls.length,0,'browsing must not translate user content');
  for(const target of ['ja','en','ko','zh-CN','zh-TW']){
   const out=await translate(f,target,2);assert.equal(out.status,200);assert.equal(out.body.content.automatic,true);assert.equal(out.body.content.language,target);assert.equal(out.body.content.sourceLanguage,'und');assert.equal(out.body.content.version,2);assert.equal(out.body.content.fromCache,false);
   assert.equal(out.body.content.body,'Translated: '+changed.body.content.body);
   assert.equal((await translate(f,target,2)).body.content.fromCache,true);
  }
  assert.equal(p.calls.length,5);assert(p.calls.every(call=>!JSON.stringify(call.items).includes('303')&&!JSON.stringify(call.items).includes('https://example.test')));
  await f.restart();assert.equal((await translate(f,'ja',2)).body.content.fromCache,true);assert.equal(p.calls.length,5);
  const update=await edit(f,{expectedVersion:2,body:'Newer content 555 with https://example.test/new',language:'und'});assert.equal(update.status,200);assert.equal(update.body.content.version,3);
  assert.equal((await translate(f,'ja',2)).body.code,'revision_conflict');
  const fresh=await translate(f,'ja',3);assert.equal(fresh.status,200);assert.equal(fresh.body.content.version,3);assert.equal(fresh.body.content.fromCache,false);assert.equal(fresh.body.content.body,'Translated: '+update.body.content.body);assert.equal(p.calls.length,6);
 }finally{await f.close();await p.close();}
});

test('M3 Markdown translation keeps safe document structure, code, links, numbers and quoted text original',async()=>{
 const p=await provider(),f=await fixture(p.env);try{
  const markdown='## Heading 303\n\nText **bold 9715** [link](https://example.test/bill/303) and `const fixed = 2026;`.\n\n> Quoted source 444 must stay original\n\n```js\nconst unchanged = 555;\n```\n\n- List item 17';
  assert.equal((await edit(f,{body:markdown,bodyFormat:'markdown'})).status,200);
  const translated=await translate(f,'ko',2);assert.equal(translated.status,200);const content=translated.body.content;
  assert.equal(content.bodyFormat,'markdown');assert.equal(content.automatic,true);assert(!Object.hasOwn(content,'body'));assert.equal(content.document.version,1);
  const original=parseMarkdown(markdown),out=content.document;
  const shape=node=>({type:node.type,...(node.href?{href:node.href}:{}),...(node.start?{start:node.start}:{}),...(node.children?{children:node.children.map(shape)}:{})});
  assert.deepEqual(out.blocks.map(shape),original.blocks.map(shape));
  assert.deepEqual(out.blocks.find(n=>n.type==='pre'),original.blocks.find(n=>n.type==='pre'));
  assert.deepEqual(out.blocks.find(n=>n.type==='blockquote'),original.blocks.find(n=>n.type==='blockquote'));
  const walk=(node,type)=>[...(node.type===type?[node]:[]),...(node.children||[]).flatMap(child=>walk(child,type))];
  assert.deepEqual(out.blocks.flatMap(n=>walk(n,'code')),original.blocks.flatMap(n=>walk(n,'code')));
  assert.equal(out.blocks.flatMap(n=>walk(n,'link'))[0].href,'https://example.test/bill/303');
  assert(JSON.stringify(out).includes('Translated: Heading 303'));assert(JSON.stringify(out).includes('9715'));
  const sent=JSON.stringify(p.calls.map(call=>call.items));for(const protectedText of ['const unchanged','const fixed','Quoted source','https://example.test','9715'])assert(!sent.includes(protectedText),protectedText);
  const reply=await translate(f,'ja',1,'post','legacy-reply');assert.equal(reply.status,200);assert.equal(reply.body.content.body,'Translated: Reply body 123');
  assert(!JSON.stringify(p.calls.map(call=>call.items)).includes('Legacy quote must remain original'));
 }finally{await f.close();await p.close();}
});

test('M3 same-language translation is original, invalid requests fail, and provider/structure errors preserve retriable original',async()=>{
 let fail=true;
 const p=await provider((items,request,res)=>{if(fail){res.writeHead(503);res.end();return;}return Object.fromEntries(Object.entries(items).map(([key,value])=>[key,'Translated: '+value]));}),f=await fixture(p.env);
 try{
  const same=await translate(f,'en');assert.equal(same.status,200);assert.equal(same.body.content.automatic,false);assert.equal(p.calls.length,0);
  for(const target of ['original','und','bad_tag'])assert.equal((await translate(f,target)).status,400);
  assert.equal((await translate(f,'ja',0)).status,400);assert.equal((await translate(f,'ja',2)).status,409);
  const origin=await f.app.request('/api/content/topic/legacy-topic/translate',{method:'POST',origin:'https://other.test',value:{target:'ja',expectedVersion:1}});assert.equal(origin.body.code,'invalid_origin');
  const failed=await translate(f);assert.equal(failed.status,503);assert.equal(failed.body.code,'translation_unavailable');
  assert.equal((await f.app.request('/api/content/topic/legacy-topic/source')).body.content.body,same.body.content.body);
  database(f,db=>assert.equal(db.prepare('SELECT count(*) AS n FROM content_translations').get().n,0));
  fail=false;const retry=await translate(f);assert.equal(retry.status,200);assert.equal(retry.body.content.automatic,true);assert.equal(retry.body.content.fromCache,false);
 }finally{await f.close();await p.close();}
 const corrupt=await provider(items=>Object.fromEntries(Object.keys(items).map(key=>[key,'Broken output deletes all placeholders']))),g=await fixture(corrupt.env);
 try{
  const failed=await translate(g);assert.equal(failed.status,503);assert.equal(failed.body.code,'translation_structure_invalid');
  database(g,db=>assert.equal(db.prepare('SELECT count(*) AS n FROM content_translations').get().n,0));
  assert((await g.app.request('/api/content/topic/legacy-topic/source')).body.content.body.includes('9,715'));
 }finally{await g.close();await corrupt.close();}
});

test('M3 translation quotas bind account and IP and global budget failures do not cache results',async()=>{
 const p=await provider(),f=await fixture(p.env);try{
  assert.equal((await translate(f,'ja',1,'topic','legacy-topic',f.tokens.author)).status,200);
  database(f,db=>{const rows=db.prepare('SELECT principal,requests FROM content_translation_quotas').all();assert(rows.some(r=>r.principal==='user:author'));assert(rows.some(r=>r.principal.startsWith('ip:')));db.prepare("UPDATE content_translation_quotas SET requests=180 WHERE principal='user:author'").run();});
  const account=await translate(f,'ko',1,'topic','legacy-topic',f.tokens.author);assert.equal(account.status,429);assert.equal(account.body.code,'content_translation_limit');
  assert.equal((await translate(f,'ko')).status,200,'an exhausted account alone must not exhaust the shared IP');
  database(f,db=>db.prepare("UPDATE content_translation_quotas SET requests=120 WHERE principal LIKE 'ip:%'").run());
  const ip=await translate(f,'zh-CN');assert.equal(ip.status,429);assert.equal(ip.body.code,'content_translation_limit');assert.equal(p.calls.length,2);
 }finally{await f.close();await p.close();}
 const budgetProvider=await provider(),g=await fixture({...budgetProvider.env,TRANSLATION_DAILY_CHAR_LIMIT:'5'});try{
  const budget=await translate(g);assert.equal(budget.status,429);assert.equal(budget.body.code,'translation_daily_limit');assert.equal(budgetProvider.calls.length,0);
  database(g,db=>assert.equal(db.prepare('SELECT count(*) AS n FROM content_translations').get().n,0));
 }finally{await g.close();await budgetProvider.close();}
});

test('M3 translation rereads visibility and revision after provider await and never publishes stale or hidden content',async()=>{
 for(const action of ['hide','edit']){
  let release,seen;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{seen=resolve;});
  const p=await provider(async items=>{seen();await gate;return Object.fromEntries(Object.entries(items).map(([key,value])=>[key,'Translated: '+value]));}),f=await fixture(p.env);
  try{
   const waiting=translate(f);await entered;
   if(action==='hide')assert.equal((await hide(f)).status,200);else assert.equal((await edit(f)).status,200);
   release();const out=await waiting;assert.equal(out.status,action==='hide'?404:409);assert.equal(out.body.code,action==='hide'?'content_not_found':'revision_conflict');
   database(f,db=>assert.equal(db.prepare('SELECT count(*) AS n FROM content_translations').get().n,0));
   if(action==='hide'){const before=p.calls.length;assert.equal((await translate(f)).status,404);assert.equal(p.calls.length,before);}
  }finally{release();await f.close();await p.close();}
 }
});
