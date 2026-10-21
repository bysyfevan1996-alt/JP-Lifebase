import {mkdir,copyFile,writeFile,readFile,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {sourceInventory,inventoryHash} from '../release.mjs';
import {SCHEMA_VERSION} from '../schema.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const releaseId=process.argv[2]||new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z-m0';
if(!/^\d{8}T\d{6}Z(?:-[a-z0-9-]+)?$/.test(releaseId))throw new Error('Invalid release id');
const target=path.join(root,'artifacts','releases',releaseId);
try{await lstat(target);throw new Error('Release id already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
const files=await sourceInventory(root),pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
await mkdir(target,{recursive:true});
for(const file of files){await mkdir(path.dirname(path.join(target,file.path)),{recursive:true});await copyFile(path.join(root,file.path),path.join(target,file.path));}
const manifest={format:1,releaseId,version:pkg.version,schemaVersion:SCHEMA_VERSION,sourceSha256:inventoryHash(files),files};
await writeFile(path.join(target,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({directory:target,releaseId,sourceSha256:manifest.sourceSha256,files:files.length}));
