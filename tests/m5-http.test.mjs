import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {testPort} from './test-port.mjs';
import {migrations} from '../schema.mjs';
import {runMigrations} from '../migrations.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),temporaryRoot=path.join(root,'artifacts/test-tmp');
const users=[['author','TopicOwner','member'],['reader','ReplyAuthor','member'],['watcher','WatchMember','member'],['tracker','TrackMember','member'],['silent','SilentMember','member'],['operator','OperatorTest','admin']];
const date='2026-10-01T00:00:00.000Z';
async function fixture(){
 await mkdir(temporaryRoot,{recursive:true});const directory=await mkdtemp(path.join(temporaryRoot,'m5-http-'));
 const db=new DatabaseSync(path.join(directory,'community.sqlite'));db.exec('PRAGMA foreign_keys=ON');runMigrations(db,migrations.slice(0,4));
 const tokens={};
 for(const [id,name,role]of users){db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id,name,id+'@example.test','original-test-hash','original-test-salt',role,date);const token=randomBytes(32).toString('hex');tokens[id]='jpl_session='+token;db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+3600000);}
 for(const id of ['topic','other'])db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,'Original '+id,'Original body for '+id,'Original excerpt','daily','author','TopicOwner','T','en',date,date);
 db.prepare('INSERT INTO posts(id,topic_id,user_id,body,language,created_at) VALUES(?,?,?,?,?,?)').run('legacy-reply','topic','reader','Original reply body','en',date);db.close();
 let processHandle=null,base='',sequence=0;
 async function start(){
  const env={...process.env,NODE_ENV:'test',PORT:await testPort(),COOKIE_SECURE:'0',JPL_DATA_DIR:directory,JPL_SEED:'0',JPL_TEST_MAIL_OUTBOX:'0'};
  for(const key of Object.keys(env))if(/^(TRANSLATION_|MAIL_|RESEND_)/.test(key)||key==='AUTH_TOKEN_SECRET')delete env[key];
  const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});processHandle=child;let errors='';child.stderr.on('data',bytes=>errors+=bytes);
  base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Startup timeout '+errors));},15000);child.stdout.on('data',bytes=>{const address=String(bytes).match(/http:\/\/127\.0\.0\.1:\d+/);if(address){clearTimeout(timer);resolve(address[0]);}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Exited '+code+' '+errors));});});
 }
 async function stop(){if(processHandle?.exitCode===null&&processHandle.signalCode===null)await new Promise(resolve=>{processHandle.once('exit',resolve);processHandle.kill();});}
 const f={directory,tokens,db(work){const handle=new DatabaseSync(path.join(directory,'community.sqlite'));handle.exec('PRAGMA foreign_keys=ON');try{return work(handle);}finally{handle.close();}},
  async request(route,{who='anonymous',method='GET',value,origin,headers={}}={}){const result=await fetch(base+route,{method,headers:{'cf-connecting-ip':'198.51.100.'+(++sequence%250+1),...(tokens[who]?{Cookie:tokens[who]}:{}),...(method==='GET'?{}:{'Content-Type':'application/json',Origin:origin??base}),...headers},body:value===undefined?undefined:JSON.stringify(value)});return {status:result.status,body:await result.json()};},
  slowWrite(route,value,midway,who='author'){return new Promise((resolve,reject)=>{const serialized=JSON.stringify({...value,expectedUserId:who}),split=Math.floor(serialized.length/2);const request=http.request(base+route,{method:'POST',headers:{Cookie:tokens[who],Origin:base,'Content-Type':'application/json','Content-Length':Buffer.byteLength(serialized),Expect:'100-continue','cf-connecting-ip':'198.51.100.254'}},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{try{resolve({status:response.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())});}catch(error){reject(error);}});});request.on('error',reject);request.on('continue',()=>{request.write(serialized.slice(0,split));setTimeout(()=>{try{midway();request.end(serialized.slice(split));}catch(error){request.destroy();reject(error);}},40);});request.flushHeaders();});},
  async restart(){await stop();await start();},
  async close(){await stop();assert(path.resolve(directory).startsWith(temporaryRoot+path.sep+'m5-http-'));await rm(directory,{recursive:true,force:true});}
 };
 try{await start();return f;}catch(error){await stop();await f.close();throw error;}
}
const content=(kind,id,action)=>'/api/content/'+kind+'/'+id+'/'+action;
const get=(f,route,who='author')=>f.request(route,{who});
const write=(f,route,value={},who='author',other={})=>f.request(route,{method:'POST',who,value:{...value,expectedUserId:who},...other});
const reply=(f,value={},who='reader',topic='topic')=>write(f,'/api/topics/'+topic+'/replies',{body:'Fresh reply body',bodyFormat:'markdown',language:'und',clientRequestId:randomUUID(),...value},who);
const notifications=(f,who='author',suffix='')=>get(f,'/api/me/notifications'+suffix,who);
const identity=async(f,who)=>{const result=await get(f,'/api/me/identity',who);assert.equal(result.status,200);return result.body.identity;};
const interaction=(f,who='author',topic='topic')=>get(f,'/api/topics/'+topic+'/interaction',who);
const subscription=(f,mode,who,topic='topic')=>write(f,'/api/topics/'+topic+'/subscription',{mode},who);
const visible=(f,kind,id,hidden,who='operator')=>write(f,content(kind,id,'visibility'),{hidden},who);
async function collectPages(fetchPage,key){
 const result=[],seen=new Set();let cursor=null;
 for(let page=0;page<100;page++){
  const response=await fetchPage(cursor);if(response.status!==200||!Array.isArray(response.body?.[key]))throw Error('Invalid page response');
  result.push(...response.body[key]);const next=response.body.nextCursor;if(next===null)return result;
  if(typeof next!=='string'||seen.has(next))throw Error('Invalid or repeated cursor');seen.add(next);cursor=next;
 }
 throw Error('Page limit exceeded');
}

