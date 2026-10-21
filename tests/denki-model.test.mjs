import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeDataset,selectRule,resolveTariff,validateDataset} from '../denki/model.mjs';

const fixtureUrl=name=>new URL(`./fixtures/denki/${name}`,import.meta.url);
const fixtures=await Promise.all(['v1','v2'].map(async suffix=>({suffix,raw:JSON.parse(await readFile(fixtureUrl(`2026-10-20.tokyo-${suffix}.json`),'utf8'))})));
const manifest=JSON.parse(await readFile(fixtureUrl('manifest.json'),'utf8'));
const code=(work,expected)=>assert.throws(work,{code:expected});

function single(){
 const view=normalizeDataset(fixtures[1].raw),offer=view.offers.find(p=>p.id==='tepco-b');
 const tariff=view.tariffs.find(t=>t.offerId===offer.id&&t.month==='2026-10');
 const rule=view.rules.find(r=>r.id===tariff.ruleId);
 view.offers=[offer];view.providers=view.providers.filter(p=>p.id===offer.providerId);
 view.rules=[rule];view.tariffs=[tariff];view.exclusions=[];
 return view;
}

test('real V1/V2 snapshots adapt without modifying saved bytes, metadata or sources',()=>{
 for(const {raw}of fixtures){
  const original=JSON.stringify(raw),record=manifest.records.find(x=>x.version===raw.version);
  const view=validateDataset(raw);
  assert.equal(createHash('sha256').update(JSON.stringify(raw)).digest('hex'),record.sha256);
  assert.equal(JSON.stringify(raw),original);
  assert.equal(view.schemaVersion,2);assert.equal(view.version,raw.version);
  assert.equal(Object.hasOwn(view,'sha256'),false);
  assert.equal(view.checkedAt,raw.checkedAt);
  assert.equal(view.tariffs.length,raw.tariffs.length);
  assert.equal(view.providers.length,5);assert.equal(view.offers.length,5);
  assert.equal(Object.hasOwn(view,'area'),false);assert.equal(Object.hasOwn(view,'plans'),false);
  assert.deepEqual(view.sources,raw.sources);
  for(let i=0;i<raw.tariffs.length;i++){
   const old=raw.tariffs[i],monthly=view.tariffs[i],rule=view.rules[i];
   assert.equal(monthly.id,old.id);assert.equal(monthly.offerId,old.planId);
   assert.deepEqual(monthly.sourceIds,old.sourceIds);assert.deepEqual(rule.sourceIds,[]);
   assert.deepEqual(rule.baseYenByAmps,old.baseYenByAmps);
   assert.deepEqual(rule.verifiedMonths,[old.month]);
   assert.equal(resolveTariff(view,view.offers.find(o=>o.id===old.planId),old.month).tariff.id,old.id);
  }
  view.rules[0].baseYenByAmps['10']='0.00';view.tariffs[0].sourceIds.push('test-only');view.sources[0].title='test-only';
  assert.equal(JSON.stringify(raw),original);
  // Two archived records that shared a source object must be independent rules.
  const samePlan=view.rules.find(r=>r.offerId===view.rules[0].offerId&&r.id!==view.rules[0].id);
  if(samePlan)assert.notEqual(samePlan.baseYenByAmps['10'],'0.00');
 }
});

test('schema 2 normalization is a clone and unknown schemas never downgrade to legacy',()=>{
 const raw=single(),copy=normalizeDataset(raw);
 copy.rules[0].tiers[0].rate='1.00';assert.notEqual(copy.rules[0].tiers[0].rate,raw.rules[0].tiers[0].rate);
 for(const raw of [null,[],{schemaVersion:0},{schemaVersion:3},{schemaVersion:'2'}])code(()=>normalizeDataset(raw),'unsupported_schema');
 const legacy={...fixtures[0].raw,schemaVersion:1,sha256:'existing-hash'};
 assert.equal(normalizeDataset(legacy).sha256,'existing-hash');
});

