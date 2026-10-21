import { inkMapFromImage } from './raster.js';
import { render, clamp } from './engine.js';
import { ROLLER_TEXTURES } from './roller-assets.js';
import { BUILTIN_FONTS } from './font-assets.js';
import { ENGLISH_FONTS } from './english-font-assets.js';
import { DRAW_SHAPES, shapeBox, drawMark, geometryOf, withGeometry, geometryPoint, resizeGeometry } from './drawing.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const iconPaths = {
  select:'m5 3 14 10-7 1-3 7Z',
  shapeRect:'M4 5h16v14H4z',shapeRoundRect:'M8 5h8a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4Z',
  shapeCircle:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',shapeEllipse:'M22 12a10 7 0 1 1-20 0 10 7 0 0 1 20 0Z',
  shapeTriangle:'m12 3 10 17H2Z',shapeDiamond:'m12 2 9 10-9 10-9-10Z',
  shapeStar:'m12 2 3 6.5 7 .9-5 4.9 1.2 7-6.2-3.4-6.2 3.4 1.2-7-5-4.9 7-.9Z',
  shapeHeart:'M12 21S2 15 2 8a5 5 0 0 1 10-1A5 5 0 0 1 22 8c0 7-10 13-10 13Z',
  type:'M4 5h16M12 5v15M8 20h8', image:'M3 4h18v16H3zM3 16l5-5 5 5 3-3 5 5M16 8h.01',
  upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6', chevron:'m7 10 5 5 5-5',
  shuffle:'M3 6h3c5 0 6 12 11 12h4m-4-4 4 4-4 4M3 18h3c2 0 3-2 5-6m3-5c1-1 2-1 3-1h4m-4-4 4 4-4 4',
  download:'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4', fit:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  hand:'M8 12V5a2 2 0 0 1 4 0v7-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v9c0 5-3 8-7 8-3 0-5-1-7-4l-3-5a2 2 0 0 1 3-2l2 2',
  minus:'M5 12h14', plus:'M5 12h14M12 5v14', sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  moon:'M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z', compare:'M12 3v18M4 5h16v14H4z',
  sliders:'M4 7h4m4 0h8M4 17h8m4 0h4M8 4v6m8 4v6', close:'m5 5 14 14M5 19 19 5', arrow:'M4 12h16m-6-6 6 6-6 6',
  pen:'m4 16 12-12 4 4L8 20H4v-4m9-9 4 4', eraser:'m4 13 9-9 7 7-9 9H8l-4-4v-3m4-4 7 7M11 20h10', undo:'M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14', redo:'m16 4 5 5-5 5m5-5H11a7 7 0 0 0 0 14'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name] || iconPaths.image}"/></svg>`;
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon)); }
hydrateIcons();

const defaults = {
  source:'text', text:'滚墨\n印记', font:'sans', fontSize:94, letterSpacing:0, lineHeight:101,
  stretchX:100, stretchY:100, roundness:0, expand:0, warp:0, method:'tone', threshold:50, contrast:115, invert:false,
  mode:'stamp', density:96, distress:74, scale:44, grain:70, edge:24, angle:90, pressure:58,
  diffusion:42, spread:75, roughness:26, edgeScale:28, seed:271828, ink:'#287fb0', background:'transparent', paperColor:'#f4f0e6', paperTexture:35,
  rollerTexture:'049', overlap:16, clarity:55, ratio:1, canvasWidth:2048, canvasHeight:2048, canvasPreset:'square', backgroundFit:'cover', padding:8, brushSize:36, shapeAngle:0
};
let state = { ...defaults }, image = null, imageURL = null, customFont = null;
let backgroundImage=null,backgroundURL=null,backgroundLoadId=0;
let strokes = [], drawHistory = [], drawFuture = [], currentStroke = null, drawTool = 'pen', drawPointer = null;
let drawOperation='add';
let selectedGeometry=null,geometryGesture=null,geometrySerial=0;
let exporting = false, pendingPreview = false, previewRunning = false, previewTimer;
let includeImageBackground=true;
let downloadSerial=0;
let generation = 0, currentRevision = 0, toastTimer, compare = false, previewTargetLong = 0;
const art = $('#artwork'), original = $('#original'), live = $('#drawing-live'), wrap = $('#canvas-wrap'), viewport = $('#viewport');
const previewWorker = new Worker(new URL('./worker.js', import.meta.url), { type:'module' });
const detailWorker = new Worker(new URL('./worker.js', import.meta.url), { type:'module' });
const detailArt=document.createElement('canvas'),detailOriginal=document.createElement('canvas');
for(const canvas of [detailArt,detailOriginal]){canvas.className='detail-view';canvas.hidden=true;wrap.append(canvas);}
detailArt.id='detail-artwork';detailOriginal.id='detail-original';
let detailTimer,detailRevision=0,detailRunning=false,detailPending=false,detailJob=null,detailValid=false;
const geometryOverlay=document.createElement('div');geometryOverlay.id='geometry-overlay';geometryOverlay.hidden=true;
geometryOverlay.innerHTML='<svg id="geometry-frame" aria-hidden="true"><polygon class="geometry-frame-halo"/><polygon class="geometry-frame-line"/><line class="geometry-frame-halo"/><line class="geometry-frame-line"/></svg>';
const geometryHandles={nw:'左上角缩放',n:'上边缩放',ne:'右上角缩放',e:'右边缩放',se:'右下角缩放',s:'下边缩放',sw:'左下角缩放',w:'左边缩放',rotate:'旋转图形'};
for(const [handle,label]of Object.entries(geometryHandles)){const button=document.createElement('button');button.className='geometry-handle';button.dataset.transformHandle=handle;button.setAttribute('aria-label',label);button.title=label;geometryOverlay.append(button);}
viewport.append(geometryOverlay);
const shapeNames={rect:'矩形',roundRect:'圆角矩形',circle:'圆形',ellipse:'椭圆',triangle:'三角形',diamond:'菱形',star:'五角星',heart:'爱心'};
const geometryHitCanvas=document.createElement('canvas');geometryHitCanvas.width=geometryHitCanvas.height=1;
const geometryHitContext=geometryHitCanvas.getContext('2d');
const ranges = [
  ['type-ranges','fontSize','字号',20,100,1,'%'], ['type-ranges','letterSpacing','字距',-15,50,1,''],
  ['type-ranges','lineHeight','行距',75,180,1,'%'], ['type-ranges','stretchX','横向拉伸',50,160,1,'%'],
  ['type-ranges','stretchY','纵向拉伸',50,160,1,'%'], ['type-ranges','expand','膨胀 / 收缩',-8,12,1,''],
  ['type-ranges','roundness','字形圆角',0,100,1,'%'],
  ['type-ranges','warp','轻微扭曲',0,15,1,''],
  ['image-ranges','contrast','明暗对比',20,250,1,'%'], ['image-ranges','threshold','剪影阈值',5,95,1,'%'],
  ['draw-ranges','brushSize','画笔粗细',2,140,1,''],
  ['shape-ranges','shapeAngle','图形角度',-180,180,1,'°'],
  ['effect-ranges','density','上墨量',15,100,1,'%'], ['effect-ranges','distress','缺墨程度',0,100,1,'%'],
  ['effect-ranges','scale','纹理尺度',10,90,1,''],
  ['effect-ranges','diffusion','扩散深度',0,100,1,'%'],
  ['effect-ranges','roughness','边缘粗糙',0,100,1,'%'], ['effect-ranges','edgeScale','边缘颗粒大小',0,100,1,''],
  ['advanced-ranges','grain','细碎颗粒',0,100,1,'%'], ['advanced-ranges','edge','边缘磨损',0,100,1,'%'],
  ['advanced-ranges','clarity','肌理清晰度',0,100,1,'%'],
  ['advanced-ranges','angle','滚动方向',0,180,1,'°'], ['advanced-ranges','pressure','印压起伏',0,100,1,'%'],
  ['advanced-ranges','overlap','重叠滚印',0,100,1,'%'],
  ['advanced-ranges','spread','扩散起伏',0,100,1,'%'],
  ['paper-ranges','paperTexture','纸纹强度',0,100,1,'%'], ['canvas-ranges','padding','画面留白',0,25,1,'%'],
  ['quick-ranges','density','上墨量',15,100,1,'%'], ['quick-ranges','distress','缺墨程度',0,100,1,'%'],
  ['quick-ranges','scale','纹理尺度',10,90,1,'']
];
for (const [parent, key, label, min, max, step, unit] of ranges) {
  const el = document.createElement('label'); el.className = 'range-row'; el.dataset.range = key;
  el.innerHTML = `<span><span>${label}</span><span class="range-value"><input class="range-number" aria-label="${label}数值" type="number" min="${min}" max="${max}" step="${step}" data-number="${key}"><span class="range-unit">${unit}</span></span></span><input aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" data-key="${key}">`;
  $('#' + parent).append(el);
}
const edgeHint=document.createElement('p');edgeHint.className='control-note';edgeHint.textContent='颗粒大小越低越细碎；粗糙强度 80–100 可形成墨团，黏连邻近笔画。';
$('#effect-ranges').append(edgeHint);
for(const item of ROLLER_TEXTURES)$('#roller-texture').add(new Option(item.name,item.id));
const rollerCache=new Map();
function originalRollerURL(item){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=item.fullSrc;
    script.onload=()=>{const url=globalThis.__inkRollSources?.[item.id];if(url){delete globalThis.__inkRollSources[item.id];resolve(url);}else reject(new Error('缺少高清肌理'));script.remove();};
    script.onerror=()=>{script.remove();reject(new Error('缺少高清肌理文件'));};
    document.head.append(script);
  });
}
async function ensureRoller(id){
  if(!rollerCache.has(id))rollerCache.set(id,(async()=>{
    const item=ROLLER_TEXTURES.find(t=>t.id===id)||ROLLER_TEXTURES[0],img=new Image();img.src=await originalRollerURL(item);await img.decode();
    const map={id:item.id,...inkMapFromImage(img,item.crop)};
    img.src='';return map;
  })());
  const promise=rollerCache.get(id);rollerCache.delete(id);rollerCache.set(id,promise);
  while(rollerCache.size>2)rollerCache.delete(rollerCache.keys().next().value);
  try{return await promise;}catch(error){if(rollerCache.get(id)===promise)rollerCache.delete(id);throw new Error('高清肌理载入失败，请将 assets/rollers 文件夹与页面一起保留后重试');}
}
$('#roller-texture').onchange=e=>setState('rollerTexture',e.target.value);

