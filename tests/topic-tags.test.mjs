import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {topicTags,normalizeTopicTags} from '../dist/topic-tags.js';
import {createTopicPosting,migrateTopicPosting} from '../topic-posting.mjs';

const value=(extra={})=>({title:'A tagged topic',body:'A valid original body.',category:'daily',language:'en',bodyFormat:'markdown',clientRequestId:randomUUID(),...extra});
const httpError=(status,code)=>Object.assign(new Error(code),{status,code});
const isError=code=>error=>error.status===400&&error.code===code;
const user={id:'author',name:'Author',role:'member'};

function fixture(attachments){
 const db=new DatabaseSync(':memory:');
 db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE users(id TEXT PRIMARY KEY);
 INSERT INTO users VALUES('author');
 CREATE TABLE topics(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,excerpt TEXT NOT NULL,category TEXT NOT NULL,user_id TEXT REFERENCES users(id),author TEXT NOT NULL,avatar TEXT NOT NULL,tone INTEGER NOT NULL DEFAULT 0,pinned INTEGER NOT NULL DEFAULT 0,language TEXT NOT NULL,seed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,hidden INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE test_attachments(id TEXT PRIMARY KEY,topic_id TEXT REFERENCES topics(id));`);
 let limited=0;
 const service=typeof attachments==='function'?attachments(db):attachments;
 const posting=createTopicPosting({db,attachments:service,httpError,limit:()=>{limited++;},language:language=>language,
  text:(text,min,max)=>{if(typeof text!=='string'||text.trim().length<min||text.trim().length>max||text.includes('\0'))throw httpError(400,'invalid_input');return text.trim();}});
 return {db,posting,limitCount:()=>limited,close:()=>db.close()};
}

test('maintained tag catalog validates a canonical copy without restricting suggested categories',()=>{
 assert.equal(topicTags.length,15);
 assert.equal(new Set(topicTags.map(tag=>tag.id)).size,15);
 assert.deepEqual(topicTags.find(tag=>tag.id==='moving'),{id:'moving',labelKey:'tagMoving',categories:['housing','visa']});
 assert(topicTags.every(tag=>/^tag[A-Z]/.test(tag.labelKey)&&tag.categories.length>0));
 assert.deepEqual(normalizeTopicTags(undefined),[]);
 assert.deepEqual(normalizeTopicTags([]),[]);
 const original=['visa','electricity','community'];
 assert.deepEqual(normalizeTopicTags(original),['community','electricity','visa']);
 assert.deepEqual(original,['visa','electricity','community']);
 for(const invalid of [null,'rent',{},42,[null],[''],['unknown'],['rent','rent'],['RENT'],new Array(1),['rent','moving','electricity','gas','visa','residence']]){
  assert.throws(()=>normalizeTopicTags(invalid),TypeError);
 }
});

test('tag migration is repeatable, canonical tags persist and duplicate requests do not consume the topic limit',()=>{
 const context=fixture();
 try{
  migrateTopicPosting(context.db);migrateTopicPosting(context.db);
  const input=value({category:'daily',tagIds:['visa','electricity']});
  const created=context.posting.create({},user,input);
  assert.equal(created.replayed,false);
  assert.deepEqual(context.posting.tagsForTopic(created.id),['electricity','visa']);
  const replay=context.posting.create({},user,{...input,tagIds:['electricity','visa']});
  assert.deepEqual(replay,{id:created.id,replayed:true});assert.equal(context.limitCount(),1);
  assert.throws(()=>context.posting.create({},user,{...input,tagIds:['visa']}),error=>error.status===409&&error.code==='request_conflict');
  assert.equal(context.db.prepare('SELECT count(*) AS n FROM topic_tags').get().n,2);
  context.db.prepare('DELETE FROM topics WHERE id=?').run(created.id);
  assert.equal(context.db.prepare('SELECT count(*) AS n FROM topic_tags').get().n,0);
  assert.equal(context.db.prepare('SELECT topic_id FROM topic_create_requests').get().topic_id,null);
 }finally{context.close();}
});

test('old empty tag and attachment payloads preserve phase-two request hashes and reject malformed collections',()=>{
 const context=fixture();
 try{
  const input=value(),created=context.posting.create({},user,input);
  const oldHash=createHash('sha256').update(JSON.stringify([input.title,input.body,input.category,input.language,input.bodyFormat])).digest('hex');
  assert.equal(context.db.prepare('SELECT payload_hash FROM topic_create_requests').get().payload_hash,oldHash);
  const replay=context.posting.create({},user,{...input,tagIds:[],attachmentIds:[]});
  assert.deepEqual(replay,{id:created.id,replayed:true});
  for(const tagIds of [null,'rent',['unknown'],['rent','rent'],new Array(1)]){
   assert.throws(()=>context.posting.create({},user,value({tagIds})),isError('invalid_tags'));
  }
  const id=randomUUID();
  for(const attachmentIds of [null,'',{},[null],['invalid'],[id,id.toUpperCase()],new Array(1),Array.from({length:6},()=>randomUUID())]){
   assert.throws(()=>context.posting.create({},user,value({attachmentIds})),isError('invalid_attachment'));
  }
  assert.throws(()=>context.posting.create({},user,value({attachmentIds:[id]})),isError('invalid_attachment'));
  assert.equal(context.db.prepare('SELECT count(*) AS n FROM topics').get().n,1);
 }finally{context.close();}
});

test('attachment normalization keeps gallery order and replays do not revalidate expired or bound uploads',()=>{
 let expired=false,checked=0,bound=0,lastIds;
 const context=fixture(db=>({
  validateForPost(owner,ids){assert.equal(owner,user.id);checked++;if(expired)throw httpError(400,'attachment_expired');lastIds=[...ids];},
  bindToTopic(owner,ids,topicId){assert.equal(owner,user.id);assert.deepEqual(ids,lastIds);assert(db.prepare('SELECT id FROM topics WHERE id=?').get(topicId));bound++;}
 }));
 try{
  const ids=[randomUUID(),randomUUID()],input=value({tagIds:['travel'],attachmentIds:ids.map(id=>id.toUpperCase())});
  const created=context.posting.create({},user,input);
  assert.deepEqual(lastIds,ids);assert.equal(checked,1);assert.equal(bound,1);
  expired=true;
  const replay=context.posting.create({},user,{...input,attachmentIds:ids});
  assert.deepEqual(replay,{id:created.id,replayed:true});assert.equal(checked,1);assert.equal(bound,1);assert.equal(context.limitCount(),1);
  assert.throws(()=>context.posting.create({},user,{...input,attachmentIds:[...ids].reverse()}),error=>error.status===409&&error.code==='request_conflict');
  assert.throws(()=>context.posting.create({},user,{...input,clientRequestId:randomUUID()}),isError('attachment_expired'));
  assert.equal(context.db.prepare('SELECT count(*) AS n FROM topics').get().n,1);
 }finally{context.close();}
});

test('attachment failures roll back topic, tag, receipt and attachment binding as one transaction',()=>{
 const id=randomUUID();let failValidation=true;
 const context=fixture(db=>({
  validateForPost(){if(failValidation)throw httpError(400,'invalid_attachment');},
  bindToTopic(owner,ids,topicId){db.prepare('UPDATE test_attachments SET topic_id=? WHERE id=?').run(topicId,ids[0]);throw httpError(400,'invalid_attachment');}
 }));
 try{
  context.db.prepare('INSERT INTO test_attachments(id) VALUES(?)').run(id);
  const input=value({tagIds:['travel','visa'],attachmentIds:[id]});
  assert.throws(()=>context.posting.create({},user,input),isError('invalid_attachment'));
  failValidation=false;
  assert.throws(()=>context.posting.create({},user,input),isError('invalid_attachment'));
  for(const table of ['topics','topic_tags','topic_create_requests'])assert.equal(context.db.prepare('SELECT count(*) AS n FROM '+table).get().n,0);
  assert.equal(context.db.prepare('SELECT topic_id FROM test_attachments WHERE id=?').get(id).topic_id,null);
 }finally{context.close();}
});
