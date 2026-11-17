export const deliveryAddresses = [
  { id:118887128, stop:[-231,10], entry:[-227,8], name:'Южный проезд, 23' },
  { id:126602492, stop:[193,-69], entry:[201,-70], name:'Чапаева, 20' },
  { id:124084732, stop:[2,141], entry:[-29,138], name:'Победы, 7' },
];

// Leave the stop, the facing facade, and the walking approach open.
export function deliveryClearances(buildings) {
  const reserved=[];
  for (const {id,stop} of deliveryAddresses) {
    reserved.push([...stop,4.7]);
    const outline=buildings.find(building=>building.id===id)?.outline;
    if(!outline) continue;
    let closest=null,distance=Infinity;
    for(let i=0;i<outline.length;i++) {
      const [x,z]=outline[i], [u,v]=outline[(i+1)%outline.length];
      const dx=u-x,dz=v-z;
      const t=Math.min(1,Math.max(0,((stop[0]-x)*dx+(stop[1]-z)*dz)/(dx*dx+dz*dz||1)));
      const point=[x+t*dx,z+t*dz];
      const gap=Math.hypot(point[0]-stop[0],point[1]-stop[1]);
      if(gap<distance) { closest=point; distance=gap; }
    }
    const steps=Math.ceil(distance/2.5);
    for(let i=1;i<=steps;i++) {
      const t=i/steps;
      reserved.push([stop[0]+(closest[0]-stop[0])*t,stop[1]+(closest[1]-stop[1])*t,2.35]);
    }
  }
  return reserved;
}

export function deliveryEntrance({id,stop},buildings) {
  const outline=buildings.find(building=>building.id===id).outline;
  let best=null;
  let distance=Infinity;
  for(let i=0;i<outline.length;i++) {
    const [x,z]=outline[i], [u,v]=outline[(i+1)%outline.length];
    const dx=u-x,dz=v-z,length=Math.hypot(dx,dz);
    if(length<2.8) continue;
    const margin=1.26/length;
    const t=Math.min(1-margin,Math.max(margin,((stop[0]-x)*dx+(stop[1]-z)*dz)/(length*length)));
    const at=[x+t*dx,z+t*dz];
    const from=[stop[0]-at[0],stop[1]-at[1]];
    const gap=Math.hypot(...from);
    if(gap>=distance) continue;
    const sign=Math.sign(from[0]*dz-from[1]*dx)||1;
    best={at,front:[sign*dz/length,-sign*dx/length]};
    distance=gap;
  }
  return best;
}
