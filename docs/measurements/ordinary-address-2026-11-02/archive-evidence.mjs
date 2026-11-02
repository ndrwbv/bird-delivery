#!/usr/bin/env node
// Deliberately not auto-run by the producer. Builtins only; one file/stream at a time.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createGzip, createGunzip } from 'node:zlib';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const fail = message => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const opts = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = /^--(repo|source|dest)=(.+)$/.exec(arg);
  assert(match, `Unknown argument: ${arg}`);
  return [match[1], match[2]];
}));
const repo = await fsp.realpath(opts.repo || '/Users/andrewboev/Desktop/not-work/delivery');
const source = await fsp.realpath(opts.source || path.dirname(fileURLToPath(import.meta.url)));
const dest = path.resolve(opts.dest || path.join(repo, 'docs/measurements/ordinary-address-2026-11-02'));
const LIMITS = Object.freeze({ metadata: 4 * 1024 * 1024, oneFile: 64 * 1024 * 1024,
  sourceArtifacts: 30 * 1024 * 1024, originalTotal: 512 * 1024 * 1024,
  archivedTotal: 40 * 1024 * 1024 });
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cleanRelative = value => {
  assert(typeof value === 'string' && value && !value.includes('\\') && !path.posix.isAbsolute(value), `Unsafe path: ${value}`);
  assert(value.split('/').every(p => p && p !== '.' && p !== '..'), `Unsafe path: ${value}`);
  return value;
};
const json = async file => {
  const stat = await fsp.stat(file);
  assert(stat.isFile() && stat.size <= LIMITS.metadata, `Metadata limit: ${file}`);
  return JSON.parse(await fsp.readFile(file, 'utf8'));
};
const terminal = (run, label) => {
  assert(run && run.status === 'returned' && run.processStatus === 0 && run.signal === null,
    `Non-successful/incomplete process: ${label}`);
  assert(Array.isArray(run.argv) && run.argv.length > 1, `Missing actual argv: ${label}`);
};
const successful = (value, label) => {
  assert(value?.ok === true, `Saved admission is not PASS: ${label}`);
  assert(Array.isArray(value.runs) && value.runs.length, `Missing process journal: ${label}`);
  for (const run of value.runs) terminal(run, `${label}/${run.label}`);
};
const prep = await json(path.join(source, 'preparation.json'));
const consumer = await json(path.join(source, 'consumer-protocol.json'));
const notrace = await json(path.join(source, 'notrace-protocol.json'));
successful(prep, 'preparation'); successful(consumer, 'consumer'); successful(notrace, 'notrace');
assert(prep.protocol?.exports === 4 && prep.protocol.seed === null && prep.protocol.fresh === true, 'Not the four ordinary fresh exports');
assert(equal(prep.source, consumer.source) && equal(prep.source, notrace.source), 'Source receipts differ');
assert(hex(prep.source?.base?.sourceHash) && hex(prep.build?.hash) && hex(consumer.build?.hash), 'Missing source/build hashes');
const expectedLabels = ['fresh-mid-1', 'fresh-mid-2', 'fresh-high-1', 'fresh-high-2'];
assert(Array.isArray(prep.exports) && prep.exports.length === 4, 'Expected exactly four export records');
assert(equal(prep.exports.map(e => e.label).sort(), [...expectedLabels].sort()), 'Export slots differ');
assert(new Set(prep.exports.map(e => e.session)).size === 4 && prep.exports.every(e => typeof e.session === 'string' && e.session), 'Cold export sessions are not independent');
for (const e of prep.exports) {
  assert(e.processStatus === 0 && e.signal === null && hex(e.reportSha256) && hex(e.sha256), `Export is incomplete: ${e.label}`);
  assert(e.graphics === (e.label.includes('-high-') ? 'high' : 'mid') && e.repeat === Number(e.label.at(-1)), `Export slot mismatch: ${e.label}`);
  const run = prep.runs.find(r => r.label === e.label);
  assert(run && run.argv.includes('--fresh') && run.argv.includes('--startup-cold') && !run.argv.some(a => /^--seed(?:=|$)/.test(a)), `Export condition mismatch: ${e.label}`);
}
for (const graphics of ['mid', 'high']) {
  const [a, b] = prep.exports.filter(e => e.graphics === graphics);
  assert(a.sha256 === b.sha256 && a.bytes === b.bytes && equal(a.identity, b.identity), `Saved repeat equivalence differs: ${graphics}`);
}
for (const variant of ['reader', 'generated']) {
  assert(consumer[variant]?.gate?.ok === true && consumer[variant].gate.reasons?.length === 0 && hex(consumer[variant].sha256), `Consumer gate failed: ${variant}`);
}
const asar = await json(path.join(source, 'actual-asar.json'));
assert(asar.ok === true && asar.sourceHash === prep.source.base.sourceHash && asar.catalogVersion === 2, 'Actual ASAR verification is not PASS');
assert(hex(notrace.raw?.sha256) && Number.isSafeInteger(notrace.raw.bytes), 'Missing notrace raw pin');
const mainCheck = await json(path.join(source, 'main-check-result.json'));
const terminalRegression = await json(path.join(source, 'terminal-regression-result.json'));
assert(mainCheck.observedExitCode === 1 && mainCheck.failedCheck === 'probe-terminal', 'Expected preserved primary check failure');
assert(terminalRegression.observedExitCode === 0 && terminalRegression.stdout?.ok === true, 'Focused terminal regression is not PASS');
const runtime = [];
for (const name of ['runtime-high', 'runtime-mid', 'runtime-generated']) {
  const run = await json(path.join(source, name, 'run.json'));
  terminal(run, name);
  assert(run.ok === true && run.validation?.ok === true && run.validation.reasons?.length === 0 && hex(run.rawSha256), `Runtime admission failed: ${name}`);
  assert(run.variant === (name === 'runtime-generated' ? 'generated' : 'cache') && run.preset === (name === 'runtime-mid' ? 'mid' : 'high'), `Runtime slot differs: ${name}`);
  runtime.push({ name, run });
}
assert(new Set(runtime.map(({ run }) => run.session)).size === 3, 'Runtime session reuse');
assert(!(await fsp.lstat(dest).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e))), `Destination exists: ${dest}`);

