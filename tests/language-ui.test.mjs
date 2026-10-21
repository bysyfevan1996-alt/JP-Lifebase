import test from 'node:test';
import assert from 'node:assert/strict';
import {renderLanguageSuggestion,ensureLanguageOption} from '../dist/language-ui.js';
class Element{
 constructor(){this.children=[];this.hidden=true;this.textContent='';}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 get options(){return this.children;}
}
test('browser language is suggested, never applied until the visitor clicks',()=>{
 const previous=globalThis.document,host=new Element(),choices=[];globalThis.document={createElement:()=>new Element()};
 try{
  renderLanguageSuggestion(host,{preferences:{explicit:false},language:'zh-CN',languages:['ja-JP'],t:(key,{language}={})=>key+(language||''),onChoose:language=>choices.push(language)});
  assert.equal(host.hidden,false);assert.equal(host.children.length,2);assert.deepEqual(choices,[]);host.children[1].onclick();assert.deepEqual(choices,['ja']);
  renderLanguageSuggestion(host,{preferences:{explicit:true},language:'en',languages:['fr'],t:key=>key,onChoose:()=>{throw Error('unexpected switch');}});assert.equal(host.hidden,true);assert.equal(host.children.length,0);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('account languages absent from browser language list remain selectable',()=>{
 const previous=globalThis.document,select=new Element();globalThis.document={createElement:()=>new Element()};
 try{ensureLanguageOption(select,'fr-FR','fr-FR');ensureLanguageOption(select,'fr-FR','fr-FR');assert.equal(select.options.length,1);assert.equal(select.options[0].value,'fr-FR');assert(select.options[0].textContent.length>0);}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
