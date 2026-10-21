// Curated from the linked official documents. No inferred months or market prices.
const amps=[10,15,20,30,40,50,60];
const standardBase={'10':'311.75','15':'467.63','20':'623.50','30':'935.25','40':'1247.00','50':'1558.75','60':'1870.50'};
const gasBase={'10':'311.74','15':'467.61','20':'623.48','30':'935.22','40':'1246.96','50':'1558.70','60':'1870.44'};
const source=(id,title,url,extra={})=>({id,title,url,checkedAt:'2026-10-20',...extra});
const sources=[
 source('tepco-rate-202404','東京電力：2024年4月改定料金表','https://www.tepco.co.jp/ep/notice/pressrelease/2024/pdf/240206j0101.pdf',{publishedAt:'2024-02-06',page:1}),
 source('tepco-terms-202504','東京電力：特定小売供給約款・従量電灯B（2025年4月版）','https://www.tepco.co.jp/ep/company2/agreement/pdf/20250401kyoukyu003-j.pdf',{pages:[6,7],effectiveFrom:'2025-04-01',effectiveTo:'2026-03-31'}),
 source('tepco-round-202504','東京電力：約款・料金の単位と端数処理','https://www.tepco.co.jp/ep/company2/agreement/pdf/20250401kyoukyu001-j.pdf',{page:3}),
 source('tepco-levy-202504','東京電力：約款・再エネ賦課金','https://www.tepco.co.jp/ep/company2/agreement/pdf/20250401kyoukyu009-j.pdf',{page:1}),
 source('tepco-fuel-202509','東京電力：2025年9月分燃料費調整・支援・公式計算例','https://www.tepco.co.jp/ep/notice/pressrelease/2025/pdf/250730j0101.pdf',{publishedAt:'2025-07-30',pages:[1,2]}),
 source('tepco-fuel-202601','東京電力：2026年1月分燃料費調整・公式計算例','https://www.tepco.co.jp/ep/notice/pressrelease/2025/pdf/251127j0201.pdf',{publishedAt:'2025-11-27',pages:[1,2]}),
 source('mitsu-rate-202404','ミツウロコでんき：2024年4月改定料金表・東京','https://mitsuurokogreenenergy.jp/pdf/tanka-ichiran20240304.pdf',{page:3,effectiveFrom:'2024-04'}),
 source('mitsu-base','ミツウロコでんき：関東エリア従量電灯B料金表','https://mitsuurokogreenenergy.jp/ryokin/tanka.html'),
 source('mitsu-terms-211','ミツウロコでんき：電気需給約款 Ver2.1.1','https://mitsuurokogreenenergy.jp/pdf/agreement.pdf',{effectiveFrom:'2025-10-01',pages:[8,15,35],note:'Mutable official URL; the verified document version is 2.1.1.'}),
 source('mitsu-fuel-202601','ミツウロコでんき：2026年1月分燃料費調整・再エネ単価','https://mitsuurokogreenenergy.jp/pdf/news/20251203.pdf',{publishedAt:'2025-12-03',page:1}),
 source('gas-rate-202503','東京ガス：基本プラン定義書・2025年3月検針分から','https://home.tokyo-gas.co.jp/information/qvk8cc0000000f5b-att/info_power_20241001_02.pdf',{page:6,effectiveFrom:'2025-03'}),
 source('gas-terms-202506','東京ガス：電気需給約款・2025年6月版','https://home.tokyo-gas.co.jp/information/power-202505-01/pdf/info2505_yakkan.pdf',{sha256:'f36965f9275739db0af85ab17a382d0e19c3756323686ae625e119e7d1fb420c',effectiveFrom:'2025-06-01'}),
 source('gas-cycle','東京ガス：電気料金の計算方法と検針期間','https://home.tokyo-gas.co.jp/gas_power/plan/power/calculation.html'),
 source('gas-fuel-202509','東京ガス：2025年9月検針分燃料費調整','https://home.tokyo-gas.co.jp/gas_power/plan/power/price/pdf/chousei2509.pdf',{publishedAt:'2025-08-01'}),
 source('gas-fuel-202601','東京ガス：2026年1月検針分燃料費調整','https://home.tokyo-gas.co.jp/gas_power/plan/power/price/pdf/chousei2601.pdf',{publishedAt:'2025-12-01',sha256:'0759d2e928fc7aebab4032bd07f376b1cda32baa6608f7727f090b6c3bec54f7',note:'Visible page verified; invisible stale subsidy text is not used.'}),
 source('eneos-terms-202503','ENEOSでんき：東京Vプラン・2025年3月3日版約款','https://www.eneos-power.co.jp/denki/contract/pdf/ene_clause_all_kanto_20250303.pdf',{effectiveFrom:'2025-03-03',pages:[17,18]}),
 source('eneos-fuel-index','ENEOS Power：公式燃料費調整単価一覧（PDF掲載元）','https://www.eneos-power.co.jp/fuelcost-denki/'),
 source('eneos-fuel-202509','ENEOSでんき：2025年9月分燃料費調整・関東','https://eneospower-co.wjopen.jp/cmsdata/filelib/denki_charge_fuelcost_2509.pdf',{page:2,sha256:'78067c8d90152072162e7edff357c010772b79e629a03ca95285c1629482ed22'}),
 source('eneos-fuel-202601','ENEOSでんき：2026年1月分燃料費調整・関東','https://eneospower-co.wjopen.jp/cmsdata/filelib/denki_charge_fuelcost_2601.pdf',{page:1,sha256:'7117de4af8719438eb3ba472b21a1bcf03ea21fc52c044de6bf431eb65e605ab'}),
 source('renewable-2025','経済産業省：2025年度再エネ賦課金 3.98円/kWh（2025年5月〜2026年4月検針分）','https://www.meti.go.jp/english/press/2025/0321_001.html',{publishedAt:'2025-03-21',effectiveFrom:'2025-05',effectiveTo:'2026-04'}),
 source('octopus-terms-202505','オクトパス：グリーンオクトパス2025-05東京・料金定義書','https://a.storyblok.com/f/122730/x/a9f2a9f355/_greenoctopus-2025-05-tokyo.pdf',{effectiveFrom:'2025-05-14'})
];
const plans=[
 {id:'tepco-b',provider:'東京電力エナジーパートナー',name:'従量電灯B',capacityAmps:amps,needsDays:false},
 {id:'mitsu-b',provider:'ミツウロコでんき',name:'従量電灯B（関東）',capacityAmps:amps,needsDays:false},
 {id:'tokyo-gas-basic',provider:'東京ガス',name:'基本プラン',capacityAmps:amps,needsDays:false},
 {id:'eneos-v',provider:'ENEOSでんき',name:'東京Vプラン',capacityAmps:amps,needsDays:false},
 {id:'octopus-green',provider:'オクトパスエナジー',name:'グリーンオクトパス 2025-05（東京）',capacityAmps:amps,needsDays:true}
];
const tiers=rates=>rates.map((rate,i)=>({upTo:[120,300,null][i],rate}));
const specifications={
 'tepco-b':{baseYenByAmps:standardBase,tiers:tiers(['29.80','36.40','40.49']),minimumYen:'328.08',zeroUseHalfBase:true,sourceIds:['tepco-rate-202404','tepco-terms-202504','tepco-round-202504','tepco-levy-202504']},
 'mitsu-b':{baseYenByAmps:standardBase,tiers:tiers(['31.91','33.13','35.79']),zeroUseHalfBase:true,sourceIds:['mitsu-rate-202404','mitsu-base','mitsu-terms-211']},
 'tokyo-gas-basic':{baseYenByAmps:gasBase,tiers:tiers(['29.70','35.69','39.50']),zeroUseHalfBase:true,sourceIds:['gas-rate-202503','gas-terms-202506','gas-cycle']},
 'eneos-v':{baseYenByAmps:standardBase,tiers:tiers(['29.80','34.85','36.90']),zeroUseHalfBase:true,sourceIds:['eneos-terms-202503','eneos-fuel-index']}
};
const fuelPrefix={'tepco-b':'tepco','mitsu-b':'mitsu','tokyo-gas-basic':'gas','eneos-v':'eneos'};
const tariffs=[];
for(const month of ['2025-09','2026-01'])for(const [planId,spec]of Object.entries(specifications)){
 // The September Mitsu rate is known, but its old full terms were overwritten.
 // Do not rank a supposedly verified result until that historical rule is archived.
 if(month==='2025-09'&&planId==='mitsu-b')continue;
 const suffix=month.replace('-','');
 tariffs.push({...spec,id:`${planId}-${suffix}-v1`,planId,month,fuelGrossYen:month==='2025-09'?'-7.50':'-7.72',subsidyYen:month==='2025-09'?'2.40':'0.00',renewableYen:'3.98',sourceIds:[...spec.sourceIds,`${fuelPrefix[planId]}-fuel-${suffix}`,'renewable-2025'],applicability:{basis:'provider_meter_reading_month',month,standardFullCycleOnly:true,taxIncluded:true,zeroUseSupported:false}});
}
sources.push(
 source('mitsu-vessel-rate','ミツウロコヴェッセル：関東料金表・2024年4月検針分から','https://service.mitsuurokogas.jp/mitsuurokodenki/ryokin/tanka',{effectiveFrom:'2024-04'}),
 source('mitsu-vessel-terms-202511','ミツウロコヴェッセル：重要事項説明書・2025年11月版','https://service.mitsuurokogas.jp/juyojiko-202511.pdf',{pages:[7,8,9],note:'Kanto tariff; retailer MGE A0016 and intermediary Mitsuuroko Vessel are explicitly identified.'}),
 source('mitsu-vessel-contract-201','ミツウロコヴェッセル：電気需給約款 Ver2.0.1（2024年11月1日実施）','https://service.mitsuurokogas.jp/yakkan.pdf',{effectiveFrom:'2024-11-01'}),
 source('renewable-2026','経済産業省：2026年度再エネ賦課金 4.18円/kWh（2026年5月〜2027年4月）','https://www.meti.go.jp/press/2025/03/20260319004/20260319004.html',{publishedAt:'2026-03-19',effectiveFrom:'2026-05',effectiveTo:'2027-04'})
);
const monthly2026=[
 ['2026-05','-7.37','0.00','20260403'],
 ['2026-06','-7.30','0.00','20260508'],
 ['2026-07','-7.19','0.00','20260603'],
 ['2026-08','-6.77','3.50','20260703'],
 ['2026-09','-6.46','4.50','20260805'],
 ['2026-10','-5.80','3.50','20260903']
];
for(const [month,gross,support,publication]of monthly2026){
 const fuelId='mitsu-fuel-'+month.replace('-','');
 sources.push(source(fuelId,`ミツウロコでんき：${month}月分燃料費調整・政府支援・再エネ単価`,`https://mitsuurokogreenenergy.jp/pdf/news/${publication}.pdf`,{publishedAt:`${publication.slice(0,4)}-${publication.slice(4,6)}-${publication.slice(6)}`,page:1}));
 const spec=specifications['mitsu-b'];
 tariffs.push({...spec,id:`mitsu-b-${month.replace('-','')}-v1`,planId:'mitsu-b',month,fuelGrossYen:gross,subsidyYen:support,renewableYen:'4.18',sourceIds:[...spec.sourceIds,'mitsu-vessel-rate','mitsu-vessel-terms-202511','mitsu-vessel-contract-201',fuelId,'renewable-2026'],applicability:{basis:'provider_meter_reading_month',month,standardFullCycleOnly:true,taxIncluded:true,zeroUseSupported:false}});
}
sources.push(
 source('tepco-terms-202604','東京電力：従量電灯B・2026年4月版約款','https://www.tepco.co.jp/ep/company2/agreement/pdf/20260401kyoukyu003-j.pdf',{pages:[6,7],effectiveFrom:'2026-04-01',effectiveTo:'2026-10-31',sha256:'74767e23bfe67330a3bf13a71c83da177003bcb47e6f4aaa16c2f16ae6684bd7'}),
 source('tepco-round-202604','東京電力：料金の単位と端数処理・2026年4月版','https://www.tepco.co.jp/ep/company2/agreement/pdf/20260401kyoukyu001-j.pdf',{page:3,sha256:'bcdb3d5f55b3f14e4029a20ddedd00271ac164e42f3cb4b9b78ab0d2e3178bcb'}),
 source('tepco-levy-202604','東京電力：再エネ賦課金・2026年4月版約款別表','https://www.tepco.co.jp/ep/company2/agreement/pdf/20260401kyoukyu009-j.pdf',{page:1,sha256:'f1bb4fc32d0658171d6092f32dd12236160a89bd3a8591568d041266479acdd7'}),
 source('tepco-support-202607','東京電力：2026年夏の料金支援特約','https://www.tepco.co.jp/ep/company2/agreement/pdf/20260701kyoukyu010-j.pdf',{sha256:'226bbac5638aa4dc8e231a663705fd744dd05fb277ef1b0a5381d2a59fd6fc32'}),
 source('gas-change-202610','東京ガス：2026年10月約款変更のお知らせ','https://home.tokyo-gas.co.jp/information/power-202604-01.html',{publishedAt:'2026-04-27'}),
 source('gas-rate-202610','東京ガス：基本プラン定義書・2026年10月版','https://home.tokyo-gas.co.jp/gas_power/plan/power/d1c6tj00000018fm-att/denki_basic.pdf',{effectiveFrom:'2026-10-01',page:6,sha256:'b2a274e66338f83089e82640505fbd5f86f780ace2f7a4b7d81f535e1a4fdb1e'}),
 source('gas-terms-202610','東京ガス：電気需給約款・2026年10月版','https://home.tokyo-gas.co.jp/gas_power/plan/power/d1c6tj00000018fm-att/jukyuu_yakkan.pdf',{effectiveFrom:'2026-10-01',pages:[7,32],sha256:'f9b75ba514949d96b98fb38ec6ec96237bbef8e336a126fc390707c9b6ef59fc'}),
 source('eneos-terms-202509','ENEOSでんき：東京Vプラン・2025年9月1日版約款','https://www.eneos-power.co.jp/denki/contract/pdf/ene_clause_all_kanto_20250901.pdf',{effectiveFrom:'2025-09-01',pages:[12,24,25,66],sha256:'4c9b380df969e091bbb07b3ee2e4513a33c348ddd541da3cb58f01581dcc2fef'})
);
const tepcoDocuments=[
 ['260327j0101','50365fecfbcf977a6c36f74383a4ba85dd5540046c7adb56dc46365449d09652'],
 ['260428j0101','b66c4470f396b976099b37d2b74a88e990c501359173da1188a53cfef7b140a8'],
 ['260528j0101','54614afe7c233c8112c9f04666775be96005459b481a0a467867fe0bd0fc383b'],
 ['260626j0201','19581d9f60f862bb14e2b9b1a227515269b4771629c26c18f5e0e209d458c508'],
 ['260730j0101','6d2d682d97edc485ee0655de45afb6958c083e1ea142d10ecd3e74261827b6e1'],
 ['260828j0601','4c26b6f5b305e7405f790adcb23eebebde5159cac1aca2e863909ae6ae5498ad']
];
const gasDocuments=[
 ['2026-04-01','ed38bfdf1952f392a3a1457585cebad09cbe1fce6c551a7746ca98f526545036'],
 ['2026-05-07','ac029b1bdb88bc1e1a0a21ef19b24be7e1d29ef2804848bbe076646a95b3cbd2'],
 ['2026-06-01','70b17d10a3fc9d0d8af448dca8d30c4ce88fe2fce4a16f01d369c4245b198b52'],
 ['2026-07-01','c6cd145538bed786c454ceed30504bbc43302645e3e303c69e45552b46a535c9'],
 ['2026-08-03','38d959f9924feb94989555e2581b9b92b59f6136dac0a4690c442b88eaf1357e'],
 ['2026-09-01','ebdb386c192f1104a0e06a0f63ef11eb3d0d305cf269955eb5f1cf32fe13db0c']
];
const eneosHashes=['40417d6833da7447ae4fadfb12dc6765dbf17c0e7816ad343665e4db310f9acf','7c015d128185dda2a8a8da95eb7fbffc247597e5b91f5271e935eb68a7e5af3a','e32490b6e71f6e29e1041df808a10a7102869057bf1e1c415cc86cd11b12f5f2','658414ab602fb7d4044204381930ebbffa2896463123a4be7f61713e8c7b5322','521e4a210eb95b27ff6fd4cc5e145da3268ad7224c01e0e8c26275ae25b64ca4','1be460e4b8ec4bca045f0c9a9d91dd43fcead60322532db5f743035d2c9f7059'];
for(const [i,[month,gross,support]]of monthly2026.entries()){
 const suffix=month.replace('-',''),short=suffix.slice(2),[tepcoFile,tepcoHash]=tepcoDocuments[i];
 sources.push(
  source(`tepco-fuel-${suffix}`,`東京電力：${month}月分燃料費調整・政府支援・公式計算例`,`https://www.tepco.co.jp/ep/notice/pressrelease/2026/pdf/${tepcoFile}.pdf`,{publishedAt:`20${tepcoFile.slice(0,2)}-${tepcoFile.slice(2,4)}-${tepcoFile.slice(4,6)}`,pages:[1,2],sha256:tepcoHash}),
  source(`gas-fuel-${suffix}`,`東京ガス：${month}月検針分燃料費調整`,`https://home.tokyo-gas.co.jp/gas_power/plan/power/price/pdf/chousei${short}.pdf`,{publishedAt:gasDocuments[i][0],page:1,sha256:gasDocuments[i][1]}),
  source(`eneos-fuel-${suffix}`,`ENEOSでんき：${month}月分燃料費調整・関東`,`https://eneospower-co.wjopen.jp/cmsdata/filelib/denki_charge_fuelcost_${short}.pdf`,{page:i<3?1:2,sha256:eneosHashes[i]})
 );
 // Each provider's six PDFs was independently verified; equal adjustment
 // numbers here are documented observations, not cross-provider estimates.
 for(const planId of ['tepco-b','tokyo-gas-basic','eneos-v']){
  const spec=specifications[planId];
  const rules=planId==='tepco-b'?['tepco-terms-202604','tepco-round-202604','tepco-levy-202604',...(support==='0.00'?[]:['tepco-support-202607'])]:planId==='eneos-v'?['eneos-terms-202509','eneos-fuel-index']:month==='2026-10'?['gas-rate-202610','gas-terms-202610','gas-change-202610','gas-cycle']:['gas-rate-202503','gas-terms-202506','gas-cycle'];
  tariffs.push({...spec,id:`${planId}-${suffix}-v1`,planId,month,fuelGrossYen:gross,subsidyYen:support,renewableYen:'4.18',sourceIds:[...rules,`${fuelPrefix[planId]}-fuel-${suffix}`,'renewable-2026'],applicability:{basis:'provider_meter_reading_month',month,standardFullCycleOnly:true,taxIncluded:true,zeroUseSupported:false}});
 }
}
export const dataset={version:'2026-10-20.tokyo-v2',previousVersion:'2026-10-20.tokyo-v1',checkedAt:'2026-10-20',area:'tokyo',plans,sources,tariffs,exclusions:[{planId:'mitsu-b',month:'2025-09',reason:'historical_terms_unavailable'},{planId:'octopus-green',reason:'daily_billing_and_fuel_not_verified'}]};
