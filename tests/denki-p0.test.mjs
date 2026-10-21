import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
// Keep P0's fixed historical model under test as the current catalog grows.
import {dataset} from '../denki/data-v3.mjs';
import {dataset as legacy} from '../denki/legacy-data.mjs';
import {normalizeDataset,selectRule,validateDataset} from '../denki/model.mjs';
import {compare,catalog,calculateTariff} from '../denki/engine.mjs';
import {installDataset,readDataset} from '../denki/store.mjs';

const read=name=>readFile(new URL('./fixtures/denki/'+name,import.meta.url),'utf8').then(JSON.parse);
const manifest=await read('manifest.json'),baseline=await read('arithmetic-baseline.json'),behavior=await read('comparison-baseline.json');
const oldSnapshots=await Promise.all(manifest.records.map(record=>read(record.version+'.json')));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const input={area:'tokyo',billingMonth:'2026-10',amps:30,kwh:260,currentPlanId:'tepco-b',fullCycle:true};

function arithmetic(raw){
 const view=normalizeDataset(raw),rows=[];
 for(const tariff of view.tariffs){
  const offer=view.offers.find(p=>p.id===tariff.offerId),rule=view.rules.find(r=>r.id===tariff.ruleId);
  const flat={...rule,id:tariff.id,fuelGrossYen:tariff.fuelGrossYen,subsidyYen:tariff.subsidyYen,renewableYen:tariff.renewableYen,applicability:tariff.applicability,sourceIds:[...new Set([...rule.sourceIds,...tariff.sourceIds])]};
  const plan={id:offer.id,provider:view.providers.find(p=>p.id===offer.providerId).name,name:offer.name};
  for(const amps of baseline.amps)for(const kwh of baseline.kwhValues){
   const p=calculateTariff(flat,plan,{amps,kwh},view.sources);
   rows.push({id:tariff.id,amps,kwh,totalYen:p.totalYen,breakdown:p.breakdown,fuel:p.fuel,rounding:p.rounding,roundingAdjustmentYen:p.roundingAdjustmentYen});
  }
 }
 return rows;
}

test('2,926 pre-refactor arithmetic cases and all reorganized V3 prices retain their fixed baselines',()=>{
 for(const raw of oldSnapshots){
  const check=baseline.checks.find(c=>c.version===raw.version),rows=arithmetic(raw);
  assert.equal(rows.length,check.count);assert.equal(digest(rows),check.sha256);
 }
 assert.equal(digest(arithmetic(dataset)),baseline.checks.find(c=>c.version===legacy.version).sha256);
 assert.equal(digest(legacy),manifest.records.find(c=>c.version===legacy.version).sha256);
});

test('real archived snapshots preserve ranking, deltas, reconciliation, exclusions and exact source order',()=>{
 for(const row of behavior){
  const raw=oldSnapshots.find(d=>d.version===row.version),result=compare(row.input,raw);
  const actual={baselineId:result.baselineId,results:result.results.map(p=>({planId:p.planId,provider:p.provider,name:p.name,totalYen:p.totalYen,deltaYen:p.deltaYen,tariffVersion:p.tariffVersion,sourceIds:p.sources.map(s=>s.id)})),excluded:result.excluded,reconciliation:result.reconciliation};
  assert.deepEqual(actual,row.expected);
  if(row.version===legacy.version){
   const current=compare(row.input,dataset);
   assert.deepEqual(current.results.map(p=>[p.planId,p.totalYen,p.deltaYen]),result.results.map(p=>[p.planId,p.totalYen,p.deltaYen]));
   assert.deepEqual(current.reconciliation,result.reconciliation);assert.deepEqual(current.excluded,result.excluded);
  }
 }
});

test('new schema selects source revisions by effective interval and cannot verify a future month implicitly',()=>{
 validateDataset(dataset);
 assert.equal(dataset.rules.length,12);assert.equal(dataset.tariffs.length,31);
 const gas=month=>selectRule(dataset.rules,{offerId:'tokyo-gas-basic',areaId:'tokyo',month});
 assert(gas('2026-09').sourceIds.includes('gas-terms-202506'));
 assert(gas('2026-10').sourceIds.includes('gas-terms-202610'));
 assert.equal(selectRule(dataset.rules,{offerId:'tokyo-gas-basic',areaId:'tokyo',month:'2026-11',requireVerified:false}).id,'tokyo-gas-basic-202610');
 assert.throws(()=>gas('2026-11'),{code:'rule_unverified'});
 assert.throws(()=>selectRule(dataset.rules,{offerId:'tepco-b',areaId:'tokyo',month:'2026-11'}),{code:'rule_unavailable'});
 const raw=structuredClone(dataset),monthly=structuredClone(raw.tariffs.find(t=>t.offerId==='tokyo-gas-basic'&&t.month==='2026-10'));
 monthly.id='test-only-november';monthly.month='2026-11';monthly.applicability.month='2026-11';raw.tariffs.push(monthly);
 assert.throws(()=>validateDataset(raw),{code:'rule_unverified'});
 const oldAmount=compare(input,dataset).results.find(p=>p.planId==='tepco-b').totalYen;
 const corrupt=structuredClone(dataset),tepcoMonth=corrupt.tariffs.find(t=>t.offerId==='tepco-b'&&t.month==='2026-10');
 tepcoMonth.baseYenByAmps=Object.fromEntries(baseline.amps.map(a=>[a,'0.00']));
 assert.equal(compare(input,corrupt).results.find(p=>p.planId==='tepco-b').totalYen,oldAmount,'Monthly metadata must not override validated rule prices');
});

