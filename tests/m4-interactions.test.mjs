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
 await mkdir(temporaryRoot,{recursive:true});const directory=await mkdtemp(path.join(temporaryRoot,'m4-http-'));
 const db=new DatabaseSync(path.join(directory,'community.sqlite'));db.exec('PRAGMA foreign_keys=ON');runMigrations(db,migrations.slice(0,3));
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
  async close(){await stop();assert(path.resolve(directory).startsWith(temporaryRoot+path.sep+'m4-http-'));await rm(directory,{recursive:true,force:true});}
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

test('M4 stable handles expose only public identity and old content creates no retroactive notifications',async()=>{
 const f=await fixture();try{
  const original=f.db(db=>db.prepare("SELECT email,password,salt,name FROM users WHERE id='author'").get());
  const first=await identity(f,'author');assert.deepEqual(Object.keys(first).sort(),['handle','id','name']);assert.match(first.handle,/^[a-z][a-z0-9_]{2,31}$/);assert(!first.handle.includes('example'));
  assert.equal((await get(f,'/api/me/identity','anonymous')).status,401);assert.equal((await get(f,'/api/users/mentions?q=au','anonymous')).status,401);
  const all=await Promise.all(users.map(([who])=>identity(f,who)));assert.equal(new Set(all.map(user=>user.handle)).size,users.length);
  const found=await get(f,'/api/users/mentions?q='+encodeURIComponent(first.handle.slice(0,3)),'reader');assert.equal(found.status,200);assert(found.body.users.some(user=>user.id==='author'));for(const item of found.body.users)assert.deepEqual(Object.keys(item).sort(),['handle','id','name']);
  const initial=await notifications(f);assert.equal(initial.body.unreadCount,0);assert.deepEqual(initial.body.notifications,[]);
  await f.restart();assert.equal((await identity(f,'author')).handle,first.handle);assert.deepEqual(f.db(db=>db.prepare("SELECT email,password,salt,name FROM users WHERE id='author'").get()),original);
 }finally{await f.close();}
});

test('M4 reply replay produces one prioritized notification per recipient, no self notice, and only new edit mentions',async()=>{
 const f=await fixture();try{
  const owner=await identity(f,'author'),reader=await identity(f,'reader'),watcher=await identity(f,'watcher');
  await subscription(f,'watching','watcher');
  const value={body:'Hello @'+owner.handle+' and @'+reader.handle,quotes:[{kind:'topic',id:'topic',version:1,excerpt:'Original body for topic'}],clientRequestId:randomUUID()};
  const first=await reply(f,value);assert.equal(first.status,201);const id=first.body.post.id;
  const repeated=await reply(f,value);assert.equal(repeated.status,200);assert.equal(repeated.body.post.id,id);
  const received=(await notifications(f)).body;assert.equal(received.unreadCount,1);assert.equal(received.notifications[0].type,'mention');assert.equal(received.notifications[0].contentId,id);assert.deepEqual(Object.keys(received.notifications[0].actor).sort(),['handle','name']);assert(!Object.hasOwn(received.notifications[0],'body'));assert(!Object.hasOwn(received.notifications[0],'excerpt'));assert(!JSON.stringify(received).includes(value.body));
  assert.equal((await notifications(f,'reader')).body.unreadCount,0);assert.equal((await notifications(f,'watcher')).body.unreadCount,1);
  await write(f,content('post',id,'edit'),{expectedVersion:1,body:'Updated text @'+owner.handle+' and @'+watcher.handle,bodyFormat:'markdown',language:'und'},'reader');
  const watched=(await notifications(f,'watcher')).body.notifications;assert.equal(watched.length,2);assert.equal(watched.filter(item=>item.type==='mention').length,1);assert.equal((await notifications(f)).body.unreadCount,1);
  await write(f,content('post',id,'edit'),{expectedVersion:2,body:'Another change @'+owner.handle+' and @'+watcher.handle,bodyFormat:'markdown',language:'und'},'reader');
  assert.equal((await notifications(f,'watcher')).body.notifications.length,2);
  await f.restart();assert.equal((await notifications(f)).body.notifications.length,1);assert.equal((await reply(f,value)).body.post.id,id);
 }finally{await f.close();}
});

