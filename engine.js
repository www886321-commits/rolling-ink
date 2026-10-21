// Deterministic, resolution-independent ink fields. No uploaded data leaves the browser.
export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = t => t * t * (3 - 2 * t);
export function hash(x, y, seed) {
  let h = Math.imul(x ^ seed, 374761393) ^ Math.imul(y + seed, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function field(size, seed) {
  const n = size + 2, data = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) data[y * n + x] = hash(x, y, seed);
  return { n, size, data };
}
function noise(f, x, y) {
  x = clamp(x) * f.size; y = clamp(y) * f.size;
  const ix = x | 0, iy = y | 0, fx = smooth(x - ix), fy = smooth(y - iy), i = iy * f.n + ix, a = f.data;
  return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + f.n] * (1 - fx) + a[i + f.n + 1] * fx) * fy;
}
function sample(a, w, h, x, y) {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 0;
  const ix = x | 0, iy = y | 0, dx = x - ix, dy = y - iy, j = iy * w + ix;
  const nx = Math.min(ix + 1, w - 1), ny = Math.min(iy + 1, h - 1);
  return (a[j] * (1 - dx) + a[iy * w + nx] * dx) * (1 - dy) + (a[ny * w + ix] * (1 - dx) + a[ny * w + nx] * dx) * dy;
}
function sampleChannel(a,w,h,x,y,k){
  if(x<0||y<0||x>w-1||y>h-1)return 0;
  const ix=x|0,iy=y|0,nx=Math.min(ix+1,w-1),ny=Math.min(iy+1,h-1),dx=x-ix,dy=y-iy;
  return (a[(iy*w+ix)*4+k]*(1-dx)+a[(iy*w+nx)*4+k]*dx)*(1-dy)+(a[(ny*w+ix)*4+k]*(1-dx)+a[(ny*w+nx)*4+k]*dx)*dy;
}
function morph(a, w, h, radius) {
  const r = Math.abs(radius), useMax = radius > 0;
  if (!r) return a;
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length), queue = new Int32Array(Math.max(w, h) + 2 * r + 2);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass ? tmp : a, dst = pass ? out : tmp, rows = pass ? w : h, cols = pass ? h : w;
    for (let row = 0; row < rows; row++) {
      let head = 0, tail = 0;
      const val = i => i < 0 || i >= cols ? 0 : src[pass ? i * w + row : row * w + i];
      for (let i = -r; i < cols + r; i++) {
        const v = val(i);
        while (tail > head && (useMax ? val(queue[tail - 1]) <= v : val(queue[tail - 1]) >= v)) tail--;
        queue[tail++] = i;
        while (tail > head && queue[head] < i - 2 * r) head++;
        if (i >= r) dst[pass ? (i - r) * w + row : row * w + i - r] = val(queue[head]);
      }
    }
  }
  return out;
}
function blurPass(src,w,h,r,horizontal) {
  const out=new Float32Array(src.length),rows=horizontal?h:w,cols=horizontal?w:h;
  for(let row=0;row<rows;row++){
    const at=x=>x<0||x>=cols?0:src[horizontal?row*w+x:x*w+row];
    let total=0;for(let x=-r;x<=r;x++)total+=at(x);
    for(let x=0;x<cols;x++){
      out[horizontal?row*w+x:x*w+row]=total/(r*2+1);
      total+=at(x+r+1)-at(x-r);
    }
  }
  return out;
}
function roundCorners(mask,w,h,amount) {
  if(!amount)return mask;
  const radius=Math.max(1,Math.round(amount/100*12*Math.max(w,h)/1000));
  let blurred=mask;
  // A curvature filter rounds convex and concave corners. The local stroke
  // support protects thin strokes and detached dots from disappearing.
  for(let i=0;i<3;i++){blurred=blurPass(blurred,w,h,radius,true);blurred=blurPass(blurred,w,h,radius,false);}
  const support=morph(contourDistance(mask,w,h),w,h,radius*3);
  const out=new Float32Array(mask.length);
  for(let i=0;i<mask.length;i++){
    const blend=smooth(clamp((support[i]-radius*.7)/(radius*1.1)));
    const rounded=clamp((blurred[i]-.5)*Math.max(4,radius*3)+.5);
    out[i]=mask[i]*(1-blend)+rounded*blend;
  }
  return out;
}
// Distance to the source contour, including counters and disconnected strokes.
// Two chamfer passes keep a 4096px export linear in the number of pixels.
export function contourDistance(mask, w, h, canvasBoundary = true) {
  const d=new Float32Array(w*h), diagonal=Math.SQRT2;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;
    if(mask[i]<.08){d[i]=0;continue;}
    let v=canvasBoundary?Math.min(x+1,y+1,w-x,h-y):1e9;
    if(x)v=Math.min(v,d[i-1]+1);if(y)v=Math.min(v,d[i-w]+1);
    if(x&&y)v=Math.min(v,d[i-w-1]+diagonal);if(y&&x<w-1)v=Math.min(v,d[i-w+1]+diagonal);
    d[i]=v;
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
    const i=y*w+x;if(!d[i])continue;
    let v=d[i];if(x<w-1)v=Math.min(v,d[i+1]+1);if(y<h-1)v=Math.min(v,d[i+w]+1);
    if(x<w-1&&y<h-1)v=Math.min(v,d[i+w+1]+diagonal);if(x&&y<h-1)v=Math.min(v,d[i+w-1]+diagonal);d[i]=v;
  }
  return d;
}
export function sourceMask(pixels, w, h, config) {
  const a = new Float32Array(w * h);
  const alphaOnly = config.source === 'text' || config.source === 'draw' || (config.method === 'silhouette' && config.hasTransparency);
  const contrast = (config.contrast ?? 100) / 100, threshold = (config.threshold ?? 50) / 100;
  for (let i = 0; i < a.length; i++) {
    const j = i * 4, alpha = pixels[j + 3] / 255;
    let v = alphaOnly ? 1 : clamp(((1 - (pixels[j] * .2126 + pixels[j + 1] * .7152 + pixels[j + 2] * .0722) / 255) - .5) * contrast + .5);
    if (config.invert && config.source === 'image') v = 1 - v;
    if (config.source === 'image' && config.method === 'silhouette' && !alphaOnly) v = clamp((v - threshold) * 50 + .5);
    a[i] = v * alpha;
  }
  const rounded=config.source==='text'?roundCorners(a,w,h,config.roundness||0):a;
  return morph(rounded, w, h, Math.round((config.expand || 0) * Math.max(w, h) / 1000));
}
function inkFields(cfg) {
  const seed=cfg.seed|0,scale=Math.pow(2,(50-(cfg.scale??48))/34);
  return {
    coarse:field(Math.round(8*scale),seed+1),clouds:field(Math.round(29*scale),seed+7),
    medium:field(Math.round(105*scale),seed+19),fine:field(Math.round(410*scale),seed+39),
    edge:field(Math.round((1250-(cfg.edgeScale??28)*10.2)*scale),seed+101)
  };
}
function inkParticles(mid,speck,grit,fleck,grain) {
  return .20*mid+.60*speck+(.06+.09*grain)*grit+(.14-.09*grain)*fleck;
}
// A level set driven by the same multi-scale ink field as the interior.
// There are no circular stamps, repeated scallops or contour opacity bands.
// High strength grows irregular connected ink clusters beyond the silhouette.
export function granularContour(mask,w,h,cfg,texture=inkFields(cfg)) {
  const amount=clamp((cfg.roughness||0)/100);
  if(!amount)return mask;
  const seed=cfg.seed|0,size=Math.max(w,h),px=size/1000,sx=w/size,sy=h/size;
  const inward=contourDistance(mask,w,h),inverse=new Uint8Array(mask.length);
  for(let i=0;i<mask.length;i++)inverse[i]=mask[i]<.08?1:0;
  const outward=contourDistance(inverse,w,h,false),result=new Float32Array(mask);
  const grain=(cfg.grain??60)/100,wear=(cfg.edge??24)/100;
  const amplitude=amount*(8+amount*32),growth=Math.max(0,amount-.60)**2*200;
  const reach=growth+amplitude*.75+2;
  const preserveTone=cfg.source==='image'&&cfg.method==='tone';
  // Extend nearby ink tone into the contour band before moving that contour.
  // Multiplying by the original mask here would cut off every outward particle.
  // Only this narrow band borrows tone; the interior and distant paper stay intact.
  const edgeTone=preserveTone?morph(mask,w,h,Math.max(1,Math.ceil((reach+1)*px))):null;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,d=(inward[i]-outward[i])/px;
    if(d>reach)continue;
    if(d< -reach){result[i]=0;continue;}
    const u=(x+.5)/size,v=(y+.5)/size,uu=u/sx,vv=v/sy;
    const broad=noise(texture.coarse,uu,vv),cloud=noise(texture.clouds,uu,vv),mid=noise(texture.medium,uu,vv);
    const speck=noise(texture.edge,uu,vv),grit=hash(Math.floor(u*1400),Math.floor(v*1400),seed+71);
    const fleck=hash(Math.floor(u*800),Math.floor(v*800),seed+97);
    const particles=inkParticles(mid,speck,grit,fleck,grain);
    const cluster=(broad-.5)*.30+(cloud-.5)*.30+(mid-.5)*.15;
    const fractured=(particles-.5)*2.8+cluster-wear*.045;
    const coverage=clamp((d+growth+amplitude*fractured)*px+.5);
    const toneBlend=preserveTone?smooth(clamp(d/2)):0;
    const tone=preserveTone?mask[i]*toneBlend+edgeTone[i]*(1-toneBlend):1;
    result[i]=coverage*tone;
  }
  return result;
}
const mirror=v=>{const p=((v%2)+2)%2;return p<=1?p:2-p;};
function scanValue(plane,u,v){
  return sample(plane.data,plane.width,plane.height,mirror(u)*(plane.width-1),mirror(v)*(plane.height-1))/255;
}
function realRollerSampler(cfg,w,h){
  const map=cfg.rollerMap;if(!map?.data?.length)return null;
  const low=map.low||map,size=Math.max(w,h),sx=w/size,sy=h/size,aspect=map.width/map.height;
  const angle=((cfg.angle??90)-90)*Math.PI/180,ca=Math.cos(angle),sa=Math.sin(angle);
  const zoom=Math.pow(2,((cfg.scale??50)-50)/50);
  const cover=Math.max((Math.abs(ca)*sx+Math.abs(sa)*sy)/aspect,Math.abs(sa)*sx+Math.abs(ca)*sy)*zoom;
  const seed=cfg.seed|0,shiftX=(hash(1,3,seed+521)-.5)*.14,shiftY=(hash(5,7,seed+617)-.5)*.16;
  const density=(cfg.density??84)/100,distress=(cfg.distress??48)/100,pressure=(cfg.pressure??58)/100,grain=(cfg.grain??66)/100,overlap=(cfg.overlap??16)/100;
  const clarity=clamp((cfg.clarity??0)/100),du=2/Math.max(1,map.width-1),dv=2/Math.max(1,map.height-1);
  function deposit(u,v){
    let raw=scanValue(map,u,v);const broad=scanValue(low,u,v);
    // Paper is an empty mask, never a grey base tone. All subsequent controls
    // are multiplicative so neither low-frequency pressure nor detail
    // smoothing can introduce ink where the scan contains none.
    const cut=.025+distress*.25;
    if(raw<=cut)return 0;
    if(clarity){
      // Local contrast from original scan pixels, independent of preview/export size.
      // Test raw paper first: sharpening must never grow an ink halo into a hole.
      const nearby=(scanValue(map,u-du,v)+scanValue(map,u+du,v)+scanValue(map,u,v-dv)+scanValue(map,u,v+dv))*.25;
      raw=clamp(raw+(raw-nearby)*clarity*2);
      if(raw<=cut)return 0;
    }
    const printed=(raw-cut)/(1-cut),broadInk=clamp((broad-cut)/(1-cut));
    const localBase=broadInk+.02;
    const detailed=localBase*Math.pow(printed/localBase,.55+grain*.95);
    const pressureGain=(.75+pressure*.50)*Math.exp((broadInk-.5)*(pressure-.5)*1.6);
    return clamp(Math.pow(clamp(detailed*pressureGain),1.15-density*.70)*(.45+density*.65));
  }
  return (u,v)=>{
    const dx=u-sx/2,dy=v-sy/2;
    const tx=(dx*ca+dy*sa)/(cover*aspect)+.5+shiftX,ty=(-dx*sa+dy*ca)/cover+.5+shiftY;
    let alpha=deposit(tx,ty);
    if(alpha<.5/255)return 0;
    if(overlap){
      const band=clamp((.16-Math.abs(mirror(tx)-(.47+shiftX)))*35);
      const second=deposit(tx+.07,ty+.13);
      // Overprinting can deepen existing ink, but must preserve every hole
      // in the primary impression instead of painting a rectangular wash.
      alpha+=alpha*(1-alpha)*second*overlap*band*.72;
    }
    return alpha;
  };
}
export function render(pixels, w, h, cfg, progress = () => {}) {
  const texture=inkFields(cfg),rawMask = sourceMask(pixels, w, h, cfg);
  const mask=granularContour(rawMask,w,h,cfg,texture);
  // A zoomed viewport samples the original texture at screen-pixel positions.
  // The complete source mask stays bounded; no huge full-canvas bitmap is needed.
  const region=cfg.previewRegion,ow=region?.width??w,oh=region?.height??h;
  const stepX=region?w/region.fullWidth:1,stepY=region?h/region.fullHeight:1;
  const out = new Uint8ClampedArray(ow * oh * 4), original = new Uint8ClampedArray(out.length);
  const hex = cfg.ink || '#287fb0', ink = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const paperHex = cfg.paperColor || '#f4f0e6', paper = [1, 3, 5].map(i => parseInt(paperHex.slice(i, i + 2), 16));
  const seed = cfg.seed | 0, size = Math.max(w, h), sx = w / size, sy = h / size;
  const {coarse,clouds,medium,fine}=texture;
  const roller = cfg.mode === 'roller', density = (cfg.density ?? 82) / 100, distress = (cfg.distress ?? 44) / 100;
  const distance=roller?null:contourDistance(mask,w,h);
  const diffusion=(cfg.diffusion??60)/100,spread=(cfg.spread??65)/100;
  const grain = (cfg.grain ?? 55) / 100, pressure = (cfg.pressure ?? 55) / 100;
  const angle = (cfg.angle ?? 90) * Math.PI / 180, ca = Math.cos(angle), sa = Math.sin(angle), warp = (cfg.warp || 0) * size / 700;
  const paperAmount = (cfg.paperTexture ?? 35) / 100;
  const background = cfg.background || 'transparent';
  const scannedRoller=roller?realRollerSampler(cfg,w,h):null;
  for (let y = 0; y < oh; y++) {
    if (y % 128 === 0) progress(y / oh);
    const by=region?(y+region.y+.5)*stepY-.5:y,v=(by+.5)/size;
    for (let x = 0; x < ow; x++) {
      const bx=region?(x+region.x+.5)*stepX-.5:x;
      const u = (bx + .5) / size, i = y * ow + x, j = i * 4;
      const wx = bx + Math.sin(v * 19 + seed * .01) * warp, wy = by + Math.sin(u * 16 + 1.4) * warp * .65;
      const unroughened=warp||region?sample(rawMask,w,h,wx,wy):rawMask[i];
      const source = warp||region ? sample(mask, w, h, wx, wy) : mask[i];
      let alpha = 0;
      const grit = hash(Math.floor(u * 1400), Math.floor(v * 1400), seed + 71);
      if (source > .001) {
        const uu = u / sx, vv = v / sy;
        const broad = noise(coarse, uu, vv), cloud = noise(clouds, uu, vv), mid = noise(medium, uu, vv), speck = noise(fine, uu, vv);
        if (roller) {
          if(scannedRoller){alpha=scannedRoller(u,v);}
          else {
          // Three scales of missing ink plus a long, directional roller field.
          const along = u * ca + v * sa, across = -u * sa + v * ca;
          const streak = noise(clouds, clamp(across * .78 + .5), clamp(along * .10 + .3));
          const deposit = .32 * broad + .28 * cloud + .22 * mid + .18 * speck;
          const missing = distress * .51 + (1 - density) * .28;
          alpha = clamp((deposit - missing) * (4.5 + pressure * 5) + .16);
          alpha *= clamp(.47 + density * .65 + (broad - .5) * pressure * 1.2 + (streak - .5) * .65);
          const pores = clamp((speck * .55 + mid * .25 + grit * .20 - distress * .43) * 6);
          alpha *= 1 - grain * (1 - pores);
          alpha *= 1 - grain * grit * .18;
          }
        } else {
          // Mezzotint-like diffusion is driven by the glyph contour, rather than
          // a uniform texture. An irregular front travels from each outline
          // towards its interior; broad fields break its symmetry locally.
          const dist=sample(distance,w,h,wx,wy)*1000/size;
          const depth=(5+diffusion*48)*(1+(cloud-.5)*spread*1.5+(broad-.5)*spread*.7);
          const front=clamp((dist+(mid-.5)*depth*spread*.8)/Math.max(2,depth));
          const penetration=smooth(front);
          const missing=clamp(.025+(1-density)*.28+distress*(.055+penetration*(.68+(broad-.5)*1.65+(cloud-.5)*.85)),.01,.97);
          const fleck=hash(Math.floor(u*800),Math.floor(v*800),seed+97);
          const edgeBlend=Math.exp(-dist/(5+(cfg.roughness??0)*.10));
          const joinedSpeck=speck*(1-edgeBlend)+noise(texture.edge,uu,vv)*edgeBlend;
          const particles=inkParticles(mid,joinedSpeck,grit,fleck,grain);
          const cutoff=.20+missing*.65;
          alpha=clamp((particles-cutoff)*(22+grain*12)+.5);
          alpha*=.94+density*.06;
        }
        // Photo tone controls the number of ink grains, rather than fading a
        // whole gray patch over the paper. Keep the roller's own ink opacity;
        // the unprinted gaps in the photo are truly empty.
        const photoTone=cfg.source==='image'&&cfg.method!=='silhouette';
        const coverage=photoTone?(hash(Math.floor(u*1800),Math.floor(v*1800),seed+149)<source?1:0):source;
        alpha *= coverage;
      }
      let bg = paper;
      if (background === 'paper') {
        const p = (grit - .5) * paperAmount * 21 + (noise(clouds, u, v) - .5) * paperAmount * 10;
        bg = paper.map(c => clamp(c + p, 0, 255));
      }
      const rasterAlpha=cfg.source==='image'?(region?sampleChannel(pixels,w,h,bx,by,3):pixels[j+3]):0;
      for (let k = 0; k < 3; k++) {
        out[j + k] = background === 'transparent' ? ink[k] : ink[k] * alpha + bg[k] * (1 - alpha);
        const raster=cfg.source==='image'?(region?sampleChannel(pixels,w,h,bx,by,k):pixels[j+k]):0;
        original[j + k] = cfg.source === 'image' ? (background === 'transparent' ? raster : raster * rasterAlpha/255 + bg[k]*(1-rasterAlpha/255)) : background === 'transparent' ? ink[k] : ink[k] * unroughened + bg[k] * (1 - unroughened);
      }
      out[j + 3] = background === 'transparent' ? Math.round(alpha * 255) : 255;
      original[j + 3] = background === 'transparent' ? (cfg.source === 'image' ? rasterAlpha : Math.round(unroughened * 255)) : 255;
    }
  }
  return { pixels:out, original, width:ow, height:oh };
}

