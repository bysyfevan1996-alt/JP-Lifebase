import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {toSen,floorYen,tierAmounts} from '../denki/money.mjs';
import {compare,catalog,calculateTariff} from '../denki/engine.mjs';
import {installDataset,readDataset} from '../denki/store.mjs';
import {dataset} from '../denki/data.mjs';
import {dataset as legacyDataset} from '../denki/legacy-data.mjs';
const input={area:'tokyo',billingMonth:'2025-09',amps:30,kwh:260,currentPlanId:'tepco-b',fullCycle:true};

test('money and tier boundaries use exact hundredths, rejecting malformed values',()=>{
 for(const value of [29.8,'29.80',29.80])assert.equal(toSen(value),2980);
 assert.equal(toSen('-7.50'),-750);assert.equal(floorYen(93525),935);assert.equal(floorYen(-1),-1);
 for(const value of [null,undefined,NaN,Infinity,'1e2','',1.001,'1.001','0x10',Number.MAX_SAFE_INTEGER])assert.throws(()=>toSen(value));
 const tiers=[{upTo:120,rate:'29.80'},{upTo:300,rate:'36.40'},{upTo:null,rate:'40.49'}];
 const row=kwh=>tierAmounts(kwh,tiers);
 assert.deepEqual(row(0),[]);assert.equal(row(120).length,1);assert.equal(row(121)[1].kwh,1);assert.equal(row(300).length,2);assert.equal(row(301)[2].kwh,1);
 assert.equal(row(400).reduce((sum,r)=>sum+r.amountSen,0),1417700);
 for(const kwh of [-1,1.5,10001,NaN])assert.throws(()=>row(kwh));
 assert.throws(()=>tierAmounts(1,[{upTo:120,rate:1},{upTo:100,rate:2},{upTo:null,rate:3}]));
 assert.throws(()=>tierAmounts(1,[{upTo:120,rate:1},{upTo:300,rate:-2},{upTo:null,rate:3}]));
});
test('official TEPCO September 2025 published model: 30A / 260kWh = 8067 yen',()=>{
 // TEPCO 2025-07-30 release, p1 & p2. Levy is floor(260*3.98)=1034.
 const result=compare(input,dataset),tepco=result.results.find(r=>r.planId==='tepco-b');
 assert.equal(tepco.totalYen,8067);
 assert.equal(tepco.breakdown.find(r=>r.key==='subsidy').amountYen,-624);
 assert.equal(tepco.breakdown.find(r=>r.key==='fuel').amountYen,-1950);
 assert.equal(tepco.breakdown.find(r=>r.key==='renewable').amountYen,1034);
 assert.equal(tepco.fuel.netRate,-9.9);
 assert(tepco.sources.every(s=>s.url.startsWith('https://')));
 assert.equal(result.reconciliation,null);
});
test('comparison baseline, reconciliation and sorted ranking remain distinct',()=>{
 const r=compare({...input,billingMonth:'2026-01',amps:60,kwh:400,currentPlanId:'mitsu-b',actualBillYen:12000},dataset);
 const baseline=r.results.find(p=>p.planId==='mitsu-b');
 assert.equal(baseline.deltaYen,0);
 for(const p of r.results)assert.equal(p.deltaYen,p.totalYen-baseline.totalYen);
 assert.deepEqual(r.results.map(p=>p.totalYen),r.results.map(p=>p.totalYen).sort((a,b)=>a-b));
 assert.equal(r.reconciliation.differenceYen,12000-baseline.totalYen);
 assert(r.excluded.some(p=>p.planId==='octopus-green'));
 assert(!r.results.some(p=>p.planId==='octopus-green'));
});
test('January official model and other providers have independent arithmetic checks',()=>{
 const jan=compare({...input,billingMonth:'2026-01'},dataset);
 assert.equal(jan.results.find(p=>p.planId==='tepco-b').totalYen,8634);
 assert.equal(jan.results.find(p=>p.planId==='mitsu-b').totalYen,8429);
 for(const [month,gas,eneos]of [['2025-09',13440,13041],['2026-01',14312,13913]]){
  const r=compare({...input,billingMonth:month,amps:60,kwh:400},dataset);
  assert.equal(r.results.find(p=>p.planId==='tokyo-gas-basic').totalYen,gas);
  assert.equal(r.results.find(p=>p.planId==='eneos-v').totalYen,eneos);
 }
 assert(!compare(input,dataset).results.some(p=>p.planId==='mitsu-b'));
});
test('September 2026 tariff separates support and truncates renewable levy before the final total',()=>{
 const r=compare({...input,billingMonth:'2026-09',amps:60,kwh:303,currentPlanId:'mitsu-b'},dataset);
 const p=r.results.find(p=>p.planId==='mitsu-b');
 assert.equal(p.totalYen,9715);
 assert.equal(p.fuel.grossRate,-6.46);assert.equal(p.fuel.subsidyRate,4.5);assert.equal(p.fuel.netRate,-10.96);
 assert.equal(p.breakdown.find(x=>x.key==='renewable').amountYen,1266);
 assert.equal(p.breakdown.find(x=>x.key==='fuel').amountYen,-1957.38);
 assert.equal(p.breakdown.find(x=>x.key==='subsidy').amountYen,-1363.5);
 assert(Math.abs(p.roundingAdjustmentYen+0.59)<1e-8);
 const tepco=compare({...input,billingMonth:'2026-09'},dataset).results.find(p=>p.planId==='tepco-b');
 assert.equal(tepco.totalYen,7843);
});
test('all six current months reproduce the TEPCO published 30A / 260kWh examples',()=>{
 for(const [month,expected]of [['2026-05',8777],['2026-06',8795],['2026-07',8823],['2026-08',8023],['2026-09',7843],['2026-10',8275]]){
  const r=compare({...input,billingMonth:month},dataset);
  assert.equal(r.results.length,6);
  assert.equal(r.results.find(p=>p.planId==='tepco-b').totalYen,expected);
 }
});
test('no interpolation to uncollected months; require usage, verified baseline and a full billing cycle',()=>{
 for(const [change,code]of [[{billingMonth:'2099-01'},'invalid_month'],[{area:'kansai'},'unsupported_area'],[{amps:25},'invalid_amps'],[{kwh:undefined},'invalid_kwh'],[{kwh:'260'},'invalid_kwh'],[{kwh:260.1},'invalid_kwh'],[{currentPlanId:'octopus-green'},'current_plan_unavailable'],[{fullCycle:false},'full_cycle_required'],[{actualBillYen:-1},'invalid_bill']])assert.throws(()=>compare({...input,...change},dataset),{code});
 for(const amps of [10,15,20,30,40,50,60]){
  for(const kwh of [1,119,120,121,299,300,301,10000]){
   const r=compare({...input,amps,kwh},dataset);assert(r.results.every(p=>Number.isSafeInteger(p.totalYen)&&p.totalYen>=0));
  }
 }
 assert.throws(()=>compare({...input,kwh:0},dataset),{code:'invalid_kwh'});
 const tariff=legacyDataset.tariffs.find(t=>t.planId==='tepco-b'&&t.month===input.billingMonth);
 const zero=calculateTariff(tariff,legacyDataset.plans.find(p=>p.id==='tepco-b'),{...input,kwh:0,amps:10},legacyDataset.sources);
 assert.equal(zero.totalYen,328);
});
test('tariff snapshots cannot be changed under an existing version, and reproduce a result',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const a=installDataset(db,dataset),same=installDataset(db,dataset);assert.equal(a.sha256,same.sha256);
  assert.throws(()=>installDataset(db,{...dataset,checkedAt:'2099-01-01'}));
  installDataset(db,{...dataset,version:'2026-10-20.review-v2'});
  assert(readDataset(db,'2026-10-20.review-v2'));
  const stored=readDataset(db,dataset.version);assert.deepEqual(compare(input,stored).results,compare(input,a).results);
  assert.equal(readDataset(db,'unknown'),null);
  const c=catalog(a);assert(c.months.length>=2);assert(c.months.every(m=>m.plans.length>=2));
  assert(c.plans.find(p=>p.id==='octopus-green').status==='available');
  assert(c.plans.find(p=>p.id==='octopus-green-202610').status==='pending');
 }finally{db.close();}
});
