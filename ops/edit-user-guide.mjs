import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createCommunityContent} from '../community-content.mjs';
import {createCommunityInteractions} from '../community-interactions.mjs';
import {createTopicAttachments} from '../topic-attachments.mjs';
const args=process.argv.slice(2),get=key=>args[args.indexOf(key)+1];
if(!args.includes('--db')||!args.includes('--actor')||!args.includes('--file'))throw Error('Usage: --db <sqlite> --actor <existing-admin-email> --file <guide.json> [--apply]');
const apply=args.includes('--apply'),db=new DatabaseSync(get('--db'),{readOnly:!apply});db.exec('PRAGMA foreign_keys=ON');
try{
 const userRequired=()=>{const actor=db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE AND role='admin'").get(get('--actor'));if(!actor||actor.banned||actor.muted)throw Error('An active existing administrator is required');return actor;};
 const actor=userRequired(),input=JSON.parse(await readFile(get('--file'),'utf8')),id='32122823-b43c-46b6-95ba-6625763f03c7';
 if(input.category!=='site'||input.language!=='zh-CN'||input.bodyFormat!=='markdown'||typeof input.body!=='string'||input.body.length>12000)throw Error('Invalid public guide');
 const row=db.prepare("SELECT * FROM topics WHERE id=? AND category='site' AND hidden=0").get(id);if(!row)throw Error('Existing guide required');
 const common={db,userRequired,postingRequired:userRequired,session:userRequired,httpError:(status,code)=>Object.assign(Error(code),{status,code}),language:value=>value,limit(){},migrate:false};
 if(!apply)console.log(JSON.stringify({apply:false,id,expectedVersion:row.content_version,changed:row.body!==input.body}));
 else{
  const interactions=createCommunityInteractions(common),attachments=createTopicAttachments(common),content=createCommunityContent({...common,interactions,attachments});
  const result=content.edit('topic',id,actor,{title:input.title,body:input.body,bodyFormat:'markdown',language:'zh-CN',expectedVersion:row.content_version,expectedUserId:actor.id});
  console.log(JSON.stringify({updated:true,id,version:result.version,createdAt:result.createdAt,editedAt:result.editedAt}));
 }
}finally{db.close();}
