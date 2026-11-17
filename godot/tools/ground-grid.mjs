import { readFileSync } from 'node:fs';

export function groundGrid(assets) {
  const spec=JSON.parse(readFileSync(new URL('south-ground.json',assets)));
  const data=readFileSync(new URL('south-ground.bin',assets));
  const {x,z,step,width,depth}=spec;
  return {
    spec,data,
    sample(u,v) {
      const gx=(u-x)/step,gz=(v-z)/step;
      if(gx<0 || gx>=width-1 || gz<0 || gz>=depth-1) return null;
      const col=Math.floor(gx),row=Math.floor(gz);
      const i=(row*width+col)*3;
      const dx=gx-col,dz=gz-row,stride=width*3;
      const a=data.readInt16LE(i)*(1-dx)+data.readInt16LE(i+3)*dx;
      const b=data.readInt16LE(i+stride)*(1-dx)+data.readInt16LE(i+stride+3)*dx;
      const index=(Math.round(gz)*width+Math.round(gx))*3;
      return {y:(a*(1-dz)+b*dz)*0.01,kind:data[index+2]};
    },
  };
}
