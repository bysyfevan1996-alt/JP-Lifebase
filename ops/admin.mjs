import {DatabaseSync} from 'node:sqlite';
import {changeTopicFlags} from '../topic-state.mjs';
const db=new DatabaseSync(process.env.JPL_DB||'/var/lib/jplifebase/community.sqlite',{open:true,timeout:5000,readOnly:false});
db.exec('PRAGMA foreign_keys=ON');
const [action,value,actorEmail]=process.argv.slice(2);
try{
if(action==='promote'){
 if(!value||!value.includes('@'))throw new Error('Usage: admin.mjs promote <registered-email>');
 const result=db.prepare("UPDATE users SET role='admin' WHERE email=? AND banned=0 AND muted=0").run(value.toLowerCase());
 if(!result.changes)throw new Error('Register the intended owner account first; restricted accounts cannot be promoted.');
 console.log('The registered account now has administrator permissions.');
}else if(action==='inbox'){
 console.log(JSON.stringify({contacts:db.prepare('SELECT id,name,email,message,created_at FROM contacts ORDER BY created_at DESC LIMIT 100').all(),reports:db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 100').all()},null,2));
}else if(action==='hide-topic'||action==='restore-topic'){
 if(!value||!actorEmail)throw new Error('Usage: admin.mjs '+action+' <topic-id> <registered-admin-email>');
 const operator=db.prepare("SELECT id,role FROM users WHERE email=? COLLATE NOCASE AND role='admin' AND banned=0").get(actorEmail);
 if(!operator)throw new Error('An existing administrator actor is required.');
 const result=changeTopicFlags(db,{topicId:value,operator,hidden:action==='hide-topic',action:action==='hide-topic'?'operator_hide':'operator_restore'});
 console.log(JSON.stringify({ok:true,topic:result,recoverable:true}));
}else{
 console.log('Actions: promote <registered-email> | inbox | hide-topic/restore-topic <topic-id> <registered-admin-email>');
}
}finally{db.close();}
