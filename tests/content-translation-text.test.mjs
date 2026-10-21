import test from 'node:test';
import assert from 'node:assert/strict';
import {protectTranslationText} from '../content-translation-text.mjs';
test('translation text protects exact URLs and Unicode numeric values without replacement-string interpretation',()=>{
 const source='費用9,715円 https://example.test/a?x=3&literal=$& と2026/09、３０３kWh';
 const protectedText=protectTranslationText(source);
 assert(!protectedText.text.includes('9,715'));assert(!protectedText.text.includes('https://'));assert(!protectedText.text.includes('３０３'));
 assert.equal(protectedText.restore('Translated '+protectedText.text),'Translated '+source);
 const collision=protectTranslationText('{JPLP0} remains literal and value 9715');assert.equal(collision.restore(collision.text),'{JPLP0} remains literal and value 9715');
});
test('missing duplicated unknown or malformed protection tokens reject provider output',()=>{
 const protectedText=protectTranslationText('123 and 456');
 for(const output of ['',protectedText.text+' {JPLP0}',protectedText.text+' {JPLP99}',protectedText.text+' {JPLPbad}',protectedText.text.replace('{JPLP0}','{JPLP00}')])assert.throws(()=>protectedText.restore(output),/translation_structure_invalid/);
 for(const value of [null,123,{}])assert.throws(()=>protectTranslationText(value),/invalid_translation_text/);
});
