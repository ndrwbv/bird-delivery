// Read the road conditions and individual wheel-contact locations from the released
// roadwear module. No renderer or browser window is needed for this data import.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import ClipperLib from 'clipper-lib';
import { winterReceivers, packWinterCells } from './south-winter-data.mjs';

const assets = new URL('../assets/', import.meta.url);
const region = JSON.parse(await readFile(new URL('south-region.json', assets)));
const [ox, oz] = region.origin;
const poly = region.boundary.map(([x,z]) => ({X:Math.round(x*1000),Y:Math.round(z*1000)}));
const inside = (x,z) => ClipperLib.Clipper.PointInPolygon({X:Math.round((x-ox)*1000),Y:Math.round((z-oz)*1000)},poly) !== 0;
const [x0,z0,x1,z1] = region.bounds;
const cells = new Map();
const bucket = (x,z) => Math.floor(x/24) + ',' + Math.floor(z/24);
function nearestRoad(x,z) {
  let best = null, d2 = Infinity;
  for (const seg of cells.get(bucket(x,z)) || []) {
    const dx = seg.x2-seg.x1, dz = seg.z2-seg.z1;
    const t = Math.max(0,Math.min(1,((x-seg.x1)*dx+(z-seg.z1)*dz)/(dx*dx+dz*dz || 1)));
    const d = (x-seg.x1-t*dx)**2+(z-seg.z1-t*dz)**2;
    if (d < d2) { best = seg; d2 = d; }
  }
  return best ? {d:Math.sqrt(d2),seg:best} : null;
}
globalThis.location ??= new URL('file:///');
if (!globalThis.navigator) Object.defineProperty(globalThis,'navigator',{value:{userAgent:''}});
globalThis.matchMedia ??= () => ({matches:false});
globalThis.addEventListener ??= () => {};
const loader = await createServer({root:fileURLToPath(new URL('../../',import.meta.url)),configFile:false,
  plugins:[{name:'expose-roadwear-data',transform(code,id) {
    if (id.endsWith('/src/game/winterroads.js')) return code+'\nexport const nativeReceivers = () => ({segments:[...new Set([...ROAD_GRID.values()].flat())],banks:BANKS.map(b=>b.p)});';
    if (id.endsWith('/src/game/roadwear.js')) return code+'\nexport {brokenPots as nativeBrokenPots};';
  }}],appType:'custom',server:{middlewareMode:true,watch:null,hmr:false,ws:false},
  optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
const load = name => loader.ssrLoadModule('/src/'+name+'.js');
try {
  const {default:map} = await load('maps/seversk/index');
  const city = map.data;
  (await load('game/map')).useMap(map);
  (await load('game/editlayer')).houses(city);
  (await load('game/roadwiden')).widen(city);
  const rings = await load('game/rings');
  rings.roundOff(city);
  (await load('game/world')).prepCity(city,map,true);
  (await load('game/roadsmooth')).smooth(city,{on:true,circles:rings.found(city)});
  const maps = await load('game/mapcheck');
  (await load('game/beach')).prepare(map,city);
  maps.fixMap(city,maps.decodeHeights(city.terrain));
  const {roadWidth} = maps;
  const RW = await load('game/roadwear');
  RW.init({CITY:city,MAP:map,nearestRoad});
  for (const road of city.roads) {
    delete road._wear;
    RW.kindOf(road);
    if (road.c>7) continue;
    const w = roadWidth(road), margin = w/2+2;
    for (let i=1;i<road.p.length;i++) {
      const [ax,az] = road.p[i-1], [bx,bz] = road.p[i];
      if (Math.max(ax,bx)<x0+ox-margin || Math.min(ax,bx)>x1+ox+margin ||
          Math.max(az,bz)<z0+oz-margin || Math.min(az,bz)>z1+oz+margin) continue;
      const seg = {x1:ax,z1:az,x2:bx,z2:bz,w};
      for (let x=Math.floor((Math.min(ax,bx)-margin)/24);x<=Math.floor((Math.max(ax,bx)+margin)/24);x++)
        for (let z=Math.floor((Math.min(az,bz)-margin)/24);z<=Math.floor((Math.max(az,bz)+margin)/24);z++) {
          const key = x+','+z;
          if (!cells.has(key)) cells.set(key,[]);
          cells.get(key).push(seg);
        }
    }
  }
  const mm = value => Math.round(value*1000)/1000;
  const pots = RW.nativeBrokenPots();
  const holes = [];
  let color, index = 0;
  RW.drawPots({color(value) { color = value; }, poly(points) {
    if (color !== '#cdc9c1') return;
    const p = pots[index++];
    if (inside(p.x,p.z)) holes.push([mm(p.x-ox),mm(p.z-oz),mm(p.r),
      ...points.flatMap(([x,z])=>[mm((x-p.x)/1.22),mm((z-p.z)/1.22)])]);
  }});
  if (index !== pots.length) throw new Error('Roadwear polygons and wheel locations disagree');
  if (!holes.length) throw new Error('No broken asphalt locations in the South district');
  await writeFile(new URL('south-potholes.json',assets),JSON.stringify(holes)+'\n');
  const winter = winterReceivers(await load('game/winterroads'),city,maps,region,inside);
  await writeFile(new URL('south-winter-roads.bin',assets),packWinterCells(winter));
  console.log(holes.length+' holes, '+winter.roads.length+' winter road segments and '+winter.banks.length+' ploughed banks');
} finally { await loader.close(); }
