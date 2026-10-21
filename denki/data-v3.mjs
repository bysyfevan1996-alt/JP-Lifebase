import {dataset as legacy} from './legacy-data.mjs';
import {selectRule} from './model.mjs';

// Reorganize already verified prices; the exact published V2 payload stays in legacy-data.mjs.
const providerIds={'tepco-b':'tepco','mitsu-b':'mitsuuroko','tokyo-gas-basic':'tokyo-gas','eneos-v':'eneos','octopus-green':'octopus'};
const providers=legacy.plans.map(plan=>({id:providerIds[plan.id],name:plan.provider}));
const offers=legacy.plans.map(plan=>({id:plan.id,providerId:providerIds[plan.id],areaId:'tokyo',name:plan.name,capacity:{type:'amp',values:[...plan.capacityAmps]},needsDays:plan.needsDays}));
const currentVerifiedMonths=['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'];
const rules=[];
function priceRule(tariff){
 return {calculationModel:'amp_tiered_v1',rounding:'floor_yen_total_renewable_separate',baseYenByAmps:structuredClone(tariff.baseYenByAmps),tiers:structuredClone(tariff.tiers),...(tariff.minimumYen===undefined?{}:{minimumYen:tariff.minimumYen}),zeroUseHalfBase:tariff.zeroUseHalfBase};
}
// Archived contracts keep their original sources instead of choosing the newest document.
for(const tariff of legacy.tariffs.filter(t=>t.month<'2026-05')){
 rules.push({id:`archive:${tariff.id}`,offerId:tariff.planId,areaId:'tokyo',effectiveFromMonth:tariff.month,effectiveToMonth:tariff.month,verifiedMonths:[tariff.month],...priceRule(tariff),sourceIds:[...tariff.sourceIds]});
}
function addRule(id,offerId,from,to,templateMonth,sourceIds){
 const template=legacy.tariffs.find(t=>t.planId===offerId&&t.month===templateMonth);
 if(!template)throw new Error(`Missing verified rule template: ${id}`);
 const verifiedMonths=currentVerifiedMonths.filter(month=>month>=from&&(to===null||month<=to));
 rules.push({id,offerId,areaId:'tokyo',effectiveFromMonth:from,effectiveToMonth:to,verifiedMonths,...priceRule(template),sourceIds:[...sourceIds]});
}
// Intervals select verified bindings, not inferred future prices. An open interval
// never verifies a future month: verifiedMonths remains an independent gate.
addRule('tepco-b-202604','tepco-b','2026-05','2026-10','2026-05',['tepco-rate-202404','tepco-terms-202604','tepco-round-202604','tepco-levy-202604']);
addRule('mitsu-b-current','mitsu-b','2026-05',null,'2026-05',['mitsu-rate-202404','mitsu-base','mitsu-terms-211','mitsu-vessel-rate','mitsu-vessel-terms-202511','mitsu-vessel-contract-201']);
addRule('eneos-v-202509','eneos-v','2026-05',null,'2026-05',['eneos-terms-202509','eneos-fuel-index']);
addRule('tokyo-gas-basic-pre202610','tokyo-gas-basic','2026-05','2026-09','2026-05',['gas-rate-202503','gas-terms-202506','gas-cycle']);
addRule('tokyo-gas-basic-202610','tokyo-gas-basic','2026-10',null,'2026-10',['gas-rate-202610','gas-terms-202610','gas-cycle']);

const tariffs=legacy.tariffs.map(tariff=>{
 const rule=selectRule(rules,{offerId:tariff.planId,areaId:'tokyo',month:tariff.month});
 return {id:tariff.id,offerId:tariff.planId,areaId:'tokyo',ruleId:rule.id,month:tariff.month,fuelGrossYen:tariff.fuelGrossYen,subsidyYen:tariff.subsidyYen,renewableYen:tariff.renewableYen,sourceIds:tariff.sourceIds.filter(id=>!rule.sourceIds.includes(id)),applicability:structuredClone(tariff.applicability)};
});
export const dataset={schemaVersion:2,version:'2026-10-21.tokyo-v3',previousVersion:legacy.version,checkedAt:legacy.checkedAt,evidenceVersions:[legacy.version],providers,areas:[{id:'tokyo',labelKey:'tokyo',status:'available'}],offers,rules,sources:structuredClone(legacy.sources),tariffs,exclusions:legacy.exclusions.map(item=>({...item,areaId:'tokyo'}))};
