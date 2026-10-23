/* Память на переходах (0п48, автор 24.10.2026: «переход в загрузку и иногда заход в мини-игру заставляет перезагружаться
   вебвью»): пик следа страницы (phys_footprint — по нему iOS выгружает вкладку) от начала перехода до +2 с после него.
   npm run probe -- --eval=tools/probe-checks/memtrans.js --mem --early --size=phone-land --max=0 --timeout=420
   --q=mtwait=4 — через сколько секунд меню (поздняя сборка ещё идёт) нажать «на смену» — экран загрузки, остаток города разом;
   --q=mtonly=load,домофон — только эти переходы (load, домофон, подъезд, подъезд с гопниками, разговор у двери, pizza, ring, shiftend, dep, transfer).
   Ответ: base — след в меню до нажатия; T — { переход: { foot0 — след перед, peak — пик за переход (exact — точно: пик с запуска
   вырос в этом окне), foot1 — после, d — пик − перед, gl — видео по обёрткам после, page / gpu — пик процессов, n — опросов, ms } }; peak — самый высокий пик из переходов (порог в check memory-phone);
   miss — переходы, которые не случились (мини-игра не открылась за отведённое время). docs/AGENTS.md «Пики на переходах». */
const q = new URLSearchParams(location.search);
const WAIT = +(q.get('mtwait') || 4), ONLY = q.get('mtonly') ? q.get('mtonly').split(',') : null;
const want = k => !ONLY || ONLY.includes(k);
const out = { T: {}, miss: [], mobile: window.__mobile ? window.__mobile.on : null };
const fin = r => { if (r) { r.d = r.peak != null && r.foot0 != null ? r.peak - r.foot0 : null; r.gl = window.__glmem ? window.__glmem.get().total : null; } return r; };
const near = () => { const t = d.S.target; return t ? Math.hypot(t.x - d.V.x, t.z - d.V.z) : 1e9; };
async function tr (name, go, done, ms = 30000, tail = 2000) {
  await watch(name);
  let ok = false;
  try { await go(); ok = await until(done, ms); } catch (e) { out.miss.push(name + ': ' + (e && e.message || e)); }
  await wait(tail);
  const r = await unwatch(name);
  if (fin(r)) out.T[name] = r;
  if (!ok) out.miss.push(name);
  return ok;
}
/* машина — на путь навигатора в ~90 м до цели, дальше автопилот (deliver-near.js) */
function nearTarget (M = 90) {
  const P = d.route; if (!P || P.length < 2) return false;
  let L = 0, i = P.length - 1;
  while (i > 1 && L < M) { L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); i--; }
  const a = P[i], b = P[Math.min(P.length - 1, i + 1)];
  tp(a[0], a[1], Math.atan2(b[0] - a[0], b[1] - a[1]));
  return true;
}
/* к цели: путь навигатора в 90 м, автопилот; не доехал за 15 с до 45 м — машина в 3 м от цели (hop) */
const hop = () => {                               // без притяжки к дороге (tp тянет на полотно в 5 м — вне «reach» 6 м)
  const t = d.S.target, V = d.V; if (!t) return;
  autopilot(false);
  tp(t.x, t.z); V.x = t.x + 1.5; V.z = t.z + 1.5; V.vx = V.vz = 0; V.y = d.surfaceAt(V.x, V.z);
  if (d.car) d.car.position.set(V.x, V.y, V.z);
};
async function approach () {
  nearTarget(); autopilot(true);
  if (!(await until(() => near() < 45, 15000))) hop();
}
/* мини-игра у следующего адреса: force(), подъехать, войти (DOOR.on) — окно «вход»; решить — окно «выход» */
async function doorGame (name, force, solveArg) {
  if (!want(name)) return;
  for (let k = 0; k < 3; k++) {
    await until(() => d.S.target && d.route.length > 1 && (d.S.state === 'drive' || d.S.state === 'back'), 30000);
    if (d.S.state === 'drive') break;
    await approach(); await until(() => d.S.state !== 'back', 30000);   // в пиццерию за следующим заказом
    if (d.S.state === 'brief') { d.acceptOrder(); await until(() => d.S.state === 'drive', 4000); }
  }
  force();
  await approach();
  // автопилот застрял у двора (забор, клумбы) — через 10 с машина в 3 м от адреса
  const t0w = Date.now();
  let again = false;
  const ok = await tr(name + ' вход', async () => {}, () => { if (!again && Date.now() - t0w > 10000 && near() > 8 && !d.DOOR.on()) { again = true; hop(); } return d.DOOR.on(); }, 30000);
  if (!ok) { out.miss.push({ name, state: d.S.state, m: Math.round(near()), n: [d.DOOR.n, d.DOOR.stairsN, d.DOOR.talkN], del: d.S.delivered, planned: d.DOOR.planned }); return; }
  const d0 = d.S.delivered || 0, t0 = d.S.target;
  await tr(name + ' выход', async () => { d.DOOR.solve(solveArg); }, () => !d.DOOR.on(), 20000);
  // вручение у этого адреса — до следующей мини-игры (у остановки, где уже была, вторая не начнётся)
  await until(() => (d.S.delivered || 0) > d0 || d.S.target !== t0 || d.S.state !== 'drive', 20000);
  await run(1, 1);
}