function colorField(parent, key, label) {
  $(parent).innerHTML = `<label class="color-field"><span class="color-field-name">${label}</span><span class="color-field-inputs"><input class="hex-input" aria-label="${label} HEX" data-hex="${key}" maxlength="7" spellcheck="false"><input class="color-picker" aria-label="${label}取色" type="color" data-color-key="${key}"></span><span class="hex-error" hidden>请输入有效颜色，如 #287FB0</span></label>`;
}
colorField('#ink-color-field', 'ink', '油墨颜色'); colorField('#quick-ink-color','ink','油墨颜色'); colorField('#paper-color-field','paperColor','底材颜色');

function setState(key, value) {
  state[key] = value;
  sync(); if (!['brushSize','shapeAngle'].includes(key)) schedulePreview();
}
function sync() {
  $('#font-family').value=state.font; updateFontNote();
  $$('[data-key]').forEach(el => el.value = state[el.dataset.key]);
  $$('[data-number]').forEach(el => { if (document.activeElement !== el) el.value = state[el.dataset.number]; });
  $$('[data-hex]').forEach(el => { if (document.activeElement !== el) el.value = state[el.dataset.hex].toUpperCase(); });
  $$('[data-color-key]').forEach(el => el.value = state[el.dataset.colorKey]);
  $$('[data-source]').forEach(el => active(el, state.source === el.dataset.source));
  $$('[data-mode]').forEach(el => active(el, state.mode === el.dataset.mode));
  $$('[data-method]').forEach(el => active(el, state.method === el.dataset.method));
  $$('[data-bg]').forEach(el => active(el, state.background === el.dataset.bg));
  $$('[data-color]').forEach(el => el.classList.toggle('active', state.ink.toLowerCase() === el.dataset.color.toLowerCase()));
  $$('[data-ratio]').forEach(el => active(el, el.dataset.canvas === state.canvasPreset));
  active($('#canvas-custom'),state.canvasPreset==='custom');
  for(const key of ['width','height'])if(document.activeElement!==$('#canvas-'+key))$('#canvas-'+key).value=state[key==='width'?'canvasWidth':'canvasHeight'];
  $('#canvas-size-note').textContent=`画布尺寸 · ${state.canvasWidth} × ${state.canvasHeight} px${Math.max(state.canvasWidth,state.canvasHeight)>4096?'；PNG 可在导出面板选择长边，最高 4096 px':''}`;
  $('#text-source').hidden = state.source !== 'text'; $('#image-source').hidden = state.source !== 'image'; $('#draw-source').hidden = state.source !== 'draw';
  $('#source-kind').textContent = {text:'TEXT',image:'IMAGE',draw:'DRAW'}[state.source];
  $('#text-count').textContent = `${state.text.replace(/\n/g,'').length} / 400`;
  $('#invert').checked = state.invert;
  $$('[data-range="threshold"]').forEach(el => el.hidden = state.method !== 'silhouette');
  for (const key of ['angle','pressure','overlap','clarity']) $$(`[data-range="${key}"]`).forEach(el => el.hidden = state.mode !== 'roller');
  for (const key of ['diffusion','spread']) $$(`[data-range="${key}"]`).forEach(el => el.hidden = state.mode !== 'stamp');
  $('#roller-controls').hidden=state.mode!=='roller';edgeHint.hidden=state.mode!=='stamp';
  $('#roller-texture').value=state.rollerTexture;
  const material=ROLLER_TEXTURES.find(t=>t.id===state.rollerTexture)||ROLLER_TEXTURES[0];
  if($('#roller-reference-image').dataset.id!==material.id){$('#roller-reference-image').src=material.src;$('#roller-reference-image').dataset.id=material.id;}
  $('#roller-reference-name').textContent=material.name;
  $('#paper-color-field').hidden = !['solid','paper'].includes(state.background); $('#paper-ranges').hidden = state.background !== 'paper';
  $('#background-image-controls').hidden=state.background!=='image';
  $('#background-info').hidden=!backgroundImage;$('#upload-background').hidden=!!backgroundImage;$('#background-fit-field').hidden=!backgroundImage;$('#background-fit').value=state.backgroundFit;
  const hasBackground=state.background==='image'&&!!backgroundImage;
  wrap.classList.toggle('has-image-background',hasBackground);
  if(hasBackground){wrap.style.setProperty('--uploaded-background',`url("${backgroundURL}")`);wrap.style.setProperty('--background-fit',state.backgroundFit);}else wrap.style.removeProperty('--uploaded-background');
  $('#svg-background-note').hidden=state.background!=='image';
  syncExportBackground();
  $('#art-meta').innerHTML = `${state.mode === 'roller' ? '滚墨拓印' : '干墨印章'} <i>·</i> ${state.canvasWidth} × ${state.canvasHeight}`;
  viewport.classList.toggle('drawing-ready', state.source === 'draw');
  $('#draw-empty').hidden = state.source !== 'draw' || strokes.length > 0 || !!currentStroke;
  $('#undo-draw').disabled = !drawHistory.length; $('#redo-draw').disabled = !drawFuture.length; $('#clear-draw').disabled = !strokes.length;
  syncDrawTools();
  $$('[data-range="padding"]').forEach(el => el.hidden = state.source === 'draw');
  updateDimensions(); updateViewHint(); updateFit(false);
}
function active(el, value) { el.classList.toggle('active', value); el.setAttribute('aria-pressed', String(value)); }
function syncDrawTools(){
  const shape=DRAW_SHAPES.has(drawTool),select=drawTool==='select';
  $$('[data-draw-tool]').forEach(el=>active(el,drawTool===el.dataset.drawTool));
  $$('[data-draw-operation]').forEach(el=>active(el,drawOperation===el.dataset.drawOperation));
  $('#shape-settings').hidden=!shape;$('#draw-ranges').hidden=shape||select;
  $('#geometry-selection').hidden=!select;
  $('#draw-help').innerHTML=select?'拖动图形移动；拖动框上八个点缩放、上方圆点旋转。<br>Shift 保持比例／15° 旋转 · Alt 点击切换重叠图形<br>方向键微移 · Delete 删除 · Ctrl/⌘ Z 撤销':shape?'在画布上拖拽定大小，松开进入自由变换。<br>Shift 等比绘制 · V 选择／变换 · 空格＋拖动平移':'在右侧画布上绘制，松开即生成印刷效果。<br>V 选择／变换 · 空格＋拖动平移 · Ctrl/⌘ Z 撤销';
  $('#draw-empty strong').textContent=select?'先绘制一个图形':shape?'拖拽放置图形':'从第一笔开始';
  $('#draw-empty small').textContent=shape?(drawOperation==='subtract'?'先叠加图形或画笔，再用图形镂空':'图形可叠加或镂空 · 松开生成肌理'):'直接在画布绘制 · 松开生成肌理';
  viewport.classList.toggle('geometry-select-ready',state.source==='draw'&&select);
  syncGeometrySelection();
}
function syncExportBackground(){
  const hasImage=state.background==='image'&&!!backgroundImage;
  const transparent=state.background==='transparent'||(state.background==='image'&&(!backgroundImage||!includeImageBackground));
  $('#png-background-option').hidden=!hasImage;
  $('#png-include-background').checked=includeImageBackground;
  $('#png-background-note').textContent=hasImage
    ?(includeImageBackground?'图片背景 · PNG 保留背景':'仅导出印记元素 · 透明背景，保留画布尺寸与位置')
    :transparent?'透明背景 · 缺墨区域透明':state.background==='paper'?'纸纹背景 · 保留底材':'纯色背景 · 保留底材';
  $('#download-png span:last-child').textContent=transparent?'下载透明 PNG':'下载 PNG 图片';
}
$('#png-include-background').onchange=e=>{includeImageBackground=e.target.checked;syncExportBackground();};
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 4200); }
function status(message, busy = false) { $('#render-status').textContent = message; $('#render-status').classList.toggle('busy', busy); }
function dimensions(longSide, ratio = state.ratio) { return ratio >= 1 ? [longSide, Math.max(1, Math.round(longSide / ratio))] : [Math.max(1, Math.round(longSide * ratio)), longSide]; }

