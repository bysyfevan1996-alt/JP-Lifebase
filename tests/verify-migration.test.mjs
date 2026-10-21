import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,rm,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {runMigrations} from '../migrations.mjs';
import {migrations,SCHEMA_VERSION} from '../schema.mjs';

test('VPS migration rehearsal preserves an existing ledger prefix while verifying new tables and full restored copy',async()=>{
 const temporary=fileURLToPath(new URL('../artifacts/test-tmp/',import.meta.url));await mkdir(temporary,{recursive:true});
 const directory=await mkdtemp(path.join(temporary,'migration-rehearsal-')),source=path.join(directory,'source.sqlite');
 try{
  const db=new DatabaseSync(source);db.exec('PRAGMA foreign_keys=ON');runMigrations(db,migrations.slice(0,1));
  db.prepare('INSERT INTO users(id,name,email,password,salt,role,created_at) VALUES(?,?,?,?,?,?,?)').run('legacy','Legacy','legacy@example.test','unchanged-hash','unchanged-salt','admin','date');
  const oldLedger=db.prepare('SELECT * FROM schema_migrations').all();db.close();
  const work=path.join(directory,'rehearsal');
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../ops/verify-migration.mjs',import.meta.url)),source,work],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const report=JSON.parse(await readFile(path.join(work,'verification.json'),'utf8'));
  assert.equal(report.ok,true);assert.equal(report.ledgerPrefixPreserved,true);assert.equal(report.previousSchemaVersion,1);assert.equal(report.newSchemaVersion,SCHEMA_VERSION);assert.equal(report.restored,true);
  const original=new DatabaseSync(source,{readOnly:true});try{assert.deepEqual(original.prepare('SELECT * FROM schema_migrations').all(),oldLedger);assert.equal(original.prepare('PRAGMA table_info(users)').all().some(row=>row.name==='banned'),false);}finally{original.close();}
  const restored=new DatabaseSync(path.join(work,'restored.sqlite'),{readOnly:true});try{assert.equal(restored.prepare('SELECT password FROM users').get().password,'unchanged-hash');assert.equal(restored.prepare('SELECT count(*) n FROM schema_migrations').get().n,SCHEMA_VERSION);}finally{restored.close();}
 }finally{await rm(directory,{recursive:true,force:true});}
});
