import {randomUUID} from 'node:crypto';
const error=(status,code)=>Object.assign(new Error(code),{status,code});

export function changeTopicFlags(db,{topicId,operator,hidden,pinned,action='moderate',allowAuthor=false}){
 if(typeof topicId!=='string'||!topicId||!operator||typeof operator.id!=='string'||!operator.id||!['admin','member'].includes(operator.role)||
  !['moderate','author_hide','operator_hide','operator_restore'].includes(action)||
  hidden===undefined&&pinned===undefined||hidden!==undefined&&typeof hidden!=='boolean'||pinned!==undefined&&typeof pinned!=='boolean')throw error(400,'invalid_moderation');
 db.exec('BEGIN IMMEDIATE');
 try{
  const row=db.prepare('SELECT id,user_id,hidden,pinned FROM topics WHERE id=?').get(topicId);
  if(!row)throw error(404,'topic_not_found');
  if(operator.role!=='admin'&&!(allowAuthor&&row.user_id===operator.id&&hidden===true&&pinned===undefined))throw error(403,'forbidden');
  const before={hidden:!!row.hidden,pinned:!!row.pinned},after={hidden:hidden??before.hidden,pinned:pinned??before.pinned};
  if(before.hidden!==after.hidden||before.pinned!==after.pinned){
   db.prepare('UPDATE topics SET hidden=?,pinned=? WHERE id=?').run(Number(after.hidden),Number(after.pinned),topicId);
   db.prepare('INSERT INTO admin_actions(id,user_id,topic_id,action,details,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),operator.id,topicId,action,JSON.stringify({before,after}),new Date().toISOString());
  }
  db.exec('COMMIT');return {id:topicId,...after};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
