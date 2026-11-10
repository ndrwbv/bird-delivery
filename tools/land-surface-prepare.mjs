/* Bake draw-only terrain around each supported district.
   Run after the ordinary contour package has been produced and verified. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { decodeSurfaceBundle, encodeSurfaceTiles, SURFACE_BAKE_RADIUS } from '../src/game/landdata/surface-tiles.js';
import { encodeCurbPhysics } from '../src/game/landdata/curb-physics.js';
import { assertOrdinaryEDL, need } from '../src/game/landdata/land-package-key.js';
import { newExternalPath, sha256 } from './land-package-files.mjs';
import { preparationFixture } from './land-package-prepare.mjs';
import { verifyLandPackage } from './land-package-build.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = key => process.argv.slice(2).find(value => value.startsWith('--'+key+'='))?.slice(key.length+3);
need(arg('package') && arg('out'), 'SURFACE_REQUIRED_ARGS');
const dir = path.resolve(arg('package'));
const checked = verifyLandPackage({ repo, dir });
if (checked.surface) {
  console.log('Готовый рисунок земли уже есть');
  process.exit(0);
}
const out = newExternalPath(repo, arg('out')), dist = path.join(out, 'steam');
fs.mkdirSync(out, { recursive: true });
const req = createRequire(path.join(repo, 'package.json'));
const electron = req('electron');
const platform = process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu-sandbox', '--ozone-platform=headless'] : [];

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: repo, env, stdio: 'inherit', timeout: 650000 });
  if (result.error) throw result.error;
  need(result.status === 0, 'SURFACE_PREPARE_PROCESS');
}
function decode(raw) {
  return decodeSurfaceBundle(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

run(process.execPath, [path.join(repo,'node_modules/vite/bin/vite.js'),'build','--mode','steam','--outDir',dist],
  { ...process.env, BIRD_LAND_DATA_DIR: dir });
const { entries, coverage } = checked.catalog;
const starter = coverage.find(slot => slot.district === 0 && slot.graphics === 'high');
const contour = entries.find(entry => entry.precleanHash === starter?.precleanHash);
need(contour, 'SURFACE_STARTER_CONTOUR');
const slots = coverage.filter(slot => slot.graphics === 'high' && slot.precleanHash === contour.precleanHash);
const tiles = new Map(), curbs = new Map(), curbLayouts = new Map();
for (const slot of slots) {
  const prefix = path.join(out, 'district'+slot.district);
  const fixture = prefix+'-fixture.json', report = prefix+'.json', file = prefix+'.surface';
  fs.writeFileSync(fixture, JSON.stringify(preparationFixture(slot)), { flag: 'wx' });
  const check = `
    const cache = d.LAND_PACKAGE?.meta(), pizza = d.PZ_CUR;
    if (!cache?.hit || d.LATE.busy() || d.DIST.cur() !== ${slot.district} ||
        !d.LAND_STREAM.gpuReadyAt(pizza.bx, pizza.bz, ${SURFACE_BAKE_RADIUS}) || d.crashlog.entries().length) {
      throw Error('Нет готового рисунка земли и опоры');
    }
    return {captureSurface:true, contourSha256:cache.rawSha256, tiles:d.LAND_STREAM.stats.ready, descriptor:d.LAND_RNG()};
  `;
  run(electron, [...platform, path.join(repo, 'tools/probe.cjs'),
    '--mode=steam','--dir='+dist,'--size=deck','--startup-trace','--startup-cold','--fresh',
    '--startup-session=surface-'+randomUUID(),'--startup-fixture='+fixture,
    '--q=gfxdev=deck&mute&startupdistrict='+slot.district+'&landmeshbake',
    '--js='+check,'--land-surface-out='+file,'--report='+report,'--errors','--bootwait=360','--timeout=610']);
  const runReport = JSON.parse(fs.readFileSync(report, 'utf8')), result = runReport.result;
  need(runReport.ok && !runReport.uncaught && !runReport.errors.length && result.captureSurface &&
    result.contourSha256 === contour.rawSha256, 'SURFACE_PREPARE_REPORT');
  assertOrdinaryEDL(result.descriptor);
  const captured = decode(fs.readFileSync(file));
  need(captured.tiles.size >= result.tiles, 'SURFACE_PREPARE_COUNT');
  need(captured.curbs.size === 1 && captured.curbs.has(slot.district), 'SURFACE_PREPARE_CURBS');
  const curb = captured.curbs.get(slot.district);
  const prior = curbLayouts.get(curb.inputHash);
  if (prior) {
    const normalized = row => Buffer.from(encodeCurbPhysics(new Map([[0, row]])));
    need(normalized(prior).equals(normalized(curb)), 'SURFACE_CURB_MISMATCH');
  } else {
    curbLayouts.set(curb.inputHash, curb);
    curbs.set(slot.district, curb);
  }
  for (const [id, meshes] of captured.tiles) {
    if (tiles.has(id)) {
      const before = encodeSurfaceTiles(new Map([[id,tiles.get(id)]]));
      const after = encodeSurfaceTiles(new Map([[id,meshes]]));
      need(Buffer.from(before).equals(Buffer.from(after)), 'SURFACE_TILE_MISMATCH');
    } else tiles.set(id, meshes);
  }
}
const raw = encodeSurfaceTiles(new Map([...tiles].sort(([a],[b]) => a-b)), curbs);
const sha = sha256(raw), name = 'city-data/'+sha+'.surface';
const file = path.join(dir, name), manifest = path.join(dir, 'surface.json');
fs.writeFileSync(file, raw, { flag: 'wx' });
let manifestCreated = false;
try {
  fs.writeFileSync(manifest, JSON.stringify({
    version:1, contourSha256:contour.rawSha256, sha256:sha, path:name, bytes:raw.byteLength,
  }), { flag:'wx' });
  manifestCreated = true;
  verifyLandPackage({ repo, dir });
} catch (error) {
  if (manifestCreated) fs.rmSync(manifest, { force:true });
  fs.rmSync(file, { force:true });
  throw error;
}
console.log('Готовый рисунок земли:', tiles.size, 'участков,', raw.byteLength, 'байт');
