export function createInterfaceShell({t,icon,navigate,newTopic,getUser}){
 const phone=matchMedia('(max-width:760px)'),events=new AbortController(),options={signal:events.signal};
 const header=document.querySelector('.header-right'),language=document.querySelector('.language-control'),sidebar=document.querySelector('.sidebar-inner');
 const placeholder=document.createComment('desktop language control');language.before(placeholder);
 const sidebarLanguage=document.createElement('div');sidebarLanguage.className='sidebar-language';sidebar.append(sidebarLanguage);
 const accountLink=document.createElement('button');accountLink.type='button';accountLink.className='side-link personal-link sidebar-account';accountLink.onclick=()=>navigate('/account');sidebar.querySelector('#my-bookmarks').after(accountLink);
 const controls=document.createElement('div');controls.className='interface-header-actions';header.prepend(controls);
 const bottom=document.createElement('nav');bottom.className='mobile-main-navigation';bottom.setAttribute('aria-label',t('community'));document.body.append(bottom);
 let unread=0;
 const routes=[['/','messages','accountAllDiscussions'],['/search','search','communitySearch'],['/notifications','message','m4Notifications'],['/account','user','accountMy']];
 function makeButton(symbol,label,action,className='icon-button'){
  const button=document.createElement('button');button.type='button';button.className=className;button.setAttribute('aria-label',label);button.innerHTML=icon(symbol);button.onclick=action;return button;
 }
 function refresh(value={}){
  if(Object.hasOwn(value,'unreadCount'))unread=Number(value.unreadCount)||0;
  const path=location.pathname.replace(/\/$/,'')||'/',isTopic=/^\/t\//.test(path)||location.hash.startsWith('#topic=');
  bottom.hidden=isTopic||path==='/denkikakaku'||path==='/moving-checklist';bottom.setAttribute('aria-label',t('community'));bottom.replaceChildren();
  for(const [url,symbol,key]of routes){const button=makeButton(symbol,t(key),()=>navigate(url),'mobile-nav-button');const label=document.createElement('span');label.textContent=t(key);button.append(label);const active=url==='/'?path==='/':url==='/account'?path.startsWith('/account'):path===url;if(active)button.setAttribute('aria-current','page');if(url==='/notifications'&&getUser()&&unread){const count=document.createElement('small');count.textContent=unread>99?'99+':String(unread);button.append(count);}bottom.append(button);}
  controls.replaceChildren();const search=makeButton('search',t('communitySearch'),()=>navigate('/search'),'icon-button mobile-search-shortcut'),compose=makeButton('plus',t('newTopic'),newTopic,'icon-button mobile-compose-shortcut'),notifications=makeButton('message',t('m4Notifications'),()=>navigate('/notifications'),'icon-button desktop-notifications');
  if(getUser()&&unread){const badge=document.createElement('span');badge.className='header-unread-badge';badge.textContent=unread>99?'99+':String(unread);notifications.append(badge);}controls.append(search,compose,notifications);
  accountLink.textContent=t('accountHeading');accountLink.setAttribute('aria-current',path==='/account'?'page':'false');
  for(const [id,url]of [['my-topics','/my-topics'],['my-messages','/notifications'],['my-bookmarks','/bookmarks']]){const node=document.getElementById(id);node.classList.toggle('active',path===url);}
 }
 function layout(){if(phone.matches)sidebarLanguage.append(language);else placeholder.after(language);}
 phone.addEventListener('change',layout,options);layout();refresh();
 return {refresh,destroy(){events.abort();placeholder.after(language);placeholder.remove();sidebarLanguage.remove();accountLink.remove();controls.remove();bottom.remove();}};
}
