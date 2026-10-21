import { readFile, writeFile, mkdir, copyFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=name=>readFile(path.join(root,name),'utf8');
let ui=await read('assets/ui.css');
const fonts=[...ui.matchAll(/url\('\.\/fonts\/([^']+)'\)/g)];
for(const [,name]of fonts){const bytes=await readFile(path.join(root,'assets/fonts',name));ui=ui.replace(`url('./fonts/${name}')`,`url('data:font/woff2;base64,${bytes.toString('base64')}')`);}
const engine=(await read('engine.js')).replace(/^export /gm,'');
const drawing=(await read('drawing.js')).replace(/^export /gm,'');
const worker=(await read('worker.js')).replace(/^import .*?;\s*/,'');
let app=(await read('app.js')).replace(/^import .*?;\s*/gm,'');
const {ROLLER_TEXTURES}=await import('./roller-assets.js');
const {BUILTIN_FONTS}=await import('./font-assets.js');
const {ENGLISH_FONTS}=await import('./english-font-assets.js');
const embeddedRollers=[];
for(const item of ROLLER_TEXTURES){const bytes=await readFile(path.join(root,item.src));embeddedRollers.push({...item,src:'data:image/webp;base64,'+bytes.toString('base64')});}
app=app.replaceAll("new URL('./worker.js', import.meta.url)",'inkWorkerURL').replaceAll("new URL('./worker.js',import.meta.url)",'inkWorkerURL');
// Local file origins support self-contained classic Blob workers consistently.
app=app.replace(/\{\s*type:\s*'module'\s*\}/g,'{}');
const code=`${engine}\n${drawing}\nconst ROLLER_TEXTURES=${JSON.stringify(embeddedRollers)};\nconst BUILTIN_FONTS=${JSON.stringify(BUILTIN_FONTS)};\nconst ENGLISH_FONTS=${JSON.stringify(ENGLISH_FONTS)};\nconst inkWorkerURL=URL.createObjectURL(new Blob([${JSON.stringify(engine+'\n'+worker)}],{type:'text/javascript'}));\n${app}`;
let html=await read('index.html');
html=html.replace('<link rel="stylesheet" href="assets/ui.css">',`<style>${ui}</style>`).replace('<link rel="stylesheet" href="style.css">',`<style>${await read('style.css')}</style>`);
const favicon=Buffer.from(await read('assets/favicon.svg')).toString('base64');
html=html.replace('href="assets/favicon.svg"',`href="data:image/svg+xml;base64,${favicon}"`);
const creatorQR=(await readFile(path.join(root,'assets/anyusj-wechat-qr.png'))).toString('base64');
html=html.replace('src="assets/anyusj-wechat-qr.png"',`src="data:image/png;base64,${creatorQR}"`);
html=html.replace('<script type="module" src="app.js"></script>',()=>`<script type="module">${code.replaceAll('</script','<\\/script')}</script>`);
await writeFile(path.join(root,'滚墨印记.html'),html);
await mkdir(path.join(root,'dist'),{recursive:true});
await mkdir(path.join(root,'dist/assets/rollers'),{recursive:true});
for(const item of ROLLER_TEXTURES)await copyFile(path.join(root,item.fullSrc),path.join(root,'dist',item.fullSrc));
await copyFile(path.join(root,'assets/rollers/SOURCE.md'),path.join(root,'dist/assets/rollers/SOURCE.md'));
await cp(path.join(root,'assets/typefaces'),path.join(root,'dist/assets/typefaces'),{recursive:true});
await writeFile(path.join(root,'dist/index.html'),html.replace('href="README.md"','href="README.md"'));
for(const name of ['README.md','LICENSE']){try{await writeFile(path.join(root,'dist',name),await read(name));}catch{}}
console.log('已生成离线页面与 dist/index.html；请一起保留 assets/rollers 高清肌理与 assets/typefaces 字体。');
