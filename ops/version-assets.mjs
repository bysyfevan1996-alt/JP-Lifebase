import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=new Date().toISOString().replace(/\D/g,'');
for(const name of await readdir(path.join(root,'dist'))){
 if(!/\.(js|html)$/.test(name))continue;
 const file=path.join(root,'dist',name);let source=await readFile(file,'utf8');
 if(name.endsWith('.js'))source=source.replace(/from (['"])(\.\/[^'"]+\.js)(?:\?v=[^'"]+)?\1/g,(_,quote,file)=>`from ${quote}${file}?v=${version}${quote}`);
 else source=source.replace(/((?:src|href)=["']\/[a-z0-9-]+\.(?:js|css))(?:\?v=[^"']*)?(["'])/g,`$1?v=${version}$2`);
 await writeFile(file,source);
}
console.log('Static asset version:',version);
