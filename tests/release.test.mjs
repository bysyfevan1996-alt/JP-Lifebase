import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceInventory,inventoryHash,releaseInfo} from '../release.mjs';

test('release identity matches actual source and detects altered files without exposing config',async()=>{
 const temporary=fileURLToPath(new URL('../artifacts/test-tmp/',import.meta.url));await mkdir(temporary,{recursive:true});
 const directory=await mkdtemp(path.join(temporary,'release-'));
 try{
  for(const name of ['dist','denki','ops'])await mkdir(path.join(directory,name));
  await writeFile(path.join(directory,'package.json'),JSON.stringify({version:'0.1.1'}));
  await writeFile(path.join(directory,'server.mjs'),'// original');
  await writeFile(path.join(directory,'private.env'),'must-not-be-in-manifest');
  const files=await sourceInventory(directory);assert(!files.some(file=>file.path==='private.env'));
  const before=await releaseInfo(directory);assert.equal(before.releaseId,'development');assert.equal(before.version,'0.1.1');
  const manifest={releaseId:'20261021T080000Z-m0',version:'0.1.1',sourceSha256:inventoryHash(files),files};
  await writeFile(path.join(directory,'release-manifest.json'),JSON.stringify(manifest));
  assert.deepEqual(await releaseInfo(directory),{version:'0.1.1',releaseId:manifest.releaseId,sourceSha256:manifest.sourceSha256});
  await writeFile(path.join(directory,'server.mjs'),'// tampered');await assert.rejects(releaseInfo(directory),/manifest mismatch/);
  await writeFile(path.join(directory,'ops','private.env'),'not-permitted');await assert.rejects(sourceInventory(directory),/Private file/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
