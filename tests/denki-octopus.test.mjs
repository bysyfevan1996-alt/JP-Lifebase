import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dataset} from '../denki/data.mjs';
import {dataset as v4} from '../denki/data-v4.mjs';
import {catalog,compare,calculateTariff,validateInput} from '../denki/engine.mjs';
import {validateDataset} from '../denki/model.mjs';

const input={area:'tokyo',billingMonth:'2026-10',amps:30,kwh:260,currentPlanId:'tepco-b',fullCycle:true};
const ids=['octopus-green','octopus-green-202604'];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const row=(result,id='octopus-green')=>result.results.find(p=>p.planId===id);
const flat=()=>{const t=dataset.tariffs.find(t=>t.offerId===ids[0]&&t.month==='2026-10');return {...dataset.rules.find(r=>r.id===t.ruleId),...t,sourceIds:t.sourceIds};};

test('Octopus has two explicit vintages and six individually verified months, without substituting October launch prices',()=>{
 validateDataset(dataset);
 const c=catalog(dataset,'2026-10-21T00:00:00Z');
 assert.equal(c.months.length,6);
 for(const month of c.months){
  assert.equal(month.plans.length,8);
  for(const id of ids)assert.deepEqual(month.capacityAmpsByPlan[id],[10,15,20,30,40,50,60]);
  assert(!month.plans.includes('octopus-green-202610'));
 }
 assert.equal(c.plans.find(p=>p.id==='octopus-green-202610').status,'pending');
 assert(!dataset.tariffs.some(t=>t.offerId==='octopus-green-202610'));
 assert(!catalog(dataset,'2026-11-01T00:00:00Z').months.some(m=>m.id==='2026-11'));
});

test('independent 30A / 260kWh / 30-day arithmetic for each month and vintage',()=>{
 // From archived official prices, independently added in research-octopus-202610.md.
 const samples=[['2026-05',8328,8414],['2026-06',8346,8433],['2026-07',8437,8524],['2026-08',7823,7910],['2026-09',7943,8030],['2026-10',8455,8542]];
 for(const [month,oldTotal,newTotal] of samples){
  const result=compare({...input,billingMonth:month,days:30},dataset);
  assert.equal(result.results.length,8);
  assert.equal(row(result).totalYen,oldTotal,month+' 2025-05');
  assert.equal(row(result,ids[1]).totalYen,newTotal,month+' 2026-04');
 }
 const oct=row(compare({...input,days:30},dataset));
 assert.deepEqual(oct.fuel,{grossRate:6.75,subsidyRate:3.5,netRate:3.25});
 assert.equal(oct.breakdown.find(r=>r.key==='base').amountYen,873);
 assert.equal(oct.breakdown.find(r=>r.key==='subsidy').amountYen,-910);
 assert.equal(oct.breakdown.find(r=>r.key==='renewable').amountYen,1086);
});

test('actual days affect daily base only; fractional sen and tier boundaries do not acquire a 30-day approximation',()=>{
 const result=compare({...input,days:31},dataset),oct=row(result);
 assert.equal(oct.totalYen,8484);
 const base=oct.breakdown.find(r=>r.key==='base');
 assert.equal(base.amountYen,902.1);assert.equal(base.rateYen,29.1);assert.equal(base.days,31);
 assert.equal(oct.breakdown.find(r=>r.key==='tier').kwh,120);
 const fifteen=row(compare({...input,days:31,amps:15,kwh:121},dataset));
 assert.equal(fifteen.totalYen,3651);assert.equal(fifteen.breakdown.find(r=>r.key==='base').amountYen,451.05);
 assert.equal(row(compare({...input,days:1,amps:15,kwh:1},dataset)).totalYen,40);
 assert.equal(row(compare({...input,days:30,kwh:300},dataset)).totalYen,9717);
 for(const plan of result.results){
  const sum=plan.breakdown.reduce((a,r)=>a+r.amountYen,0)+plan.roundingAdjustmentYen;
  assert(Math.abs(sum-plan.totalYen)<1e-8);
 }
});

test('empty days exclude only daily candidates; daily baselines require days and reject malformed values',()=>{
 const monthly=compare(input,dataset);
 assert.equal(monthly.results.length,6);assert(!Object.hasOwn(monthly.input,'days'));
 for(const id of ids)assert.equal(monthly.excluded.find(p=>p.planId===id).reasonCode,'days_required');
 for(const id of ids){
  assert.throws(()=>compare({...input,currentPlanId:id},dataset),{code:'days_required'});
  const result=compare({...input,currentPlanId:id,days:30},dataset);
  assert.equal(result.input.days,30);assert.equal(row(result,id).deltaYen,0);
 }
 for(const days of [null,'30','',0,-1,1.5,63,NaN,Infinity])assert.throws(()=>validateInput({...input,days},dataset),{code:'invalid_days'});
 assert.equal(validateInput({...input,days:62},dataset).days,62);
 assert.throws(()=>compare({...input,currentPlanId:ids[0],days:30,kwh:0},dataset),{code:'invalid_kwh'});
});

