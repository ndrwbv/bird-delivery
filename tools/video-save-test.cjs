/* Ролик повтора в Стим-сборке без Электрона (npm run check → «ролик повтора: сохранение»; docs/CAREER.md «Повтор»).

   1. electron/main.cjs с заглушкой модуля electron: обработчик video:save пишет байты в
      «<папка видео>/<папка игры>/<имя>», отвечает полным путём; имя с ../ — только имя файла.
   2. src/game/webmdur.js: в webm без длительности (как у MediaRecorder) дописывается Duration.

   node tools/video-save-test.cjs → JSON { ok, … }, код выхода 1 при провале */
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bird-video-'));
const H = {};
const noop = () => {};
/* заглушка: всё, чего нет, — ничего не делающая функция / объект */
const stub = (base = {}) => new Proxy(base, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' ? stub(Object.assign(noop.bind(null), {})) : undefined)) });
const fake = {
  app: stub({
    getPath: k => path.join(TMP, k), setPath: noop, setName: noop, getVersion: () => '0.0.0',
    requestSingleInstanceLock: () => false, quit: noop, on: noop, whenReady: () => new Promise(noop),
    commandLine: stub({ appendSwitch: noop }),
  }),
  ipcMain: stub({ handle: (ch, fn) => { H[ch] = fn; }, on: (ch, fn) => { H[ch] = fn; } }),
  protocol: stub({ registerSchemesAsPrivileged: noop }),
  shell: stub({ showItemInFolder: f => { H.__shown = f; } }),
  BrowserWindow: stub({ getAllWindows: () => [] }), Menu: stub({}), globalShortcut: stub({}), dialog: stub({}), net: stub({}),
};
const load = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'electron') return fake;
  if (req === 'steamworks.js') throw new Error('нет в проверке');
  return load.call(this, req, ...rest);
};

(async () => {
  const out = { ok: false, fail: [] };
  const fail = s => out.fail.push(s);
  try {
    require(path.join(__dirname, '..', 'electron', 'main.cjs'));
    if (!H['video:save']) throw new Error('нет обработчика video:save');
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const file = await H['video:save']({}, data, 'Птица Пицца', 'bird-pizza_2026-10-09_12-00-00.webm');
    const want = path.join(TMP, 'videos', 'Птица Пицца', 'bird-pizza_2026-10-09_12-00-00.webm');
    out.file = file;
    if (file !== want) fail('путь ' + file + ' ≠ ' + want);
    else if (!fs.existsSync(file) || fs.readFileSync(file).length !== 5) fail('файл не записан');
    const evil = await H['video:save']({}, data, '../Птица:Пицца', '../../evil name.webm');
    out.evil = evil;
    if (!evil || path.dirname(path.dirname(evil)) !== path.join(TMP, 'videos') || path.basename(evil) !== 'evil_name.webm') fail('имя с ../ ушло из папки: ' + evil);
    const up = await H['video:save']({}, data, '..', 'a.webm');
    if (up !== path.join(TMP, 'videos', 'Птица Пицца', 'a.webm')) fail('папка «..» ушла выше папки видео: ' + up);
    if (H['video:show']) { H['video:show']({}, file); if (H.__shown !== file) fail('video:show не показал файл'); }

    // длительность webm: EBML → Segment (размер неизвестен) → Info (TimecodeScale) → Cluster
    const { patch } = await import(path.join(__dirname, '..', 'src', 'game', 'webmdur.js'));
    const info = [0x2A, 0xD7, 0xB1, 0x83, 0x0F, 0x42, 0x40];          // TimecodeScale = 1 000 000
    const u = new Uint8Array([
      0x1A, 0x45, 0xDF, 0xA3, 0x84, 0x42, 0x86, 0x81, 0x01,           // EBML { EBMLVersion 1 }
      0x18, 0x53, 0x80, 0x67, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,   // Segment, размер неизвестен
      0x15, 0x49, 0xA9, 0x66, 0x80 | info.length, ...info,            // Info
      0x1F, 0x43, 0xB6, 0x75, 0x81, 0xE7,                             // Cluster…
    ]);
    const r = patch(u, 9308);
    if (!r) fail('webm: длительность не дописана');
    else {
      const h = r.head, i = h.findIndex((b, k) => b === 0x44 && h[k + 1] === 0x89);
      const dur = i < 0 ? NaN : new DataView(h.buffer, h.byteOffset).getFloat64(i + 3);
      out.dur = dur;
      if (dur !== 9308) fail('webm: длительность ' + dur);
      if (h[25] !== (0x80 | (info.length + 11))) fail('webm: размер Info не пересчитан');
      if (r.cut !== 21 + 5 + info.length) fail('webm: заменено не то');
    }
  } catch (e) { fail(String((e && e.stack) || e)); }
  out.ok = !out.fail.length;
  fs.rmSync(TMP, { recursive: true, force: true });
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(out.ok ? 0 : 1);
})();
