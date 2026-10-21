import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dataset} from '../denki/data-v4.mjs';
import {dataset as prior} from '../denki/data-v3.mjs';
import {catalog,compare,calculateTariff} from '../denki/engine.mjs';
import {validateDataset,normalizeDataset,resolveTariff,selectRule} from '../denki/model.mjs';

const read=name=>readFile(new URL('./fixtures/denki/'+name,import.meta.url),'utf8').then(JSON.parse);
const examples=await read('tokyo-expansion-examples.json');
const oldIds=new Set(prior.offers.map(o=>o.id));
const added=[['idemitsu-s-tokyo','idemitsu'],['cd-basic-b','cd']];
const input={area:'tokyo',billingMonth:'2026-10',amps:30,kwh:260,currentPlanId:'tepco-b',fullCycle:true};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('both new Tokyo offers expose seven verified capacities for each of six months',()=>{
 validateDataset(dataset);
 assert.equal(dataset.version,'2026-10-21.tokyo-v4');assert.equal(dataset.previousVersion,prior.version);
 const directory=catalog(dataset,'2026-10-21T00:00:00Z','tokyo');
 assert.equal(directory.months.length,6);
 for(const month of directory.months){
  assert.equal(month.plans.length,6);
  for(const [id] of added)assert.deepEqual(month.capacityAmpsByPlan[id],[10,15,20,30,40,50,60]);
 }
 for(const [offerId,prefix] of added){
  const records=dataset.tariffs.filter(t=>t.offerId===offerId);
  assert.equal(records.length,6);
  for(const row of records){
   assert(row.sourceIds.includes(`${prefix}-fuel-${row.month.replace('-','')}`));
   assert(!row.sourceIds.some(id=>id.startsWith(prefix==='cd'?'idemitsu-fuel':'cd-fuel')));
   assert(row.sourceIds.includes('renewable-2026'));
  }
 }
 assert(directory.plans.find(p=>p.id==='octopus-green').status==='pending');
});

test('independent monthly and tier-boundary samples match without double-counting support or importing TEPCO minimums',()=>{
 for(const sample of [...examples.monthly,...examples.boundaries]){
  const result=compare({...input,billingMonth:sample.month,amps:sample.amps,kwh:sample.kwh},dataset);
  for(const [id,key] of added){
   const plan=result.results.find(p=>p.planId===id);
   assert.equal(plan.totalYen,sample[key],`${id} ${sample.month} ${sample.amps}A ${sample.kwh}kWh`);
   assert(!plan.breakdown.some(line=>line.key==='minimum'));
   assert.equal(plan.breakdown.find(line=>line.key==='discount').amountYen,0);
  }
 }
 const september=compare({...input,billingMonth:'2026-09'},dataset);
 for(const [id] of added){
  const plan=september.results.find(p=>p.planId===id);
  assert.deepEqual(plan.fuel,{grossRate:-6.46,subsidyRate:4.5,netRate:-10.96});
  assert.equal(plan.breakdown.find(line=>line.key==='subsidy').amountYen,-1170);
 }
});

test('CD official illustrative formula reproduces 9967 yen without treating the example as an actual tariff month',()=>{
 const view=normalizeDataset(dataset),offer=view.offers.find(o=>o.id==='cd-basic-b');
 const {tariff,rule}=resolveTariff(view,offer,'2026-10'),sample=examples.cdOfficialIllustration;
 const illustrative={...rule,...tariff,id:'cd-official-illustration-only',fuelGrossYen:sample.netFuelYen,subsidyYen:'0.00',renewableYen:sample.renewableYen,sourceIds:[sample.sourceId]};
 const plan={id:offer.id,name:offer.name,provider:view.providers.find(p=>p.id===offer.providerId).name};
 assert.equal(calculateTariff(illustrative,plan,sample,view.sources).totalYen,sample.totalYen);
 assert.equal(dataset.tariffs.find(t=>t.id===tariff.id).fuelGrossYen,'-5.80');
 assert.equal(dataset.tariffs.some(t=>t.id==='cd-official-illustration-only'),false);
});

