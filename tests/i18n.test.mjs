import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDictionary,auditDictionaries,manualLanguages,staticTranslationKeys} from '../ops/check-i18n.mjs';
import {resolveLocale,normalizeLanguage,communityContentLanguage} from '../dist/locale.js';

test('first visit defaults to Chinese; system language is used only when explicitly selected',()=>{
 assert.deepEqual(resolveLocale(undefined,['ja-JP']),{language:'zh-CN',source:'zh-CN',automatic:false});
 assert.equal(normalizeLanguage('bad invalid'),'zh-CN');
 assert.equal(resolveLocale('system',['ja-JP']).language,'ja');
 assert.equal(resolveLocale('zh-Hant-HK').language,'zh-TW');
 for(const language of manualLanguages)assert.equal(resolveLocale(language).automatic,false);
 assert.deepEqual(resolveLocale('fr-FR'),{language:'fr-FR',source:'en',automatic:true});
});
test('all maintained dictionaries cover static UI keys and matching placeholders',async()=>assert.deepEqual(await auditDictionaries(),[]));
test('interface language changes never initiate machine translation of community content in M1',()=>{
 for(const language of manualLanguages)assert.equal(communityContentLanguage(language),language);
 for(const language of ['fr-FR','de','ar','vi']){assert.equal(resolveLocale(language).automatic,true);assert.equal(communityContentLanguage(language),'original');}
 assert.equal(communityContentLanguage('ja',true),'original');
});
test('static checker captures no-argument keys, interpolation keys and auth copy calls',()=>{
 assert.deepEqual(staticTranslationKeys("t('missing_key'); t('with_name',{name}); copy('authMissing'); t(dynamic); t('prefix_'+suffix)"),['missing_key','with_name','authMissing']);
});
test('dictionary audit rejects missing translations and changed placeholder names',()=>{
 const good=Object.fromEntries(manualLanguages.map(language=>[language,{greet:'Hi {name}'}]));
 assert.deepEqual(checkDictionary('fixture',good),[]);
 good.ko={greet:'안녕 {other}'};delete good.ja.greet;
 const errors=checkDictionary('fixture',good);assert(errors.some(error=>error.includes('/ja/greet: missing')));assert(errors.some(error=>error.includes('/ko/greet: placeholder mismatch')));
});
