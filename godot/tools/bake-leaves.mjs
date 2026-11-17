import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { Color, Vector3 } from '../../src/vendor/three.module.min.js';
import { generator } from './leaf-sprigs.mjs';
import { DRY, SPRUCE, treeStyle, trunkRadiusAt } from './tree-styles.mjs';
import { spruceMesh } from './spruce-mesh.mjs';
import { soilPattern, treeHabitat } from './landscape-pattern.mjs';
import { groundGrid } from './ground-grid.mjs';
import { Glb } from './glb.mjs';
import { CrownMesh } from './crown-mesh.mjs';
import { crownClearance } from './planting-space.mjs';

const assets = new URL('../assets/', import.meta.url);
const random = generator(463237);
const sprite = 160;
const light = value => `rgb(${value},${value},${value})`;
let atlas = '';
for(let tile=0;tile<4;tile++) {
  let sprig = '';
  const forms = [];
  // Main sprig, two forked twigs and individual pointed leaves along both branches.
  const root = [76,146];
  const chips = [
    [root,[45,90],[24,57]], [root,[108,89],[134,55]],
    [root,[77,81],[79,30]], [[78,97],[55,64],[54,44]],
  ];
  for(const [stroke,[from,joint,end]] of chips.entries()) {
    sprig += `<path d="M ${from.join(' ')} Q ${joint.join(' ')} ${end.join(' ')}" stroke="#83745f" stroke-width="1.5" fill="none"/>`;
    for(let index=1;index<=3;index++) {
      const t=(index+0.37)/3.4;
      const at=[0,1].map(k=>(1-t)**2*from[k]+2*t*(1-t)*joint[k]+t*t*end[k]);
      const outside=stroke===0?-1:stroke===1?1:(index+tile)%2===0?1:-1;
      const angle=outside*(0.24+random()*0.80);
      const length=(29+random()*21)*[1.0,0.94,1.12,0.82][tile];
      const width=(10.8+random()*6.4)*[1.16,1.03,0.72,0.67][tile];
      forms.push({at:[at[0]+(random()-0.5)*4,at[1]],angle,length,width});
    }
  }
  for(const {at:[x,y],angle,length:L,width:W} of forms.reverse()) {
    const base=Math.round(175+random()*63);
    const degree=angle*180/Math.PI;
    const tip=-L,cleft=tip*0.34;
    const outline=tile===0?
      `0,0 ${-W},${tip*0.42} ${-W*0.58},${tip*0.49} ${-W*1.02},${tip*0.74} ${-W*0.39},${tip*0.68} ${W*0.1},${tip} ${W*0.4},${tip*0.69} ${W*0.94},${tip*0.78} ${W*0.65},${tip*0.48} ${W},${tip*0.47}` : null;
    const blade=outline??`0,0 ${-W*0.77},${cleft} ${-W},${tip*0.60} ${-W*0.46},${tip*0.82} ${W*0.10},${tip} ${W*0.66},${tip*0.76} ${W},${tip*0.52} ${W*0.63},${tip*0.24}`;
    sprig += `<g transform="translate(${x},${y}) rotate(${degree})">
      <polygon points="${blade}" fill="${light(base)}"/>
      <polygon points="0,0 ${-W*0.77},${cleft} ${-W},${tip*0.60} ${-W*0.46},${tip*0.82} ${W*0.1},${tip} ${W*0.03},${tip*0.63}" fill="${light(base-23)}"/>
      <path d="M0 0 Q ${W*0.10} ${tip*0.45} ${W*0.1} ${tip*0.94}" stroke="${light(Math.min(255,base+24))}" fill="none" stroke-width="0.72"/>
    </g>`;
  }
  atlas += `<g transform="translate(${tile*sprite},0)">${sprig}</g>`;
}
// A flat needle sprig breaks up the silhouette of the layered evergreen branches.
{
  const needles=[];
  const center=[80,144];
  const rng=generator(519037);
  for(let i=0;i<13;i++) {
    const side=i%2===0 ? -1 : 1;
    const y=132-i*8.5;
    const length=(0.51+0.49*Math.sin((i+1)*Math.PI/15))*(36+rng()*23);
    const tip=[center[0]+side*length,y-20-rng()*12];
    needles.push(`<path d="M80 ${y} L${tip.join(' ')}" stroke="#b5a58b" stroke-width="2.3"/>`);
    for(let j=0;j<12;j++) {
      const t=(j+0.35)/12;
      const x=80+(tip[0]-80)*t,v=y+(tip[1]-y)*t;
      const span=(3.3+rng()*6.6)*(1-t*0.68);
      for(const drift of [-1,1]) {
        const gray=light(Math.round(134+rng()*107));
        needles.push(`<path d="M${x} ${v} l${side*(3+span*0.78)} ${drift*span-3.2}" stroke="${gray}" stroke-width="${1.25+rng()*1.30}" stroke-linecap="round"/>`);
      }
    }
  }
  needles.push('<path d="M80 144 Q76 74 81 12" stroke="#b6a78d" stroke-width="2.7"/>');
  atlas+=`<g transform="translate(${4*sprite},0)">${needles.join('')}</g>`;
}
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${sprite*5}" height="${sprite}">${atlas}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(new URL('leaf-sprigs.png',assets).pathname);