test('M5 HTTP profiles persist across restart and reject wrong origin, slow account change, banned sender, and unsafe public fields',async()=>{
 const f=await fixture();try{
  const who='reader',handle=(await identity(f,who)).handle,route='/api/me/profile',publicRoute='/api/users/'+handle+'/profile';
  const input={bio:'東京都の生活メモ <script>not code</script>',location:'Tokyo',website:'https://example.test/profile',publicEnabled:true,showActivity:true};
  assert.equal((await get(f,route,'anonymous')).status,401);assert.equal((await get(f,publicRoute,'operator')).status,404);
  assert.equal((await write(f,route,input,who,{origin:'https://other.example'})).status,403);assert.equal((await write(f,route,{...input,email:'secret'},who)).status,400);
  assert.equal((await write(f,route,input,who)).status,200);await f.restart();
  const publicResult=await get(f,publicRoute,'anonymous');assert.equal(publicResult.status,200);assert.equal(publicResult.body.profile.bio,input.bio);assert(!JSON.stringify(publicResult.body).includes('@example.test'));assert.equal(publicResult.body.activity.length,1);
  const mutate=sql=>f.db(db=>db.exec(sql));
  assert.equal((await f.slowWrite(route,{...input,publicEnabled:false},()=>mutate("UPDATE users SET muted=1 WHERE id='reader'"),who)).status,200);
  assert.equal((await get(f,publicRoute,'operator')).status,404);
  assert.equal((await f.slowWrite(route,input,()=>f.db(db=>{const replacement=db.prepare("SELECT token_hash FROM sessions WHERE user_id='reader'").get();db.prepare("UPDATE sessions SET user_id='watcher' WHERE token_hash=?").run(replacement.token_hash);}),who)).status,409);
  f.db(db=>db.prepare("UPDATE sessions SET user_id='reader' WHERE user_id='watcher'").run());
  assert.equal((await f.slowWrite(route,input,()=>mutate("UPDATE users SET banned=1 WHERE id='reader'"),who)).status,403);
 }finally{await f.close();}
});

test('M5 HTTP directory mutations recheck administrator role after body, preserve receipts, and expose defined insights only to admins',async()=>{
 const f=await fixture();try{
  const category={id:'custom',name:'自定义',translations:{en:'Custom'},color:'#123456',position:70,active:true};
  const route='/api/admin/directory/categories';assert.equal((await get(f,'/api/admin/directory','reader')).status,403);assert.equal((await write(f,route,category,'operator')).status,200);
  const topicInput={title:'Custom category topic',body:'A visible original topic body',category:'custom',bodyFormat:'markdown',language:'en',tagIds:['travel'],clientRequestId:randomUUID()};
  const created=await write(f,'/api/topics',topicInput,'reader');assert.equal(created.status,201);
  assert.equal((await write(f,route,{...category,active:false},'operator')).status,200);assert.equal((await write(f,'/api/topics',topicInput,'reader')).body.topic.id,created.body.topic.id);
  assert.equal((await write(f,'/api/topics',{...topicInput,clientRequestId:randomUUID()},'reader')).body.error,'inactive_category');
  assert.equal((await get(f,'/api/admin/insights?days=7','reader')).status,403);assert.equal((await get(f,'/api/admin/insights?days=1','operator')).status,400);
  const metrics=await get(f,'/api/admin/insights?days=30','operator');assert.equal(metrics.status,200);assert.equal(metrics.body.range.timezone,'UTC');assert.match(metrics.body.definitions.activeAuthors,/not visitors/);
  const before=f.db(db=>db.prepare("SELECT count(*) n FROM admin_actions WHERE action='update_category'").get().n);
  assert.equal((await f.slowWrite(route,{...category,name:'Cannot save',expectedUserId:'operator'},()=>f.db(db=>db.exec("UPDATE users SET role='member' WHERE id='operator'")),'operator')).status,403);
  assert.equal(f.db(db=>db.prepare("SELECT count(*) n FROM admin_actions WHERE action='update_category'").get().n),before);
 }finally{await f.close();}
});
