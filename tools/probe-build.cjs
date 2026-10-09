/* Сборка игры для probe и check — в свою временную папку, а не в dist/:
   os.tmpdir()/bird-probe/<mode>.<время>, указатель на свежую — <mode>.json.
   Пересобирает, только если что-то в src/, public/, index.html, sandbox.html, pad.html, ui.html, editor.html
   или vite.config.js новее прошлой сборки. Старые папки чистит через 10 минут
   (вдруг их ещё читает чужой probe). Несколько probe сразу: сборка под замком. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE = path.join(os.tmpdir(), 'bird-probe');
const WATCH = ['src', 'public', 'index.html', 'sandbox.html', 'pad.html', 'ui.html', 'editor.html', 'vite.config.js'];
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function newest (p) {
  let st;
  try { st = fs.statSync(p); } catch (e) { return 0; }
  if (!st.isDirectory()) return st.mtimeMs;
  let m = st.mtimeMs;
  for (const f of fs.readdirSync(p)) if (f[0] !== '.') m = Math.max(m, newest(path.join(p, f)));
  return m;
}
const srcTime = () => Math.max(...WATCH.map(f => newest(path.join(ROOT, f))));
const ptr = mode => path.join(BASE, mode + '.json');
function current (mode) {
  try { const j = JSON.parse(fs.readFileSync(ptr(mode), 'utf8')); return fs.existsSync(path.join(j.dir, 'index.html')) ? j : null; } catch (e) { return null; }
}

/* → { dir, built: true|false, ms, error } */
function ensureBuild (mode, { force = false, skip = false, quiet = false } = {}) {
  fs.mkdirSync(BASE, { recursive: true });
  const cur = current(mode);
  if (skip) return cur ? { dir: cur.dir, built: false, ms: 0 } : { error: 'нет сборки ' + mode + ' — запусти без --no-build' };
  if (!force && cur && cur.stamp >= srcTime()) return { dir: cur.dir, built: false, ms: 0 };
  // замок: пока строит другой probe — ждём (до 2 минут), потом проверяем ещё раз
  const lock = path.join(BASE, mode + '.lock');
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      let age = 0; try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch (_) { continue; }
      if (age > 120000) { fs.rmSync(lock, { recursive: true, force: true }); continue; }
      sleepSync(300);
    }
  }
  try {
    const again = current(mode);
    if (!force && again && again.stamp >= srcTime()) return { dir: again.dir, built: false, ms: 0 };
    const stamp = Date.now(), dir = path.join(BASE, mode + '.' + stamp);
    const t0 = Date.now();
    // node из npm, иначе сам Электрон в роли node
    const node = process.env.npm_node_execpath || process.execPath;
    const env = { ...process.env, BIRD_EDITOR: '1' };   // + editor.html (редактор города, docs/SANDBOX.md) — только в сборке для probe
    if (process.versions.electron && !process.env.npm_node_execpath) env.ELECTRON_RUN_AS_NODE = '1';
    const r = spawnSync(node, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--mode', mode, '--outDir', dir, '--emptyOutDir', '--logLevel', 'warn'],
      { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 << 20 });
    const out = ((r.stdout || '') + (r.stderr || '')).split('\n').filter(l => l.trim() && !/chunks are larger|dynamic import\(\)|manualChunks|chunkSizeWarningLimit|^\(!\)/.test(l)).join('\n');
    if (r.status !== 0 || !fs.existsSync(path.join(dir, 'index.html'))) return { error: out || ('vite build: код ' + r.status), ms: Date.now() - t0 };
    if (!quiet && process.env.PROBE_VERBOSE && out) process.stderr.write(out + '\n');   // предупреждения vite — только по PROBE_VERBOSE=1
    fs.writeFileSync(ptr(mode), JSON.stringify({ dir, stamp }));
    // старые сборки этого режима — старше 10 минут
    for (const f of fs.readdirSync(BASE)) {
      const p = path.join(BASE, f);
      if (f.startsWith(mode + '.') && /^\w+\.\d+$/.test(f) && p !== dir) { try { if (Date.now() - fs.statSync(p).mtimeMs > 600000) fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* — */ } }
    }
    return { dir, built: true, ms: Date.now() - t0 };
  } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

module.exports = { ensureBuild, BASE, ROOT };

// node tools/probe-build.cjs <mode> [--rebuild] → одна строка JSON (для tools/check.cjs)
if (require.main === module) {
  const mode = process.argv[2] || 'web';
  const r = ensureBuild(mode, { force: process.argv.includes('--rebuild'), quiet: true });
  process.stdout.write(JSON.stringify(r) + '\n');
  process.exit(r.error ? 1 : 0);
}
