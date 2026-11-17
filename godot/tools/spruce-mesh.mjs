const goldenAngle=Math.PI*(3-Math.sqrt(5));

export function spruceMesh(tile,tree,height,yaw,style,random,needles) {
  const radius=Math.min(height*0.274,tree.crownLimit*1.2,4.8);
  const baseX=tree.x-tile.at[0],baseZ=tree.z-tile.at[2];
  function vertex(level,along,across,theta,tint) {
    const i=tile.p.length/3;
    const x=Math.cos(theta),z=Math.sin(theta);
    tile.p.push(baseX+along*x-across*z,tree.y+level*height,baseZ+along*z+across*x);
    tile.c.push(...tint.map(channel=>Math.round(channel)),255);
    return i;
  }
  for(let tier=0;tier<9;tier++) {
    const level=0.21+tier*0.087;
    const reach=radius*(1.04-tier*0.103);
    const branches=8-Math.floor(tier/3);
    for(let branch=0;branch<branches;branch++) {
      const angle=yaw+tier*goldenAngle+branch*2*Math.PI/branches+(random()-0.5)*0.24;
      const spread=reach*(0.79+random()*0.35);
      const width=spread*(0.27+random()*0.09);
      const bend=(random()-0.5)*0.085;
      const tone=0.68+random()*0.24+tier*0.032;
      const light=style.outer.map(value=>value*tone);
      const shade=style.leaf.map(value=>value*tone);
      const root=vertex(level+0.135+0.6*bend,0,0,angle,shade);
      const ridge=vertex(level+0.047,spread*0.56,0,angle,light);
      const tip=vertex(level+bend,spread,0,angle,shade);
      needles(level+0.037+bend*0.33,angle,spread,branch+tier);
      const inner=vertex(level-0.038,spread*0.44,0,angle,shade);
      for(const side of [-1,1]) {
        const lower=vertex(level+0.012,spread*0.29,width*side*(0.76+random()*0.14),angle,shade);
        const middle=vertex(level+bend*0.45,spread*0.52,width*side,angle,light);
        const blade=vertex(level+bend-0.020,spread*(0.72+random()*0.16),width*side*0.66,angle,shade);
        const notch=vertex(level+bend-0.010,spread*0.71,width*side*0.36,angle,light);
        tile.i.push(root,lower,ridge,lower,middle,ridge,middle,blade,ridge,blade,notch,ridge,notch,tip,ridge,
          root,inner,lower,lower,inner,middle,middle,inner,blade,blade,inner,notch,notch,inner,tip);
      }
    }
  }
  for(let i=0;i<7;i++) {
    const turn=yaw+i*2*Math.PI/7;
    const a=vertex(0.91,radius*0.18,0,turn,style.leaf);
    const b=vertex(0.91,radius*0.18,0,turn+2*Math.PI/7,style.outer);
    const tip=vertex(1.04,0.04,0,turn,style.outer);
    tile.i.push(a,b,tip);
  }
}
