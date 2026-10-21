import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {applySchema} from '../schema.mjs';
test('announcement operator validates existing admin, dry-run does not publish, and receipt prevents duplicate release posts',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));await mkdir(path.join(root,'artifacts/test-tmp'),{recursive:true});
 const directory=await mkdtemp(path.join(root,'artifacts/test-tmp/notice-')),file=path.join(directory,'community.sqlite'),db=new DatabaseSync(file);applySchema(db);
 const stamp='2026-10-01T00:00:00.000Z';
 for(const [id,role]of [['owner','admin'],['member','member']])db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.test','unused','unused',role,stamp);
 const args=['ops/publish-announcement.mjs','--db',file,'--actor','owner@example.test','--file','docs/V1.1_ANNOUNCEMENT.json','--request-id','830dd21d-d655-4758-ae8c-1a1f188e3131'];
 const run=extra=>JSON.parse(execFileSync(process.execPath,[...args,...extra],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 try{
  assert.equal(run([]).publish,false);assert.equal(db.prepare('SELECT count(*) n FROM topics').get().n,0);
  const first=run(['--publish']),again=run(['--publish']);assert.equal(first.id,again.id);assert.equal(again.replayed,true);assert.equal(db.prepare('SELECT count(*) n FROM topics').get().n,1);
  const topic=db.prepare('SELECT category,seed,user_id FROM topics').get();assert.deepEqual({...topic},{category:'site',seed:0,user_id:'owner'});
  args[args.indexOf('owner@example.test')]='member@example.test';assert.throws(()=>run(['--publish']),/Command failed/);
 }finally{db.close();}
});
