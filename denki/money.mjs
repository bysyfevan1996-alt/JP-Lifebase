// Prices are parsed as decimal digits rather than multiplied as floating-point
// yen. The engine uses integer sen (and milli-yen when halving the basic fee).
export function toSen(value){
 if(typeof value!=='string'&&typeof value!=='number')throw new RangeError('Invalid decimal');
 if(typeof value==='number'&&!Number.isFinite(value))throw new RangeError('Invalid decimal');
 const str=String(value);
 if(!/^-?\d+(?:\.\d{1,2})?$/.test(str))throw new RangeError('Expected at most two decimals');
 const negative=str.startsWith('-'),[whole,fraction='']=(negative?str.slice(1):str).split('.');
 const exact=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 if(exact>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError('Price exceeds safe range');
 return (negative?-1:1)*Number(exact);
}
export function floorYen(sen){
 if(!Number.isSafeInteger(sen))throw new RangeError('Expected integer sen');
 return Math.floor(sen/100);
}
export function tierAmounts(kwh,tiers){
 if(!Number.isSafeInteger(kwh)||kwh<0||kwh>10000)throw new RangeError('Invalid kWh');
 if(!Array.isArray(tiers)||!tiers.length)throw new RangeError('Invalid tiers');
 let previous=0;
 const validated=tiers.map((tier,index)=>{
  if(!tier||typeof tier!=='object')throw new RangeError('Invalid tier');
  const last=index===tiers.length-1;
  if(last?tier.upTo!==null:!Number.isSafeInteger(tier.upTo)||tier.upTo<=previous)throw new RangeError('Invalid tier boundary');
  const rateSen=toSen(tier.rate);if(rateSen<0)throw new RangeError('Invalid negative rate');
  if(tier.upTo!==null)previous=tier.upTo;
  return {upTo:tier.upTo,rateSen};
 });
 const rows=[];previous=0;
 for(const {upTo,rateSen}of validated){
  const end=Math.min(kwh,upTo??kwh),usage=Math.max(0,end-previous);
  if(usage){const amountSen=usage*rateSen;if(!Number.isSafeInteger(amountSen))throw new RangeError('Amount exceeds safe range');rows.push({kwh:usage,rateSen,amountSen,fromKwh:previous,toKwh:end});}
  if(upTo!==null)previous=upTo;
 }
 return rows;
}
