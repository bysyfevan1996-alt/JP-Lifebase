import {toSen,tierAmounts} from './money.mjs';

const error=code=>Object.assign(new Error(code),{status:400,code});
const safe=value=>{if(!Number.isSafeInteger(value))throw new RangeError('Unsafe daily tariff amount');return value;};

// Daily-base contracts retain monthly tier thresholds for an ordinary cycle.
// All multiplication happens after decimal-digit parsing, in integer milli-yen.
export function calculateDailyTariff(tariff,plan,input,sources){
 const {days,amps,kwh}=input;
 if(days===undefined)throw error('days_required');
 if(!Number.isSafeInteger(days)||days<1||days>62)throw error('invalid_days');
 if(!Number.isSafeInteger(kwh)||kwh<0||kwh>10000)throw error('invalid_kwh');
 const rate=tariff.baseDailyYenByAmps[String(amps)];
 if(rate===undefined)throw error('invalid_amps');
 const daySen=toSen(rate),baseSenDays=safe(daySen*days);
 const baseMilli=safe(baseSenDays*(kwh===0&&tariff.zeroUseHalfBase?5:10));
 const energy=tierAmounts(kwh,tariff.tiers);
 const energyMilli=energy.reduce((sum,row)=>safe(sum+safe(row.amountSen*10)),0);
 const grossSen=toSen(tariff.fuelGrossYen),subsidySen=toSen(tariff.subsidyYen),renewableSen=toSen(tariff.renewableYen);
 const fuelMilli=safe(safe(grossSen*kwh)*10),subsidyMilli=safe(safe(-subsidySen*kwh)*10);
 const levyYen=Math.floor(safe(renewableSen*kwh)/100);
 const subtotalMilli=safe(safe(safe(baseMilli+energyMilli)+fuelMilli)+subsidyMilli);
 const roundedSubtotalYen=Math.floor(subtotalMilli/1000);
 const unclampedTotalYen=safe(roundedSubtotalYen+levyYen);
 // Octopus's floor is on the combined total including levy, not the subtotal.
 const zeroFloorYen=Math.max(0,-unclampedTotalYen),totalYen=Math.max(0,unclampedTotalYen);
 const breakdown=[
  {key:'base',amountYen:baseMilli/1000,detail:'daily_base',rateYen:daySen/100,days},
  ...energy.map(row=>({key:'tier',amountYen:row.amountSen/100,rateYen:row.rateSen/100,kwh:row.kwh,fromKwh:row.fromKwh,toKwh:row.toKwh})),
  {key:'fuel',amountYen:fuelMilli/1000,rateYen:grossSen/100,kwh},
  {key:'subsidy',amountYen:subsidyMilli/1000,rateYen:-subsidySen/100,kwh},
  {key:'renewable',amountYen:levyYen,rateYen:renewableSen/100,kwh},
  {key:'discount',amountYen:0}
 ];
 if(zeroFloorYen)breakdown.push({key:'minimum',detail:'zero_total_floor',amountYen:zeroFloorYen});
 return {planId:plan.id,provider:plan.provider,name:plan.name,totalYen,breakdown,
  fuel:{grossRate:grossSen/100,subsidyRate:subsidySen/100,netRate:(grossSen-subsidySen)/100},
  tariffVersion:tariff.id,sources:tariff.sourceIds.map(id=>{const source=sources.find(item=>item.id===id);if(!source)throw Error('Missing tariff source');return source;}),
  assumptions:['standard_cycle','no_optional_discounts','tax_included','actual_billing_days'],
  rounding:'floor_yen_total_renewable_separate',roundingAdjustmentYen:roundedSubtotalYen-subtotalMilli/1000,applicability:tariff.applicability};
}