test('daily zero floor applies after including renewable levy, and separate renewable truncation is retained',()=>{
 const tariff={...flat(),baseDailyYenByAmps:{30:'0.00'},tiers:[{upTo:null,rate:'0.00'}],fuelGrossYen:'-1.01',subsidyYen:'0.00',renewableYen:'2.99'};
 const plan={id:ids[0],provider:'オクトパスエナジー',name:'test'};
 const positive=calculateTariff(tariff,plan,{amps:30,kwh:1,days:30},dataset.sources);
 // floor(-1.01) + floor(2.99) = 0, not a clamp of the non-levy subtotal.
 assert.equal(positive.totalYen,0);
 const negative=calculateTariff({...tariff,fuelGrossYen:'-10.00'},plan,{amps:30,kwh:1,days:30},dataset.sources);
 assert.equal(negative.totalYen,0);
 assert.equal(negative.breakdown.find(r=>r.detail==='zero_total_floor').amountYen,8);
 assert.throws(()=>calculateTariff(tariff,plan,{amps:30,kwh:1},dataset.sources),{code:'days_required'});
});

test('daily precision checks reject unsafe intermediate arithmetic and retain the zero-use flag for internal calls',()=>{
 const tariff=flat(),plan={id:ids[0]};
 for(const change of [
  {baseDailyYenByAmps:{30:'90071992547409.91'}},
  {fuelGrossYen:'90071992547409.91',subsidyYen:'90071992547409.91'},
  {renewableYen:'90071992547409.91'}
 ])assert.throws(()=>calculateTariff({...tariff,...change},plan,{amps:30,kwh:2,days:30},dataset.sources),RangeError);
 assert.equal(calculateTariff({...tariff,zeroUseHalfBase:false},plan,{amps:30,kwh:0,days:30},dataset.sources).totalYen,873);
 assert.equal(calculateTariff({...tariff,zeroUseHalfBase:true},plan,{amps:30,kwh:0,days:30},dataset.sources).totalYen,436);
 assert.equal(row(compare({...input,amps:15,kwh:121,days:29},dataset)).breakdown.find(r=>r.key==='base').amountYen,421.95);
});

test('daily rules cannot masquerade as monthly rules or be overridden in a monthly tariff',()=>{
 for(const mutate of [d=>d.rules.find(r=>r.offerId===ids[0]).baseDailyYenByAmps[30]='1.001',d=>d.tariffs.find(t=>t.offerId===ids[0]).baseDailyYenByAmps={30:'0.00'},d=>d.rules.find(r=>r.offerId===ids[0]).baseYenByAmps={30:'0.00'},d=>d.offers.find(o=>o.id===ids[0]).needsDays=false,d=>d.rules.find(r=>r.offerId===ids[0]).minimumYen='328.08']){
  const data=structuredClone(dataset);mutate(data);assert.throws(()=>validateDataset(data));
 }
 const missing=structuredClone(dataset);missing.tariffs=missing.tariffs.filter(t=>t.offerId!==ids[0]||t.month!=='2026-10');
 assert.equal(compare({...input,days:30},missing).excluded.find(p=>p.planId===ids[0]).reasonCode,'missing_month');
});

test('V4 exact snapshot and all existing calculated results remain unchanged when days are supplied',async()=>{
 const raw=JSON.parse(await readFile(new URL('./fixtures/denki/2026-10-21.tokyo-v4.json',import.meta.url),'utf8'));
 assert.equal(digest(raw),'2adf677e5035791bc5640e2a1afaf1161cc40110d11ce6aca2becccf8cea8009');assert.deepEqual(v4,raw);
 for(const month of ['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']){
  const before=compare({...input,billingMonth:month},v4),after=compare({...input,billingMonth:month,days:31},dataset);
  assert.deepEqual(after.results.filter(p=>!ids.includes(p.planId)),before.results);
 }
});

test('every newly referenced official source has a matching saved original and fixed SHA-256',async()=>{
 const base=new URL('../denki/evidence/2026-10-21.tokyo-v5/',import.meta.url);
 const index=JSON.parse(await readFile(new URL('index.json',base),'utf8'));
 assert.equal(index.entries.length,14);
 for(const entry of index.entries){
  const bytes=await readFile(new URL(entry.file,base));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  assert.equal(bytes.length,entry.bytes);
  const source=dataset.sources.find(s=>s.url===entry.url&&s.sha256===entry.sha256);
  // The December revision is archived for scope review only, never applied now.
  if(entry.file!=='_2026-12-1.pdf')assert(source,entry.file);
 }
});