test('unsupported candidate capacity is excluded individually while an invalid baseline is rejected',()=>{
 const raw=structuredClone(dataset);
 raw.offers.find(o=>o.id==='eneos-v').capacity.values=[20,30,40,50,60];
 validateDataset(raw);
 const result=compare({...input,amps:10},raw);
 assert.equal(result.results.length,3);
 assert.equal(result.excluded.find(p=>p.planId==='eneos-v').reasonCode,'capacity_not_supported');
 assert.throws(()=>compare({...input,amps:10,currentPlanId:'eneos-v'},raw),{code:'current_plan_unavailable'});
 const cat=catalog(raw,'2026-10-21T00:00:00Z');
 assert(!cat.months[0].capacityAmpsByPlan['eneos-v'].includes(10));
 assert.equal(compare({...input,amps:undefined,capacity:{type:'amp',value:30}},raw).results.length,4);
 assert.throws(()=>compare({...input,capacity:{type:'amp',value:10}},raw),{code:'invalid_amps'});
 assert.throws(()=>compare({...input,capacity:{type:'kva',value:30}},raw),{code:'invalid_amps'});
});

test('same-name offers in another area never leak into catalog, baseline or prices',()=>{
 const raw=structuredClone(dataset),offer=structuredClone(raw.offers.find(o=>o.id==='tepco-b'));
 raw.areas.push({id:'test-area',name:'Test area',status:'available'});
 offer.id='tepco-b-test-area';offer.areaId='test-area';raw.offers.push(offer);
 const rule=structuredClone(raw.rules.find(r=>r.id==='tepco-b-202604'));
 rule.id='test-area-rule';rule.offerId=offer.id;rule.areaId=offer.areaId;rule.baseYenByAmps['30']='1.00';raw.rules.push(rule);
 const tariff=structuredClone(raw.tariffs.find(t=>t.offerId==='tepco-b'&&t.month==='2026-10'));
 tariff.id='test-area-october';tariff.offerId=offer.id;tariff.areaId=offer.areaId;tariff.ruleId=rule.id;raw.tariffs.push(tariff);
 validateDataset(raw);
 assert.equal(compare(input,raw).results.length,4);
 assert(!catalog(raw,'2026-10-21T00:00:00Z','tokyo').plans.some(p=>p.id===offer.id));
 assert.deepEqual(catalog(raw,'2026-10-21T00:00:00Z','test-area').plans.map(p=>p.id),[offer.id]);
 assert.throws(()=>compare({...input,currentPlanId:offer.id},raw),{code:'current_plan_unavailable'});
 assert.equal(compare({...input,area:'test-area',currentPlanId:offer.id},raw).results.length,1);
 assert.equal(dataset.rules.find(r=>r.id==='tepco-b-202604').baseYenByAmps['30'],'935.25');
});

test('unverified model and duplicate candidate rules cannot silently use the amp formula',()=>{
 for(const change of [r=>{r.calculationModel='daily_unimplemented';},r=>{r.rounding='unimplemented';}]){
  const raw=structuredClone(dataset),rule=raw.rules.find(r=>r.id==='eneos-v-202509');change(rule);
  const result=compare(input,raw);assert.equal(result.results.length,3);assert(result.excluded.some(p=>p.planId==='eneos-v'));
  assert.throws(()=>compare({...input,currentPlanId:'eneos-v'},raw),{code:'current_plan_unavailable'});
 }
 const raw=structuredClone(dataset),rule=raw.rules.find(r=>r.id==='eneos-v-202509');
 raw.rules.push({...structuredClone(rule),id:'conflicting'});
 assert.equal(compare(input,raw).excluded.find(p=>p.planId==='eneos-v').reasonCode,'ambiguous_rule');
 assert.throws(()=>validateDataset(raw),{code:'ambiguous_rule'});
});

test('installing V3 beside V1 and V2 never rewrites old SQLite payloads or their hashes',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const raw of oldSnapshots)installDataset(db,raw);
  const before=db.prepare('SELECT * FROM denki_datasets ORDER BY version').all();
  const installed=installDataset(db,dataset);assert.equal(installed.schemaVersion,2);
  assert.deepEqual(db.prepare('SELECT * FROM denki_datasets WHERE version<>? ORDER BY version').all(dataset.version),before);
  for(const raw of oldSnapshots){
   const snapshot=readDataset(db,raw.version),{sha256,...payload}=snapshot;
   assert.equal(digest(payload),sha256);assert.equal(JSON.stringify(payload),JSON.stringify(raw));
   assert.equal(compare({...input,billingMonth:'2026-01'},snapshot).results.find(p=>p.planId==='tepco-b').totalYen,8634);
  }
  assert.equal(catalog(oldSnapshots[0],'2026-10-21T00:00:00Z').months.length,0);
  assert.throws(()=>installDataset(db,{...dataset,checkedAt:'2099-01-01'}),/cannot be overwritten/);
 }finally{db.close();}
});