const jobs = new Map();
const add = async (file, relative, { sha256, bytes, role = 'evidence', gzip = true } = {}) => {
  relative = cleanRelative(relative);
  const real = await fsp.realpath(file);
  const stat = await fsp.stat(real);
  assert(stat.isFile() && stat.size <= LIMITS.oneFile, `File limit: ${file}`);
  if (sha256 !== undefined) assert(hex(sha256), `Invalid expected SHA: ${file}`);
  if (bytes !== undefined) assert(Number.isSafeInteger(bytes) && bytes >= 0 && stat.size === bytes, `Expected size differs: ${file}`);
  const previous = jobs.get(relative);
  if (previous) {
    assert(previous.file === real && (!sha256 || !previous.expectedSha256 || sha256 === previous.expectedSha256), `Conflicting snapshot pins: ${relative}`);
    if (sha256) previous.expectedSha256 = sha256;
    if (bytes !== undefined) previous.expectedBytes = bytes;
    return;
  }
  jobs.set(relative, { file: real, relative, expectedSha256: sha256 || null, expectedBytes: bytes ?? null,
    role, gzip, stat: { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, ino: stat.ino } });
};
const addEvidence = (relative, pins = {}) => add(path.join(source, cleanRelative(relative)), `evidence/${relative}`, pins);
const pinFile = async (file, relative, pins) => {
  const real = await fsp.realpath(file);
  const rel = path.relative(source, real).split(path.sep).join('/');
  assert(rel && !rel.startsWith('../') && !path.isAbsolute(rel), `Evidence outside proof directory: ${file}`);
  await add(real, `evidence/${relative || rel}`, pins);
};
for (const name of ['preparation.json', 'consumer-protocol.json', 'notrace-protocol.json', 'actual-asar.json']) await addEvidence(name, { gzip: false });
for (const name of ['main-check-result.json', 'terminal-regression-result.json']) await addEvidence(name, { gzip: false });
for (const name of ['main-check.stdout.log', 'main-check.stderr.log', 'terminal-check.stdout.log', 'terminal-check.stderr.log']) await addEvidence(name);
for (const e of prep.exports) {
  await pinFile(e.report, `${e.label}/raw.json`, { sha256: e.reportSha256 });
  await pinFile(e.fixtureFile, `${e.label}/fixture.json`, { sha256: e.fixtureSha256, gzip: false });
  await pinFile(e.wireFile, `${e.label}/catalog.addr`, { sha256: e.sha256, bytes: e.bytes });
}
for (const variant of ['reader', 'generated']) await pinFile(consumer[variant].raw, `consumer-${variant}.json`, { sha256: consumer[variant].sha256 });
await pinFile(notrace.raw.file, 'notrace-raw.json', { sha256: notrace.raw.sha256, bytes: notrace.raw.bytes });
for (const { name, run } of runtime) {
  await addEvidence(`${name}/run.json`, { gzip: false });
  await addEvidence(`${name}/raw.json`, { sha256: run.rawSha256, bytes: run.reportBytes });
  await pinFile(run.fixtureFile, `${name}/fixture.json`, { sha256: run.fixtureSha256, gzip: false });
  await addEvidence(`${name}/stdout.log`, { sha256: run.stdoutSha256 });
  await addEvidence(`${name}/stderr.log`, { sha256: run.stderrSha256 });
  const initReal = await fsp.realpath(run.initFile);
  if (initReal.startsWith(`${source}${path.sep}`)) await pinFile(initReal, null, { sha256: run.initSha256 });
  else {
    const initRelative = cleanRelative(path.relative(repo, initReal).split(path.sep).join('/'));
    await add(initReal, `snapshots/${initRelative}`, { sha256: run.initSha256, role: 'measured-harness' });
  }
  await add(run.catalogFile, `evidence/${name}/packaged-catalog.json`, { sha256: run.catalogSha256, gzip: false });
}
for (const run of [...prep.runs, ...consumer.runs, ...notrace.runs]) {
  await addEvidence(`${run.label}.stdout.log`, { sha256: run.stdoutSha256 });
  await addEvidence(`${run.label}.stderr.log`, { sha256: run.stderrSha256 });
  for (const arg of run.argv) {
    const match = /^--(?:eval|init-script)=(.+)$/.exec(arg);
    if (!match) continue;
    const real = await fsp.realpath(match[1]);
    if (real.startsWith(`${source}${path.sep}`)) await pinFile(real, null, {});
  }
}
for (const graphics of ['mid', 'high']) for (const suffix of ['.json', '-init.js']) await addEvidence(`early-queries-${graphics}${suffix}`);
await addEvidence('consumer-eval.js');
await addEvidence('run-consumers.mjs');
await addEvidence('run-notrace.mjs');
await addEvidence('package/catalog.json', { gzip: false });
for (const slot of prep.package.catalog.slots) await addEvidence(`package/${cleanRelative(slot.entry.path)}`, { sha256: slot.entry.sha256, bytes: slot.entry.bytes });
for (const pin of notrace.harness) await pinFile(path.resolve(source, pin.file), null, { sha256: pin.sha256 });

