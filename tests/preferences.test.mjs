import test from 'node:test';
import assert from 'node:assert/strict';
import {createLanguagePreferences,readLanguagePreference} from '../dist/preferences.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(initial=null){
 const values=new Map(initial?[['jlb-language',initial]]:[]),requests=[],changes=[],errors=[];
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const api=(path,options)=>{const pending=deferred();requests.push({path,options,...pending});return pending.promise;};
 const preferences=createLanguagePreferences({api,storage,onChange:value=>changes.push(value),onError:error=>errors.push(error)});return{preferences,requests,changes,errors,values,storage};
}
test('default is not an explicit guest choice and is not promoted to an empty account',async()=>{
 const app=fixture();assert.equal(app.preferences.preference,'zh-CN');assert.equal(app.preferences.explicit,false);assert.equal(app.values.size,0);
 const ready=app.preferences.setUser({id:'a'});assert.equal(app.requests[0].path,'/api/me/preferences');app.requests[0].resolve({preferences:{language:null}});await ready;await app.preferences.flush();assert.equal(app.requests.length,1);
});
test('legacy automatic system choice becomes Chinese, while a new explicit system choice survives reload',async()=>{
 const app=fixture('system');assert.equal(readLanguagePreference(app.storage),'zh-CN');assert.equal(app.preferences.preference,'zh-CN');assert.equal(app.preferences.explicit,false);
 await app.preferences.choose('system');assert.equal(app.preferences.preference,'system');assert.equal(readLanguagePreference(app.storage),'system');
 const next=createLanguagePreferences({storage:app.storage,api:async()=>({preferences:{language:null}})});assert.equal(next.explicit,true);assert.equal(next.preference,'system');
});
test('explicit guest language promotes once; an existing account preference wins',async()=>{
 const app=fixture('ja');const ready=app.preferences.setUser({id:'a'});app.requests[0].resolve({preferences:{language:null}});await tick();
 const write=app.requests[1];assert.equal(write.options.method,'POST');assert.equal(write.options.headers['X-Expected-User-Id'],'a');assert.deepEqual(JSON.parse(write.options.body),{language:'ja'});write.resolve({preferences:{language:'ja'}});await ready;await app.preferences.flush();
 await app.preferences.setUser(null);const other=app.preferences.setUser({id:'b'});app.requests[2].resolve({preferences:{language:'ko'}});await other;assert.equal(app.preferences.preference,'ko');assert.equal(app.values.get('jlb-language'),'ko');
 await app.preferences.setUser(null);const empty=app.preferences.setUser({id:'c'});app.requests[3].resolve({preferences:{language:null}});await empty;await app.preferences.flush();assert.equal(app.requests.length,4,'previous account language is not promoted to the next account');
});
test('saved account language wins over stored guest language without a write',async()=>{
 const app=fixture('ja'),ready=app.preferences.setUser({id:'a'});app.requests[0].resolve({preferences:{language:'en'}});await ready;assert.equal(app.preferences.preference,'en');assert.equal(app.requests.length,1);
});
test('language loaded from an account is not promoted after page reload into a different empty account',async()=>{
 const app=fixture(),ready=app.preferences.setUser({id:'a'});app.requests[0].resolve({preferences:{language:'ko'}});await ready;
 const requests=[],next=createLanguagePreferences({storage:app.storage,api:async(path,options)=>{requests.push({path,options});return{preferences:{language:null}};}});
 await next.setUser({id:'b'});await next.flush();assert.equal(requests.length,1);assert.equal(requests[0].options,undefined);
});
test('manual choice during a pending account read wins; writes remain ordered',async()=>{
 const app=fixture(),ready=app.preferences.setUser({id:'a'});const first=app.preferences.choose('ja');await tick();assert.equal(app.preferences.preference,'ja');const second=app.preferences.choose('fr-FR');
 app.requests[0].resolve({preferences:{language:'ko'}});await tick();assert.equal(app.preferences.preference,'fr-FR');assert.equal(app.requests.length,2,'second write waits for the first');
 app.requests[1].resolve({preferences:{language:'ja'}});await tick();assert.equal(app.requests.length,3);assert.deepEqual(JSON.parse(app.requests[2].options.body),{language:'fr-FR'});app.requests[2].resolve({preferences:{language:'fr-FR'}});await Promise.all([first,second,ready,app.preferences.flush()]);assert.equal(app.preferences.preference,'fr-FR');
});
test('queued writes and stale reads from a former account cannot affect a new account',async()=>{
 const app=fixture(),a=app.preferences.setUser({id:'a'});const abandoned=app.preferences.choose('ja');const b=app.preferences.setUser({id:'b'});app.requests[0].resolve({preferences:{language:'en'}});app.requests[1].resolve({preferences:{language:'ko'}});await Promise.all([a,b,abandoned,app.preferences.flush()]);assert.equal(app.preferences.preference,'ko');assert.equal(app.requests.length,2,'queued A write skipped before network');
});
test('storage denial and network failure are recoverable without unhandled rejections',async()=>{
 const denied={getItem(){throw Error('storage denied');},setItem(){throw Error('storage denied');}};assert.equal(readLanguagePreference(denied),'zh-CN');const errors=[],preferences=createLanguagePreferences({storage:denied,api:async()=>{throw Error('offline');},onError:error=>errors.push(error)});await preferences.choose('en');assert.equal(preferences.preference,'en');await preferences.setUser({id:'a'});await preferences.choose('ja');await preferences.flush();assert(errors.length>0);assert.equal(preferences.preference,'ja');
});
test('a denied localStorage property getter does not prevent default rendering',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try{Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('storage property denied');}});assert.equal(readLanguagePreference(),'zh-CN');assert.equal(createLanguagePreferences({api:async()=>({preferences:{language:null}})}).preference,'zh-CN');}
 finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});