test('rule selection uses effective intervals before verification and keeps future months unverified',()=>{
 const template=single().rules[0];
 const old={...template,id:'gas-old',offerId:'gas',effectiveFromMonth:'2026-05',effectiveToMonth:'2026-09',verifiedMonths:['2026-09']};
 const current={...template,id:'gas-new',offerId:'gas',effectiveFromMonth:'2026-10',effectiveToMonth:null,verifiedMonths:['2026-10']};
 const rules=[old,current],select=month=>selectRule(rules,{offerId:'gas',areaId:'tokyo',month});
 assert.equal(select('2026-09').id,'gas-old');assert.equal(select('2026-10').id,'gas-new');
 code(()=>select('2026-11'),'rule_unverified');
 assert.equal(selectRule(rules,{offerId:'gas',areaId:'tokyo',month:'2026-11',requireVerified:false}).id,'gas-new');
 code(()=>select('2026-04'),'rule_unavailable');
 code(()=>selectRule([old,{...current,effectiveFromMonth:'2026-09'}],{offerId:'gas',areaId:'tokyo',month:'2026-09'}),'ambiguous_rule');
 for(const month of ['2026-00','2026-13','2026-1','2026-10-01',202610,null])code(()=>select(month),'invalid_month');
 code(()=>selectRule([old],{offerId:'gas',areaId:'chubu',month:'2026-09'}),'rule_unavailable');
 const tepco={...template,effectiveFromMonth:'2026-04',effectiveToMonth:'2026-10',verifiedMonths:['2026-10']};
 code(()=>selectRule([tepco],{offerId:tepco.offerId,areaId:'tokyo',month:'2026-11'}),'rule_unavailable');
});

test('tariff resolution isolates region, month and rule references and distinguishes missing data',()=>{
 const view=single(),offer=view.offers[0],tariff=view.tariffs[0];
 assert.equal(resolveTariff(view,offer,'2026-10').rule.id,tariff.ruleId);
 assert.equal(resolveTariff(view,offer,'2026-09').reasonCode,'missing_month');
 assert.equal(resolveTariff(view,{...offer,areaId:'chubu'},'2026-10').reasonCode,'pending_rules');
 assert.equal(resolveTariff(view,{...offer,id:'unknown'},'2026-10').reasonCode,'pending_rules');
 view.tariffs.push({...tariff,id:'another'});
 assert.equal(resolveTariff(view,offer,'2026-10').reasonCode,'ambiguous_tariff');view.tariffs.pop();
 tariff.ruleId='absent';assert.equal(resolveTariff(view,offer,'2026-10').reasonCode,'missing_rule');tariff.ruleId=view.rules[0].id;
 view.rules[0].areaId='chubu';assert.equal(resolveTariff(view,offer,'2026-10').reasonCode,'rule_mismatch');
});

test('unsupported and incomplete candidate rules return explicit reasons rather than fictional prices',()=>{
 const changes=[
  [view=>view.rules[0].calculationModel='daily_v1','unsupported_calculation_model'],
  [view=>view.rules[0].rounding='unimplemented_rounding','unsupported_rounding'],
  [view=>view.rules[0].verifiedMonths=[],'rule_unverified'],
  [view=>view.rules[0].effectiveToMonth='2026-09','rule_unavailable'],
  [view=>view.tariffs[0].sourceIds.push('missing'),'missing_source'],
  [view=>view.tariffs[0].applicability.month='2026-09','invalid_applicability'],
  [view=>delete view.tariffs[0].applicability.standardFullCycleOnly,'invalid_applicability'],
  [view=>view.tariffs[0].applicability.taxIncluded=false,'invalid_applicability'],
 ];
 for(const [mutate,reason]of changes){const view=single();mutate(view);assert.equal(resolveTariff(view,view.offers[0],'2026-10').reasonCode,reason);}
});