test('M4 Markdown mentions ignore code, quoted blocks and link URLs; subscriptions and seen markers remain independent',async()=>{
 const f=await fixture();try{
  const owner=await identity(f,'author'),watcher=await identity(f,'watcher'),tracker=await identity(f,'tracker'),silent=await identity(f,'silent');
  assert.equal((await interaction(f,'anonymous')).body.interaction.subscription,'normal');
  for(const [mode,who]of [['watching','watcher'],['tracking','tracker'],['muted','silent']])assert.equal((await subscription(f,mode,who)).status,200);
  assert.equal((await write(f,'/api/topics/topic/seen',{},'tracker')).status,200);
  const md='`@'+tracker.handle+'`\n\n```txt\n@'+silent.handle+'\n```\n\n> @'+tracker.handle+'\n\n[label](https://example.test/@'+tracker.handle+')\n\nHello @'+silent.handle+'.';
  assert.equal((await reply(f,{body:md})).status,201);
  assert.equal((await notifications(f,'watcher')).body.unreadCount,1);assert.equal((await notifications(f,'tracker')).body.unreadCount,0);assert.equal((await notifications(f,'silent')).body.unreadCount,0);assert.equal((await notifications(f)).body.unreadCount,1);
  assert.equal((await interaction(f,'tracker')).body.interaction.newReplies,1);
  const mention=await reply(f,{body:'Direct @'+tracker.handle});assert.equal(mention.status,201);assert.equal((await notifications(f,'tracker')).body.notifications[0].type,'mention');
  await write(f,'/api/topics/topic/seen',{},'tracker');assert.equal((await interaction(f,'tracker')).body.interaction.newReplies,0);
  await visible(f,'post',mention.body.post.id,true);assert.equal((await interaction(f,'tracker')).body.interaction.newReplies,0);assert.equal((await notifications(f,'tracker')).body.unreadCount,0);
  await subscription(f,'muted','author');await reply(f,{body:'Muted owner @'+owner.handle});assert.equal((await notifications(f)).body.unreadCount,1);
  await f.restart();assert.equal((await interaction(f,'silent')).body.interaction.subscription,'muted');assert.equal((await interaction(f,'tracker')).body.interaction.subscription,'tracking');
 }finally{await f.close();}
});

test('M4 reactions set exact desired state, survive restart, and cannot spam or react as another user',async()=>{
 const f=await fixture();try{
  const route=content('post','legacy-reply','reactions');
  assert.equal((await get(f,route,'anonymous')).body.reactions.counts.like,0);
  const results=await Promise.all(Array.from({length:4},()=>write(f,route,{reaction:'like'},'author')));assert(results.every(item=>item.status===200));assert.equal(results.at(-1).body.reactions.counts.like,1);assert.equal(results.at(-1).body.reactions.mine,'like');
  assert.equal((await notifications(f,'reader')).body.unreadCount,1);
  await write(f,route,{reaction:null},'author');await write(f,route,{reaction:'like'},'author');assert.equal((await notifications(f,'reader')).body.unreadCount,1);
  const changed=await write(f,route,{reaction:'thanks'},'author');assert.deepEqual(changed.body.reactions.counts,{like:0,thanks:1,helpful:0});assert.equal((await notifications(f,'reader')).body.unreadCount,2);
  assert.equal((await write(f,route,{reaction:'helpful'},'reader')).status,400);assert.equal((await write(f,route,{reaction:'invalid'},'author')).status,400);
  assert.equal((await f.request(route,{method:'POST',who:'author',value:{reaction:'like',expectedUserId:'reader'}})).body.code,'account_changed');
  assert.equal((await write(f,route,{reaction:'like'},'anonymous')).status,401);
  await f.restart();assert.equal((await get(f,route)).body.reactions.mine,'thanks');assert.equal((await get(f,route,'anonymous')).body.reactions.mine,null);
  await visible(f,'post','legacy-reply',true);assert.equal((await get(f,route)).status,404);assert.equal((await notifications(f,'reader')).body.unreadCount,0);
 }finally{await f.close();}
});

