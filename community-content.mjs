import {createHash,randomUUID} from 'node:crypto';
import {defaultAvatar,avatarUrl} from './avatar.mjs';
import {markdownText} from './dist/markdown-core.js';
import {changeTopicFlags} from './topic-state.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalized=value=>String(value).normalize('NFC').replace(/\s+/gu,' ').trim();
export function createCommunityContent({db,body,json,userRequired,postingRequired,httpError,language,limit,attachments}){
 const q=sql=>db.prepare(sql),stamp=()=>new Date().toISOString();
 function transaction(work){db.exec('BEGIN IMMEDIATE');try{const out=work();db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}}
 function actor(user){
  const current=q('SELECT id,role,banned,muted FROM users WHERE id=?').get(user.id);
  if(!current||current.banned)throw httpError(401,'login_required');
  if(current.muted)throw httpError(403,'account_muted');return current;
 }
 function raw(kind,id,hidden=false){
  if(kind==='topic'){
   const row=q('SELECT t.*,u.avatar_hash FROM topics t LEFT JOIN users u ON u.id=t.user_id WHERE t.id=?'+(hidden?'':' AND t.hidden=0')).get(id);
   return row?{...row,kind,id,topicId:id,userId:row.user_id,version:row.content_version,bodyFormat:row.body_format,editedAt:row.edited_at,createdAt:row.created_at}:null;
  }
  if(kind==='post'){
   const row=q('SELECT p.*,u.name AS author,u.avatar_hash FROM posts p JOIN users u ON u.id=p.user_id JOIN topics t ON t.id=p.topic_id WHERE p.id=? AND t.hidden=0'+(hidden?'':' AND p.hidden=0')).get(id);
   return row?{...row,kind,id,topicId:row.topic_id,userId:row.user_id,version:row.content_version,bodyFormat:row.body_format,editedAt:row.edited_at,createdAt:row.created_at}:null;
  }
  return null;
 }
 function required(kind,id,hidden=false){const row=raw(kind,id,hidden);if(!row)throw httpError(404,'content_not_found');return row;}
 function quoteRefs(postId){
  return q('SELECT * FROM content_quotes WHERE post_id=? ORDER BY position').all(postId).map(ref=>{
   const source=raw(ref.source_kind,ref.source_id);
   const common={kind:ref.source_kind,id:ref.source_id,topicId:ref.source_topic_id,version:ref.source_version,available:!!source};
   return source?{...common,excerpt:ref.excerpt,author:source.author}:common;
  });
 }
 function serialize(row){return {kind:row.kind,id:row.id,topicId:row.topicId,userId:row.userId,author:row.author,...defaultAvatar(row.author),avatarUrl:avatarUrl(row.userId,row.avatar_hash),version:row.version,body:row.body,bodyFormat:row.bodyFormat,language:row.language,createdAt:row.createdAt,editedAt:row.editedAt,...(row.kind==='topic'?{title:row.title,attachments:attachments.forTopic(row.id)}:{quote:row.quote,quoteRefs:quoteRefs(row.id),attachments:attachments.forPost(row.id)})};}
 function source(kind,id){return serialize(required(kind,id));}
 function version(value){if(!Number.isSafeInteger(value)||value<1)throw httpError(400,'invalid_content_version');return value;}
 function sourceLanguage(value){const lang=value===undefined?'und':language(value);if(lang==='original')throw httpError(400,'invalid_language');return lang;}
 function content(value,min,max){if(typeof value!=='string'||value.includes('\0')||value.length>max||value.trim().length<min)throw httpError(400,'invalid_input');return value;}
 function owned(row,user){if(row.userId!==user.id&&user.role!=='admin')throw httpError(403,'forbidden');}
 function expected(user,input){if(input.expectedUserId!==undefined&&input.expectedUserId!==user.id)throw httpError(409,'account_changed');}
 function snapshot(row,editorId=row.userId,date=row.editedAt||row.createdAt){
  q('INSERT OR IGNORE INTO content_revisions(kind,content_id,version,title,body,body_format,language,editor_id,edited_at) VALUES(?,?,?,?,?,?,?,?,?)').run(row.kind,row.id,row.version,row.kind==='topic'?row.title:null,row.body,row.bodyFormat,row.language,editorId,date);
 }
 function audit(user,row,action,details){q('INSERT INTO admin_actions(id,user_id,topic_id,action,details,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),user.id,row.topicId,action,JSON.stringify({...details,kind:row.kind,contentId:row.id}),stamp());}
 function edit(kind,id,user,input){
  return transaction(()=>{
   const current=actor(user),row=required(kind,id);owned(row,current);expected(current,input);
   if(version(input.expectedVersion)!==row.version)throw Object.assign(httpError(409,'revision_conflict'),{currentVersion:row.version});
   const format=input.bodyFormat??row.bodyFormat;if(!['plain','markdown'].includes(format))throw httpError(400,'invalid_body_format');
   const value=content(input.body,kind==='topic'?5:1,kind==='topic'?12000:6000),lang=sourceLanguage(input.language??row.language);
   const title=kind==='topic'?content(input.title??row.title,3,140).trim():null;
   if(row.body===value&&row.bodyFormat===format&&row.language===lang&&(kind!=='topic'||row.title===title))return serialize(row);
   snapshot(row);const date=stamp();
   if(kind==='topic')q('UPDATE topics SET title=?,body=?,body_format=?,language=?,excerpt=?,content_version=content_version+1,edited_at=?,updated_at=? WHERE id=? AND content_version=?').run(title,value,format,lang,value.slice(0,160),date,date,id,row.version);
   else{q('UPDATE posts SET body=?,body_format=?,language=?,content_version=content_version+1,edited_at=? WHERE id=? AND content_version=?').run(value,format,lang,date,id,row.version);q('UPDATE topics SET updated_at=? WHERE id=?').run(date,row.topicId);}
   const updated=required(kind,id);snapshot(updated,current.id,date);audit(current,updated,'edit_'+kind,{beforeVersion:row.version,afterVersion:updated.version});return serialize(updated);
  });
 }
 function history(kind,id,user){
  const row=required(kind,id);const current=q('SELECT id,role FROM users WHERE id=? AND banned=0').get(user.id);if(!current)throw httpError(401,'login_required');owned(row,current);
  const records=q('SELECT r.*,u.name AS editor FROM content_revisions r LEFT JOIN users u ON u.id=r.editor_id WHERE r.kind=? AND r.content_id=? ORDER BY version DESC LIMIT 50').all(kind,id);
  if(!records.some(record=>record.version===row.version))records.unshift({version:row.version,title:row.title,body:row.body,body_format:row.bodyFormat,language:row.language,edited_at:row.editedAt||row.createdAt,editor:row.author});
  return records.slice(0,50).map(record=>({version:record.version,...(kind==='topic'?{title:record.title}:{}),body:record.body,bodyFormat:record.body_format,language:record.language,editedAt:record.edited_at,editor:record.editor||null}));
 }
 function visibility(kind,id,user,input){
  if(typeof input.hidden!=='boolean')throw httpError(400,'invalid_input');const current=actor(user);expected(current,input);
  if(kind==='topic')return changeTopicFlags(db,{topicId:id,operator:current,hidden:input.hidden,action:'author_hide',allowAuthor:true});
  return transaction(()=>{
   const row=required(kind,id,true);owned(row,current);if(!input.hidden&&current.role!=='admin')throw httpError(403,'forbidden');
   if(Boolean(row.hidden)!==input.hidden){q('UPDATE posts SET hidden=? WHERE id=?').run(Number(input.hidden),id);audit(current,row,input.hidden?'hide_post':'restore_post',{before:!!row.hidden,after:input.hidden});}
   return {id,hidden:input.hidden};
  });
 }
 function quotes(input,topicId){
  if(input===undefined)return [];
  if(!Array.isArray(input)||input.length>6)throw httpError(400,'invalid_quotes');
  return input.map(ref=>{
   if(!ref||typeof ref!=='object'||!['topic','post'].includes(ref.kind)||typeof ref.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(ref.id))throw httpError(400,'invalid_quotes');
   const excerpt=content(ref.excerpt,1,1500),source=required(ref.kind,ref.id);
   if(source.topicId!==topicId)throw httpError(400,'invalid_quotes');
   if(version(ref.version)!==source.version)throw httpError(409,'quote_version_conflict');
   const visible=source.bodyFormat==='markdown'?markdownText(source.body):source.body;
   if(!normalized(visible).includes(normalized(excerpt)))throw httpError(400,'invalid_quote_excerpt');
   return {kind:ref.kind,id:ref.id,version:ref.version,excerpt};
  });
 }
 function createReply(req,user,topicId,input){
  expected(user,input);const value=content(input.body,1,6000),format=input.bodyFormat??'plain';if(!['plain','markdown'].includes(format))throw httpError(400,'invalid_body_format');
  const lang=sourceLanguage(input.language),requestId=input.clientRequestId===undefined?null:input.clientRequestId;
  if(requestId!==null&&(typeof requestId!=='string'||!uuid.test(requestId)))throw httpError(400,'invalid_client_request_id');
  const attachmentIds=input.attachmentIds??[];
  if(!Array.isArray(attachmentIds)||attachmentIds.length>5||attachmentIds.some(id=>typeof id!=='string'||!uuid.test(id))||new Set(attachmentIds.map(id=>id.toLowerCase())).size!==attachmentIds.length)throw httpError(400,'invalid_attachment');
  const legacy=input.quote?content(typeof input.quote==='string'?input.quote:`${input.quote.author||''}: ${input.quote.body||''}`,1,5000):null;
  if(legacy&&input.quotes?.length)throw httpError(400,'invalid_quotes');
  const hash=createHash('sha256').update(JSON.stringify([topicId,value,format,lang,legacy,input.quotes??[],attachmentIds.map(id=>id.toLowerCase())])).digest('hex');
  return transaction(()=>{
   actor(user);required('topic',topicId);
   if(requestId){const receipt=q('SELECT payload_hash,post_id FROM reply_create_requests WHERE user_id=? AND client_request_id=?').get(user.id,requestId.toLowerCase());if(receipt){if(receipt.payload_hash!==hash)throw httpError(409,'request_conflict');return {post:source('post',receipt.post_id),replayed:true};}}
   const refs=quotes(input.quotes,topicId);attachments.validateForPost(user.id,attachmentIds);limit(req,'reply',15,10*60000);
   const id=randomUUID(),date=stamp();
   q('INSERT INTO posts(id,topic_id,user_id,body,quote,language,created_at,body_format) VALUES(?,?,?,?,?,?,?,?)').run(id,topicId,user.id,value,legacy,lang,date,format);
   if(attachmentIds.length)attachments.bindToPost(user.id,attachmentIds,topicId,id);
   for(const [position,ref]of refs.entries())q('INSERT INTO content_quotes(post_id,position,source_kind,source_id,source_topic_id,source_version,excerpt) VALUES(?,?,?,?,?,?,?)').run(id,position,ref.kind,ref.id,topicId,ref.version,ref.excerpt);
   if(requestId)q('INSERT INTO reply_create_requests(user_id,client_request_id,payload_hash,post_id,created_at) VALUES(?,?,?,?,?)').run(user.id,requestId.toLowerCase(),hash,id,date);
   q('UPDATE topics SET updated_at=? WHERE id=?').run(date,topicId);const row=required('post',id);snapshot(row);return {post:serialize(row),replayed:false};
  });
 }
 async function handle(req,res,url){
  const match=url.pathname.match(/^\/api\/content\/(topic|post)\/([a-zA-Z0-9_-]{1,100})\/(source|edit|history|visibility|hidden-replies)$/);if(!match)return false;
  const [,kind,id,action]=match;
  if(req.method==='GET'&&action==='source'){limit(req,'content-read',120,60000);json(res,200,{content:source(kind,id)});return true;}
  if(req.method==='GET'&&action==='history'){json(res,200,{revisions:history(kind,id,userRequired(req))});return true;}
  if(req.method==='GET'&&kind==='topic'&&action==='hidden-replies'){
   const user=userRequired(req);if(user.role!=='admin')throw httpError(403,'forbidden');required('topic',id);
   json(res,200,{posts:q('SELECT p.id,u.name AS author,p.created_at AS createdAt,p.content_version AS version FROM posts p JOIN users u ON u.id=p.user_id WHERE p.topic_id=? AND p.hidden=1 ORDER BY p.created_at DESC,p.id LIMIT 100').all(id)});return true;
  }
  if(req.method==='POST'&&['edit','visibility'].includes(action)){
   const previous=postingRequired(req),input=await body(req),user=postingRequired(req);if(user.id!==previous.id)throw httpError(409,'account_changed');
   limit(req,'content-write:'+user.id,40,60000);
   if(action==='edit')json(res,200,{content:edit(kind,id,user,input)});
   else json(res,200,{content:visibility(kind,id,user,input),recoverable:true});return true;
  }
  throw httpError(405,'method_not_allowed');
 }
 return {handle,source,raw,quoteRefs,serialize,edit,history,visibility,createReply,sourceLanguage};
}
