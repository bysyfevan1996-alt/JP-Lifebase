import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {crc32,deflateSync} from 'node:zlib';
import {Readable} from 'node:stream';
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {validateTopicImage,MAX_TOPIC_IMAGE_BYTES,MAX_TOPIC_IMAGE_DIMENSION} from '../topic-image.mjs';
import {createTopicAttachments} from '../topic-attachments.mjs';

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function chunk(type,data=Buffer.alloc(0)){
 const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);Buffer.from(type,'latin1').copy(b,4);data.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,b.length-4)),b.length-4);return b;
}
function header({width=1,height=1,depth=8,color=6,compression=0,filter=0,interlace=0}={}){
 const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=depth;h[9]=color;h[10]=compression;h[11]=filter;h[12]=interlace;return h;
}
function png({width=1,height=1,color=6,raw,compressed,metadata=[],parts,...rest}={}){
 const stream=compressed??deflateSync(raw??Buffer.alloc((width*(color===2?3:4)+1)*height));
 return Buffer.concat([signature,chunk('IHDR',header({width,height,color,...rest})),...metadata,...(parts??[stream]).map(p=>chunk('IDAT',p)),chunk('IEND')]);
}
const invalid=(value)=>assert.throws(()=>validateTopicImage(value),e=>e.status===400&&e.code==='invalid_attachment_image');
const code=(status,error)=>e=>e.status===status&&(!error||e.code===error);

test('topic images accept static RGB/RGBA and the dedicated 2048px/5MiB contract',()=>{
 assert.equal(MAX_TOPIC_IMAGE_BYTES,5*1024*1024);assert.equal(MAX_TOPIC_IMAGE_DIMENSION,2048);
 for(const color of [2,6]){
  const bytes=png({width:2048,height:2,color});const out=validateTopicImage(bytes);
  assert.deepEqual(out.bytes,bytes);assert.equal(out.width,2048);assert.equal(out.height,2);assert.match(out.hash,/^[a-f0-9]{64}$/);
 }
 assert.equal(validateTopicImage(png({width:2048,height:2048})).height,2048);
 const stream=deflateSync(Buffer.alloc(5));assert.equal(validateTopicImage(png({parts:[stream.subarray(0,2),Buffer.alloc(0),stream.subarray(2)]})).width,1);
 for(let filter=0;filter<=4;filter++)assert.equal(validateTopicImage(png({raw:Buffer.from([filter,0,0,0,0])})).height,1);
});

test('topic images reject disguised data, excessive dimensions, animation and metadata',()=>{
 for(const value of [null,undefined,'data:image/png;base64,AAAA',{},new Uint8Array(png()),Buffer.alloc(0),Buffer.alloc(MAX_TOPIC_IMAGE_BYTES+1),Buffer.from('<svg/>')])invalid(value);
 for(const options of [{width:0},{height:0},{width:2049},{height:2049},{depth:16},{color:0},{color:3},{color:4},{compression:1},{filter:1},{interlace:1}])invalid(png(options));
 for(const type of ['acTL','fcTL','fdAT','iCCP','iTXt','zTXt','tEXt','ABCD','PLTE','t1Xt'])invalid(png({metadata:[chunk(type,Buffer.alloc(8))]}));
 const good=png();const bad=Buffer.from(good);bad[0]=0;invalid(bad);const crc=Buffer.from(good);crc[crc.length-1]^=1;invalid(crc);
 for(const n of [0,7,8,12,24,good.length-1])invalid(good.subarray(0,n));invalid(Buffer.concat([good,Buffer.from([0])]));
});