test('M4 best answers stay in the topic, respect author/admin permission, and hidden answers stop solving',async()=>{
 const f=await fixture();try{
  const other=await reply(f,{body:'Reply in another topic'},'reader','other');assert.equal(other.status,201);
  assert.equal((await write(f,'/api/topics/topic/answer',{postId:other.body.post.id})).status,400);
  assert([400,404].includes((await write(f,'/api/topics/topic/answer',{postId:'topic'})).status));
  assert.equal((await write(f,'/api/topics/topic/answer',{postId:'legacy-reply'},'watcher')).status,403);
  const selected=await write(f,'/api/topics/topic/answer',{postId:'legacy-reply'});assert.equal(selected.status,200);assert.equal(selected.body.interaction.answerPostId,'legacy-reply');
  assert.equal((await notifications(f,'reader')).body.notifications.filter(item=>item.type==='answer').length,1);
  await write(f,'/api/topics/topic/answer',{postId:null});await write(f,'/api/topics/topic/answer',{postId:'legacy-reply'});assert.equal((await notifications(f,'reader')).body.notifications.filter(item=>item.type==='answer').length,1);
  let solved=await get(f,'/api/topics?solved=true','anonymous');assert.deepEqual(solved.body.topics.map(item=>item.id),['topic']);assert.equal(solved.body.topics[0].solved,true);
  await visible(f,'post','legacy-reply',true);solved=await get(f,'/api/topics?solved=true','anonymous');assert.equal(solved.body.topics.length,0);const state=(await interaction(f)).body.interaction;assert.equal(state.answerPostId,null);assert.equal((await get(f,'/api/topics/topic')).body.topic.solved,false);assert.equal((await notifications(f,'reader')).body.notifications.filter(item=>item.type==='answer').length,0);
  await visible(f,'post','legacy-reply',false);assert.equal((await interaction(f)).body.interaction.answerPostId,'legacy-reply');
  await write(f,'/api/topics/topic/answer',{postId:null},'operator');assert.equal((await get(f,'/api/topics?solved=false')).body.topics.length,2);
 }finally{await f.close();}
});

test('M4 bookmarks and notification read states are private, idempotent and visibility filtered',async()=>{
 const f=await fixture();try{
  assert.equal((await write(f,'/api/topics/topic/bookmark',{bookmarked:true})).body.interaction.bookmark,true);await write(f,'/api/topics/topic/bookmark',{bookmarked:true});
  assert.equal((await get(f,'/api/me/bookmarks')).body.bookmarks.length,1);assert.equal((await get(f,'/api/me/bookmarks','reader')).body.bookmarks.length,0);assert.equal((await get(f,'/api/me/bookmarks','anonymous')).status,401);
  await reply(f);let list=(await notifications(f)).body;const id=list.notifications[0].id;assert.equal(list.unreadCount,1);
  await write(f,'/api/me/notifications/read',{ids:[id]},'reader');assert.equal((await notifications(f)).body.unreadCount,1);
  await write(f,'/api/me/notifications/read',{ids:[id]});list=(await notifications(f)).body;assert.equal(list.unreadCount,0);assert(list.notifications[0].readAt);assert.equal((await notifications(f,'author','?unread=1')).body.notifications.length,0);
  await reply(f,{body:'Another publicly visible reply'});assert.equal((await notifications(f)).body.unreadCount,1);await write(f,'/api/me/notifications/read',{all:true});assert.equal((await notifications(f)).body.unreadCount,0);
  await visible(f,'topic','topic',true);assert.equal((await get(f,'/api/me/bookmarks')).body.bookmarks.length,0);assert.equal((await notifications(f)).body.notifications.length,0);assert.equal((await get(f,'/api/topics/topic/interaction')).status,404);
  await visible(f,'topic','topic',false);assert.equal((await get(f,'/api/me/bookmarks')).body.bookmarks.length,1);await f.restart();assert.equal((await notifications(f)).body.unreadCount,0);assert.equal((await get(f,'/api/me/bookmarks')).body.bookmarks.length,1);
 }finally{await f.close();}
});

