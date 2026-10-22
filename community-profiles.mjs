import {avatarUrl} from './avatar.mjs';
import {markdownText} from './dist/markdown-core.js';

const handlePattern=/^[a-z][a-z0-9_]{2,31}$/;
export function createCommunityProfiles({db,body,json,userRequired,httpError,limit=()=>{},interactions}){
 const q=sql=>db.prepare(sql);
 function user(req){const session=userRequired(req),current=q('SELECT id,name,banned FROM users WHERE id=?').get(session.id);if(!current||current.banned)throw httpError(401,'login_required');return current;}
 function own(id){const row=q('SELECT * FROM user_profiles WHERE user_id=?').get(id);return {name:q('SELECT name FROM users WHERE id=?').get(id)?.name,profile:{bio:row?.bio||'',location:row?.location||'',website:row?.website||'',publicEnabled:!!row?.public_enabled,showActivity:!!row?.show_activity,updatedAt:row?.updated_at||null},handle:interactions.handleFor(id)};}
 function normalize(input){
  const fields=['bio','location','website','publicEnabled','showActivity'];
  if(Object.keys(input).some(key=>!['expectedUserId','name',...fields].includes(key))||fields.some(key=>!Object.hasOwn(input,key))||typeof input.bio!=='string'||input.bio.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.bio)||typeof input.location!=='string'||input.location.trim().length>80||/[\u0000-\u001f\u007f]/.test(input.location)||typeof input.website!=='string'||input.website.trim().length>300||/[\u0000-\u001f\u007f]/.test(input.website)||typeof input.publicEnabled!=='boolean'||typeof input.showActivity!=='boolean')throw httpError(400,'invalid_profile');
  let website=input.website.trim();if(website){let parsed;try{parsed=new URL(website);}catch{throw httpError(400,'invalid_profile');}if(parsed.protocol!=='https:'||parsed.username||parsed.password||!parsed.hostname||parsed.href.length>300)throw httpError(400,'invalid_profile');website=parsed.href;}
  let name;if(Object.hasOwn(input,'name')){
   if(typeof input.name!=='string'||input.name.trim().length<2||input.name.trim().length>40||/[\u0000-\u001f\u007f]/.test(input.name))throw httpError(400,'invalid_name');
   name=input.name.trim();const canonical=name.normalize('NFKC').replace(/[\s_-]+/g,'').toLowerCase();
   if(new Set(['japanlifebase','admin','administrator','管理者','管理员','管理員']).has(canonical))throw httpError(400,'reserved_name');
  }
  return {bio:input.bio,location:input.location.trim(),website,publicEnabled:input.publicEnabled,showActivity:input.showActivity,...name!==undefined?{name}:{}};
 }
 function profile(handle,cursor){
  if(!handlePattern.test(handle))throw httpError(404,'profile_not_found');
  const row=q('SELECT u.id,u.name,u.avatar_hash,u.created_at,p.* FROM user_handles h JOIN users u ON u.id=h.user_id JOIN user_profiles p ON p.user_id=u.id WHERE h.handle=? COLLATE NOCASE AND p.public_enabled=1 AND u.banned=0').get(handle);
  if(!row)throw httpError(404,'profile_not_found');
  const result={profile:{id:row.id,name:row.name,handle,avatarUrl:avatarUrl(row.id,row.avatar_hash),bio:row.bio,location:row.location,website:row.website,joinedAt:row.created_at},activity:[],nextCursor:null};
  let point=null;if(cursor){if(typeof cursor!=='string'||cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(cursor))throw httpError(400,'invalid_cursor');try{point=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch{throw httpError(400,'invalid_cursor');}if(!Array.isArray(point)||point.length!==4||point[0]!==row.id||typeof point[1]!=='string'||!Number.isFinite(Date.parse(point[1]))||!['topic','post'].includes(point[2])||typeof point[3]!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(point[3]))throw httpError(400,'invalid_cursor');}
  if(!row.show_activity)return result;
  const params=[row.id,row.id];let where='';if(point){where=' WHERE created_at<? OR (created_at=? AND kind<?) OR (created_at=? AND kind=? AND id<?)';params.push(point[1],point[1],point[2],point[1],point[2],point[3]);}
  const rows=q("SELECT * FROM (SELECT 'topic' AS kind,t.id,t.id AS topic_id,t.title,t.body,t.body_format,t.created_at FROM topics t WHERE t.user_id=? AND t.hidden=0 AND t.seed=0 UNION ALL SELECT 'post' AS kind,p.id,p.topic_id,t.title,p.body,p.body_format,p.created_at FROM posts p JOIN topics t ON t.id=p.topic_id WHERE p.user_id=? AND p.hidden=0 AND t.hidden=0 AND t.seed=0)"+where+' ORDER BY created_at DESC,kind DESC,id DESC LIMIT 21').all(...params),page=rows.slice(0,20),last=page.at(-1);
  result.activity=page.map(item=>({kind:item.kind,id:item.id,topicId:item.topic_id,title:item.title,excerpt:(item.body_format==='markdown'?markdownText(item.body):item.body).slice(0,240),createdAt:item.created_at,url:'/t/'+encodeURIComponent(item.topic_id)+(item.kind==='post'?'?post='+encodeURIComponent(item.id):'')}));
  if(rows.length>20&&last)result.nextCursor=Buffer.from(JSON.stringify([row.id,last.created_at,last.kind,last.id])).toString('base64url');return result;
 }
 async function handle(req,res,url){
  if(url.pathname==='/api/me/profile'){
   const previous=user(req);if(req.method==='GET'){json(res,200,own(previous.id));return true;}if(req.method!=='POST')throw httpError(404,'not_found');
   limit(req,'profile-write',30,60000);const input=await body(req),current=user(req);if(current.id!==previous.id||input.expectedUserId!==current.id)throw httpError(409,'account_changed');const value=normalize(input);
   db.exec('BEGIN IMMEDIATE');try{const actor=user(req);if(actor.id!==current.id)throw httpError(409,'account_changed');
    if(value.name!==undefined&&value.name!==actor.name){if(q('SELECT id FROM users WHERE name=? AND id<>?').get(value.name,actor.id))throw httpError(409,'name_taken');q('UPDATE users SET name=? WHERE id=?').run(value.name,actor.id);q('UPDATE topics SET author=? WHERE user_id=?').run(value.name,actor.id);}
    q('INSERT INTO user_profiles(user_id,bio,location,website,public_enabled,show_activity,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio,location=excluded.location,website=excluded.website,public_enabled=excluded.public_enabled,show_activity=excluded.show_activity,updated_at=excluded.updated_at').run(actor.id,value.bio,value.location,value.website,Number(value.publicEnabled),Number(value.showActivity),new Date().toISOString());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}json(res,200,own(current.id));return true;
  }
  const match=url.pathname.match(/^\/api\/users\/([a-z0-9_]{3,32})\/profile$/);if(!match)return false;if(req.method!=='GET')throw httpError(404,'not_found');limit(req,'profile-read',120,60000);json(res,200,profile(match[1],url.searchParams.get('cursor')));return true;
 }
 return {handle,profile,own};
}
