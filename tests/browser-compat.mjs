import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.cwd(),site=path.join(root,'site');
const out=process.env.BROWSER_TEST_OUTPUT||path.join(root,'verification','browser-compat');
await mkdir(out,{recursive:true});
const browsers=(process.env.BROWSERS||'chromium,firefox,webkit').split(',');
const live=process.env.TEST_LIVE_URL;
let server;
if(!live){
 server=createServer(async(req,res)=>{try{
  const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!requestPath.startsWith('/rolling-ink/')){res.writeHead(404).end();return;}
  const rel=requestPath.slice('/rolling-ink/'.length)||'index.html',target=path.resolve(site,rel);
  if(!target.startsWith(site+path.sep)){res.writeHead(403).end();return;}
  const bytes=await readFile(target),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'text/plain','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
}
const base=live||`http://127.0.0.1:${server.address().port}/rolling-ink/`;
const reports=[];
const ready=async page=>{await page.waitForTimeout(250);await page.waitForFunction(()=>{const s=document.querySelector('#render-status');return s&&!s.classList.contains('busy')&&!s.textContent.includes('正在');},null,{timeout:120000});assert.doesNotMatch(await page.locator('#render-status').textContent(),/失败|不可用/);};
async function layout(page,width,height){
 await page.setViewportSize({width,height});await ready(page);
 const result=await page.evaluate(()=>{const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};return{workspace:getComputedStyle(document.querySelector('.workspace')).display,settings:box('.side-panel'),sidebar:box('#ink-controls-scroll'),sourceCard:box('#source-card'),stage:box('.stage'),canvas:box('#canvas-wrap'),art:box('#artwork'),overflow:document.documentElement.scrollWidth>innerWidth}});
 const minimum=width>900?200:150;
 assert.equal(result.overflow,false);assert.ok(result.sidebar.width<=result.settings.width+1,'settings content escaped its column');assert.ok(result.sourceCard.width<=result.settings.width+1,'edit panel became a page-wide overlay');assert.ok(result.sidebar.x>=result.settings.x-1,'settings content escaped left edge');assert.ok(result.stage.height>=300);assert.ok(result.canvas.width>minimum&&result.canvas.height>minimum);assert.ok(result.art.width>minimum&&result.art.height>minimum);
 if(width>900){assert.equal(result.workspace,'grid');assert.ok(result.stage.x>=350&&result.stage.x<355);assert.ok(result.canvas.y>=0&&result.canvas.y<height);}
 return result;
}
const hash=page=>page.locator('#artwork').evaluate(c=>{const bytes=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let h=1,ink=0;for(let i=3;i<bytes.length;i+=4){h=Math.imul(h^bytes[i],16777619);if(bytes[i])ink++;}return{hash:h>>>0,ink};});
async function save(page,button){const event=page.waitForEvent('download',{timeout:120000});await page.click(button);const d=await event;const name=d.suggestedFilename(),file=path.join(out,name);await d.saveAs(file);await page.waitForFunction(()=>document.querySelector('#export-progress').hidden);return{file,name,bytes:await readFile(file)};}
try{
 for(const name of browsers){
  let browser,page;const errors=[],failed=[];
  try{
   const type=name==='edge'||name==='chrome'?pw.chromium:pw[name];
   browser=await type.launch({headless:true,...(name==='edge'?{channel:'msedge'}:name==='chrome'?{channel:'chrome'}:{})});
   page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
   // The layout must survive external CSS being blocked or unavailable.
   await page.route('**/*',route=>route.request().resourceType()==='stylesheet'?route.abort():route.continue());
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});await ready(page);
   const scanPixels=await page.evaluate(async base=>{
    const {inkMapFromImage}=await import(base+'raster.js');
    const source=document.createElement('canvas');source.width=311;source.height=777;
    const ctx=source.getContext('2d'),pixels=ctx.createImageData(source.width,source.height);
    for(let i=0;i<pixels.data.length;i+=4){const v=(i*13+(i>>>8)*37)%256;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);
    const crop={left:13,top:17,width:251,height:611},full=document.createElement('canvas');full.width=crop.width;full.height=crop.height;const fullCtx=full.getContext('2d');fullCtx.drawImage(source,crop.left,crop.top,crop.width,crop.height,0,0,crop.width,crop.height);const reference=fullCtx.getImageData(0,0,crop.width,crop.height).data;
    const actual=inkMapFromImage(source,crop);let mismatches=0;for(let i=0;i<actual.data.length;i++)if(actual.data[i]!==255-reference[i*4])mismatches++;
    return{pixels:actual.data.length,mismatches,width:actual.width,height:actual.height};
   },base);assert.equal(scanPixels.mismatches,0);assert.equal(scanPixels.pixels,251*611);
   assert.equal(await page.locator('[data-mode="stamp"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-key="roughness"]').first().inputValue(),'26');
   const desktop=await layout(page,1440,1000),wide=await layout(page,3813,1863);await layout(page,1440,1000);
   const stamp=await hash(page);assert.ok(stamp.ink>1000);
   // Reproduce a normal first paint followed by generic styles inserted after load.
   await page.evaluate(()=>setTimeout(()=>{const style=document.createElement('style');style.id='late-layout-overrides';style.textContent='main{display:block!important}.stage{display:none!important;height:0!important}.side-panel{display:block!important;height:auto!important;overflow:visible!important}.app-shell{height:auto!important;overflow:visible!important}';document.head.append(style);},500));
   await page.waitForTimeout(800);await layout(page,1440,1000);assert.equal((await hash(page)).hash,stamp.hash);
   await page.locator('#late-layout-overrides').evaluate(e=>{e.textContent='.sidebar-content,#sidebar-scroll,.ink-controls-scroll,#ink-controls-scroll{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;transform:translate(0,0)!important;z-index:9999!important}';});
   await page.waitForTimeout(300);await layout(page,1440,1000);
   await page.locator('#late-layout-overrides').evaluate(e=>{e.className='mpa-style-fix SideFunctionPanel';e.textContent='#edit-panel{position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999}';});
   await page.waitForTimeout(300);await layout(page,2552,1282);await layout(page,1440,1000);
   assert.equal(await page.locator('#edit-panel, #export-panel').count(),0);
   await page.locator('#late-layout-overrides').evaluate(e=>e.remove());
   await page.click('[data-mode="roller"]');await ready(page);assert.equal(await page.locator('#roller-texture option').count(),13);assert.notEqual((await hash(page)).hash,stamp.hash);
   await page.screenshot({path:path.join(out,`${name}-desktop.png`),fullPage:true});
   await page.click('[data-mode="stamp"]');await page.locator('#text-input').fill('Ink');await page.locator('#font-family').selectOption('english-are-you-serious');await ready(page);
   assert.equal(await page.evaluate(()=>[...document.fonts].some(f=>f.family==='InkBuiltin_en_are_you_serious'&&f.status==='loaded')),true);
   await page.locator('#font-family').selectOption('builtin-howl-grotesque');await page.locator('#text-input').fill('滚墨');await ready(page);
   assert.equal(await page.evaluate(()=>[...document.fonts].some(f=>f.family==='InkBuiltin_howl_grotesque'&&f.status==='loaded')),true);
   // Image decoding, native dimensions and its textured silhouette must work too.
   await page.click('[data-source="image"]');await page.locator('#image-file').setInputFiles({name:'browser-test.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="white"/><circle cx="300" cy="200" r="150" fill="black"/></svg>')});await ready(page);assert.ok((await hash(page)).ink>1000);
   assert.equal(await page.locator('#canvas-width').inputValue(),'600');assert.equal(await page.locator('#canvas-height').inputValue(),'400');
   await page.click('[data-source="draw"]');await page.click('[data-draw-tool="rect"]');const box=await page.locator('#canvas-wrap').boundingBox();
   await page.mouse.move(box.x+box.width*.2,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.75,{steps:5});await page.mouse.up();await ready(page);assert.ok((await hash(page)).ink>1000);
   assert.equal(await page.locator('#geometry-overlay').isVisible(),true);
   const handleBefore=await page.locator('[data-transform-handle="se"]').boundingBox();await page.click('#zoom-in');await ready(page);const handleAfter=await page.locator('[data-transform-handle="se"]').boundingBox();assert.equal(handleAfter.width,handleBefore.width);assert.equal(handleAfter.height,handleBefore.height);await page.click('#fit');await ready(page);
   await page.click('#export-tab');await page.click('[data-size="1024"]');
   const png=await save(page,'#download-png');assert.equal(png.bytes.subarray(1,4).toString(),'PNG');assert.equal(png.bytes.readUInt32BE(16),1024);assert.equal(png.bytes.readUInt32BE(20),683);
   await page.locator('#svg-detail').selectOption('low');const svg=await save(page,'#download-svg');assert.match(svg.bytes.toString(),/<path/);assert.doesNotMatch(svg.bytes.toString(),/<image|<filter|data:image/);assert.notEqual(png.name.replace(/\.png$/,''),svg.name.replace(/\.svg$/,''));
   const mobile=await layout(page,390,844);await page.screenshot({path:path.join(out,`${name}-mobile.png`),fullPage:true});
   // Simulate browsers without dynamic viewport units and ResizeObserver.
   let fallback;
   if(!live){const fallbackPage=await browser.newPage({viewport:{width:1440,height:1000}});fallbackPage.on('pageerror',e=>errors.push('fallback: '+e.message));await fallbackPage.addInitScript(()=>{window.ResizeObserver=undefined;});await fallbackPage.route('**/rolling-ink/',async route=>{const html=(await readFile(path.join(site,'index.html'),'utf8')).replace(/(?:min-|max-)?height\s*:[^;{}]*dvh[^;{}]*;?/g,'');await route.fulfill({contentType:'text/html',body:html});});await fallbackPage.goto(base);await ready(fallbackPage);fallback=await layout(fallbackPage,1440,1000);await layout(fallbackPage,390,844);await fallbackPage.close();}
   if(!live){const diagnosticPage=await browser.newPage();await diagnosticPage.goto(base+'?diagnose=1');await ready(diagnosticPage);assert.equal(await diagnosticPage.getByRole('button',{name:'复制布局诊断'}).isVisible(),true);const diagnostic=await diagnosticPage.evaluate(()=>window.__rollingInkLayoutDiagnostics.report());assert.equal(diagnostic.history.at(-1).layout.workspace.display,'grid');assert.ok(diagnostic.matchingLayoutRules.length>0);await diagnosticPage.close();}
   assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
   const report={browser:name,version:browser.version(),delayedGenericStyleOverrides:true,actualExtensionPanelCollision:true,passed:true,url:base,desktop,wide,mobile,externalCSSUnavailable:true,originalScanPixelsUnchanged:scanPixels,stamp:true,roller:true,fonts:true,image:true,drawAndFixedTransformHandles:true,png:[1024,683],svgPaths:true,viewportAndResizeFallback:!!fallback,errors,failed};reports.push(report);console.log(JSON.stringify(report));
  }catch(error){if(page)await page.screenshot({path:path.join(out,`${name}-failure.png`),fullPage:true}).catch(()=>{});const report={browser:name,passed:false,error:error.stack,errors,failed};reports.push(report);console.error(JSON.stringify(report));}
  finally{await browser?.close();}
 }
 await writeFile(path.join(out,'results.json'),JSON.stringify(reports,null,2));
 if(reports.some(r=>!r.passed))process.exitCode=1;
}finally{await new Promise(resolve=>server?server.close(resolve):resolve());}
