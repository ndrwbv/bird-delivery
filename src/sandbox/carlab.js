/* Песочница машин (carlab.html, docs/CARS3D.md): игра в iframe в режиме «покататься» (без заказов),
   ручки — __dlv.carlab (game.js): любая машина и цвет без денег, удары с четырёх сторон с заданной силой
   (вмятины, трещины и битые стёкла), кровь, облёт камерой, вид из-за руля, дождь (дворники), починить.
   Машина с ★ — уже с настоящей моделью (realcar.js MODELS). */
import './sandbox.css';

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frame = $('#game');
const W = () => frame.contentWindow;
const D = () => { try { return W() && W().__dlv; } catch (e) { return null; } };
const L = () => { const d = D(); return d && d.carlab; };

function log (msg, kind = '') {
  const l = $('#log');
  l.prepend(el('div', 'lg ' + kind, '<i>' + new Date().toLocaleTimeString('ru', { hour12: false }) + '</i> ' + msg));
  while (l.children.length > 40) l.lastChild.remove();
}

/* загрузка: игра → режим «покататься» → машина стоит */
async function load () {
  $('#loading').hidden = false;
  const url = 'index.html?debug&carlab&mute';
  $('#loading-url').textContent = url;
  frame.src = url;
  for (let i = 0; i < 300 && !(D() && D().startRun && L()); i++) await sleep(100);
  if (!L()) { log('игра не отдала __dlv.carlab', 'err'); return; }
  D().startRun(true);
  for (let i = 0; i < 100 && !['drive', 'back', 'side'].includes(D().S.state); i++) await sleep(100);
  L().stop();
  L().orbit(0.6);
  $('#loading').hidden = true;
  build();
  log('готово: машина стоит, камера облетает');
}

const sec = (title) => {
  const s = el('details', 'sec'); s.open = true;
  s.appendChild(el('summary', '', title));
  const b = el('div', 'body'); s.appendChild(b); $('#sections').appendChild(s);
  return b;
};
const btn = (p, label, fn, cls = '') => {
  const b = el('button', 'btn sm ' + cls, label); b.type = 'button';
  b.addEventListener('click', async () => { try { await fn(); } catch (e) { log(String(e), 'err'); } refresh(); });
  p.appendChild(b); return b;
};
const row = (p, label) => { const r = el('div', 'row'); if (label) r.appendChild(el('label', '', label)); p.appendChild(r); return r; };

let FORCE = 50;
function build () {
  $('#sections').innerHTML = '';
  // машины
  const cars = sec('машина <span class="dim">★ — настоящая модель</span>');
  const g = el('div', 'grid'); cars.appendChild(g);
  for (const c of L().list()) {
    btn(g, (c.real ? '★ ' : '') + c.name, async () => {
      L().use(c.id); await sleep(400); L().stop(); log('машина: ' + c.name + (c.real ? ' (настоящая модель)' : ' (кубики)'));
      if (!c.real) log('у этой машины пока нет настоящей модели — docs/CARS3D.md', 'warn');
    });
  }
  // цвет
  const col = sec('цвет');
  const cg = el('div', 'grid'); col.appendChild(cg);
  for (const p of L().paints) {
    const b = btn(cg, p.name, async () => { L().paint(p.hex); await sleep(200); L().stop(); log('цвет ' + p.name); });
    b.style.background = p.hex; b.style.color = /^#(ecebe6|f2c21b|46b4e0|f27aa8)$/i.test(p.hex) ? '#2a1d10' : '#fff';
  }
  const r = row(col, 'свой');
  const inp = el('input'); inp.type = 'color'; inp.value = '#f0522a';
  inp.addEventListener('change', () => { L().paint(inp.value); log('цвет ' + inp.value); });
  r.appendChild(inp);
  // вид
  const view = sec('вид');
  const vg = el('div', 'grid'); view.appendChild(vg);
  btn(vg, 'облёт: спереди', () => { L().fp(0); L().orbit(0); });
  btn(vg, 'облёт: сзади', () => { L().fp(0); L().orbit(Math.PI); });
  btn(vg, 'облёт: слева', () => { L().fp(0); L().orbit(Math.PI / 2); });
  btn(vg, 'облёт: справа', () => { L().fp(0); L().orbit(-Math.PI / 2); });
  btn(vg, 'из-за руля', () => { L().orbit(null); L().fp(1); });
  btn(vg, 'обычная (сзади)', () => { L().fp(0); L().orbit(null); });
  const rr = row(view, 'поворот');
  const ang = el('input'); ang.type = 'range'; ang.min = -180; ang.max = 180; ang.value = 34;
  const out = el('output', '', '34°');
  ang.addEventListener('input', () => { out.textContent = ang.value + '°'; L().fp(0); L().orbit(ang.value * Math.PI / 180); });
  rr.append(ang, out);
  // удары
  const hit = sec('удары');
  const fr = row(hit, 'сила');
  const f = el('input'); f.type = 'range'; f.min = 10; f.max = 140; f.value = FORCE;
  const fo = el('output', '', FORCE + ' км/ч');
  f.addEventListener('input', () => { FORCE = +f.value; fo.textContent = FORCE + ' км/ч'; });
  fr.append(f, fo);
  const hg = el('div', 'grid'); hit.appendChild(hg);
  for (const [s, n] of [['front', 'в морду'], ['rear', 'в корму'], ['left', 'в левый бок'], ['right', 'в правый бок']]) btn(hg, n, () => { L().hit(s, FORCE); log('удар ' + n + ', ' + FORCE + ' км/ч'); });
  hit.appendChild(el('div', 'dim', 'вмятины — с 14 км/ч, во всю глубину — с 79; стекло трескается с ~32, бьётся с ~54'));
  // кровь
  const bl = sec('кровь <span class="dim">только взрослая версия</span>');
  const bg = el('div', 'grid'); bl.appendChild(bg);
  for (const [s, n] of [['front', 'сбил спереди'], ['left', 'слева'], ['right', 'справа'], ['rear', 'сзади']]) btn(bg, n, () => { L().blood(s); log('кровь: ' + n); });
  btn(bg, 'дождь вкл (дворники)', () => { const e = D().ENV; e.rainWant = 1; e.rainT = 1e6; e.rain = Math.max(e.rain, 0.6); });
  btn(bg, 'дождь выкл', () => { const e = D().ENV; e.rainWant = 0; e.rain = 0; });
  // прочее
  const misc = sec('прочее');
  const mg = el('div', 'grid'); misc.appendChild(mg);
  btn(mg, 'починить (новая машина)', async () => { L().repair(); await sleep(300); L().stop(); log('машина как новая'); });
  btn(mg, 'стоп', () => L().stop());
  btn(mg, 'перезагрузить игру', () => load());
}

function refresh () {
  const l = L();
  if (!l) return;
  const s = l.state();
  $('#status').innerHTML = `машина: <b>${s.id}</b> ${s.real ? '<i class="pink">★ настоящая</i>' : '(кубики)'}<br>стёкла: <b>${s.glass || '—'}</b> · вмятин: <b>${s.dents}</b><br>камера: <b>${s.fp ? 'из-за руля' : s.orbit === null ? 'сзади' : 'облёт'}</b>`;
}
setInterval(refresh, 700);
load();
