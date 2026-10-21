import {toSen,tierAmounts} from './money.mjs';
import {monthWindow} from './window.mjs';
import {normalizeDataset,resolveTariff} from './model.mjs';
import {calculateDailyTariff} from './daily.mjs';

const error=code=>Object.assign(new Error(code),{status:400,code});
const integer=(v,min,max,code)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw error(code);return v;};
const ampsSupported=[10,15,20,30,40,50,60];
function requireArea(view,area){
 if(typeof area!=='string'||!view.areas.some(item=>item.id===area&&item.status==='available'))throw error('unsupported_area');
}
function planFor(view,offer){
 return {id:offer.id,provider:view.providers.find(p=>p.id===offer.providerId)?.name,name:offer.name,areaId:offer.areaId,capacityAmps:offer.capacity?.type==='amp'?[...offer.capacity.values]:[],needsDays:offer.needsDays};
}
function capacities(offer,rule){
 if(offer.capacity?.type!=='amp')return [];
 const base=rule.calculationModel==='amp_daily_tiered_v1'?rule.baseDailyYenByAmps:rule.baseYenByAmps;
 return offer.capacity.values.filter(amps=>ampsSupported.includes(amps)&&Object.hasOwn(base,String(amps)));
}
function candidate(view,offer,month,amps,days){
 const resolved=resolveTariff(view,offer,month);
 if(resolved.reasonCode)return resolved;
 if(offer.capacity?.type!=='amp')return {reasonCode:'unsupported_capacity_model'};
 if(!capacities(offer,resolved.rule).includes(amps))return {reasonCode:'capacity_not_supported'};
 if(offer.needsDays&&days===undefined)return {reasonCode:'days_required'};
 return resolved;
}
function flattened(tariff,rule){
 return {...rule,id:tariff.id,planId:tariff.offerId,month:tariff.month,fuelGrossYen:tariff.fuelGrossYen,subsidyYen:tariff.subsidyYen,renewableYen:tariff.renewableYen,applicability:tariff.applicability,sourceIds:[...new Set([...rule.sourceIds,...tariff.sourceIds])]};
}
function validateNormalized(input,view){
 if(!input||Array.isArray(input)||typeof input!=='object')throw error('invalid_input');
 requireArea(view,input.area);
 if(input.fullCycle!==true)throw error('full_cycle_required');
 if(typeof input.billingMonth!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.billingMonth)||!view.tariffs.some(t=>t.areaId===input.area&&t.month===input.billingMonth))throw error('invalid_month');
 const kwh=integer(input.kwh,1,10000,'invalid_kwh');
 if(input.capacity!==undefined&&(!input.capacity||input.capacity.type!=='amp'||!Number.isSafeInteger(input.capacity.value)))throw error('invalid_amps');
 const amps=integer(input.amps??input.capacity?.value,10,60,'invalid_amps');
 if(!ampsSupported.includes(amps)||(input.capacity!==undefined&&input.capacity.value!==amps))throw error('invalid_amps');
 const offer=view.offers.find(p=>p.id===input.currentPlanId&&p.areaId===input.area);
 const days=input.days===undefined?undefined:integer(input.days,1,62,'invalid_days');
 const found=offer?candidate(view,offer,input.billingMonth,amps,days):{reasonCode:'current_plan_unavailable'};
 if(found.reasonCode)throw error(found.reasonCode==='days_required'?'days_required':'current_plan_unavailable');
 const normalized={area:input.area,billingMonth:input.billingMonth,amps,capacity:{type:'amp',value:amps},kwh,currentPlanId:input.currentPlanId,fullCycle:true};
 if(days!==undefined)normalized.days=days;
 if(input.actualBillYen!==undefined&&input.actualBillYen!==null)normalized.actualBillYen=integer(input.actualBillYen,0,10000000,'invalid_bill');
 return normalized;
}
export function validateInput(input,dataset){return validateNormalized(input,normalizeDataset(dataset));}
export function catalog(dataset,now=new Date(),area=dataset.area??dataset.areas?.[0]?.id){
 const view=normalizeDataset(dataset),window=monthWindow(now);
 requireArea(view,area);
 const offers=view.offers.filter(offer=>offer.areaId===area);
 const months=window.months.map(id=>{
  const capacityAmpsByPlan={};
  for(const offer of offers){
   const found=resolveTariff(view,offer,id);
   if(!found.reasonCode){const values=capacities(offer,found.rule);if(values.length)capacityAmpsByPlan[offer.id]=values;}
  }
  return {id,label:id,plans:Object.keys(capacityAmpsByPlan),capacityAmpsByPlan};
 }).filter(month=>month.plans.length);
 const plans=offers.map(offer=>{
  const available=months.some(month=>month.plans.includes(offer.id));
  return {...planFor(view,offer),status:available?'available':'pending',reasonCode:available?undefined:'pending_rules'};
 });
 return {version:dataset.version,sha256:dataset.sha256,checkedAt:dataset.checkedAt,schemaVersion:view.schemaVersion,area,areas:view.areas.filter(item=>item.status==='available'),months,window,plans,exclusions:view.exclusions?.filter(item=>!item.areaId||item.areaId===area),sources:view.sources,notes:['standard_cycle','billing_month_not_calendar_usage','no_optional_discounts','recent_six_months']};
}
export function calculateTariff(tariff,plan,input,sources){
 if(tariff.calculationModel==='amp_daily_tiered_v1')return calculateDailyTariff(tariff,plan,input,sources);
 const {kwh,amps}=input,base=tariff.baseYenByAmps[String(amps)];
 if(base===undefined)throw error('invalid_amps');
 const baseMilli=toSen(base)*(kwh===0&&tariff.zeroUseHalfBase?5:10);
 const energy=tierAmounts(kwh,tariff.tiers);
 const grossSen=toSen(tariff.fuelGrossYen),subsidySen=toSen(tariff.subsidyYen),renewableSen=toSen(tariff.renewableYen);
 const fuelMilli=grossSen*kwh*10,subsidyMilli=-subsidySen*kwh*10;
 const levyYen=Math.floor(renewableSen*kwh/100);
 const subtotalMilli=baseMilli+energy.reduce((sum,row)=>sum+row.amountSen*10,0)+fuelMilli+subsidyMilli;
 if(!Number.isSafeInteger(subtotalMilli)||subtotalMilli<0)throw new Error('Invalid tariff subtotal');
 const minimumMilli=tariff.minimumYen===undefined?0:toSen(tariff.minimumYen)*10;
 const minimumAdjustmentMilli=Math.max(0,minimumMilli-subtotalMilli);
 const billedSubtotalMilli=subtotalMilli+minimumAdjustmentMilli;
 const totalYen=Math.floor(billedSubtotalMilli/1000)+levyYen;
 const breakdown=[{key:'base',amountYen:baseMilli/1000,detail:kwh===0&&tariff.zeroUseHalfBase?'zero_use_half_base':'standard_base'},...energy.map(row=>({key:'tier',amountYen:row.amountSen/100,rateYen:row.rateSen/100,kwh:row.kwh,fromKwh:row.fromKwh,toKwh:row.toKwh})),{key:'fuel',amountYen:fuelMilli/1000,rateYen:grossSen/100,kwh},{key:'subsidy',amountYen:subsidyMilli/1000,rateYen:-subsidySen/100,kwh},{key:'renewable',amountYen:levyYen,rateYen:renewableSen/100,kwh},{key:'discount',amountYen:0}];
 if(minimumAdjustmentMilli)breakdown.push({key:'minimum',amountYen:minimumAdjustmentMilli/1000,detail:'minimum_monthly_charge',minimumYen:minimumMilli/1000});
 return {planId:plan.id,provider:plan.provider,name:plan.name,totalYen,breakdown,fuel:{grossRate:grossSen/100,subsidyRate:subsidySen/100,netRate:(grossSen-subsidySen)/100},tariffVersion:tariff.id,sources:tariff.sourceIds.map(id=>{const s=sources.find(s=>s.id===id);if(!s)throw new Error('Missing tariff source');return s;}),assumptions:['standard_cycle','no_optional_discounts','tax_included'],rounding:'floor_yen_total_renewable_separate',roundingAdjustmentYen:Math.floor(billedSubtotalMilli/1000)-billedSubtotalMilli/1000,applicability:tariff.applicability};
}
export function compare(input,dataset){
 const view=normalizeDataset(dataset),normalized=validateNormalized(input,view),results=[],excluded=[];
 for(const offer of view.offers.filter(p=>p.areaId===normalized.area)){
  const plan=planFor(view,offer),resolved=candidate(view,offer,normalized.billingMonth,normalized.amps,normalized.days);
  if(resolved.reasonCode){const reason=view.exclusions?.find(e=>e.planId===plan.id&&(!e.areaId||e.areaId===normalized.area)&&(!e.month||e.month===normalized.billingMonth))?.reason;excluded.push({planId:plan.id,provider:plan.provider,name:plan.name,reasonCode:reason||resolved.reasonCode});continue;}
  results.push(calculateTariff(flattened(resolved.tariff,resolved.rule),plan,normalized,view.sources));
 }
 const baseline=results.find(r=>r.planId===normalized.currentPlanId);
 if(!baseline)throw error('current_plan_unavailable');
 for(const r of results)r.deltaYen=r.totalYen-baseline.totalYen;
 results.sort((a,b)=>a.totalYen-b.totalYen||a.planId.localeCompare(b.planId));
 const reconciliation=normalized.actualBillYen===undefined?null:{actualBillYen:normalized.actualBillYen,calculatedYen:baseline.totalYen,differenceYen:normalized.actualBillYen-baseline.totalYen};
 return {version:dataset.version,sha256:dataset.sha256,input:normalized,baselineId:baseline.planId,results,excluded,reconciliation};
}
