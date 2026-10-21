import {randomUUID} from 'node:crypto';

export function createCommunityPolicy({db,httpError,body,json,userRequired,language}){
 const q=sql=>db.prepare(sql);
 function postingRequired(req){const user=userRequired(req);if(user.muted)throw httpError(403,'account_muted');return user;}
 function setUserRestrictions(operator,targetId,input){
  if(!input||typeof input!=='object'||Array.isArray(input)||!Object.keys(input).length||Object.keys(input).some(key=>!['banned','muted'].includes(key)||typeof input[key]!=='boolean'))throw httpError(400,'invalid_restrictions');
  db.exec('BEGIN IMMEDIATE');
  try{
   const actor=q('SELECT id,role,banned FROM users WHERE id=?').get(operator?.id||'');
   if(!actor||actor.role!=='admin'||actor.banned)throw httpError(403,'forbidden');
   const target=q('SELECT id,role,banned,muted FROM users WHERE id=?').get(targetId);
   if(!target)throw httpError(404,'user_not_found');
   if(target.id===actor.id)throw httpError(403,'cannot_restrict_self');
   if(target.role==='admin')throw httpError(403,'protected_admin');
   const before={banned:!!target.banned,muted:!!target.muted},after={banned:input.banned??before.banned,muted:input.muted??before.muted};
   if(after.banned){
    q('DELETE FROM sessions WHERE user_id=?').run(target.id);
    q('DELETE FROM auth_flows WHERE challenge_id IN (SELECT id FROM auth_challenges WHERE user_id=?)').run(target.id);
    q('UPDATE auth_challenges SET active=0 WHERE user_id=?').run(target.id);
   }
   if(before.banned!==after.banned||before.muted!==after.muted){
    q('UPDATE users SET banned=?,muted=? WHERE id=?').run(Number(after.banned),Number(after.muted),target.id);
    q('INSERT INTO admin_actions(id,user_id,topic_id,action,details,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),actor.id,'user:'+target.id,'restrict_user',JSON.stringify({before,after}),new Date().toISOString());
   }
   db.exec('COMMIT');return {id:target.id,...after};
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 async function handle(req,res,url){
  if(url.pathname!=='/api/me/preferences')return false;
  if(req.method==='GET'){
   const user=userRequired(req),row=q('SELECT language FROM user_preferences WHERE user_id=?').get(user.id);
   json(res,200,{preferences:{language:row?.language||null}});return true;
  }
  if(req.method==='POST'){
   const previous=userRequired(req),input=await body(req),user=userRequired(req);
   if(user.id!==previous.id||req.headers['x-expected-user-id']!==undefined&&req.headers['x-expected-user-id']!==user.id)throw httpError(409,'account_changed');
   if(Object.keys(input).length!==1||!Object.hasOwn(input,'language')||typeof input.language!=='string'||!input.language.trim()||input.language==='original')throw httpError(400,'invalid_preferences');
   const normalized=language(input.language);if(normalized==='original')throw httpError(400,'invalid_language');
   q('INSERT INTO user_preferences(user_id,language,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language,updated_at=excluded.updated_at').run(user.id,normalized,new Date().toISOString());
   json(res,200,{preferences:{language:normalized}});return true;
  }
  return false;
 }
 return {handle,setUserRestrictions,postingRequired};
}
