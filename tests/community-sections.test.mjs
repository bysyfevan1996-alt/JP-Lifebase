import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {applySchema} from '../schema.mjs';
test('catalog operation adds photography/life, renames car in five languages, is audited and repeatable',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),tmp=path.join(root,'artifacts/test-tmp');await mkdir(tmp,{recursive:true});
 const folder=await mkdtemp(path.join(tmp,'sections-')),file=path.join(folder,'community.sqlite'),db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');applySchema(db);
 try{
  for(const [id,role]of [['admin','admin'],['member','member']])db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.test','hash','salt',role,'2026-01-01');
  db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('old-car','Old car topic','Original body','excerpt','car','member','member','M','und','2026-01-01','2026-01-01');
  const before=db.prepare('SELECT * FROM topics').all();
  const run=(actor,apply=false)=>spawnSync(process.execPath,[path.join(root,'ops/update-community-sections.mjs'),'--db',file,'--actor',actor,...(apply?['--apply']:[])],{encoding:'utf8'});
  assert.notEqual(run('member@example.test',true).status,0);assert.equal(run('admin@example.test').status,0);assert.equal(db.prepare("SELECT count(*) n FROM community_categories WHERE id='photography'").get().n,0);
  for(let i=0;i<2;i++){const result=run('admin@example.test',true);assert.equal(result.status,0,result.stderr);}
  const categories=db.prepare("SELECT * FROM community_categories WHERE id IN ('car','photography','life') ORDER BY id").all();assert.equal(categories.length,3);
  const car=categories.find(row=>row.id==='car');assert.equal(car.name,'汽车');assert.deepEqual(JSON.parse(car.translations),{en:'Cars',ja:'車','zh-CN':'汽车','zh-TW':'汽車',ko:'자동차'});
  assert.equal(db.prepare("SELECT count(*) n FROM admin_actions WHERE action='update_category'").get().n,3);assert.deepEqual(db.prepare('SELECT * FROM topics').all(),before);
  const guideId='32122823-b43c-46b6-95ba-6625763f03c7';
  db.prepare('INSERT INTO topics(id,title,body,excerpt,category,user_id,author,avatar,language,body_format,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(guideId,'Japan Life Base 使用指南','Original guide body','guide','site','admin','admin','A','zh-CN','markdown','2026-01-01','2026-01-01');
  const edit=()=>spawnSync(process.execPath,[path.join(root,'ops/edit-user-guide.mjs'),'--db',file,'--actor','admin@example.test','--file',path.join(root,'docs/USER_GUIDE.json'),'--apply'],{encoding:'utf8'});
  for(let i=0;i<2;i++){const result=edit();assert.equal(result.status,0,result.stderr);}
  const guide=db.prepare('SELECT * FROM topics WHERE id=?').get(guideId);assert.equal(guide.content_version,2);assert.equal(guide.created_at,'2026-01-01');assert.match(guide.body,/公共标签库/);
  assert.equal(db.prepare("SELECT count(*) n FROM admin_actions WHERE action='edit_topic'").get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM content_revisions WHERE content_id=?').get(guideId).n,2);
 }finally{db.close();assert.ok(path.resolve(folder).startsWith(tmp+path.sep+'sections-'));await rm(folder,{recursive:true,force:true});}
});
