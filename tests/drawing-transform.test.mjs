import test from 'node:test';
import assert from 'node:assert/strict';
import {resizeGeometry,geometryPoint,geometryOf,withGeometry} from '../drawing.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('rotated resizing keeps the opposite edge or corner anchored for all eight handles',()=>{
 for(const rotation of [-170,-90,-37,0,25,90,175])for(const handle of ['nw','n','ne','e','se','s','sw','w']){
  const g={cx:640,cy:450,width:300,height:150,rotation},sx=handle.includes('w')?-1:handle.includes('e')?1:0,sy=handle.includes('n')?-1:handle.includes('s')?1:0;
  const before=geometryPoint(g,-sx*g.width/2,-sy*g.height/2),next=resizeGeometry(g,handle,60,35,false,2,2),after=geometryPoint(next,-sx*next.width/2,-sy*next.height/2);
  near(before.x,after.x);near(before.y,after.y);if(!sx)near(next.width,g.width);if(!sy)near(next.height,g.height);
 }
});
test('Shift resizing preserves aspect ratio and tiny sizes remain positive',()=>{
 for(const handle of ['nw','n','ne','e','se','s','sw','w']){
  const g={cx:200,cy:200,width:300,height:150,rotation:35},next=resizeGeometry(g,handle,120,-90,true,3,3);
  near(next.width/next.height,2);assert.ok(next.width>=3&&next.height>=3);
  const tiny=resizeGeometry(g,handle,-100000,-100000,true,3,3);near(tiny.width/tiny.height,2);assert.ok(tiny.width>=3&&tiny.height>=3);
 }
});
test('transformed circle can stretch freely and geometry roundtrips on rectangular canvases',()=>{
 const mark={tool:'circle',points:[[.2,.2],[.6,.7]],rotation:0};
 const original=geometryOf(mark,1600,900);near(original.width,original.height);
 const wanted={cx:790,cy:540,width:600,height:150,rotation:390},next=withGeometry(mark,wanted,1600,900),actual=geometryOf(next,1600,900);
 for(const key of ['cx','cy','width','height'])near(actual[key],wanted[key]);near(actual.rotation,30);assert.equal(mark.bounds,undefined);
});
