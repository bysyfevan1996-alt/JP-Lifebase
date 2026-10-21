import evidence from './evidence/2026-10-21.tokyo-v5/index.json' with {type:'json'};

const months=['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'];
const amps=[10,15,20,30,40,50,60];
const source=(id,file,title,extra={})=>{
 const entry=evidence.entries.find(item=>item.file===file);
 if(!entry)throw Error(`Missing Octopus archive: ${file}`);
 return {id,title,url:entry.url,checkedAt:'2026-10-21',sha256:entry.sha256,...extra};
};
export const sources=[
 source('octopus-general-20250317','_250317.pdf','オクトパス：電気需給約款（2025年3月17日実施）',{effectiveFrom:'2025-03-17'}),
 source('octopus-green-202505-verified','_greenoctopus-2025-05-tokyo.pdf','オクトパス：グリーンオクトパス2025-05（東京）料金定義書',{effectiveFrom:'2025-05-14'}),
 source('octopus-green-202604','_greenoctopus-2026-04-tokyo.pdf','オクトパス：グリーンオクトパス2026-04（東京）料金定義書',{effectiveFrom:'2026-04-28'}),
 source('octopus-green-202610','_greenoctopus-2026-10-tokyo.pdf','オクトパス：グリーンオクトパス2026-10（東京）料金定義書',{effectiveFrom:'2026-10-01'}),
 source('octopus-support-20260630','20260630_-_.pdf','オクトパス：激変緩和対策 付帯メニュー（2026年6月30日）',{effectiveFrom:'2026-06-30'}),
 source('octopus-levy-2026','fy2026_.pdf','オクトパス：2026年5月分〜2027年4月分 再生可能エネルギー賦課金'),
 source('octopus-directory-20261021','terms.html','オクトパス：お知らせ・約款類（2026年10月21日確認）'),
 ...months.map(month=>source(`octopus-fuel-${month.replace('-','')}`,`${month}.pdf`,`オクトパス：${month}分の燃料費調整のお知らせ`,{effectiveFrom:month,effectiveTo:month}))
];
const capacity={type:'amp',values:amps};
export const offers=[
 {id:'octopus-green-202604',providerId:'octopus',areaId:'tokyo',name:'グリーンオクトパス 2026-04（東京）',capacity,needsDays:true},
 // Launch-month full-cycle applicability is unverified; never substitute old prices.
 {id:'octopus-green-202610',providerId:'octopus',areaId:'tokyo',name:'グリーンオクトパス 2026-10（東京）',capacity,needsDays:true}
];
export const rules=[['octopus-green','202505',['18.98','24.10','27.44']],['octopus-green-202604','202604',['19.27','24.47','27.86']]].map(([offerId,vintage,rates])=>({
 id:`${offerId}-daily-202605-202610`,offerId,areaId:'tokyo',effectiveFromMonth:'2026-05',effectiveToMonth:'2026-10',verifiedMonths:months,
 calculationModel:'amp_daily_tiered_v1',rounding:'floor_yen_total_renewable_separate',
 baseDailyYenByAmps:Object.fromEntries(amps.map((a,i)=>[a,['9.70','14.55','19.40','29.10','38.80','48.50','58.20'][i]])),
 tiers:rates.map((rate,i)=>({upTo:[120,300,null][i],rate})),zeroUseHalfBase:true,
 sourceIds:['octopus-general-20250317',vintage==='202505'?'octopus-green-202505-verified':'octopus-green-202604']
}));
const gross=['2.76','2.83','3.18','4.32','5.78','6.75'];
const support=['0.00','0.00','0.00','3.50','4.50','3.50'];
export const tariffs=rules.flatMap(rule=>months.map((month,i)=>({
 id:`${rule.offerId}-${month}`,offerId:rule.offerId,areaId:'tokyo',ruleId:rule.id,month,
 fuelGrossYen:gross[i],subsidyYen:support[i],renewableYen:'4.18',
 sourceIds:[`octopus-fuel-${month.replace('-','')}`,'octopus-directory-20261021','octopus-levy-2026',...(i>=3?['octopus-support-20260630']:[])],
 applicability:{basis:'provider_meter_reading_month',month,standardFullCycleOnly:true,taxIncluded:true,zeroUseSupported:false}
})));
