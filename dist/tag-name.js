export function normalizeTagName(value){
 if(typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value))throw new TypeError('invalid_tag_name');
 const name=value.normalize('NFKC').trim().replace(/\s+/gu,' ');
 if(!name||Array.from(name).length>30)throw new TypeError('invalid_tag_name');
 return name;
}
export const tagNameKey=value=>String(value).normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
