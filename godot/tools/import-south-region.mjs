// node godot/tools/import-south-region.mjs — data only, no renderer or editor.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import ClipperLib from 'clipper-lib';
import { createServer } from 'vite';
import { decodeAddressCatalog } from '../../src/game/addresscodec17b.js';

const project = new URL('../../', import.meta.url);
const assets = new URL('../assets/', import.meta.url);
const core = JSON.parse(await readFile(new URL('south-original.json', assets), 'utf8'));
const scale = 1000; // Clipper integer coordinates, millimetres
const rounded = n => Math.round(n * scale) / scale;
const encode = ([x, z]) => ({ X: Math.round(x * scale), Y: Math.round(z * scale) });
const decode = ({ X, Y }) => [X / scale, Y / scale];
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function bounds(points) {
  return points.reduce(([x0, z0, x1, z1], [x, z]) =>
    [Math.min(x0, x), Math.min(z0, z), Math.max(x1, x), Math.max(z1, z)], [Infinity, Infinity, -Infinity, -Infinity]);
}

function halfPlane(polygon, distance) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = distance(...a), db = distance(...b);
    if (da >= 0) result.push(a);
    if ((da >= 0) !== (db >= 0)) result.push(mix(a, b, da / (da - db)));
  }
  return result;
}

function booleanPolygons(operation, subject, clip) {
  const instance = new ClipperLib.Clipper(), result = [];
  const toPaths = polygons => polygons.map(p => {
    const path = p.map(encode);
    if (!ClipperLib.Clipper.Orientation(path)) path.reverse();
    return path;
  });
  instance.AddPaths(toPaths(subject), ClipperLib.PolyType.ptSubject, true);
  instance.AddPaths(toPaths(clip), ClipperLib.PolyType.ptClip, true);
  instance.Execute(operation, result, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return result.map(p => p.map(decode));
}
const intersect = (a, b) => booleanPolygons(ClipperLib.ClipType.ctIntersection, a, b);

// The two sides of the railway use different rules in districtAt(). Its
// street outline can be concave, and the union must precede the city clip.
function southBoundary(cityBorder, { P0, AX, BANDS, RL0, RLU, SOUTH, SE_Z }) {
  const [x0, z0, x1, z1] = bounds(cityBorder);
  const rect = [[x0,z0], [x1,z0], [x1,z1], [x0,z1]];
  const rail = (x,z) => RLU[0] * (z - RL0[1]) - RLU[1] * (x - RL0[0]);
  const city = halfPlane(halfPlane(rect, x => x + 1380), (x,z) => z + 1250);
  // The two half-planes meet along one mathematical line. Leave a two-mm
  // overlap so separately rounded intersections cannot turn it into a crack.
  const west = halfPlane(city, rail), east = halfPlane(city, (x,z) => 0.002 - rail(x,z));
  const band = halfPlane(west, (x,z) => BANDS[0] - (x - P0[0]) * AX[0] - (z - P0[1]) * AX[1]);
  const streets = intersect([SOUTH], [halfPlane(west, (x,z) => z - 1270)]);
  const eastSouth = halfPlane(east, (x,z) => z - SE_Z);
  const joined = booleanPolygons(ClipperLib.ClipType.ctUnion, [...streets, band, eastSouth], []);
  const loops = intersect(joined, [cityBorder]);
  assert.equal(loops.length, 1, 'South should be a single connected delivery district: ' +
    JSON.stringify(loops.map(p => [p.length, centroid(p), bounds(p)])));
  return loops[0];
}

function centroid(polygon) {
  let area2 = 0, cx = 0, cz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x,z] = polygon[i], [u,v] = polygon[(i + 1) % polygon.length];
    const cross = x * v - z * u;
    area2 += cross;
    cx += (x + u) * cross;
    cz += (z + v) * cross;
  }
  return { center: area2 ? [cx / (3 * area2), cz / (3 * area2)] : polygon[0], area: Math.abs(area2) / 2 };
}

function nearestRoadPoint(roads, [x,z], maxClass) {
  let best = null, bestDistance = Infinity;
  for (const road of roads) {
    if (road.c > maxClass || (maxClass <= 5 && road.x)) continue;
    for (let i = 1; i < road.p.length; i++) {
      const a = road.p[i-1], b = road.p[i], dx = b[0]-a[0], dz = b[1]-a[1];
      const t = Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz || 1)));
      const px = a[0]+t*dx, pz = a[1]+t*dz;
      const distance = Math.hypot(x-px,z-pz);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = { road, i, t, point:[px,pz], distance };
    }
  }
  return best;
}

