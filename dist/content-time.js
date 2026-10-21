const timestamp=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const options={year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo',timeZoneName:'short'};
export function formatContentTime(value,language='en'){
 if(typeof value!=='string'||!timestamp.test(value))return null;const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
 let label;try{label=new Intl.DateTimeFormat(language,options).format(date);}catch{label=new Intl.DateTimeFormat('en',options).format(date);}
 return {datetime:date.toISOString(),label};
}