const source=readFileSync(new URL('south-original.glb',assets));
const jsonSize=source.readUInt32LE(12);
const file=JSON.parse(source.subarray(20,20+jsonSize));
const bounds=JSON.parse(readFileSync(new URL('south-original.json',assets))).bounds;
const raw=JSON.parse(readFileSync(new URL('south-physics-source.json',assets)));
const { sample }=groundGrid(assets);
const trees=new Map();
const treeKey=(x,z)=>[Math.floor(x/9),Math.floor(z/9)].join('_');
for(const [x,z,w,d,,tree] of raw.solids) {
  if(!tree || w<=0.03 || d<=0.03) continue;
  const ground=sample(x,z);
  if(!ground) continue;
  const {y,kind}=ground;
  const key=treeKey(x,z);
  if(!trees.has(key)) trees.set(key,[]);
  trees.get(key).push({x,z,y,grass:kind!==0,woodTop:y,leafTop:y,leafBottom:Infinity,area:0,coniferArea:0});
}
function trunk(at,reach=45) {
  let found=null,best=reach;
  const gx=Math.floor(at.x/9),gz=Math.floor(at.z/9);
  for(let z=gz-1;z<=gz+1;z++) for(let x=gx-1;x<=gx+1;x++) {
    const region=trees.get([x,z].join('_'));
    if(!region) continue;
    for(const tree of region) {
      const distance=(tree.x-at.x)**2+(tree.z-at.z)**2;
      if(distance<best) {found=tree;best=distance;}
    }
  }
  return found;
}
const cells=new Map();
const clumps=new Map();

