import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'site');
const read=name=>readFile(path.join(root,name),'utf8');
await mkdir(out,{recursive:true});
const modules=['app.js','layout-diagnostics.js','raster.js','drawing.js','engine.js','worker.js','roller-assets.js','font-assets.js','english-font-assets.js'];
let html=await read('index.html');
const ui=(await read('assets/ui.css')).replaceAll("url('./fonts/","url('assets/fonts/");
const css=await read('style.css');
const sources=await Promise.all(modules.map(read));
const revision=createHash('sha256').update([html,ui,css,...sources].join('\n')).digest('hex').slice(0,12);
// Ship the entire layout with the document: a failed/stale CSS request cannot hide the stage.
html=html.replace('<link rel="stylesheet" href="assets/ui.css">',()=>'<style data-inline-ui>'+ui+'</style>')
 .replace('<link rel="stylesheet" href="style.css">',()=>'<style data-inline-tool>'+css+'</style>')
 .replace('src="app.js"','src="app.js?v='+revision+'"')
 .replace('src="layout-diagnostics.js"','src="layout-diagnostics.js?v='+revision+'"');
if(/(?:src|href)=["']\/(?!\/)/.test(html))throw new Error('Root-relative URL is not compatible with project Pages');
await writeFile(path.join(out,'index.html'),html);
for(let i=0;i<modules.length;i++){
 const code=sources[i].replace(/(\bfrom\s*['"])(\.\/[^'"]+\.js)(['"])/g,(_,prefix,url,suffix)=>prefix+url+'?v='+revision+suffix)
  .replace(/(new URL\(\s*['"])(\.\/worker\.js)(['"])/g,(_,prefix,url,suffix)=>prefix+url+'?v='+revision+suffix);
 await writeFile(path.join(out,modules[i]),code);
}
for(const name of ['style.css','README.md','LICENSE','assets','licenses'])await cp(path.join(root,name),path.join(out,name),{recursive:true});
await writeFile(path.join(out,'.nojekyll'),'');
console.log('GitHub Pages ready; embedded layout and versioned modules: '+revision);