test('M4 new interaction writes enforce same origin, account binding and mute/ban boundaries',async()=>{
 const f=await fixture();try{
  const routes=[['/api/topics/topic/subscription',{mode:'watching'}],['/api/topics/topic/bookmark',{bookmarked:true}],['/api/topics/topic/seen',{}],['/api/me/notifications/read',{all:true}],[content('post','legacy-reply','reactions'),{reaction:'like'}],['/api/topics/topic/answer',{postId:'legacy-reply'}]];
  for(const [route,value]of routes){assert.equal((await write(f,route,value,'author',{origin:'https://unrelated.example'})).status,403);assert.equal((await f.request(route,{method:'POST',who:'author',value:{...value,expectedUserId:'reader'}})).body.code,'account_changed');}
  f.db(db=>db.prepare("UPDATE users SET muted=1 WHERE id='author'").run());
  for(const [route,value]of routes.slice(0,4))assert.equal((await write(f,route,value)).status,200);
  for(const [route,value]of routes.slice(4))assert.equal((await write(f,route,value)).status,403);
  f.db(db=>db.prepare("UPDATE users SET banned=1 WHERE id='author'").run());for(const [route,value]of routes){const result=await write(f,route,value);assert([401,403].includes(result.status));}
 }finally{await f.close();}
});

test('M4 failed notification insertion rolls back content, replay receipt and all recipients atomically',async()=>{
 const f=await fixture();try{
  f.db(db=>db.exec("CREATE TRIGGER m4_fail_notification BEFORE INSERT ON community_notifications BEGIN SELECT RAISE(ABORT,'intentional-isolated-test'); END"));
  const value={body:'This body must roll back together with its event.',clientRequestId:randomUUID()},before=f.db(db=>db.prepare('SELECT count(*) AS n FROM posts').get().n);
  assert.equal((await reply(f,value)).status,500);assert.equal(f.db(db=>db.prepare('SELECT count(*) AS n FROM posts').get().n),before);assert.equal(f.db(db=>db.prepare('SELECT count(*) AS n FROM reply_create_requests WHERE client_request_id=?').get(value.clientRequestId).n),0);assert.equal(f.db(db=>db.prepare('SELECT count(*) AS n FROM community_events').get().n),0);
  const target=await identity(f,'reader'),topicRequest=randomUUID();const created=await f.request('/api/topics',{who:'author',method:'POST',value:{title:'Atomic topic creation',body:'Notify @'+target.handle,category:'daily',language:'und',bodyFormat:'markdown',clientRequestId:topicRequest,expectedUserId:'author'}});assert.equal(created.status,500);assert.equal(f.db(db=>db.prepare('SELECT count(*) AS n FROM topics').get().n),2);assert.equal(f.db(db=>db.prepare('SELECT count(*) AS n FROM topic_create_requests WHERE client_request_id=?').get(topicRequest).n),0);assert.equal(f.db(db=>db.prepare('SELECT count(*) AS n FROM community_events').get().n),0);
  f.db(db=>db.exec('DROP TRIGGER m4_fail_notification'));assert.equal((await reply(f,value)).status,201);assert.equal((await notifications(f)).body.notifications.length,1);
 }finally{await f.close();}
});

