import {DatabaseSync} from 'node:sqlite';
import {setReleaseOrder} from '../release-notes.mjs';
const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
if(!['--db','--actor','--topic','--order'].every(name=>args.includes(name)))throw Error('Usage: --db <absolute.sqlite> --actor <existing-admin-email> --topic <id> --order <integer> [--apply]');
const db=new DatabaseSync(get('--db'),{readOnly:!args.includes('--apply')});db.exec('PRAGMA foreign_keys=ON');
try{
 const actor=db.prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE AND role='admin' AND banned=0 AND muted=0").get(get('--actor'));
 const topic=db.prepare("SELECT id,title FROM topics WHERE id=? AND category='site' AND seed=0 AND hidden=0").get(get('--topic'));
 const order=Number(get('--order'));if(!actor||!topic||!Number.isSafeInteger(order)||order<0||order>10000)throw Error('Invalid release ordering request');
 console.log(JSON.stringify(args.includes('--apply')?setReleaseOrder(db,{topicId:topic.id,order,operatorId:actor.id}):{validated:true,id:topic.id,title:topic.title,order,apply:false}));
}finally{db.close();}
