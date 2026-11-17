export const soilDirections = [[1,0],[-1,0],[0,1],[0,-1]];
const cellSize = 24;
const keyAt = (x,z) => `${Math.floor(x/cellSize)}_${Math.floor(z/cellSize)}`;

export function crownClearance(buildings) {
  const extents=buildings.map(({outline})=>{
    const xs=outline.map(([x])=>x),zs=outline.map(([,z])=>z);
    return [Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];
  });
  return (x,z)=>{
    let wallGap=13;
    for (const [a,b,c,d] of extents) {
      wallGap=Math.min(wallGap,Math.hypot(Math.max(a-x,x-c,0),Math.max(b-z,z-d,0)));
    }
    return Math.max(1.15,(wallGap-0.28)/2.02);
  };
}

export function onSoil(sample,x,z,radius,allowDirt=false) {
  const open=(a,b)=> {
    const kind=sample(a,b)?.kind;
    return kind===1 || (allowDirt && kind===2);
  };
  return open(x,z) && soilDirections.every(([a,b])=>open(x+a*radius,z+b*radius));
}

export function footballPitches(props) {
  const goals=props.filter(prop=>prop.kind==='goal').map(prop=>prop.at);
  const used=new Set();
  const pitches=[];
  for (const from of goals) {
    if (used.has(from)) continue;
    let closest=null,length=42;
    for (const to of goals) {
      if (to===from || used.has(to)) continue;
      const distance=Math.hypot(to[0]-from[0],to[1]-from[1]);
      if (distance<12 || distance>=length) continue;
      closest=to;
      length=distance;
    }
    if (closest===null) continue;
    used.add(from);
    used.add(closest);
    const [x,z]=[(from[0]+closest[0])*0.5,(from[1]+closest[1])*0.5];
    const [dx,dz]=[(closest[0]-from[0])/length,(closest[1]-from[1])/length];
    const half=length/2+1.15;
    pitches.push({x,z,reach:half+13,blocks:(a,b,r)=>{
      const u=a-x,v=b-z;
      return Math.abs(u*dx+v*dz)<half+r && Math.abs(u*dz-v*dx)<12.1+r;
    }});
  }
  return pitches;
}

export function plantingSpace(buildings,roads,obstacles,reserved,pitches) {
  const tiles=new Map();
  function index(minX,minZ,maxX,maxZ,blocked) {
    for (let tx=Math.floor(minX/cellSize);tx<=Math.floor(maxX/cellSize);tx++) {
      for (let tz=Math.floor(minZ/cellSize);tz<=Math.floor(maxZ/cellSize);tz++) {
        const key=`${tx}_${tz}`;
        if (!tiles.has(key)) tiles.set(key,[]);
        tiles.get(key).push(blocked);
      }
    }
  }
  function exclude(x,z,radius) {
    const reach=radius+3.5;
    index(x-reach,z-reach,x+reach,z+reach,(a,b,r)=>Math.hypot(a-x,b-z)<radius+r);
  }
  for (const {outline} of buildings) {
    const xs=outline.map(p=>p[0]),zs=outline.map(p=>p[1]);
    const minX=Math.min(...xs)-1.6,maxX=Math.max(...xs)+1.6;
    const minZ=Math.min(...zs)-1.6,maxZ=Math.max(...zs)+1.6;
    index(minX-3.5,minZ-3.5,maxX+3.5,maxZ+3.5,(x,z,r)=>x>minX-r&&x<maxX+r&&z>minZ-r&&z<maxZ+r);
  }
  for (const [x,z,u,v,width,kind] of roads) {
    const dx=u-x,dz=v-z,length=dx*dx+dz*dz;
    const clearance=kind===7 ? Math.max(0.86,width*0.5) : width*0.5+1.4;
    index(Math.min(x,u)-clearance-3.5,Math.min(z,v)-clearance-3.5,
      Math.max(x,u)+clearance+3.5,Math.max(z,v)+clearance+3.5,(a,b,r)=>{
        const t=Math.max(0,Math.min(1,((a-x)*dx+(b-z)*dz)/(length||1)));
        return Math.hypot(a-x-t*dx,b-z-t*dz)<clearance+r;
      });
  }
  for (const {at:[x,z],w,d} of obstacles) exclude(x,z,Math.hypot(w,d)+0.36);
  for (const [x,z,radius] of reserved) exclude(x,z,radius??1.8);
  for (const {x,z,reach,blocks} of pitches) index(x-reach,z-reach,x+reach,z+reach,blocks);
  return {exclude,clear:(x,z,radius)=>(tiles.get(keyAt(x,z))||[]).every(blocked=>!blocked(x,z,radius))};
}

export class PlantPositions {
  cells = new Map();

  add(x,z) {
    const key=keyAt(x,z);
    if (!this.cells.has(key)) this.cells.set(key,[]);
    this.cells.get(key).push([x,z]);
  }

  near(x,z,radius) {
    for (let tx=Math.floor((x-radius)/cellSize);tx<=Math.floor((x+radius)/cellSize);tx++) {
      for (let tz=Math.floor((z-radius)/cellSize);tz<=Math.floor((z+radius)/cellSize);tz++) {
        if ((this.cells.get(`${tx}_${tz}`)||[]).some(([a,b])=>(x-a)**2+(z-b)**2<=radius**2)) return true;
      }
    }
    return false;
  }
}

export function* surveyPlots(bounds,sample,space,step,radius,random) {
  for (let u=bounds[0]+2;u<bounds[2]-2;u+=step) {
    for (let v=bounds[1]+2;v<bounds[3]-2;v+=step) {
      const x0=random()<0.5 ? 0.04 : 0.51;
      const z0=random()<0.5 ? 0.04 : 0.51;
      const offsets=[[x0,z0],[1-x0-0.45,z0],[x0,1-z0-0.45],[1-x0-0.45,1-z0-0.45]];
      for (const [a,b] of offsets) {
        const x=Math.min(bounds[2]-2,u+step*(a+random()*0.43));
        const z=Math.min(bounds[3]-2,v+step*(b+random()*0.43));
        if (space.clear(x,z,radius) && onSoil(sample,x,z,radius,true)) {
          yield [x,z];
          break;
        }
      }
    }
  }
}
