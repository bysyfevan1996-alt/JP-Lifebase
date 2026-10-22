// Explicit catalog operation: existing administrator, audited API path, no startup writes.
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createCommunityDirectory} from '../community-directory.mjs';
const args=process.argv.slice(2),get=key=>args[args.indexOf(key)+1];
if(!args.includes('--db')||!args.includes('--actor'))throw Error('Usage: --db <sqlite> --actor <existing-admin-email> [--apply]');
const apply=args.includes('--apply'),db=new DatabaseSync(get('--db'),{readOnly:!apply});db.exec('PRAGMA foreign_keys=ON');
try{
 const userRequired=()=>{const actor=db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE AND role='admin'").get(get('--actor'));if(!actor||actor.banned||actor.muted)throw Error('An active existing administrator is required');return actor;};
 const actor=userRequired(),input=JSON.parse(await readFile(new URL('./community-sections.json',import.meta.url),'utf8'));
 const service=createCommunityDirectory({db,userRequired,httpError:(status,code)=>Object.assign(Error(code),{status,code}),body:async req=>req.input,json:(res,status,value)=>Object.assign(res,{status,value})});
 const before=service.catalog(),plans=input.categories.map(patch=>{
  const previous=before.categories.find(row=>row.id===patch.id);
  if(patch.id==='car'&&!previous)throw Error('Existing car category required');
  return {...previous,...patch,expectedUserId:actor.id};
 });
 if(!apply){console.log(JSON.stringify({apply:false,categories:plans.map(row=>({id:row.id,name:row.name,position:row.position,active:row.active}))}));}
 else{
  for(const plan of plans){const res={};await service.handle({method:'POST',input:plan},res,new URL('http://local/api/admin/directory/categories'));if(res.status!==200)throw Error('Catalog update failed');}
  console.log(JSON.stringify({applied:true,categories:service.catalog().categories.filter(row=>plans.some(plan=>plan.id===row.id))}));
 }
}finally{db.close();}
