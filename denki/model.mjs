import {toSen,tierAmounts} from './money.mjs';

const fail=code=>Object.assign(new Error(code),{code});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
const monthPattern=/^\d{4}-(?:0[1-9]|1[0-2])$/;
const validMonth=value=>typeof value==='string'&&monthPattern.test(value);
const requireMonth=value=>{if(!validMonth(value))throw fail('invalid_month');return value;};
const standardAmps=new Set([10,15,20,30,40,50,60]);
const knownRuleErrors=new Set(['invalid_month','rule_unavailable','ambiguous_rule','rule_unverified']);
const staticRuleFields=['baseYenByAmps','baseDailyYenByAmps','tiers','minimumYen','zeroUseHalfBase','calculationModel','rounding','effectiveFromMonth','effectiveToMonth','verifiedMonths'];
const supportedModels=new Set(['amp_tiered_v1','amp_daily_tiered_v1']);

// This is a read-only view, never a replacement for the saved payload or hash.
export function normalizeDataset(raw){
 if(!object(raw))throw fail('unsupported_schema');
 if(raw.schemaVersion===2)return structuredClone(raw);
 if(raw.schemaVersion!==undefined&&raw.schemaVersion!==1)throw fail('unsupported_schema');
 if(!Array.isArray(raw.plans)||!Array.isArray(raw.tariffs)||typeof raw.area!=='string')throw fail('invalid_dataset');
 const view=structuredClone(raw),areaId=raw.area;
 const providers=new Map();
 for(const plan of raw.plans){
  if(!object(plan))throw fail('invalid_dataset');
  if(!providers.has(plan.provider))providers.set(plan.provider,{id:plan.provider,name:plan.provider});
 }
 view.schemaVersion=2;
 view.providers=[...providers.values()];
 view.areas=[{id:areaId,labelKey:areaId,status:'available'}];
 view.offers=raw.plans.map(plan=>({id:plan.id,providerId:plan.provider,areaId,name:plan.name,capacity:{type:'amp',values:structuredClone(plan.capacityAmps)},needsDays:plan.needsDays}));
 view.rules=raw.tariffs.map(tariff=>({id:`legacy:${tariff.id}`,offerId:tariff.planId,areaId,effectiveFromMonth:tariff.month,effectiveToMonth:tariff.month,verifiedMonths:[tariff.month],calculationModel:'amp_tiered_v1',rounding:'floor_yen_total_renewable_separate',baseYenByAmps:structuredClone(tariff.baseYenByAmps),tiers:structuredClone(tariff.tiers),...(tariff.minimumYen===undefined?{}:{minimumYen:tariff.minimumYen}),zeroUseHalfBase:tariff.zeroUseHalfBase,sourceIds:[]}));
 view.tariffs=raw.tariffs.map(tariff=>({id:tariff.id,offerId:tariff.planId,areaId,ruleId:`legacy:${tariff.id}`,month:tariff.month,fuelGrossYen:tariff.fuelGrossYen,subsidyYen:tariff.subsidyYen,renewableYen:tariff.renewableYen,sourceIds:structuredClone(tariff.sourceIds),applicability:structuredClone(tariff.applicability)}));
 delete view.area;
 delete view.plans;
 return view;
}

export function selectRule(rules,{offerId,areaId,month,requireVerified=true}){
 requireMonth(month);
 const candidates=rules.filter(rule=>rule.offerId===offerId&&rule.areaId===areaId&&rule.effectiveFromMonth<=month&&(rule.effectiveToMonth===null||month<=rule.effectiveToMonth));
 if(!candidates.length)throw fail('rule_unavailable');
 if(candidates.length!==1)throw fail('ambiguous_rule');
 const rule=candidates[0];
 if(requireVerified&&(!Array.isArray(rule.verifiedMonths)||!rule.verifiedMonths.includes(month)))throw fail('rule_unverified');
 return rule;
}

