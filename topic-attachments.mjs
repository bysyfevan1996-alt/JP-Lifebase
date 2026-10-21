import {randomUUID} from 'node:crypto';
import {validateTopicImage,MAX_TOPIC_IMAGE_BYTES} from './topic-image.mjs';

const TTL=7*24*60*60*1000;
const HOUR=60*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE='/api/topic-attachments';
const columns='a.id,a.user_id,a.topic_id,a.width,a.height,length(a.bytes) AS byte_length,a.expires_at,a.created_at,a.position';

export function migrateTopicAttachments(db){
 db.exec(`CREATE TABLE IF NOT EXISTS topic_attachments(
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,upload_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,bytes BLOB NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,
  created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id,upload_id)
 );`);
 if(!db.prepare('PRAGMA table_info(topic_attachments)').all().some(c=>c.name==='position'))db.exec('ALTER TABLE topic_attachments ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
 db.exec(`CREATE INDEX IF NOT EXISTS topic_attachments_pending ON topic_attachments(user_id,expires_at) WHERE topic_id IS NULL;
 CREATE INDEX IF NOT EXISTS topic_attachments_topic ON topic_attachments(topic_id,position);`);
}

export function createTopicAttachments({db,body,json,userRequired,httpError,limit,now=Date.now,migrate=true,postingRequired=userRequired}){
 if(migrate)migrateTopicAttachments(db);
 const q=sql=>db.prepare(sql);
 const lookup=q(`SELECT ${columns},t.hidden AS topic_hidden FROM topic_attachments a LEFT JOIN topics t ON t.id=a.topic_id WHERE a.id=?`);
 const cleanupAt=time=>q('DELETE FROM topic_attachments WHERE topic_id IS NULL AND expires_at<=?').run(time).changes;
 const cleanup=()=>cleanupAt(now());
 function transaction(work){db.exec('BEGIN IMMEDIATE');try{const out=work();db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}
 function canonicalIds(ids){
  if(ids===undefined)return [];
  if(!Array.isArray(ids)||ids.length>5)throw httpError(400,'invalid_attachment');
  const result=ids.map(id=>{if(typeof id!=='string'||!UUID.test(id))throw httpError(400,'invalid_attachment');return id.toLowerCase();});
  if(new Set(result).size!==result.length)throw httpError(400,'invalid_attachment');
  return result;
 }
 function expected(userId,value){if(typeof value!=='string'||value!==userId)throw httpError(409,'account_changed');}
 function metadata(row){return {id:row.id,url:BASE+'/'+row.id,mime:'image/png',width:row.width,height:row.height,bytes:Number(row.byte_length),expiresAt:row.topic_id?null:new Date(row.expires_at).toISOString()};}
 function visible(row){return !row.topic_id||row.topic_hidden===0;}
 function validateForPost(userId,ids){
  const canonical=canonicalIds(ids),time=now();
  for(const id of canonical){
   const row=lookup.get(id);
   if(!row||row.user_id!==userId||row.topic_id)throw httpError(400,'invalid_attachment');
   if(row.expires_at<=time)throw httpError(400,'attachment_expired');
  }
  return canonical;
 }
 // These synchronous methods share the caller's topic transaction. No nested BEGIN.
 function bindToTopic(userId,ids,topicId){
  const canonical=validateForPost(userId,ids);
  if(!canonical.length)return;
  if(!q('SELECT id FROM topics WHERE id=? AND user_id=? AND hidden=0').get(topicId,userId))throw httpError(400,'invalid_attachment');
  const update=q('UPDATE topic_attachments SET topic_id=?,position=? WHERE id=? AND user_id=? AND topic_id IS NULL AND expires_at>?');
  for(const [position,id]of canonical.entries())if(update.run(topicId,position,id,userId,now()).changes!==1)throw httpError(400,'invalid_attachment');
 }
 function forTopic(topicId){return q(`SELECT ${columns} FROM topic_attachments a JOIN topics t ON t.id=a.topic_id WHERE a.topic_id=? AND t.hidden=0 ORDER BY a.position,a.created_at,a.id`).all(topicId).map(metadata);}
 async function upload(req,user){
  expected(user.id,req.headers['x-expected-user-id']);
  limit(req,'attachment-attempt:'+user.id,120,HOUR);
  const uploadId=req.headers['x-client-upload-id'];
  if(typeof uploadId!=='string'||!UUID.test(uploadId))throw httpError(400,'invalid_upload_id');
  if(String(req.headers['content-type']||'').trim().toLowerCase()!=='image/png')throw httpError(415,'png_required');
  const chunks=[];let count=0;
  for await(const bytes of req){count+=bytes.length;if(count>MAX_TOPIC_IMAGE_BYTES)throw httpError(413,'attachment_too_large');chunks.push(bytes);}
  const current=postingRequired(req);if(current.id!==user.id)throw httpError(409,'account_changed');
  const decoded=validateTopicImage(Buffer.concat(chunks)),time=now();
  return transaction(()=>{
   cleanupAt(time);
   const existing=q(`SELECT ${columns},a.payload_hash,t.hidden AS topic_hidden FROM topic_attachments a LEFT JOIN topics t ON t.id=a.topic_id WHERE a.user_id=? AND a.upload_id=?`).get(user.id,uploadId.toLowerCase());
   if(existing){
    if(existing.payload_hash!==decoded.hash)throw httpError(409,'upload_conflict');
    if(!visible(existing))throw httpError(404,'attachment_not_found');
    if(!existing.topic_id){existing.expires_at=time+TTL;q('UPDATE topic_attachments SET expires_at=? WHERE id=?').run(existing.expires_at,existing.id);}
    return {status:200,attachment:metadata(existing)};
   }
   const quota=q('SELECT count(*) AS count,coalesce(sum(length(bytes)),0) AS size FROM topic_attachments WHERE user_id=? AND topic_id IS NULL').get(user.id);
   if(quota.count>=20||quota.size+decoded.bytes.length>100*1024*1024)throw httpError(429,'attachment_quota');
   limit(req,'attachment-upload:'+user.id,30,HOUR);
   const id=randomUUID();
   q('INSERT INTO topic_attachments(id,user_id,topic_id,upload_id,payload_hash,bytes,width,height,created_at,expires_at,position) VALUES(?,?,NULL,?,?,?,?,?,?,?,0)').run(id,user.id,uploadId.toLowerCase(),decoded.hash,decoded.bytes,decoded.width,decoded.height,time,time+TTL);
   return {status:201,attachment:metadata({id,topic_id:null,width:decoded.width,height:decoded.height,byte_length:decoded.bytes.length,expires_at:time+TTL})};
  });
 }
 async function retain(req,user){
  const input=await body(req),current=postingRequired(req);if(current.id!==user.id)throw httpError(409,'account_changed');expected(user.id,input?.expectedUserId);
  if(!Object.hasOwn(input,'attachmentIds'))throw httpError(400,'invalid_attachment');
  const ids=canonicalIds(input.attachmentIds),time=now();
  return transaction(()=>{
   cleanupAt(time);const attachments=[],missingIds=[];
   for(const id of ids){
    const row=lookup.get(id);
    if(!row||row.user_id!==user.id||!visible(row)){missingIds.push(id);continue;}
    if(!row.topic_id){row.expires_at=time+TTL;q('UPDATE topic_attachments SET expires_at=? WHERE id=?').run(row.expires_at,id);}
    attachments.push(metadata(row));
   }
   return {attachments,missingIds};
  });
 }
 async function handle(req,res,url){
  const route=url.pathname;
  if(route===BASE){
   if(req.method!=='POST')throw httpError(405,'method_not_allowed');
   const result=await upload(req,postingRequired(req));json(res,result.status,{attachment:result.attachment});return true;
  }
  if(route===BASE+'/retain'){
   if(req.method!=='POST')throw httpError(405,'method_not_allowed');
   json(res,200,await retain(req,postingRequired(req)));return true;
  }
  if(!route.startsWith(BASE+'/'))return false;
  const id=route.slice(BASE.length+1);if(!UUID.test(id))return false;
  if(req.method==='GET'){
   limit(req,'attachment-read',120,60000);cleanup();
   const row=q('SELECT a.*,t.hidden AS topic_hidden FROM topic_attachments a LEFT JOIN topics t ON t.id=a.topic_id WHERE a.id=?').get(id.toLowerCase());
   if(!row||!visible(row))throw httpError(404,'attachment_not_found');
   if(!row.topic_id){let user;try{user=userRequired(req);}catch(e){if(e.status!==401)throw e;}if(!user||user.id!==row.user_id)throw httpError(404,'attachment_not_found');}
   const bytes=Buffer.from(row.bytes);res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Length':String(bytes.length)});res.end(bytes);return true;
  }
  if(req.method==='DELETE'){
   const user=postingRequired(req);expected(user.id,req.headers['x-expected-user-id']);cleanup();
   const row=lookup.get(id.toLowerCase());if(!row||row.user_id!==user.id)throw httpError(404,'attachment_not_found');
   if(row.topic_id)throw httpError(409,'attachment_published');
   q('DELETE FROM topic_attachments WHERE id=? AND user_id=? AND topic_id IS NULL').run(row.id,user.id);json(res,200,{ok:true});return true;
  }
  throw httpError(405,'method_not_allowed');
 }
 cleanup();
 return {handle,validateForPost,bindToTopic,forTopic,cleanup};
}