// Keep all source vertices in their original order, especially shared nodes
// and one-way direction. A road may enter and leave South several times.
function makeClipper(outline) {
  const polygon = outline.map(encode);
  const contains = p => ClipperLib.Clipper.PointInPolygon(encode(p), polygon) !== 0;
  const edges = outline.map((p, i) => {
    const q = outline[(i + 1) % outline.length];
    return { p, q, box: bounds([p, q]) };
  });
  function line(points) {
    const runs = [];
    let current = null;
    for (let i = 1; i < points.length; i++) {
      const a = points[i-1], b = points[i], [x0,z0,x1,z1] = bounds([a,b]);
      const dx = b[0] - a[0], dz = b[1] - a[1];
      if (!dx && !dz) continue;
      const cuts = [0, 1];
      for (const {p,q,box} of edges) {
        if (box[0] > x1 || box[2] < x0 || box[1] > z1 || box[3] < z0) continue;
        const ex = q[0] - p[0], ez = q[1] - p[1], den = dx * ez - dz * ex;
        const ax = p[0] - a[0], az = p[1] - a[1];
        if (Math.abs(den) < 1e-8) {
          if (Math.abs(ax * dz - az * dx) > 1e-7) continue;
          for (const v of [p,q]) {
            const t = Math.abs(dx) > Math.abs(dz) ? (v[0]-a[0])/dx : (v[1]-a[1])/dz;
            if (t > 0 && t < 1) cuts.push(t);
          }
          continue;
        }
        const t = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
      }
      cuts.sort((m,n) => m-n);
      for (let j = 1; j < cuts.length; j++) {
        const start = mix(a,b,cuts[j-1]).map(rounded), end = mix(a,b,cuts[j]).map(rounded);
        if (same(start,end)) continue;
        if (!contains(mix(a,b,(cuts[j-1]+cuts[j])/2))) { current = null; continue; }
        if (!current || !same(current.at(-1),start)) { current = [start]; runs.push(current); }
        current.push(end);
      }
    }
    return runs;
  }
  return { contains, line };
}

function cropTerrain(terrain, heights, box, local, sourceY) {
  const {g,nx,nz,x0,z0} = terrain;
  const margin = 96; // continue the ground and the Tom beyond the playable edge
  const i0 = Math.max(0, Math.floor((box[0]-margin-x0)/g));
  const j0 = Math.max(0, Math.floor((box[1]-margin-z0)/g));
  const i1 = Math.min(nx-1, Math.ceil((box[2]+margin-x0)/g));
  const j1 = Math.min(nz-1, Math.ceil((box[3]+margin-z0)/g));
  const values = [];
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) values.push(rounded(heights[j*nx+i] - sourceY));
  const [x,z] = local([x0+i0*g,z0+j0*g]);
  return {x,z,step:g,width:i1-i0+1,depth:j1-j0+1,heights:values};
}

async function steamAddresses() {
  // The release run 44028936700 ships prepared-address-data/high,
  // file SHA-256 9c173878ea48943a1b47faf62db34eff6781f21ebc2b9bf62f1c51591dde4754.
  // The archived in-repo catalogue has a different build identity in its header,
  // but its complete address/entrance/spot payload matches that release byte for byte.
  const archive = new URL('docs/measurements/ordinary-address-2026-11-02/settled-recheck/evidence/package/', project);
  const {slots} = JSON.parse(await readFile(new URL('catalog.json',archive), 'utf8'));
  const slot = slots.find(s => s.graphics === 'high');
  const bytes = gunzipSync(await readFile(new URL(slot.entry.path + '.gz',archive)));
  const payload = bytes.subarray(28 + bytes.readUInt32LE(12));
  assert.equal(createHash('sha256').update(payload).digest('hex'),
    'f207af0149bdd66c02b0d5c2d2debd9e6e1b8b723fb988debda87c8cb8e43ba1', 'v0.36.0 address data changed');
  return decodeAddressCatalog(bytes, slot.identity);
}

