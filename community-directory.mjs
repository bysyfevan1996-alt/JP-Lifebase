import {randomUUID,createHash} from 'node:crypto';
import {topicTags} from './dist/topic-tags.js';
import {normalizeTagName,tagNameKey} from './dist/tag-name.js';

const idPattern=/^[a-z][a-z0-9-]{0,39}$/;
const languages=new Set(['en','ja','zh-CN','zh-TW','ko']);
export function createCommunityDirectory({db,body,json,userRequired,httpError,limit=()=>{}}){
 const q=sql=>db.prepare(sql);
 const transaction=work=>{db.exec('BEGIN IMMEDIATE');try{const value=work();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}};
 function serialize(row,color=false){return {id:row.id,name:row.name,translations:JSON.parse(row.translations),...(color?{color:row.color}:{}),position:row.position,active:!!row.active};}
 function catalog(){return {categories:q('SELECT * FROM community_categories ORDER BY position,id').all().map(row=>serialize(row,true)),tags:q('SELECT * FROM community_tags ORDER BY position,id').all().map(row=>serialize(row))};}
 function tagCatalog(){return catalog().tags.map(tag=>({...topicTags.find(item=>item.id===tag.id),...tag,categories:topicTags.find(item=>item.id===tag.id)?.categories||[]}));}
 function normalizeTags(value){if(value===undefined)return [];if(!Array.isArray(value)||value.length>5)throw httpError(400,'invalid_tags');const ids=[];for(const id of value){if(typeof id!=='string'||!idPattern.test(id)||ids.includes(id))throw httpError(400,'invalid_tags');ids.push(id);}return ids.sort();}
 function validateCategory(id,user,{historical=false}={}){if(typeof id!=='string'||!idPattern.test(id)||id==='site'&&user.role!=='admin')throw httpError(400,'invalid_category');if(!historical){const row=q('SELECT active FROM community_categories WHERE id=?').get(id);if(!row)throw httpError(400,'invalid_category');if(!row.active)throw httpError(400,'inactive_category');}return id;}
 function validateEligibility(category,tagIds,user){validateCategory(category,user);for(const id of tagIds){const row=q('SELECT active FROM community_tags WHERE id=?').get(id);if(!row)throw httpError(400,'invalid_tags');if(!row.active)throw httpError(400,'inactive_tag');}}
 function operator(req){const user=userRequired(req),current=q('SELECT id,role,banned FROM users WHERE id=?').get(user.id);if(!current||current.banned)throw httpError(401,'login_required');if(current.role!=='admin')throw httpError(403,'forbidden');return current;}
 function tagActor(req){const user=userRequired(req),current=q('SELECT id,banned,muted FROM users WHERE id=?').get(user.id);if(!current||current.banned)throw httpError(401,'login_required');if(current.muted)throw httpError(403,'account_muted');return current;}
 async function addMemberTag(req,res){
  const previous=tagActor(req);limit(req,'tag-create',20,60000);
  const input=await body(req),current=tagActor(req);
  if(current.id!==previous.id||input.expectedUserId!==current.id)throw httpError(409,'account_changed');
  if(Object.keys(input).some(key=>!['name','expectedUserId'].includes(key)))throw httpError(400,'invalid_tag_name');
  let name;try{name=normalizeTagName(input.name);}catch{throw httpError(400,'invalid_tag_name');}
  const result=transaction(()=>{
   const actor=tagActor(req);if(actor.id!==current.id)throw httpError(409,'account_changed');
   const key=tagNameKey(name),rows=q('SELECT * FROM community_tags ORDER BY active DESC,position,id').all();
   const existing=rows.find(row=>[row.id,row.name,...Object.values(JSON.parse(row.translations))].some(label=>tagNameKey(label)===key));
   if(existing){if(!existing.active)throw httpError(400,'inactive_tag');return {tag:serialize(existing),created:false};}
   if(rows.length>=200)throw httpError(400,'directory_limit');
   const since=new Date(Date.now()-86400000).toISOString();
   if(Number(q("SELECT count(*) n FROM admin_actions WHERE user_id=? AND action='create_tag' AND created_at>=?").get(actor.id,since).n)>=10)throw httpError(429,'tag_creation_limit');
   const id='tag-'+createHash('sha256').update(key).digest('hex').slice(0,32),time=new Date().toISOString();
   if(rows.some(row=>row.id===id))throw httpError(409,'tag_name_conflict');
   const position=Math.min(10000,Math.max(0,...rows.map(row=>row.position))+1);
   q("INSERT INTO community_tags(id,name,translations,position,active,updated_at) VALUES(?,?,'{}',?,1,?)").run(id,name,position,time);
   const tag=serialize(q('SELECT * FROM community_tags WHERE id=?').get(id));
   q('INSERT INTO admin_actions(id,user_id,topic_id,action,details,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),actor.id,'tag:'+id,'create_tag',JSON.stringify({after:tag}),time);
   return {tag,created:true};
  });
  json(res,result.created?201:200,{...catalog(),...result});return true;
 }
 function inputValue(input,kind){
  const allowed=new Set(['expectedUserId','id','name','translations','position','active',...(kind==='categories'?['color']:[])]);
  if(Object.keys(input).some(key=>!allowed.has(key))||typeof input.id!=='string'||!idPattern.test(input.id)||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>60||/[\u0000-\u001f\u007f]/.test(input.name)||!Number.isSafeInteger(input.position)||input.position<0||input.position>10000||typeof input.active!=='boolean')throw httpError(400,'invalid_directory');
  const source=input.translations;if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(key=>!languages.has(key)))throw httpError(400,'invalid_directory');
  const translations={};for(const key of languages){if(source[key]===undefined)continue;if(typeof source[key]!=='string'||!source[key].trim()||source[key].trim().length>60||/[\u0000-\u001f\u007f]/.test(source[key]))throw httpError(400,'invalid_directory');translations[key]=source[key].trim();}
  if(kind==='categories'&&(typeof input.color!=='string'||!/^#[a-fA-F0-9]{6}$/.test(input.color)))throw httpError(400,'invalid_directory');
  return {id:input.id,name:input.name.trim(),translations,...(kind==='categories'?{color:input.color.toLowerCase()}:{}),position:input.position,active:input.active};
 }
 async function handle(req,res,url){
  if(req.method==='GET'&&url.pathname==='/api/directory'){json(res,200,catalog());return true;}
  if(req.method==='GET'&&url.pathname==='/api/tags'){json(res,200,{tags:tagCatalog()});return true;}
  if(req.method==='POST'&&url.pathname==='/api/tags')return addMemberTag(req,res);
  if(url.pathname!=='/api/admin/directory'&&!/^\/api\/admin\/directory\/(categories|tags)$/.test(url.pathname))return false;
  const previous=operator(req);
  if(req.method==='GET'&&url.pathname==='/api/admin/directory'){json(res,200,catalog());return true;}
  const match=url.pathname.match(/^\/api\/admin\/directory\/(categories|tags)$/);
  if(req.method!=='POST'||!match)throw httpError(404,'not_found');
  limit(req,'directory-write',60,60000);const input=await body(req),current=operator(req);if(current.id!==previous.id||input.expectedUserId!==current.id)throw httpError(409,'account_changed');
  const kind=match[1],value=inputValue(input,kind),table=kind==='categories'?'community_categories':'community_tags';
  transaction(()=>{
   const actor=operator(req);if(actor.id!==current.id)throw httpError(409,'account_changed');
   const existing=q('SELECT * FROM '+table+' WHERE id=?').get(value.id),before=existing?serialize(existing,kind==='categories'):null;
   if(!existing&&Number(q('SELECT count(*) AS n FROM '+table).get().n)>=(kind==='categories'?100:200))throw httpError(400,'directory_limit');
   if(kind==='categories'&&!value.active&&(value.id==='site'||existing?.active&&Number(q("SELECT count(*) AS n FROM community_categories WHERE active=1 AND id<>'site'").get().n)===1))throw httpError(400,'protected_category');
   if(JSON.stringify(before)===JSON.stringify(value))return;
   const time=new Date().toISOString();
   if(kind==='categories')q('INSERT INTO community_categories(id,name,translations,color,position,active,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,translations=excluded.translations,color=excluded.color,position=excluded.position,active=excluded.active,updated_at=excluded.updated_at').run(value.id,value.name,JSON.stringify(value.translations),value.color,value.position,Number(value.active),time);
   else q('INSERT INTO community_tags(id,name,translations,position,active,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,translations=excluded.translations,position=excluded.position,active=excluded.active,updated_at=excluded.updated_at').run(value.id,value.name,JSON.stringify(value.translations),value.position,Number(value.active),time);
   q('INSERT INTO admin_actions(id,user_id,topic_id,action,details,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),actor.id,(kind==='categories'?'category:':'tag:')+value.id,kind==='categories'?'update_category':'update_tag',JSON.stringify({before,after:value}),time);
  });
  json(res,200,{ok:true,...catalog()});return true;
 }
 return {handle,catalog,tagCatalog,normalizeTags,validateCategory,validateEligibility};
}
