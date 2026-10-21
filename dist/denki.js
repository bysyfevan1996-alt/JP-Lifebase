import {createLanguagePreferences,readLanguagePreference} from './preferences.js?v=20261021114642341';
import {renderLanguageSuggestion,ensureLanguageOption} from './language-ui.js?v=20261021114642341';
import {resolveLocale} from './locale.js?v=20261021114642341';
import {dictionaries,loadDictionary} from './denki-i18n.js?v=20261021114642341';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const stored = key => {try{return localStorage.getItem(key);}catch{return null;}};
const persist = (key,value) => {try{localStorage.setItem(key,value);}catch{}};
const state = {dictionary:dictionaries['zh-CN'],language:'zh-CN',preference:readLanguagePreference(),catalog:null,areas:null,result:null,busy:false,catalogLoading:false,changed:false,languageRequest:0,catalogRequest:0,compareRequest:0};
const t = (key,values={}) => String(state.dictionary[key] ?? dictionaries.en[key] ?? key).replace(/\{(\w+)\}/g,(_,name)=>values[name] ?? `{${name}}`);
const preferences=createLanguagePreferences({api,onChange:value=>changeLanguage(value),onError:()=>{const host=$('#translation-notice');host.hidden=false;host.textContent=t('preferenceSaveError');}});
const number = (value,max=2) => {const numeric=Number(value);if(!Number.isFinite(numeric))return '—';try{return new Intl.NumberFormat(state.language,{maximumFractionDigits:max}).format(numeric);}catch{return String(numeric);}};
const money = value => `${number(value)} ${t('yen')}`;
const signedMoney = value => `${Number(value)>0?'+':''}${money(value)}`;
const safeUrl = value => {try{const url=new URL(value);return url.protocol==='https:'?url.href:'#';}catch{return '#';}};
const selectedMonth = () => state.catalog?.months.find(month=>month.id===$('#month').value);
const availablePlans = () => {const ids=selectedMonth()?.plans||[];return state.catalog?.plans.filter(plan=>plan.status==='available'&&ids.includes(plan.id))||[];};

async function api(path,options={}) {
  let response;
  try{response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});}catch{throw Object.assign(new Error('network'),{code:'network'});}
  let data;
  try{data=await response.json();}catch{throw Object.assign(new Error('invalid_response'),{code:'network'});}
  if(!response.ok)throw Object.assign(new Error(data.error||'request_failed'),{code:data.code||data.error,status:response.status});
  return data;
}

function renderAreas() {
  const select=$('#area'),previous=select.value;
  const areas=state.catalog?.areas||state.areas;
  const areaLabel=area=>area.labelKey&&(state.dictionary[area.labelKey]!==undefined||dictionaries.en[area.labelKey]!==undefined)?t(area.labelKey):area.name||area.id;
  if(areas){
    const available=areas.filter(area=>area.status==='available');
    select.innerHTML=`<option value="" data-i18n="selectPrompt">${escape(t('selectPrompt'))}</option>`+available.map(area=>`<option value="${escape(area.id)}">${escape(areaLabel(area))}</option>`).join('');
    select.value=available.some(area=>area.id===previous)?previous:'';
  }
  const selected=areas?.find(area=>area.id===select.value);
  $('.scope').textContent=selected?areaLabel(selected):select.value==='tokyo'?t('tokyo'):select.value;
  $('.scope').hidden=!select.value;
}

function applyText() {
  document.documentElement.lang=state.language;
  document.title=`${t('title')} · Japan Life Base`;
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));
  document.querySelectorAll('[data-i18n]').forEach(element=>{if(!element.matches('.scope, #area option'))element.textContent=t(element.dataset.i18n);});
  ensureLanguageOption($('#language'),state.preference,state.language);$('#language').value=state.preference;
  renderLanguageSuggestion($('#language-suggestion'),{preferences,language:state.language,languages:navigator.languages,t,onChoose:value=>preferences.choose(value)});
  $('#language option[value="system"]').textContent=t('system');
  renderAreas();
  updateCoverage();
  if(state.catalog)refreshPlans();
  if(state.result)renderResults();
  else {if(state.catalog)$('#results').innerHTML=emptyState();renderPending();}
  updateBusy();
}

