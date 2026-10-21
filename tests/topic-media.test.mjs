import {testPort} from './test-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {crc32,deflateSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temporary=path.join(root,'artifacts','test-tmp');
function image(width=2){
 const chunk=(type,data=Buffer.alloc(0))=>{const bytes=Buffer.alloc(data.length+12);bytes.writeUInt32BE(data.length);bytes.write(type,4);data.copy(bytes,8);bytes.writeUInt32BE(crc32(bytes.subarray(4,bytes.length-4)),bytes.length-4);return bytes;};
 const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(2,4);h[8]=8;h[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.alloc((width*4+1)*2))),chunk('IEND')]);
}
function seed(directory){
 const db=new DatabaseSync(path.join(directory,'community.sqlite'));db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',created_at TEXT NOT NULL);CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);`);
 const tokens={};for(const [id,role]of [['author','member'],['reader','member'],['operator','admin']]){
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.test','synthetic','synthetic',role,new Date().toISOString());
  const token=randomBytes(32).toString('hex');tokens[id]='jpl_session='+token;db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+3600000);
 }db.close();return tokens;
}
async function launch(directory){
 const env={...process.env,PORT:await testPort(),JPL_DATA_DIR:directory,JPL_SEED:'0',COOKIE_SECURE:'0',NODE_ENV:'test',JPL_TEST_MAIL_OUTBOX:'0'};
 for(const key of Object.keys(env))if(/^(TRANSLATION_|RESEND_|MAIL_)/.test(key)||key==='AUTH_TOKEN_SECRET')delete env[key];
 const child=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);
 const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Server startup timed out: '+errors));},10000);child.stdout.on('data',b=>{const m=String(b).match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+errors));});});
 // A random OS port can land on Fetch's reserved-port list; retry the isolated listener.
 try{await fetch(base+'/api/health');}catch(error){await new Promise(resolve=>{child.once('exit',resolve);child.kill();});if(error.cause?.message==='bad port')return launch(directory);throw error;}
 async function request(route,{method='GET',value,binary,cookie='',origin=base,headers={}}={}){
  const response=await fetch(base+route,{method,headers:{...(method==='GET'?{}:{'Content-Type':binary?'image/png':'application/json',...(origin?{Origin:origin}:{})}),...(cookie?{Cookie:cookie}:{}),...headers},body:binary??(value===undefined?undefined:JSON.stringify(value))});
  return {status:response.status,headers:response.headers,...(response.headers.get('content-type')?.includes('application/json')?{body:await response.json()}:{bytes:Buffer.from(await response.arrayBuffer())})};
 }
 return {base,request,stop:()=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>{child.once('exit',resolve);child.kill();})};
}
async function fixture(t){
 await mkdir(temporary,{recursive:true});const directory=await mkdtemp(path.join(temporary,'topic-media-')),tokens=seed(directory);const context={directory,tokens,app:await launch(directory)};
 t.after(async()=>{await context.app.stop();assert(path.resolve(directory).startsWith(temporary+path.sep+'topic-media-'));await rm(directory,{recursive:true,force:true});});
 context.upload=({user='author',uploadId=randomUUID(),binary=image(),...options}={})=>context.app.request('/api/topic-attachments',{method:'POST',cookie:tokens[user]||'',binary,headers:{'X-Client-Upload-Id':uploadId,'X-Expected-User-Id':user},...options});
 context.create=(extra={},user='author')=>context.app.request('/api/topics',{method:'POST',cookie:tokens[user],value:{title:'Image topic',body:'A real image post body.',category:'daily',language:'en',bodyFormat:'markdown',clientRequestId:randomUUID(),expectedUserId:user,...extra}});
 context.inspect=work=>{const db=new DatabaseSync(path.join(directory,'community.sqlite'));db.exec('PRAGMA foreign_keys=ON');try{return work(db);}finally{db.close();}};
 return context;
}

test('HTTP images enforce origin, account, content and private access; upload retry reuses one image',async t=>{
 const f=await fixture(t),uploadId=randomUUID(),bytes=image();
 assert.equal((await f.upload({user:''})).status,401);
 assert.equal((await f.upload({origin:null})).status,403);
 assert.equal((await f.upload({origin:'https://example.test'})).status,403);
 assert.equal((await f.upload({headers:{'X-Client-Upload-Id':randomUUID(),'X-Expected-User-Id':'reader'}})).status,409);
 assert.equal((await f.upload({binary:Buffer.from('<svg/>')})).status,400);
 const first=await f.upload({uploadId,binary:bytes});assert.equal(first.status,201);const attachment=first.body.attachment;
 assert.equal((await f.app.request(attachment.url)).status,404);
 assert.equal((await f.app.request(attachment.url,{cookie:f.tokens.reader})).status,404);
 const owner=await f.app.request(attachment.url,{cookie:f.tokens.author});assert.equal(owner.status,200);assert.deepEqual(owner.bytes,bytes);assert.match(owner.headers.get('cache-control'),/no-store/);
 assert.match(owner.headers.get('content-type'),/^image\/png/);assert.equal(owner.headers.get('x-content-type-options'),'nosniff');
 const repeated=await Promise.all([f.upload({uploadId,binary:bytes}),f.upload({uploadId,binary:bytes})]);assert(repeated.every(r=>r.status===200&&r.body.attachment.id===attachment.id));
 assert.equal((await f.upload({uploadId,binary:image(3)})).status,409);
 assert.equal((await f.app.request(attachment.url,{method:'DELETE',cookie:f.tokens.reader,headers:{'X-Expected-User-Id':'reader'}})).status,404);
 assert.equal(f.inspect(db=>db.prepare('SELECT count(*) n FROM topic_attachments').get().n),1);
});