function read(accessor,C,stride) {
  const a=file.accessors[accessor];
  const offset=source.byteOffset+28+jsonSize+file.bufferViews[a.bufferView].byteOffset;
  return new C(source.buffer,offset,a.count*stride);
}
const a=new Vector3(),b=new Vector3(),c=new Vector3();
const ab=new Vector3(),ac=new Vector3(),face=new Vector3(),at=new Vector3(),normal=new Vector3();
const along=new Vector3(),up=new Vector3(),across=new Vector3();
const vertical=new Vector3(0,1,0),right=new Vector3(1,0,0);
const tileSize=56;
function add(buffer, p, n, roll, size, tint, frame) {
  along.crossVectors(Math.abs(n.y)>0.91?right:vertical,n).normalize().applyAxisAngle(n,roll).multiplyScalar(size);
  up.crossVectors(n,along).normalize().multiplyScalar(size*0.84);
  across.copy(n).multiplyScalar(size);
  buffer.push(along.x,up.x,across.x,p[0],along.y,up.y,across.y,p[1],
    along.z,up.z,across.z,p[2],tint[0],tint[1],tint[2],(frame+0.5)/16);
}
function addSprig(point, direction, roll, size, color, frame, far) {
  const tx=Math.floor(point.x/tileSize),tz=Math.floor(point.z/tileSize);
  const key=[tx,tz].join('_');
  if (!cells.has(key)) cells.set(key,{x:tx*tileSize+tileSize*0.5,z:tz*tileSize+tileSize*0.5,near:[],far:[]});
  const tile=cells.get(key);
  const position=[point.x-tile.x,point.y,point.z-tile.z];
  add(tile.near,position,direction,roll,size,color,frame);
  if (far) add(tile.far,position,direction,roll,size*1.90,color.map(v=>v*0.78),frame);
}
function styled(point, anchor, style, uneven) {
  if(!anchor) return;
  const level=Math.max(0,Math.min(1,(point.y-anchor.y-2.9)/5.8));
  const reach=1+(style.width-1)*level;
  point.x=anchor.x+(point.x-anchor.x)*reach+uneven*level*0.24;
  point.z=anchor.z+(point.z-anchor.z)*reach;
  point.y+=(style.height-1)*level*Math.min(5.5,point.y-anchor.y);
}
function fillCore(anchor, style, shade, conifer, triangle) {
  const key=anchor?[anchor.x,anchor.z,shade,conifer].join('_'):
    [Math.floor(triangle[0].x/4),Math.floor(triangle[0].z/4),Math.floor(triangle[0].y/4),shade,conifer].join('_');
  if(!clumps.has(key)) clumps.set(key,{min:new Vector3(Infinity,Infinity,Infinity),max:new Vector3(-Infinity,-Infinity,-Infinity),style,
    root:anchor?.y??triangle[0].y-5,shade});
  const item=clumps.get(key);
  for(const p of triangle) {
    const corner=p.clone();
    styled(corner,anchor,style,0);
    item.min.min(corner);
    item.max.max(corner);
  }
}
for(const mesh of file.meshes) for(const p of mesh.primitives) {
  const layer=file.materials[p.material].name;
  if(layer!=='Foliage' && layer!=='Wood') continue;
  const xyz=read(p.attributes.POSITION,Float32Array,3);
  if (layer==='Wood') {
    for (let i=0;i<xyz.length;i+=3) {
      const wood=trunk(at.fromArray(xyz,i),4.6);
      if (wood) wood.woodTop=Math.max(wood.woodTop,at.y);
    }
    continue;
  }
  const paint=read(p.attributes.COLOR_0,Uint8Array,4);
  const triangles=read(p.indices,file.accessors[p.indices].componentType===5123?Uint16Array:Uint32Array,1);
  for(let i=0;i<triangles.length;i+=3) {
    const v=triangles[i];
    const conifer=paint[v*4+3]<128;
    a.fromArray(xyz,v*3);
    b.fromArray(xyz,triangles[i+1]*3);
    c.fromArray(xyz,triangles[i+2]*3);
    if(a.x<bounds[0]-45 || a.x>bounds[2]+45 || a.z<bounds[1]-45 || a.z>bounds[3]+45) continue;
    ab.subVectors(b,a);
    ac.subVectors(c,a);
    face.crossVectors(ab,ac);
    const area=face.length()*0.5;
    if(area<0.04) continue;
    face.normalize();
    const scatter=area*(conifer?1.25:1.48);
    const count=Math.min(16,Math.floor(scatter+random()));
    const anchor=trunk(at.copy(a).add(b).add(c).multiplyScalar(1/3));
    if (anchor) {
      anchor.area+=area;
      anchor.leafTop=Math.max(anchor.leafTop,a.y,b.y,c.y);
      anchor.leafBottom=Math.min(anchor.leafBottom,a.y,b.y,c.y);
      if (conifer) anchor.coniferArea+=area;
    }
    const style=treeStyle(anchor?.x??a.x,anchor?.z??a.z,conifer);
    const shade=paint[v*4+3]%128;
    fillCore(anchor,style,shade,conifer,[a,b,c]);
    for(let j=0;j<count;j++) {
      let u=random(),w=random();
      if(u+w>1) {u=1-u;w=1-w;}
      at.copy(a).addScaledVector(ab,u).addScaledVector(ac,w);
      const uneven = Math.sin(at.x*0.66+at.z*0.51)*Math.cos(at.y*0.79-at.z*0.61);
      at.addScaledVector(face,-0.33+random()*0.90+uneven*0.47);
      styled(at,anchor,style,uneven);
      normal.copy(face).add(new Vector3(random()-0.5,(random()-0.5)*1.5,random()-0.5)).normalize();
      const tint=0.67+(shade/127)*0.32+random()*0.25;
      const swatch=shade>86?style.outer:style.leaf;
      const color=swatch.map(v=>v*tint/255);
      const size=0.94+random()*0.87+Math.max(uneven,0)*0.24;
      const roll=random()*Math.PI*2,frame=style.face;
      addSprig(at,normal,roll,size,color,frame,random()<0.38);
    }
  }
}
const crownTiles=new Map();
const trunkTiles=new Map();
const spruceTiles=new Map();
function treeTile(tiles,x,z) {
  const tx=Math.floor(x/tileSize),tz=Math.floor(z/tileSize);
  const key=[tx,tz].join('_');
  if (!tiles.has(key)) tiles.set(key,{p:[],c:[],i:[],at:[tx*tileSize+tileSize/2,0,tz*tileSize+tileSize/2]});
  return tiles.get(key);
}
function addCore(center,radii,yaw,style,height,detail=1) {
  const tx=Math.floor(center.x/tileSize),tz=Math.floor(center.z/tileSize);
  const key=[tx,tz].join('_');
  if (!crownTiles.has(key)) crownTiles.set(key,new CrownMesh());
  crownTiles.get(key).add(center.toArray(),radii,yaw,style,height,detail);
}
function addTrunk(tree,height,radius,style) {
  const tile=treeTile(trunkTiles,tree.x,tree.z);
  const twist=random()*Math.PI*2;
  const bark=style.bark.map(hex=>new Color(hex).toArray().map(v=>Math.round(v*255)));
  const root=new Vector3(tree.x-tile.at[0],tree.y,tree.z-tile.at[2]);
  function tube(rings,sides) {
    const first=tile.p.length/3;
    for (const [center,width,tangent,bitangent] of rings) {
      for (let i=0;i<sides;i++) {
        const angle=i*Math.PI*2/sides;
        const a=Math.cos(angle)*width,b=Math.sin(angle)*width;
        tile.p.push(center.x+tangent.x*a+bitangent.x*b,center.y+tangent.y*a+bitangent.y*b,
          center.z+tangent.z*a+bitangent.z*b);
        tile.c.push(...bark[i%bark.length],255);
      }
    }
    for (let ring=0;ring<rings.length-1;ring++) for (let side=0;side<sides;side++) {
      const a=first+ring*sides+side,b=first+ring*sides+(side+1)%sides;
      tile.i.push(a,b,b+sides,a,b+sides,a+sides);
    }
  }
  const lean=new Vector3(Math.cos(twist),0,Math.sin(twist)).multiplyScalar(height*0.043);
  const centerAt=(level)=>root.clone().add(new Vector3(0,height*level,0)).addScaledVector(lean,Math.max(0,level-0.23));
  const levels=[-0.028,0.09,0.26,0.48,0.72,0.83];
  if (style===DRY || style===SPRUCE) levels.push(0.96,1.0);
  tube(levels.map(level=>[
    centerAt(level),trunkRadiusAt(radius,level)*(1-0.9*Math.max(0,(level-0.83)/0.17)),right,new Vector3(0,0,1)
  ]),7);
  if (style===SPRUCE) return twist;
  if (style===DRY) {
    function branch(from,bend,tip,base,sides) {
      const direction=tip.clone().sub(from);
      const tangent=direction.clone().cross(vertical).normalize();
      const bitangent=direction.clone().cross(tangent).normalize();
      tube([[from,base,tangent,bitangent],[bend,base*0.49,tangent,bitangent],
        [tip,base*0.045,tangent,bitangent]],sides);
    }
    const reach=Math.min(height*0.35,tree.crownLimit*1.2);
    for(let i=0;i<7;i++) {
      const turn=twist+i*2.39996;
      const level=0.28+0.077*i;
      const length=reach*(0.96-i*0.075)*(0.78+random()*0.36);
      const from=centerAt(level);
      const bend=from.clone().add(new Vector3(Math.cos(turn)*length*0.54,height*0.095,Math.sin(turn)*length*0.54));
      const tip=bend.clone().add(new Vector3(Math.cos(turn)*length*0.46,height*(0.067+random()*0.12),Math.sin(turn)*length*0.46));
      const thickness=radius*(0.36-i*0.024);
      branch(from,bend,tip,thickness,5);
      for(let j=0;j<2;j++) {
        const fork=bend.clone().lerp(tip,j*0.44);
        const angle=turn+(j===0?-1:1)*(0.56+random()*0.48);
        const end=fork.clone().add(new Vector3(Math.cos(angle)*length*0.43,height*0.095,Math.sin(angle)*length*0.43));
        branch(fork,fork.clone().lerp(end,0.57),end,thickness*0.56,4);
      }
    }
    return twist;
  }

  if (height>=8) {
    const reach=compactCrownRadius(height,style,tree.crownLimit);
    for (let i=1;i<=3;i++) {
      const turn=twist+i*2.39996;
      const from=centerAt(0.32+i*0.044);
      const branch=new Vector3(Math.cos(turn)*reach*0.77,height*(0.22+i*0.014),Math.sin(turn)*reach*0.77);
      const tangent=branch.clone().cross(vertical).normalize();
      const bitangent=branch.clone().cross(tangent).normalize();
      tube([[from,radius*(0.37-i*0.034),tangent,bitangent],
        [from.clone().add(branch),radius*0.064,tangent,bitangent]],5);
    }
  }
  return twist;
}
for(const item of clumps.values()) {
  const center=item.min.clone().add(item.max).multiplyScalar(0.5);
  const radii=item.max.clone().sub(item.min).multiplyScalar(0.46);
  if(Math.min(radii.x,radii.z)<0.22||radii.y<0.16) continue;
  const yaw=(item.shade%7-3)*0.065;
  const height=Math.max(0,Math.min(1,(center.y-item.root-2.5)/7));
  addCore(center,radii.toArray().map(value=>value*0.87),yaw,item.style,height);
  const fringeCount=Math.min(14,Math.floor(4.8*Math.max(radii.x,radii.z)*radii.y));
  const offset=random()*Math.PI*2;
  for (let i=0;i<fringeCount;i++) {
    const y=random()*1.48-0.86;
    const angle=offset+i*2.39996;
    const ring=Math.sqrt(1-y*y)*(1.02+random()*0.17);
    at.set(Math.cos(angle)*ring*radii.x,y*radii.y,Math.sin(angle)*ring*radii.z);
    at.applyAxisAngle(vertical,-yaw).add(center);
    normal.set(Math.cos(angle+yaw),y+random()*0.5,Math.sin(angle+yaw)).normalize();
    const shade=0.52+height*0.23+(y+0.86)*0.19+random()*0.22;
    const tint=item.style.outer.map(value=>value*shade/255);
    addSprig(at,normal,random()*Math.PI*2,0.64+random()*0.86,tint,item.style.face,i%7===0);
  }
}

