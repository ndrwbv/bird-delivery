/* npm run check — общие проверки перед сдачей, ~3 минуты (3 проверки в игре разом). Таблица в конце, код выхода 1 при провале.
   npm run check -- --rebuild   собрать заново, даже если сборки свежие
   npm run check -- --only=orders,smoke   только эти проверки (по началу id)
   npm run check -- --serial    проверки в игре — по одной (по умолчанию — по JOBS разом)
   npm run check -- --jobs=N    сколько проверок в игре разом (по умолчанию: ядер / 3, от 1 до 3)

   Новая проверка — элемент CHECKS: { id, name, group, run: async () => ({ status, info }) },
   status — 'ok' | 'warn' | 'fail'. Группы — по очереди; проверки группы 1 (сборки, тексты) — разом, в игре (группа 2 и
   дальше) — не больше JOBS разом (23.10.2026: по ~10 Электронов сразу на загруженной машине «время вышло» у ghosts,
   ped-solid, osk-repeat — по одной они зелёные). Время и тайм-аут проверки — от её собственного старта, не от группы;
   долгие (поле w, с) — первыми.
   Скрипт в игре — через probe(args) (tools/probe.cjs, отчёт JSON). */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const has = k => argv.includes('--' + k);
const arg = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const ELECTRON = require('electron');            // из node — путь к бинарнику
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bird-check-'));

function sh (cmd, args, opts = {}) {
  return new Promise(res => {
    const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...(opts.env || {}) } });
    let out = '', errs = '';
    p.stdout.on('data', b => { out += b; }); p.stderr.on('data', b => { errs += b; });
    const kill = setTimeout(() => p.kill('SIGKILL'), (opts.timeout || 180) * 1000);
    p.on('close', code => { clearTimeout(kill); res({ code, out, err: errs }); });
  });
}
let nProbe = 0;
async function probe (args, timeout = 150) {
  const rep = path.join(TMP, 'r' + (nProbe++) + '.json');
  const r = await sh(ELECTRON, [path.join(__dirname, 'probe.cjs'), '--no-build', '--report=' + rep, '--timeout=' + (timeout - 10), ...args], { timeout });
  let j = null;
  try { j = JSON.parse(fs.readFileSync(rep, 'utf8')); } catch (e) { /* — */ }
  return j || { ok: false, errors: [], evalErr: 'probe без отчёта (код ' + r.code + '): ' + (r.err || r.out).trim().split('\n').slice(-3).join(' | ') };
}
const errLine = j => [j.evalErr && 'исключение: ' + j.evalErr, j.uncaught ? j.uncaught + ' необработанных: ' + (j.errors.find(e => /^Uncaught/.test(e)) || '').slice(0, 160) : '', j.loaded === false && 'игра не загрузилась', j.timeout && 'время вышло'].filter(Boolean).join('; ');

const build = mode => async () => {
  const r = await sh(process.execPath, [path.join(__dirname, 'probe-build.cjs'), mode, ...(has('rebuild') ? ['--rebuild'] : [])], { timeout: 240 });
  let j = {}; try { j = JSON.parse(r.out.trim().split('\n').pop()); } catch (e) { j = { error: (r.err || r.out).trim() }; }
  if (j.error) return { status: 'fail', info: j.error.split('\n').filter(l => /error|Error|✗|failed/i.test(l)).slice(0, 3).join(' | ') || j.error.slice(0, 300) };
  return { status: 'ok', info: j.built ? 'собрана за ' + (j.ms / 1000).toFixed(1) + ' с' : 'свежая' };
};
/* журнал ошибок дымовых прогонов (src/platform/crashlog.js): предохранитель в цикле кадра глотает
   исключения, в консоль они уже не «Uncaught» — смотрим журнал. Проверка «журнал пуст» — ниже */
const CRASHES = [];
const crashLines = (c, label) => (c || []).map(e => `${label}: ${e.kind} ${e.where} ×${e.n} — ${e.msg}${e.at ? ' ' + e.at.trim() : ''}${e.state ? ' [' + e.state + (e.phase ? '/' + e.phase : '') + ']' : ''}`);
const smoke = (args, label) => async () => {
  const j = await probe([...args, '--js=return await smoke(30)'], 90);
  const e = errLine(j), s = j.result;
  if (s && s.crash) CRASHES.push(...crashLines(s.crash, label));
  else if (!s) CRASHES.push(label + ': нет результата — журнал не прочитан');
  if (e || !s) return { status: 'fail', info: e || 'нет результата' };
  const ft = s.ft || {}, base = `${s.m} м, кадр p50 ${ft.p50} p95 ${ft.p95} мс, ошибок консоли ${j.errors.length}`;
  if (!s.ok) return { status: 'fail', info: s.fail.join('; ') + ' · ' + base + (s.crash && s.crash.length ? '\n' + crashLines(s.crash, '    журнал').join('\n') : '') };
  return { status: ft.p95 > 33 ? 'warn' : 'ok', info: base + (ft.p95 > 33 ? ' (p95 > 33 мс)' : '') };
};

