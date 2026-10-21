import test from 'node:test';
import assert from 'node:assert/strict';
import { render, sourceMask, traceMask, vectorize, contourDistance, granularContour } from '../engine.js';

const base={source:'text',mode:'roller',seed:271828,ink:'#287fb0',density:84,distress:48,scale:48,grain:60,edge:24,pressure:58,angle:90,background:'transparent'};
function block(w=80,h=80){const p=new Uint8ClampedArray(w*h*4);for(let y=8;y<h-8;y++)for(let x=8;x<w-8;x++)p[(y*w+x)*4+3]=255;return p;}
const alphas=p=>Array.from({length:p.length/4},(_,i)=>p[i*4+3]);
test('uploaded tone images have the same granular silhouette as text and do not clip new outer ink',()=>{
  const w=300,h=300,input=block(w,h),mask=sourceMask(input,w,h,{source:'text'});
  for(const roughness of [26,80,100]){
    const cfg={seed:271828,roughness,edgeScale:28,grain:70,edge:24};
    const text=granularContour(mask,w,h,{...cfg,source:'text'}),photo=granularContour(mask,w,h,{...cfg,source:'image',method:'tone'});
    let outside=0;for(let i=0;i<mask.length;i++)if(!mask[i]&&text[i]>.01)outside++;
    assert.ok(outside>0,'fixture needs actual outward ink particles');
    assert.deepEqual(photo,text,`tone-image edge is being clipped at roughness ${roughness}`);
  }
});
test('photo edge growth preserves subject tone and leaves distant paper and empty uploads empty',()=>{
  const w=300,h=300,mask=new Float32Array(w*h);for(let y=80;y<220;y++)for(let x=80;x<220;x++)mask[y*w+x]=.35;
  const cfg={source:'image',method:'tone',roughness:80,edgeScale:28,grain:70,seed:271828};
  const result=granularContour(mask,w,h,cfg);let grown=0;
  for(let i=0;i<mask.length;i++){assert.ok(result[i]<=.350001);if(!mask[i]&&result[i]>.001)grown++;}
  assert.ok(grown>0);assert.equal(result[150*w+150],mask[150*w+150]);assert.equal(result[0],0);
  assert.ok(granularContour(new Float32Array(w*h),w,h,{...cfg,roughness:100}).every(v=>v===0));
  assert.deepEqual(granularContour(mask,w,h,{...cfg,roughness:0}),mask);
});

test('photo gray tones use sparse ink coverage without a continuous translucent veil',()=>{
  const w=240,h=180,pixels=new Uint8ClampedArray(w*h*4),levels=[64,128,192,255];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=(y*w+x)*4,value=levels[Math.floor(x/(w/4))];pixels[j]=pixels[j+1]=pixels[j+2]=value;pixels[j+3]=255;}
  for(const mode of ['stamp','roller']){
    const cfg={...base,source:'image',method:'tone',contrast:100,mode,density:100,distress:0,grain:0,roughness:0};
    const result=render(pixels,w,h,cfg).pixels,sums=[0,0,0,0],empty=[0,0,0,0],maximum=[0,0,0,0];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const band=Math.floor(x/(w/4)),j=(y*w+x)*4,a=result[j+3];sums[band]+=a;if(!a)empty[band]++;maximum[band]=Math.max(maximum[band],a);if(a)assert.deepEqual([...result.subarray(j,j+3)],[40,127,176]);}
    assert.ok(sums[0]>sums[1]&&sums[1]>sums[2]&&sums[2]>0,'photo tones must remain ordered');
    assert.ok(maximum[2]>200,'light gray must contain actual ink grains, rather than only faded ink');
    assert.ok(empty[0]>1000&&empty[1]>3000&&empty[2]>5000,'gaps must be transparent even within gray image regions');
    assert.equal(sums[3],0,'white paper must be completely empty');
  }
});