test('M4 solved filtering runs before the 250 topic window and never exposes a hidden answer id',async()=>{
 const f=await fixture();try{
  f.db(db=>{const insert=db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');for(let index=0;index<255;index++)insert.run('new-'+index,'New topic '+index,'Unsolved content','Excerpt','daily','reader','ReplyAuthor','R','en','2026-10-02','2026-10-02');});
  await write(f,'/api/topics/topic/answer',{postId:'legacy-reply'});
  const solved=await get(f,'/api/topics?solved=true','anonymous');assert.deepEqual(solved.body.topics.map(item=>item.id),['topic']);assert.equal(solved.body.topics[0].answerPostId,'legacy-reply');
  const unsolved=await get(f,'/api/topics?solved=false','anonymous');assert.equal(unsolved.body.topics.length,250);assert(unsolved.body.topics.every(item=>!item.solved&&item.answerPostId===null));
 }finally{await f.close();}
});

test('M4 mark-all-read only touches notifications currently visible to the recipient',async()=>{
 const f=await fixture();try{
  const created=await reply(f);assert.equal(created.status,201);const postId=created.body.post.id;assert.equal((await notifications(f)).body.unreadCount,1);
  await visible(f,'post',postId,true);assert.equal((await notifications(f)).body.unreadCount,0);await write(f,'/api/me/notifications/read',{all:true});
  await visible(f,'post',postId,false);const restored=(await notifications(f)).body;assert.equal(restored.unreadCount,1);assert.equal(restored.notifications[0].readAt,null);
  assert.equal((await notifications(f,'reader')).body.notifications.length,0);
 }finally{await f.close();}
});

test('M4 topic creation mentions are transactional, source-only and replay-safe without notifying the author',async()=>{
 const f=await fixture();try{
  const reader=await identity(f,'reader'),owner=await identity(f,'author');
  const value={title:'A newly created discussion',body:'Hello @'+reader.handle+' and @'+owner.handle,category:'daily',language:'und',bodyFormat:'markdown',expectedUserId:'author',clientRequestId:randomUUID()};
  const first=await f.request('/api/topics',{method:'POST',who:'author',value});assert.equal(first.status,201);const again=await f.request('/api/topics',{method:'POST',who:'author',value});assert.equal(again.status,200);assert.equal(first.body.topic.id,again.body.topic.id);
  const list=(await notifications(f,'reader')).body.notifications;assert.equal(list.length,1);assert.equal(list[0].type,'mention');assert.equal(list[0].kind,'topic');assert.equal(list[0].contentId,first.body.topic.id);assert.equal((await notifications(f)).body.notifications.length,0);
  await visible(f,'topic',first.body.topic.id,true);assert.equal((await notifications(f,'reader')).body.notifications.length,0);
 }finally{await f.close();}
});

test('M4 notification cursors preserve tied timestamps without duplicates and filter hidden rows before pagination',async()=>{
 const f=await fixture();try{
  const posts=[];for(let index=0;index<35;index++){const result=await reply(f,{body:'Paginated real reply '+index});assert.equal(result.status,201);posts.push(result.body.post.id);}
  f.db(db=>db.prepare("UPDATE community_notifications SET created_at='2026-10-22T00:00:00.000Z'").run());
  for(const id of posts.slice(0,3))await visible(f,'post',id,true);
  const first=await notifications(f);assert.equal(first.status,200);assert.equal(first.body.notifications.length,30);assert.equal(first.body.unreadCount,32);assert.equal(typeof first.body.nextCursor,'string');
  const all=await collectPages(cursor=>notifications(f,'author',cursor?'?cursor='+encodeURIComponent(cursor):''),'notifications');assert.equal(all.length,32);assert.equal(new Set(all.map(item=>item.id)).size,32);assert(all.every(item=>!posts.slice(0,3).includes(item.contentId)));
  assert.equal((await notifications(f,'author','?cursor=not-a-real-cursor')).status,400);assert.equal((await notifications(f,'reader')).body.notifications.length,0);
 }finally{await f.close();}
});

test('M4 bookmark pagination is account scoped and handles tied dates and hidden topics',async()=>{
 const f=await fixture();try{
  f.db(db=>{const insert=db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');for(let index=0;index<35;index++)insert.run('bookmark-'+String(index).padStart(2,'0'),'Bookmarked '+index,'Visible body','Excerpt','daily','reader','ReplyAuthor','R','en',date,date);});
  for(let index=0;index<35;index++)assert.equal((await write(f,'/api/topics/bookmark-'+String(index).padStart(2,'0')+'/bookmark',{bookmarked:true})).status,200);
  f.db(db=>db.prepare("UPDATE topic_bookmarks SET created_at='2026-10-22T00:00:00.000Z'").run());await visible(f,'topic','bookmark-00',true);await visible(f,'topic','bookmark-01',true);
  const all=await collectPages(cursor=>get(f,'/api/me/bookmarks'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),'bookmarks');assert.equal(all.length,33);assert.equal(new Set(all.map(item=>item.topicId)).size,33);assert(all.every(item=>!['bookmark-00','bookmark-01'].includes(item.topicId)));assert.equal((await get(f,'/api/me/bookmarks','reader')).body.bookmarks.length,0);
 }finally{await f.close();}
});

test('M4 tracking counts a later reply with the same timestamp and smaller ID without moving a seen marker backward',async()=>{
 const f=await fixture();try{
  const {createCommunityInteractions}=await import('../community-interactions.mjs');
  const insert=id=>f.db(db=>{
   const service=createCommunityInteractions({db,body(){},json(){},userRequired(){},session(){},httpError:(status,code)=>Object.assign(Error(code),{status,code}),limit(){}});
   db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO posts(id,topic_id,user_id,body,language,created_at,body_format) VALUES(?,?,?,?,?,?,?)').run(id,'topic','reader','Same millisecond reply '+id,'en','2026-10-22T00:00:00.000Z','plain');service.onReplyCreated({id,topicId:'topic',userId:'reader',body:'Same millisecond reply '+id,bodyFormat:'plain',quotes:[]});db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  });
  await subscription(f,'tracking','tracker');await write(f,'/api/topics/topic/seen',{},'tracker');
  insert('zzzz-same-time-first');await write(f,'/api/topics/topic/seen',{},'tracker');assert.equal((await interaction(f,'tracker')).body.interaction.newReplies,0);
  insert('aaaa-same-time-later');assert.equal((await interaction(f,'tracker')).body.interaction.newReplies,1);
  await visible(f,'post','aaaa-same-time-later',true);assert.equal((await interaction(f,'tracker')).body.interaction.newReplies,0);
  await visible(f,'post','aaaa-same-time-later',false);assert.equal((await interaction(f,'tracker')).body.interaction.newReplies,1);
  await write(f,'/api/topics/topic/seen',{},'tracker');await visible(f,'post','aaaa-same-time-later',true);await write(f,'/api/topics/topic/seen',{},'tracker');await visible(f,'post','aaaa-same-time-later',false);assert.equal((await interaction(f,'tracker')).body.interaction.newReplies,0);
 }finally{await f.close();}
});

test('M4 late mute, account switch and ban are rechecked after a streamed request body',async()=>{
 const f=await fixture();try{
  const route=content('post','legacy-reply','reactions');
  const muted=await f.slowWrite(route,{reaction:'like'},()=>f.db(db=>db.prepare("UPDATE users SET muted=1 WHERE id='author'").run()));assert.equal(muted.status,403);assert.equal((await get(f,route,'anonymous')).body.reactions.counts.like,0);
  f.db(db=>db.prepare("UPDATE users SET muted=0 WHERE id='author'").run());
  const hash=createHash('sha256').update(f.tokens.author.split('=')[1]).digest('hex');
  const switched=await f.slowWrite('/api/topics/topic/bookmark',{bookmarked:true},()=>f.db(db=>db.prepare("UPDATE sessions SET user_id='reader' WHERE token_hash=?").run(hash)));assert.equal(switched.status,409);assert.equal(switched.body.code,'account_changed');assert.equal((await get(f,'/api/me/bookmarks','reader')).body.bookmarks.length,0);
  f.db(db=>db.prepare("UPDATE sessions SET user_id='author' WHERE token_hash=?").run(hash));
  const banned=await f.slowWrite('/api/topics/topic/bookmark',{bookmarked:true},()=>f.db(db=>db.prepare("UPDATE users SET banned=1 WHERE id='author'").run()));assert([401,403].includes(banned.status));assert.equal(f.db(db=>db.prepare("SELECT count(*) AS n FROM topic_bookmarks WHERE user_id='author'").get().n),0);
 }finally{await f.close();}
});
