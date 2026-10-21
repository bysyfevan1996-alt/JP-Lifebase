import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {dataset} from '../denki/data.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'denki/evidence',dataset.version);
await mkdir(directory,{recursive:true});
const records=[];
for(const source of dataset.sources.filter(s=>s.url.endsWith('.pdf'))){
 if(!/^[a-z0-9-]+$/.test(source.id))throw new Error('Invalid source ID');
 const file=path.join(directory,source.id+'.pdf');let bytes;
 try{bytes=await readFile(file);}catch(e){
  if(e.code!=='ENOENT')throw e;
  const response=await fetch(source.url,{signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error(`Source ${source.id}: HTTP ${response.status}`);
  bytes=Buffer.from(await response.arrayBuffer());
 }
 if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error(`Source ${source.id}: not a PDF`);
 const sha256=createHash('sha256').update(bytes).digest('hex');
 if(source.sha256&&source.sha256.toLowerCase()!==sha256)throw new Error(`Source ${source.id}: changed since verification`);
 await writeFile(file,bytes,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 records.push({id:source.id,url:source.url,filename:source.id+'.pdf',sha256,bytes:bytes.length,retrievedAt:new Date().toISOString()});
}
await writeFile(path.join(directory,'index.json'),JSON.stringify({version:dataset.version,records},null,2)+'\n');
console.log(`Archived ${records.length} official PDFs for ${dataset.version}.`);