test('topic PNG chunk ordering, bounds and fixed metadata are checked',()=>{
 const gamma=Buffer.alloc(4);gamma.writeUInt32BE(45455);const density=Buffer.alloc(9);density[8]=1;
 assert.equal(validateTopicImage(png({metadata:[chunk('sRGB',Buffer.from([0])),chunk('gAMA',gamma),chunk('cHRM',Buffer.alloc(32)),chunk('pHYs',density)]})).width,1);
 const h=chunk('IHDR',header()),data=chunk('IDAT',deflateSync(Buffer.alloc(5))),end=chunk('IEND');
 for(const parts of [[data,end],[h,end],[h,data],[h,h,data,end],[h,data,chunk('IEND',Buffer.from([0]))],[h,data,end,end],[h,chunk('IDAT'),end],[h,data,chunk('sRGB',Buffer.from([0])),data,end]])invalid(Buffer.concat([signature,...parts]));
 invalid(png({metadata:[chunk('sRGB',Buffer.from([0])),chunk('sRGB',Buffer.from([0]))]}));
 invalid(png({metadata:[chunk('sRGB',Buffer.from([4]))]}));invalid(png({metadata:[chunk('gAMA',Buffer.alloc(4))]}));
 const huge=Buffer.from(png());huge.writeUInt32BE(0xffffffff,8);invalid(huge);
 invalid(png({parts:[...Array.from({length:1023},()=>Buffer.alloc(0)),deflateSync(Buffer.alloc(5))]}));
});

test('topic PNG zlib output is bounded, exact and consumes its full input',()=>{
 for(const raw of [Buffer.alloc(4),Buffer.alloc(6),Buffer.alloc(100000),Buffer.from([5,0,0,0,0])])invalid(png({raw}));
 const stream=deflateSync(Buffer.alloc(5));for(const compressed of [Buffer.alloc(0),stream.subarray(0,-1),Buffer.from([1,2,3]),Buffer.concat([stream,stream]),Buffer.concat([stream,Buffer.from([0])])])invalid(png({compressed}));
});