// Steam modules share display preference detection even in their pure data
// entry points. Middleware mode resolves their JSON imports and import.meta.glob
// without opening a game window or listening on a port.
globalThis.location ??= new URL('file:///');
if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: { userAgent: '' } });
globalThis.matchMedia ??= () => ({ matches: false });
globalThis.addEventListener ??= () => {};
const loader = await createServer({ root: fileURLToPath(project), configFile: false, appType: 'custom',
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
const load = name => loader.ssrLoadModule('/src/' + name + '.js');

try {
  const { default: map, southGeometry } = await load('maps/seversk/index');
  const city = map.data, sourceY = core.sourceY;
  const local = ([x,z]) => [rounded(x-city.meta.home[0]), rounded(z-city.meta.home[1])];
  const beach = await load('game/beach'), maps = await load('game/mapcheck');
  const rings = await load('game/rings'), wall = await load('game/citypaint');
  (await load('game/map')).useMap(map);
  (await load('game/editlayer')).houses(city);
  (await load('game/roadwiden')).widen(city);
  rings.roundOff(city);
  (await load('game/world')).prepCity(city, map, true);
  (await load('game/roadsmooth')).smooth(city, { on: true, circles: rings.found(city) });
  beach.prepare(map, city);
  assert(beach.DEBUG.STATS.ok, beach.DEBUG.STATS.why);
  const heights = maps.decodeHeights(city.terrain);
  maps.fixMap(city, heights);
  const terrainOptions = {
    roadHW: r => (maps.sidewalkW(r) + (r.g || 0) * 2) / 2,
    spots: [...map.career.districts.list.map(d => [...d.pizza,60]), ...map.career.garages.map(g => [g.x,g.z,45])],
  };
  (await load('game/relief')).addRelief(city, heights, city.terrain, terrainOptions);
  beach.shape(heights, city.terrain);
  (await load('game/streams')).carve(city, heights, city.terrain, terrainOptions);

  const polygon = southBoundary(map.border, southGeometry), box = bounds(polygon);
  const clip = makeClipper(polygon);
  const insideBox = ([x,z]) => x >= box[0] && z >= box[1] && x <= box[2] && z <= box[3];
  const overlapsBox = p => {
    const [x0,z0,x1,z1] = bounds(p);
    return x0 <= box[2] && z0 <= box[3] && x1 >= box[0] && z1 >= box[1];
  };
  const ground = maps.groundFn(city.terrain, heights);
  const roads = [];
  for (const r of city.roads) {
    if (!maps.drivable(r) || !overlapsBox(r.p)) continue;
    for (const points of clip.line(r.p)) {
      const road = {class:r.c, width:maps.roadWidth(r), oneway:r.o || 0, name:r.n || '', points:points.map(local)};
      if (r.b) {
        // Keep the road's elevation distinct from the road running under it.
        const deck = maps.deckOf(r, ground);
        road.deck_y = points.map(point => {
          const {i,t} = nearestRoadPoint([r], point, 7);
          const station = deck.acc[i-1] + t*(deck.acc[i]-deck.acc[i-1]);
          return rounded(deck.fn(station)-sourceY);
        });
      }
      roads.push(road);
    }
  }
  const buildings = [];
  const addresses = await steamAddresses();
  const houses = new Map(addresses.houses.map((h,i) => [addresses.houseLinks[i].sourceId,h]));
  const doors = new Map();
  addresses.generatedDoors.forEach(([x,z,nx,nz],i) => {
    const link = addresses.doorLinks[i];
    if (!insideBox([x,z]) || !clip.contains([x,z])) return;
    if (!doors.has(link.sourceId)) doors.set(link.sourceId,[]);
    doors.get(link.sourceId).push({at:local([x,z]),normal:[nx,nz],grand:link.grand});
  });
  for (const b of city.buildings) {
    if (!overlapsBox(b.p)) continue;
    const {area,center} = centroid(b.p);
    if (!clip.contains(center) || area < 0.1) continue;
    const floors = b.lv || (area > 1200 ? 5 : area > 600 ? 4 : area > 220 ? 2 : 1);
    const building = { id:b.id, kind:b.k, height:rounded(b.k === 'gar' ? 2.7 : 3.15*floors + 1.1),
      color:wall.wallHex(b) || b.col || '#d6cabc', street:b.a?.[0] || '', number:b.a?.[1] || '', outline:b.p.map(local) };
    const house = houses.get(b.id);
    if (house) {
      building.door = local([house.x,house.z]);
      building.approach = local([house.mx,house.mz]);
    }
    if (doors.has(b.id)) building.doors = doors.get(b.id);
    buildings.push(building);
  }
  const greens = [];
  for (const {k,p} of [...city.green, ...(map.woods || []).map(p => ({k:'wood',p}))]) {
    if (!overlapsBox(p)) continue;
    for (const outline of intersect([p],[polygon])) greens.push({kind:k,outline:outline.map(local)});
  }
  const rails = city.rails.filter(r => overlapsBox(r.p)).flatMap(r =>
    clip.line(r.p).map(points => ({kind:r.k, points:points.map(local)})));
  const streams = city.streams.filter(r => overlapsBox(r.p)).flatMap(r =>
    clip.line(r.p).map(points => ({name:r.n || '', width:r.w || 6, points:points.map(local)})));
  const boundary = polygon.map(local);
  const gates = city.kpp.filter(g => clip.contains(g.p)).map(g => {
    const {road} = nearestRoadPoint(city.roads, g.p, 7);
    return {name:g.n, at:local(g.p), axis:[g.ux || 1,g.uz || 0], width:Math.max(8,maps.roadWidth(road)+2)};
  });
  const stops = [];
  for (const stop of city.stops.filter(s => insideBox(s.p) && clip.contains(s.p))) {
    const near = nearestRoadPoint(city.roads, stop.p, 5);
    if (!near || near.distance > 26 || near.road.b) continue;
    const normal = stop.p.map((value,i) => (value-near.point[i])/(near.distance || 1));
    const setback = maps.roadWidth(near.road)/2 + 2;
    const shelter = near.point.map((value,i) => value+normal[i]*setback);
    stops.push({name:stop.n, at:local(shelter), normal, road:local(near.point)});
  }
  const parkingLots = [];
  let available = 201; // same shared-city cap and OSM order as osmStreetLife()
  for (const lot of city.lots.filter(l => l.k === 'park')) {
    const n = lot.p.length;
    const center = lot.p.reduce(([x,z],p) => [x+p[0]/n,z+p[1]/n], [0,0]);
    const near = nearestRoadPoint(city.roads, center, 5);
    if (!near || near.distance > 40) continue;
    if (clip.contains(center)) parkingLots.push({at:local(center),entry:local(near.point),outline:lot.p.map(local)});
    if (--available === 0) break;
  }
  assert.equal(gates.length, 2, 'Both original South gateways must be present');
  const terrain = cropTerrain(city.terrain, heights, box, local, sourceY);
  const entrances = addresses.entrances.filter(p => insideBox(p) && clip.contains(p)).map(([x,z,nx,nz]) => [...local([x,z]),nx,nz]);
  const spots = addresses.spots.map(s => [s.x,s.z]).filter(p => insideBox(p) && clip.contains(p)).map(local);
  const story = await load('game/story');
  story.init({CITY:{...city,entrances:addresses.entrances},SPOTS:addresses.spots});
  const character = story.STORIES.find(s => s.id === 'gennady');
  const home = story.DEBUG.homeOf(character.id);
  const parking = character.parking;
  const gennady = { door:local([home.ex,home.ez]), normal:[home.nx,home.nz], spot:local([home.x,home.z]),
    parking:local([parking.x,parking.z]), parking_heading:parking.h,
    approach:local([parking.approach.x,parking.approach.z]), approach_heading:parking.approach.h };
  const garage = map.career.garage;
  const data = {reference:'Steam v0.36.0', attribution:city.meta.src, origin:city.meta.home, source_y:sourceY,
    bounds:bounds(boundary), core_bounds:core.bounds, boundary, water_y:rounded(-sourceY),
    visual_bounds:[terrain.x,terrain.z,terrain.x+(terrain.width-1)*terrain.step,terrain.z+(terrain.depth-1)*terrain.step],
    gates, beach:local(map.beach.at), garage:local([garage.x,garage.z]), gennady,
    entrances, spots, roads, buildings, greens, rails, streams, stops, parking_lots:parkingLots, terrain};
  await writeFile(new URL('south-region.json', assets), JSON.stringify(data) + '\n');
  console.log('South:', (centroid(boundary).area/1e6).toFixed(6), 'km²,', roads.length, 'road polylines,',
    buildings.length, 'footprints,', entrances.length, 'entrances,', terrain.width, '×', terrain.depth, 'heights');
} finally {
  await loader.close();
}
