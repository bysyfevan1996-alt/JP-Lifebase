import {readFile,readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function sourceInventory(root){
 const files=[];
 async function walk(relative){
  const filename=path.join(root,relative),info=await lstat(filename);
  if(info.isSymbolicLink())throw new Error('Release symlinks are not permitted');
  if(info.isDirectory()){
   for(const entry of (await readdir(filename)).sort())if(entry!=='__pycache__')await walk(relative+'/'+entry);
  }else if(info.isFile()){
   if(/(?:^|\/)(?:data|artifacts|node_modules|\.git)(?:\/|$)|\.(?:sqlite[^/]*|env|key)$/.test(relative))throw new Error('Private file in release');
   files.push({path:relative,sha256:hash(await readFile(filename))});
  }else throw new Error('Unsupported release file');
 }
 for(const entry of (await readdir(root)).sort())if(entry.endsWith('.mjs')||['package.json','README.md'].includes(entry))await walk(entry);
 for(const directory of ['dist','denki','ops'])await walk(directory);
 return files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
export const inventoryHash=files=>hash(JSON.stringify(files));
export async function releaseInfo(root){
 const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 let manifest;
 try{manifest=JSON.parse(await readFile(path.join(root,'release-manifest.json'),'utf8'));}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const files=await sourceInventory(root),sourceSha256=inventoryHash(files);
 if(manifest){
  if(!/^[0-9]{8}T[0-9]{6}Z(?:-[a-z0-9-]+)?$/.test(manifest.releaseId)||manifest.sourceSha256!==sourceSha256||JSON.stringify(manifest.files)!==JSON.stringify(files)||manifest.version!==pkg.version)throw new Error('Release manifest mismatch');
  return {version:pkg.version,releaseId:manifest.releaseId,sourceSha256};
 }
 if(process.env.NODE_ENV==='production')throw new Error('Production requires a release manifest');
 return {version:pkg.version,releaseId:'development',sourceSha256};
}