document.addEventListener('input', event => {
  const el = event.target;
  if (el.matches('[data-key],[data-number]')) {
    if (!el.value.trim()) return;
    const value = clamp(Number(el.value), Number(el.min), Number(el.max));
    if (Number.isFinite(value)) setState(el.dataset.key || el.dataset.number, value);
  }
  if (el.matches('[data-color-key]')) setState(el.dataset.colorKey, el.value);
  if (el.matches('[data-hex]')) {
    const normalized = el.value.startsWith('#') ? el.value : '#' + el.value;
    if (/^#[\da-f]{6}$/i.test(normalized)) { el.setAttribute('aria-invalid','false'); el.closest('label').querySelector('.hex-error').hidden = true; setState(el.dataset.hex, normalized); }
  }
});
$$('[data-number]').forEach(el => el.addEventListener('blur', () => { el.value = state[el.dataset.number]; }));
$$('[data-hex]').forEach(el => {
  function commit() {
    let value = el.value.trim().replace(/^#/,'');
    if (/^[\da-f]{3}$/i.test(value)) value = value.split('').map(c => c + c).join('');
    const valid = /^[\da-f]{6}$/i.test(value);
    el.setAttribute('aria-invalid', String(!valid)); el.closest('label').querySelector('.hex-error').hidden = valid;
    if (valid) { setState(el.dataset.hex, '#' + value); el.value = '#' + value.toUpperCase(); }
  }
  el.addEventListener('blur', commit);
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); el.blur(); } if (e.key === 'Escape') { el.value = state[el.dataset.hex]; commit(); el.blur(); } });
});
$('#text-input').addEventListener('input', e => setState('text',e.target.value));
$('#font-family').addEventListener('change', e => setState('font',e.target.value));
$('#invert').addEventListener('change', e => setState('invert',e.target.checked));
$$('[data-source]').forEach(el => el.onclick = () => { setCompare(false); setState('source', el.dataset.source); });
$$('[data-method]').forEach(el => el.onclick = () => setState('method',el.dataset.method));
$$('[data-bg]').forEach(el => el.onclick = () => {if(el.dataset.bg!=='image')backgroundLoadId++;setState('background',el.dataset.bg);});
$$('[data-color]').forEach(el => el.onclick = () => setState('ink',el.dataset.color));
function setCanvasSize(width,height,preset='custom'){
  Object.assign(state,{canvasWidth:width,canvasHeight:height,ratio:width/height,canvasPreset:preset});
  $('#export-size').value=Math.min(4096,Math.max(width,height));
  sync();updateFit(true);schedulePreview();
}
$$('[data-ratio]').forEach(el => el.onclick = () => setCanvasSize(Number(el.dataset.width),Number(el.dataset.height),el.dataset.canvas));
function customCanvasSize(swap=false){
  const width=Number($('#canvas-width').value),height=Number($('#canvas-height').value);
  if(![width,height].every(v=>Number.isInteger(v)&&v>=1&&v<=32768)){toast('请输入 1–32768 之间的整数宽高');return;}
  setCanvasSize(swap?height:width,swap?width:height);
}
$('#canvas-custom').onclick=()=>{state.canvasPreset='custom';sync();$('#canvas-width').focus();$('#canvas-width').select();};
$('#apply-canvas').onclick=()=>customCanvasSize();$('#swap-canvas').onclick=()=>customCanvasSize(true);
for(const el of [$('#canvas-width'),$('#canvas-height')])el.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();customCanvasSize();}};

const modeDefaults = {
  roller:{density:85,distress:45,grain:66,pressure:74,edge:24,scale:57,roughness:22,edgeScale:31,angle:89,overlap:16,clarity:55},
  stamp:{density:96,distress:74,grain:70,edge:24,scale:44,diffusion:42,spread:75,roughness:26,edgeScale:28}
};
$$('[data-mode]').forEach(el => el.onclick = () => { state.mode = el.dataset.mode; Object.assign(state,modeDefaults[state.mode]);sync();schedulePreview(); });
function reseed() { state.seed = (state.seed + 104729) | 0; schedulePreview(); }
$('#reseed').onclick = reseed; $('#quick-reseed').onclick = reseed;
$('#reset').onclick = () => {
  const preserve = Object.fromEntries(['source','text','font','ratio','canvasWidth','canvasHeight','canvasPreset','background','backgroundFit','paperColor','paperTexture','brushSize','shapeAngle','mode','rollerTexture'].map(k => [k,state[k]]));
  state = { ...defaults, ...preserve, ...modeDefaults[preserve.mode] }; $('#text-input').value = state.text; sync(); schedulePreview(); toast('效果参数已恢复，素材已保留');
};

function panel(name) {
  $('#edit-panel').hidden = name !== 'edit'; $('#export-panel').hidden = name !== 'export';
  for (const key of ['edit','export']) { $('#' + key + '-tab').classList.toggle('active', key === name); $('#' + key + '-tab').setAttribute('aria-selected', String(key === name)); }
  $('#ink-controls-scroll').scrollTop = 0;
  updateGeometryOverlay();
}
$('#edit-tab').onclick = () => panel('edit'); $('#export-tab').onclick = () => panel('export'); $('#quick-export').onclick = () => panel('export');
$$('[data-size]').forEach(el => el.onclick = () => { $('#export-size').value = el.dataset.size; updateDimensions(); });
$('#export-size').oninput = updateDimensions;
$('#export-size').onblur = () => { $('#export-size').value = exportLongSide(); updateDimensions(); };
function exportLongSide() { return Math.round(clamp(Number($('#export-size').value) || 2048,1,4096)); }
function updateDimensions() {
  const value = exportLongSide(), [w,h] = dimensions(value);
  $('#export-dimensions').textContent = `${w} × ${h} px`;
  $$('[data-size]').forEach(el => active(el, Number(el.dataset.size) === value));
}

async function loadImage(file) {
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) { toast('请选择小于 30 MB 的图片'); return; }
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|jfif|webp|svg|avif)$/i.test(file.name)) { toast('请选择 PNG、JPG、WEBP 或 SVG 图片'); return; }
  const url = URL.createObjectURL(file), img = new Image();
  try {
    img.src = url; await img.decode();
    if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 100_000_000 || Math.max(img.naturalWidth,img.naturalHeight)>32768) throw new Error('图片尺寸过大，请先缩小后重试');
    if (imageURL) URL.revokeObjectURL(imageURL);
    imageURL = url; image = img;
    $('#image-thumb').src = url; $('#image-name').textContent = file.name; $('#image-name').title = file.name;
    $('#image-size').textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
    $('#image-info').hidden = false; $('#upload-image').hidden = true;
    setCompare(false);state.source='image';
    if(state.background!=='image'||!backgroundImage)setCanvasSize(img.naturalWidth,img.naturalHeight);else{sync();schedulePreview();}
    toast('图片已载入');
  } catch (error) { URL.revokeObjectURL(url); toast(error.message === 'The source image cannot be decoded.' ? '无法读取这张图片，请换一个文件' : error.message); }
}
$('#upload-image').onclick = $('#replace-image').onclick = () => $('#image-file').click();
$('#image-file').onchange = e => { loadImage(e.target.files[0]); e.target.value = ''; };
async function loadBackground(file){
  if(!file)return;
  if(file.size>30*1024*1024){toast('请选择小于 30 MB 的背景图片');return;}
  if(!/^image\//.test(file.type)&&! /\.(png|jpe?g|jfif|webp|svg|avif)$/i.test(file.name)){toast('请选择 PNG、JPG、WEBP 或 SVG 背景图片');return;}
  const id=++backgroundLoadId,url=URL.createObjectURL(file),img=new Image();
  try{
    img.src=url;await img.decode();
    if(id!==backgroundLoadId){URL.revokeObjectURL(url);return;}
    if(!img.naturalWidth||img.naturalWidth*img.naturalHeight>100_000_000||Math.max(img.naturalWidth,img.naturalHeight)>32768)throw new Error('背景图片尺寸过大，请先缩小后重试');
    if(backgroundURL)URL.revokeObjectURL(backgroundURL);
    backgroundImage=img;backgroundURL=url;state.background='image';state.backgroundFit='cover';
    $('#background-thumb').src=url;$('#background-name').textContent=file.name;$('#background-name').title=file.name;
    $('#background-size').textContent=`${img.naturalWidth} × ${img.naturalHeight} px · 画布已匹配`;
    setCanvasSize(img.naturalWidth,img.naturalHeight);toast('背景已载入，画布已匹配图片尺寸');
  }catch(error){URL.revokeObjectURL(url);if(id===backgroundLoadId)toast(error.message==='The source image cannot be decoded.'?'无法读取这张背景图片，请换一个文件':error.message||'无法读取背景图片');}
}
$('#upload-background').onclick=$('#replace-background').onclick=()=>$('#background-file').click();
$('#background-file').onchange=e=>{loadBackground(e.target.files[0]);e.target.value='';};
$('#background-fit').onchange=e=>setState('backgroundFit',e.target.value);
$('#remove-background').onclick=()=>{backgroundLoadId++;if(backgroundURL)URL.revokeObjectURL(backgroundURL);backgroundImage=null;backgroundURL=null;$('#background-thumb').removeAttribute('src');setState('background','transparent');toast('背景图片已移除');};
function drawBackground(ctx,img,w,h,fit){
  const scale=(fit==='contain'?Math.min:Math.max)(w/img.naturalWidth,h/img.naturalHeight),width=img.naturalWidth*scale,height=img.naturalHeight*scale;
  ctx.drawImage(img,(w-width)/2,(h-height)/2,width,height);
}
let dragDepth = 0;
document.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); dragDepth++; $('#drop-overlay').hidden = false; } });
document.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('dragleave', () => { dragDepth = Math.max(0,dragDepth-1); if (!dragDepth) $('#drop-overlay').hidden = true; });
document.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#drop-overlay').hidden = true; loadImage(e.dataTransfer.files[0]); });
document.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (f) { e.preventDefault(); loadImage(f); } });
$('#upload-font').onclick = () => $('#font-file').click();
$('#font-file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 40 * 1024 * 1024) throw new Error('请选择小于 40 MB 的字体');
    const face = new FontFace('UserInkFont', await file.arrayBuffer()); await face.load();
    if (customFont) document.fonts.delete(customFont); customFont = face; document.fonts.add(face);
    let option = $('#font-family option[value="custom"]'); if (!option) { option = new Option('', 'custom'); $('#font-family').add(option); }
    option.textContent = file.name.replace(/\.[^.]+$/,''); $('#font-family').value = 'custom'; setState('font','custom'); toast('字体已载入');
  } catch { toast('字体载入失败，请选择有效的 TTF、OTF 或 WOFF 字体'); }
  e.target.value = '';
};