async function changeLanguage(preference) {
  const sequence=++state.languageRequest;
  const resolved=resolveLocale(preference,navigator.languages||[navigator.language]);
  state.preference=preference;
  state.language=resolved.language;
  state.dictionary=dictionaries[resolved.source]||dictionaries.en;
  const notice=$('#translation-notice');
  notice.hidden=!resolved.automatic;
  notice.textContent=resolved.automatic?dictionaries.en.translationLoading:'';
  applyText();
  if(!resolved.automatic)return;
  try {
    const result=await loadDictionary(resolved.language);
    if(sequence!==state.languageRequest)return;
    state.dictionary=result.dictionary;
    applyText();
    notice.textContent=t('machineNotice');
  }catch{
    if(sequence!==state.languageRequest)return;
    state.dictionary=dictionaries.en;
    document.documentElement.lang='en';
    applyText();
    document.documentElement.lang='en';
    notice.textContent=dictionaries.en.translationUnavailable;
  }
}

function updateCoverage() {
  if(!state.catalog){$('#coverage').textContent='';$('#month-window').textContent='';return;}
  let date=state.catalog.checkedAt||'—';
  const stamp=new Date(date);
  if(Number.isFinite(stamp.getTime()))try{date=new Intl.DateTimeFormat(state.language,{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tokyo'}).format(stamp);}catch{}
  $('#coverage').textContent=t('coverage',{count:state.catalog.months.length,date});
  $('#month-window').textContent=state.catalog.window?t('windowHelp',{from:state.catalog.window.from,to:state.catalog.window.to}):'';
  $('#dataset-link').href=`/api/denki/dataset?version=${encodeURIComponent(state.catalog.version)}`;
}

function refreshPlans() {
  const previous=$('#current-plan').value;
  const available=availablePlans();
  const availableIds=new Set(available.map(plan=>plan.id));
  $('#current-plan').innerHTML=`<option value="" data-i18n="selectPrompt">${escape(t('selectPrompt'))}</option>`+(state.catalog?.plans||[]).map(plan=>`<option value="${escape(plan.id)}"${availableIds.has(plan.id)?'':' disabled'}>${escape(`${plan.name} · ${plan.provider}${availableIds.has(plan.id)?'':` (${t('pending')})`}`)}</option>`).join('');
  $('#current-plan').value=availableIds.has(previous)?previous:'';
  $('#current-plan').disabled=!available.length;
  refreshAmps();
  if(!state.result)renderPending();
}

function refreshDays() {
  const available=availablePlans(),needsDays=available.some(plan=>plan.needsDays);
  $('#days-field').hidden=!needsDays;
  $('#days').disabled=!needsDays;
  $('#days').required=!!available.find(plan=>plan.id===$('#current-plan').value)?.needsDays;
}

function refreshAmps() {
  const previous=$('#amps').value;
  const plan=availablePlans().find(item=>item.id===$('#current-plan').value);
  const monthly=plan?selectedMonth()?.capacityAmpsByPlan?.[plan.id]:undefined;
  const capacities=plan?(Array.isArray(monthly)?monthly:plan.capacityAmps||[]):[];
  $('#amps').innerHTML=`<option value="" data-i18n="selectPrompt">${escape(t('selectPrompt'))}</option>`+capacities.map(amps=>`<option value="${escape(amps)}">${escape(amps)} A</option>`).join('');
  $('#amps').value=previous&&capacities.includes(Number(previous))?previous:'';
  $('#amps').disabled=!capacities.length;
  refreshDays();
  updateBusy();
}

function updateBusy() {
  $('#compare-button').disabled=state.busy||state.catalogLoading||!state.catalog||state.catalog.area!==$('#area').value||!$('#month').value||!$('#current-plan').value||!availablePlans().length||$('#amps').disabled||!$('#amps').value;
  $('#compare-button').textContent=t(state.busy?'comparing':'compare');
  $('#compare-form').setAttribute('aria-busy',String(state.busy||state.catalogLoading));
}

async function loadCatalog() {
  const sequence=++state.catalogRequest,area=$('#area').value,previous=$('#month').value;
  ++state.compareRequest;
  state.catalog=null;state.result=null;state.busy=false;state.catalogLoading=true;state.changed=false;
  $('#days-field').hidden=true;$('#days').disabled=true;$('#days').required=false;
  for(const selector of ['#month','#current-plan','#amps'])$(selector).disabled=true;
  $('#form-error').hidden=true;
  $('#result-count').textContent='';
  $('#result-context').hidden=true;$('#result-context').textContent='';$('#result-context').classList.remove('changed');
  $('#pending-section').hidden=true;$('#pending-list').innerHTML='';
  $('#results').innerHTML=`<div class="loading-dots">${escape(t('loading'))}</div>`;
  updateCoverage();updateBusy();
  try {
    // An empty selection requests discovery only; it never selects an area.
    const data=await api(area?`/api/denki/catalog?area=${encodeURIComponent(area)}`:'/api/denki/catalog');
    if(sequence!==state.catalogRequest||$('#area').value!==area)return;
    if((area&&data.area!==area)||!Array.isArray(data.areas)||!data.areas.some(item=>item.id===(area||data.area)&&item.status==='available')||!Array.isArray(data.months)||!data.months.length||!Array.isArray(data.plans))throw new Error('empty_catalog');
    state.catalog=data;
    state.areas=data.areas;
    renderAreas();
    $('#month').innerHTML=`<option value="" data-i18n="selectPrompt">${escape(t('selectPrompt'))}</option>`+data.months.map(month=>`<option value="${escape(month.id)}">${escape(month.label||month.id)}</option>`).join('');
    $('#month').value=area&&data.months.some(month=>month.id===previous)?previous:'';
    $('#month').disabled=!area;
    refreshPlans();
    updateCoverage();
    $('#results').innerHTML=emptyState();
  }catch{
    if(sequence!==state.catalogRequest||$('#area').value!==area)return;
    state.catalog=null;
    for(const selector of ['#month','#current-plan','#amps'])$(selector).disabled=true;
    updateCoverage();
    $('#results').innerHTML=`<div class="error-state">${escape(t('loadError'))}<br><button class="retry" type="button" id="catalog-retry">${escape(t('retry'))}</button></div>`;
    $('#catalog-retry').onclick=loadCatalog;
  }finally{
    if(sequence===state.catalogRequest){state.catalogLoading=false;updateBusy();}
  }
}

function changeArea() {
  ++state.compareRequest;state.busy=false;
  for(const selector of ['#month','#current-plan','#amps']){const element=$(selector);element.innerHTML='';element.value='';}
  return loadCatalog();
}

function emptyState() {
  return `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">↔</span><h3>${escape(t('emptyTitle'))}</h3><p>${escape(t('emptyBody'))}</p></div>`;
}

function markChanged() {
  $('#form-error').hidden=true;
  updateBusy();
  if(!state.result)return;
  state.changed=true;
  $('#result-context').textContent=t('updatedInputs');
  $('#result-context').classList.add('changed');
}

function inputFingerprint() {
  return JSON.stringify(['#area','#month','#current-plan','#amps','#kwh','#bill','#days'].map(selector=>$(selector).value).concat($('#full-cycle').checked));
}

function readInput() {
  const usage=$('#kwh').value.trim(),bill=$('#bill').value.trim();
  if(!usage||!Number.isInteger(Number(usage))||Number(usage)<1||Number(usage)>10000)throw new Error('invalid_kwh');
  if(!$('#full-cycle').checked)throw new Error('full_cycle_required');
  if(bill&&(!Number.isInteger(Number(bill))||Number(bill)<0||Number(bill)>10000000))throw new Error('invalid_bill');
  const amps=Number($('#amps').value);
  if($('#amps').disabled||!Number.isInteger(amps)||!$('#amps').value)throw new Error('invalid_amps');
  const input={area:$('#area').value,billingMonth:$('#month').value,currentPlanId:$('#current-plan').value,amps,capacity:{type:'amp',value:amps},kwh:Number(usage),fullCycle:true};
  if(bill)input.actualBillYen=Number(bill);
  if(!$('#days-field').hidden){
    const value=$('#days').value.trim();
    const required=availablePlans().find(plan=>plan.id===input.currentPlanId)?.needsDays;
    if(!value&&required)throw new Error('days_required');
    if(value){const days=Number(value);if(!Number.isSafeInteger(days)||days<1||days>62)throw new Error('invalid_days');input.days=days;}
  }
  return input;
}

function showError(key) {
  $('#form-error').textContent=t(dictionaries.en[key]!==undefined?key:'calcError');
  $('#form-error').hidden=false;
}

async function compare(event) {
  event.preventDefault();
  if(state.busy||state.catalogLoading||!state.catalog||state.catalog.area!==$('#area').value||!availablePlans().length||$('#amps').disabled)return;
  let input;
  try{input=readInput();}catch(error){showError(error.message);return;}
  const fingerprint=inputFingerprint();
  $('#form-error').hidden=true;
  state.busy=true;
  updateBusy();
  const sequence=++state.compareRequest;
  try {
    const result=await api('/api/denki/compare',{method:'POST',body:JSON.stringify({...input,version:state.catalog.version})});
    if(sequence!==state.compareRequest)return;
    state.result={...result,input:{...input,...result.input}};
    state.changed=inputFingerprint()!==fingerprint;
    renderResults();
    if(matchMedia('(max-width:900px)').matches)$('#comparison').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){if(sequence===state.compareRequest)showError(error.code||error.message);}
  finally{if(sequence===state.compareRequest){state.busy=false;updateBusy();}}
}

function deltaMarkup(plan,baselineId) {
  if(plan.planId===baselineId)return `<span class="plan-delta">${escape(t('baseline'))}</span>`;
  const delta=Number(plan.deltaYen);
  if(!Number.isFinite(delta))return '';
  return `<span class="plan-delta${delta<0?' saving':''}">${escape(delta===0?t('same'):t(delta<0?'cheaper':'dearer',{amount:money(Math.abs(delta))}))}</span>`;
}

function formula(line) {
  if(line.detail==='daily_base'&&Number.isFinite(Number(line.rateYen))&&Number.isSafeInteger(line.days))return `${number(line.rateYen)} ${t('dayRateUnit')} × ${number(line.days)} ${t('dayUnit')}`;
  const terms=[];
  if(line.rateYen!==undefined&&Number.isFinite(Number(line.rateYen)))terms.push(`${number(line.rateYen,5)} ${t('rateUnit')}`);
  if(line.kwh!==undefined&&Number.isFinite(Number(line.kwh)))terms.push(`${number(line.kwh)} kWh`);
  if(terms.length)return terms.join(' × ');
  return '';
}

function detailMarkup(plan) {
  const rows=(plan.breakdown||[]).map(line=>{const band=line.key==='tier'&&line.fromKwh!==undefined?` (${number(line.fromKwh)}${line.toKwh===null||line.toKwh===undefined?'+':`–${number(line.toKwh)}`} kWh)`:'';return `<tr><td>${escape(t(line.detail==='zero_total_floor'?'zeroTotalFloor':line.key)+band)}${formula(line)?`<span class="line-formula">${escape(formula(line))}</span>`:''}</td><td>${escape(money(line.amountYen))}</td></tr>`;}).join('');
  const rounding=Number(plan.roundingAdjustmentYen);
  const roundingRow=Number.isFinite(rounding)&&rounding!==0?`<tr><td>${escape(t('roundingAdjustment'))}</td><td>${escape(money(rounding))}</td></tr>`:'';
  const notes=(plan.assumptions||[]).map(key=>key==='standard_cycle'?t('standardCycle'):key==='no_optional_discounts'?t('noOptionalDiscounts'):key==='actual_billing_days'?t('actualBillingDays'):null).filter(Boolean);
  if(plan.rounding==='floor_yen_total_renewable_separate')notes.push(t('rounding'));
  return `<div class="breakdown"><table class="line-table"><tbody>${rows}${roundingRow}<tr class="total"><td>${escape(t('total'))}</td><td>${escape(money(plan.totalYen))}</td></tr></tbody></table>${notes.length?`<ul class="notes">${notes.map(note=>`<li>${escape(note)}</li>`).join('')}</ul>`:''}<div class="source-list"><strong class="muted">${escape(t('officialSources'))}</strong>${(plan.sources||[]).map(source=>`<a href="${escape(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">${escape(source.title||source.id)} ↗</a>`).join('')}</div><div class="source-meta">${escape(t('sourceNote'))}</div><div class="source-meta">${escape(t('tariffVersion',{version:plan.tariffVersion||state.result.version}))}</div></div>`;
}

function renderResults() {
  const result=state.result;
  if(!result)return;
  const plans=[...(result.results||[])].sort((a,b)=>a.totalYen-b.totalYen||String(a.planId).localeCompare(String(b.planId)));
  const input=result.input;
  $('#result-count').textContent=t('resultCount',{count:plans.length});
  $('#result-context').hidden=false;
  $('#result-context').textContent=state.changed?t('updatedInputs'):t('resultContext',{month:input.billingMonth,amps:input.amps,kwh:number(input.kwh)})+(input.days===undefined?'':t('resultDays',{days:input.days}));
  $('#result-context').classList.toggle('changed',state.changed);
  let reconciliation='';
  if(result.reconciliation){const check=result.reconciliation;reconciliation=`<div class="bill-check"><strong>${escape(t('reconciliation'))}</strong><div>${escape(t('actualAmount'))} ${escape(money(check.actualBillYen))} · ${escape(t('calculatedAmount'))} ${escape(money(check.calculatedYen))}</div><div>${escape(t('billDifference',{amount:signedMoney(check.calculatedYen-check.actualBillYen)}))}</div><div class="source-meta">${escape(t('billCheckHelp'))}</div></div>`;}
  $('#results').innerHTML=reconciliation+(plans.length?`<p class="muted">${escape(t('estimated'))} · ${escape(t('currencyNote'))}</p><div class="result-list">${plans.map((plan,index)=>`<details class="plan-card${index===0?' best':''}"><summary><span class="rank">${index+1}</span><div class="plan-name">${escape(plan.name)}${plan.planId===result.baselineId?`<span class="baseline-badge">${escape(t('current'))}</span>`:''}<span class="provider">${escape(plan.provider)}</span></div><div class="plan-price"><strong>${escape(number(plan.totalYen))}</strong><span class="currency">${escape(t('yen'))}</span>${deltaMarkup(plan,result.baselineId)}</div><span class="summary-hint"><span>${escape(t('details'))}</span><span class="arrow" aria-hidden="true">⌄</span></span></summary>${detailMarkup(plan)}</details>`).join('')}</div>`:`<div class="empty-state"><p>${escape(t('noResults'))}</p></div>`);
  renderPending(result.excluded||[]);
}

function renderPending(excluded=null) {
  if(!state.catalog)return;
  if(!excluded&&(!$('#area').value||!$('#month').value)){$('#pending-section').hidden=true;$('#pending-list').innerHTML='';return;}
  const availableIds=new Set(availablePlans().map(plan=>plan.id));
  const plans=excluded??state.catalog.plans.filter(plan=>!availableIds.has(plan.id)).map(plan=>({...plan,planId:plan.id,reasonCode:plan.status==='pending'?'pending_rules':'missing_month'}));
  $('#pending-section').hidden=!plans.length;
  $('#pending-list').innerHTML=plans.map(plan=>{const reason=state.catalog.exclusions?.find(e=>e.planId===plan.planId&&(!e.month||e.month===(excluded?state.result.input.billingMonth:$('#month').value)))?.reason||plan.reasonCode;const label=reason==='historical_terms_unavailable'?'historicalTermsMissing':reason==='daily_billing_and_fuel_not_verified'?'dailyRulesMissing':reason==='missing_month'?'missingMonth':reason==='capacity_not_supported'?'capacityNotSupported':reason==='days_required'?'daysRequired':reason==='launch_month_full_cycle_unverified'?'firstFullCycle':'pendingRules';return `<div class="pending-item"><div><strong>${escape(plan.provider)} · ${escape(plan.name)}</strong><small>${escape(t(label))}</small></div><span class="status-badge">${escape(t(reason==='days_required'?'inputNeeded':'pending'))}</span></div>`;}).join('');
}

$('#language').onchange=event=>preferences.choose(event.target.value);
$('#area').onchange=changeArea;
$('#month').onchange=()=>{refreshPlans();markChanged();};
$('#current-plan').onchange=()=>{refreshAmps();markChanged();};
$('#amps').onchange=markChanged;
$('#compare-form').addEventListener('input',markChanged);
$('#compare-form').addEventListener('submit',compare);
window.addEventListener('storage',event=>{if(event.key==='jlb-language')preferences.choose(event.newValue||'zh-CN');});
function resetInputs(){
  for(const selector of ['#area','#month','#current-plan','#amps','#kwh','#bill','#days'])$(selector).value='';
  $('#full-cycle').checked=false;
}
resetInputs();
window.addEventListener('pageshow',event=>{if(event.persisted){resetInputs();loadCatalog();}});
await Promise.all([changeLanguage(state.preference),loadCatalog()]);
api('/api/session').then(result=>preferences.setUser(result.user||null)).catch(()=>{});