test('publishing binds ordered owned images and tags atomically; hide, restore and delete protect bytes and retry receipts',async t=>{
 const f=await fixture(t),a=(await f.upload({binary:image(2)})).body.attachment,b=(await f.upload({binary:image(3)})).body.attachment,foreign=(await f.upload({user:'reader'})).body.attachment;
 const initial=f.inspect(db=>db.prepare('SELECT count(*) n FROM topics').get().n);
 assert.equal((await f.create({tagIds:['travel'],attachmentIds:[a.id,foreign.id]})).status,400);
 assert.equal(f.inspect(db=>db.prepare('SELECT count(*) n FROM topics').get().n),initial);
 assert.equal(f.inspect(db=>db.prepare('SELECT topic_id FROM topic_attachments WHERE id=?').get(a.id).topic_id),null);
 const payload={clientRequestId:randomUUID(),tagIds:['travel','transport'],attachmentIds:[b.id,a.id]};
 const created=await f.create(payload);assert.equal(created.status,201);const id=created.body.topic.id;
 assert.deepEqual(created.body.topic.tagIds,['transport','travel']);assert.deepEqual(created.body.topic.attachments.map(x=>x.id),[b.id,a.id]);
 const detail=await f.app.request('/api/topics/'+id+'?lang=original');assert.equal(detail.status,200);assert.equal(detail.body.posts.length,1);assert.equal(detail.body.topic.replies,0);
 assert.deepEqual(detail.body.topic.attachments.map(x=>x.id),[b.id,a.id]);
 const replay=await f.create({...payload,tagIds:['transport','travel']});assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.topic.id,id);
 assert.equal((await f.create({...payload,tagIds:['food']})).status,409);
 assert.equal((await f.app.request(a.url,{method:'DELETE',cookie:f.tokens.author,headers:{'X-Expected-User-Id':'author'}})).status,409);
 assert.equal((await f.app.request(a.url)).status,200);
 const moderate=hidden=>f.app.request('/api/admin/topics/'+id,{method:'POST',cookie:f.tokens.operator,value:{hidden}});
 assert.equal((await moderate(true)).status,200);assert.equal((await f.app.request(a.url)).status,404);assert.equal((await f.app.request(a.url,{cookie:f.tokens.author})).status,404);assert.equal((await f.create(payload)).status,404);
 assert.equal((await moderate(false)).status,200);assert.deepEqual((await f.app.request(b.url)).bytes,image(3));
 assert.equal((await f.app.request('/api/topics/'+id,{method:'DELETE',cookie:f.tokens.author})).status,200);assert.equal((await f.app.request(a.url)).status,404);assert.equal((await f.create(payload)).status,404);
 assert.equal(f.inspect(db=>db.prepare('SELECT count(*) n FROM topic_attachments WHERE id IN (?,?)').get(a.id,b.id).n),2);
 assert.equal((await moderate(false)).status,200);assert.deepEqual((await f.app.request(a.url)).bytes,image(2));assert.equal((await f.create(payload)).body.topic.id,id);
});

test('expired attachments cannot publish, retained drafts renew, and a database backup restores image bytes and associations',async t=>{
 const f=await fixture(t),a=(await f.upload()).body.attachment;
 f.inspect(db=>db.prepare('UPDATE topic_attachments SET expires_at=? WHERE id=?').run(Date.now()+1000,a.id));
 const kept=await f.app.request('/api/topic-attachments/retain',{method:'POST',cookie:f.tokens.author,value:{expectedUserId:'author',attachmentIds:[a.id]}});assert.equal(kept.status,200);assert.deepEqual(kept.body.missingIds,[]);assert(Date.parse(kept.body.attachments[0].expiresAt)>Date.now()+6*86400000);
 const other=await f.app.request('/api/topic-attachments/retain',{method:'POST',cookie:f.tokens.reader,value:{expectedUserId:'reader',attachmentIds:[a.id]}});assert.deepEqual(other.body.attachments,[]);assert.deepEqual(other.body.missingIds,[a.id]);
 f.inspect(db=>db.prepare('UPDATE topic_attachments SET expires_at=? WHERE id=?').run(Date.now()-1,a.id));
 assert.equal((await f.app.request(a.url,{cookie:f.tokens.author})).status,404);assert.equal((await f.create({attachmentIds:[a.id]})).status,400);
 const fresh=(await f.upload({binary:image(3)})).body.attachment,payload={tagIds:['food'],attachmentIds:[fresh.id],clientRequestId:randomUUID()},published=await f.create(payload);assert.equal(published.status,201);
 const restoreDir=path.join(f.directory,'restore');await mkdir(restoreDir);const db=new DatabaseSync(path.join(f.directory,'community.sqlite'),{readOnly:true});try{await backup(db,path.join(restoreDir,'community.sqlite'));}finally{db.close();}
 const restored=await launch(restoreDir);try{
  assert.deepEqual((await restored.request(fresh.url)).bytes,image(3));
  const detail=await restored.request('/api/topics/'+published.body.topic.id+'?lang=original');assert.deepEqual(detail.body.topic.tagIds,['food']);assert.equal(detail.body.topic.attachments[0].id,fresh.id);
  const replay=await restored.request('/api/topics',{method:'POST',cookie:f.tokens.author,value:{title:'Image topic',body:'A real image post body.',category:'daily',language:'en',bodyFormat:'markdown',expectedUserId:'author',...payload}});assert.equal(replay.status,200);assert.equal(replay.body.topic.id,published.body.topic.id);
 }finally{await restored.stop();}
});