export function resolveTariff(view,offer,month){
 if(!validMonth(month))return {reasonCode:'invalid_month'};
 const candidates=view.tariffs.filter(tariff=>tariff.offerId===offer.id&&tariff.areaId===offer.areaId&&tariff.month===month);
 if(!candidates.length)return {reasonCode:view.tariffs.some(tariff=>tariff.offerId===offer.id&&tariff.areaId===offer.areaId)?'missing_month':'pending_rules'};
 if(candidates.length!==1)return {reasonCode:'ambiguous_tariff'};
 const tariff=candidates[0],references=view.rules.filter(rule=>rule.id===tariff.ruleId);
 if(!references.length)return {reasonCode:'missing_rule'};
 if(references.length!==1)return {reasonCode:'ambiguous_rule'};
 const rule=references[0];
 if(rule.offerId!==offer.id||rule.areaId!==offer.areaId)return {reasonCode:'rule_mismatch'};
 let selected;
 try{selected=selectRule(view.rules,{offerId:offer.id,areaId:offer.areaId,month});}
 catch(error){if(knownRuleErrors.has(error.code))return {reasonCode:error.code};throw error;}
 if(selected.id!==rule.id)return {reasonCode:'rule_mismatch'};
 if(!supportedModels.has(rule.calculationModel)||offer.needsDays!==(rule.calculationModel==='amp_daily_tiered_v1'))return {reasonCode:'unsupported_calculation_model'};
 if(rule.rounding!=='floor_yen_total_renewable_separate')return {reasonCode:'unsupported_rounding'};
 const applicability=tariff.applicability;
 if(!object(applicability)||applicability.basis!=='provider_meter_reading_month'||applicability.month!==month||applicability.standardFullCycleOnly!==true||applicability.taxIncluded!==true||applicability.zeroUseSupported!==false)return {reasonCode:'invalid_applicability'};
 if(!Array.isArray(rule.sourceIds)||!Array.isArray(tariff.sourceIds))return {reasonCode:'missing_source'};
 const sourceIds=[...new Set([...rule.sourceIds,...tariff.sourceIds])];
 if(!sourceIds.length||sourceIds.some(id=>typeof id!=='string'||!view.sources.some(source=>source.id===id)))return {reasonCode:'missing_source'};
 return {tariff,rule};
}

function index(items){
 if(!Array.isArray(items))throw fail('invalid_dataset');
 const map=new Map();
 for(const item of items){
  if(!object(item)||typeof item.id!=='string'||!item.id)throw fail('invalid_dataset');
  if(map.has(item.id))throw fail('duplicate_id');
  map.set(item.id,item);
 }
 return map;
}
function requireSources(ids,sources){
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!sources.has(id)))throw fail('missing_source');
}
function price(value,allowNegative=false){
 let amount;
 try{amount=toSen(value);}catch{throw fail('invalid_rate');}
 if(!allowNegative&&amount<0)throw fail('invalid_rate');
}
function dateBound(value,end=false){
 if(validMonth(value))return value+(end?'-31':'-01');
 if(typeof value!=='string'||!/^\d{4}-(?:0[1-9]|1[0-2])-\d{2}$/.test(value))throw fail('invalid_source_date');
 const parsed=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw fail('invalid_source_date');
 return value;
}

