import {testPort} from './test-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
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
 for(const [id,name,role] of [['admin-test','OperatorTest','admin'],['author-test','AuthorTest','member'],['reader-test','ReaderTest','member']]){
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,name,id+'@example.test','test-only-unused-hash','test-only-unused-salt',role,date);
  const token=randomBytes(32).toString('hex');tokens[id]='jpl_session='+token;
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+3600000);
 }
 db.prepare('INSERT INTO topics VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('legacy-topic','Legacy discussion','Original topic body','Original excerpt','daily','author-test','AuthorTest','A',0,0,'en',0,date,date);
 db.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?,?)').run('legacy-reply','legacy-topic','reader-test','Original reply body','Original quote','en',date);
 db.prepare('INSERT INTO topics VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('sample-topic','Sample discussion','Sample body','Sample excerpt','site',null,'Japan Life Base','J',0,1,'en',1,date,date);
 db.close();return tokens;
}

async function launch(directory){
 const env={...process.env,PORT:await testPort(),COOKIE_SECURE:'0',JPL_DATA_DIR:directory,JPL_SEED:'0',NODE_ENV:'test',JPL_TEST_MAIL_OUTBOX:'0'};
 for(const key of Object.keys(env))if(/^(TRANSLATION_|RESEND_|MAIL_)/.test(key)||key==='AUTH_TOKEN_SECRET')delete env[key];
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',bytes=>errors+=bytes);
 const base=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{child.kill();reject(new Error('Startup timeout: '+errors));},10000);
  child.stdout.on('data',bytes=>{const match=String(bytes).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});
  child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Server exited '+code+': '+errors));});
 });
 async function request(route,{method='GET',value,cookie='',origin=base}={}){
  const response=await fetch(base+route,{method,headers:{...(method==='GET'?{}:{'Content-Type':'application/json',Origin:origin}),...(cookie?{Cookie:cookie}:{})},body:value===undefined?undefined:JSON.stringify(value)});
  return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
 }
 const stop=()=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>{child.once('exit',resolve);child.kill();});
 return {request,stop};
}

