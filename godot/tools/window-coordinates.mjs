// The capture writes four vertices for each frame and each pane, in that order.
export function windowCoordinates(positions,colors,indices,doors) {
  const uv=new Float32Array(positions.length/3*2);
  const sizes=new Float32Array(uv.length);
  const pigment=colors.slice();
  const reshaped=positions.slice();
  let frame, width, height, tangent, seed, opening, scale;
  const kept=new Uint8Array(positions.length/3);
  for(let i=0;i<positions.length/3;i+=4) {
    const low=colors.subarray(i*4,i*4+3);
    const high=colors.subarray((i+2)*4,(i+2)*4+3);
    if(!frame || low.every((value,j)=>value===high[j])) {
      frame=positions.subarray(i*3,i*3+3);
      tangent=[positions[(i+1)*3]-frame[0],positions[(i+1)*3+2]-frame[2]];
      width=Math.hypot(...tangent);
      height=positions[(i+2)*3+1]-frame[1];
      tangent=tangent.map(value=>value/Math.max(width,0.001));
      const added=width<2.2 ? Math.min(0.46,width*0.34) : Math.min(0.27,width*0.09);
      scale=1+added/Math.max(width,0.001);
      opening=doors.some(({at:[x,z],front:[nx,nz],y})=>{
        if (frame[1]>=y+2.23 || frame[1]+height<=y) return false;
        const [tx,tz]=tangent;
        if(Math.abs(nx*tx+nz*tz)>0.12) return false;
        const u=x-frame[0],v=z-frame[2];
        if(Math.abs(u*nx+v*nz)>0.32) return false;
        const along=u*tx+v*tz;
        return along>-0.78-added*0.5 && along<width+0.78+added*0.5;
      });
      if(!opening) {
        kept.fill(1,i,i+4);
        for(let j=i;j<i+4;j++) widen(j);
      }
      let hash=Math.imul(Math.round(frame[0]*17),73856093)
        ^Math.imul(Math.round(frame[1]*11),19349669)^Math.imul(Math.round(frame[2]*17),83492791);
      hash=Math.imul(hash^(hash>>>16),668265263);
      seed=(hash^(hash>>>15))&255;
      continue;
    }
    if(opening) continue;
    kept.fill(1,i,i+4);
    for(let j=i;j<i+4;j++) {
      const [x,y,z]=positions.subarray(j*3,j*3+3);
      uv[j*2]=((x-frame[0])*tangent[0]+(z-frame[2])*tangent[1])/width;
      uv[j*2+1]=(y-frame[1])/height;
      sizes.set([width*scale,height],j*2);
      widen(j);
      pigment[j*4+3]=seed;
    }
  }
  function widen(index) {
    const i=index*3;
    const u=(positions[i]-frame[0])*tangent[0]+(positions[i+2]-frame[2])*tangent[1];
    const shift=(u-width*0.5)*(scale-1);
    reshaped[i]+=shift*tangent[0];
    reshaped[i+2]+=shift*tangent[1];
  }
  return {positions:reshaped,uv,uv2:sizes,colors:pigment,indices:indices.filter(i=>kept[i])};
}