// ── меню → экран загрузки (город ещё строится: остаток разом) → смена ──
try { d.Store.set('dlv-name', 'Проба'); } catch (e) { /* — */ }
await wait(WAIT * 1000);
out.base = (await mem('menu')).proc;
if (want('load')) {
  await tr('меню → загрузка → смена', async () => {
    const b = document.querySelector('.crm-card.k-go .crm-cb');
    out.lateBusy = !(window.__boot && window.__boot.full);
    await watch('· достроить город');
    if (b) b.click();
    // нажатие ждёт город (экран загрузки), потом повторяется; не начало смену (окно имени и т. п. поверх меню) — как «на смену»
    await until(() => window.__boot && window.__boot.full, 90000);
    out.flushMs = window.__boot && window.__boot.late ? window.__boot.late.flush : null;
    out.T['· достроить город'] = fin(await unwatch('· достроить город'));   // пик за переход — в составном окне ниже
    await watch('· начало смены');
    if (!['brief', 'drive'].includes(d.S.state)) d.startRun(false);
    await until(() => ['brief', 'drive'].includes(d.S.state), 20000); await wait(1500);
    out.T['· начало смены'] = fin(await unwatch('· начало смены'));
  }, () => ['brief', 'drive'].includes(d.S.state), 30000, 2500);
}
await until(() => window.__boot && window.__boot.full, 120000);
await onShift();
out.shift = (await mem('shift')).proc;
autopilot(true);
await run(3, 1);

// ── мини-игры у двери: домофон, подъезд (и с гопниками — откупиться), разговор ──
await doorGame('домофон', () => d.DOOR.force('dial'), undefined);
await doorGame('подъезд', () => d.DOOR.stairs({ gop: false }), '');
await doorGame('подъезд с гопниками', () => d.DOOR.stairs({ gop: true }), 'pay');
await doorGame('разговор у двери', () => d.DOOR.talk(true), 'keep');

// ── в пиццерию: накладная нового заказа и загрузка пиццы в багажник (S.state back → brief → loading → drive) ──
if (want('pizza')) {
  for (let k = 0; k < 3 && d.S.state === 'drive'; k++) { const n0 = d.S.delivered; await approach(); await until(() => d.S.delivered > n0 || d.S.state !== 'drive', 25000); if (d.S.state === 'drive') hop(); await run(1, 1); }   // довезти, что везём
  await until(() => d.S.state === 'back' && d.route.length > 1, 30000);
  if (d.S.state === 'back') {
    await approach();
    await tr('пиццерия: накладная и загрузка', async () => {}, () => d.S.state === 'drive', 40000, 2500);
  } else out.miss.push('pizza: не едем в пиццерию (' + d.S.state + ')');
}

// ── кольцо гопников (ringfight.js: «отбиться») — само окно, без мира ──
if (want('ring') && d.RF && d.RF.play) {
  await tr('кольцо гопников', async () => { d.RF.play({ adult: true, sum: '100 ₽', sfx: () => {} }); }, () => { const el = document.getElementById('ringfight'); return el && !el.hidden; }, 5000, 3500);
}

// ── чек смены: конец смены → чек → меню ──
if (want('shiftend')) {
  autopilot(false);
  await tr('конец смены → чек', async () => { d.endShift(); }, () => d.S.state === 'over' || d.S.state === 'title', 20000, 3000);
}
// ── деп (после чека: «депнуть» из трат) ──
if (want('dep') && d.DEP) {
  await tr('деп вход', async () => { d.DEP.open(); }, () => { const m = document.getElementById('cr-dep'); return m && !m.hidden; }, 6000, 2000);
  await tr('деп выход', async () => { d.DEP.close(); }, () => { const m = document.getElementById('cr-dep'); return !m || m.hidden; }, 6000, 2000);
}
// ── перевод в другую пиццерию: следующий район открыт → новая смена там ──
if (want('transfer') && d.DIST && d.DIST.set) {
  const from = d.DIST.cur();
  d.DIST.unlockAll(); d.DIST.set(from === 0 ? 1 : 0);
  try { d.Store.set('dlv-transfer', { to: d.DIST.cur(), from }); } catch (e) { /* — */ }
  await tr('перевод в другую пиццерию', async () => { d.startRun(false); }, () => ['brief', 'drive'].includes(d.S.state), 30000, 3000);
  out.district = [from, d.DIST.cur()];
}
const P = Object.values(out.T).map(r => r.peak || 0);
out.peak = P.length ? Math.max(...P) : null;
out.worst = Object.entries(out.T).sort((a, b) => (b[1].peak || 0) - (a[1].peak || 0)).slice(0, 3).map(([k, r]) => k + ' ' + r.peak + ' (+' + r.d + ')');
return out;