test('admin permissions, reversible moderation and old community migration preserve records',async()=>{
 await mkdir(temporaryRoot,{recursive:true});
 const directory=await mkdtemp(path.join(temporaryRoot,'jpl-admin-'));
 const tokens=legacyFixture(directory);let app;
 try{
  app=await launch(directory);
  const admin=tokens['admin-test'],author=tokens['author-test'],reader=tokens['reader-test'];
  for(const route of ['/api/admin/overview','/api/admin/topics','/api/admin/users','/api/admin/inbox','/api/admin/missing']){
   assert.equal((await app.request(route)).status,401);
   assert.equal((await app.request(route,{cookie:author})).status,403);
  }
  const overview=await app.request('/api/admin/overview',{cookie:admin});
  assert.equal(overview.status,200);assert.equal(overview.cache,'no-store');
  assert.deepEqual(overview.body.counts,{users:3,topics:2,hiddenTopics:0,replies:1,contacts:0,reports:0});
  const users=await app.request('/api/admin/users?query=AuthorTest',{cookie:admin});
  assert.equal(users.body.users.length,1);
  assert.deepEqual(Object.keys(users.body.users[0]).sort(),['id','name','email','role','emailVerified','createdAt','topicCount','banned','muted'].sort());
  assert.equal(users.body.users[0].emailVerified,false);assert.equal(users.body.users[0].topicCount,1);
  assert.equal((await app.request('/api/contact',{method:'POST',value:{name:'ContactTest',email:'contact@example.test',message:'Operator-only contact message.'}})).status,201);
  assert.equal((await app.request('/api/topics/legacy-topic/report',{method:'POST',cookie:reader,value:{reason:'Operator-only report reason.'}})).status,201);
  const inbox=await app.request('/api/admin/inbox',{cookie:admin});
  assert.equal(inbox.status,200);assert.equal(inbox.body.contacts.length,1);assert.equal(inbox.body.reports.length,1);
  assert.equal(inbox.body.contacts[0].message,'Operator-only contact message.');
  assert.equal(inbox.body.reports[0].reason,'Operator-only report reason.');
  const reportId=inbox.body.reports[0].id;
  assert.equal(inbox.body.reports[0].status,'open');
  for(const route of ['/api/admin/audit','/api/admin/reports/'+reportId,'/api/admin/users/author-test']){
   const method=route.endsWith('/audit')?'GET':'POST';
   assert.equal((await app.request(route,{method,cookie:author,value:method==='GET'?undefined:{status:'resolved'}})).status,403);
  }
  for(const value of [{status:'bad'},{status:'resolved',role:'admin'},{}])assert.equal((await app.request('/api/admin/reports/'+reportId,{method:'POST',cookie:admin,value})).status,400);
  assert.equal((await app.request('/api/admin/reports/'+reportId,{method:'POST',cookie:admin,origin:'https://other.test',value:{status:'reviewing'}})).status,403);
  for(const status of ['reviewing','resolved','resolved']){
   const reviewed=await app.request('/api/admin/reports/'+reportId,{method:'POST',cookie:admin,value:{status}});
   assert.equal(reviewed.status,200);assert.equal(reviewed.body.report.status,status);assert.equal(reviewed.body.report.reviewedBy,'admin-test');
  }
  const log=await app.request('/api/admin/audit?action=review_report',{cookie:admin});
  assert.equal(log.status,200);assert.equal(log.body.actions.length,2);
  assert.equal(log.body.actions[0].action,'review_report');assert.equal(log.body.nextCursor,null);
  assert(!JSON.stringify(log.body).includes('Operator-only report reason.'));
  assert.equal((await app.request('/api/admin/audit?before=bad',{cookie:admin})).status,400);
  assert.equal((await app.request('/api/admin/audit?action=invalid',{cookie:admin})).status,400);
  assert.equal((await app.request('/api/admin/reports/missing',{method:'POST',cookie:admin,value:{status:'dismissed'}})).status,404);
  const counts=(await app.request('/api/admin/overview',{cookie:admin})).body.counts;
  assert.equal(counts.contacts,1);assert.equal(counts.reports,1);
  assert.equal((await app.request('/api/admin/topics?status=bad',{cookie:admin})).status,400);
  assert.equal((await app.request('/api/admin/users?query='+('x'.repeat(201)),{cookie:admin})).status,400);
  assert.deepEqual((await app.request('/api/admin/topics?query='+encodeURIComponent("x' OR 1=1 --"),{cookie:admin})).body.topics,[]);
  assert.equal((await app.request('/api/me/messages',{cookie:author})).body.messages.length,1);
  assert.equal((await app.request('/api/topics/legacy-topic?lang=original')).body.posts.length,2);

  // A normal post still uses the old contract after the additive hidden column migration.
  const created=await app.request('/api/topics',{method:'POST',cookie:reader,value:{title:'After migration',body:'A new topic still works.',category:'daily',language:'en'}});
  assert.equal(created.status,201);
  assert.equal((await app.request('/api/admin/topics/legacy-topic',{method:'POST',cookie:author,value:{hidden:true}})).status,403);
  assert.equal((await app.request('/api/admin/topics/legacy-topic',{method:'POST',cookie:admin,origin:'https://other.test',value:{hidden:true}})).status,403);
  for(const value of [{},{hidden:1},{hidden:'true'},{pinned:null},{hidden:true,role:'admin'}]){
   assert.equal((await app.request('/api/admin/topics/legacy-topic',{method:'POST',cookie:admin,value})).status,400);
  }
  assert.equal((await app.request('/api/admin/topics/missing',{method:'POST',cookie:admin,value:{hidden:true}})).status,404);
  const hidden=await app.request('/api/admin/topics/legacy-topic',{method:'POST',cookie:admin,value:{hidden:true}});
  assert.equal(hidden.status,200);assert.deepEqual(hidden.body.topic,{id:'legacy-topic',hidden:true,pinned:false});
  const pinWhileHidden=await app.request('/api/admin/topics/legacy-topic',{method:'POST',cookie:admin,value:{pinned:true}});
  assert.deepEqual(pinWhileHidden.body.topic,{id:'legacy-topic',hidden:true,pinned:true});
  assert(!(await app.request('/api/topics?lang=original')).body.topics.some(topic=>topic.id==='legacy-topic'));
  assert(!(await app.request('/api/me/topics',{cookie:author})).body.topics.some(topic=>topic.id==='legacy-topic'));
  assert.equal((await app.request('/api/me/messages',{cookie:author})).body.messages.length,0);
  for(const lang of ['original','en','fr'])assert.equal((await app.request('/api/topics/legacy-topic?lang='+lang)).status,404);
  assert.equal((await app.request('/api/topics/legacy-topic/replies',{method:'POST',cookie:reader,value:{body:'Cannot reply while hidden.',language:'en'}})).status,404);
  assert.equal((await app.request('/api/topics/legacy-topic/report',{method:'POST',cookie:reader,value:{reason:'Cannot report while hidden.'}})).status,404);
  let hiddenRows=(await app.request('/api/admin/topics?status=hidden',{cookie:admin})).body.topics;
  assert.equal(hiddenRows.length,1);assert.equal(hiddenRows[0].replies,1);assert.equal(hiddenRows[0].updatedAt,'2026-10-01T00:00:00.000Z');

  await app.stop();app=await launch(directory);
  assert.equal((await app.request('/api/topics/legacy-topic')).status,404);
  assert.equal((await app.request('/api/admin/overview',{cookie:admin})).body.counts.hiddenTopics,1);
  const restored=await app.request('/api/admin/topics/legacy-topic',{method:'POST',cookie:admin,value:{hidden:false}});
  assert.deepEqual(restored.body.topic,{id:'legacy-topic',hidden:false,pinned:true});
  const detail=(await app.request('/api/topics/legacy-topic?lang=original')).body;
  assert.equal(detail.topic.pinned,true);assert.equal(detail.topic.body,'Original topic body');
  assert.equal(detail.posts.length,2);assert.equal(detail.posts[1].body,'Original reply body');assert.equal(detail.posts[1].quote,'Original quote');
  assert.equal((await app.request('/api/me/messages',{cookie:author})).body.messages.length,1);
  assert.equal((await app.request('/api/admin/topics/sample-topic',{method:'POST',cookie:admin,value:{hidden:true}})).status,200);
  assert.equal((await app.request('/api/admin/topics/sample-topic',{method:'POST',cookie:admin,value:{hidden:false}})).status,200);
  const db=new DatabaseSync(path.join(directory,'community.sqlite'),{readOnly:true});
  try{
   assert.equal(db.prepare('SELECT count(*) AS n FROM posts WHERE topic_id=?').get('legacy-topic').n,1);
   assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get('author-test').role,'member');
   const audit=db.prepare('SELECT * FROM admin_actions ORDER BY created_at,id').all();assert(audit.length>=4);
   assert(audit.every(row=>row.user_id==='admin-test'&&!('body' in row)&&!('email' in row)));
  }finally{db.close();}
 }finally{
  if(app)await app.stop();
  assert(path.resolve(directory).startsWith(path.resolve(temporaryRoot)+path.sep+'jpl-admin-'));
  await rm(directory,{recursive:true,force:true});
 }
});

