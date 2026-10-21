export function normalizeLanguage(value){
 if(typeof value!=='string'||!value.trim())return 'zh-CN';
 try{const tag=Intl.getCanonicalLocales(value.trim())[0];if(!tag)return 'zh-CN';const locale=new Intl.Locale(tag),base=locale.language;if(base==='ja'||base==='en')return base;if(base==='zh')return locale.script==='Hant'||['TW','HK','MO'].includes(locale.region)?'zh-TW':'zh-CN';if(base==='ko')return 'ko';return tag;}catch{return 'zh-CN';}
}
export function resolveLocale(preference='zh-CN',languages=[]){
 const chosen=preference==='system'?(Array.isArray(languages)?languages.find(item=>typeof item==='string'&&item.trim()):null):preference;
 const language=normalizeLanguage(chosen),manual=['ja','en','zh-CN','zh-TW','ko'].includes(language);return {language,source:manual?language:'en',automatic:!manual};
}
// M1 translates interface strings only. Seed content still has five maintained
// versions; other interface languages must not trigger bulk UGC translation.
export function communityContentLanguage(language,original=false){
 if(original)return 'original';
 const resolved=resolveLocale(language);
 return resolved.automatic?'original':resolved.language;
}
export function relativeTime(iso,language,now=Date.now()){
 const stamp=Date.parse(iso);if(!Number.isFinite(stamp)||!Number.isFinite(now))return '';
 const minutes=(stamp-now)/60000,absolute=Math.abs(minutes);let divisor=1,unit='minute';
 if(absolute>=60*24*365){divisor=60*24*365;unit='year';}else if(absolute>=60*24*30){divisor=60*24*30;unit='month';}else if(absolute>=60*24){divisor=60*24;unit='day';}else if(absolute>=60){divisor=60;unit='hour';}
 try{return new Intl.RelativeTimeFormat(normalizeLanguage(language),{numeric:'auto'}).format(Math.round(minutes/divisor),unit);}catch{return '';}
}
