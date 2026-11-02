/* №12. Local Steam/web progress migration with verified native publication.
   Call before profiles/quickrun/game readers. Existing canonical dlv-* consumers stay unchanged.
   Migration I/O intentionally bypasses localStore.set/get: they swallow native storage errors.
   Native raw readback is the only acknowledgement. Legacy bytes are preserved, including old raw strings. */
export const VERSION = 1;
export const META = 'dlv-profiles';
export const MARKER = 'dlv-single-marker-v1';
export const JOURNAL = 'dlv-single-journal-v1';
export const BACKUP = 'dlv-single-legacy-backup-v1';
export const RESET_BACKUP = 'dlv-single-reset-backup-v1';
const RESERVED = /^dlv-single-/;
const OTHER = /^dlv-p(\d+)-/;
// Exact legacy shared schema. Per-profile preferences not in this set migrate WITH the chosen profile.
export const SHARED = new Set([
  META, 'dlv-lang', 'dlv-sound', 'dlv-gfx', 'dlv-edition', 'dlv-map',
  'dlv-vol-music', 'dlv-vol-sfx', 'dlv-vol-eng', 'dlv-ach', 'dlv-lb-local',
  'dlv-money-x8', 'dlv-__ts', 'dlv-crashlog', 'dlv-trans',
  'dlv-tel', 'dlv-tel-id', 'dlv-tel-q', 'dlv-tel-t0', 'dlv-tel-once', 'dlv-tel-last', 'dlv-tel-ver', 'dlv-tel-crash-at',
]);
export const KNOWN = [
  'dlv-name', 'dlv-msk-wallet', 'dlv-msk-cars', 'dlv-msk-car', 'dlv-msk-best', 'dlv-msk-xp', 'dlv-msk-col', 'dlv-msk-tut',
  'dlv-msk-guide', 'dlv-msk-nostut', 'dlv-intro', 'dlv-garage-tut', 'dlv-shifts', 'dlv-stars', 'dlv-crew', 'dlv-story', 'dlv-season',
  'dlv-used-addr', 'dlv-boss', 'dlv-clock', 'dlv-rev-sale', 'dlv-car-owned', 'dlv-car-cur', 'dlv-car-up', 'dlv-car-L', 'dlv-car-eng',
  'dlv-car-paint', 'dlv-district', 'dlv-dist-shifts', 'dlv-dist-open', 'dlv-city-mode', 'dlv-city-party', 'dlv-knocked', 'dlv-heroes',
  'dlv-heroq', 'dlv-quick', 'dlv-don-trash', 'dlv-don-gang', 'dlv-respect', 'dlv-pz-grow', 'dlv-delivered', 'dlv-honor',
  'dlv-route-ask', 'dlv-shift-tut', 'dlv-wx-last', 'dlv-faces', 'dlv-cycle', 'dlv-nicks',
];
export const DEFAULT_KEEP = ['dlv-doorgames', 'dlv-route', 'dlv-radio', 'dlv-radio-st', 'dlv-cam'];
export class ProgressStorageError extends Error {
  constructor (code, key, cause) { super('single-progress:' + code + (key ? ':' + key : '')); this.name = 'ProgressStorageError'; this.code = code; this.key = key || ''; if (cause) this.cause = cause; }
}
const fail = (code, key, cause) => { throw new ProgressStorageError(code, key, cause); };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = o => !!o && typeof o === 'object' && !Array.isArray(o);
export const shared = k => typeof k !== 'string' || !k.startsWith('dlv-') || SHARED.has(k) || RESERVED.test(k);
const canonical = k => !shared(k) && !OTHER.test(k);
const physical = (k, id) => id === 1 ? k : 'dlv-p' + id + '-' + k.slice(4);
function logical (k) {
  const m = OTHER.exec(k);
  const name = m ? 'dlv-' + k.slice(m[0].length) : k;
  return canonical(name) ? name : null;
}
const rawDecode = raw => { if (raw === null) return undefined; try { return JSON.parse(raw); } catch { return raw; } };
function io (storage) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch (e) { fail('storage-unavailable', '', e); } }
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') fail('storage-unavailable');
  return {
    get (k) { try { const v = storage.getItem(k); if (v !== null && typeof v !== 'string') fail('invalid-read', k); return v; } catch (e) { if (e instanceof ProgressStorageError) throw e; fail('read-failed', k, e); } },
    write (k, raw) {
      try { raw === null ? storage.removeItem(k) : storage.setItem(k, raw); } catch (e) { fail('write-failed', k, e); }
      if (this.get(k) !== raw) fail('write-unacknowledged', k);
    },
    dump () {
      const out = Object.create(null);
      try {
        const n = storage.length;
        if (!Number.isSafeInteger(n) || n < 0) fail('enumeration-failed');
        const names = [];
        for (let i = 0; i < n; i++) { const k = storage.key(i); if (typeof k !== 'string') fail('enumeration-failed'); names.push(k); }
        for (const k of names.sort()) if (k.startsWith('dlv-') && !RESERVED.test(k)) {
          const raw = this.get(k); if (raw === null) fail('storage-changed', k); out[k] = raw;
        }
      } catch (e) { if (e instanceof ProgressStorageError) throw e; fail('enumeration-failed', '', e); }
      return out;
    },
  };
}
// Accidental corruption checksum, not a security signature. Raw readback remains the commit acknowledgement.
function digest (s) {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) { h ^= BigInt(s.charCodeAt(i)); h = BigInt.asUintN(64, h * 0x100000001b3n); }
  return h.toString(16).padStart(16, '0');
}
const pack = (kind, data) => JSON.stringify({ v: VERSION, kind, data, digest: digest(JSON.stringify(data)) });
function envelope (I, key, kind) {
  const raw = I.get(key); if (raw === null) return null;
  let v; try { v = JSON.parse(raw); } catch (e) { fail(kind + '-corrupt', key, e); }
  if (!object(v) || v.v !== VERSION || v.kind !== kind || !object(v.data) || v.digest !== digest(JSON.stringify(v.data))) fail(kind + '-corrupt', key);
  return { data: v.data, raw };
}
function validMap (map, key, careerOnly) {
  if (!object(map) || Object.entries(map).some(([k, v]) => (careerOnly ? !canonical(k) : !k.startsWith('dlv-') || RESERVED.test(k)) || (v !== null && typeof v !== 'string'))) fail('invalid-snapshot', key);
}
function validateMarker (d) {
  if (typeof d.saveId !== 'string' || !d.saveId || typeof d.tx !== 'string' || !d.tx || !Number.isInteger(d.sourceProfile) || d.sourceProfile < 1 || d.sourceProfile > 5 || !Number.isSafeInteger(d.resets) || d.resets < 0 || typeof d.legacyDigest !== 'string' || typeof d.lastResetRequest !== 'string') fail('marker-corrupt', MARKER);
  return d;
}
function marker (I) { const v = envelope(I, MARKER, 'marker'); return v ? validateMarker(v.data) : null; }
function selection (raw) {
  if (raw === undefined) return { id: 1, reason: 'metadata-missing' };
  const meta = rawDecode(raw);
  if (!object(meta) || !Array.isArray(meta.list)) return { id: 1, reason: 'metadata-invalid' };
  const ids = [];
  for (const row of meta.list) {
    if (!object(row) || !['number', 'string'].includes(typeof row.id)) continue;
    const id = Number(row.id);
    if (Number.isInteger(id) && id >= 1 && id <= 5 && !ids.includes(id)) ids.push(id);
  }
  if (!ids.length) return { id: 1, reason: 'metadata-list-empty' };
  const active = ['number', 'string'].includes(typeof meta.cur) ? Number(meta.cur) : NaN;
  return ids.includes(active) ? { id: active, reason: 'active-profile' } : { id: ids[0], reason: 'invalid-active-first-valid' };
}
function id () {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) fail('identity-unavailable');
  return [...globalThis.crypto.getRandomValues(new Uint32Array(4))].map(n => n.toString(16).padStart(8, '0')).join('');
}
function targetFor (entries, source, heroName) {
  const names = new Set(KNOWN);
  for (const k of Object.keys(entries)) { const name = logical(k); if (name) names.add(name); }
  const target = Object.create(null);
  for (const k of [...names].filter(canonical).sort()) { const p = physical(k, source); target[k] = own(entries, p) ? entries[p] : null; }
  target['dlv-name'] = JSON.stringify(heroName);
  return target;
}
function progressProjection (entries) {
  // Boot/crash reporting may update true shared keys after an interrupted prepare.
  // They are never overwritten; only an actual legacy-career change invalidates the orphan snapshot.
  return Object.fromEntries(Object.entries(entries).filter(([k]) => k === META || logical(k)).sort(([a], [b]) => a.localeCompare(b)));
}
function checkedBackup (I, key, tx, entries) {
  validMap(entries, key, false);
  const raw = pack('backup', { tx, entries });
  I.write(key, raw); return digest(raw);
}
function assertBackup (I, key, expected) {
  const b = envelope(I, key, 'backup');
  if (!b || digest(b.raw) !== expected) fail('backup-mismatch', key);
  validMap(b.data.entries, key, false);
  return b;
}
function pending (I) {
  const v = envelope(I, JOURNAL, 'journal'); if (!v) return null;
  const j = v.data;
  if (!['migrate', 'reset'].includes(j.op) || typeof j.tx !== 'string' || !j.tx || typeof j.parent !== 'string' || !object(j.nextMarker) || j.nextMarker.tx !== j.tx || ![BACKUP, RESET_BACKUP].includes(j.backupKey) || typeof j.backupDigest !== 'string') fail('journal-corrupt', JOURNAL);
  validateMarker(j.nextMarker);
  validMap(j.target, JOURNAL, true);
  return j;
}
function publish (I, j) {
  assertBackup(I, j.backupKey, j.backupDigest);
  // Replay is idempotent: no game reader runs until every write and the final marker acknowledge.
  for (const k of Object.keys(j.target).sort()) if (I.get(k) !== j.target[k]) I.write(k, j.target[k]);
  // Verify the complete canonical namespace, not only fields that happened to need a write.
  const found = I.dump();
  for (const k of Object.keys(found)) if (canonical(k) && !own(j.target, k)) fail('storage-changed', k);
  for (const [k, raw] of Object.entries(j.target)) if (I.get(k) !== raw) fail('publish-unverified', k);
  I.write(MARKER, pack('marker', j.nextMarker));
  marker(I);                                     // validate the marker before returning to the bootstrap
  return { version: VERSION, ...j.nextMarker, recovered: false };
}
function resume (I, m, j) {
  if (!j) { if (m) return { version: VERSION, ...m, recovered: false }; return null; }
  if (m?.tx === j.tx) return { version: VERSION, ...m, recovered: false }; // completed journal is a reserve, never replay after reset/game writes
  if (j.parent !== (m?.tx || '')) fail('journal-parent-mismatch', JOURNAL);
  if (j.op === 'reset' && !m) fail('reset-without-marker', JOURNAL);
  const result = publish(I, j); result.recovered = true; return result;
}
/** Synchronous, local Steam/web only; call after Platform.init and BEFORE any game progress reader. */
export function migrateSingleProgress ({ store, storage, heroName = 'Женя', makeId = id, now = Date.now } = {}) {
  // store deliberately is not an acknowledgement channel: localStore swallows quota/read failures.
  void store;
  if (typeof heroName !== 'string' || !heroName.trim()) fail('invalid-options');
  const I = io(storage), m = marker(I), j = pending(I), recovered = resume(I, m, j);
  if (recovered) return recovered;
  const entries = I.dump(), selected = selection(entries[META]), tx = makeId(), save = makeId();
  if (typeof tx !== 'string' || !tx || typeof save !== 'string' || !save || tx === save || typeof heroName !== 'string' || !heroName) fail('invalid-options');
  const target = targetFor(entries, selected.id, heroName);
  const existing = envelope(I, BACKUP, 'backup');
  let backupDigest;
  if (existing) {
    validMap(existing.data.entries, BACKUP, false);
    // No journal could have published yet. An orphan backup must still match the untouched legacy data.
    if (JSON.stringify(progressProjection(existing.data.entries)) !== JSON.stringify(progressProjection(entries))) fail('orphan-backup-mismatch', BACKUP);
    backupDigest = digest(existing.raw);
  } else backupDigest = checkedBackup(I, BACKUP, tx, entries);
  const nextMarker = { tx, saveId: save, sourceProfile: selected.id, reason: selected.reason, resets: 0, at: now(), legacyDigest: backupDigest, lastResetRequest: '' };
  const journal = { op: 'migrate', tx, parent: '', backupKey: BACKUP, backupDigest, target, nextMarker };
  I.write(JOURNAL, pack('journal', journal));
  return publish(I, journal);
}
/** Called only AFTER the settings UI confirmed the reset. Keeps settings/achievements/reserves and identity. */
export function resetSingleProgress ({ store, storage, keep = DEFAULT_KEEP, heroName = 'Женя', requestId, makeId = id, now = Date.now } = {}) {
  if (typeof requestId !== 'string' || !requestId.trim()) fail('reset-request-required');
  const resumed = migrateSingleProgress({ store, storage, heroName, makeId, now });
  const I = io(storage), m = marker(I);
  if (m.lastResetRequest === requestId) return { version: VERSION, ...m, recovered: resumed.recovered, replayed: true };
  const entries = I.dump(), tx = makeId();
  if (typeof heroName !== 'string' || !heroName.trim() || typeof tx !== 'string' || !tx || tx === m.tx) fail('invalid-options');
  const target = targetFor(entries, 1, heroName), preserve = new Set(keep);
  for (const k of Object.keys(target)) target[k] = preserve.has(k) && own(entries, k) ? entries[k] : null;
  target['dlv-name'] = JSON.stringify(heroName);
  const backupDigest = checkedBackup(I, RESET_BACKUP, tx, entries);
  const nextMarker = { ...m, tx, resets: m.resets + 1, at: now(), lastResetRequest: requestId };
  const journal = { op: 'reset', tx, parent: m.tx, backupKey: RESET_BACKUP, backupDigest, target, nextMarker };
  I.write(JOURNAL, pack('journal', journal));
  return publish(I, journal);
}
export function keys (storage) {
  const out = new Set(KNOWN);
  for (const k of Object.keys(io(storage).dump())) if (canonical(k)) out.add(k);
  return [...out].filter(canonical).sort();
}
/* Read-only UI lookup: uncertain identity belongs to nobody; never generate or persist an ID here. */
export function saveId (storage) { try { return marker(io(storage))?.saveId || ''; } catch { return ''; } }