const fontFamilies = { sans:'"Microsoft YaHei", "PingFang SC", sans-serif', serif:'"SimSun", "Songti SC", serif', mono:'"InstrumentMono", "Microsoft YaHei", monospace', custom:'"UserInkFont", "Microsoft YaHei", sans-serif' };
const builtinFonts=new Map([...BUILTIN_FONTS,...ENGLISH_FONTS].map(item=>[item.id,item])),fontLoads=new Map(),fontFaces=new Map(),fontErrors=new Map(),localFontFiles=new Map(),localFontMissing=new Set();
for(const japanese of [false,true]){
  const group=document.createElement('optgroup');group.label=japanese?'日系字体 · 部分简体缺字':'内置字体';
  for(const item of BUILTIN_FONTS.filter(item=>item.japanese===japanese)){
    group.append(new Option(`${item.name} · ${item.style}`,item.id));
    fontFamilies[item.id]=`"${item.family}", "Microsoft YaHei", "PingFang SC", sans-serif`;
  }
  $('#font-family').append(group);
}
for(const [status,label]of [['commercial','英文 · 可商用'],['conditional','英文 · 商用需告知作者'],['personal','英文 · 非商用']]){
  const group=document.createElement('optgroup');group.label=label;
  for(const item of ENGLISH_FONTS.filter(item=>item.licenseStatus===status)){
    const option=new Option(`${item.name} · ${item.licenseLabel}`,item.id);option.title=item.licenseNote;group.append(option);
    fontFamilies[item.id]=`"${item.family}", "Microsoft YaHei", "PingFang SC", sans-serif`;
  }
  $('#font-family').append(group);
}
function syncFontLicense(){
  const item=builtinFonts.get(state.font),english=item?.language==='en';
  $('#font-license-note').hidden=!english;$('#font-license-link').hidden=!english||!item.licenseURL;
  if(english){$('#font-license-note').textContent=`${item.licenseLabel} · ${item.licenseNote}`;$('#font-license-note').dataset.license=item.licenseStatus;if(item.licenseURL)$('#font-license-link').href=item.licenseURL;}
  $('#load-local-typefaces').hidden=!english||!item.localOnly||!localFontMissing.has(item.id);
  $('#font-export-license').hidden=!english||state.source!=='text';
  if(english)$('#font-export-license').textContent=`当前字体：${item.name} · ${item.licenseLabel}${item.licenseInferred?'（素材包标注，授权待核对）':''}${item.licenseStatus==='personal'?'。导出仅供个人非商业使用。':item.licenseStatus==='conditional'?'。商用请按随附说明告知作者。':''}`;
}
function hasFontCharacter(item,code){
  let low=0,high=item.ranges.length-1;
  while(low<=high){const mid=(low+high)>>1,[start,end]=item.ranges[mid];if(code<start)high=mid-1;else if(code>end)low=mid+1;else return true;}return false;
}
function updateFontNote(){
  syncFontLicense();
  const item=builtinFonts.get(state.font),note=$('#font-note');$('#retry-font').hidden=!item||!fontErrors.has(item.id);
  if(!item){note.textContent=state.font==='custom'?'已载入本地字体，可继续调整字形参数。':'内置字体选中后载入，每款保留一个常用字重。';return;}
  if(fontErrors.has(item.id)){note.textContent=fontErrors.get(item.id);return;}
  if(!fontFaces.has(item.id)){note.textContent=item.localOnly&&localFontMissing.has(item.id)?'未找到本机原字体。请点击下方按钮，选择「ANYU分享【卷曲】英文字体合集」文件夹；字体只在本机读取。':`正在载入「${item.name}」${item.bytes>40*1024*1024?'，文件较大，首次载入请稍候':'…'}`;return;}
  const missing=[...new Set([...state.text].filter(char=>!(/\s/u.test(char))&&!hasFontCharacter(item,char.codePointAt(0))))];
  note.textContent=`已载入 · ${item.style}${missing.length?`；缺少「${missing.slice(0,10).join('、')}${missing.length>10?'…':''}」，使用系统字体补齐。`:'；可继续调整膨胀、圆角等参数。'}`;
}
function packedFont(item){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=item.src;
    script.onload=()=>{const data=globalThis.__inkFontPayloads?.[item.id];delete globalThis.__inkFontPayloads?.[item.id];script.remove();data?resolve(data):reject(new Error('字体文件内容不完整'));};
    script.onerror=()=>{script.remove();reject(new Error('找不到字体文件，请保留随附的 assets/typefaces 文件夹'));};document.head.append(script);
  });
}
async function ensureFont(id){
  const item=builtinFonts.get(id);if(!item)return;
  if(!fontFaces.has(id)){
    if(!fontLoads.has(id)){
      fontErrors.delete(id);
      fontLoads.set(id,(async()=>{
        let bytes;
        if(item.localOnly){
          const local=localFontFiles.get(id);
          if(local)bytes=await local.arrayBuffer();
          else if(['127.0.0.1','localhost'].includes(location.hostname)&&!localFontMissing.has(id)){
            try{const response=await fetch(new URL(item.localSrc,location.href));if(response.ok)bytes=await response.arrayBuffer();}catch{}
          }
          if(!bytes){localFontMissing.add(id);return null;}
          const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
          if(digest!==item.sha256)throw new Error('字体与已核对的原文件不一致，请选择原字体文件夹');
        }else{
          const payload=await packedFont(item),packed=await (await fetch('data:application/gzip;base64,'+payload)).blob();
          bytes=await new Response(packed.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        }
        const face=new FontFace(item.family,bytes,{weight:String(item.weight),style:'normal'});await face.load();return face;
      })());
    }
    updateFontNote();
    try{const face=await fontLoads.get(id);if(!face)return;fontFaces.set(id,face);document.fonts.add(face);localFontMissing.delete(id);}
    catch(error){const message=`「${item.name}」载入失败：${error.message}`;fontErrors.set(id,message);throw new Error(message);}
    finally{fontLoads.delete(id);updateFontNote();}
  }
  const face=fontFaces.get(id);fontFaces.delete(id);fontFaces.set(id,face);
  for(const [key,value]of fontFaces){if(fontFaces.size<=3)break;if(key!==state.font&&key!==id){document.fonts.delete(value);fontFaces.delete(key);}}
  updateFontNote();
}
$('#retry-font').onclick=()=>{fontErrors.delete(state.font);schedulePreview();};
$('#load-local-typefaces').onclick=()=>$('#local-typefaces-files').click();
$('#local-typefaces-files').onchange=e=>{
  const files=[...e.target.files];let count=0;
  for(const item of ENGLISH_FONTS.filter(item=>item.localOnly)){
    const relative=item.sourceFont.replaceAll('\\','/'),file=files.find(f=>f.webkitRelativePath.replaceAll('\\','/').endsWith('/'+relative));
    if(file){localFontFiles.set(item.id,file);localFontMissing.delete(item.id);fontErrors.delete(item.id);count++;}
  }
  if(count){updateFontNote();schedulePreview();toast(`已连接 ${count} 款本机英文字体`);}else toast('未找到对应原字体，请选择「ANYU分享【卷曲】英文字体合集」文件夹');e.target.value='';
};
function sourceCanvas(w,h,cfg, sourceImage = image, sourceStrokes = strokes) {
  const canvas = document.createElement('canvas'); canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const padding = cfg.padding / 100, availW = w*(1-padding*2), availH = h*(1-padding*2);
  if (cfg.source === 'text' && cfg.text.trim() && (!builtinFonts.get(cfg.font)?.localOnly||fontFaces.has(cfg.font))) {
    const lines = cfg.text.replace(/\r/g,'').split('\n'), family=fontFamilies[cfg.font];
    const base=100, gap=cfg.letterSpacing/4, line=base*cfg.lineHeight/100;
    ctx.font=`${builtinFonts.get(cfg.font)?.weight??900} ${base}px ${family}`;
    const joinedEnglish=builtinFonts.get(cfg.font)?.language==='en'&&gap===0;
    const widths=lines.map(str=>joinedEnglish?ctx.measureText(str).width:[...str].reduce((sum,char)=>sum+ctx.measureText(char).width,0)+Math.max(0,[...str].length-1)*gap);
    const fullW=Math.max(...widths,1), fullH=(lines.length-1)*line+base*1.16;
    const stretchX=cfg.stretchX/100,stretchY=cfg.stretchY/100;
    const fit=Math.min(availW/fullW,availH/fullH)*cfg.fontSize/100;
    ctx.translate(w/2,h/2); ctx.scale(fit*stretchX,fit*stretchY); ctx.fillStyle='#000'; ctx.textBaseline='alphabetic';
    // Measure actual glyph bounds so Chinese and Latin share a balanced vertical centre.
    const measure=ctx.measureText(lines.find(v=>v.trim()) || 'M');
    const ascent=measure.actualBoundingBoxAscent || 80, descent=measure.actualBoundingBoxDescent || 10;
    const start= -((lines.length-1)*line + ascent + descent)/2 + ascent;
    lines.forEach((str,row)=> { let x=-widths[row]/2;if(joinedEnglish){ctx.fillText(str,x,start+row*line);return;}for (const char of [...str]) { ctx.fillText(char,x,start+row*line); x+=ctx.measureText(char).width+gap; } });
  } else if (cfg.source === 'image' && sourceImage) {
    const fit=Math.min(availW/sourceImage.naturalWidth,availH/sourceImage.naturalHeight), iw=sourceImage.naturalWidth*fit, ih=sourceImage.naturalHeight*fit;
    ctx.drawImage(sourceImage,(w-iw)/2,(h-ih)/2,iw,ih);
  } else if (cfg.source === 'draw') {
    sourceStrokes.forEach(stroke => drawMark(ctx,stroke,w,h));
  }
  return canvas;
}
function canvasInput(w,h,cfg,sourceImage=image,sourceStrokes=strokes) {
  const canvas=sourceCanvas(w,h,cfg,sourceImage,sourceStrokes), pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  let transparent=0, nonzero=0;
  // Exclude the empty canvas outside an image when deciding if the image has its own alpha.
  if (cfg.source === 'image' && sourceImage) {
    const probe=document.createElement('canvas'); probe.width=96; probe.height=96; const p=probe.getContext('2d',{willReadFrequently:true}); p.drawImage(sourceImage,0,0,96,96);
    const data=p.getImageData(0,0,96,96).data;
    for(let j=3;j<data.length;j+=4) { if(data[j]<250) transparent++; if(data[j]>0) nonzero++; }
  }
  return { pixels, config:{...cfg,hasTransparency:transparent>8 && nonzero>0} };
}
function schedulePreview() {
  generation++; pendingPreview=true; clearTimeout(previewTimer);
  if(currentStroke||geometryGesture) return;
  previewTimer=setTimeout(runPreview,70); status('正在上墨…',true);
}
async function runPreview() {
  if(previewRunning || !pendingPreview || currentStroke || geometryGesture) return;
  pendingPreview=false; previewRunning=true; currentRevision=generation;
  try{
    const cfg={...state},id=currentRevision;if(cfg.background==='image')cfg.background='transparent';
    previewTargetLong=desiredPreviewLong();
    const [w,h]=dimensions(previewTargetLong,cfg.ratio);
    if(cfg.mode==='roller')cfg.rollerMap=await ensureRoller(cfg.rollerTexture);
    if(cfg.source==='text')await ensureFont(cfg.font);
    if(id!==generation){previewRunning=false;if(pendingPreview)runPreview();return;}
    const {pixels,config}=canvasInput(w,h,cfg);
    previewWorker.postMessage({id,type:'preview',pixels:pixels.buffer,width:w,height:h,config},[pixels.buffer]);
  }catch(error){previewRunning=false;if(currentRevision===generation){status('预览生成失败');toast(error.message);}if(pendingPreview)runPreview();}
}
previewWorker.onmessage=({data})=> {
  if(data.progress!==undefined) return;
  previewRunning=false;
  if(data.error) { status('预览失败'); toast(data.error); if(pendingPreview) runPreview(); return; }
  if(data.id===generation && !currentStroke && !geometryGesture) {
    art.width=data.width; art.height=data.height; original.width=data.width; original.height=data.height;
    art.getContext('2d',{willReadFrequently:true}).putImageData(new ImageData(new Uint8ClampedArray(data.pixels),data.width,data.height),0,0);
    original.getContext('2d',{willReadFrequently:true}).putImageData(new ImageData(new Uint8ClampedArray(data.original),data.width,data.height),0,0);
    live.hidden=true; art.hidden=false;
    if(state.source==='image' && !image) status('上传图片以开始');
    else if(state.source==='draw' && !strokes.length) status('等待第一笔');
    else if(state.source==='text' && !state.text.trim()) status('输入文字以开始');
    else if(state.source==='text'&&builtinFonts.get(state.font)?.localOnly&&!fontFaces.has(state.font))status('载入本机原字体以开始');
    else status(`已生成 · 高清预览 ${Math.max(data.width,data.height)} px`);
    sync();
  }
  if(pendingPreview) runPreview();
};
previewWorker.onerror=()=> {previewRunning=false;status('预览不可用');toast('处理线程出错，请刷新页面重试');};

function hasContent(cfg) { return cfg.source==='text' ? !!cfg.text.trim() : cfg.source==='image' ? !!image : strokes.some(s=>s.tool!=='eraser'&&s.operation!=='subtract'); }
function download(blob,extension,cfg) {
  const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url;
  const now=new Date(),pad=(value,length=2)=>String(value).padStart(length,'0');
  const timestamp=`${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${pad(now.getMilliseconds(),3)}`;
  a.download=`滚墨印记_${cfg.mode==='roller'?'滚墨拓印':'干墨印章'}_${timestamp}_${pad(++downloadSerial)}.${extension}`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function exportArt(type) {
  if(exporting) return;
  const cfg={...state}, detail=$('#svg-detail').value, [outW,outH]=dimensions(exportLongSide(),cfg.ratio);
  const backgroundForExport=cfg.background==='image'&&includeImageBackground?backgroundImage:null,sourceForExport=image,strokesForExport=structuredClone(strokes);
  if(!hasContent(cfg)&&!(type==='png'&&backgroundForExport)) {toast('请先输入文字、上传图片或绘制内容');return;}
  exporting=true; $('#download-png').disabled=$('#download-svg').disabled=true; $('#export-progress').hidden=false;
  $('#progress-title').textContent=type==='svg'?'正在生成矢量路径':'正在生成高清 PNG'; $('#progress-message').textContent='保留当前纹理，请稍候…';
  const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  try {
    await new Promise(requestAnimationFrame);
    const vectorLong={low:700,medium:1100,high:2560}[detail];
    const [w,h]=type==='svg'?dimensions(vectorLong,cfg.ratio):[outW,outH];
    if(type==='svg'||cfg.background==='image') cfg.background='transparent';
    if(cfg.mode==='roller')cfg.rollerMap=await ensureRoller(cfg.rollerTexture);
    if(cfg.source==='text')await ensureFont(cfg.font);
    if(cfg.source==='text'&&builtinFonts.get(cfg.font)?.localOnly&&!fontFaces.has(cfg.font))throw new Error('请先在字体面板载入本机原字体');
    const {pixels,config}=canvasInput(w,h,cfg,sourceForExport,strokesForExport);
    const result=await new Promise((resolve,reject)=>{
      worker.onmessage=({data})=>{
        if(data.error) {reject(new Error(data.error));return;}
        if(data.progress!==undefined) { $('#progress-message').textContent=`${data.phase==='vector'?'正在描摹纹理':'正在处理油墨'} · ${Math.round(data.progress*100)}%`;return; }
        resolve(data);
      };
      worker.onerror=()=>reject(new Error('导出线程出错，请稍后重试'));
      worker.postMessage({id:1,type,pixels:pixels.buffer,width:w,height:h,config,outputW:outW,outputH:outH,detail},[pixels.buffer]);
    });
    if(type==='svg') {
      const blob=new Blob([result.svg],{type:'image/svg+xml;charset=utf-8'}); download(blob,'svg',cfg);
      toast(`SVG 已导出 · ${(blob.size/1024/1024).toFixed(2)} MB · 透明路径`);
    } else {
      const canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;
      const ctx=canvas.getContext('2d');ctx.putImageData(new ImageData(new Uint8ClampedArray(result.pixels),outW,outH),0,0);
      if(backgroundForExport){ctx.globalCompositeOperation='destination-over';drawBackground(ctx,backgroundForExport,outW,outH,cfg.backgroundFit);}
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')); if(!blob)throw new Error('PNG 编码失败');
      download(blob,'png',cfg);toast(`PNG 已导出 · ${outW} × ${outH} px`);
    }
  } catch(error) {toast(error.message || '导出失败，请缩小尺寸后重试');}
  finally {worker.terminate();exporting=false;$('#export-progress').hidden=true;$('#download-png').disabled=$('#download-svg').disabled=false;}
}
$('#download-png').onclick=()=>exportArt('png');$('#download-svg').onclick=()=>exportArt('svg');

let zoom=1,panX=0,panY=0,hand=false,space=false,panning=null;
function desiredPreviewLong(){
  const side=Math.max(parseFloat(wrap.style.getPropertyValue('--fit-width'))||900,parseFloat(wrap.style.getPropertyValue('--fit-height'))||900);
  return clamp(Math.ceil(side*zoom*(window.devicePixelRatio||1)/256)*256,1024,4096);
}
function requestViewQuality(){if(desiredPreviewLong()!==previewTargetLong)schedulePreview();}
function invalidateDetailView(){
  const wasDetail=detailValid||detailPending||detailRunning;
  detailRevision++;detailValid=false;detailArt.hidden=detailOriginal.hidden=true;clearTimeout(detailTimer);detailPending=false;
  const side=Math.max(parseFloat(wrap.style.getPropertyValue('--fit-width'))||0,parseFloat(wrap.style.getPropertyValue('--fit-height'))||0)*zoom*(window.devicePixelRatio||1);
  if(currentStroke||geometryGesture||side<=4096){if(wasDetail&&!currentStroke&&!geometryGesture&&!previewRunning&&!pendingPreview&&art.width)status(`已生成 · 高清预览 ${Math.max(art.width,art.height)} px`);return;}
  detailPending=true;status('正在细化放大区域…',true);detailTimer=setTimeout(runDetailView,120);
}
async function runDetailView(){
  if(!detailPending||detailRunning||previewRunning||pendingPreview||currentStroke||geometryGesture)return;
  detailPending=false;detailRunning=true;
  const id=detailRevision,baseRevision=generation,cfg={...state},dpr=window.devicePixelRatio||1;
  if(cfg.background==='image')cfg.background='transparent';
  try{
    const box=wrap.getBoundingClientRect(),view=viewport.getBoundingClientRect();
    const left=box.left+wrap.clientLeft,top=box.top+wrap.clientTop;
    const fullWidth=Math.round(wrap.clientWidth*dpr),fullHeight=Math.round(wrap.clientHeight*dpr);
    const x=Math.max(0,Math.floor((view.left-left-16)*dpr)),y=Math.max(0,Math.floor((view.top-top-16)*dpr));
    const right=Math.min(fullWidth,Math.ceil((view.right-left+16)*dpr)),bottom=Math.min(fullHeight,Math.ceil((view.bottom-top+16)*dpr));
    if(right<=x||bottom<=y){detailRunning=false;status('已生成 · 作品在视区外');return;}
    const region={x,y,width:right-x,height:bottom-y,fullWidth,fullHeight};
    cfg.previewRegion=region;
    if(cfg.mode==='roller')cfg.rollerMap=await ensureRoller(cfg.rollerTexture);
    if(cfg.source==='text')await ensureFont(cfg.font);
    if(id!==detailRevision||baseRevision!==generation){detailRunning=false;if(detailPending)runDetailView();return;}
    const [w,h]=dimensions(4096,cfg.ratio),{pixels,config}=canvasInput(w,h,cfg);
    detailJob={id,baseRevision,region,dpr};
    detailWorker.postMessage({id,type:'detail',pixels:pixels.buffer,width:w,height:h,config},[pixels.buffer]);
  }catch(error){detailRunning=false;status('放大细节生成失败');toast(error.message);if(detailPending)runDetailView();}
}
detailWorker.onmessage=({data})=>{
  detailRunning=false;const job=detailJob;
  if(job&&data.id===detailRevision&&job.baseRevision===generation&&!currentStroke&&!geometryGesture){
    if(data.error){status('放大细节生成失败');toast(data.error);}
    else{
      for(const [canvas,buffer]of [[detailArt,data.pixels],[detailOriginal,data.original]]){
        canvas.width=data.width;canvas.height=data.height;
        canvas.style.left=job.region.x/job.dpr+'px';canvas.style.top=job.region.y/job.dpr+'px';
        canvas.style.width=data.width/job.dpr+'px';canvas.style.height=data.height/job.dpr+'px';
        canvas.getContext('2d',{willReadFrequently:true}).putImageData(new ImageData(new Uint8ClampedArray(buffer),data.width,data.height),0,0);
      }
      detailValid=true;detailArt.hidden=compare;detailOriginal.hidden=!compare;status('已生成 · 放大区域原图取样');
    }
  }
  if(detailPending)runDetailView();
};
detailWorker.onerror=()=>{detailRunning=false;status('放大细节暂不可用');};
function updateFit(reset=false) {
  const rect=viewport.getBoundingClientRect(), padding=window.innerWidth<=900?38:60;
  const width=Math.max(60,rect.width-padding),height=Math.max(60,rect.height-padding),ratio=state.ratio;
  const fitW=Math.min(width,height*ratio),fitH=fitW/ratio;
  wrap.style.setProperty('--fit-width',`${fitW}px`);wrap.style.setProperty('--fit-height',`${fitH}px`);
  if(reset){zoom=1;panX=panY=0;} updateTransform();requestViewQuality();
}
function updateTransform() {
  // Give the canvas its real displayed size. Scaling a small composited parent
  // can magnify a downsampled texture even when the canvas bitmap is 4096px.
  wrap.style.width=(parseFloat(wrap.style.getPropertyValue('--fit-width'))*zoom)+'px';
  wrap.style.height=(parseFloat(wrap.style.getPropertyValue('--fit-height'))*zoom)+'px';
  wrap.style.transform=`translate(${panX}px,${panY}px)`;
  $('#zoom-label').textContent=Math.round(zoom*100)+'%';viewport.classList.toggle('is-pan-ready',hand||space);
  invalidateDetailView();
  updateGeometryOverlay();
}
function zoomTo(value,clientX,clientY) {
  const old=zoom;zoom=clamp(value,.1,8);
  if(clientX!==undefined){const rect=viewport.getBoundingClientRect(),x=clientX-rect.left-rect.width/2,y=clientY-rect.top-rect.height/2;panX=x-(x-panX)*zoom/old;panY=y-(y-panY)*zoom/old;}
  updateTransform();requestViewQuality();
}
$('#fit').onclick=()=>updateFit(true);$('#zoom-in').onclick=()=>zoomTo(zoom*1.25);$('#zoom-out').onclick=()=>zoomTo(zoom/1.25);
$('#pan').onclick=()=>{hand=!hand;active($('#pan'),hand);updateTransform();};
viewport.addEventListener('wheel',e=>{e.preventDefault();if(!geometryGesture&&!currentStroke)zoomTo(zoom*Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);},{passive:false});
if(typeof ResizeObserver==='function')new ResizeObserver(()=>updateFit()).observe(viewport);
else window.addEventListener('resize',()=>updateFit());
// Zoom, display scaling and mobile browser chrome may resize the visual viewport.
window.visualViewport?.addEventListener('resize',()=>updateFit());
function setCompare(value){compare=value;active($('#compare'),value);original.hidden=!value;$('.compare-badge').hidden=!value;detailArt.hidden=!detailValid||value;detailOriginal.hidden=!detailValid||!value;updateGeometryOverlay();}
$('#compare').onclick=()=>setCompare(!compare);
let view='paper';
$$('[data-view]').forEach(el=>el.onclick=()=>{view=el.dataset.view;wrap.classList.remove('view-paper','view-checker','view-dark');wrap.classList.add('view-'+view);$$('[data-view]').forEach(b=>active(b,b===el));updateViewHint();});
function updateViewHint() {$('#view-hint').textContent=`${state.background==='transparent'?'透明作品':state.background==='paper'?'纸纹作品':state.background==='image'?'图片背景':'纯色作品'} · ${{paper:'纸色',checker:'棋盘格',dark:'深底'}[view]}预览`;}

function drawLive() {
  invalidateDetailView();
  const [w,h]=dimensions(900), c=sourceCanvas(w,h,{...state,source:'draw'},null,currentStroke?[...strokes,currentStroke]:strokes);
  live.width=w;live.height=h;const ctx=live.getContext('2d');ctx.drawImage(c,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle=state.ink;ctx.fillRect(0,0,w,h);
  live.hidden=false;art.hidden=true;original.hidden=true;$('#draw-empty').hidden=true;
}
function artworkScreenRect(){const rect=wrap.getBoundingClientRect();return {left:rect.left+wrap.clientLeft,top:rect.top+wrap.clientTop,width:rect.width-wrap.clientLeft*2,height:rect.height-wrap.clientTop*2};}
function artworkPoint(e){const rect=artworkScreenRect();return {x:(e.clientX-rect.left)/rect.width*state.canvasWidth,y:(e.clientY-rect.top)/rect.height*state.canvasHeight};}
function drawPoint(e){const p=artworkPoint(e);return [clamp(p.x/state.canvasWidth),clamp(p.y/state.canvasHeight)];}
function selectedGeometryIndex(){return selectedGeometry?strokes.findIndex(mark=>mark.id===selectedGeometry&&DRAW_SHAPES.has(mark.tool)):-1;}
function syncGeometrySelection(){
  const selected=selectedGeometryIndex();if(selected<0)selectedGeometry=null;
  const select=$('#geometry-element');select.replaceChildren(new Option('点击画面选择图形',''));
  let count=0;for(const mark of strokes)if(DRAW_SHAPES.has(mark.tool)){count++;select.add(new Option(`${String(count).padStart(2,'0')} · ${shapeNames[mark.tool]}${mark.operation==='subtract'?' · 镂空':''}`,mark.id));}
  select.value=selectedGeometry||'';select.disabled=!count;
  $('#geometry-selected-controls').hidden=selected<0;updateGeometryOverlay();
}
function updateGeometryOverlay(){
  const index=selectedGeometryIndex(),show=index>=0&&state.source==='draw'&&drawTool==='select'&&!$('#edit-panel').hidden&&!compare&&!currentStroke&&!hand&&!space;
  geometryOverlay.hidden=!show;if(!show)return;
  const mark=strokes[index],g=geometryOf(mark,state.canvasWidth,state.canvasHeight),rect=artworkScreenRect(),viewRect=viewport.getBoundingClientRect();
  if(!g)return;
  const screen=p=>({x:rect.left-viewRect.left+p.x/state.canvasWidth*rect.width,y:rect.top-viewRect.top+p.y/state.canvasHeight*rect.height});
  const positions={nw:[-.5,-.5],n:[0,-.5],ne:[.5,-.5],e:[.5,0],se:[.5,.5],s:[0,.5],sw:[-.5,.5],w:[-.5,0]};
  const points={};for(const [name,[x,y]]of Object.entries(positions))points[name]=screen(geometryPoint(g,x*g.width,y*g.height));
  const corners=['nw','ne','se','sw'].map(name=>`${points[name].x},${points[name].y}`).join(' ');
  for(const polygon of geometryOverlay.querySelectorAll('polygon')){polygon.setAttribute('points',corners);polygon.setAttribute('stroke-dasharray',mark.operation==='subtract'?'4 3':'');}
  const angle=g.rotation*Math.PI/180;points.rotate={x:points.n.x+Math.sin(angle)*28,y:points.n.y-Math.cos(angle)*28};
  for(const line of geometryOverlay.querySelectorAll('line'))for(const [key,value]of Object.entries({x1:points.n.x,y1:points.n.y,x2:points.rotate.x,y2:points.rotate.y}))line.setAttribute(key,value);
  for(const button of geometryOverlay.querySelectorAll('[data-transform-handle]')){
    const name=button.dataset.transformHandle,p=points[name];button.style.left=p.x+'px';button.style.top=p.y+'px';
    if(name!=='rotate'){
      const base={e:0,w:0,se:45,nw:45,n:90,s:90,ne:135,sw:135}[name],direction=((Math.round((base+g.rotation)/45)%4)+4)%4;
      button.style.cursor=['ew-resize','nwse-resize','ns-resize','nesw-resize'][direction];
    }
  }
  if(document.activeElement!==$('#geometry-angle'))$('#geometry-angle').value=Math.round(g.rotation*10)/10;
  $('#geometry-info').textContent=`${Math.round(g.width)} × ${Math.round(g.height)} px${mark.operation==='subtract'?' · 镂空':''}`;
}
function hitGeometry(point,cycle=false){
  const selected=selectedGeometryIndex();
  if(selected>=0&&!cycle){const g=geometryOf(strokes[selected],state.canvasWidth,state.canvasHeight),a=-g.rotation*Math.PI/180,dx=point.x-g.cx,dy=point.y-g.cy;
    if(Math.abs(dx*Math.cos(a)-dy*Math.sin(a))<=g.width/2&&Math.abs(dx*Math.sin(a)+dy*Math.cos(a))<=g.height/2)return selected;
  }
  const hits=[];
  for(let i=strokes.length-1;i>=0;i--){const mark=strokes[i];if(!DRAW_SHAPES.has(mark.tool))continue;
    drawMark(geometryHitContext,mark,state.canvasWidth,state.canvasHeight);
    if(geometryHitContext.isPointInPath(point.x,point.y))hits.push(i);
  }
  if(hits.length){const current=hits.indexOf(selectedGeometryIndex());return cycle?hits[(current+1)%hits.length]:hits[0];}
  return -1;
}
function beginGeometryGesture(e,index,handle){
  selectedGeometry=strokes[index].id;geometryGesture={pointerId:e.pointerId,index,handle,before:strokes,g:geometryOf(strokes[index],state.canvasWidth,state.canvasHeight),start:artworkPoint(e),changed:false};
  e.preventDefault();viewport.focus({preventScroll:true});viewport.setPointerCapture(e.pointerId);generation++;setCompare(false);syncGeometrySelection();viewport.classList.add('geometry-transforming');
}
function moveGeometryGesture(e){
  const gesture=geometryGesture;if(!gesture||gesture.pointerId!==e.pointerId)return;
  const p=artworkPoint(e),dx=p.x-gesture.start.x,dy=p.y-gesture.start.y,base=gesture.g;let g;
  if(gesture.handle==='move'){
    const mx=e.shiftKey&&Math.abs(dx)<Math.abs(dy)?0:dx,my=e.shiftKey&&Math.abs(dy)<=Math.abs(dx)?0:dy;
    g={...base,cx:base.cx+mx,cy:base.cy+my};
  }else if(gesture.handle==='rotate'){
    let rotation=base.rotation+(Math.atan2(p.y-base.cy,p.x-base.cx)-Math.atan2(gesture.start.y-base.cy,gesture.start.x-base.cx))*180/Math.PI;
    if(e.shiftKey)rotation=Math.round(rotation/15)*15;g={...base,rotation};
  }else{const screen=artworkScreenRect();g=resizeGeometry(base,gesture.handle,dx,dy,e.shiftKey,3*state.canvasWidth/screen.width,3*state.canvasHeight/screen.height);}
  gesture.changed=['cx','cy','width','height','rotation'].some(key=>Math.abs(g[key]-base[key])>1e-7);
  strokes=gesture.before.slice();strokes[gesture.index]=withGeometry(gesture.before[gesture.index],g,state.canvasWidth,state.canvasHeight);
  drawLive();updateGeometryOverlay();status(gesture.handle==='rotate'?'正在旋转图形…':gesture.handle==='move'?'正在移动图形…':'正在缩放图形…',true);
}
function endGeometryGesture(commit=true){
  const gesture=geometryGesture;if(!gesture)return;
  geometryGesture=null;viewport.classList.remove('geometry-transforming');
  if(commit&&gesture.changed){drawHistory.push(gesture.before);drawFuture=[];}else strokes=gesture.before;
  sync();schedulePreview();
}
function editSelectedGeometry(g){
  const index=selectedGeometryIndex();if(index<0)return;
  const next=withGeometry(strokes[index],g,state.canvasWidth,state.canvasHeight);if(JSON.stringify(next)===JSON.stringify(strokes[index]))return;
  drawHistory.push(strokes);strokes=strokes.slice();strokes[index]=next;drawFuture=[];sync();schedulePreview();
}
function deleteGeometry(){const index=selectedGeometryIndex();if(index<0)return;drawHistory.push(strokes);strokes=strokes.filter((_,i)=>i!==index);selectedGeometry=null;drawFuture=[];sync();schedulePreview();}
$('#geometry-element').onchange=e=>{selectedGeometry=e.target.value||null;syncGeometrySelection();};
$('#delete-geometry').onclick=deleteGeometry;
$('#geometry-angle').onchange=e=>{const index=selectedGeometryIndex(),rotation=Number(e.target.value);if(index<0||!e.target.value.trim()||!Number.isFinite(rotation))return;editSelectedGeometry({...geometryOf(strokes[index],state.canvasWidth,state.canvasHeight),rotation:clamp(rotation,-180,180)});};
$('#geometry-angle').onkeydown=e=>{if(e.key==='Enter')e.target.blur();};
viewport.addEventListener('pointerdown',e=>{
  const inArt=!!e.target.closest('#canvas-wrap');
  if(currentStroke||geometryGesture)return;
  const handle=e.target.closest('[data-transform-handle]')?.dataset.transformHandle;
  if(e.button===1 || ((hand||space) && e.button===0)) {
    e.preventDefault();viewport.setPointerCapture(e.pointerId);panning={id:e.pointerId,x:e.clientX,y:e.clientY,px:panX,py:panY};viewport.classList.add('is-panning');return;
  }
  if(state.source==='draw'&&drawTool==='select'&&e.button===0){
    const index=handle?selectedGeometryIndex():hitGeometry(artworkPoint(e),e.altKey);
    if(index>=0){beginGeometryGesture(e,index,handle||'move');return;}
    selectedGeometry=null;syncGeometrySelection();
    if(inArt){e.preventDefault();viewport.focus({preventScroll:true});return;}
  }
  if(!inArt&&e.button===0){e.preventDefault();viewport.setPointerCapture(e.pointerId);panning={id:e.pointerId,x:e.clientX,y:e.clientY,px:panX,py:panY};viewport.classList.add('is-panning');return;}
  if(state.source!=='draw'||!inArt||e.button!==0||currentStroke)return;
  e.preventDefault();setCompare(false);generation++;drawPointer=e.pointerId;viewport.setPointerCapture(e.pointerId);
  currentStroke={tool:drawTool,size:state.brushSize,points:[drawPoint(e)],operation:DRAW_SHAPES.has(drawTool)?drawOperation:'add',rotation:state.shapeAngle,constrain:e.shiftKey};
  if(DRAW_SHAPES.has(drawTool)){currentStroke.id='shape-'+(++geometrySerial);currentStroke.points.push(drawPoint(e));}
  updateGeometryOverlay();
  drawLive();status(DRAW_SHAPES.has(drawTool)?(drawOperation==='subtract'?'正在镂空…':'正在绘制图形…'):'正在手绘…');
});
viewport.addEventListener('pointermove',e=>{
  if(panning?.id===e.pointerId){panX=panning.px+e.clientX-panning.x;panY=panning.py+e.clientY-panning.y;updateTransform();return;}
  if(geometryGesture){moveGeometryGesture(e);return;}
  if(!currentStroke||drawPointer!==e.pointerId)return;
  if(DRAW_SHAPES.has(currentStroke.tool)){currentStroke.points[1]=drawPoint(e);currentStroke.constrain=e.shiftKey;}
  else{const events=e.getCoalescedEvents?.()||[e];for(const ev of events){const p=drawPoint(ev),last=currentStroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])>.0004)currentStroke.points.push(p);}}
  drawLive();
});
function finishPointer(e){
  if(panning?.id===e.pointerId){panning=null;viewport.classList.remove('is-panning');}
  if(geometryGesture?.pointerId===e.pointerId){if(e.type==='pointerup')moveGeometryGesture(e);endGeometryGesture(e.type==='pointerup');return;}
  if(currentStroke&&drawPointer===e.pointerId){
    const shape=DRAW_SHAPES.has(currentStroke.tool);
    if(shape&&e.type==='pointerup'){currentStroke.points[1]=drawPoint(e);currentStroke.constrain=e.shiftKey;}
    if(e.type==='pointerup'&&(!shape||shapeBox(currentStroke,state.canvasWidth,state.canvasHeight))){drawHistory.push(strokes);strokes=[...strokes,currentStroke];drawFuture=[];if(shape){selectedGeometry=currentStroke.id;drawTool='select';}}
    currentStroke=null;drawPointer=null;sync();schedulePreview();
  }
}
viewport.addEventListener('pointerup',finishPointer);viewport.addEventListener('pointercancel',finishPointer);
viewport.addEventListener('lostpointercapture',finishPointer);
$$('[data-draw-tool]').forEach(el=>el.onclick=()=>{drawTool=el.dataset.drawTool;syncDrawTools();});
$$('[data-draw-operation]').forEach(el=>el.onclick=()=>{drawOperation=el.dataset.drawOperation;syncDrawTools();});
function undoDraw(){if(!drawHistory.length)return;drawFuture.push(strokes);strokes=drawHistory.pop();sync();schedulePreview();}
function redoDraw(){if(!drawFuture.length)return;drawHistory.push(strokes);strokes=drawFuture.pop();sync();schedulePreview();}
$('#undo-draw').onclick=undoDraw;$('#redo-draw').onclick=redoDraw;
$('#clear-draw').onclick=()=>{if(!strokes.length)return;drawHistory.push(strokes);strokes=[];drawFuture=[];sync();schedulePreview();toast('画布已清空，可撤销恢复');};