function compactCrownRadius(height,style,limit=Infinity) {
  return Math.min(limit,Math.min(5.0,Math.max(0.76,height*0.30))*style.width);
}

function fillCanopy(tree,height,style,groups,young,compact=false,heading) {
  const radius=compact ? compactCrownRadius(height,style,tree.crownLimit) : Math.min(2.9,Math.max(0.76,height*0.26))*style.width;
  const center=new Vector3();
  const rotation=heading??random()*Math.PI*2;
  for (let i=0;i<groups;i++) {
    const theta=rotation+i*2.39996;
    const top=i===0;
    const skirt=top ? 0.14 : 0.43+random()*0.59;
    const level=top ? 0.86 : 0.49+random()*0.25;
    const width=radius*(top ? 0.81 : 0.49+random()*0.27);
    const tall=Math.max(0.55,height*(top ? 0.16 : 0.11+random()*0.047));
    center.set(tree.x+Math.cos(theta)*radius*skirt,tree.y+height*level,tree.z+Math.sin(theta)*radius*skirt);
    const coreWidth=compact ? 0.67 : 0.74;
    addCore(center,[width*coreWidth,tall*0.81,width*(coreWidth-0.05)],theta,style,level,compact&&!top ? 0 : 1);
    const count=compact ? (height>=12 ? (top ? 32 : 20) : (top ? 24 : 14)) : young ? 15 : top ? 26 : 19;
    for (let j=0;j<count;j++) {
      const crownY=1-2*(j+0.5)/count;
      const turn=theta+j*2.39996;
      const ring=Math.sqrt(1-crownY*crownY)*(0.79+random()*0.36);
      normal.set(Math.cos(turn)*ring,crownY,Math.sin(turn)*ring);
      at.set(center.x+normal.x*width,center.y+crownY*tall,center.z+normal.z*width*0.86);
      const light=0.68+level*0.29+crownY*0.13+random()*0.22;
      const tint=(crownY>0.07?style.outer:style.leaf).map(value=>value*light/255);
      const size=Math.min(3.8,Math.max(0.59,width*(0.74+random()*0.61))*(compact ? 1.14 : 1.0));
      const frame=compact && j%5!==0 ? style.face+4 : style.face;
      addSprig(at,normal.normalize(),random()*Math.PI*2,size,tint,frame,j%7<=1);
    }
  }
}

