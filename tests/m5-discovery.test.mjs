import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import http from 'node:http';
import {performance} from 'node:perf_hooks';
import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {applySchema} from '../schema.mjs';
import {createCommunitySearch} from '../community-search.mjs';
import {createCommunitySEO,safeMarkdownHTML} from '../community-seo.mjs';
import {createCommunityInteractions} from '../community-interactions.mjs';
import {normalizeSearchQuery,makeExcerpt} from '../search-text.mjs';
import {testPort} from './test-port.mjs';

const date='2026-10-01T10:00:00.000Z';
const httpError=(status,code)=>Object.assign(new Error(code),{status,code});
async function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');applySchema(db);
 for(const [id,name]of [['owner','东京用户'],['reader','Reader']])db.prepare('INSERT INTO users(id,name,email,password,salt,created_at) VALUES(?,?,?,?,?,?)').run(id,name,id+'@private.invalid','secret','salt',date);
 const interactions=createCommunityInteractions({db,httpError});for(const id of ['owner','reader'])interactions.handleFor(id);
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 const search=createCommunitySearch({db,json,httpError,interactions}),seo=createCommunitySEO({db,interactions});
 const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(await search.handle(req,res,url)||await seo.handle(req,res,url))return;res.writeHead(404);res.end();}catch(error){json(res,error.status||500,{error:error.code||error.message});}});
 const port=await testPort();await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 return {db,search,seo,async get(route,options={}){const res=await fetch(base+route,options),text=await res.text();return {status:res.status,headers:res.headers,text,body:res.headers.get('content-type')?.includes('json')?JSON.parse(text):null};},topic(id,body='Tokyo electricity bill',options={}){db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at,body_format,hidden,seed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,options.title||'Tokyo生活电费 '+id,body,'excerpt',options.category||'daily','owner','东京用户','东',options.language||'zh-CN',options.date||date,options.date||date,options.format||'plain',options.hidden||0,options.seed||0);},post(id,topic='topic',body='東京 電気 生活情報 한국어 Electricity',options={}){db.prepare('INSERT INTO posts(id,topic_id,user_id,body,language,created_at,body_format,hidden) VALUES(?,?,?,?,?,?,?,?)').run(id,topic,'reader',body,options.language||'en',options.date||date,options.format||'plain',options.hidden||0);},async close(){await new Promise(resolve=>server.close(resolve));db.close();}};
}
const query=(f,values)=>f.get('/api/search?'+new URLSearchParams(values));

test('M5 literal query normalization and safe Unicode snippets',()=>{
 for(const input of ['Tokyo OR secret','東京','전기 요금','"hello"','猫','ab','한글']){const normalized=normalizeSearchQuery(input);assert.equal(normalized.query,input);assert(normalized.terms.length);}
 assert.equal(normalizeSearchQuery('東京').mode,'substring');assert.equal(normalizeSearchQuery('東京電気').mode,'trigram');
 assert.throws(()=>normalizeSearchQuery('a '.repeat(7)));assert.throws(()=>normalizeSearchQuery('字'.repeat(101)));
 assert.equal(makeExcerpt('**東京** [電気](https://example.test)','markdown',[]),'東京 電気');
 const snippet=makeExcerpt('😀'.repeat(300)+'東京','plain',['東京'],40);assert(Array.from(snippet).length<=40);assert(!snippet.includes('\uFFFD'));
});

