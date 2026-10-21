import {createHash,randomUUID} from 'node:crypto';
import {normalizeTopicTags} from './dist/topic-tags.js';

const categories=new Set(['housing','visa','work','car','daily','site']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function migrateTopicPosting(db){
 const columns=new Set(db.prepare('PRAGMA table_info(topics)').all().map(column=>column.name));
 if(!columns.has('body_format'))db.exec("ALTER TABLE topics ADD COLUMN body_format TEXT NOT NULL DEFAULT 'plain' CHECK(body_format IN ('plain','markdown'))");
 db.exec(`CREATE TABLE IF NOT EXISTS topic_create_requests(
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL,payload_hash TEXT NOT NULL,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,client_request_id)
 );
 CREATE TABLE IF NOT EXISTS topic_tags(topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,tag_id TEXT NOT NULL,PRIMARY KEY(topic_id,tag_id));
 CREATE INDEX IF NOT EXISTS topic_tags_filter ON topic_tags(tag_id,topic_id);`);
}

export function createTopicPosting({db,text,language,httpError,limit,attachments,migrate=true}){
 if(migrate)migrateTopicPosting(db);
 const q=sql=>db.prepare(sql);
 function normalize(input,user){
  const bodyFormat=input.bodyFormat===undefined?'plain':input.bodyFormat;
  if(!['plain','markdown'].includes(bodyFormat))throw httpError(400,'invalid_body_format');
  const title=text(input.title,3,140);
  let content;
  if(bodyFormat==='plain')content=text(input.body,5,12000);
  else{
   if(typeof input.body!=='string'||input.body.trim().length<5||input.body.length>12000||input.body.includes('\0'))throw httpError(400,'invalid_input');
   content=input.body;
  }
  const lang=language(input.language===undefined?'und':input.language);
  if(lang==='original'||!categories.has(input.category)||input.category==='site'&&user.role!=='admin')throw httpError(400,'invalid_category');
  let clientRequestId=null;
  if(input.clientRequestId!==undefined){
   if(typeof input.clientRequestId!=='string'||!uuid.test(input.clientRequestId))throw httpError(400,'invalid_client_request_id');
   clientRequestId=input.clientRequestId.toLowerCase();
  }
  let tagIds;try{tagIds=normalizeTopicTags(input.tagIds);}catch{throw httpError(400,'invalid_tags');}
  const attachmentIds=[];
  if(input.attachmentIds!==undefined){
   if(!Array.isArray(input.attachmentIds)||input.attachmentIds.length>5)throw httpError(400,'invalid_attachment');
   for(const id of input.attachmentIds){if(typeof id!=='string'||!uuid.test(id)||attachmentIds.includes(id.toLowerCase()))throw httpError(400,'invalid_attachment');attachmentIds.push(id.toLowerCase());}
  }
  const fingerprint=[title,content,input.category,lang,bodyFormat];
  if(tagIds.length||attachmentIds.length)fingerprint.push(tagIds,attachmentIds);
  const payloadHash=createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
  return {title,content,category:input.category,lang,bodyFormat,clientRequestId,payloadHash,tagIds,attachmentIds};
 }
 function create(req,user,input){
  if(input.expectedUserId!==undefined&&(typeof input.expectedUserId!=='string'||input.expectedUserId!==user.id))throw httpError(409,'account_changed');
  const value=normalize(input,user);
  db.exec('BEGIN IMMEDIATE');
  try{
   if(value.clientRequestId){
    const receipt=q('SELECT payload_hash,topic_id FROM topic_create_requests WHERE user_id=? AND client_request_id=?').get(user.id,value.clientRequestId);
    if(receipt){
     if(receipt.payload_hash!==value.payloadHash)throw httpError(409,'request_conflict');
     const existing=receipt.topic_id?q('SELECT id,hidden FROM topics WHERE id=?').get(receipt.topic_id):null;
     if(!existing)throw httpError(410,'request_gone');
     if(existing.hidden)throw httpError(404,'topic_not_found');
     db.exec('COMMIT');
     return {id:existing.id,replayed:true};
    }
   }
   if(value.attachmentIds.length){if(!attachments)throw httpError(400,'invalid_attachment');attachments.validateForPost(user.id,value.attachmentIds);}
   limit(req,'topic',5,10*60000);
   const id=randomUUID(),date=new Date().toISOString();
   q('INSERT INTO topics(id,title,body,body_format,excerpt,category,user_id,author,avatar,tone,pinned,language,seed,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,value.title,value.content,value.bodyFormat,value.content.slice(0,160),value.category,user.id,user.name,Array.from(user.name)[0],0,0,value.lang,0,date,date);
   for(const tagId of value.tagIds)q('INSERT INTO topic_tags(topic_id,tag_id) VALUES(?,?)').run(id,tagId);
   if(value.attachmentIds.length)attachments.bindToTopic(user.id,value.attachmentIds,id);
   if(value.clientRequestId)q('INSERT INTO topic_create_requests(user_id,client_request_id,payload_hash,topic_id,created_at) VALUES(?,?,?,?,?)')
    .run(user.id,value.clientRequestId,value.payloadHash,id,date);
   db.exec('COMMIT');
   return {id,replayed:false};
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 return {create,tagsForTopic:topicId=>q('SELECT tag_id FROM topic_tags WHERE topic_id=? ORDER BY tag_id').all(topicId).map(row=>row.tag_id)};
}