function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('alice'),('bob');CREATE TABLE topics(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),hidden INTEGER NOT NULL DEFAULT 0);`);
 let time=Date.UTC(2026,9,21),rateCalls=[];
 const httpError=(status,code)=>Object.assign(new Error(code),{status,code});
 const service=createTopicAttachments({db,now:()=>time,httpError,
  userRequired:req=>{if(!req.user)throw httpError(401,'login_required');return {id:req.user};},
  body:async req=>req.json,
  json:(res,status,value,headers={})=>{res.status=status;res.value=value;res.headers={...res.headers,...headers};res.ended=true;},
  limit:(...args)=>rateCalls.push(args.slice(1)),
 });
 async function request(method,path,{user='alice',bytes,uploadId=randomUUID(),expectedUserId=user,json,headers={}}={}){
  const req=Readable.from(bytes?[bytes]:[]);req.method=method;req.user=user;req.json=json;
  req.headers={'content-type':'image/png','x-client-upload-id':uploadId,'x-expected-user-id':expectedUserId,...headers};
  const res={headers:{},setHeader(name,value){this.headers[name.toLowerCase()]=value;},writeHead(status,headers={}){this.status=status;for(const[n,v]of Object.entries(headers))this.headers[n.toLowerCase()]=v;},end(value){this.ended=true;this.buffer=value;}};
  const handled=await service.handle(req,res,new URL(path,'http://127.0.0.1'));return {handled,...res};
 }
 const upload=async(options={})=>(await request('POST','/api/topic-attachments',{bytes:png(),...options})).value.attachment;
 return {db,service,request,upload,rateCalls,get time(){return time;},advance(ms){time+=ms;}};
}

test('uploads are authenticated, account-bound, bounded raw PNGs and idempotent',async t=>{
 const f=fixture();t.after(()=>f.db.close());const id=randomUUID(),bytes=png();
 await assert.rejects(f.request('POST','/api/topic-attachments',{user:null,bytes}),code(401));
 await assert.rejects(f.request('POST','/api/topic-attachments',{bytes,expectedUserId:'bob'}),code(409,'account_changed'));
 await assert.rejects(f.request('POST','/api/topic-attachments',{bytes,uploadId:'bad'}),code(400));
 await assert.rejects(f.request('POST','/api/topic-attachments',{bytes,headers:{'content-type':'image/jpeg'}}),code(415));
 await assert.rejects(f.request('POST','/api/topic-attachments',{bytes:Buffer.alloc(MAX_TOPIC_IMAGE_BYTES+1)}),code(413));
 await assert.rejects(f.request('POST','/api/topic-attachments',{bytes:Buffer.from('<svg/>')}),code(400,'invalid_attachment_image'));
 const first=await f.request('POST','/api/topic-attachments',{bytes,uploadId:id});assert.equal(first.status,201);
 const replay=await f.request('POST','/api/topic-attachments',{bytes,uploadId:id});assert.equal(replay.status,200);assert.equal(replay.value.attachment.id,first.value.attachment.id);
 assert.equal(f.db.prepare('SELECT count(*) n FROM topic_attachments').get().n,1);assert.equal(f.rateCalls.filter(c=>c[1]===30).length,1);
 await assert.rejects(f.request('POST','/api/topic-attachments',{bytes:png({raw:Buffer.from([0,1,2,3,4])}),uploadId:id}),code(409,'upload_conflict'));
 assert.equal(f.rateCalls.filter(c=>c[1]===30).length,1);assert.equal(replay.value.attachment.bytes,bytes.length);assert.equal(replay.value.attachment.mime,'image/png');assert.equal(Date.parse(replay.value.attachment.expiresAt),f.time+7*86400000);
});

test('pending image bytes are private and retain conceals missing or foreign references',async t=>{
 const f=fixture();t.after(()=>f.db.close());const a=await f.upload(),foreign=await f.upload({user:'bob'}),missing=randomUUID();
 const own=await f.request('GET',a.url);assert.deepEqual(Buffer.from(own.buffer),png());assert.equal(own.headers['content-type'],'image/png');assert.match(own.headers['cache-control'],/no-store/);assert.equal(own.headers['x-content-type-options'],'nosniff');
 for(const user of ['bob',null])await assert.rejects(f.request('GET',a.url,{user}),code(404));
 f.advance(86400000);
 await assert.rejects(f.request('POST','/api/topic-attachments/retain',{json:{attachmentIds:[a.id],expectedUserId:'bob'}}),code(409,'account_changed'));
 const out=await f.request('POST','/api/topic-attachments/retain',{json:{attachmentIds:[a.id,foreign.id,missing],expectedUserId:'alice'}});
 assert.equal(out.value.attachments.length,1);assert.equal(out.value.attachments[0].id,a.id);assert.equal(Date.parse(out.value.attachments[0].expiresAt),f.time+7*86400000);assert.deepEqual(out.value.missingIds,[foreign.id,missing]);
 for(const ids of [[a.id,a.id],['bad'],Array.from({length:6},()=>randomUUID())])await assert.rejects(f.request('POST','/api/topic-attachments/retain',{json:{attachmentIds:ids,expectedUserId:'alice'}}),code(400));
});

test('post binding enforces owner, count, expiry and transaction rollback; visible images become public',async t=>{
 const f=fixture();t.after(()=>f.db.close());const uploadId=randomUUID(),a=await f.upload({uploadId}),b=await f.upload({user:'bob'}),c=await f.upload();
 assert.deepEqual(f.service.validateForPost('alice',undefined),[]);assert.deepEqual(f.service.validateForPost('alice',[a.id]),[a.id]);assert.deepEqual(f.service.validateForPost('alice',[a.id.toUpperCase()]),[a.id]);
 for(const ids of [null,{},'bad',[b.id],[a.id,a.id],['bad'],Array.from({length:6},()=>randomUUID())])assert.throws(()=>f.service.validateForPost('alice',ids),code(400));
 f.db.exec("BEGIN IMMEDIATE; INSERT INTO topics VALUES('rollback','alice',0)");f.service.bindToTopic('alice',[a.id],'rollback');f.db.exec('ROLLBACK');assert.equal(f.db.prepare('SELECT topic_id FROM topic_attachments WHERE id=?').get(a.id).topic_id,null);
 f.db.exec("BEGIN IMMEDIATE; INSERT INTO topics VALUES('published','alice',0)");f.service.bindToTopic('alice',[c.id,a.id],'published');f.db.exec('COMMIT');
 assert.throws(()=>f.service.validateForPost('alice',[a.id]),code(400));assert.equal(f.service.forTopic('published')[0].expiresAt,null);assert.deepEqual(f.service.forTopic('published').map(x=>x.id),[c.id,a.id]);
 const publicResult=await f.request('GET',a.url,{user:null});assert.deepEqual(Buffer.from(publicResult.buffer),png());
 const oldExpiry=f.db.prepare('SELECT expires_at FROM topic_attachments WHERE id=?').get(a.id).expires_at;f.advance(8*86400000);f.service.cleanup();
 assert.equal((await f.request('GET',a.url,{user:null})).ended,true);const retained=await f.request('POST','/api/topic-attachments/retain',{json:{attachmentIds:[a.id],expectedUserId:'alice'}});assert.equal(retained.value.attachments[0].expiresAt,null);assert.equal(f.db.prepare('SELECT expires_at FROM topic_attachments WHERE id=?').get(a.id).expires_at,oldExpiry);
 const repeated=await f.request('POST','/api/topic-attachments',{bytes:png(),uploadId});assert.equal(repeated.status,200);assert.equal(repeated.value.attachment.id,a.id);assert.equal(repeated.value.attachment.expiresAt,null);
 await assert.rejects(f.request('DELETE',a.url),code(409,'attachment_published'));
 f.db.prepare('UPDATE topics SET hidden=1 WHERE id=?').run('published');for(const user of ['alice','bob',null])await assert.rejects(f.request('GET',a.url,{user}),code(404));assert.deepEqual(f.service.forTopic('published'),[]);
 await assert.rejects(f.request('POST','/api/topic-attachments',{bytes:png(),uploadId}),code(404,'attachment_not_found'));
 f.db.prepare('UPDATE topics SET hidden=0 WHERE id=?').run('published');assert.equal((await f.request('GET',a.url,{user:null})).ended,true);
 f.db.prepare('DELETE FROM topics WHERE id=?').run('published');await assert.rejects(f.request('GET',a.url),code(404));assert.equal(f.db.prepare('SELECT count(*) n FROM topic_attachments WHERE id=?').get(a.id).n,0);
});

test('only own unpublished attachments can be removed and expired pending bytes are cleaned',async t=>{
 const f=fixture();t.after(()=>f.db.close());const a=await f.upload();
 await assert.rejects(f.request('DELETE',a.url,{user:'bob'}),code(404));await assert.rejects(f.request('DELETE',a.url,{expectedUserId:'bob'}),code(409));
 assert.equal((await f.request('DELETE',a.url)).value.ok,true);await assert.rejects(f.request('GET',a.url),code(404));
 const expired=await f.upload();f.advance(7*86400000);assert.throws(()=>f.service.validateForPost('alice',[expired.id]),code(400));f.service.cleanup();assert.equal(f.db.prepare('SELECT count(*) n FROM topic_attachments').get().n,0);
 const missing=await f.request('POST','/api/topic-attachments/retain',{json:{attachmentIds:[expired.id],expectedUserId:'alice'}});assert.deepEqual(missing.value.missingIds,[expired.id]);
});

test('pending quotas allow idempotent upload retry, isolate accounts and serialize simultaneous uploads',async t=>{
 const f=fixture();t.after(()=>f.db.close());const ids=[];for(let i=0;i<19;i++)ids.push(await f.upload());const uploadId=randomUUID();const last=await f.upload({uploadId});ids.push(last);assert.equal((await f.upload({uploadId})).id,last.id);
 await assert.rejects(f.upload(),code(429,'attachment_quota'));assert.equal(f.db.prepare('SELECT count(*) n FROM topic_attachments WHERE user_id=?').get('alice').n,20);
 assert.equal((await f.upload({user:'bob'})).mime,'image/png');await f.request('DELETE',ids[0].url);const results=await Promise.allSettled([f.upload(),f.upload()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='attachment_quota').length,1);
});

test('a normal SQLite snapshot includes attachment bytes and published associations',async t=>{
 const f=fixture();t.after(()=>f.db.close());const a=await f.upload();f.db.exec("BEGIN IMMEDIATE; INSERT INTO topics VALUES('backup','alice',0)");f.service.bindToTopic('alice',[a.id],'backup');f.db.exec('COMMIT');
 const directory=path.resolve('artifacts/test-tmp/topic-attachments');mkdirSync(directory,{recursive:true});const file=path.join(directory,randomUUID()+'.sqlite');await backup(f.db,file);
 const snapshot=new DatabaseSync(file);t.after(()=>snapshot.close());const saved=snapshot.prepare('SELECT bytes,topic_id FROM topic_attachments WHERE id=?').get(a.id);assert.deepEqual(Buffer.from(saved.bytes),png());assert.equal(saved.topic_id,'backup');assert.equal(snapshot.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});