function growBetween(tree,height,parent,style) {
  const [px,py,pz,parentHeight,,,parentLimit]=parent;
  const dx=tree.x-px,dz=tree.z-pz;
  const distance=Math.hypot(dx,dz);
  const yaw=Math.atan2(dz,dx);
  const reach=distance*0.54;
  const tall=Math.min(height,parentHeight)*0.69;
  const base=(tree.y+py)*0.5;
  const span=Math.min(2.7,tree.crownLimit,parentLimit,Math.min(height,parentHeight)*0.19);
  const center=new Vector3((tree.x+px)*0.5,base+tall,(tree.z+pz)*0.5);
  addCore(center,[reach,span*0.90,span],yaw,style,0.55,0);
  const alongX=dx/distance,alongZ=dz/distance;
  const offset=random()*Math.PI*2;
  for (let i=0;i<14;i++) {
    const turn=offset+i*2.39996;
    const u=Math.cos(turn)*(reach*0.89+random()*0.28);
    const v=Math.sin(turn)*span*(0.83+random()*0.49);
    const y=-0.42+random()*1.37;
    at.set(center.x+alongX*u-alongZ*v,center.y+y*span,center.z+alongZ*u+alongX*v);
    normal.set(-alongZ*Math.sin(turn)+alongX*Math.cos(turn)*0.27,y,alongX*Math.sin(turn)+alongZ*Math.cos(turn)*0.27).normalize();
    const light=(0.74+random()*0.24)*(0.93+y*0.16);
    const tint=(y>0.27?style.outer:style.leaf).map(value=>value*light/255);
    addSprig(at,normal,random()*Math.PI*2,1.07+random()*0.57,tint,style.face+4,i%6===0);
  }
}

