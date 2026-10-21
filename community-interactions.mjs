import {createHash,randomUUID} from 'node:crypto';
import {extractMentionHandles} from './interaction-mentions.mjs';

const idPattern=/^[a-zA-Z0-9_-]{1,100}$/;
const modes=new Set(['watching','tracking','normal','muted']);
const reactions=new Set(['like','thanks','helpful']);
const stamp=()=>new Date().toISOString();
export function createCommunityInteractions({db,body,json,userRequired,session,httpError,limit}){
 const q=sql=>db.prepare(sql);
 const visibleNotifications=` FROM community_notifications n JOIN community_events e ON e.id=n.event_id JOIN topics t ON t.id=e.topic_id JOIN users a ON a.id=e.actor_id LEFT JOIN posts p ON e.kind='post' AND p.id=e.content_id AND p.topic_id=e.topic_id WHERE n.user_id=? AND t.hidden=0 AND (e.kind='topic' AND e.content_id=t.id OR e.kind='post' AND p.id IS NOT NULL AND p.hidden=0)`;
 function transaction(work){db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
 function currentUser(user,publicWrite=false){const current=q('SELECT id,name,role,banned,muted FROM users WHERE id=?').get(user?.id||'');if(!current||current.banned)throw httpError(401,'login_required');if(publicWrite&&current.muted)throw httpError(403,'account_muted');return current;}
 function requiredTopic(id){const topic=q('SELECT * FROM topics WHERE id=? AND hidden=0').get(id);if(!topic)throw httpError(404,'topic_not_found');return topic;}
 function content(kind,id){
  if(kind==='topic'){const topic=requiredTopic(id);return {kind,id,topicId:id,userId:topic.user_id};}
  const row=q('SELECT p.* FROM posts p JOIN topics t ON t.id=p.topic_id WHERE p.id=? AND p.hidden=0 AND t.hidden=0').get(id);
  if(!row)throw httpError(404,'content_not_found');return {kind,id,topicId:row.topic_id,userId:row.user_id};
 }
 function handleFor(userId){
  if(!userId)return null;const existing=q('SELECT handle FROM user_handles WHERE user_id=?').get(userId);if(existing)return existing.handle;
  if(!q('SELECT id FROM users WHERE id=?').get(userId))return null;
  const digest=createHash('sha256').update(userId).digest('hex');
  for(let length=16;length<=28;length+=4){const handle='u_'+digest.slice(0,length);q('INSERT OR IGNORE INTO user_handles(user_id,handle,created_at) VALUES(?,?,?)').run(userId,handle,stamp());const saved=q('SELECT handle FROM user_handles WHERE user_id=?').get(userId);if(saved)return saved.handle;}
  throw httpError(500,'handle_allocation_failed');
 }
 function ensureHandles(){for(const row of q('SELECT u.id FROM users u LEFT JOIN user_handles h ON h.user_id=u.id WHERE h.user_id IS NULL ORDER BY u.id').all())handleFor(row.id);}
 function decodeCursor(cursor){
  if(cursor===null||cursor===undefined||cursor==='')return null;
  if(typeof cursor!=='string'||cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(cursor))throw httpError(400,'invalid_cursor');
  let value;try{value=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));}catch{throw httpError(400,'invalid_cursor');}
  if(!Array.isArray(value)||value.length!==2||typeof value[0]!=='string'||!Number.isFinite(Date.parse(value[0]))||typeof value[1]!=='string'||!idPattern.test(value[1]))throw httpError(400,'invalid_cursor');return value;
 }
 const encodeCursor=(date,id)=>Buffer.from(JSON.stringify([date,id])).toString('base64url');
 function unreadCount(userId){return Number(q('SELECT count(*) AS n'+visibleNotifications+' AND n.read_at IS NULL').get(userId).n);}
 function notificationPage(userId,{cursor=null,unread=false}={}){
  const point=decodeCursor(cursor),params=[userId];let where=unread?' AND n.read_at IS NULL':'';
  if(point){where+=' AND (n.created_at<? OR n.created_at=? AND n.id<?)';params.push(point[0],point[0],point[1]);}
  const rows=q('SELECT n.id,n.type,n.created_at,n.read_at,e.topic_id,e.kind,e.content_id,a.id AS actor_id,a.name AS actor_name,t.title'+visibleNotifications+where+' ORDER BY n.created_at DESC,n.id DESC LIMIT 31').all(...params);
  const page=rows.slice(0,30),last=page.at(-1);
  return {notifications:page.map(row=>({id:row.id,type:row.type,topicId:row.topic_id,topicTitle:row.title,kind:row.kind,contentId:row.content_id,actor:{name:row.actor_name,handle:handleFor(row.actor_id)},createdAt:row.created_at,readAt:row.read_at})),unreadCount:unreadCount(userId),nextCursor:rows.length>30&&last?encodeCursor(last.created_at,last.id):null};
 }
 function readNotifications(user,input){
  const all=input.all===true;if(all){if(Object.keys(input).some(key=>!['all','expectedUserId'].includes(key)))throw httpError(400,'invalid_input');}
  else if(!Array.isArray(input.ids)||input.ids.length>100||input.ids.some(id=>typeof id!=='string'||!idPattern.test(id))||Object.keys(input).some(key=>!['ids','expectedUserId'].includes(key)))throw httpError(400,'invalid_input');
  return transaction(()=>{const rows=q('SELECT n.id'+visibleNotifications+' AND n.read_at IS NULL').all(user.id),ids=all?null:new Set(input.ids),date=stamp();const update=q('UPDATE community_notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL');for(const row of rows)if(all||ids.has(row.id))update.run(date,row.id,user.id);return {ok:true,unreadCount:unreadCount(user.id)};});
 }
 function effectiveAnswer(topicId){const row=q('SELECT p.id FROM topic_answers a JOIN topics t ON t.id=a.topic_id JOIN posts p ON p.id=a.post_id AND p.topic_id=a.topic_id WHERE a.topic_id=? AND t.hidden=0 AND p.hidden=0').get(topicId);return row?.id||null;}
 function topicState(id,user=null){
  const topic=requiredTopic(id),row=user?q('SELECT * FROM topic_subscriptions WHERE topic_id=? AND user_id=?').get(id,user.id):null;
  return {subscription:row?.mode||'normal',bookmark:!!(user&&q('SELECT 1 FROM topic_bookmarks WHERE topic_id=? AND user_id=?').get(id,user.id)),answerPostId:effectiveAnswer(id),canChooseAnswer:!!(user&&!user.muted&&(topic.user_id===user.id||user.role==='admin')),newReplies:user&&row?Number(q("SELECT count(*) AS n FROM community_events e JOIN posts p ON p.id=e.content_id AND p.topic_id=e.topic_id WHERE e.topic_id=? AND e.kind='post' AND e.type='reply' AND p.hidden=0 AND e.seq>?").get(id,row.seen_event_seq).n):0};
 }
 function latestEventSeq(topicId){return Number(q('SELECT coalesce(max(seq),0) AS seq FROM community_events WHERE topic_id=?').get(topicId).seq);}
 function subscription(user,id,mode){
  if(!modes.has(mode))throw httpError(400,'invalid_subscription');requiredTopic(id);
  q('INSERT INTO topic_subscriptions(topic_id,user_id,mode,seen_event_seq,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(topic_id,user_id) DO UPDATE SET mode=excluded.mode,updated_at=excluded.updated_at').run(id,user.id,mode,latestEventSeq(id),stamp());return topicState(id,user);
 }
 function seen(user,id){
  requiredTopic(id);q("INSERT INTO topic_subscriptions(topic_id,user_id,mode,seen_event_seq,updated_at) VALUES(?,?,'normal',?,?) ON CONFLICT(topic_id,user_id) DO UPDATE SET seen_event_seq=max(topic_subscriptions.seen_event_seq,excluded.seen_event_seq),updated_at=excluded.updated_at").run(id,user.id,latestEventSeq(id),stamp());return topicState(id,user);
 }
 function bookmark(user,id,bookmarked){if(typeof bookmarked!=='boolean')throw httpError(400,'invalid_input');requiredTopic(id);if(bookmarked)q('INSERT OR IGNORE INTO topic_bookmarks(topic_id,user_id,created_at) VALUES(?,?,?)').run(id,user.id,stamp());else q('DELETE FROM topic_bookmarks WHERE topic_id=? AND user_id=?').run(id,user.id);return topicState(id,user);}
 function bookmarks(userId,cursor){const point=decodeCursor(cursor),params=[userId];let where='';if(point){where=' AND (b.created_at<? OR b.created_at=? AND b.topic_id<?)';params.push(point[0],point[0],point[1]);}const rows=q('SELECT b.topic_id,t.title,t.category,b.created_at FROM topic_bookmarks b JOIN topics t ON t.id=b.topic_id WHERE b.user_id=? AND t.hidden=0'+where+' ORDER BY b.created_at DESC,b.topic_id DESC LIMIT 31').all(...params),page=rows.slice(0,30),last=page.at(-1);return {bookmarks:page.map(row=>({topicId:row.topic_id,title:row.title,category:row.category,createdAt:row.created_at})),nextCursor:rows.length>30&&last?encodeCursor(last.created_at,last.topic_id):null};}
 function reactionState(kind,id,user=null){content(kind,id);const counts={like:0,thanks:0,helpful:0};for(const row of q('SELECT reaction,count(*) AS n FROM content_reactions WHERE kind=? AND content_id=? GROUP BY reaction').all(kind,id))counts[row.reaction]=Number(row.n);return {counts,mine:user?q('SELECT reaction FROM content_reactions WHERE kind=? AND content_id=? AND user_id=?').get(kind,id,user.id)?.reaction||null:null};}
 function event(key,type,topicId,kind,id,actorId){const existing=q('SELECT id,created_at,actor_id FROM community_events WHERE event_key=?').get(key);if(existing)return existing;const value={id:randomUUID(),created_at:stamp(),actor_id:actorId};q('INSERT INTO community_events(id,event_key,type,topic_id,kind,content_id,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run(value.id,key,type,topicId,kind,id,actorId,value.created_at);return value;}
 function notify(value,userId,type,topicId,actorId){if(!userId||userId===actorId||userId===value.actor_id||!q('SELECT 1 FROM users WHERE id=? AND banned=0').get(userId))return;if(q('SELECT mode FROM topic_subscriptions WHERE topic_id=? AND user_id=?').get(topicId,userId)?.mode==='muted')return;q('INSERT OR IGNORE INTO community_notifications(id,event_id,user_id,type,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),value.id,userId,type,value.created_at);}
 function mentioned(kind,id,source,format){
  ensureHandles();const out=[];
  for(const handle of extractMentionHandles(source,format)){const user=q('SELECT u.id FROM user_handles h JOIN users u ON u.id=h.user_id WHERE h.handle=? COLLATE NOCASE AND u.banned=0').get(handle);if(!user)continue;const result=q('INSERT OR IGNORE INTO content_mentions(kind,content_id,user_id) VALUES(?,?,?)').run(kind,id,user.id);if(result.changes)out.push(user.id);}
  return out;
 }
 function onTopicCreated({id,userId,body,bodyFormat}){const recipients=mentioned('topic',id,body,bodyFormat);if(!recipients.length)return;const value=event('topic:'+id,'mention',id,'topic',id,userId);for(const target of recipients)notify(value,target,'mention',id,userId);}
 function onReplyCreated({id,topicId,userId,body,bodyFormat,quotes=[]}){
  const recipients=new Map(),topic=requiredTopic(topicId);
  if(topic.user_id)recipients.set(topic.user_id,'reply');
  for(const row of q("SELECT user_id FROM topic_subscriptions WHERE topic_id=? AND mode='watching'").all(topicId))recipients.set(row.user_id,'reply');
  for(const ref of quotes){const source=content(ref.kind,ref.id);if(source.topicId===topicId&&source.userId)recipients.set(source.userId,'quote');}
  for(const target of mentioned('post',id,body,bodyFormat))recipients.set(target,'mention');
  const value=event('reply:'+id,'reply',topicId,'post',id,userId);for(const [target,type]of recipients)notify(value,target,type,topicId,userId);
 }
 function onContentEdited({kind,id,topicId,userId,body,bodyFormat,version,previousBody,previousBodyFormat}){if(previousBody!==undefined)mentioned(kind,id,previousBody,previousBodyFormat);const recipients=mentioned(kind,id,body,bodyFormat);if(!recipients.length)return;const value=event('edit:'+kind+':'+id+':'+version,'mention',topicId,kind,id,userId);for(const target of recipients)notify(value,target,'mention',topicId,userId);}
 function setReaction(user,kind,id,reaction){if(reaction!==null&&!reactions.has(reaction))throw httpError(400,'invalid_reaction');return transaction(()=>{const actor=currentUser(user,true),target=content(kind,id);if(target.userId===actor.id)throw httpError(400,'self_reaction');const old=q('SELECT reaction FROM content_reactions WHERE kind=? AND content_id=? AND user_id=?').get(kind,id,actor.id)?.reaction||null;if(old===reaction)return reactionState(kind,id,actor);if(reaction===null)q('DELETE FROM content_reactions WHERE kind=? AND content_id=? AND user_id=?').run(kind,id,actor.id);else{q('INSERT INTO content_reactions(kind,content_id,user_id,reaction,created_at) VALUES(?,?,?,?,?) ON CONFLICT(kind,content_id,user_id) DO UPDATE SET reaction=excluded.reaction,created_at=excluded.created_at').run(kind,id,actor.id,reaction,stamp());const value=event('reaction:'+kind+':'+id+':'+actor.id+':'+reaction,'reaction',target.topicId,kind,id,actor.id);notify(value,target.userId,'reaction',target.topicId,actor.id);}return reactionState(kind,id,actor);});}
 function answer(user,topicId,postId){
  if(postId!==null&&(typeof postId!=='string'||!idPattern.test(postId)))throw httpError(400,'invalid_answer');
  return transaction(()=>{const actor=currentUser(user,true),topic=requiredTopic(topicId);if(actor.id!==topic.user_id&&actor.role!=='admin')throw httpError(403,'forbidden');let reply=null;if(postId!==null){reply=content('post',postId);if(reply.topicId!==topicId)throw httpError(400,'invalid_answer');}
   const previous=q('SELECT post_id FROM topic_answers WHERE topic_id=?').get(topicId)?.post_id||null;
   if(previous===postId)return topicState(topicId,actor);
   if(postId===null)q('DELETE FROM topic_answers WHERE topic_id=?').run(topicId);else{q('INSERT INTO topic_answers(topic_id,post_id,chosen_by,chosen_at) VALUES(?,?,?,?) ON CONFLICT(topic_id) DO UPDATE SET post_id=excluded.post_id,chosen_by=excluded.chosen_by,chosen_at=excluded.chosen_at').run(topicId,postId,actor.id,stamp());const value=event('answer:'+topicId+':'+postId,'answer',topicId,'post',postId,actor.id);notify(value,reply.userId,'answer',topicId,actor.id);}
   q('INSERT INTO admin_actions(id,user_id,topic_id,action,details,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),actor.id,topicId,'choose_answer',JSON.stringify({before:previous,after:postId}),stamp());return topicState(topicId,actor);
  });
 }
 function writeUser(req,input,previous,publicWrite=false){const user=userRequired(req);if(user.id!==previous.id||input.expectedUserId!==user.id)throw httpError(409,'account_changed');return currentUser(user,publicWrite);}
 async function handle(req,res,url){
  const route=url.pathname;
  if(req.method==='GET'&&route==='/api/me/identity'){const user=currentUser(userRequired(req));json(res,200,{identity:{id:user.id,name:user.name,handle:handleFor(user.id)}});return true;}
  if(req.method==='GET'&&route==='/api/users/mentions'){userRequired(req);const prefix=(url.searchParams.get('q')||'').trim();if(prefix.length<2||prefix.length>32||/[\p{Cc}\p{Cf}]/u.test(prefix))throw httpError(400,'invalid_mention_query');limit(req,'mentions',60,60000);ensureHandles();const users=q('SELECT u.id,u.name,h.handle FROM user_handles h JOIN users u ON u.id=h.user_id WHERE u.banned=0 AND (substr(h.handle,1,?)=? COLLATE NOCASE OR substr(u.name,1,?)=? COLLATE NOCASE) ORDER BY h.handle LIMIT 8').all(Array.from(prefix).length,prefix,Array.from(prefix).length,prefix);json(res,200,{users});return true;}
  if(req.method==='GET'&&route==='/api/me/notifications'){const user=userRequired(req);limit(req,'notification-read',120,60000);const unread=url.searchParams.get('unread');if(unread!==null&&unread!=='1'&&unread!=='0')throw httpError(400,'invalid_input');json(res,200,notificationPage(user.id,{cursor:url.searchParams.get('cursor'),unread:unread==='1'}));return true;}
  if(req.method==='POST'&&route==='/api/me/notifications/read'){const previous=userRequired(req),input=await body(req),user=writeUser(req,input,previous);json(res,200,readNotifications(user,input));return true;}
  if(req.method==='GET'&&route==='/api/me/bookmarks'){const user=userRequired(req);json(res,200,bookmarks(user.id,url.searchParams.get('cursor')));return true;}
  const topic=route.match(/^\/api\/topics\/([a-zA-Z0-9_-]{1,100})\/(interaction|subscription|seen|bookmark|answer)$/);
  if(topic){const [,id,action]=topic;if(req.method==='GET'&&action==='interaction'){json(res,200,{interaction:topicState(id,session(req))});return true;}
   if(req.method==='POST'&&action!=='interaction'){const previous=userRequired(req),input=await body(req),user=writeUser(req,input,previous,action==='answer');limit(req,'interaction-write:'+user.id,100,60000);let value;if(action==='subscription')value=subscription(user,id,input.mode);else if(action==='seen')value=seen(user,id);else if(action==='bookmark')value=bookmark(user,id,input.bookmarked);else value=answer(user,id,input.postId);json(res,200,{interaction:value});return true;}
   throw httpError(405,'method_not_allowed');
  }
  const target=route.match(/^\/api\/content\/(topic|post)\/([a-zA-Z0-9_-]{1,100})\/reactions$/);
  if(target){const [,kind,id]=target;if(req.method==='GET'){json(res,200,{reactions:reactionState(kind,id,session(req))});return true;}if(req.method==='POST'){const previous=userRequired(req),input=await body(req),user=writeUser(req,input,previous,true);limit(req,'reaction-write:'+user.id,100,60000);json(res,200,{reactions:setReaction(user,kind,id,input.reaction)});return true;}throw httpError(405,'method_not_allowed');}
  return false;
 }
 return {handle,handleFor,topicState,effectiveAnswer,onTopicCreated,onReplyCreated,onContentEdited,notificationPage};
}