// Publication-time validation is deliberately stricter than candidate exclusion.
// Unknown rules must not be installed as though they were verified prices.
export function validateDataset(raw){
 const view=normalizeDataset(raw);
 const providers=index(view.providers),areas=index(view.areas),offers=index(view.offers),rules=index(view.rules),sources=index(view.sources);
 index(view.tariffs);
 for(const provider of providers.values())if(!nonempty(provider.name))throw fail('invalid_dataset');
 for(const area of areas.values()){
  if(!['available','pending'].includes(area.status))throw fail('invalid_dataset');
  if(area.name!==undefined&&!nonempty(area.name))throw fail('invalid_dataset');
  if(area.labelKey!==undefined&&!nonempty(area.labelKey))throw fail('invalid_dataset');
  if(!nonempty(area.name)&&!nonempty(area.labelKey))throw fail('invalid_dataset');
 }
 for(const source of sources.values()){
  const from=source.effectiveFrom===undefined?null:dateBound(source.effectiveFrom);
  const to=source.effectiveTo===undefined?null:dateBound(source.effectiveTo,true);
  if(from&&to&&from>to)throw fail('invalid_source_date');
 }
 for(const offer of offers.values()){
  if(!providers.has(offer.providerId))throw fail('missing_provider');
  if(!areas.has(offer.areaId))throw fail('unsupported_area');
  if(!object(offer.capacity)||offer.capacity.type!=='amp')throw fail('unsupported_capacity_model');
  const values=offer.capacity.values;
  if(!Array.isArray(values)||!values.length||values.some(value=>!standardAmps.has(value))||new Set(values).size!==values.length)throw fail('invalid_capacity');
  if(typeof offer.name!=='string'||!offer.name||typeof offer.needsDays!=='boolean')throw fail('invalid_dataset');
 }
 for(const rule of rules.values()){
  const offer=offers.get(rule.offerId);
  if(!offer||offer.areaId!==rule.areaId||!areas.has(rule.areaId))throw fail('rule_mismatch');
  requireMonth(rule.effectiveFromMonth);
  if(rule.effectiveToMonth!==null)requireMonth(rule.effectiveToMonth);
  if(rule.effectiveToMonth!==null&&rule.effectiveToMonth<rule.effectiveFromMonth)throw fail('invalid_rule');
  if(!Array.isArray(rule.verifiedMonths)||new Set(rule.verifiedMonths).size!==rule.verifiedMonths.length)throw fail('invalid_rule');
  for(const month of rule.verifiedMonths){requireMonth(month);if(month<rule.effectiveFromMonth||(rule.effectiveToMonth!==null&&month>rule.effectiveToMonth))throw fail('invalid_rule');}
  if(!supportedModels.has(rule.calculationModel))throw fail('unsupported_calculation_model');
  if(rule.rounding!=='floor_yen_total_renewable_separate')throw fail('unsupported_rounding');
  const daily=rule.calculationModel==='amp_daily_tiered_v1';
  if(offer.needsDays!==daily)throw fail('unsupported_calculation_model');
  if(Object.hasOwn(rule,daily?'baseYenByAmps':'baseDailyYenByAmps')||(daily&&Object.hasOwn(rule,'minimumYen')))throw fail('invalid_rule');
  const base=daily?rule.baseDailyYenByAmps:rule.baseYenByAmps;
  if(!object(base)||!Object.keys(base).length)throw fail('invalid_rate');
  for(const [capacity,value]of Object.entries(base)){
   if(!standardAmps.has(Number(capacity))||String(Number(capacity))!==capacity)throw fail('invalid_capacity');
   price(value);
  }
  if(!offer.capacity.values.some(capacity=>Object.hasOwn(base,String(capacity))))throw fail('invalid_capacity');
  try{tierAmounts(0,rule.tiers);}catch{throw fail('invalid_rate');}
  if(rule.minimumYen!==undefined)price(rule.minimumYen);
  if(typeof rule.zeroUseHalfBase!=='boolean')throw fail('invalid_rule');
  requireSources(rule.sourceIds,sources);
 }
 const ordered=[...rules.values()].sort((a,b)=>a.offerId.localeCompare(b.offerId)||a.areaId.localeCompare(b.areaId)||a.effectiveFromMonth.localeCompare(b.effectiveFromMonth));
 for(let i=1;i<ordered.length;i++){
  const previous=ordered[i-1],current=ordered[i];
  if(previous.offerId===current.offerId&&previous.areaId===current.areaId&&(previous.effectiveToMonth===null||current.effectiveFromMonth<=previous.effectiveToMonth))throw fail('ambiguous_rule');
 }
 const months=new Set();
 for(const tariff of view.tariffs){
  // A monthly record cannot override the separately versioned static rule.
  // Legacy records have already had these fields moved by normalization.
  if(staticRuleFields.some(field=>Object.hasOwn(tariff,field)))throw fail('invalid_tariff');
  const offer=offers.get(tariff.offerId);
  if(!offer||offer.areaId!==tariff.areaId||!areas.has(tariff.areaId))throw fail('tariff_mismatch');
  requireMonth(tariff.month);
  const key=JSON.stringify([tariff.offerId,tariff.areaId,tariff.month]);
  if(months.has(key))throw fail('ambiguous_tariff');
  months.add(key);
  price(tariff.fuelGrossYen,true);price(tariff.subsidyYen);price(tariff.renewableYen);
  requireSources(tariff.sourceIds,sources);
  const resolved=resolveTariff(view,offer,tariff.month);
  if(resolved.reasonCode)throw fail(resolved.reasonCode);
 }
 if(!Array.isArray(view.exclusions))throw fail('invalid_dataset');
 for(const exclusion of view.exclusions){
  if(!object(exclusion)||!offers.has(exclusion.planId)||typeof exclusion.reason!=='string'||!exclusion.reason)throw fail('invalid_dataset');
  if(exclusion.month!==undefined)requireMonth(exclusion.month);
  if(exclusion.areaId!==undefined&&exclusion.areaId!==offers.get(exclusion.planId).areaId)throw fail('unsupported_area');
 }
 return view;
}