const crownLimitAt=crownClearance(raw.buildings);
let filled=0,inspected=0,saplings=0;
for (const group of trees.values()) for (const tree of group) {
  if (tree.x<bounds[0] || tree.x>bounds[2] || tree.z<bounds[1] || tree.z>bounds[3]) continue;
  let height=Math.max(tree.leafTop,tree.woodTop)-tree.y;
  const young=height<5.5;
  const style=treeStyle(tree.x,tree.z,tree.coniferArea>tree.area*0.52);
  let heading;
  if (young) {
    if (!tree.grass && tree.woodTop<tree.y+0.58) continue;
    height=8.6+random()*3.6;
    tree.crownLimit=crownLimitAt(tree.x,tree.z);
    heading=addTrunk(tree,height,0.065+height*0.0265,style);
    saplings++;
  }
  inspected++;
  const desired=Math.max(13,height*height*0.46);
  const highBranches=tree.woodTop-tree.y>3.0 && tree.leafBottom>tree.y+height*0.69;
  if (!young && tree.area>desired && !highBranches) continue;
  const groups=young ? 3 : tree.area<desired*0.5 ? 6 : 4;
  fillCanopy(tree,height,style,groups,young,young,heading);
  if (!young) filled++;
}
console.log(`${inspected} mapped tree points inspected, ${filled} mature crowns filled out, ${saplings} saplings added`);
const vacantTrees=JSON.parse(readFileSync(new URL('south-vacant-trees.json',assets)));
let connected=0,spruces=0,dryTrees=0;
const matureStyles=vacantTrees.map(([x,,z])=>{
  const habitat=treeHabitat(x,z);
  const bare=soilPattern(x,z).bare;
  const roll=random();
  if (roll<0.028+bare*0.13) return DRY;
  if (roll>0.94-(habitat**2)*0.57) return SPRUCE;
  return treeStyle(x,z,false);
});
for (const [index,[x,y,z,height,radius,companionOf,crownLimit]] of vacantTrees.entries()) {
  const tree={x,y,z,crownLimit};
  const style=matureStyles[index];
  const heading=addTrunk(tree,height,radius,style);
  if (style===SPRUCE) {
    spruceMesh(treeTile(spruceTiles,x,z),tree,height,heading,style,random,
      (level,angle,spread,index)=>{
        const dx=Math.cos(angle),dz=Math.sin(angle);
        at.set(x+dx*spread*0.70,y+level*height,z+dz*spread*0.70);
        normal.set(dx*0.61,0.70,dz*0.61).normalize();
        const size=Math.max(0.43,Math.min(2.65,spread*0.76));
        const tint=style.outer.map(channel=>channel*(0.78+level*0.54)/255);
        addSprig(at,normal,angle+0.4,size,tint,8,index%6===0);
      });
    spruces++;
    continue;
  }
  if (style===DRY) {
    dryTrees++;
    continue;
  }
  fillCanopy(tree,height,style,height>7.0 ? 4 : 3,height<7.0,true,heading);
  if (companionOf>=0 && matureStyles[companionOf]!==DRY && matureStyles[companionOf]!==SPRUCE) {
    growBetween(tree,height,vacantTrees[companionOf],style);
    connected++;
  }
}
console.log(`${connected} connected grove crowns, ${spruces} spruces, ${dryTrees} dry trees`);
const crowns=new Glb();
crowns.data.materials=[{name:'CrownCore',doubleSided:true},{name:'Wood',doubleSided:true}];
for(const [key,geometry] of crownTiles) {
  const [tx,tz]=key.split('_').map(Number);
  geometry.write(crowns,`Core_${key.replaceAll('-','n')}`,0,[tx*tileSize+tileSize/2,0,tz*tileSize+tileSize/2]);
}
for (const [key,tile] of trunkTiles) {
  crowns.mesh(`Trunks_${key.replaceAll('-','n')}`,Float32Array.from(tile.p),tile.i,1,{
    colors:Uint8Array.from(tile.c),translation:tile.at
  });
}
for (const [key,tile] of spruceTiles) {
  crowns.mesh(`Spruce_${key.replaceAll('-','n')}`,Float32Array.from(tile.p),tile.i,0,{
    colors:Uint8Array.from(tile.c),translation:tile.at
  });
}
writeFileSync(new URL('south-crowns.glb',assets),crowns.encode());

const chunks=[];
const catalog=[];
let offset=0;
for(const tile of cells.values()) {
  const row=[tile.x,tile.z];
  for(const detail of [tile.near,tile.far]) {
    const values=new Float32Array(detail);
    const chunk=Buffer.from(values.buffer);
    row.push(offset,values.length/16);
    offset+=chunk.byteLength;
    chunks.push(chunk);
  }
  catalog.push(row);
}
writeFileSync(new URL('leaf-tiles.bin',assets),Buffer.concat(chunks));
writeFileSync(new URL('leaf-tiles.json',assets),JSON.stringify(catalog));
