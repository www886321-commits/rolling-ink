import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'site');
await mkdir(out,{recursive:true});
// Keep the web entry small. Original-resolution textures and fonts load on demand.
for(const name of ['index.html','style.css','app.js','drawing.js','engine.js','worker.js','roller-assets.js','font-assets.js','english-font-assets.js','README.md','LICENSE']){
 await cp(path.join(root,name),path.join(out,name));
}
for(const name of ['assets','licenses'])await cp(path.join(root,name),path.join(out,name),{recursive:true});
await writeFile(path.join(out,'.nojekyll'),'');
const html=await readFile(path.join(out,'index.html'),'utf8');
if(/(?:src|href)=["']\/(?!\/)/.test(html))throw new Error('Root-relative URL is not compatible with project Pages');
console.log('GitHub Pages static files ready in site/');
