import {randomUUID} from 'node:crypto';

export function setReleaseOrder(db,{topicId,order,operatorId}){
 if(!Number.isSafeInteger(order)||order<0||order>10000)throw Error('Invalid release order');
 db.exec('BEGIN IMMEDIATE');
 try{
  const actor=db.prepare("SELECT id FROM users WHERE id=? AND role='admin' AND banned=0 AND muted=0").get(operatorId);
  if(!actor)throw Error('An active existing administrator is required');
  const topic=db.prepare("SELECT id,release_order FROM topics WHERE id=? AND category='site' AND hidden=0 AND seed=0").get(topicId);
  if(!topic)throw Error('A visible non-sample site announcement is required');
  if(topic.release_order!==order){
   db.prepare('UPDATE topics SET release_order=? WHERE id=?').run(order,topicId);
   db.prepare('INSERT INTO admin_actions(id,user_id,topic_id,action,details,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),actor.id,topicId,'order_release_note',JSON.stringify({before:topic.release_order,after:order}),new Date().toISOString());
  }
  db.exec('COMMIT');return {id:topicId,releaseOrder:order};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