test('audit cursors page equal timestamps without duplicates or leaking management content',async()=>{
 await mkdir(temporaryRoot,{recursive:true});const directory=await mkdtemp(path.join(temporaryRoot,'jpl-admin-'));
 const tokens=legacyFixture(directory);let app;
 try{
  app=await launch(directory);
  const db=new DatabaseSync(path.join(directory,'community.sqlite'));
  try{
   const insert=db.prepare('INSERT INTO admin_actions VALUES(?,?,?,?,?,?)');
   for(let index=0;index<105;index++)insert.run('00000000-0000-4000-8000-'+String(index).padStart(12,'0'),'admin-test','legacy-topic','moderate',JSON.stringify({before:{hidden:false},after:{hidden:true}}),'2026-10-21T00:00:00.000Z');
  }finally{db.close();}
  const ids=[];let cursor=null;
  do{
   const result=await app.request('/api/admin/audit'+(cursor?'?before='+encodeURIComponent(cursor):''),{cookie:tokens['admin-test']});
   assert.equal(result.status,200);assert(result.body.actions.length<=50);ids.push(...result.body.actions.map(item=>item.id));cursor=result.body.nextCursor;
  }while(cursor);
  assert.equal(ids.length,105);assert.equal(new Set(ids).size,105);
 }finally{await app?.stop();await rm(directory,{recursive:true,force:true});}
});
