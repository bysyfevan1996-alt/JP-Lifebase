// Run against an online backup, never migrate the supplied source database.
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {applySchema} from '../schema.mjs';

const [source,work]=process.argv.slice(2);
if(!source||!work)throw new Error('Usage: verify-migration.mjs <backup.sqlite> <new-private-directory>');
await mkdir(work,{mode:0o700});
const migrated=path.join(work,'migrated.sqlite'),restored=path.join(work,'restored.sqlite');
const quote=value=>'"'+value.replaceAll('"','""')+'"';
function fingerprint(db,selection){
 const tables=selection||db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>({name:row.name,columns:db.prepare('PRAGMA table_info('+quote(row.name)+')').all().map(column=>column.name)}));
 return tables.map(table=>{
  const rows=db.prepare('SELECT '+table.columns.map(quote).join(',')+' FROM '+quote(table.name));
  rows.setReadBigInts(true);
  const digests=[];
  for(const row of rows.iterate()){
   const values=table.columns.map(column=>{
    const value=row[column];
    return value instanceof Uint8Array?{blobBytes:value.byteLength,blobSha256:createHash('sha256').update(value).digest('hex')}:typeof value==='bigint'?{integer:value.toString()}:value;
   });
   digests.push(createHash('sha256').update(JSON.stringify(values)).digest('hex'));
  }
  digests.sort();
  return {...table,count:digests.length,sha256:createHash('sha256').update(digests.join('\n')).digest('hex')};
 });
}
const original=new DatabaseSync(path.resolve(source),{readOnly:true});let before,oldLedger,originalTableCount;
try{
 const originalTables=fingerprint(original);originalTableCount=originalTables.length;
 before=originalTables.filter(table=>table.name!=='schema_migrations');
 oldLedger=originalTables.some(table=>table.name==='schema_migrations')?original.prepare('SELECT * FROM schema_migrations ORDER BY version').all():[];
 await backup(original,migrated);
}finally{original.close();}
const db=new DatabaseSync(migrated);db.exec('PRAGMA foreign_keys=ON');
let first,second,after,completeAfter,newLedger;
try{
 first=applySchema(db);second=applySchema(db);after=fingerprint(db,before);
 if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Existing records changed during migration');
 newLedger=db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
 if(JSON.stringify(newLedger.slice(0,oldLedger.length))!==JSON.stringify(oldLedger))throw new Error('Existing migration ledger changed');
 if(second.applied.length)throw new Error('Migration is not repeatable');
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Migrated database integrity failed');
 completeAfter=fingerprint(db);await backup(db,restored);
}finally{db.close();}
const restoredDb=new DatabaseSync(restored,{readOnly:true});
try{if(JSON.stringify(fingerprint(restoredDb))!==JSON.stringify(completeAfter)||restoredDb.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||restoredDb.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Backup restoration failed');}finally{restoredDb.close();}
const result={ok:true,sourceWasReadOnly:true,first,second,existingTablesPreserved:originalTableCount,existingBusinessTablesPreserved:before.length,ledgerPrefixPreserved:true,previousSchemaVersion:oldLedger.at(-1)?.version??0,newSchemaVersion:newLedger.at(-1)?.version??0,tables:after,restored:true};
await writeFile(path.join(work,'verification.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({ok:true,first,second,existingTablesPreserved:originalTableCount,ledgerPrefixPreserved:true,restored:true}));