test('solid-black photo ink keeps the roller opacity and matches the same drawn silhouette',()=>{
  const input=block(100,100),cfg={...base,contrast:100,roughness:26};
  for(const mode of ['stamp','roller'])assert.deepEqual(render(input,100,100,{...cfg,mode,source:'image',method:'tone'}).pixels,render(input,100,100,{...cfg,mode,source:'draw'}).pixels);
});
test('viewport crops retain the same texture, silhouette, photo and paper coordinates',()=>{
  const w=96,h=80,input=block(w,h),scan=new Uint8Array(48*64);for(let i=0;i<scan.length;i++)scan[i]=(i*71+i%13*27)%256;
  for(let i=0;i<input.length;i+=4){input[i]=i%255;input[i+1]=(i*3)%255;input[i+2]=(i*7)%255;}
  const region={x:19,y:13,width:43,height:49,fullWidth:w,fullHeight:h};
  for(const mode of ['stamp','roller'])for(const source of ['text','image','draw'])for(const background of ['transparent','paper']){
    const cfg={...base,mode,source,background,roughness:55,roundness:30,expand:3,warp:4,rollerMap:{width:48,height:64,data:scan}};
    const full=render(input,w,h,cfg),tile=render(input,w,h,{...cfg,previewRegion:region});
    assert.equal(tile.width,region.width);assert.equal(tile.height,region.height);
    for(const key of ['pixels','original'])for(let y=0;y<region.height;y++)for(let x=0;x<region.width;x++)for(let k=0;k<4;k++){
      const actual=tile[key][(y*region.width+x)*4+k],expected=full[key][((y+region.y)*w+x+region.x)*4+k];
      assert.ok(Math.abs(actual-expected)<=1,`${mode}/${source}/${background}/${key} mismatch at ${x},${y}`);
    }
  }
});
test('zoomed region recovers original scan detail instead of enlarging the preview bitmap',()=>{
  const input=new Uint8ClampedArray(64*64*4);for(let i=3;i<input.length;i+=4)input[i]=255;
  const data=new Uint8Array(256*256);for(let y=0;y<256;y++)for(let x=0;x<256;x++)data[y*256+x]=(x%2)*255;
  const cfg={...base,density:100,distress:0,scale:50,grain:66,roughness:0,rollerMap:{width:256,height:256,data,low:{width:1,height:1,data:new Uint8Array([128])}}};
  const low=render(input,64,64,cfg),high=render(input,64,64,{...cfg,previewRegion:{x:32,y:32,width:192,height:192,fullWidth:256,fullHeight:256}});
  const energy=r=>{let total=0;for(let y=0;y<r.height;y++)for(let x=1;x<r.width;x++)total+=Math.abs(r.pixels[(y*r.width+x)*4+3]-r.pixels[(y*r.width+x-1)*4+3]);return total/(r.height*(r.width-1));};
  assert.ok(energy(high)>energy(low)*10);
  const empty=render(input,64,64,{...cfg,rollerMap:{width:256,height:256,data:new Uint8Array(256*256)},previewRegion:{x:20,y:40,width:80,height:90,fullWidth:512,fullHeight:512}});
  assert.ok(alphas(empty.pixels).every(a=>a===0));
});
test('scan clarity enhances local fibers without adding ink in existing paper holes',()=>{
  const input=block(),data=new Uint8Array(64*64);for(let y=0;y<64;y++)for(let x=0;x<64;x++)data[y*64+x]=x<20?0:100+(x%5)*20;
  const cfg={...base,distress:0,overlap:100,rollerMap:{width:64,height:64,data,low:{width:1,height:1,data:new Uint8Array([128])}}};
  const plain=render(input,80,80,{...cfg,clarity:0}).pixels,sharp=render(input,80,80,{...cfg,clarity:100}).pixels;
  assert.notDeepEqual(sharp,plain);let holes=0;
  for(let i=3;i<plain.length;i+=4)if(!plain[i]){holes++;assert.equal(sharp[i],0);}
  assert.ok(holes>1000);
});
test('same seed reproduces the same texture; new seeds and modes differ',()=>{
  const input=block(),a=render(input,80,80,base).pixels;
  assert.deepEqual(a,render(input,80,80,base).pixels);
  assert.notDeepEqual(a,render(input,80,80,{...base,seed:2}).pixels);
  assert.notDeepEqual(a,render(input,80,80,{...base,mode:'stamp'}).pixels);
});
test('transparent export has transparent exterior, missing ink and intermediate alpha',()=>{
  const a=render(block(),80,80,base).pixels,aa=alphas(a);
  assert.equal(a[3],0);assert.ok(aa.filter(v=>v>0&&v<255).length>100);
  assert.ok(aa.reduce((s,v)=>s+v,0)>100000);
});
test('missing ink control decreases deposited ink',()=>{
  for(const mode of ['roller','stamp']){
    const sum=distress=>alphas(render(block(),80,80,{...base,mode,distress}).pixels).reduce((a,b)=>a+b,0);
    assert.ok(sum(90)<sum(20));
  }
});
test('paper and solid backgrounds are opaque; UI theme is absent from output',()=>{
  const a=render(block(),80,80,{...base,background:'paper',paperTexture:35}).pixels;
  assert.ok(alphas(a).every(v=>v===255));
  assert.deepEqual(a,render(block(),80,80,{...base,background:'paper',paperTexture:35,theme:'dark'}).pixels);
});
test('photo tone, silhouette, inversion and transparent silhouette are distinct',()=>{
  const input=new Uint8ClampedArray([64,64,64,255,192,192,192,255]);
  const tone=sourceMask(input,2,1,{source:'image',method:'tone',contrast:100});
  assert.ok(tone[0]>.7&&tone[0]<.8);assert.ok(tone[1]>.2&&tone[1]<.3);
  assert.deepEqual([...sourceMask(input,2,1,{source:'image',method:'silhouette',threshold:50})],[1,0]);
  assert.deepEqual([...sourceMask(input,2,1,{source:'image',method:'silhouette',threshold:50,invert:true})],[0,1]);
  assert.deepEqual([...sourceMask(new Uint8ClampedArray([255,255,255,128]),1,1,{source:'image',method:'silhouette',hasTransparency:true})],[128/255].map(Math.fround));
});
test('real roller scans control ink deposition and keep paper fully transparent',()=>{
  const map=value=>({width:8,height:8,data:new Uint8Array(64).fill(value)}),input=block();
  const white=render(input,80,80,{...base,rollerMap:map(0)}).pixels;
  assert.ok(alphas(white).every(v=>v===0));
  const black=render(input,80,80,{...base,rollerMap:map(255)}).pixels;
  assert.ok(black[(40*80+40)*4+3]>240);assert.equal(black[3],0);
  const grey=render(input,80,80,{...base,rollerMap:map(128)}).pixels;
  assert.ok(grey[(40*80+40)*4+3]>0&&grey[(40*80+40)*4+3]<240);
});
test('real roller mapping responds to direction, pressure, scale and ink loading',()=>{
  const data=new Uint8Array(16*32);for(let y=0;y<32;y++)for(let x=0;x<16;x++)data[y*16+x]=Math.round((x+y*.3)/25*255);
  const rollerMap={width:16,height:32,data},input=block(),cfg={...base,rollerMap,angle:90};
  const a=render(input,80,80,cfg).pixels;
  for(const change of [{angle:0},{pressure:95},{scale:80}])assert.notDeepEqual(a,render(input,80,80,{...cfg,...change}).pixels);
  const sum=density=>alphas(render(input,80,80,{...cfg,density}).pixels).reduce((a,b)=>a+b,0);
  assert.ok(sum(95)>sum(40));
});
test('paper in a real scan stays empty at every pressure and detail setting',()=>{
  const input=block(),rollerMap={width:8,height:8,data:new Uint8Array(64),low:{width:2,height:2,data:new Uint8Array(4).fill(220)}};
  for(const pressure of [0,40,100])for(const grain of [0,100]){
    const pixels=render(input,80,80,{...base,pressure,grain,distress:0,density:100,overlap:100,rollerMap}).pixels;
    assert.ok(alphas(pixels).every(v=>v===0),`paper must stay empty: pressure ${pressure}, detail ${grain}`);
  }
});
test('overprinting deepens existing ink without filling missing primary ink',()=>{
  const input=block(),data=new Uint8Array(32*32);for(let y=0;y<32;y++)for(let x=16;x<32;x++)data[y*32+x]=255;
  const rollerMap={width:32,height:32,data,low:{width:2,height:2,data:new Uint8Array(4).fill(128)}};
  const before=render(input,80,80,{...base,rollerMap,overlap:0}).pixels,after=render(input,80,80,{...base,rollerMap,overlap:100}).pixels;
  let empty=0,ink=0;
  for(let i=3;i<before.length;i+=4){if(!before[i]){empty++;assert.equal(after[i],0);}else ink++;}
  assert.ok(empty>1000&&ink>1000);
});
test('morphology grows and shrinks the source silhouette',()=>{
  const input=block(100,100),sum=expand=>sourceMask(input,100,100,{source:'draw',expand}).reduce((a,b)=>a+b,0);
  assert.ok(sum(12)>sum(0));assert.ok(sum(-12)<sum(0));
});
test('stamp diffusion follows the silhouette, with denser outlines and broken interiors',()=>{
  const w=300,h=300,input=block(w,h),mask=sourceMask(input,w,h,{source:'draw'}),d=contourDistance(mask,w,h);
  assert.equal(d[0],0);assert.ok(d[150*w+150]>d[9*w+150]);
  const a=render(input,w,h,{...base,mode:'stamp',density:96,distress:78,diffusion:50,spread:75}).pixels;
  let edge=0,inner=0,ec=0,ic=0;
  for(let i=0;i<d.length;i++){if(d[i]>0&&d[i]<3){edge+=a[i*4+3];ec++;}if(d[i]>35){inner+=a[i*4+3];ic++;}}
  assert.ok(edge/ec>inner/ic+20,`contour ${edge/ec}, interior ${inner/ic}`);
});
test('edge roughness changes the silhouette, not only its interior texture',()=>{
  const w=300,h=300,input=block(w,h),cfg={...base,mode:'stamp',density:96,distress:35};
  const clean=render(input,w,h,{...cfg,roughness:0}).pixels;
  const rough=render(input,w,h,{...cfg,roughness:95,edgeScale:45}).pixels;
  let protrusions=0,notches=0;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=(y*w+x)*4+3;
    if(!input[i]&&rough[i]>32)protrusions++;
    if(input[i]&&clean[i]>200&&rough[i]<64)notches++;
  }
  assert.ok(protrusions>30,`outward grains: ${protrusions}`);assert.ok(notches>30,`inward notches: ${notches}`);
  assert.deepEqual(rough,render(input,w,h,{...cfg,roughness:95,edgeScale:45}).pixels);
  assert.notDeepEqual(rough,render(input,w,h,{...cfg,roughness:95,edgeScale:90}).pixels);
});
test('granular contour cuts real holes, keeps solid ink, and never paints the canvas frame',()=>{
  const w=1000,h=1000,mask=new Float32Array(w*h);for(let y=250;y<750;y++)for(let x=250;x<750;x++)mask[y*w+x]=1;
  const a=granularContour(mask,w,h,{seed:271828,source:'text',roughness:85,edgeScale:55,edge:50});
  let full=0,transparent=0,partial=0;
  for(let y=240;y<270;y++)for(let x=260;x<740;x++){const v=a[y*w+x];if(v<.01)transparent++;else if(v>.99)full++;else partial++;}
  assert.ok(full>1000&&transparent>1000);assert.ok(partial/(full+transparent+partial)<.18,'no continuous translucent contour band');
  for(let x=0;x<w;x++){assert.equal(a[x],0);assert.equal(a[(h-1)*w+x],0);}
  for(let y=0;y<h;y++){assert.equal(a[y*w],0);assert.equal(a[y*w+w-1],0);}
  assert.ok(granularContour(new Float32Array(w*h),w,h,{roughness:100,edgeScale:100}).every(v=>v===0));
});
test('maximum ink growth can join nearby strokes while medium strength keeps them separate',()=>{
  const w=1000,h=320,mask=new Float32Array(w*h);
  for(let y=80;y<240;y++)for(const [a,b]of [[300,380],[410,490]])for(let x=a;x<b;x++)mask[y*w+x]=1;
  function connected(a){
    const seen=new Uint8Array(a.length),queue=new Int32Array(a.length);let head=0,tail=0;
    queue[tail++]=160*w+340;seen[160*w+340]=1;
    while(head<tail){const i=queue[head++],x=i%w;if(x>=430)return true;for(const n of [i-1,i+1,i-w,i+w])if(n>=0&&n<a.length&&!seen[n]&&a[n]>.55){seen[n]=1;queue[tail++]=n;}}
    return false;
  }
  assert.equal(connected(granularContour(mask,w,h,{source:'text',seed:271828,roughness:55,edgeScale:28,grain:70})),false);
  assert.equal(connected(granularContour(mask,w,h,{source:'text',seed:271828,roughness:100,edgeScale:28,grain:70})),true);
});
test('corner control rounds straight corners and protects thin strokes',()=>{
  const w=300,h=300,input=block(w,h),straight=sourceMask(input,w,h,{source:'text',roundness:0}),rounded=sourceMask(input,w,h,{source:'text',roundness:100});
  assert.ok(straight[8*w+8]>.99);assert.ok(rounded[8*w+8]<.3);assert.ok(rounded[150*w+150]>.99);
  const thin=new Uint8ClampedArray(w*h*4);for(let y=80;y<220;y++)thin[(y*w+150)*4+3]=255;
  const protectedMask=sourceMask(thin,w,h,{source:'text',roundness:100});assert.ok(protectedMask[150*w+150]>.99);
});
test('contours preserve an outer ring, a hole and disconnected islands',()=>{
  const mask=new Uint8Array(100);for(let y=1;y<9;y++)for(let x=1;x<9;x++)mask[y*10+x]=1;
  for(let y=3;y<7;y++)for(let x=3;x<7;x++)mask[y*10+x]=0;
  const path=traceMask(mask,10,10,.1,.1);assert.equal((path.match(/M/g)||[]).length,2);
  assert.match(path,/Z/);
  assert.equal((traceMask(new Uint8Array([1,0,0,1]),2,2,.1,.1).match(/M/g)||[]).length,2);
});
test('SVG contains real paths, a transparent background and requested dimensions',()=>{
  const r=render(block(),80,80,base),svg=vectorize(r.pixels,80,80,base,2048,2048,'medium');
  assert.match(svg,/<path /);assert.match(svg,/width="2048" height="2048"/);assert.match(svg,/fill-rule="evenodd"/);
  assert.doesNotMatch(svg,/<image|data:image|<rect|<filter/);
});
