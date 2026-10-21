export function schemaVersion(db){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get())return 0;
 return Number(db.prepare('SELECT coalesce(max(version),0) AS version FROM schema_migrations').get().version);
}

export function runMigrations(db,migrations){
 if(!Array.isArray(migrations))throw new Error('Migrations must be an array');
 for(const [index,migration]of migrations.entries()){
  if(!migration||migration.version!==index+1||typeof migration.name!=='string'||!migration.name.trim()||
   typeof migration.checksum!=='string'||!/^[a-f0-9]{64}$/.test(migration.checksum)||typeof migration.up!=='function'||migration.up.constructor.name==='AsyncFunction')throw new Error('Invalid migration definition');
 }
 if(db.prepare('PRAGMA foreign_keys').get().foreign_keys!==1)throw new Error('Migration requires foreign keys enabled');
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)');
  const previous=db.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all();
  if(previous.length>migrations.length)throw new Error('Database has a newer schema');
  for(const [index,row]of previous.entries()){
   const definition=migrations[index];
   if(row.version!==index+1||row.version!==definition.version||row.name!==definition.name||row.checksum!==definition.checksum)throw new Error('Migration ledger mismatch');
  }
  const applied=[];
  for(const definition of migrations.slice(previous.length)){
   const result=definition.up(db);
   if(result&&typeof result.then==='function')throw new Error('Async migrations are not permitted');
   db.prepare('INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES(?,?,?,?)').run(definition.version,definition.name,definition.checksum,new Date().toISOString());
   applied.push(definition.version);
  }
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Migration foreign key check failed');
  db.exec('COMMIT');return {version:migrations.length,applied};
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
