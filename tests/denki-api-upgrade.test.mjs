import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {installDataset} from '../denki/store.mjs';
import {dataset} from '../denki/data.mjs';
import {testPort} from './test-port.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const tempRoot=path.join(root,'artifacts','test-tmp');
const readFixture=name=>readFile(new URL('./fixtures/denki/'+name,import.meta.url),'utf8').then(JSON.parse);
const manifest=await readFixture('manifest.json');
const archives=[...manifest.records,{version:'2026-10-21.tokyo-v3',sha256:'2cb7a7253a902732d2e37bec53e5b1927db36e59d182a345eace2fcd887c426a'},{version:'2026-10-21.tokyo-v4',sha256:'2adf677e5035791bc5640e2a1afaf1161cc40110d11ce6aca2becccf8cea8009'}];

async function launch(dataDir,clockFile){
 const env={...process.env,PORT:await testPort(),COOKIE_SECURE:'0',JPL_DATA_DIR:dataDir,JPL_SEED:'0',ADMIN_EMAIL:'owner@example.test',NODE_ENV:'test',JPL_TEST_MAIL_OUTBOX:'1'};
 for(const key of Object.keys(env))if(/^(TRANSLATION_|RESEND_|MAIL_|AUTH_TOKEN_SECRET$)/.test(key))delete env[key];
 const child=spawn(process.execPath,['--import',pathToFileURL(clockFile).href,path.join(root,'server.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',b=>errors+=b);
 const base=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill();reject(new Error('Startup timeout: '+errors));},10000);
  child.stdout.on('data',b=>{const match=String(b).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
  child.once('error',e=>{clearTimeout(timer);reject(e);});
  child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code+': '+errors));});
 });
 return {
  stop:()=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>{child.once('exit',resolve);child.kill();}),
  request:async(route,input)=>{
   const response=await fetch(base+route,input===undefined?{}:{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(input)});
   return {status:response.status,body:await response.json()};
  }
 };
}

test('HTTP upgrade and restart preserve V1/V2/V3 snapshots while the expanded catalog enforces area and the public month window',async()=>{
 await mkdir(tempRoot,{recursive:true});
 const data=await mkdtemp(path.join(tempRoot,'denki-upgrade-')),clockFile=path.join(data,'clock.mjs'),database=path.join(data,'community.sqlite');
 // Test-process clock only: production has no clock override or test date setting.
 await writeFile(clockFile,"const RealDate=Date;const fixed=RealDate.parse('2026-10-21T00:00:00Z');globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};");
 const db=new DatabaseSync(database);
 let oldRows;
 try{
  for(const record of archives)installDataset(db,await readFixture(record.version+'.json'));
  oldRows=db.prepare('SELECT * FROM denki_datasets ORDER BY version').all();
 }finally{db.close();}
 let app;
 try{
  const input={area:'tokyo',billingMonth:'2026-10',amps:30,capacity:{type:'amp',value:30},kwh:260,currentPlanId:'tepco-b',fullCycle:true};
  let currentHash;
  for(let boot=0;boot<2;boot++){
   app=await launch(data,clockFile);
   const catalog=await app.request('/api/denki/catalog?area=tokyo');
   assert.equal(catalog.status,200);assert.equal(catalog.body.schemaVersion,2);assert.equal(catalog.body.version,dataset.version);
   assert.equal(catalog.body.area,'tokyo');assert.equal(catalog.body.months.length,6);
   assert.deepEqual(catalog.body.months[0].capacityAmpsByPlan['tepco-b'],[10,15,20,30,40,50,60]);
   if(boot)assert.equal(catalog.body.sha256,currentHash);else currentHash=catalog.body.sha256;
   assert.equal((await app.request('/api/denki/catalog')).body.sha256,currentHash);
   const unavailable=await app.request('/api/denki/catalog?area=unsupported');
   assert.equal(unavailable.status,400);assert.equal(unavailable.body.code,'unsupported_area');
   for(const record of archives){
    const snapshot=await app.request('/api/denki/dataset?version='+record.version);
    assert.equal(snapshot.status,200);
    const {sha256,...raw}=snapshot.body;
    assert.equal(sha256,record.sha256);assert.deepEqual(raw,await readFixture(record.version+'.json'));
   }
   for(const version of [undefined,manifest.records[1].version,archives[2].version,archives[3].version]){
    const result=await app.request('/api/denki/compare',{...input,...(version?{version}:{})});
    assert.equal(result.status,200);assert.equal(result.body.results.length,version&&version!==archives[3].version?4:6);
    assert.equal(result.body.results.find(p=>p.planId==='tepco-b').totalYen,8275);
   }
   assert(catalog.body.months.every(m=>m.plans.length===8));
   const octopus=await app.request('/api/denki/compare',{...input,currentPlanId:'octopus-green',days:31});
   assert.equal(octopus.status,200);assert.equal(octopus.body.results.length,8);
   assert.equal(octopus.body.results.find(p=>p.planId==='octopus-green').totalYen,8484);
   assert.equal(octopus.body.input.days,31);
   const noDays=await app.request('/api/denki/compare',{...input,currentPlanId:'octopus-green'});
   assert.equal(noDays.status,400);assert.equal(noDays.body.code,'days_required');
   for(const [currentPlanId,total] of [['idemitsu-s-tokyo',8045],['cd-basic-b',8069]]){
    const added=await app.request('/api/denki/compare',{...input,currentPlanId});
    assert.equal(added.status,200);assert.equal(added.body.results.find(p=>p.planId===currentPlanId).totalYen,total);
    assert.equal(added.body.results.find(p=>p.planId===currentPlanId).deltaYen,0);
    const old=await app.request('/api/denki/compare',{...input,currentPlanId,version:archives[2].version});
    assert.equal(old.status,400);assert.equal(old.body.code,'current_plan_unavailable');
   }
   for(const version of [...archives.map(record=>record.version),'unknown']){
    for(const billingMonth of ['2026-01','2099-01']){
     const outside=await app.request('/api/denki/compare',{...input,version,billingMonth});
     assert.equal(outside.status,400);assert.equal(outside.body.code,'month_outside_window');
    }
   }
   await app.stop();app=null;
   const stored=new DatabaseSync(database,{readOnly:true});
   try{
    assert.deepEqual(stored.prepare('SELECT * FROM denki_datasets WHERE version<>? ORDER BY version').all(dataset.version),oldRows);
    assert.equal(stored.prepare('SELECT COUNT(*) AS n FROM denki_datasets').get().n,5);
   }finally{stored.close();}
  }
 }finally{
  await app?.stop();
  assert(path.resolve(data).startsWith(path.resolve(tempRoot)+path.sep+'denki-upgrade-'));
  await rm(data,{recursive:true,force:true});
 }
});
