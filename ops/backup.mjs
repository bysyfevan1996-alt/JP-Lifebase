import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,readdir,chmod,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const destination=process.env.JPL_BACKUP_DIR||'/var/backups/jplifebase';
await mkdir(destination,{recursive:true,mode:0o700});
const file=path.join(destination,new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
const db=new DatabaseSync(process.env.JPL_DB||'/var/lib/jplifebase/community.sqlite',{readOnly:true});
try{await backup(db,file);}finally{db.close();}
await chmod(file,0o600);
const verify=new DatabaseSync(file,{readOnly:true});
let valid;
try{valid=Object.values(verify.prepare('PRAGMA quick_check').get())[0]==='ok'&&!verify.prepare('PRAGMA foreign_key_check').all().length;}finally{verify.close();}
if(!valid)throw new Error('Backup validation failed');
const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);
await writeFile(file+'.sha256',digest.digest('hex')+'  '+path.basename(file)+'\n',{mode:0o600});
const entries=(await readdir(destination)).filter(name=>/^\d{4}-\d\d-\d\dT[\dTZ-]+\.sqlite$/.test(name)).sort().reverse();
for(const old of entries.slice(14)){
 await unlink(path.join(destination,old));
 try{await unlink(path.join(destination,old+'.sha256'));}catch(error){if(error.code!=='ENOENT')throw error;}
}
console.log('Japan Life Base SQLite backup validated.');
