import {resolveLocale} from './locale.js?v=20261021102240577';

export function ensureLanguageOption(select,preference,language){
 if([...select.options].some(option=>option.value===preference))return;
 const option=document.createElement('option');option.value=preference;
 option.textContent=new Intl.DisplayNames([language],{type:'language'}).of(language)||language;select.append(option);
}

// The browser supplies a suggestion only. Changing language always requires
// an explicit selection; no first-visit language is persisted automatically.
export function renderLanguageSuggestion(host,{preferences,language,languages=[],t,onChoose}){
 if(!host)return;
 host.replaceChildren();host.hidden=true;
 if(preferences.explicit)return;
 const candidate=resolveLocale('system',languages).language;
 if(candidate===language)return;
 const name=new Intl.DisplayNames([language],{type:'language'}).of(candidate)||candidate;
 const label=document.createElement('span'),button=document.createElement('button');
 label.textContent=t('browserLanguage',{language:name});button.type='button';button.textContent=t('useBrowserLanguage');
 button.onclick=()=>onChoose(candidate);host.append(label,button);host.hidden=false;
}
