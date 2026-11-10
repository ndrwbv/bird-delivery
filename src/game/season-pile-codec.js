// A row contains the template, transform, colour, seasonal tags,
// optional lift and normal parameters, then the land anchor.
const STRIDE = 23, BATCH = 1536;
const key = (x,z) => x + ',' + z;

export function createPileCommands (cellSize, send) {
  const templates = new Map(), colors = new Map(), lifts = new Map(), counts = new Map(), anchors = new Map();
  let buffer = new Float64Array(BATCH * STRIDE), length = 0;
  let next = { templates: [], colors: [], lifts: [] }, storedBytes = 0;
  let rootX, rootZ, vertices = 0;
  function id (dict, added, value) {
    let n = dict.get(value);
    if (n === undefined) { n = dict.size; dict.set(value,n); added.push(value); }
    return n;
  }
  function flush () {
    if (!length) return;
    send({ kind: 'rows', rows: buffer.subarray(0, length), ...next });
    storedBytes += buffer.byteLength;
    buffer = new Float64Array(BATCH * STRIDE); length = 0;
    next = { templates:[], colors:[], lifts:[] };
  }
  return {
    counts,
    flush,
    tris: () => vertices / 3,
    mem () {
      return {
        cells: counts.size,
        cap: +((storedBytes + buffer.byteLength) / 1048576).toFixed(1),
        used: +((storedBytes + length * buffer.BYTES_PER_ELEMENT) / 1048576).toFixed(1),
      };
    },
    landAnchor (x,z) { rootX=x; rootZ=z; },
    add (tpl,x,y,z,sx,sy,sz,rx,ry,rz,hex,kind=0,seed=0,pal=0,shade=0,lift=null,liftK=1,normal=null) {
      const tx = Math.floor(x/cellSize), tz = Math.floor(z/cellSize), k = key(tx,tz);
      const v0 = counts.get(k) || 0, nv = tpl.length / 3;
      counts.set(k,v0+nv); vertices += nv;
      const a=buffer,i=length, ax=rootX ?? x, az=rootZ ?? z;
      a[i]=id(templates,next.templates,tpl);
      a[i+1]=x; a[i+2]=y; a[i+3]=z; a[i+4]=sx; a[i+5]=sy; a[i+6]=sz;
      a[i+7]=rx; a[i+8]=ry; a[i+9]=rz;
      const rgb=hex?.isColor ? {isColor:true,r:hex.r,g:hex.g,b:hex.b} : hex;
      a[i+10]=id(colors,next.colors,rgb);
      a[i+11]=kind; a[i+12]=seed; a[i+13]=pal; a[i+14]=shade;
      a[i+15]=lift ? id(lifts,next.lifts,lift) : -1; a[i+16]=liftK;
      if (normal) { a[i+17]=normal.w; a[i+18]=normal.cx; a[i+19]=normal.cy; a[i+20]=normal.cz; }
      a[i+21]=ax; a[i+22]=az;
      const k0=key(ax,az);
      if (!anchors.has(k0)) anchors.set(k0,[ax,az]);
      length += STRIDE;
      if (length===buffer.length) flush();
      return { key:k,v0,nv };
    },
    raiseLand (delta) {
      flush();
      const values=new Float64Array(anchors.size*3);
      let at=0;
      for (const [x,z] of anchors.values()) { values[at++]=x; values[at++]=z; values[at++]=delta(x,z); }
      anchors.clear();
      send({ kind: 'raise', values });
      storedBytes += values.byteLength;
    },
  };
}

export function applyPileCommands (pile) {
  const templates=[],colors=[],lifts=[];
  return command => {
    if (command.kind==='raise') {
      const heights=new Map(), a=command.values;
      for (let i=0;i<a.length;i+=3) heights.set(key(a[i],a[i+1]),a[i+2]);
      pile.raiseLand((x,z)=>heights.get(key(x,z)));
      return;
    }
    const a=command.rows;
    templates.push(...command.templates); colors.push(...command.colors); lifts.push(...command.lifts);
    for(let i=0;i<a.length;i+=STRIDE) {
      pile.landAnchor(a[i+21],a[i+22]);
      pile.add(templates[a[i]],a[i+1],a[i+2],a[i+3],a[i+4],a[i+5],a[i+6],a[i+7],a[i+8],a[i+9],
        colors[a[i+10]],a[i+11],a[i+12],a[i+13],a[i+14],lifts[a[i+15]] ?? null,a[i+16],
        a[i+17] ? {w:a[i+17],cx:a[i+18],cy:a[i+19],cz:a[i+20]} : null);
    }
    pile.landAnchor();
  };
}
