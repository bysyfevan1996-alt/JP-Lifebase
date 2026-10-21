import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {applySchema} from '../schema.mjs';

test('operator guide publication pins once, preserves retry receipt and requires an existing administrator',async()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),temp=path.join(root,'artifacts/test-tmp');await mkdir(temp,{recursive:true});
 const directory=await mkdtemp(path.join(temp,'publish-guide-')),filename=path.join(directory,'community.sqlite'),input=path.join(directory,'guide.json'),request=randomUUID();
 const db=new DatabaseSync(filename);db.exec('PRAGMA foreign_keys=ON');applySchema(db);
 for(const [id,role]of [['admin','admin'],['reader','member']])db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.test','test-hash','test-salt',role,'2026-10-01T00:00:00.000Z');
 await writeFile(input,JSON.stringify({title:'Community user guide',category:'site',language:'zh-CN',bodyFormat:'markdown',body:'## Start\n\nRead the community guide here.'}));
 const run=(actor,publish=false)=>JSON.parse(execFileSync(process.execPath,['ops/publish-announcement.mjs','--db',filename,'--actor',actor,'--file',input,'--request-id',request,'--pin',...(publish?['--publish']:[])],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 try{
  assert.equal(run('admin@example.test').publish,false);assert.equal(db.prepare('SELECT count(*) n FROM topics').get().n,0);
  assert.throws(()=>run('reader@example.test',true));assert.equal(db.prepare('SELECT count(*) n FROM topics').get().n,0);
  const first=run('admin@example.test',true),again=run('admin@example.test',true);assert.equal(first.pinned,true);assert.equal(again.id,first.id);assert.equal(again.replayed,true);assert.equal(first.url,'https://www.jp-lifebase.com/t/'+first.id);
  assert.equal(db.prepare('SELECT pinned FROM topics WHERE id=?').get(first.id).pinned,1);assert.equal(db.prepare('SELECT count(*) n FROM topics').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM topic_create_requests').get().n,1);assert.equal(db.prepare("SELECT count(*) n FROM admin_actions WHERE action='moderate'").get().n,1);
 }finally{db.close();assert(path.resolve(directory).startsWith(temp+path.sep+'publish-guide-'));await rm(directory,{recursive:true,force:true});}
});
