import { footballPitches, plantingSpace } from './planting-space.mjs';
import { relief, smooth, soilPattern } from './landscape-pattern.mjs';

export function shapeGround(spec, heights, surface, raw, area, breakables, parked, approach) {
  const {x,z,width,depth,step}=spec;
  const size=width*depth;
  const distance=new Float32Array(size);
  const fixed=raw.solids.filter(([, , , , ,tree])=>!tree).map(([u,v,w,d])=>({at:[u,v],w,d}));
  const roots=new Float32Array(size).fill(1);
  for (const [u,v,w,d,,tree] of raw.solids) {
    if (!tree) continue;
    const radius=Math.max(w,d);
    const fade=1.85+radius;
    const col=(u-x)/step,row=(v-z)/step;
    for (let j=Math.max(0,Math.ceil(row-fade/step));j<=Math.min(depth-1,Math.floor(row+fade/step));j++) {
      for (let i=Math.max(0,Math.ceil(col-fade/step));i<=Math.min(width-1,Math.floor(col+fade/step));i++) {
        const index=j*width+i;
        const distance=Math.hypot(i-col,j-row)*step;
        roots[index]=Math.min(roots[index],smooth(radius+0.15,fade,distance));
      }
    }
  }
  fixed.push(...breakables.map(({at:[u,,v],radius})=>({at:[u,v],w:radius,d:0})));
  const reserved=[
    [...area.home,10], [...area.spawn,5],
    ...parked.map(([u,v])=>[u,v,1.8]),
    ...approach,
  ];
  const space=plantingSpace(raw.buildings,raw.roads,fixed,reserved,footballPitches(raw.props));
  for(let row=0;row<depth;row++) for(let col=0;col<width;col++) {
    const i=row*width+col;
    const edge=Math.min(col,row,width-1-col,depth-1-row);
    if (edge>1 && surface[i]!==0 && space.clear(x+col*step,z+row*step,0.23)) {
      distance[i]=12;
    }
  }
  const diagonal=Math.SQRT2;
  for(let row=1;row<depth-1;row++) for(let col=1;col<width-1;col++) {
    const i=row*width+col;
    distance[i]=Math.min(distance[i],distance[i-1]+1,distance[i-width]+1,
      distance[i-width-1]+diagonal,distance[i-width+1]+diagonal);
  }
  for(let row=depth-2;row>0;row--) for(let col=width-2;col>0;col--) {
    const i=row*width+col;
    distance[i]=Math.min(distance[i],distance[i+1]+1,distance[i+width]+1,
      distance[i+width-1]+diagonal,distance[i+width+1]+diagonal);
  }
  const offsets=new Int16Array(size);
  let changed=0,low=0,high=0;
  for(let i=0;i<size;i++) {
    const clearance=distance[i]*step;
    if(clearance<0.50) continue;
    const u=x+(i%width)*step,v=z+Math.floor(i/width)*step;
    const feather=smooth(0.49,3.40,clearance);
    const maxRise=0.59*clearance;
    const ridge=relief(u,v);
    const centimeters=Math.round(100*roots[i]*feather*maxRise*Math.tanh(ridge/maxRise));
    offsets[i]=centimeters;
    heights[i]+=centimeters;
    if (centimeters!==0) changed++;
    low=Math.min(low,centimeters);
    high=Math.max(high,centimeters);
    if (surface[i]===1 && clearance>1.65 && soilPattern(u,v).bare>0.67) surface[i]=2;
  }
  console.log(`${changed} relief samples, from ${low} to +${high} cm`);
  return offsets;
}
