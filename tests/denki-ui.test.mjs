import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {dictionaries} from '../dist/denki-i18n.js';

// Run the actual controller against a small DOM and deferred network. The
// controller is not copied into the test and no production module is modified.
const source=(await readFile(new URL('../dist/denki.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'')
  .replace("api('/api/session').then(result=>preferences.setUser(result.user||null)).catch(()=>{});",'')
  .replace('await Promise.all([changeLanguage(state.preference),loadCatalog()]);','globalThis.controller={state,loadCatalog,changeArea,refreshPlans,refreshAmps,readInput,compare,applyText,renderPending,resetInputs};');

class Element {
  constructor({select=false,value='',hidden=false}={}){
    this.select=select;this._value=value;this.options=[];this.disabled=false;this.hidden=hidden;this.checked=false;this.textContent='';this.dataset={};this.attributes={};this.listeners={};this._html='';
    const classes=new Set();this.classList={add:value=>classes.add(value),remove:value=>classes.delete(value),toggle:(value,yes)=>yes?classes.add(value):classes.delete(value)};
  }
  get value(){return this._value;}
  set value(value){this._value=String(value);}
  get innerHTML(){return this._html;}
  set innerHTML(value){
    this._html=value;
    if(this.select){
      this.options=[...value.matchAll(/<option value="([^"]*)"([^>]*)>(.*?)<\/option>/gs)].map(([,id,attrs,label])=>({value:id,disabled:attrs.includes('disabled'),textContent:label}));
      this._value=this.options[0]?.value||'';
    }
  }
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(name,handler){this.listeners[name]=handler;}
  matches(){return false;}
  scrollIntoView(){}
}

function launch(){
  const nodes=new Map();
  for(const id of ['area','language','month','current-plan','amps'])nodes.set('#'+id,new Element({select:true}));
  for(const id of ['coverage','month-window','dataset-link','compare-button','compare-form','form-error','result-count','result-context','pending-section','pending-list','results','days-field','days','kwh','bill','full-cycle','comparison','catalog-retry','translation-notice','language-suggestion'])nodes.set('#'+id,new Element());
  nodes.set('.scope',new Element());nodes.set('#language option[value="system"]',new Element());
  nodes.get('#area').value='tokyo';nodes.get('#kwh').value='260';nodes.get('#full-cycle').checked=true;nodes.get('#days-field').hidden=true;nodes.get('#form-error').hidden=true;
  const requests=[];
  const context={createLanguagePreferences:()=>({preference:'zh-CN',explicit:false,choose(){},setUser:async()=>{}}),readLanguagePreference:()=> 'zh-CN',renderLanguageSuggestion(){},ensureLanguageOption(){},dictionaries,loadDictionary:async()=>({dictionary:dictionaries.en}),resolveLocale:()=>({language:'en',source:'en',automatic:false}),Intl,URL,console,
    document:{documentElement:{lang:'en'},querySelector:selector=>{assert(nodes.has(selector),'Unexpected DOM selector '+selector);return nodes.get(selector);},querySelectorAll:()=>[],title:''},
    localStorage:{getItem:()=>null,setItem(){}},navigator:{languages:['en']},window:{addEventListener(){}},matchMedia:()=>({matches:false}),
    fetch:(path,options)=>new Promise((resolve,reject)=>requests.push({path,options,reply:(data,status=200)=>resolve({ok:status<400,status,json:async()=>data}),reject}))};
  runInNewContext(source,context,{filename:'denki.js'});
  context.controller.state.dictionary=dictionaries.en;
  nodes.get('#area').value='tokyo';nodes.get('#kwh').value='260';nodes.get('#full-cycle').checked=true;
  return {ui:context.controller,nodes,requests};
}

function catalog(area='tokyo',{capacities=[10,30],mapping=capacities,planId='plan'}={}){
  const areas=[{id:'tokyo',labelKey:'tokyo',status:'available'},{id:'chubu',name:'中部電力エリア',status:'available'}];
  return {version:'test-v3',checkedAt:'2026-10-20',area,areas,months:[{id:'2026-10',plans:[planId],capacityAmpsByPlan:{[planId]:mapping}}],plans:[{id:planId,name:'Test plan',provider:'Test provider',capacityAmps:capacities,status:'available',needsDays:false}],exclusions:[]};
}

async function load(app,data=catalog()){
  app.nodes.get('#area').value=data.area;
  const promise=app.ui.loadCatalog();app.requests.at(-1).reply(data);await promise;
  choose(app);
}

function choose(app){
  app.nodes.get('#month').value='2026-10';app.ui.refreshPlans();
  app.nodes.get('#current-plan').value=app.ui.state.catalog.plans[0].id;app.ui.refreshAmps();
  app.nodes.get('#amps').value='30';app.ui.refreshAmps();
}

test('initial fields and discovery remain empty without selecting a supplier, month, capacity or sample usage',async()=>{
  const app=launch();app.ui.resetInputs();
  const promise=app.ui.loadCatalog();assert.equal(app.requests.at(-1).path,'/api/denki/catalog');
  app.requests.at(-1).reply(catalog());await promise;
  for(const id of ['area','month','current-plan','amps','kwh','bill','days'])assert.equal(app.nodes.get('#'+id).value,'',id);
  assert.equal(app.nodes.get('#full-cycle').checked,false);assert.equal(app.nodes.get('#compare-button').disabled,true);
  assert.equal(app.nodes.get('#pending-section').hidden,true);
  app.ui.applyText();
  for(const id of ['area','month','current-plan','amps'])assert.equal(app.nodes.get('#'+id).value,'',id+' after translation');
  const n=app.requests.length;await app.ui.compare({preventDefault(){}});assert.equal(app.requests.length,n);
  app.nodes.get('#area').value='tokyo';const selected=app.ui.changeArea();app.requests.at(-1).reply(catalog());await selected;
  assert.equal(app.nodes.get('#month').value,'');assert.equal(app.nodes.get('#current-plan').value,'');assert.equal(app.nodes.get('#amps').value,'');
  app.nodes.get('#month').value='2026-10';app.ui.refreshPlans();assert.equal(app.nodes.get('#current-plan').value,'');
  app.nodes.get('#current-plan').value='plan';app.ui.refreshAmps();assert.equal(app.nodes.get('#amps').value,'');
  assert.equal(app.nodes.get('#compare-button').disabled,true);
  for(const locale of ['ja','en','zh-CN','zh-TW','ko'])assert.equal(typeof dictionaries[locale].selectPrompt,'string');
});

test('monthly capacity overrides legacy values, including an empty verified capacity list',async()=>{
  const app=launch();await load(app,catalog('tokyo',{mapping:[20,30]}));
  assert.equal(app.nodes.get('#amps').value,'30');
  assert.deepEqual(app.nodes.get('#amps').options.map(option=>option.value),['','20','30']);
  app.ui.state.catalog.months[0].capacityAmpsByPlan.plan=[];app.ui.refreshAmps();
  assert.equal(app.nodes.get('#amps').disabled,true);assert.equal(app.nodes.get('#amps').value,'');
  assert.equal(app.nodes.get('#compare-button').disabled,true);
  delete app.ui.state.catalog.months[0].capacityAmpsByPlan;app.ui.refreshAmps();
  assert.deepEqual(app.nodes.get('#amps').options.map(option=>option.value),['','10','30']);
});

test('failed catalog reload discards its previous usable catalog and disables submission',async()=>{
  const app=launch();await load(app);app.ui.state.result={old:true};
  const promise=app.ui.loadCatalog();
  assert.equal(app.ui.state.catalog,null);assert.equal(app.ui.state.result,null);
  assert.equal(app.nodes.get('#compare-button').disabled,true);assert.equal(app.nodes.get('#month').disabled,true);
  app.requests.at(-1).reject(new Error('offline'));await promise;
  assert.equal(app.ui.state.catalog,null);assert.equal(app.nodes.get('#compare-button').disabled,true);
  assert.equal(app.nodes.get('#kwh').value,'260');
  const requestCount=app.requests.length;await app.ui.compare({preventDefault(){}});assert.equal(app.requests.length,requestCount);
  assert(app.nodes.get('#results').innerHTML.includes('Could not load'));
});

test('late catalog success and failure cannot replace a newer selected-area catalog',async()=>{
  for(const failOld of [false,true]){
    const app=launch();const first=app.ui.loadCatalog();
    app.nodes.get('#area').value='chubu';const second=app.ui.changeArea();
    assert.equal(app.requests[0].path,'/api/denki/catalog?area=tokyo');assert.equal(app.requests[1].path,'/api/denki/catalog?area=chubu');
    app.requests[1].reply(catalog('chubu'));await second;
    if(failOld)app.requests[0].reject(new Error('late failure'));else app.requests[0].reply(catalog('tokyo'));
    await first;
    assert.equal(app.ui.state.catalog.area,'chubu');assert.equal(app.nodes.get('#area').value,'chubu');
    assert.equal(app.nodes.get('.scope').textContent,'中部電力エリア');assert.equal(app.nodes.get('#compare-button').disabled,true);
    app.ui.applyText();assert.equal(app.nodes.get('.scope').textContent,'中部電力エリア');
  }
});

test('comparison sends the selected area and typed amp capacity; stale errors remain hidden',async()=>{
  const app=launch();await load(app,catalog('chubu'));app.nodes.get('#bill').value='9000';
  const oldCompare=app.ui.compare({preventDefault(){}});const compareRequest=app.requests.at(-1);
  const sent=JSON.parse(compareRequest.options.body);
  assert.equal(sent.area,'chubu');assert.equal(sent.amps,30);assert.deepEqual(sent.capacity,{type:'amp',value:30});assert.equal(sent.actualBillYen,9000);
  app.nodes.get('#area').value='tokyo';const next=app.ui.changeArea();
  assert.equal(app.nodes.get('#month').value,'');assert.equal(app.nodes.get('#current-plan').value,'');
  app.requests.at(-1).reply(catalog('tokyo'));await next;
  compareRequest.reply({error:'invalid_amps'},400);await oldCompare;
  assert.equal(app.nodes.get('#form-error').hidden,true);assert.equal(app.ui.state.result,null);
  assert.equal(app.ui.state.catalog.area,'tokyo');assert.equal(app.ui.state.busy,false);
  assert.equal(app.nodes.get('#bill').value,'9000');assert.equal(app.nodes.get('#compare-button').disabled,true);
});

test('stale successful comparisons cannot render old-area results after selection changes',async()=>{
  const app=launch();await load(app);
  const oldCompare=app.ui.compare({preventDefault(){}}),request=app.requests.at(-1);
  app.nodes.get('#area').value='chubu';const next=app.ui.changeArea();app.requests.at(-1).reply(catalog('chubu'));await next;
  request.reply({input:{area:'tokyo'},results:[],excluded:[]});await oldCompare;
  assert.equal(app.ui.state.result,null);assert.equal(app.ui.state.catalog.area,'chubu');
  assert.equal(app.nodes.get('#result-context').hidden,true);
});

test('an old comparison finally cannot unlock a newer comparison in progress',async()=>{
  const app=launch();await load(app);
  const oldCompare=app.ui.compare({preventDefault(){}}),oldRequest=app.requests.at(-1);
  app.nodes.get('#area').value='chubu';const next=app.ui.changeArea();app.requests.at(-1).reply(catalog('chubu'));await next;
  choose(app);
  const newCompare=app.ui.compare({preventDefault(){}}),newRequest=app.requests.at(-1);
  assert.equal(app.ui.state.busy,true);
  oldRequest.reply({error:'invalid_amps'},400);await oldCompare;
  assert.equal(app.ui.state.busy,true);assert.equal(app.nodes.get('#compare-button').disabled,true);assert.equal(app.nodes.get('#form-error').hidden,true);
  newRequest.reply({input:{area:'chubu',billingMonth:'2026-10',amps:30,kwh:260},results:[],excluded:[]});await newCompare;
  assert.equal(app.ui.state.busy,false);assert.equal(app.nodes.get('#compare-button').disabled,false);
  assert.equal(app.ui.state.result.input.area,'chubu');
});

test('catalogs for another area fail closed and unsupported capacity reasons are readable',async()=>{
  const app=launch();const pending=app.ui.loadCatalog();app.requests.at(-1).reply(catalog('chubu'));await pending;
  assert.equal(app.ui.state.catalog,null);assert.equal(app.nodes.get('#compare-button').disabled,true);
  await load(app);app.ui.state.result={input:{billingMonth:'2026-10'}};
  app.ui.renderPending([{planId:'limited',provider:'Provider',name:'Limited',reasonCode:'capacity_not_supported'}]);
  assert(app.nodes.get('#pending-list').innerHTML.includes(dictionaries.en.capacityNotSupported));
  for(const locale of ['ja','en','zh-CN','zh-TW','ko'])assert.equal(typeof dictionaries[locale].capacityNotSupported,'string');
});

function dailyCatalog(){
 const data=catalog();
 data.plans.push({id:'octopus-green',provider:'オクトパスエナジー',name:'グリーンオクトパス 2025-05（東京）',needsDays:true,status:'available',capacityAmps:[10,30]});
 data.months[0].plans.push('octopus-green');data.months[0].capacityAmpsByPlan['octopus-green']=[10,30];
 return data;
}

test('daily candidates never supply a default day count and only daily baselines require it',async()=>{
 const app=launch();await load(app,dailyCatalog());
 assert.equal(app.nodes.get('#days-field').hidden,false);
 assert.equal(app.nodes.get('#days').value,'');assert.equal(app.nodes.get('#days').required,false);
 assert.equal(Object.hasOwn(app.ui.readInput(),'days'),false);
 app.nodes.get('#current-plan').value='octopus-green';app.ui.refreshAmps();
 assert.equal(app.nodes.get('#days').required,true);
 assert.throws(()=>app.ui.readInput(),/days_required/);
 app.nodes.get('#days').value='31';assert.equal(app.ui.readInput().days,31);
 app.ui.applyText();assert.equal(app.nodes.get('#days').value,'31');assert.equal(app.nodes.get('#days').required,true);
 for(const days of ['0','63','1.5','-1']){app.nodes.get('#days').value=days;assert.throws(()=>app.ui.readInput(),/invalid_days/);}
 app.nodes.get('#current-plan').value='plan';app.ui.refreshAmps();app.nodes.get('#days').value='';
 assert.equal(app.nodes.get('#days').required,false);assert.equal(Object.hasOwn(app.ui.readInput(),'days'),false);
 app.ui.resetInputs();assert.equal(app.nodes.get('#days').value,'');
});

test('daily context and base formula survive calculation, and missing days show a specific explanation',async()=>{
 const app=launch();await load(app,dailyCatalog());app.nodes.get('#days').value='31';
 const promise=app.ui.compare({preventDefault(){}}),request=app.requests.at(-1);
 assert.equal(JSON.parse(request.options.body).days,31);
 request.reply({version:'test',baselineId:'plan',input:{area:'tokyo',billingMonth:'2026-10',amps:30,kwh:260,days:31},results:[{planId:'octopus-green',name:'Green',provider:'Octopus',totalYen:8484,deltaYen:209,breakdown:[{key:'base',detail:'daily_base',rateYen:29.1,days:31,amountYen:902.1}],assumptions:['actual_billing_days']}],excluded:[]});
 await promise;
 assert(app.nodes.get('#result-context').textContent.includes('31 days'));
 assert(app.nodes.get('#results').innerHTML.includes('JPY/day'));
 assert(app.nodes.get('#results').innerHTML.includes('31 days'));
 app.ui.renderPending([{planId:'octopus-green',name:'Green',provider:'Octopus',reasonCode:'days_required'}]);
 assert(app.nodes.get('#pending-list').innerHTML.includes(dictionaries.en.daysRequired));
 for(const language of ['en','ja','zh-CN','zh-TW','ko']){
  for(const key of ['daysRequired','days_required','dayRateUnit','dayUnit','resultDays','actualBillingDays','firstFullCycle','planHelp'])assert.equal(typeof dictionaries[language][key],'string',language+':'+key);
 }
 const reload=app.ui.loadCatalog();assert.equal(app.nodes.get('#days-field').hidden,true);assert.equal(app.nodes.get('#days').required,false);
 app.requests.at(-1).reject(new Error('offline'));await reload;
 assert.equal(app.nodes.get('#days-field').hidden,true);
});
