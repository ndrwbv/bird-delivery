export function depotEntry(area,solids) {
  const [x,z]=area.home;
  const porch=solids.find(([u,v,w,d])=>Math.abs(w-3.45)<0.03 && Math.abs(d-2.725)<0.05
    && Math.hypot(x-u,z-v)<10);
  if(!porch) throw new Error('The district pizzeria needs a porch anchor');
  const yaw=-porch[4];
  const front=[Math.sin(yaw),Math.cos(yaw)];
  const radius=10.25;
  return {door:[x+front[0]*radius,z+front[1]*radius],yaw,front};
}

export function depotClearances(area,solids) {
  const {door,front}=depotEntry(area,solids);
  const [x,z]=area.spawn;
  return [[...door,2.2],[door[0]+front[0]*2,door[1]+front[1]*2,1.8],
    [x,z,4.75],[x+Math.sin(area.angle)*3.2,z+Math.cos(area.angle)*3.2,2.45]];
}

export function approachPath(from,to,clear) {
  const gap=0.8;
  const pad=20;
  const x0=Math.min(from[0],to[0])-pad,z0=Math.min(from[1],to[1])-pad;
  const width=Math.ceil((Math.abs(to[0]-from[0])+2*pad)/gap)+1;
  const depth=Math.ceil((Math.abs(to[1]-from[1])+2*pad)/gap)+1;
  const id=([x,z])=>Math.round((x-x0)/gap)+Math.round((z-z0)/gap)*width;
  const at=i=>[x0+(i%width)*gap,z0+Math.floor(i/width)*gap];
  const distance=([x,z],[u,v])=>Math.hypot(x-u,z-v);
  function open(a,b) {
    const steps=Math.ceil(distance(a,b)/0.32);
    for(let i=1;i<=steps;i++) {
      const t=i/steps;
      if(!clear([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],0.43)) return false;
    }
    return true;
  }

  const start=id(from),end=id(to);
  const cost=new Float64Array(width*depth).fill(Infinity);
  const parents=new Int32Array(width*depth).fill(-1);
  const pending=[[start,distance(from,to)]];
  cost[start]=0;
  while(pending.length) {
    pending.sort((a,b)=>b[1]-a[1]);
    const [i]=pending.pop();
    if(i===end) {
      const steps=[to];
      for(let j=parents[i];j>=0&&j!==start;j=parents[j]) steps.push(at(j));
      steps.push(from);
      steps.reverse();
      const route=[from];
      let current=0;
      while(current<steps.length-1) {
        let next=steps.length-1;
        while(next>current+1 && !open(steps[current],steps[next])) next--;
        route.push(steps[next]);
        current=next;
      }
      return route;
    }
    const point=i===start ? from : at(i);
    const col=i%width,row=Math.floor(i/width);
    for(let dz=-1;dz<=1;dz++) for(let dx=-1;dx<=1;dx++) {
      if((dx===0 && dz===0) || col+dx<0 || col+dx>=width || row+dz<0 || row+dz>=depth) continue;
      const j=i+dx+dz*width;
      const next=j===end ? to : at(j);
      const traveled=cost[i]+distance(point,next);
      if(traveled>=cost[j] || !open(point,next)) continue;
      cost[j]=traveled;
      parents[j]=i;
      pending.push([j,traveled+distance(next,to)]);
    }
  }
  throw new Error('Could not reach the courier parking from the pizzeria');
}
