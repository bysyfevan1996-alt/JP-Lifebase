import {categories} from './topics.js?v=20261022012556469';
import {topicTags} from './topic-tags.js?v=20261022012556469';
const stable=/^[a-z][a-z0-9-]{0,39}$/;
let catalog={categories:Object.entries(categories).map(([id,value])=>({id,...value,name:id,translations:{},active:true,position:0})),tags:topicTags.map(tag=>({...tag,name:tag.id,translations:{},active:true,position:0}))};
let loaded=false;
export function getDirectory(){return catalog;}
export function directoryReady(){return loaded;}
export function directoryLabel(entry,language='zh-CN'){
 if(!entry||typeof entry!=='object'||Array.isArray(entry))return '';
 if(entry.translations&&typeof entry.translations[language]==='string'){const label=entry.translations[language];if(label.trim())return label;}
 if(typeof entry.name==='string'&&entry.name.trim())return entry.name;
 if(typeof entry.id==='string'&&entry.id.trim())return entry.id;
 return '';
}
export function applyDirectory(value){
 if(!value||!Array.isArray(value.categories)||!Array.isArray(value.tags))throw new Error('invalid_directory');
 const clean=rows=>rows.filter(row=>row&&stable.test(row.id)&&typeof row.name==='string').map(row=>({...row,translations:row.translations&&typeof row.translations==='object'?{...row.translations}:{},active:row.active===true||row.active===1,position:Number(row.position)||0})).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
 catalog={categories:clean(value.categories),tags:clean(value.tags)};if(!catalog.categories.some(row=>row.id==='site'))throw new Error('invalid_directory');
 for(const row of catalog.categories){const old=categories[row.id]||{};categories[row.id]={...old,...row,color:/^#[0-9a-f]{6}$/i.test(row.color)?row.color:'#999999',bg:old.bg||'#f5f5f5',fg:old.fg||'#777777'};}
 const previous=new Map(topicTags.map(tag=>[tag.id,tag]));topicTags.splice(0,topicTags.length,...catalog.tags.map(row=>({...previous.get(row.id),...row,categories:row.categories||previous.get(row.id)?.categories||[]})));loaded=true;
 return catalog;
}
export function categoryLabel(id,language,t){const row=categories[id];return row?.name&&row.name!==id?directoryLabel(row,language):t(id);}
export function tagLabel(id,language,t){const row=topicTags.find(tag=>tag.id===id);return row?.name&&row.name!==id?directoryLabel(row,language):row?.labelKey?t(row.labelKey):id;}