const measuredSources = new Map(prep.source.source.files.map(p => [p.path, p]));
const sourcePaths = ['src/main.js', 'src/game/game.js', 'vite.config.js',
  ...(await fsp.readdir(path.join(repo, 'src/game'))).filter(n => /^address.*\.js$/.test(n)).map(n => `src/game/${n}`)];
for (const relative of sourcePaths) {
  const pin = measuredSources.get(relative);
  assert(pin && hex(pin.sha256), `Current source has no measured pin: ${relative}`);
  await add(path.join(repo, relative), `snapshots/${relative}`, { sha256: pin.sha256, bytes: pin.bytes, role: 'measured-source' });
}
const helperPins = new Map();
const registerHelper = (file, sha256, bytes) => {
  cleanRelative(file); assert(hex(sha256), `Invalid helper pin: ${file}`);
  const prev = helperPins.get(file);
  assert(!prev || prev.sha256 === sha256, `Different historical helper bodies require explicit originals: ${file}`);
  helperPins.set(file, { sha256, bytes: bytes ?? prev?.bytes });
};
for (const p of prep.harness) registerHelper(p.file, p.sha256, p.bytes);
for (const { run } of runtime) for (const p of run.harness) registerHelper(p.file, p.sha256, p.bytes);
for (const [file, sha256] of Object.entries(prep.source.source.buildConfig.preparationHelpers)) registerHelper(file, sha256);
for (const [relative, pin] of helperPins) await add(path.join(repo, relative), `snapshots/${relative}`, { ...pin, role: 'measured-harness' });
await add(path.join(repo, 'tools/probe-terminal-test.mjs'), 'snapshots/tools/probe-terminal-test.mjs', { role: 'post-measurement-offline-test-fix' });
await add(fileURLToPath(import.meta.url), 'archive-evidence.mjs', { role: 'archive-tool', gzip: false });
const sourceBytes = [...jobs.values()].filter(j => j.relative.startsWith('snapshots/')).reduce((n, j) => n + j.stat.size, 0);
const originalBytes = [...jobs.values()].reduce((n, j) => n + j.stat.size, 0);
assert(sourceBytes <= LIMITS.sourceArtifacts, 'Source/harness snapshot budget exceeded');
assert(originalBytes <= LIMITS.originalTotal, 'Original evidence budget exceeded');