const CHECKS = [
  { id: 'land-pages', name: 'земля: временные страницы вершин без копий', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landmeshpages-geometry.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'land-pieces', name: 'земля: точное объединение соседних граней', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landpieces-geometry.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'land-layers', name: 'земля: один видимый слой и закрытые торцы', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landlayers-geometry.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'land-simplify', name: 'газоны: общие опорные точки при очистке', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landsimplify-geometry.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'land-curb-trace', name: 'бордюры: проверка фактических соседних торцов', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landcurb-trace.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'land-islands', name: 'газоны: обрывки и связь через общий край', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landislands-geometry.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'land-curb', name: 'бордюры: общий торец и закрытые углы', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landcurb-geometry.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'land-mask', name: 'газоны: общая область рисунка, опоры и бордюра', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landmask-geometry.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'land-clean', name: 'газоны: минимальная ширина и цельные формы', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landclean-geometry.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'land-drive', name: 'поднятая земля: плавная опора четырёх колёс', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landdrive-geometry.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'land-boundary', name: 'границы покрытий: перекрытия, острова и узкие проходы', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landboundary-geometry.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'land-shore', name: 'берег: геометрия совпадает с высотой движения', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landheight-geometry.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'land-cover', name: 'контур земли: вырезы покрытий и целостность стыков', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'landcover-geometry.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'pile-live', name: 'сугробы после индексации: разрушение и смена сезона', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/pile-index.js'), '--seed=7']);
    const e = errLine(j), r = j.result;
    return { status: !e && r?.ok && !j.errors.length && !r.crash ? 'ok' : 'fail', info: e || (r ? `${r.cells} клеток, буферы ${r.mbBefore} → ${r.mbAfter} МБ; проверено сугробов ${r.checks.length}, ошибок ${j.errors.length}` : 'нет результата') };
  } },
  { id: 'pile-index', name: 'общие вершины статики: геометрия, сезоны, живой префикс', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'pile-index-test.mjs')]);
    return { status: r.code === 0 ? 'ok' : 'fail', info: (r.code === 0 ? r.out : r.err).trim() };
  } },
  { id: 'build-web', name: 'сборка web', group: 1, run: build('web') },
  { id: 'build-steam', name: 'сборка steam', group: 1, run: build('steam') },
  { id: 'i18n', name: 'i18n:check', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'i18n-check.mjs')]);
    const lines = r.out.trim().split('\n');
    const miss = lines.map(l => /нет перевода (\d+)/.exec(l)).filter(Boolean).reduce((a, m) => a + +m[1], 0);
    const errs = lines.map(l => /ошибок (\d+)/.exec(l)).filter(Boolean).reduce((a, m) => a + +m[1], 0);
    if (r.code !== 0 || errs) return { status: 'fail', info: `ошибок ${errs}: ` + lines.filter(l => /^\s{3}/.test(l)).slice(0, 2).map(s => s.trim()).join(' | ') };
    return { status: miss ? 'warn' : 'ok', info: miss ? `без перевода ${miss} строк (на все языки)` : 'всё переведено' };
  } },
  // политика конфиденциальности: public/privacy.html = src/game/privacytext.js (текст листа «что собираем» в игре)
  { id: 'privacy', name: 'privacy.html совпадает с текстом в игре', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'privacy-html.mjs'), '--check'], { timeout: 20 });
    return r.code === 0 ? { status: 'ok', info: 'страница = privacytext.js' } : { status: 'fail', info: (r.err || r.out).trim().split('\n').slice(0, 2).join(' | ') };
  } },
  { id: 'video', name: 'ролик повтора: сохранение в Стиме, длительность webm', group: 1, run: async () => {
    // повтор выключен в игре (23.10.2026, 11ф: replay.js RP.ON: false) — ролика нет, проверку пропускаем; включат — снова проверяется
    if (/^\s*ON:\s*false\b/m.test(fs.readFileSync(path.join(__dirname, '..', 'src/game/replay.js'), 'utf8'))) return { status: 'ok', info: 'пропущена: повтор выключен в игре (replay.js RP.ON)' };
    const r = await sh(process.execPath, [path.join(__dirname, 'video-save-test.cjs')], { timeout: 30 });
    let j = null; try { j = JSON.parse(r.out.trim().split('\n').pop()); } catch (e) { /* — */ }
    if (!j) return { status: 'fail', info: 'без ответа: ' + (r.err || r.out).trim().slice(0, 160) };
    return j.ok ? { status: 'ok', info: 'video:save → «Видео/Птица Пицца», Duration дописана' } : { status: 'fail', info: j.fail.join(' | ').slice(0, 200) };
  } },
  { id: 'update', name: 'обновление: предлагается самая новая готовая версия', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'update-pick-test.cjs')], { timeout: 20 });
    let j = null; try { j = JSON.parse(r.out.trim().split('\n').pop()); } catch (e) { /* — */ }
    if (!j) return { status: 'fail', info: 'без ответа: ' + (r.err || r.out).trim().slice(0, 160) };
    return j.ok ? { status: 'ok', info: `${j.cases} случаев: из 0.9.1 / 0.10.6 / 0.11.0 — сразу последняя` } : { status: 'fail', info: j.fail.join(' | ').slice(0, 200) };
  } },
  { id: 'car-blood-shader', name: 'кровь и грязь машины: программа WebGL компилируется', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/car-blood-shader.js')]);
    const e = errLine(j), r = j.result;
    const shaderError = (j.errors || []).find(x => /Shader Error|shader is not compiled/.test(x));
    return e || shaderError || !r?.ok ? { status: 'fail', info: e || shaderError || 'нет результата' }
      : { status: 'ok', info: r.scenarios.join('; ') + ': ' + r.programs + ' программ' };
  } },
  { id: 'car-dirt-isolation', name: 'грязь машины не переходит на прохожих', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/car-dirt-isolation.js')]);
    const e = errLine(j), r = j.result;
    return e || !r?.ok ? { status: 'fail', info: e || 'нет результата' }
      : { status: 'ok', info: r.rows.length + ' запуска машины; чужие материалы чисты, повторных копий нет' };
  } },
  { id: 'orders', name: 'заказы в открытых районах, город поделён', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/orders-open.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    if (r.skip) return { status: 'warn', info: r.skip };
    const c = r.cover || {}, nob = c.nobody || 0;
    return { status: r.bad || nob ? 'fail' : 'ok', info: `${r.total} адресов, ${r.shifts} смен, плохих ${r.bad}` + (r.bad ? ': ' + JSON.stringify(r.sample[0]) : '') +
      (r.cover ? ` · весь город поделён: адресов ${c.spots}, подъездов ${c.doors}, домов ${c.houses}, ничьих ${nob}` + (nob ? ': ' + JSON.stringify(c.sample[0]) : '') : '') };
  } },
  { id: 'drifts', name: 'сугробы снежной зимы: не на дорогах и адресах', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/weather-drifts.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    return { status: r.ok ? 'ok' : 'fail', info: `${r.n} сугробов, ${r.addrs} адресов и дверей; на асфальте ${r.road}, на адресе ${r.addr}` +
      (r.ok ? '' : (r.err ? ' · ' + r.err : '') + (!r.visible ? ' · не видны в снежную зиму' : '') + (r.stormRain !== 1 ? ' · в грозу нет дождя' : '') + (r.sample && r.sample.length ? ': ' + JSON.stringify(r.sample[0]) : '')) };
  } },
  { id: 'buildings', name: 'постройки не на дороге', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/buildings-road.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    const n = Object.entries(r.n).map(([k, v]) => k + ' ' + v).join(', ');
    return { status: r.ok ? 'ok' : 'fail', info: `${n}; на асфальте ${r.bad}` + (r.bad ? ': ' + JSON.stringify(r.by) + " " + JSON.stringify(r.sample) : '') };
  } },
  { id: 'shoparch', name: 'магазины не на окнах и не в арках, сквозь каждую арку — проезд', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/shop-arch.js'), '--q=winlog']);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    if (r.err) return { status: 'fail', info: r.err };
    return { status: r.ok ? 'ok' : 'fail', info: `магазинов ${r.shops}, окно на вывеске / двери / витрине у ${r.shopBad} (окон ${r.winBad}: ${JSON.stringify(r.by)}); арок ${r.arches}: в устье дверь, магазин или ворота ${r.archItems}, без проезда ${r.archNoRoad}` +
      (r.ok ? '' : ' · ' + JSON.stringify(r.sample.slice(0, 2)) + JSON.stringify(r.itemSample.slice(0, 2)) + JSON.stringify(r.archSample.slice(0, 2))) };
  } },
  { id: 'edits', name: 'правки редактора города применены', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/edits.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    const info = `поставить ${r.add}, убрать ${r.remove}` + (r.missing.length ? '; нет в городе: ' + JSON.stringify(r.missing) : '') + (r.still.length ? '; не убрано: ' + JSON.stringify(r.still) : '')
      + (r.refused.length ? '; игра не поставила (место): ' + JSON.stringify(r.refused) : '') + (r.stale.length ? '; «убрать» ничего не нашло (город поменялся?): ' + JSON.stringify(r.stale) : '');
    const H = r.houses || { n: 0, bad: [], noMural: [], unknown: [] };
    const hinfo = H.n ? `; домов ${H.n}` + (H.bad.length ? ', не так: ' + JSON.stringify(H.bad) : '') + (H.noMural.length ? ', мурал не встал: ' + JSON.stringify(H.noMural) : '') + (H.unknown.length ? ', нет в карте: ' + JSON.stringify(H.unknown) : '') : '';
    return { status: !r.ok ? 'fail' : (r.refused.length || r.stale.length || H.noMural.length || H.unknown.length) ? 'warn' : 'ok', info: info + hinfo };
  } },
  { id: 'pave', name: 'заборчики и конструкции не на тротуарах', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/pave-props.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    const n = Object.entries(r.n).map(([k, v]) => k + ' ' + v).join(', ');
    return { status: r.ok ? 'ok' : 'fail', info: `${n}, стеблей зарослей ${r.thick} (${r.perK} на клетку); на тротуаре и дорожке ${r.bad}` + (r.bad ? ': ' + JSON.stringify(r.by) + ' ' + JSON.stringify(r.sample) : '') };
  } },
  /* заборы не накладываются и не липнут к стенам (0п88, 24.10.2026, roadlife.js buildFences; docs/CAREER.md «Заборы домов»): секции
     сбиваемых заборов — наложения (почти на одной линии), пересечения (режутся) и высокие заборы ближе 0,4 м к стене = 0.
     Было: чёрных секций ближе 0,4 м к стене 1820 из 8129 (в основном 8 см — «вплотную к фасаду») */
  { id: 'fenceover', name: 'заборы не накладываются и не вплотную к стене', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/fence-overlap.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    return { status: r.ok ? 'ok' : 'fail', info: `секций ${r.segs}; наложений ${r.dup}, пересечений ${r.cross}, ближе 0,4 м к стене ${r.wall}` + (r.ok ? '' : ': ' + JSON.stringify([...r.sample, ...r.csample, ...r.wsample].slice(0, 3))) };
  } },
  /* бордюры на поворотах стыкуются (0п72, 24.10.2026, curbs.js; docs/CAREER.md «Бордюр на изломах»): торцы камня на изломе — по биссектрисе
     (изнутри и «в ус» у плавных улиц), дуги — по лучам из центра, секции у стыка без просадки. Считаем стыки по углам секций
     (?curbtrace): щель — край торца не сходится с соседним больше чем на 3 см в плане, ступенька — верх выше 3 см. Было (?nomiter):
     щелей на изломах 477, ступенек 728 из 255 тыс. стыков (до 8,8 см — «квадрат» вырезан в углу камня) */
  { id: 'curbjoin', name: 'бордюры на поворотах стыкуются', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/curb-joins.js'), '--q=curbtrace']);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    if (r.err) return { status: 'fail', info: r.err };
    return { status: r.ok ? 'ok' : 'fail', info: `секций ${r.sections}, стыков ${r.joins}; на изломах щелей ${r.gapTurn}, ступенек ${r.stepTurn} (самый большой разрыв ${r.worst} м)` + (r.ok ? '' : ': ' + JSON.stringify(r.sample.slice(0, 3))) };
  } },
  { id: 'yardnet', name: 'дорожки дворов в сети, точки конкурентов за тротуаром', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/yard-paths.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    return { status: r.ok ? 'ok' : 'fail', info: `тропинок дверей ${r.doors}, общих дорожек ${r.walks}, выходов ${r.links}, хвостов ${r.stub}; точек конкурентов ${r.shops}, с дорожкой ${r.branch}; не так ${r.bad}` + (r.bad ? ': ' + JSON.stringify(r.by) + ' ' + JSON.stringify(r.sample) : '') };
  } },
  { id: 'yardempty', name: 'дворы без пустых мест', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/yard-empty.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    if (r.err) return { status: 'fail', info: r.err };
    const pl = Object.entries(r.placed || {}).map(([k, v]) => k + ' ' + v).join(', ');
    return { status: r.ok ? 'ok' : r.bad || r.pieces > 20 ? 'fail' : 'warn', info: `пустых кусков ${r.pieces} (${r.m2} м²); поставлено ${r.things}: ${pl}; деревьев ${r.trees}, кустов ${r.bushes}, сборка ${r.buildMs} мс; на мощёном и в доме ${r.bad}` +
      (r.pieces ? ': ' + JSON.stringify(r.list.slice(0, 4)) : '') + (r.bad ? ' ' + JSON.stringify(r.by) + ' ' + JSON.stringify(r.sample) : '') };
  } },
  /* плавные улицы по умолчанию (11ч этап 5, 24.10.2026, roadsmooth.js; docs/CAREER.md «Дороги плавные»): сводка города
     (smooth-summary.js) по умолчанию и с ?oldroads — скругление включено и сделано (≥ 1 500 дуг, срез улиц ≤ 3 м; у проездов — maxCut7, до 5,5 м, 0п71), с ?oldroads — выключено
     и точек не добавлено; остановки и дома с адресом — те же числом, зебры и подъезды — в пределах 0,5 % */
  { id: 'smooth', name: 'плавные улицы: по умолчанию дугой, ?oldroads — углом', group: 2, run: async () => {
    const S = path.join(__dirname, 'probe-checks/smooth-summary.js');
    const a = await probe(['--eval=' + S]), b = await probe(['--eval=' + S, '--q=oldroads']);
    const e = errLine(a) || errLine(b), A = a.result, B = b.result;
    if (e || !A || !B || !A.smooth || !B.smooth) return { status: 'fail', info: e || 'нет результата' };
    const st = A.smooth.STATS, near = (x, y) => Math.abs(x - y) <= Math.max(2, y * 0.005);
    const bad = [!st.on && 'по умолчанию выключено', st.done < 1500 && `скруглено ${st.done} < 1500`, st.maxCut > 3 && `срез ${st.maxCut} > 3 м`,
      B.smooth.STATS.on && 'с ?oldroads включено', B.smooth.STATS.pts && `с ?oldroads +${B.smooth.STATS.pts} точек`,
      A.n.stops !== B.n.stops && `остановок ${B.n.stops} → ${A.n.stops}`, A.n.housesAddr !== B.n.housesAddr && `домов с адресом ${B.n.housesAddr} → ${A.n.housesAddr}`,
      !near(A.n.zebras, B.n.zebras) && `зебр ${B.n.zebras} → ${A.n.zebras}`, !near(A.n.entr, B.n.entr) && `подъездов ${B.n.entr} → ${A.n.entr}`].filter(Boolean);
    const by = Object.entries(st.byClass).map(([k, v]) => k + ':' + v).join(' ');
    return { status: bad.length ? 'fail' : 'ok', info: (bad.length ? bad.join('; ') + ' · ' : '') + `дуг ${st.done} из ${st.found} (по классам ${by}), +${st.pts} точек, срез ≤ ${st.maxCut} м, ${st.ms} мс; ` +
      `?oldroads → по умолчанию: узлов ${B.n.nodes} → ${A.n.nodes}, зебр ${B.n.zebras} → ${A.n.zebras}, остановок ${B.n.stops} → ${A.n.stops}, подъездов ${B.n.entr} → ${A.n.entr}, треугольников ${B.T.tris} → ${A.T.tris}` };
  } },
  /* край газона у мощёного без бордюра (11ц, 24.10.2026, curbs.js; все виды мощения — 0п35; docs/CAREER.md «Бордюр у дорог и проездов»,
     «Бордюр на всех стыках газона и мощёного»): по краям улиц, проездов, пешеходок, дорожек, стоянок, площадок и карманов шагом 1 м — газон
     за краем, а бордюра (поднятого тротуара или камня) нет; перекрёстки, зебры, швы до 0,35 м, пандусы у дверей — не в счёт.
     Было (?oldcurbs): проезды 82,8 км из 212, улицы 6,5 из 236; до 0п35: дорожки 55 км из 183, стоянки, площадки, карманы — почти весь край */
  { id: 'curbgap', name: 'край газона у дороги — с бордюром', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/curb-gaps.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    if (r.err) return { status: 'fail', info: r.err };
    const km = m => (m / 1000).toFixed(1);
    const o = ['path', 'lot', 'play', 'pocket'].map(k => `${{ path: 'дорожки', lot: 'стоянки', play: 'площадки', pocket: 'карманы' }[k]} ${r.bare[k] || 0} м из ${km(r.lawn[k] || 0)} км`).join(', ');
    return { status: r.ok ? 'ok' : 'fail', info: `край газона: улицы ${km(r.lawn.street)} км, проезды ${km(r.lawn.drive)} км; без бордюра — улицы ${r.bare.street} м, проезды ${r.bare.drive} м, ${o} (пешеходки ${r.bare.foot} м; ` +
      `не в счёт: перекрёстки ${km(r.skip.junction)} км, зебры ${km(r.skip.zebra)} км, швы ${km(r.skip.strip)} км, пандусы ${r.skip.door || 0} м); камня ${km(r.curbs.m)} км, сборка ${r.curbs.ms} мс` + (r.ok ? '' : ': ' + JSON.stringify(r.sample.slice(0, 4))) };
  } },
  { id: 'routehouse', name: 'маршрут навигатора не сквозь дома', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/route-house.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    return { status: r.ok ? 'ok' : 'fail', info: `к клиенту ${r.n}: режут дом ${r.after} (по-старому ${r.before}); со двора ${r.yard}: ${r.afterYard} (по-старому ${r.beforeYard}); без дорог рядом ${r.noRoad}, улица дальше 230 м ${r.far}; ` +
      `поиск по клеткам к клиенту p95 ${r.tail.p95} мс, со двора ${r.head.p95} мс` + (r.ok ? '' : ': ' + JSON.stringify(r.sample.slice(0, 2))) };
  } },
  { id: 'yardmaze', name: 'дворы сложнее: клиенты достижимы, навигатор не сквозь заборы и лесочки', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/yard-maze.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    const m = r.maze || {};
    return { status: r.ok ? 'ok' : 'fail', info: `адресов ${r.n}: доехать ${r.strict + r.soft} (мягко ${r.soft}), заперты ${r.none}, далеко ${r.far}; маршрут сквозь лабиринт ${r.thru} из ${r.thruN}; ` +
      `прямая через двор перекрыта у ${r.lineCut} из ${r.pairs}; заборы ${m.solidM} м твёрдых / ${m.smashM} м сбиваемых, клумб ${m.beds}, кустов ${m.hedges}, лесочков ${m.groves}` +
      (r.ok ? '' : ': ' + JSON.stringify({ none: r.none_at, thru: r.thru_at })) };
  } },
  { id: 'ghosts', w: 60, name: 'машины не призраки и твёрдые, лось не сквозь', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/ghost-cars.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    const solid = r.solid.map(s => s.k + (s.pass ? ' НАСКВОЗЬ' : ' ок')).join(', '), m = r.moose;
    const info = `${r.gameSecs} с смены: призраков ${r.orphans}` + (r.merged !== undefined ? `, склейка стоящих: лишних ${r.merged}, без кузова ${r.noBody}` : '') + `, стоят > 30 с ${r.stand} (без причины ${r.unexplained}); твёрдые: ${solid}; лось: ` +
      ['parked', 'bus'].filter(k => m[k]).map(k => k + ' ' + (m[k].pen < 0 ? 'не сквозь' : 'СКВОЗЬ ' + m[k].pen)).join(', ') + (m.butt ? `, боднул — машину на ${m.butt.moved} м` + (m.butt.tries > 1 ? ` (с ${m.butt.tries}-й)` : '') + (m.butt.hit ? '' : ' (не добежал)') : '') +
      (r.orphans ? ' · ' + JSON.stringify(r.orphanSample) : '') + (r.merged ? ' · ' + JSON.stringify(r.mergedSample) : '') + (r.noBody ? ' · ' + JSON.stringify(r.noBodySample) : '') + (r.unexplained ? ' · ' + JSON.stringify(r.standSample) : '') +
      r.solid.filter(s => s.pass).map(s => ' · ' + s.k + ': ' + JSON.stringify(s)).join('');
    return { status: !r.ok ? 'fail' : r.unexplained ? 'warn' : 'ok', info };
  } },
  /* машина о машину (0п38, 24.10.2026, carhit.js, docs/CAREER.md «Машина о машину»): отброшенная ударом (у бордюра, во дворе,
     поток) и толкнутая курьером стоящая — не заходит в кузов другой глубже 5 см; та, в которую попали, сдвинута или помята.
     Было (CHIT.CH.on = false): 1,5—2,8 м внутри соседней, ~175 кадров из 180 */
  { id: 'carhit', w: 45, name: 'машина о машину: не сквозь, мнутся обе', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/car-hit.js'), '--seed=7']);   // город с зерном: ряды стоящих у бордюра — одни и те же
    const e = errLine(j), r = j.result;
    if (e || !r || !r.runs) return { status: 'fail', info: e || 'нет результата' };
    const f = q => q.none ? 'нет пары' : `${q.maxPen} м (${q.badFrames} кадров)` + (q.bMoved !== undefined ? `, соседнюю сдвинуло ${q.bMoved} м, помята ${q.bDmg}` : '') + (q.hits !== undefined ? `, ударов ${q.hits}` : '');
    const ks = [...new Set(r.runs.map(q => q.k))];
    const info = ks.map(k => { const o = r.runs.find(q => q.k === k && !q.on), n = r.runs.find(q => q.k === k && q.on); return `${k}: было ${o ? f(o) : '—'} → стало ${n ? f(n) : '—'}`; }).join('; ');
    return { status: r.ok ? 'ok' : 'fail', info };
  } },
  /* люди не сквозь твёрдое (0п1, 23.10.2026, pedcollide.js, docs/CAREER.md «Люди и твёрдое»): 45 с смены на автопилоте — сколько
     раз человек оказался внутри дома, твёрдого или кузова (было: 4—6 за 45—150 с, 0,2—0,5 % замеров внутри; бургер в доме, в машине,
     гость под твоей машиной); паника у стены, катящаяся машина, стоящая машина и коробка-«гараж» поперёк тротуара; ударил машину
     в толпу (0п31, 24.10.2026) — ни разу не внутри её кузова (было 60—70 кадров: упавший лежал, машина ехала сквозь) */
  { id: 'ped-solid', w: 60, name: 'люди не сквозь стены и машины, машина толкает людей', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/ped-solid.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    const kinds = Object.entries(r.byKind).map(([k, n]) => k + ' ' + n).join(', ') || '—';
    const t = (o, ok, bad) => !o ? 'не нашлось' : o.ok ? ok : bad;
    const info = `${r.gameSecs} с смены, ${r.samples} замеров: вошли внутрь ${r.entries} раз (${kinds}), внутри ${r.insidePct} % замеров; ` +
      `паника у стены: ${t(r.panic, 'отбежал на ' + (r.panic && r.panic.moved) + ' м', 'В СТЕНУ')}; катящаяся машина: ${t(r.roll, r.roll && r.roll.hit, 'СКВОЗЬ')}; ` +
      `стоящая поперёк тротуара: ${t(r.parked, 'обошёл', 'СКВОЗЬ')}; коробка поперёк: ${t(r.box, 'развернулся', 'СКВОЗЬ')}; ` +
      `удар машиной в толпу: ${t(r.crowd, 'сбито ' + (r.crowd && r.crowd.down) + ' из ' + (r.crowd && r.crowd.people) + ', внутри 0', 'внутри кузова ' + (r.crowd && r.crowd.inside) + ' раз, сбито ' + (r.crowd && r.crowd.down))}` +
      (r.entries ? ' · ' + JSON.stringify(r.sample) : '') + (r.stuck && r.stuck.length ? ' · застряли: ' + JSON.stringify(r.stuck) : '');
    return { status: r.ok ? 'ok' : 'fail', info };
  } },
  /* одно уведомление за раз (18.10.2026, notifyq.js, docs/CAREER.md «Одно уведомление за раз»): 60 с средней смены на автопилоте,
     через 6 с езды машину переносит к адресу (вручений втрое больше — теснее, чем у игрока); раз в 50 мс по самой странице —
     сколько всплывающего видно сразу (чек оплаты, реплика, новое сообщение чата, тост, грамота, задание, подсказка, таблица).
     Двух сразу — 0; было до очереди: 4—9 раз за 3 мин (до трёх сразу) */
  // группа 3 (с дымовыми), не 2: рядом с «призраками» под нагрузкой лось не успевал боднуть машину
  { id: 'notify-one', w: 75, name: 'одно уведомление за раз', group: 3, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/notify-one.js'), '--q=nsecs=60&nshift=6&ntp=6'], 150);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    const kinds = Object.entries(r.shown).map(([k, n]) => k + ' ' + n).join(', ');
    const info = `${r.liveSec} с езды, вручений ${r.delivered}: показано ${kinds}; два и больше сразу — ${r.overlaps} раз (${r.overSec} с)` +
      (r.nq ? `, выброшено устаревших ${r.nq.stale}, перебито ${r.nq.cut}, дольше всех ждало ${r.nq.maxWait} с` : '') +
      (r.overlaps ? ' · ' + r.examples.slice(0, 3).map(x => x.t + ' с: ' + x.kinds + ' («' + x.texts + '»)').join('; ') : '');
    // плашка достижения ушла за ≤ 6 с (0п14, v0.20.0: висела и не пропадала) и не залипла после «спрятали до первого кадра»
    const ach = r.ach || {}, achBad = ach.maxSec > 6 || ach.stuckAfterRace;
    const achInfo = `; грамот ${ach.n}, дольше всех висела ${ach.maxSec} с (≤ 6)` + (ach.stuckAfterRace ? ', ЗАЛИПЛА после показа-и-сразу-спрятать' : '');
    return { status: r.overlaps || achBad ? 'fail' : r.delivered < 3 ? 'warn' : 'ok', info: info + achInfo + (r.delivered < 3 ? ' (мало вручений — проверка слабая)' : '') };
  } },
  /* память на телефоне (11.10.2026, docs/AGENTS.md «Память на телефоне»): мобильный режим, меню → город достроен → 20 с смены.
     Порог — с запасом ~20 % над замером; было до правок: куча 706 / 822 МБ, след страницы пик 1477 МБ — вкладка Safari на iPhone умирала */
  { id: 'memory-phone', w: 90, name: 'память на телефоне: куча JS, видео, след страницы, пики на переходах', group: 2, run: async () => {
    const LIM = { menu: 520, shift: 620, gl: 360, foot: 1450, trans: 1450 };
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/memory.js'), '--mem', '--early', '--size=phone-land', '--q=msecs=20'], 220);
    const e = errLine(j), r = j.result;
    if (e || !r || !r.shift) return { status: 'fail', info: e || 'нет результата' };
    const foot = Math.max(0, ...((j.mem || []).map(m => m.footPeak || 0)));
    /* пики на переходах (0п48, автор 24.10.2026: «переход в загрузку и иногда заход в мини-игру заставляют перезагружаться вебвью»):
       «на смену», пока город достраивается (экран загрузки, остаток разом), мини-игры у двери (вход и выход), загрузка пиццы
       в пиццерии (накладная, коробка в багажник), кольцо гопников,
       чек смены, деп, перевод в другую пиццерию — пик следа страницы за каждый (tools/probe-checks/memtrans.js) */
    const jt = await probe(['--eval=' + path.join(__dirname, 'probe-checks/memtrans.js'), '--mem', '--early', '--size=phone-land',
      '--q=mtonly=load,домофон,подъезд,pizza,ring,shiftend,dep,transfer'], 300);
    const et = errLine(jt), rt = jt.result;
    const T = rt && rt.T ? Object.entries(rt.T).filter(([k]) => !k.startsWith('·')) : [];
    const tp = T.length ? Math.max(...T.map(([, x]) => x.peak || 0)) : 0;
    const worst = T.slice().sort((a, b) => (b[1].peak || 0) - (a[1].peak || 0))[0];
    const miss = rt && rt.miss ? rt.miss.map(x => (typeof x === 'string' ? x : x.name)) : [];
    const bad = [r.menu.heap > LIM.menu && `куча в меню ${r.menu.heap} > ${LIM.menu}`, r.shift.heap > LIM.shift && `куча в смене ${r.shift.heap} > ${LIM.shift}`,
      r.shift.gl.total > LIM.gl && `видео ${r.shift.gl.total} > ${LIM.gl}`, foot > LIM.foot && `след страницы, пик ${foot} > ${LIM.foot}`,
      tp > LIM.trans && `пик на переходе «${worst[0]}» ${tp} > ${LIM.trans}`, (et || !rt) && 'переходы: ' + (et || 'нет результата')].filter(Boolean);
    const info = `куча JS, МБ: меню ${r.menu.heap}, достроен ${r.built.heap}, смена ${r.shift.heap} (пик ${r.shift.gl.heapPeak}); видео ${r.shift.gl.total} МБ` +
      (foot ? `; след страницы, пик ${foot} МБ` : '') + ` · пороги ${LIM.menu} / ${LIM.shift} / ${LIM.gl}` + (foot ? ` / ${LIM.foot}` : '') + (r.shift.mobile ? '' : ' · НЕ мобильный режим') +
      (tp ? ` · переходы (${T.length}): пик ${tp} МБ — «${worst[0]}» (+${worst[1].d}), порог ${LIM.trans}` : '') + (miss.length ? ` · не случились: ${miss.join(', ')}` : '');
    return { status: bad.length ? 'fail' : r.shift.mobile && !miss.length ? 'ok' : 'warn', info: (bad.length ? bad.join('; ') + ' · ' : '') + info };
  } },
  /* экранная клавиатура Стима (23.10.2026, 0ав: на Деке одна буква — 10 раз): автоповтор с флагом и парой «отпустил — нажал»,
     зажатая клавиша, вставка без нажатий — одна буква; «Анна» пальцем — как есть (docs/CAREER.md «Экранная клавиатура Стима») */
  { id: 'osk-repeat', w: 40, name: 'экранная клавиатура Стима: одно нажатие — одна буква', group: 2, run: async () => {
    const j = await probe(['--mode=steam', '--q=mock-steam=deck', '--eval=' + path.join(__dirname, 'probe-checks/osk-repeat.js')], 120);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    return { status: r.bad.length ? 'fail' : 'ok', info: r.bad.length ? r.bad.join('; ') : '7 сценариев × наша клавиатура и клавиатура Стима — ок' };
  } },
  /* руль на телефоне не залипает (0п44, автор 24.10.2026: «перестал крутиться руль на мобиле»): держишь руль → окно разговора,
     пауза, уведомления, вкладка в фоне, фокус, поворот экрана, три пальца → отпустил (обычно / потерялось / отменено) → руль
     снова слушается; поверх руля и педалей ничего; палец у руля — руль, не «осмотреться» (docs/CAREER.md «Управление на телефоне») */
  { id: 'touchwheel', w: 40, name: 'руль на телефоне не залипает', group: 2, run: async () => {
    const j = await probe(['--size=phone-land', '--sa=59,21', '--eval=' + path.join(__dirname, 'probe-checks/touchwheel.js')], 200);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    const n = Object.keys(r.rows || {}).length;
    return { status: r.bad.length ? 'fail' : 'ok', info: r.bad.length ? r.bad.slice(0, 6).join('; ') + (r.bad.length > 6 ? ` … и ещё ${r.bad.length - 6}` : '') : `${n} сценариев (7 помех × 4 отпускания), три пальца, палец у руля — ок` };
  } },
  /* Новый год: полночь — событие, смена кончается только в пиццерии (0п45, автор 24.10.2026: «Новый год посреди возвращения
     закончил смену»): полночь застаёт с заказом, на обратном пути, с накладной и на погрузке вдали от пиццерии — смена идёт,
     пока не вернёшься; в полночь — залп салюта и «с Новым годом» в чате (docs/CAREER.md «Полночь», «Праздники») */
  { id: 'nymidnight', w: 60, name: 'Новый год: смена кончается в пиццерии, не посреди дороги', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/nymidnight.js')], 420);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    const rows = Object.entries(r.rows || {}).map(([k, v]) => `${k} ${v.at} → конец в ${v.endD == null ? '—' : v.endD + ' м'}`).join('; ');
    return { status: r.bad.length ? 'fail' : r.warn.length ? 'warn' : 'ok', info: [...r.bad, ...r.warn].join('; ') || rows };
  } },
  { id: 'smoke-adult', w: 40, name: '30 с автопилота: взрослая (web)', group: 3, run: smoke(['--mode=web'], 'взрослая') },
  { id: 'smoke-phone', w: 40, name: '30 с автопилота: телефон боком (web)', group: 3, run: smoke(['--size=phone-land'], 'телефон') },
  { id: 'smoke-crashlog', name: 'журнал ошибок пуст после дымовых', group: 4, run: async () => (
    CRASHES.length ? { status: 'fail', info: CRASHES.length + ' записей:\n' + CRASHES.map(l => '    ' + l).join('\n') } : { status: 'ok', info: 'пуст' }) },
  // детская версия и сборка Яндекса — только по явной просьбе автора (Яндекс собираем по нужде)
];