test('new plans can be comparison baselines while unsupported inputs and missing months fail explicitly',()=>{
 for(const [id] of added){
  for(const amps of [10,15,20,30,40,50,60]){
   const result=compare({...input,currentPlanId:id,amps},dataset);
   assert.equal(result.baselineId,id);assert.equal(result.results.find(p=>p.planId===id).deltaYen,0);
  }
  for(const change of [{amps:5},{capacity:{type:'kva',value:6}},{kwh:0}])assert.throws(()=>compare({...input,currentPlanId:id,...change},dataset));
  assert.throws(()=>compare({...input,currentPlanId:id,billingMonth:'2026-01'},dataset),{code:'current_plan_unavailable'});
  assert.throws(()=>selectRule(dataset.rules,{offerId:id,areaId:'tokyo',month:'2026-11'}),{code:'rule_unavailable'});
 }
 const missing=structuredClone(dataset);
 missing.tariffs=missing.tariffs.filter(t=>!(t.offerId==='cd-basic-b'&&t.month==='2026-09'));
 const result=compare({...input,billingMonth:'2026-09'},missing);
 assert.equal(result.results.length,5);assert.equal(result.excluded.find(p=>p.planId==='cd-basic-b').reasonCode,'missing_month');
 assert.throws(()=>compare({...input,currentPlanId:'cd-basic-b',billingMonth:'2026-09'},missing),{code:'current_plan_unavailable'});
 assert.equal(compare(input,missing).results.length,6);
 assert(!catalog(dataset,'2026-11-01T00:00:00Z').months.some(m=>m.id==='2026-11'));
 const badSource=structuredClone(dataset);
 badSource.sources=badSource.sources.filter(s=>s.id!=='cd-fuel-202610');
 assert.throws(()=>validateDataset(badSource),{code:'missing_source'});
 assert.equal(compare(input,badSource).excluded.find(p=>p.planId==='cd-basic-b').reasonCode,'missing_source');
});

test('the frozen V3 payload and every original provider, rule, tariff and source remain exact',async()=>{
 const raw=await read('2026-10-21.tokyo-v3.json');
 assert.equal(digest(raw),'2cb7a7253a902732d2e37bec53e5b1927db36e59d182a345eace2fcd887c426a');
 assert.deepEqual(prior,raw);
 for(const key of ['providers','offers','rules','tariffs','sources'])assert.deepEqual(dataset[key].slice(0,prior[key].length),prior[key]);
 assert.deepEqual(dataset.areas,prior.areas);assert.deepEqual(dataset.exclusions,prior.exclusions);
 const cases=await read('comparison-baseline.json');
 for(const {input:sample} of cases){
  const before=compare(sample,prior),after=compare(sample,dataset);
  assert.deepEqual(after.results.filter(p=>oldIds.has(p.planId)),before.results);
  assert.deepEqual(after.excluded.filter(p=>oldIds.has(p.planId)),before.excluded);
  assert.deepEqual(after.reconciliation,before.reconciliation);
 }
});

test('all twenty new official source archives match their fixed content hashes, including the queried PDF',async()=>{
 const base=new URL('../denki/evidence/2026-10-21.tokyo-v4/',import.meta.url);
 const index=JSON.parse(await readFile(new URL('index.json',base),'utf8'));
 assert.equal(index.records.length,20);
 assert.equal(index.records.filter(r=>r.filename.endsWith('.pdf')).length,18);
 const ids=new Set(prior.sources.map(s=>s.id)),sources=dataset.sources.filter(s=>!ids.has(s.id));
 assert.equal(sources.length,index.records.length);
 for(const record of index.records){
  const bytes=await readFile(new URL(record.filename,base));
  const sha=createHash('sha256').update(bytes).digest('hex'),source=sources.find(s=>s.id===record.id);
  assert.equal(bytes.length,record.bytes);assert.equal(sha,record.sha256);assert.equal(source.sha256,sha);
  assert.equal(source.url,record.url);assert.equal(source.checkedAt,'2026-10-21');
  if(record.filename.endsWith('.pdf'))assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 }
 assert(index.records.find(r=>r.id==='cd-fuel-202609').url.includes('?2026-09-01='));
});
