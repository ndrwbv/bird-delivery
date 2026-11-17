import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inDeliveryZone, playable as play } from './delivery-zone.mjs';

// Keep a ring of scenery past the playable boundary so the horizon still looks natural.
const scenery = { x0: play.x0 - 200, x1: play.x1 + 200, z0: play.z0 - 200, z1: play.z1 + 200 };
const contains = ([x, z]) => x >= scenery.x0 && x <= scenery.x1 && z >= scenery.z0 && z <= scenery.z1;

function overlaps (points) {
  if (!points.length) return false;
  const xs = points.map(([x]) => x), zs = points.map(([, z]) => z);
  return Math.min(...xs) <= scenery.x1 && Math.max(...xs) >= scenery.x0 &&
    Math.min(...zs) <= scenery.z1 && Math.max(...zs) >= scenery.z0;
}

function cropLine (points) {
  const pieces = [];
  let run = [];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index];
    if (overlaps([a, b])) {
      if (!run.length) run.push(a);
      run.push(b);
    } else if (run.length) {
      pieces.push(run);
      run = [];
    }
  }
  if (run.length) pieces.push(run);
  return pieces;
}

function cropTerrain (terrain) {
  const { g, nx, nz, x0, z0 } = terrain;
  const left = Math.max(0, Math.floor((scenery.x0 - x0) / g));
  const right = Math.min(nx - 1, Math.ceil((scenery.x1 - x0) / g));
  const top = Math.max(0, Math.floor((scenery.z0 - z0) / g));
  const bottom = Math.min(nz - 1, Math.ceil((scenery.z1 - z0) / g));
  const heights = Buffer.from(terrain.h, 'base64');
  const rows = [];
  for (let row = top; row <= bottom; row++) {
    rows.push(heights.subarray((row * nx + left) * 2, (row * nx + right + 1) * 2));
  }
  return {
    ...terrain, x0: x0 + left * g, z0: z0 + top * g,
    nx: right - left + 1, nz: bottom - top + 1, h: Buffer.concat(rows).toString('base64'),
  };
}

export async function prepareCity (directory) {
  const { default: source } = await import(pathToFileURL(join(directory, 'city-data.js')).href);
  // A temporary package.json marks the archived game's .js modules as ESM before Vite loads them.
  if (!inDeliveryZone(...source.meta.home)) throw new Error('The pizzeria must be inside the VK district');
  const border = [[play.x0, play.z0], [play.x1, play.z0], [play.x1, play.z1], [play.x0, play.z1]];
  const city = {
    ...source,
    meta: { ...source.meta, city: 'Солнечный', bounds: scenery },
    terrain: cropTerrain(source.terrain),
    border, fence: [], kpp: [], closed: [],
  };
  for (const key of ['roads', 'rails', 'streams']) {
    city[key] = source[key].flatMap(feature => cropLine(feature.p).map(p => ({ ...feature, p })));
  }
  for (const key of ['buildings', 'malls', 'green', 'lots', 'platforms']) {
    city[key] = source[key].filter(feature => overlaps(feature.p));
  }
  city.paths = source.paths.flatMap(cropLine);
  city.garlots = source.garlots.filter(overlaps);
  for (const key of ['worship', 'stations', 'stops', 'pois']) {
    city[key] = source[key].filter(feature => contains(feature.p));
  }
  for (const key of ['levelx', 'signals', 'crossings', 'entrances', 'trees', 'benches', 'metro', 'gates']) {
    city[key] = source[key].filter(contains);
  }
  if (!city.roads.length || !city.buildings.some(building => building.id === city.meta.homeId)) {
    throw new Error('VK district is missing its road network or pizzeria');
  }
  const edits = JSON.parse(readFileSync(join(directory, 'edits.json'), 'utf8'));
  edits.add = edits.add.filter(({ x, z }) => contains([x, z]));
  writeFileSync(join(directory, 'vk-city.js'), `export default ${JSON.stringify(city)};\n`);
  writeFileSync(join(directory, 'vk-edits.json'), JSON.stringify(edits));
  console.log(`VK district: ${city.buildings.length} buildings, ${city.roads.length} roads`);
}
