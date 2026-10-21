import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readdir,readFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';

test('production backup script preserves BLOB bytes, checks foreign keys, and writes a matching checksum',async()=>{
 const temporary=fileURLToPath(new URL('../artifacts/test-tmp/',import.meta.url));await mkdir(temporary,{recursive:true});
 const directory=await mkdtemp(path.join(temporary,'backup-')),source=path.join(directory,'source.sqlite'),destination=path.join(directory,'backups');
 try{
  const db=new DatabaseSync(source);db.exec('CREATE TABLE images(id INTEGER PRIMARY KEY,bytes BLOB); CREATE TABLE refs(id INTEGER REFERENCES images(id))');db.prepare('INSERT INTO images VALUES(?,?)').run(1,Buffer.from([0,1,2,255]));db.exec('INSERT INTO refs VALUES(1)');db.close();
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../ops/backup.mjs',import.meta.url))],{env:{...process.env,JPL_DB:source,JPL_BACKUP_DIR:destination},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const files=await readdir(destination),snapshot=files.find(file=>file.endsWith('.sqlite'));
  const bytes=await readFile(path.join(destination,snapshot)),checksum=await readFile(path.join(destination,snapshot+'.sha256'),'utf8');
  assert.equal(checksum,createHash('sha256').update(bytes).digest('hex')+'  '+snapshot+'\n');
  const restored=new DatabaseSync(path.join(destination,snapshot),{readOnly:true});
  try{assert.deepEqual(Buffer.from(restored.prepare('SELECT bytes FROM images').get().bytes),Buffer.from([0,1,2,255]));assert.equal(restored.prepare('PRAGMA foreign_key_check').all().length,0);}finally{restored.close();}
 }finally{await rm(directory,{recursive:true,force:true});}
});
