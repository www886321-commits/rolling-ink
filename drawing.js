// Marks stay in normalized artwork coordinates for zoom and export.
export const DRAW_SHAPES=new Set(['rect','roundRect','circle','ellipse','triangle','diamond','star','heart']);

export function shapeBox(mark,width,height){
  if(!DRAW_SHAPES.has(mark.tool)||mark.points.length<2)return null;
  if(mark.bounds){const [x,y,w,h]=mark.bounds;return {x:x*width,y:y*height,width:w*width,height:h*height};}
  const [start,end]=mark.points,ax=start[0]*width,ay=start[1]*height;
  let dx=(end[0]-start[0])*width,dy=(end[1]-start[1])*height;
  if(mark.tool==='circle'||mark.constrain){const side=Math.min(Math.abs(dx),Math.abs(dy));dx=Math.sign(dx)*side;dy=Math.sign(dy)*side;}
  const w=Math.abs(dx),h=Math.abs(dy);if(w<.0001||h<.0001)return null;
  return {x:Math.min(ax,ax+dx),y:Math.min(ay,ay+dy),width:w,height:h};
}

export function geometryOf(mark,width,height){
  const box=shapeBox(mark,width,height);return box?{cx:box.x+box.width/2,cy:box.y+box.height/2,width:box.width,height:box.height,rotation:mark.rotation||0}:null;
}

export function withGeometry(mark,g,width,height){
  return {...mark,bounds:[(g.cx-g.width/2)/width,(g.cy-g.height/2)/height,g.width/width,g.height/height],rotation:((g.rotation+180)%360+360)%360-180};
}

export function geometryPoint(g,x,y){
  const angle=g.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return {x:g.cx+c*x-s*y,y:g.cy+s*x+c*y};
}

export function resizeGeometry(g,handle,dx,dy,keepRatio,minWidth,minHeight){
  const sx=handle.includes('w')?-1:handle.includes('e')?1:0,sy=handle.includes('n')?-1:handle.includes('s')?1:0;
  const angle=g.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),lx=dx*c+dy*s,ly=-dx*s+dy*c;
  let width=sx?Math.max(minWidth,g.width+sx*lx):g.width,height=sy?Math.max(minHeight,g.height+sy*ly):g.height;
  if(keepRatio){
    const rx=width/g.width,ry=height/g.height;
    let scale=!sx?ry:!sy?rx:Math.abs(rx-1)>Math.abs(ry-1)?rx:ry;
    scale=Math.max(scale,minWidth/g.width,minHeight/g.height);width=g.width*scale;height=g.height*scale;
  }
  const localX=sx*(width-g.width)/2,localY=sy*(height-g.height)/2;
  return {...g,cx:g.cx+localX*c-localY*s,cy:g.cy+localX*s+localY*c,width,height};
}

export function drawMark(ctx,mark,width,height,color='#000'){
  if(!mark.points.length)return;
  const shape=DRAW_SHAPES.has(mark.tool),box=shape?shapeBox(mark,width,height):null;
  if(shape&&!box)return;
  ctx.save();
  ctx.globalCompositeOperation=mark.tool==='eraser'||mark.operation==='subtract'?'destination-out':'source-over';
  ctx.fillStyle=color;ctx.strokeStyle=color;
  if(shape){
    const {x,y,width:w,height:h}=box;
    ctx.translate(x+w/2,y+h/2);ctx.rotate((mark.rotation||0)*Math.PI/180);ctx.beginPath();
    if(mark.tool==='rect')ctx.rect(-w/2,-h/2,w,h);
    else if(mark.tool==='roundRect')ctx.roundRect(-w/2,-h/2,w,h,Math.min(w,h)*.25);
    else if(mark.tool==='circle'||mark.tool==='ellipse')ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
    else if(mark.tool==='heart'){
      ctx.scale(w,h);
      ctx.moveTo(0,-.28);ctx.bezierCurveTo(-.27,-.68,-.65,-.43,-.45,-.04);
      ctx.bezierCurveTo(-.34,.18,-.12,.36,0,.5);
      ctx.bezierCurveTo(.12,.36,.34,.18,.45,-.04);
      ctx.bezierCurveTo(.65,-.43,.27,-.68,0,-.28);ctx.closePath();
    }else{
      const points=mark.tool==='triangle'?[[0,-.5],[.5,.5],[-.5,.5]]
        :mark.tool==='diamond'?[[0,-.5],[.5,0],[0,.5],[-.5,0]]
        :Array.from({length:10},(_,i)=>{const angle=-Math.PI/2+i*Math.PI/5,r=i%2?.22:.5;return [Math.cos(angle)*r,Math.sin(angle)*r];});
      for(let i=0;i<points.length;i++){const [px,py]=points[i];i?ctx.lineTo(px*w,py*h):ctx.moveTo(px*w,py*h);}ctx.closePath();
    }
    ctx.fill();
  }else{
    ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=mark.size*Math.max(width,height)/1000;
    const pts=mark.points.map(p=>[p[0]*width,p[1]*height]);ctx.beginPath();
    if(pts.length===1){ctx.arc(...pts[0],ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
    else{ctx.moveTo(...pts[0]);for(let i=1;i<pts.length-1;i++)ctx.quadraticCurveTo(...pts[i],(pts[i][0]+pts[i+1][0])/2,(pts[i][1]+pts[i+1][1])/2);ctx.lineTo(...pts[pts.length-1]);ctx.stroke();}
  }
  ctx.restore();
}
