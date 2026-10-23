// Shared selection transformer used by the topic, reply and revision editors.
export function formatMarkdown({value,start,end,format,placeholder='',linkLabel='Link',maxLength=12000}){
 if(typeof value!=='string'||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>value.length)return null;
 const selected=value.slice(start,end);let replacement,from=0,to;
 if(['heading','quote','list','ordered'].includes(format)){
  start=start===0?0:value.lastIndexOf('\n',start-1)+1;
  const selectedEnd=end>start&&value[end-1]==='\n'?end-1:end,nextBreak=value.indexOf('\n',selectedEnd);end=nextBreak<0?value.length:nextBreak;
  const text=value.slice(start,end)||placeholder,prefix={heading:'## ',quote:'> ',list:'- ',ordered:'1. '}[format];
  replacement=text.split('\n').map((line,index)=>(format==='ordered'?`${index+1}. `:prefix)+line).join('\n');from=prefix.length;to=replacement.length;
 }else if(['bold','italic','code'].includes(format)){
  const wrapper=format==='bold'?'**':format==='italic'?'*':selected.includes('\n')?'```\n':'`',closing=wrapper==='```\n'?'\n```':wrapper,text=selected||placeholder;
  replacement=wrapper+text+closing;from=wrapper.length;to=from+text.length;
 }else if(format==='link'){const text=selected||linkLabel;replacement=`[${text}](https://example.com)`;from=selected?text.length+3:1;to=selected?replacement.length-1:text.length+1;}
 else if(format==='emoji'){replacement='🙂';from=replacement.length;to=from;}
 else if(format==='rule'){replacement='\n---\n';from=replacement.length;to=from;}else return null;
 if(value.length-(end-start)+replacement.length>maxLength)return null;
 return {value:value.slice(0,start)+replacement+value.slice(end),start:start+from,end:start+(to??replacement.length)};
}