test('publication rejects bad identities, references, dates, prices and overlapping rules',()=>{
 const changes=[
  [v=>v.providers.push({...v.providers[0]}),'duplicate_id'],
  [v=>v.offers[0].providerId='absent','missing_provider'],
  [v=>v.offers[0].areaId='absent','unsupported_area'],
  [v=>v.offers[0].capacity.type='kva','unsupported_capacity_model'],
  [v=>v.offers[0].capacity.values=[25],'invalid_capacity'],
  [v=>v.rules[0].effectiveFromMonth='2026-13','invalid_month'],
  [v=>v.rules[0].effectiveFromMonth='2026-11','invalid_rule'],
  [v=>v.rules[0].verifiedMonths=['2026-09'],'invalid_rule'],
  [v=>v.rules.push({...v.rules[0],id:'overlap',verifiedMonths:[]}),'ambiguous_rule'],
  [v=>v.rules[0].baseYenByAmps['10']='1.001','invalid_rate'],
  [v=>v.rules[0].baseYenByAmps['10']='-1.00','invalid_rate'],
  [v=>v.rules[0].tiers[1].upTo=110,'invalid_rate'],
  [v=>v.rules[0].minimumYen='-1.00','invalid_rate'],
  [v=>v.rules[0].sourceIds=['absent'],'missing_source'],
  [v=>v.tariffs[0].subsidyYen='-1.00','invalid_rate'],
  [v=>v.tariffs[0].renewableYen='-1.00','invalid_rate'],
  [v=>v.tariffs.push({...v.tariffs[0],id:'duplicate-month'}),'ambiguous_tariff'],
  [v=>v.sources[0].effectiveFrom='2026-02-30','invalid_source_date'],
  [v=>{v.sources[0].effectiveFrom='2026-11';v.sources[0].effectiveTo='2026-10';},'invalid_source_date'],
  [v=>v.tariffs[0].applicability.basis='calendar_month','invalid_applicability'],
 ];
 for(const [mutate,reason]of changes){const view=single();mutate(view);code(()=>validateDataset(view),reason);}
});

test('pending offers need no price rules, supported amp subsets are valid, and source dates are not billing dates',()=>{
 const view=single();view.offers[0].capacity.values=[20,30];
 view.sources[0].effectiveFrom='2024-04';view.sources[0].effectiveTo='2026-10-31';
 assert.equal(validateDataset(view).offers[0].capacity.values.length,2);
 const pending={...structuredClone(view.offers[0]),id:'pending',needsDays:true};view.offers.push(pending);
 assert.equal(validateDataset(view).offers.length,2);
 // Information sources may lack effective dates. No publication date is used to infer a month.
 view.sources.push({id:'information',publishedAt:'2026-11-01'});
 assert.equal(validateDataset(view).sources.at(-1).id,'information');
});

test('monthly records cannot carry or override any static rule field',()=>{
 const fields=['baseYenByAmps','tiers','minimumYen','zeroUseHalfBase','calculationModel','rounding','effectiveFromMonth','effectiveToMonth','verifiedMonths'];
 for(const field of fields){
  const view=single();view.tariffs[0][field]=structuredClone(view.rules[0][field]);
  code(()=>validateDataset(view),'invalid_tariff');
 }
 // The pre-schema snapshots legitimately contain flat rule fields; adapting
 // them moves those fields before validation without changing saved bytes.
 for(const {raw}of fixtures)assert.equal(validateDataset(raw).tariffs.some(t=>Object.hasOwn(t,'tiers')),false);
});

test('provider names and area display/status metadata must be explicit and usable',()=>{
 for(const name of [undefined,null,0,'','   ']){
  const view=single();view.providers[0].name=name;code(()=>validateDataset(view),'invalid_dataset');
 }
 for(const status of [undefined,null,'','ready',true]){
  const view=single();view.areas[0].status=status;code(()=>validateDataset(view),'invalid_dataset');
 }
 for(const field of ['name','labelKey'])for(const value of [null,0,'','   ']){
  const view=single();view.areas[0][field]=value;code(()=>validateDataset(view),'invalid_dataset');
 }
 const noLabel=single();delete noLabel.areas[0].labelKey;code(()=>validateDataset(noLabel),'invalid_dataset');
 noLabel.areas[0].name='東京電力エリア';assert.equal(validateDataset(noLabel).areas[0].name,'東京電力エリア');
 const pending=single();pending.areas[0].status='pending';assert.equal(validateDataset(pending).areas[0].status,'pending');
});