(async () => {
  const T0 = Date.now();
  const only = arg('only', '').split(',').filter(Boolean);
  const list = CHECKS.filter(c => !only.length || only.some(o => c.id.startsWith(o)));
  const rows = [];
  const runOne = async c => {
    const t = Date.now();
    let r;
    try { r = await c.run(); } catch (e) { r = { status: 'fail', info: String(e && e.message || e) }; }
    const row = { ...c, ...r, ms: Date.now() - t };
    rows.push(row);
    process.stderr.write(`  ${row.status === 'ok' ? 'ок ' : row.status === 'warn' ? 'внм' : 'ПРОВАЛ'} ${c.name} (${(row.ms / 1000).toFixed(1)} с)\n`);
    return row;
  };
  const groups = [...new Set(list.map(c => c.group))].sort((a, b) => a - b);
  const JOBS = has('serial') ? 1 : Math.max(1, +arg('jobs', 0) || Math.min(3, Math.floor(os.cpus().length / 3)));
  // не больше n разом: следующая — когда освободилось место; долгие — первыми (меньше ждать хвоста группы)
  const pool = async (cs, n) => {
    const q = cs.slice().sort((a, b) => (b.w || 0) - (a.w || 0));
    await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await runOne(q.shift()); }));
  };
  process.stderr.write(`  проверок в игре разом: ${JOBS}\n`);
  for (const g of groups) {
    const cs = list.filter(c => c.group === g);
    // сборки упали — в игре проверять нечего
    if (g > 1 && rows.some(r => r.id.startsWith('build') && r.status === 'fail')) { for (const c of cs) rows.push({ ...c, status: 'fail', info: 'не запускалась: сборка упала', ms: 0 }); continue; }
    await pool(cs, g === 1 ? cs.length : JOBS);
  }
  rows.sort((a, b) => list.indexOf(list.find(c => c.id === a.id)) - list.indexOf(list.find(c => c.id === b.id)));
  const W = Math.max(...rows.map(r => r.name.length));
  const mark = s => (s === 'ok' ? 'ок    ' : s === 'warn' ? 'внимание' : 'ПРОВАЛ').padEnd(8);
  console.log('');
  for (const r of rows) console.log(`${mark(r.status)}  ${r.name.padEnd(W)}  ${((r.ms / 1000).toFixed(1) + ' с').padStart(6)}  ${r.info || ''}`);
  const bad = rows.filter(r => r.status === 'fail').length, warn = rows.filter(r => r.status === 'warn').length;
  console.log(`\n${bad ? 'ПРОВАЛ: ' + bad : 'всё ок'}${warn ? ', предупреждений ' + warn : ''} · ${((Date.now() - T0) / 1000).toFixed(0)} с`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* — */ }
  process.exit(bad ? 1 : 0);
})();
