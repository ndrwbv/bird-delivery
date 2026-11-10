import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { need } from '../src/game/landdata/land-package-key.js';
import { newExternalPath, sha256 } from './land-package-files.mjs';
import { verifyLandPackage } from './land-package-build.mjs';
import { preparationFixture } from './land-package-prepare.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = key => process.argv.slice(2).find(value => value.startsWith('--' + key + '='))?.slice(key.length + 3);
need(arg('package') && arg('out'), 'DECK_SHADER_REQUIRED_ARGS');
const dir = path.resolve(arg('package'));
const checked = verifyLandPackage({ repo, dir });
if (checked.deckShaders) {
  console.log('Готовые шейдеры Steam Deck уже есть');
  process.exit(0);
}
need(checked.surface, 'DECK_SHADER_REQUIRES_SURFACE');
const starter = checked.catalog.coverage.find(slot => slot.district === 0 && slot.graphics === 'high');
need(starter, 'DECK_SHADER_STARTER');
const out = newExternalPath(repo, arg('out')), dist = path.join(out, 'steam');
fs.mkdirSync(out, { recursive: true });
const req = createRequire(path.join(repo, 'package.json'));
const electron = req('electron');
const linux = process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu-sandbox', '--ozone-platform=headless'] : [];

function run (command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: repo, env, stdio: 'inherit', timeout: 350000 });
  if (result.error) throw result.error;
  need(result.status === 0, 'DECK_SHADER_PREPARE_PROCESS');
}
const fixture = path.join(out, 'fixture.json'), report = path.join(out, 'export.json'), archive = path.join(out, 'archive.gz');
fs.writeFileSync(fixture, JSON.stringify(preparationFixture(starter)), { flag: 'wx' });
run(process.execPath, [path.join(repo, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'steam', '--outDir', dist],
  { ...process.env, BIRD_LAND_DATA_DIR: dir });
run(electron, [...linux, path.join(repo, 'tools/probe.cjs'),
  '--mode=steam', '--dir=' + dist, '--size=deck', '--early', '--startup-trace', '--startup-cold',
  '--startup-deck', '--startup-no-lang', '--fresh', '--startup-session=deck-shaders-' + randomUUID(),
  '--startup-fixture=' + fixture, '--q=fastmenu&mute&deckshaderbake',
  '--init-script=' + path.join(repo, 'tools/probe-checks/deck-shader-capture.js'),
  '--eval=' + path.join(repo, 'tools/probe-checks/deck-shader-export.js'),
  '--deck-shader-out=' + archive, '--report=' + report, '--errors', '--bootwait=220', '--timeout=320']);
const record = JSON.parse(fs.readFileSync(report, 'utf8')), result = record.result;
need(record.ok && !record.evalErr && !record.errors.length && !record.uncaught &&
  result?.captureDeckShaders && result.graphics === 'high', 'DECK_SHADER_PREPARE_REPORT');
const bytes = fs.readFileSync(archive);
need(bytes.length === result.bytes, 'DECK_SHADER_PREPARE_LENGTH');
const hash = sha256(bytes), name = 'city-data/' + hash + '.deck-shaders.gz';
const file = path.join(dir, name), manifest = path.join(dir, 'deck-shaders.json');
fs.writeFileSync(file, bytes, { flag: 'wx' });
let created = false;
try {
  fs.writeFileSync(manifest, JSON.stringify({ version: 1, graphics: 'high', sourceHash: checked.catalog.manifest.sourceHash,
    sha256: hash, path: name, bytes: bytes.length, programs: result.programCount }), { flag: 'wx' });
  created = true;
  verifyLandPackage({ repo, dir });
} catch (error) {
  if (created) fs.rmSync(manifest, { force: true });
  fs.rmSync(file, { force: true });
  throw error;
}
console.log('Готовые шейдеры Steam Deck:', result.programCount, 'программ,', bytes.length, 'байт');
