import {testPort} from './test-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {request as httpRequest} from 'node:http';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';

import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const testTemp=path.join(root,'artifacts','test-tmp');
await mkdir(testTemp,{recursive:true});
async function launch(dataDir){
 const env={...process.env,PORT:await testPort(),COOKIE_SECURE:'0',JPL_DATA_DIR:dataDir,JPL_SEED:'0',ADMIN_EMAIL:'owner@example.test',NODE_ENV:'test',JPL_TEST_MAIL_OUTBOX:'1'};for(const key of Object.keys(env))if(key.startsWith('TRANSLATION_')||key.startsWith('RESEND_')||key.startsWith('MAIL_')||key==='AUTH_TOKEN_SECRET')delete env[key];
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let startupError='';child.stderr.on('data',b=>startupError+=b);
 const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Server startup timed out '+startupError));},10000);child.stdout.on('data',b=>{const m=String(b).match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited: '+code+' '+startupError));});});
 const stop=()=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>{child.once('exit',resolve);child.kill();});
 async function request(route,method='GET',value,cookie='',origin=base){const response=await fetch(base+route,{method,headers:{...(method!=='GET'?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})},body:value===undefined?undefined:JSON.stringify(value)});let body;try{body=await response.json();}catch{body=null;}return {status:response.status,body,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};}
 async function register(value){const start=await request('/api/auth/register/start','POST',{email:value.email,language:'en'});assert.equal(start.status,200);const lines=(await readFile(path.join(dataDir,'mail-outbox.ndjson'),'utf8')).trim().split('\n').map(JSON.parse),code=lines.findLast(x=>x.email===value.email).code;assert.equal((await request('/api/auth/verify','POST',{code},start.cookie)).status,200);return request('/api/register','POST',{name:value.name,password:value.password},start.cookie);}
 return {base,request,stop,register};
}
test('host-specific sitemaps and robots expose only canonical public documents',async()=>{
 const data=await mkdtemp(path.join(testTemp,'jpl-test-'));const app=await launch(data);
 const hosted=(route,host,method='GET')=>new Promise((resolve,reject)=>{
  const req=httpRequest(app.base+route,{method,headers:{Host:host}},res=>{
   let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);
   res.on('end',()=>resolve({status:res.statusCode,headers:new Headers(res.headers),text:async()=>body}));res.on('error',reject);
  });req.on('error',reject);req.end();
 });
 try{
  for(const host of ['www.jp-lifebase.com','jp-lifebase.com','localhost']){
   const canonical=host==='jp-lifebase.com'?host:'www.jp-lifebase.com';
   const loc=canonical==='jp-lifebase.com'?'https://jp-lifebase.com/denkikakaku':'https://www.jp-lifebase.com/';
   const response=await hosted('/sitemap.xml',host);
   assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^application\/xml/);
   const xml=await response.text();assert.match(xml,/xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
   assert.deepEqual([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]),[loc]);
   assert(!xml.includes('<lastmod>'));assert(!xml.includes('#topic='));
   const robots=await hosted('/robots.txt',host);
   assert.equal(robots.status,200);const text=await robots.text();
   assert(text.includes(`Sitemap: https://${canonical}/sitemap.xml`));
   for(const route of ['/api/','/account','/admin'])assert(text.includes(`Disallow: ${route}`));
   for(const route of ['/sitemap.xml','/robots.txt']){
    const head=await hosted(route,host,'HEAD');
    assert.equal(head.status,200);assert.equal(await head.text(),'');
   }
  }
  assert.equal((await hosted('/sitemap.xml','attacker.example')).status,400);
 }finally{await app.stop();assert(path.resolve(data).startsWith(path.resolve(testTemp)+path.sep+'jpl-test-'));await rm(data,{recursive:true,force:true});}
});

