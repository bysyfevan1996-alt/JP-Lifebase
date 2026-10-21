// Explicit operator publication, never seeds or startup writes.
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createTopicPosting} from '../topic-posting.mjs';
import {setReleaseOrder} from '../release-notes.mjs';
import {changeTopicFlags} from '../topic-state.mjs';
const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
if(!args.includes('--db')||!args.includes('--actor')||!args.includes('--file')||!args.includes('--request-id'))throw Error('Usage: --db <absolute.sqlite> --actor <existing-admin-email> --file <public-json> --request-id <uuid> [--publish]');
const input=JSON.parse(await readFile(get('--file'),'utf8'));
const db=new DatabaseSync(get('--db'),{readOnly:!args.includes('--publish')});db.exec('PRAGMA foreign_keys=ON');
try{
 const actor=db.prepare("SELECT id,name,role,banned,muted FROM users WHERE email=? COLLATE NOCASE AND role='admin'").get(get('--actor'));
 if(!actor||actor.banned||actor.muted)throw Error('An active existing administrator is required');
 const text=(value,min,max)=>{if(typeof value!=='string'||value.trim().length<min||value.length>max||value.includes('\0'))throw Error('Invalid public text');return value.trim();};
 const posting=createTopicPosting({db,text,language:value=>value,httpError:(status,code)=>Object.assign(Error(code),{status}),limit(){},migrate:false});
 if(input.category!=='site'||input.language!=='zh-CN'||input.bodyFormat!=='markdown')throw Error('Only a Chinese Markdown site announcement is accepted');
 text(input.title,3,140);text(input.body,5,12000);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(get('--request-id')))throw Error('A stable UUID request ID is required');
 const payload={...input,clientRequestId:get('--request-id'),expectedUserId:actor.id};
 const order=args.includes('--release-order')?Number(get('--release-order')):null;
 if(order!==null&&(!Number.isSafeInteger(order)||order<0||order>10000))throw Error('Invalid release order');
 if(!args.includes('--publish'))console.log(JSON.stringify({validated:true,title:input.title,category:'site',publish:false}));
 else{const result=posting.create({},actor,payload);if(order!==null)setReleaseOrder(db,{topicId:result.id,order,operatorId:actor.id});if(args.includes('--pin'))changeTopicFlags(db,{topicId:result.id,operator:actor,pinned:true});console.log(JSON.stringify({published:true,...result,releaseOrder:order,pinned:args.includes('--pin'),url:'https://www.jp-lifebase.com/t/'+result.id}));}
}finally{db.close();}
