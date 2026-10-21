// Eligibility follows Japan calendar months, independently of the host timezone.
export function monthWindow(now=new Date()){
 const date=new Date(now);if(!Number.isFinite(date.getTime()))throw new RangeError('Invalid date');
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).formatToParts(date);
 const year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value);
 const current=year*12+month-1;
 const months=Array.from({length:6},(_,i)=>{const n=current-i;return `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;});
 return {months,from:months.at(-1),to:months[0],count:6,includesCurrent:true,timeZone:'Asia/Tokyo'};
}
export function monthAllowed(month,now=new Date()){return typeof month==='string'&&monthWindow(now).months.includes(month);}