test('M5 full-corpus multilingual literal search, filters and exact reply source outside250',async()=>{
 const f=await fixture();try{
  f.topic('topic','Original Tokyo electricity bill 日本生活 한국생활');
  for(let i=0;i<300;i++)f.post('reply-'+i,'topic',i===299?'Unique needle 東京 電気 한글 bill':'Ordinary reply');
  f.topic('hidden','Secretneedle',{hidden:1});f.post('secretreply','topic','Secretneedle',{hidden:1});f.topic('seed','Secretneedle',{seed:1});
  for(const q of ['Tokyo','日本','한국','bill','東京','電気','한글']){const result=await query(f,{q});assert.equal(result.status,200);assert(result.body.results.length>0,q);assert(!result.text.includes('@private.invalid'));assert(!result.text.includes('secret"'));}
  const reply=await query(f,{q:'Unique needle',kind:'post'});assert.equal(reply.body.results.length,1);assert.equal(reply.body.results[0].id,'reply-299');assert.equal(reply.body.results[0].url,'/t/topic?post=reply-299');
  assert.equal((await query(f,{q:'Secretneedle'})).body.results.length,0);
  assert.equal((await query(f,{q:'Tokyo OR missing'})).body.results.length,0);
  assert.equal((await query(f,{q:'" OR "'})).status,200);
  assert.equal((await query(f,{q:'Unique',language:'ja'})).body.results.length,0);
  assert.equal((await query(f,{q:'Tokyo',from:'2026-10-02'})).body.results.length,0);
  assert((await query(f,{q:'Tokyo',to:'2026-10-01'})).body.results.length>0);
  assert.equal((await query(f,{q:'Tokyo',category:'housing'})).body.results.length,0);
  f.db.prepare('INSERT INTO topic_tags(topic_id,tag_id) VALUES(?,?)').run('topic','electricity');
  assert((await query(f,{q:'Unique',tag:'electricity'})).body.results.length>0);assert.equal((await query(f,{q:'Unique',tag:'moving'})).body.results.length,0);
  f.db.prepare('INSERT INTO topic_answers(topic_id,post_id,chosen_by,chosen_at) VALUES(?,?,?,?)').run('topic','reply-299','owner',date);
  assert.equal((await query(f,{q:'Unique',solved:'true'})).body.results.length,1);assert.equal((await query(f,{q:'Unique',solved:'false'})).body.results.length,0);
  f.db.prepare("UPDATE posts SET hidden=1 WHERE id='reply-299'").run();assert.equal((await query(f,{q:'Tokyo',solved:'true'})).body.results.length,0);f.db.prepare("UPDATE posts SET hidden=0 WHERE id='reply-299'").run();
  const handle=f.db.prepare("SELECT handle FROM user_handles WHERE user_id='reader'").get().handle;
  assert.equal((await query(f,{q:'Unique',author:handle})).body.results[0].author.handle,handle);
  assert.equal((await query(f,{q:''})).status,400);assert.equal((await query(f,{kind:'post'})).status,200);
  for(const filter of [{from:'2026-02-30'},{solved:'yes'},{category:"daily' OR 1=1"},{cursor:'notvalid!'}])assert.equal((await query(f,{q:'Tokyo',...filter})).status,400);
 }finally{await f.close();}
});

test('M5 index triggers follow edits, rollback, visibility, deletion and parent title changes',async()=>{
 const f=await fixture();try{
  f.topic('topic','initialtoken');f.post('reply','topic','replytoken');
  f.db.prepare("UPDATE topics SET body='changedtoken' WHERE id='topic'").run();assert.equal((await query(f,{q:'initialtoken'})).body.results.length,0);assert.equal((await query(f,{q:'changedtoken'})).body.results.length,1);
  f.db.exec("BEGIN; UPDATE posts SET body='rollbacktoken' WHERE id='reply'; ROLLBACK");assert.equal((await query(f,{q:'rollbacktoken'})).body.results.length,0);assert.equal((await query(f,{q:'replytoken'})).body.results.length,1);
  f.db.prepare("UPDATE topics SET title='newparenttitle',hidden=1 WHERE id='topic'").run();assert.equal((await query(f,{q:'replytoken'})).body.results.length,0);
  f.db.prepare("UPDATE topics SET hidden=0 WHERE id='topic'").run();assert.equal((await query(f,{q:'replytoken'})).body.results[0].title,'newparenttitle');assert.equal((await query(f,{q:'newparenttitle'})).body.results.length,1);
  f.db.prepare("DELETE FROM posts WHERE id='reply'").run();assert.equal((await query(f,{q:'replytoken'})).body.results.length,0);
 }finally{await f.close();}
});

test('M5 stable search cursor bound to filters with visibility before paging',async()=>{
 const f=await fixture();try{
  for(let i=0;i<72;i++)f.topic('topic-'+String(i).padStart(3,'0'),'sharedtoken',{hidden:i%7===0?1:0});
  for(const sort of ['latest','relevance']){
   const all=[],seen=new Set();let cursor='';
   do{const response=await query(f,{q:'sharedtoken',sort,...(cursor?{cursor}:{})});assert.equal(response.status,200);all.push(...response.body.results.map(row=>row.id));cursor=response.body.nextCursor;if(cursor){assert(!seen.has(cursor));seen.add(cursor);assert.equal((await query(f,{q:'different',sort,cursor})).status,400);}}while(cursor);
   assert.equal(all.length,61);assert.equal(new Set(all).size,61);assert(all.every(id=>Number(id.slice(6))%7!==0));
  }
 }finally{await f.close();}
});