document.addEventListener('keydown',e=>{
  const typing=e.target.matches('input,textarea,select,[contenteditable="true"]');
  if(e.code==='Space'&&!typing){e.preventDefault();space=true;updateTransform();}
  if(e.key==='Escape'){$('#theme-menu').hidden=true;$('#theme-toggle').setAttribute('aria-expanded','false');closeInspector();closeWechat();if(geometryGesture)endGeometryGesture(false);else if(!typing){selectedGeometry=null;syncGeometrySelection();}}
  if(!typing&&state.source==='draw'&&!currentStroke&&!geometryGesture){
    if((e.key.toLowerCase()==='v'&&!e.ctrlKey&&!e.metaKey)||((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='t')){
      e.preventDefault();drawTool='select';if(selectedGeometryIndex()<0)selectedGeometry=strokes.findLast(mark=>DRAW_SHAPES.has(mark.tool))?.id||null;syncDrawTools();
    }
    const index=selectedGeometryIndex();
    if(drawTool==='select'&&index>=0){
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteGeometry();}
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
      if(delta){e.preventDefault();const g=geometryOf(strokes[index],state.canvasWidth,state.canvasHeight),step=e.shiftKey?10:1;editSelectedGeometry({...g,cx:g.cx+delta[0]*step,cy:g.cy+delta[1]*step});}
    }
  }
  if(!typing&&geometryGesture&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();endGeometryGesture(false);return;}
  if(!typing&&state.source==='draw'&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redoDraw():undoDraw();}
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;updateTransform();}});
window.addEventListener('blur',()=>{space=false;if(geometryGesture)endGeometryGesture(false);updateTransform();});

