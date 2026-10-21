import {changeTopicFlags} from './topic-state.mjs';
import {randomUUID} from 'node:crypto';
import {encodeAuditCursor,decodeAuditCursor} from './audit-cursor.mjs';

export function migrateCommunityAdmin(db){
 const columns=new Set(db.prepare('PRAGMA table_info(topics)').all().map(column=>column.name));
 if(!columns.has('hidden'))db.exec('ALTER TABLE topics ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
 db.exec(`CREATE INDEX IF NOT EXISTS topics_visibility_updated ON topics(hidden,updated_at);
 CREATE TABLE IF NOT EXISTS admin_actions(
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL,topic_id TEXT NOT NULL,
  action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL
 );`);
}

export function createCommunityAdmin({db,body,json,userRequired,httpError,policy,migrate=true}){
 if(migrate)migrateCommunityAdmin(db);
 const q=statement=>db.prepare(statement);
 const send=(res,value)=>{json(res,200,value);return true;};
 function operatorRequired(req){const user=userRequired(req);if(user.role!=='admin')throw httpError(403,'forbidden');return user;}
 function search(url){
  const value=url.searchParams.get('query')||'';
  if(value.length>200||value.includes('\0'))throw httpError(400,'invalid_query');
  return value.trim().toLowerCase();
 }
 function topic(row){return {
  id:row.id,title:row.title,category:row.category,author:row.author,
  createdAt:row.created_at,updatedAt:row.updated_at,replies:Number(row.replies),
  hidden:!!row.hidden,pinned:!!row.pinned,seed:!!row.seed
 };}
 async function handle(req,res,url){
  const route=url.pathname;
  if(route!=='/api/admin'&&!route.startsWith('/api/admin/'))return false;
  const operator=operatorRequired(req);
  if(req.method==='GET'&&route==='/api/admin/overview'){
   const count=statement=>Number(q(statement).get().n);
   return send(res,{counts:{
    users:count('SELECT count(*) AS n FROM users'),
    topics:count('SELECT count(*) AS n FROM topics'),
    hiddenTopics:count('SELECT count(*) AS n FROM topics WHERE hidden=1'),
    replies:count('SELECT count(*) AS n FROM posts'),
    contacts:count('SELECT count(*) AS n FROM contacts'),
    reports:count('SELECT count(*) AS n FROM reports')
   }});
  }
  if(req.method==='GET'&&route==='/api/admin/topics'){
   const query=search(url),status=url.searchParams.get('status')||'all';
   if(!['all','visible','hidden'].includes(status))throw httpError(400,'invalid_status');
   const rows=q(`SELECT t.id,t.title,t.category,t.author,t.created_at,t.updated_at,t.hidden,t.pinned,t.seed,
    (SELECT count(*) FROM posts p WHERE p.topic_id=t.id) AS replies
    FROM topics t WHERE (?='all' OR t.hidden=?)
    AND (?='' OR instr(lower(t.title),?)>0 OR instr(lower(t.author),?)>0 OR instr(lower(t.id),?)>0)
    ORDER BY t.updated_at DESC,t.id LIMIT 100`).all(status,status==='hidden'?1:0,query,query,query,query);
   return send(res,{topics:rows.map(topic)});
  }
  if(req.method==='GET'&&route==='/api/admin/users'){
   const query=search(url);
   const rows=q(`SELECT u.id,u.name,u.email,u.role,u.email_verified_at,u.created_at,u.banned,u.muted,
    (SELECT count(*) FROM topics t WHERE t.user_id=u.id) AS topic_count
    FROM users u WHERE ?='' OR instr(lower(u.name),?)>0 OR instr(lower(u.email),?)>0
    ORDER BY u.created_at DESC,u.id LIMIT 100`).all(query,query,query);
   return send(res,{users:rows.map(row=>({id:row.id,name:row.name,email:row.email,role:row.role,
    emailVerified:!!row.email_verified_at,createdAt:row.created_at,topicCount:Number(row.topic_count),banned:!!row.banned,muted:!!row.muted}))});
  }
  if(req.method==='GET'&&route==='/api/admin/inbox'){
   return send(res,{
    contacts:q('SELECT id,name,email,message,created_at FROM contacts ORDER BY created_at DESC,id LIMIT 100').all(),
    reports:q('SELECT id,topic_id,user_id,reason,created_at,status,reviewed_by AS reviewedBy,reviewed_at AS reviewedAt FROM reports ORDER BY created_at DESC,id LIMIT 100').all()
   });
  }
  if(req.method==='GET'&&route==='/api/admin/audit'){
   const cursor=decodeAuditCursor(url.searchParams.get('before'));
   const action=url.searchParams.get('action')||'';
   if(!['','moderate','author_hide','operator_hide','operator_restore','restrict_user','review_report'].includes(action))throw httpError(400,'invalid_action');
   const rows=q(`SELECT id,user_id,topic_id,action,details,created_at FROM admin_actions
    WHERE (?='' OR action=?) AND (? IS NULL OR created_at<? OR (created_at=? AND id<?))
    ORDER BY created_at DESC,id DESC LIMIT 51`).all(action,action,cursor?.createdAt??null,cursor?.createdAt??null,cursor?.createdAt??null,cursor?.id??null);
   const page=rows.slice(0,50);
   return send(res,{actions:page.map(row=>({id:row.id,userId:row.user_id,topicId:row.topic_id,action:row.action,details:JSON.parse(row.details),createdAt:row.created_at})),nextCursor:rows.length>50?encodeAuditCursor(page.at(-1)):null});
  }
  const memberMatch=route.match(/^\/api\/admin\/users\/([a-zA-Z0-9_-]{1,100})$/);
  if(req.method==='POST'&&memberMatch){
   const input=await body(req),current=operatorRequired(req);
   if(current.id!==operator.id)throw httpError(409,'account_changed');
   const keys=Object.keys(input);
   if(!keys.length||keys.some(key=>!['banned','muted'].includes(key)||typeof input[key]!=='boolean'))throw httpError(400,'invalid_restrictions');
   return send(res,{ok:true,user:policy.setUserRestrictions(current,memberMatch[1],input)});
  }
  const reportMatch=route.match(/^\/api\/admin\/reports\/([a-zA-Z0-9_-]{1,100})$/);
  if(req.method==='POST'&&reportMatch){
   const input=await body(req),current=operatorRequired(req);
   if(current.id!==operator.id)throw httpError(409,'account_changed');
   if(Object.keys(input).length!==1||!['open','reviewing','resolved','dismissed'].includes(input.status))throw httpError(400,'invalid_report_status');
   db.exec('BEGIN IMMEDIATE');
   try{
    const row=q('SELECT id,status FROM reports WHERE id=?').get(reportMatch[1]);
    if(!row)throw httpError(404,'report_not_found');
    if(row.status!==input.status){
     const stamp=new Date().toISOString();
     q('UPDATE reports SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?').run(input.status,current.id,stamp,row.id);
     q('INSERT INTO admin_actions(id,user_id,topic_id,action,details,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),current.id,'report:'+row.id,'review_report',JSON.stringify({before:{status:row.status},after:{status:input.status}}),stamp);
    }
    const report=q('SELECT id,status,reviewed_by AS reviewedBy,reviewed_at AS reviewedAt FROM reports WHERE id=?').get(row.id);
    db.exec('COMMIT');return send(res,{ok:true,report});
   }catch(error){db.exec('ROLLBACK');throw error;}
  }
  const match=route.match(/^\/api\/admin\/topics\/([a-zA-Z0-9_-]{1,100})$/);
  if(req.method==='POST'&&match){
   const input=await body(req),keys=Object.keys(input);
   const current=operatorRequired(req);if(current.id!==operator.id)throw httpError(409,'account_changed');
   if(!keys.length||keys.some(key=>!['hidden','pinned'].includes(key)||typeof input[key]!=='boolean'))throw httpError(400,'invalid_moderation');
   const result=changeTopicFlags(db,{topicId:match[1],operator:current,...input});
   return send(res,{ok:true,topic:result});
  }
  throw httpError(404,'not_found');
 }
 return {handle};
}
