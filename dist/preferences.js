import {normalizeLanguage,resolveLocale} from './locale.js?v=20261021102240577';

const languageKey='jlb-language',metadataKey='jlb-language-meta';
function availableStorage(storage){try{return storage===undefined?globalThis.localStorage:storage;}catch{return null;}}
function readRecord(storage){
 storage=availableStorage(storage);
 try{
  const raw=storage?.getItem(languageKey),encoded=storage?.getItem(metadataKey);
  if(typeof raw!=='string'||!raw.trim())return {language:'zh-CN',explicit:false,guest:null};
  let metadata=null;try{metadata=encoded?JSON.parse(encoded):null;}catch{}
  const valid=metadata?.version===1&&metadata.language===raw&&['guest','account','default'].includes(metadata.origin);
  // The old application persisted `system` on every first load. Only a new
  // explicit choice with matching metadata is evidence of user intent.
  if(raw==='system'&&!valid)return {language:'zh-CN',explicit:false,guest:null};
  const language=raw==='system'?'system':normalizeLanguage(raw);
  const explicit=valid?metadata.origin!=='default':!encoded;
  return {language,explicit,guest:explicit&&(!encoded||metadata?.origin==='guest')?language:null};
 }catch{return {language:'zh-CN',explicit:false,guest:null};}
}
export function readLanguagePreference(storage){return readRecord(storage).language;}

export function createLanguagePreferences({api,storage,onChange=()=>{},onError=()=>{}}){
 storage=availableStorage(storage);
 const initial=readRecord(storage);
 let preference=initial.language,explicit=initial.explicit,guestChoice=initial.guest,userId=null,generation=0,revision=0,tail=Promise.resolve(),sync=Promise.resolve();
 function report(error){try{onError(error);}catch{}}
 function persist(origin){
  try{
   // Matching values in metadata prevent a partial multi-key write from
   // attributing a former account's language to a new guest.
   storage?.setItem(metadataKey,JSON.stringify({version:1,language:preference,origin}));
   storage?.setItem(languageKey,preference);
  }catch{}
 }
 function notify(){try{Promise.resolve(onChange(preference)).catch(report);}catch(error){report(error);}}
 function queueWrite(id,ticket,value){
  tail=tail.then(async()=>{
   if(id!==userId||ticket!==generation)return;
   try{await api('/api/me/preferences',{method:'POST',headers:{'X-Expected-User-Id':id},body:JSON.stringify({language:value})});}
   catch(error){if(id===userId&&ticket===generation)report(error);}
  });
  return tail;
 }
 function choose(value){
  if(typeof value!=='string'||!value.trim())return tail;
  preference=value==='system'?'system':normalizeLanguage(value);revision++;explicit=true;
  if(!userId)guestChoice=preference;
  persist(userId?'account':'guest');notify();
  return userId?queueWrite(userId,generation,resolveLocale(preference,globalThis.navigator?.languages||[]).language):tail;
 }
 function setUser(user){
  const next=typeof user?.id==='string'&&user.id?user.id:null;
  if(next===userId)return sync;
  const incomingGuest=guestChoice;guestChoice=null;userId=next;
  const ticket=++generation,readRevision=revision;
  if(!next){explicit=false;sync=Promise.resolve();return sync;}
  sync=(async()=>{
   try{
    const result=await api('/api/me/preferences');
    if(ticket!==generation||next!==userId||readRevision!==revision)return;
    const saved=result?.preferences?.language;
    if(typeof saved==='string'&&saved){
     preference=normalizeLanguage(saved);explicit=true;persist('account');notify();
    }else if(incomingGuest){
     preference=incomingGuest;explicit=true;persist('account');notify();
     await queueWrite(next,ticket,resolveLocale(preference,globalThis.navigator?.languages||[]).language);
    }else{
     preference='zh-CN';explicit=false;persist('default');notify();
    }
   }catch(error){if(ticket===generation&&next===userId&&readRevision===revision)report(error);}
  })();
  return sync;
 }
 async function flush(){await sync;await tail;}
 return {get preference(){return preference;},get explicit(){return explicit;},choose,setUser,flush};
}