test('accounts, persistent posts, private messages, contacts and origin boundaries',async()=>{
 const data=await mkdtemp(path.join(testTemp,'jpl-test-'));let app=await launch(data);
 try{
  const health=(await app.request('/api/health')).body;
  assert.equal(health.version,'0.2.0');assert.equal(health.releaseId,'development');assert.equal(health.schemaVersion,2);assert.match(health.sourceSha256,/^[a-f0-9]{64}$/);assert.equal(typeof health.datasetVersion,'string');
  assert.equal((await app.request('/api/topics')).body.topics.length,0);
  assert.equal((await app.request('/api/topics','POST',{title:'Example',body:'Public topic',category:'daily'})).status,401);
  const a=await app.register({name:'OwnerTest',email:'owner@example.test',password:'example-password-123'});assert.equal(a.status,201);assert.equal(a.body.user.role,'member');assert(a.cookie);
  assert.equal((await app.request('/api/session','GET',undefined,a.cookie)).body.user.name,'OwnerTest');
  assert.equal((await app.request('/api/admin/inbox','GET',undefined,a.cookie)).status,403);
  assert.equal((await app.request('/api/login','POST',{email:'owner@example.test',password:'incorrect-pass-123'})).status,401);
  const created=await app.request('/api/topics','POST',{title:'Persisted title',body:'This topic should survive a restart.',category:'daily',language:'en'},a.cookie);assert.equal(created.status,201);const id=created.body.topic.id;
  const b=await app.register({name:'ReaderTest',email:'reader@example.test',password:'another-password-123'});assert.equal(b.status,201);
  assert.equal((await app.request('/api/topics/'+id+'/replies','POST',{body:'A reply from another member.',language:'en'},b.cookie)).status,201);
  const detail=await app.request('/api/topics/'+id+'?lang=original');assert.equal(detail.body.topic.replies,1);assert.equal(detail.body.posts.length,2);
  for(const language of ['ja','en','ko','zh-CN','zh-TW']){const localized=await app.request('/api/topics/'+id+'?lang='+language);assert.equal(localized.body.translation.automatic,false);assert.equal(localized.body.topic.title,'Persisted title');}
  const inbox=await app.request('/api/me/messages','GET',undefined,a.cookie);assert.equal(inbox.body.messages.length,1);assert.equal(inbox.body.messages[0].author,'ReaderTest');
  assert.equal((await app.request('/api/me/messages','GET',undefined,b.cookie)).body.messages.length,0);
  assert.equal((await app.request('/api/topics/'+id,'DELETE',undefined,b.cookie)).status,403);
  assert.equal((await app.request('/api/contact','POST',{name:'Example',email:'reader@example.test',message:'Contact request for the website.'})).status,201);
  assert.equal((await app.request('/api/contact','POST',{name:'Example',email:'invalid',message:'This must not be accepted.'})).status,400);
  assert.equal((await app.request('/api/topics','POST',{title:'Cross origin',body:'Must reject',category:'daily'},a.cookie,'https://other.test')).status,403);
  assert.equal((await app.request('/data/community.sqlite')).status,404);
  assert.equal((await app.request('/server.mjs')).status,404);
  assert.equal((await app.request('/api/translate','POST',{target:'zh-CN',source:'en',items:{message:'Hello'}})).body.code,'manual_language');
  assert.equal((await app.request('/api/translate','POST',{target:'fr',source:'en',items:{message:'Hello'}})).status,503);
  await app.stop();app=await launch(data);
  assert.equal((await app.request('/api/topics/'+id+'?lang=original')).body.posts.length,2);
  assert.equal((await app.request('/api/session','GET',undefined,a.cookie)).body.user.name,'OwnerTest');
  assert.equal((await app.request('/api/logout','POST',{},a.cookie)).status,200);
  assert.equal((await app.request('/api/session','GET',undefined,a.cookie)).body.user,null);
 }finally{await app.stop();assert(path.resolve(data).startsWith(path.resolve(testTemp)+path.sep+'jpl-test-'));await rm(data,{recursive:true,force:true});}
});

test('public electricity API uses verified snapshots without requiring a community account',async()=>{
 const data=await mkdtemp(path.join(testTemp,'jpl-test-'));const app=await launch(data);
 try{
  const c=await app.request('/api/denki/catalog');assert.equal(c.status,200);assert.equal(c.body.months.length,6);assert(!c.body.months.some(m=>m.id==='2025-09'));
  const input={area:'tokyo',billingMonth:'2026-09',amps:30,kwh:260,currentPlanId:'tepco-b',fullCycle:true};
  const result=await app.request('/api/denki/compare','POST',input);assert.equal(result.status,200);assert.equal(result.body.results.find(p=>p.planId==='tepco-b').totalYen,7843);
  const snapshot=await app.request('/api/denki/dataset?version='+c.body.version);assert.equal(snapshot.body.version,c.body.version);assert.equal(snapshot.body.sha256,c.body.sha256);
  assert.equal((await app.request('/api/denki/compare','POST',{...input,version:c.body.version})).body.results[0].totalYen,result.body.results[0].totalYen);
  assert.equal((await app.request('/api/denki/compare','POST',{...input,version:'unknown'})).status,400);
  assert.equal((await app.request('/api/denki/compare','POST',{...input,billingMonth:'2099-01'})).body.code,'month_outside_window');
  assert.equal((await app.request('/api/denki/compare','POST',{...input,billingMonth:'2026-01'})).body.code,'month_outside_window');
  assert.equal((await app.request('/api/denki/compare','POST',input,'','https://other.test')).status,403);
  const page=await fetch(app.base+'/denkikakaku');assert.equal(page.status,200);assert((await page.text()).includes('id="compare-form"'));
  assert.equal((await app.request('/denki/data.mjs')).status,404);
 }finally{await app.stop();assert(path.resolve(data).startsWith(path.resolve(testTemp)+path.sep+'jpl-test-'));await rm(data,{recursive:true,force:true});}
});
