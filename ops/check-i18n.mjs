import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {dictionaries as site} from '../dist/i18n.js';
import {dictionaries as admin} from '../dist/admin-i18n.js';
import {dictionaries as denki} from '../dist/denki-i18n.js';
import {m3Dictionaries as m3} from '../dist/m3-i18n.js';
import {m5Dictionaries as m5} from '../dist/m5-i18n.js';
import {m4Dictionaries as m4} from '../dist/m4-i18n.js';
import {composerDictionaries as composer} from '../dist/composer-i18n.js';

export const manualLanguages=['en','ja','zh-CN','zh-TW','ko'];
const placeholders=value=>[...String(value).matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort().join(',');
export function staticTranslationKeys(source){return [...source.matchAll(/\b(?:t|copy)\(\s*['"]([^'"]+)['"](?=\s*[,)])/g)].map(match=>match[1]);}
export function checkDictionary(name,dictionaries){
 const errors=[],keys=new Set(Object.values(dictionaries).flatMap(copy=>Object.keys(copy)));
 for(const language of manualLanguages){
  const copy=dictionaries[language];if(!copy){errors.push(`${name}/${language}: missing dictionary`);continue;}
  for(const key of keys){
   if(typeof copy[key]!=='string'){errors.push(`${name}/${language}/${key}: missing string`);continue;}
   if(placeholders(copy[key])!==placeholders(dictionaries.en[key]))errors.push(`${name}/${language}/${key}: placeholder mismatch`);
  }
 }
 return errors;
}
export async function auditDictionaries(){
 const groups={site,admin,denki,composer,m3,m4,m5},errors=Object.entries(groups).flatMap(([name,copy])=>checkDictionary(name,copy));
 const editor=Object.fromEntries(manualLanguages.map(language=>[language,{...site[language],...composer[language],...m3[language],...m4[language],...m5[language]}]));
 const adminAll=Object.fromEntries(manualLanguages.map(language=>[language,{...admin[language],...m5[language]}]));
 const sources=[['site',editor,['app.js','language-ui.js','reading-nav.js','m4-ui.js','m5-ui.js']],['auth',editor,['auth-ui.js']],['admin',adminAll,['admin.js','m5-admin.js','language-ui.js']],['denki',denki,['denki.js','language-ui.js']],['composer',editor,['composer.js','composer-extras.js','composer-images.js','m3-ui.js','m3-editor.js','m3-media.js','reply-writing.js']]];
 for(const [group,copy,files]of sources)for(const file of files){
  const source=await readFile(new URL('../dist/'+file,import.meta.url),'utf8');
  for(const key of staticTranslationKeys(source))for(const language of manualLanguages)if(typeof copy[language][key]!=='string')errors.push(`${group}/${language}/${file}: unknown key ${key}`);
 }
 for(const [name,copy,file]of [['site',editor,'index.html'],['admin',adminAll,'admin.html'],['denki',denki,'denki.html']]){
  const html=await readFile(new URL('../dist/'+file,import.meta.url),'utf8');for(const [,key]of html.matchAll(/data-(?:i18n(?:-aria)?|label)="([^"]+)"/g))for(const language of manualLanguages)if(typeof copy[language][key]!=='string')errors.push(`${name}/${language}/${file}: unknown key ${key}`);
 }
 return [...new Set(errors)];
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const errors=await auditDictionaries();if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Manual dictionaries complete: site/auth, admin, composer, denki; 5 languages; matching placeholders.');
}
