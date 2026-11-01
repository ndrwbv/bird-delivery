/* Fault injection against the real migration module; no browser/build/game or filesystem persistence. */
import assert from 'node:assert/strict';
import { migrateSingleProgress as migrate, resetSingleProgress as reset, keys, saveId, META, MARKER, JOURNAL, BACKUP, RESET_BACKUP, SHARED, ProgressStorageError } from '../src/game/singleprogress.js';
class Disk {
  constructor (entries = {}) { this.map = new Map(Object.entries(entries)); this.writes = 0; this.reads = 0; this.mode = ''; this.at = 0; this.enumerationFails = false; }
  get length () { if (this.enumerationFails) throw Error('enumeration forbidden'); return this.map.size; }
  key (i) { return [...this.map.keys()][i] ?? null; }
  getItem (key) { this.reads++; if (this.mode === 'read' && this.reads === this.at) throw Error('read denied'); return this.map.get(key) ?? null; }
  operation (key, raw) {
    this.writes++;
    const hit = this.writes === this.at;
    if (hit && this.mode === 'ignore') return; // a swallowed quota error is NOT a successful write
    if (hit && this.mode === 'throw') throw Error('quota exceeded');
    raw === null ? this.map.delete(key) : this.map.set(key, raw);
    if (hit && this.mode === 'crash') throw Error('process stopped AFTER native atomic write');
  }
  setItem (key, raw) { this.operation(key, raw); }
  removeItem (key) { this.operation(key, null); }
  dump () { return Object.fromEntries(this.map); }
  failuresOff () { this.mode = ''; this.at = 0; this.enumerationFails = false; }
}
let identity = 0, count = 0;
const opts = storage => ({ storage, makeId: () => 'id-' + (++identity), now: () => 123456, heroName: 'Женя', requestId: 'confirmed-reset' });
const clone = o => JSON.parse(JSON.stringify(o));
const env = (d, k) => JSON.parse(d.getItem(k)).data;
const phys = (k, id) => id === 1 ? k : 'dlv-p' + id + '-' + k.slice(4);
function fixture (active = 3) {
  const out = { [META]: JSON.stringify({ v: 1, cur: active, list: [1, 2, 3, 4, 5].map(id => ({ id, name: 'old-' + id })) }),
    'dlv-lang': '"en"', 'dlv-gfx': '{"preset":"high"}', 'dlv-ach': '{"orders":345}', 'dlv-lb-local': '[{"name":"Женя","score":999}]',
    'dlv-tel-id': '"account-device"', 'dlv-trans': '{"active":"old-boot"}', 'dlv-__ts': '100', 'other-app': 'leave me', 'dlv-root-only-future': '100000',
  };
  for (let id = 1; id <= 5; id++) for (const [k, value] of Object.entries({
    'dlv-msk-wallet': id * 1234, 'dlv-car-owned': ['car-' + id], 'dlv-district': id,
    'dlv-story': { hero: 'story-' + id }, 'dlv-unknown-feature': { id, data: [id, id + 1] }, 'dlv-name': 'old-' + id,
    'dlv-route': id % 2 === 0, 'dlv-delivered': id * 7,
  })) out[phys(k, id)] = JSON.stringify(value);
  out[phys('dlv-legacy-raw-string', active)] = 'ancient unquoted string';
  return out;
}
function expectCareer (d, original, selected, name = 'Женя') {
  const names = new Set(['dlv-root-only-future', 'dlv-msk-wallet', 'dlv-car-owned', 'dlv-district', 'dlv-story', 'dlv-unknown-feature', 'dlv-route', 'dlv-delivered', 'dlv-legacy-raw-string']);
  for (const k of names) assert.equal(d.getItem(k), original[phys(k, selected)] ?? null, 'career key ' + k);
  assert.equal(d.getItem('dlv-name'), JSON.stringify(name));
  for (const k of SHARED) if (Object.hasOwn(original, k)) assert.equal(d.getItem(k), original[k], 'shared ' + k);
  for (const [k, raw] of Object.entries(original)) if (/^dlv-p\d+-/.test(k)) assert.equal(d.getItem(k), raw, 'inactive reserve ' + k);
  assert.equal(d.getItem('other-app'), original['other-app']);
}
for (let active = 1; active <= 5; active++) {
  const original = fixture(active), d = new Disk(original), r = migrate(opts(d));
  expectCareer(d, original, active); assert.equal(r.sourceProfile, active); assert.equal(r.reason, 'active-profile');
  assert.deepEqual(env(d, BACKUP).entries, Object.fromEntries(Object.entries(original).filter(([k]) => k.startsWith('dlv-')).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
  const backups = d.getItem(BACKUP), writes = d.writes, owner = saveId(d);
  d.map.set('dlv-msk-wallet', '987654');
  assert.equal(migrate(opts(d)).saveId, owner); assert.equal(d.getItem('dlv-msk-wallet'), '987654'); assert.equal(d.writes, writes);
  assert.equal(d.getItem(BACKUP), backups); assert(keys(d).includes('dlv-unknown-feature')); assert(!keys(d).some(k => /^dlv-p\d+-|^dlv-single-/.test(k)));
  count++;
}
for (const [metadata, id, reason] of [
  [null, 1, 'metadata-missing'], ['broken-json', 1, 'metadata-invalid'], ['{}', 1, 'metadata-invalid'],
  [JSON.stringify({ cur: 5, list: [{ id: 3 }, { id: 2 }, { id: 3 }, { id: 99 }, null] }), 3, 'invalid-active-first-valid'],
  [JSON.stringify({ cur: '4', list: [{ id: 1 }, { id: '4' }] }), 4, 'active-profile'],
  [JSON.stringify({ cur: 5, list: [{ id: true }, { id: 'x' }] }), 1, 'metadata-list-empty'],
]) {
  const original = fixture(); if (metadata === null) delete original[META]; else original[META] = metadata;
  const d = new Disk(original), r = migrate(opts(d)); expectCareer(d, original, id); assert.equal(r.reason, reason); count++;
}
const baseline = new Disk(fixture(3)); migrate(opts(baseline)); const migrationWrites = baseline.writes;
for (const mode of ['ignore', 'throw', 'crash']) for (let at = 1; at <= migrationWrites; at++) {
  const original = fixture(3), d = new Disk(original); d.mode = mode; d.at = at;
  assert.throws(() => migrate(opts(d)), ProgressStorageError, `${mode}/${at} must not report unverified success`);
  const originalBackup = d.getItem(BACKUP);
  d.failuresOff(); migrate(opts(d)); expectCareer(d, original, 3);
  if (originalBackup) assert.equal(d.getItem(BACKUP), originalBackup, 'immutable initial reserve');
  count++;
}
// A shared boot/crash value changing after an orphan backup must not make retry impossible.
{
  const original = fixture(3), d = new Disk(original); d.mode = 'throw'; d.at = 2;
  assert.throws(() => migrate(opts(d))); d.failuresOff(); d.map.delete('dlv-trans'); d.map.set('dlv-crashlog', '["new boot"]'); d.map.set('dlv-__ts', '200');
  migrate(opts(d)); assert.equal(d.getItem('dlv-trans'), null); assert.equal(d.getItem('dlv-crashlog'), '["new boot"]'); assert.equal(d.getItem('dlv-__ts'), '200'); count++;
}
// Native enumeration cannot be silently replaced by KNOWN: that would lose future unknown systems.
{
  const d = new Disk(fixture()); d.enumerationFails = true; assert.throws(() => migrate(opts(d)), ProgressStorageError); assert.equal(d.writes, 0); count++;
}
// A lying optimistic wrapper never acknowledges a native storage write.
{
  const d = new Disk(fixture()), fakeStore = { get: () => 'optimistic', set: () => undefined };
  d.mode = 'ignore'; d.at = 1; assert.throws(() => migrate({ ...opts(d), store: fakeStore }), /write-unacknowledged/); assert.equal(d.getItem(MARKER), null); count++;
}
// Corrupt pending snapshots/backup fail closed; never reselect an already partly overwritten legacy profile 1.
for (const key of [JOURNAL, BACKUP]) {
  const d = new Disk(fixture()); d.mode = 'throw'; d.at = 4; assert.throws(() => migrate(opts(d))); d.failuresOff();
  d.map.set(key, '{invalid'); const before = d.dump(); assert.throws(() => migrate(opts(d)), ProgressStorageError); assert.deepEqual(d.dump(), before); count++;
}
// Read failures at EVERY native read until the first successful migration; restart always recovers.
for (let at = 1; at <= baseline.reads; at++) {
  const original = fixture(), d = new Disk(original); d.mode = 'read'; d.at = at;
  assert.throws(() => migrate(opts(d)), ProgressStorageError); d.failuresOff(); migrate(opts(d)); expectCareer(d, original, 3); count++;
}
function prepared () { const original = fixture(4), d = new Disk(original); migrate(opts(d)); return { original, d, owner: saveId(d), backup: d.getItem(BACKUP) }; }
function expectReset (d, owner, backup, original) {
  assert.equal(env(d, RESET_BACKUP).entries['dlv-msk-wallet'], original['dlv-p4-msk-wallet']);
  assert.equal(saveId(d), owner); assert.equal(d.getItem(BACKUP), backup); assert.equal(d.getItem('dlv-name'), '"Zhenya"');
  for (const k of ['dlv-msk-wallet', 'dlv-car-owned', 'dlv-district', 'dlv-story', 'dlv-unknown-feature', 'dlv-root-only-future', 'dlv-delivered']) assert.equal(d.getItem(k), null, 'reset ' + k);
  assert.equal(d.getItem('dlv-route'), original['dlv-p4-route']); assert.equal(d.getItem('dlv-ach'), original['dlv-ach']); assert.equal(d.getItem('dlv-lang'), original['dlv-lang']);
  assert.equal(d.getItem('dlv-p4-msk-wallet'), original['dlv-p4-msk-wallet']);
}
const rr = prepared(), beforeResetWrites = rr.d.writes, beforeResetReads = rr.d.reads;
reset({ ...opts(rr.d), heroName: 'Zhenya' }); const resetWrites = rr.d.writes - beforeResetWrites, resetReads = rr.d.reads - beforeResetReads;
expectReset(rr.d, rr.owner, rr.backup, rr.original);
const committed = rr.d.getItem(MARKER); rr.d.map.set('dlv-p4-msk-wallet', '999999999'); migrate(opts(rr.d));
assert.equal(rr.d.getItem(MARKER), committed); assert.equal(rr.d.getItem('dlv-msk-wallet'), null); count++;
for (const mode of ['ignore', 'throw', 'crash']) for (let step = 1; step <= resetWrites; step++) {
  const r = prepared(), { d } = r; d.mode = mode; d.at = d.writes + step;
  assert.throws(() => reset({ ...opts(d), heroName: 'Zhenya' }), ProgressStorageError); d.failuresOff();
  reset({ ...opts(d), heroName: 'Zhenya' }); // SAME public request after failure; it must resume, not reset twice
  expectReset(d, r.owner, r.backup, r.original); assert.equal(env(d, MARKER).resets, 1);
  const reserve = d.getItem(RESET_BACKUP), writes = d.writes;
  assert.equal(reset({ ...opts(d), heroName: 'Zhenya' }).replayed, true);
  assert.equal(d.writes, writes); assert.equal(d.getItem(RESET_BACKUP), reserve); count++;
}
// EVERY reset read slot, including failed verification after journal/partial deletion/marker publication.
for (let step = 1; step <= resetReads; step++) {
  const r = prepared(), { d } = r; d.mode = 'read'; d.at = d.reads + step;
  assert.throws(() => reset({ ...opts(d), heroName: 'Zhenya' }), ProgressStorageError); d.failuresOff();
  reset({ ...opts(d), heroName: 'Zhenya' }); // SAME public request after failure; it must resume, not reset twice
  expectReset(d, r.owner, r.backup, r.original); assert.equal(env(d, MARKER).resets, 1);
  const reserve = d.getItem(RESET_BACKUP), writes = d.writes;
  assert.equal(reset({ ...opts(d), heroName: 'Zhenya' }).replayed, true);
  assert.equal(d.writes, writes); assert.equal(d.getItem(RESET_BACKUP), reserve); count++;
}
// Explicit reset keep list is schema-filtered: backup/profile/shared keys are NEVER erased by broad caller lists.
{
  const r = prepared(), d = r.d; d.map.set('dlv-single-future-reserve', 'opaque');
  reset({ ...opts(d), keep: ['dlv-route', BACKUP, META] });
  assert.equal(d.getItem('dlv-single-future-reserve'), 'opaque'); assert.equal(d.getItem(BACKUP), r.backup); assert.equal(d.getItem(META), r.original[META]); count++;
}
{
  const r = prepared(); reset({ ...opts(r.d), heroName: 'Zhenya' });
  r.d.map.set('dlv-msk-wallet', '123');
  reset({ ...opts(r.d), heroName: 'Zhenya', requestId: 'new-confirmation' });
  assert.equal(env(r.d, MARKER).resets, 2); assert.equal(env(r.d, RESET_BACKUP).entries['dlv-msk-wallet'], '123'); count++;
}
// Whole-localStorage transfer models the current Steam Cloud payload (not the remote SDK/filesystem).
for (const wasReset of [false, true]) {
  const r = prepared(); if (wasReset) reset({ ...opts(r.d), heroName: 'Zhenya' }); else r.d.map.set('dlv-msk-wallet', '75321');
  const restored = new Disk(clone(r.d.dump())), snapshot = restored.dump(), result = migrate(opts(restored));
  assert.equal(result.saveId, r.owner); assert.deepEqual(restored.dump(), snapshot); assert.equal(result.resets, wasReset ? 1 : 0); count++;
}
// An absent chosen field is absence, never an invitation to inherit profile 1's larger wallet.
{
  const original = fixture(2); delete original['dlv-p2-msk-wallet']; delete original['dlv-p2-story'];
  const d = new Disk(original); migrate(opts(d)); expectCareer(d, original, 2); count++;
}
// Read-only identity never writes, invents an ID, or blocks an otherwise harmless leaderboard view.
for (const kind of ['absent', 'corrupt', 'unavailable']) {
  const d = new Disk(); if (kind === 'corrupt') d.map.set(MARKER, '{broken');
  if (kind === 'unavailable') { d.mode = 'read'; d.at = 1; }
  assert.equal(saveId(d), ''); assert.equal(d.writes, 0); count++;
}
// A committed marker is NOT permission to accept an invalid reset actor/options.
{
  const r = prepared(), before = r.d.dump(); assert.throws(() => reset({ ...opts(r.d), heroName: null }), ProgressStorageError); assert.deepEqual(r.d.dump(), before); count++;
}
{
  const r = prepared(), before = r.d.dump(), config = opts(r.d); delete config.requestId;
  assert.throws(() => reset(config), /reset-request-required/); assert.deepEqual(r.d.dump(), before); count++;
}
console.log(JSON.stringify({ ok: true, cases: count, migrationWrites, resetWrites, nativeReads: baseline.reads, resetReads, activeProfiles: [1, 2, 3, 4, 5], modes: ['silent write rejection', 'quota exception', 'interruption after write', 'read failure', 'metadata corruption', 'reset restart'] }));