const meter = () => {
  const hash = createHash('sha256'); let bytes = 0;
  return { stream: new Transform({ transform(chunk, _encoding, callback) { bytes += chunk.length; hash.update(chunk); callback(null, chunk); } }),
    finish: () => ({ bytes, sha256: hash.digest('hex') }) };
};
const sink = () => new Writable({ write(_chunk, _encoding, callback) { callback(); } });
const digestFile = async file => { const m = meter(); await pipeline(fs.createReadStream(file), m.stream, sink()); return m.finish(); };
const stage = `${dest}.partial-${process.pid}`;
await fsp.mkdir(path.dirname(dest), { recursive: true });
await fsp.mkdir(stage); // Existing partial evidence is never overwritten or deleted.
const manifest = { version: 1, kind: 'ordinary-address-byte-exact-evidence', createdAt: new Date().toISOString(),
  sourceDirectory: source, sourceReceipt: prep.source, preparationBuild: prep.build, consumerBuild: consumer.build,
  recordedAsar: consumer.archive, savedAdmission: { preparation: true, consumer: true, actualAsar: true, runtime: runtime.map(r => r.name), notrace: true },
  checkResults: { mainCheckObservedExitCode: mainCheck.observedExitCode, failedCheck: mainCheck.failedCheck,
    focusedTerminalObservedExitCode: terminalRegression.observedExitCode, fullCheckRerunClaimed: false },
  limits: LIMITS, sourceArtifactBytes: sourceBytes, originalBytes, archivedBytes: 0, files: [],
  scope: ['Saved admission decisions are checked; this archive operation is byte-integrity verification, not another gameplay run or timing comparison.',
    'ASAR, complete build trees, node_modules and large map/assets are excluded. Their original recorded inventories/hashes remain in the untouched journals.',
    'Only measured address core and harness bodies are snapshotted; complete source-file inventory remains in sourceReceipt. Root supplies git patch/base provenance and README separately.',
    'The original main check exited 1 at probe-terminal. Its untouched logs/result and the subsequent focused offline regression exit 0 are both retained; no full check rerun or replacement PASS is claimed.',
    'The post-measurement probe-terminal test fix has a separate role and no measured-source pin; it is not represented as part of the already measured build.'] };
try {
  for (const job of jobs.values()) {
    const stat = await fsp.stat(job.file);
    assert(['size', 'mtimeMs', 'ctimeMs', 'ino'].every(k => stat[k] === job.stat[k]), `Input changed before read: ${job.file}`);
    const archived = `${job.relative}${job.gzip ? '.gz' : ''}`;
    const output = path.join(stage, archived);
    await fsp.mkdir(path.dirname(output), { recursive: true });
    const original = meter();
    await pipeline(fs.createReadStream(job.file), original.stream,
      ...(job.gzip ? [createGzip({ level: 6 })] : []), fs.createWriteStream(output, { flags: 'wx' }));
    const actual = original.finish();
    assert(!job.expectedSha256 || actual.sha256 === job.expectedSha256, `Measured SHA differs: ${job.file}`);
    assert(job.expectedBytes === null || actual.bytes === job.expectedBytes, `Measured bytes differ: ${job.file}`);
    const after = await fsp.stat(job.file);
    assert(['size', 'mtimeMs', 'ctimeMs', 'ino'].every(k => after[k] === job.stat[k]), `Input changed while read: ${job.file}`);
    const restored = meter();
    await pipeline(fs.createReadStream(output), ...(job.gzip ? [createGunzip()] : []), restored.stream, sink());
    assert(equal(actual, restored.finish()), `Archived roundtrip differs: ${archived}`);
    const encoded = await digestFile(output);
    manifest.archivedBytes += encoded.bytes;
    assert(manifest.archivedBytes <= LIMITS.archivedTotal, 'Archived evidence budget exceeded');
    manifest.files.push({ original: job.file, role: job.role, originalBytes: actual.bytes, originalSha256: actual.sha256,
      expectedMeasuredSha256: job.expectedSha256, archived, encoding: job.gzip ? 'gzip' : 'identity', bytes: encoded.bytes, sha256: encoded.sha256,
      restoredBytes: actual.bytes, restoredSha256: actual.sha256 });
  }
  manifest.finishedAt = new Date().toISOString();
  await fsp.writeFile(path.join(stage, 'archive-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  assert(!(await fsp.lstat(dest).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e))), `Destination appeared: ${dest}`);
  await fsp.rename(stage, dest);
  console.log(JSON.stringify({ ok: true, dest, files: manifest.files.length, originalBytes, archivedBytes: manifest.archivedBytes, sourceArtifactBytes: sourceBytes }));
} catch (error) {
  await fsp.writeFile(path.join(stage, 'ARCHIVE-FAILURE.json'), `${JSON.stringify({ ok: false, reason: String(error?.stack || error), partialManifest: manifest }, null, 2)}\n`).catch(() => {});
  console.error(`Archive failed; preserved partial evidence at ${stage}`);
  throw error;
}
