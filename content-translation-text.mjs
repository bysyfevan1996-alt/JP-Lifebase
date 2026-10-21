export function protectTranslationText(input){
 if(typeof input!=='string')throw Error('invalid_translation_text');
 let prefix='JPLP';while(input.includes('{'+prefix))prefix+='X';
 const values=[];
 const text=input.replace(/https?:\/\/[^\s<>]+|[\p{N}]+(?:[.,:/-][\p{N}]+)*/gu,value=>{const token='{'+prefix+values.length+'}';values.push(value);return token;});
 return {text,restore(output){
  if(typeof output!=='string')throw Error('translation_structure_invalid');
  const seen=new Map(),pattern=new RegExp('\\{'+prefix+'([^}]*?)\\}','g');
  output.replace(pattern,(token,index)=>{if(!/^(0|[1-9]\d*)$/.test(index)||Number(index)>=values.length)throw Error('translation_structure_invalid');seen.set(Number(index),(seen.get(Number(index))||0)+1);return token;});
  if(values.some((_,index)=>seen.get(index)!==1))throw Error('translation_structure_invalid');
  return output.replace(pattern,(_,index)=>values[Number(index)]);
 }};
}