test('M5 SEO renders safe original content equally for crawlers and people, real404 and canonical',async()=>{
 const f=await fixture();try{
  f.topic('topic','## Original\n\n**Text** <script>alert(1)</script> [safe](https://example.test) [bad](javascript:alert)',{title:'<img src=x> & "quoted"',format:'markdown'});f.post('visible','topic','Visible reply');f.post('hidden','topic','Privatehiddenreply',{hidden:1});f.topic('gone','Privatehiddentopic',{hidden:1});
  const browser=await f.get('/t/topic?host=attacker.test'),bot=await f.get('/t/topic?host=attacker.test',{headers:{'user-agent':'Googlebot'}});assert.equal(browser.status,200);assert.equal(browser.text,bot.text);assert.match(browser.text,/rel="canonical" href="https:\/\/www.jp-lifebase.com\/t\/topic"/);assert(browser.text.includes('&lt;img src=x&gt;'));assert(browser.text.includes('<strong>Text</strong>'));assert(!browser.text.includes('<script>alert'));assert(!browser.text.includes('href="javascript:'));assert(browser.text.includes('Visible reply'));assert(!browser.text.includes('Privatehiddenreply'));
  for(const id of ['gone','missing']){const result=await f.get('/t/'+id);assert.equal(result.status,404);assert(!result.text.includes('Privatehiddentopic'));assert.equal(result.headers.get('x-robots-tag'),'noindex');}
  assert.equal((await f.get('/t/topic',{method:'HEAD'})).text,'');
  assert(!safeMarkdownHTML('[bad](data:text/html,evil)','markdown').includes('href='));
 }finally{await f.close();}
});

test('M5 sitemap excludes hidden/seed, uses real visible lastmod, bounded pages and fixedwww',async()=>{
 const f=await fixture();try{
  f.topic('topic','Body');f.topic('hidden','Body',{hidden:1});f.topic('seed','Body',{seed:1});f.post('reply','topic','Reply',{date:'2026-10-15T01:00:00.000Z'});f.post('hidden-reply','topic','Hidden',{hidden:1,date:'2026-10-19T01:00:00.000Z'});
  const index=await f.get('/sitemap.xml');assert.match(index.text,/<sitemapindex/);assert(index.text.includes('sitemap-topics.xml?page=1'));assert(!index.text.includes('127.0.0.1'));
  const topics=await f.get('/sitemap-topics.xml?page=1');assert(topics.text.includes('/t/topic'));assert(!topics.text.includes('/t/hidden'));assert(!topics.text.includes('/t/seed'));assert(topics.text.includes('2026-10-15T01:00:00.000Z'));assert(!topics.text.includes('2026-10-19'));
  assert.equal((await f.get('/sitemap-topics.xml?page=0')).status,400);assert.equal((await f.get('/sitemap-topics.xml?page=2')).status,404);
 }finally{await f.close();}
});

test('M5 synthetic10000-doc performance records actual search latency',async()=>{
 const f=await fixture();try{
  f.db.exec('BEGIN');for(let i=0;i<10000;i++)f.topic('sample-'+i,'Tokyo electricity bill 東京電気 multilingual sample '+i);f.db.exec('COMMIT');
  const timings={documents:10000,storage:'in-memory SQLite; real localhost HTTP',trigram:[],substring:[]};
  for(let i=0;i<5;i++)for(const [mode,q]of [['trigram','electricity'],['substring','東京']]){const start=performance.now(),response=await query(f,{q,sort:'latest'});timings[mode].push(Number((performance.now()-start).toFixed(2)));assert.equal(response.status,200);assert.equal(response.body.results.length,30);}
  await mkdir(new URL('../artifacts/m5/',import.meta.url),{recursive:true});await writeFile(new URL('../artifacts/m5/search-performance.json',import.meta.url),JSON.stringify(timings,null,2));
 }finally{await f.close();}
});

test('M5 original search index survives database close/reopen and ignores old revisions/translations',async()=>{
 const f=await fixture();let reopened;const parent=new URL('../artifacts/test-tmp/',import.meta.url);await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(fileURLToPath(parent),'m5-reopen-'));
 try{
  f.topic('topic','currentoriginaltoken');
  f.db.prepare('INSERT INTO content_revisions(kind,content_id,version,body,body_format,language,editor_id,edited_at) VALUES(?,?,?,?,?,?,?,?)').run('topic','topic',1,'historicprivatetoken','plain','en','owner',date);
  f.db.prepare('INSERT INTO translations(cache_key,value,created_at) VALUES(?,?,?)').run('private','machinetranslationtoken',date);
  const filename=path.join(directory,'community.sqlite');f.db.prepare('VACUUM INTO ?').run(filename);reopened=new DatabaseSync(filename);applySchema(reopened);
  const search=createCommunitySearch({db:reopened,httpError});
  assert.equal(search.search(new URLSearchParams({q:'currentoriginaltoken'})).results.length,1);
  for(const q of ['historicprivatetoken','machinetranslationtoken'])assert.equal(search.search(new URLSearchParams({q})).results.length,0);
 }finally{reopened?.close();await f.close();assert(path.basename(directory).startsWith('m5-reopen-'));await rm(directory,{recursive:true,force:true});}
});