function setTheme(theme){document.documentElement.dataset.uiTheme=theme;try{localStorage.setItem('rolling-ink-theme',theme);}catch{}$$('[data-theme]').forEach(b=>active(b,b.dataset.theme===theme));$('#theme-toggle').innerHTML=icon(theme==='dark'?'moon':'sun');}
try{const saved=localStorage.getItem('rolling-ink-theme');if(['light','ivory','dark'].includes(saved))setTheme(saved);}catch{}
$('#theme-toggle').onclick=()=>{const open=$('#theme-menu').hidden;$('#theme-menu').hidden=!open;$('#theme-toggle').setAttribute('aria-expanded',String(open));};
$$('[data-theme]').forEach(el=>el.onclick=()=>{setTheme(el.dataset.theme);$('#theme-menu').hidden=true;$('#theme-toggle').setAttribute('aria-expanded','false');});
document.addEventListener('pointerdown',e=>{
  if(!e.target.closest('.creator-wechat'))closeWechat();
  if(!e.target.closest('.theme-corner')){$('#theme-menu').hidden=true;$('#theme-toggle').setAttribute('aria-expanded','false');}
  if(!e.target.closest('#inspector,#inspector-toggle')&&!e.target.closest('#canvas-wrap'))closeInspector();
});
function closeInspector(){$('#inspector').hidden=true;active($('#inspector-toggle'),false);}
function closeWechat(){$('#wechat-card').hidden=true;$('#wechat-toggle').setAttribute('aria-expanded','false');}
$('#wechat-toggle').onclick=()=>{const open=$('#wechat-card').hidden;$('#wechat-card').hidden=!open;$('#wechat-toggle').setAttribute('aria-expanded',String(open));};
$('#inspector-toggle').onclick=()=>{const show=$('#inspector').hidden;$('#inspector').hidden=!show;active($('#inspector-toggle'),show);clampInspector();};
$('#inspector-close').onclick=closeInspector;
let inspectorDrag=null;
function clampInspector(){const el=$('#inspector');if(el.hidden)return;const r=el.getBoundingClientRect();el.style.left=clamp(r.left,8,Math.max(8,innerWidth-r.width-8))+'px';el.style.top=clamp(r.top,8,Math.max(8,innerHeight-r.height-8))+'px';el.style.right='auto';}
$('#inspector-grip').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;const r=$('#inspector').getBoundingClientRect();inspectorDrag={x:e.clientX,y:e.clientY,left:r.left,top:r.top};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();});
$('#inspector-grip').addEventListener('pointermove',e=>{if(!inspectorDrag)return;const el=$('#inspector');el.style.left=inspectorDrag.left+e.clientX-inspectorDrag.x+'px';el.style.top=inspectorDrag.top+e.clientY-inspectorDrag.y+'px';el.style.right='auto';clampInspector();});
$('#inspector-grip').addEventListener('pointerup',()=>inspectorDrag=null);
$('#inspector-grip').addEventListener('pointercancel',()=>inspectorDrag=null);
window.addEventListener('resize',clampInspector);

function modeSamples(){for(const mode of ['stamp','roller']){const c=$('#'+mode+'-sample'),ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(3,3,c.width-6,c.height-6);const data=ctx.getImageData(0,0,c.width,c.height);const result=render(data.data,c.width,c.height,{...defaults,...modeDefaults[mode],source:'draw',mode,ink:'#287fb0',background:'paper'});ctx.putImageData(new ImageData(result.pixels,c.width,c.height),0,0);}}
sync();modeSamples();
(async()=>{
 const item=ROLLER_TEXTURES.find(t=>t.id===defaults.rollerTexture),image=new Image();image.src=item.src;await image.decode();
 const map=inkMapFromImage(image,{left:0,top:0,width:item.width,height:item.height});image.src='';return map;
})().then(map=>{const c=$('#roller-sample'),ctx=c.getContext('2d'),p=new Uint8ClampedArray(c.width*c.height*4);for(let i=3;i<p.length;i+=4)p[i]=255;const result=render(p,c.width,c.height,{...defaults,...modeDefaults.roller,source:'draw',mode:'roller',rollerMap:map,background:'paper'});ctx.putImageData(new ImageData(result.pixels,c.width,c.height),0,0);}).catch(()=>{});
document.fonts.ready.then(()=>schedulePreview());