function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points;
  const kept = new Uint8Array(points.length); kept[0] = kept[points.length - 1] = 1;
  const stack = [[0, points.length - 1]], tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop(), p = points[a], q = points[b], dx = q[0] - p[0], dy = q[1] - p[1], d2 = dx * dx + dy * dy;
    let max = tol2, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const r = points[i], t = d2 ? clamp(((r[0] - p[0]) * dx + (r[1] - p[1]) * dy) / d2) : 0;
      const d = (r[0] - p[0] - t * dx) ** 2 + (r[1] - p[1] - t * dy) ** 2;
      if (d > max) { max = d; idx = i; }
    }
    if (idx >= 0) { kept[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => kept[i]);
}
export function traceMask(mask, w, h, tolerance = .5, minArea = .5) {
  const visited = new Uint8Array(w * h);
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
  const dx = [1, 0, -1, 0], dy = [0, 1, 0, -1];
  function edgeAt(vx, vy, d) {
    const x = vx - (d === 1 || d === 2 ? 1 : 0), y = vy - (d >= 2 ? 1 : 0);
    const nx = x + (d === 1 ? 1 : d === 3 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 0 ? -1 : 0);
    return at(x, y) && !at(nx, ny) ? y * w + x : -1;
  }
  const paths = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!at(x, y)) continue;
    for (let initial = 0; initial < 4; initial++) {
      let vx = x + (initial === 1 || initial === 2 ? 1 : 0), vy = y + (initial >= 2 ? 1 : 0), dir = initial;
      let cell = edgeAt(vx, vy, dir);
      if (cell < 0 || visited[cell] & (1 << dir)) continue;
      const points = [], startX = vx, startY = vy, startD = dir;
      let area = 0, guard = 0;
      do {
        visited[cell] |= 1 << dir;
        const nx = vx + dx[dir], ny = vy + dy[dir];
        area += vx * ny - nx * vy;
        points.push([vx, vy]);
        vx = nx; vy = ny;
        let found = false;
        for (const nd of [(dir + 1) % 4, dir, (dir + 3) % 4, (dir + 2) % 4]) {
          const nc = edgeAt(vx, vy, nd);
          if (nc >= 0) { dir = nd; cell = nc; found = true; break; }
        }
        if (!found) break;
      } while (!(vx === startX && vy === startY && dir === startD) && ++guard < w * h * 4);
      if (points.length < 3 || Math.abs(area) / 2 < minArea) continue;
      const halfway = Math.floor(points.length / 2);
      const ring = [...simplifyLine(points.slice(0, halfway + 1), tolerance).slice(0, -1), ...simplifyLine([...points.slice(halfway), points[0]], tolerance).slice(0, -1)];
      if (ring.length >= 3) paths.push('M' + ring.map(p => p.join(' ')).join('L') + 'Z');
    }
  }
  return paths.join('');
}
export function vectorize(pixels, w, h, cfg, outputW, outputH, detail = 'medium', progress = () => {}) {
  const levels = detail === 'high' ? 6 : detail === 'medium' ? 4 : 2;
  const tolerance = detail === 'high' ? .35 : detail === 'medium' ? .55 : .85;
  const minArea = detail === 'high' ? .4 : detail === 'medium' ? 1.2 : 2.5;
  const mask = new Uint8Array(w * h), paths = [];
  for (let layer = 0; layer < levels; layer++) {
    const cutoff = (layer + .5) / levels * 255;
    for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3] >= cutoff ? 1 : 0;
    const d = traceMask(mask, w, h, tolerance, minArea);
    if (d) paths.push(`<path fill="${cfg.ink}" fill-opacity="${(1 / (levels - layer)).toFixed(5)}" fill-rule="evenodd" d="${d}"/>`);
    progress((layer + 1) / levels);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${outputW}" height="${outputH}" viewBox="0 0 ${w} ${h}"><title>滚墨印记 · ${cfg.mode === 'roller' ? '滚墨拓印' : '干墨印章'}</title><desc>透明背景，油墨纹理为矢量路径。Seed ${cfg.seed}.</desc>${paths.join('')}</svg>`;
}
