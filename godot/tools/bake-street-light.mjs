import { writeFileSync } from 'node:fs';

const cell=1.15;
const minHeight=-28;
const heightRange=70;

export function bakeStreetLight(assets,bounds,fixtures,ground) {
  const [x,z,maxX,maxZ]=bounds;
  const width=Math.ceil((maxX-x)/cell),depth=Math.ceil((maxZ-z)/cell);
  const size=width*depth;
  const sums=new Uint16Array(size);
  const pixels=Buffer.alloc(size*2);
  const records=[];
  const losses=[];
  let pointer=0;
  for(const lamp of fixtures) {
    const {id,base,head,street,axis:[u,v],pool:[px,pz],radii:[long,wide],scale}=lamp;
    const radius=Math.max(long,wide);
    const left=Math.max(0,Math.floor((px-x-radius)/cell));
    const right=Math.min(width,Math.ceil((px-x+radius)/cell));
    const top=Math.max(0,Math.floor((pz-z-radius)/cell));
    const bottom=Math.min(depth,Math.ceil((pz-z+radius)/cell));
    const block=Buffer.alloc((right-left)*(bottom-top));
    const peak=street ? 176 : 86;
    let i=0;
    for(let row=top;row<bottom;row++) for(let col=left;col<right;col++) {
      const dx=x+(col+0.5)*cell-px,dz=z+(row+0.5)*cell-pz;
      const along=(dx*u+dz*v)/long,across=(dz*u-dx*v)/wide;
      const q=along*along+across*across;
      const light=Math.round(peak*Math.max(0,1-q)**2.17);
      block[i++]=light;
      sums[row*width+col]+=light;
    }
    records.push({id,base,head,scale,street,patch:[left,top,right-left,bottom-top,pointer]});
    losses.push(block);
    pointer+=block.length;
  }
  const totalBytes=Buffer.alloc(size*2);
  for(let i=0;i<size;i++) {
    const u=x+((i%width)+0.5)*cell,v=z+(Math.floor(i/width)+0.5)*cell;
    const height=ground(u,v)?.y??0;
    pixels[i*2]=Math.min(255,sums[i]);
    pixels[i*2+1]=Math.round(255*Math.min(1,Math.max(0,(height-minHeight)/heightRange)));
    totalBytes.writeUInt16LE(sums[i],i*2);
  }
  const spec={x,z,width,depth,cell,fixtures:records};
  writeFileSync(new URL('south-streetlight.json',assets),JSON.stringify(spec));
  writeFileSync(new URL('south-streetlight.bin',assets),Buffer.concat([pixels,totalBytes,...losses]));
  console.log(`${records.length} fixed light pools, ${records.filter(lamp=>lamp.street).length} road fixtures`);
}
