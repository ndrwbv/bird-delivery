/* Панель песочницы интерфейса (ui.html без ?frame): слева — размер экрана, язык, версия, список
   экранов и их ручки, журнал; справа — рамка-iframe (ui.html?frame) ровно нужного размера, уменьшенная,
   если не влезает. Экраны и ручки панель берёт у рамки (window.__ui.list(), src/uilab/lab.js).
   Язык и детская версия — перезагрузка рамки (строки игры переводятся при загрузке).
   Что выбрано — в localStorage 'uilab' (только песочница; сохранение игры не трогаем).

   window.__uilab — для probe и консоли: await __uilab.ready; await __uilab.show('shiftend', { earned: 5000 });
   __uilab.size('phone' | 'phoneL' | 'deck' | 'desktop'); await __uilab.lang('en'); await __uilab.kids(true); __uilab.hud(true). */
import './shell.css';

const SIZES = {
  desktop: { w: 1280, h: 720, name: 'компьютер 1280×720' },
  phone: { w: 390, h: 844, name: 'телефон стоя 390×844', touch: true },
  phoneL: { w: 844, h: 390, name: 'телефон боком 844×390', touch: true },
  deck: { w: 1280, h: 800, name: 'Steam Deck 1280×800' },
};
const LS = 'uilab';
const ST = Object.assign({ screen: 'shiftend', vals: {}, size: 'desktop', lang: 'ru', kids: false, hud: false },
  (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } })());
const save = () => { try { localStorage.setItem(LS, JSON.stringify(ST)); } catch (e) { /* — */ } };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

document.body.className = 'ul-shell';
document.body.innerHTML = `
  <aside id="ul-panel">
    <header><h1>интерфейс</h1><a href="./sandbox.html" title="песочница механик: город и ручки мира">песочница мира →</a></header>
    <section id="ul-sizes" class="ul-seg"></section>
    <section class="ul-row">
      <label>язык <select id="ul-lang"></select></label>
      <label><input type="checkbox" id="ul-kids"> детская</label>
      <label title="кошелёк, часы, радар — под экраном"><input type="checkbox" id="ul-hud"> хад</label>
    </section>
    <nav id="ul-list"></nav>
    <section id="ul-knobs"></section>
    <footer><div id="ul-log"></div></footer>
  </aside>
  <main id="ul-stage"><div id="ul-box"><iframe id="ul-frame" title="экран игры"></iframe></div><div id="ul-cap"></div></main>`;
const $ = id => document.getElementById(id);
const frame = $('ul-frame');
const UI = () => { try { return frame.contentWindow && frame.contentWindow.__ui; } catch (e) { return null; } };

function log (msg, kind = '') {
  const l = $('ul-log');
  l.prepend(el('div', 'lg ' + kind, '<i>' + new Date().toLocaleTimeString('ru', { hour12: false }) + '</i> ' + esc(msg)));
  while (l.children.length > 80) l.lastChild.remove();
}

/* ── размер экрана: рамка ровно W×H, уменьшается, чтобы влезть ── */
function fit () {
  const s = SIZES[ST.size] || SIZES.desktop, stage = $('ul-stage');
  const k = Math.min(1, (stage.clientWidth - 32) / s.w, (stage.clientHeight - 56) / s.h);
  frame.style.width = s.w + 'px'; frame.style.height = s.h + 'px';
  frame.style.transform = 'scale(' + k + ')';
  $('ul-box').style.width = Math.round(s.w * k) + 'px'; $('ul-box').style.height = Math.round(s.h * k) + 'px';
  $('ul-cap').textContent = s.name + (k < 1 ? ' · ×' + k.toFixed(2) : '');
}
addEventListener('resize', fit);
function setSize (k) {
  if (!SIZES[k]) return;
  ST.size = k; save(); fit();
  for (const b of $('ul-sizes').children) b.classList.toggle('on', b.dataset.k === k);
  const ui = UI();
  if (ui) { ui.setTouch(!!SIZES[k].touch); setTimeout(() => showCur(), 60); }   // вёрстка меряется при показе — перепоказать
}
for (const [k, s] of Object.entries(SIZES)) {
  const b = el('button', '', esc(s.name.replace(/ \d+×\d+$/, '')) + '<small>' + s.w + '×' + s.h + '</small>');
  b.type = 'button'; b.dataset.k = k;
  b.addEventListener('click', () => setSize(k));
  $('ul-sizes').appendChild(b);
}

/* ── рамка: загрузка и готовность ── */
let readyRes = null, LIST = [];
let READY = new Promise(r => { readyRes = r; });
function loadFrame () {
  READY = new Promise(r => { readyRes = r; });
  if (window.__uilab) window.__uilab.ready = READY;
  frame.src = './ui.html?frame&lang=' + encodeURIComponent(ST.lang) + (ST.kids ? '&kids' : '');
  const t0 = Date.now();
  const poll = () => {
    const ui = UI();
    if (ui && ui.ready) { onReady(ui); return; }
    if (Date.now() - t0 > 30000) { log('рамка не загрузилась за 30 с — смотри консоль', 'err'); return; }
    setTimeout(poll, 80);
  };
  setTimeout(poll, 80);
}
frame.addEventListener('load', () => { /* готовность — по __ui.ready (модули грузятся после load) */ });
function onReady (ui) {
  ui.onLog((m, k) => log(m, k));
  ui.setTouch(!!(SIZES[ST.size] || {}).touch);
  ui.setHud(ST.hud);
  const info = ui.info();
  const ls = $('ul-lang');
  if (!ls.options.length) for (const [l, n] of info.langs) ls.appendChild(new Option(l + ' · ' + n, l));
  ls.value = ST.lang;
  LIST = ui.list();
  buildList();
  pick(LIST.some(s => s.id === ST.screen) ? ST.screen : LIST[0].id, true);
  window.__probeReady = true;
  readyRes(true);
}

/* ── список экранов ── */
function buildList () {
  const nav = $('ul-list');
  nav.replaceChildren();
  let g = null, box = null;
  for (const s of LIST) {
    if (s.group !== g) { g = s.group; nav.appendChild(el('h3', '', esc(g))); box = el('div', 'ul-btns'); nav.appendChild(box); }
    const b = el('button', '', esc(s.name));
    b.type = 'button'; b.dataset.id = s.id;
    b.addEventListener('click', () => pick(s.id, true));
    box.appendChild(b);
  }
}
function vals (id) { return (ST.vals[id] = ST.vals[id] || {}); }
function pick (id, show) {
  const s = LIST.find(q => q.id === id);
  if (!s) return;
  ST.screen = id; save();
  for (const b of $('ul-list').querySelectorAll('button')) b.classList.toggle('on', b.dataset.id === id);
  buildKnobs(s);
  if (show) showCur();
}

/* ── ручки ── */
let T = 0;
function buildKnobs (s) {
  const box = $('ul-knobs'), v = vals(s.id);
  box.replaceChildren(el('h2', '', esc(s.name)), ...(s.note ? [el('p', 'ul-note', esc(s.note))] : []));
  for (const k of s.knobs) {
    const cur = v[k.k] !== undefined ? v[k.k] : k.def;
    const row = el('label', 'ul-k ul-k-' + k.type);
    const cap = el('span', '', esc(k.label));
    let inp;
    if (k.type === 'bool') { inp = el('input'); inp.type = 'checkbox'; inp.checked = !!cur; row.append(inp, cap); }
    else {
      if (k.type === 'sel') {
        inp = el('select');
        let og = null, gname = null;
        for (const [val, label, grp] of k.opts || []) {
          if (grp && grp !== gname) { gname = grp; og = el('optgroup'); og.label = grp; inp.appendChild(og); }
          (grp ? og : inp).appendChild(new Option(label, String(val)));
        }
        inp.value = String(cur);
      } else {
        inp = el('input');
        inp.type = k.type === 'num' ? 'number' : 'text';
        if (k.type === 'num') { if (k.min !== undefined) inp.min = k.min; if (k.max !== undefined) inp.max = k.max; inp.step = k.step || 1; }
        inp.value = cur;
      }
      row.append(cap, inp);
    }
    const read = () => (k.type === 'bool' ? inp.checked : k.type === 'num' ? +inp.value : k.type === 'sel' && typeof k.def === 'number' ? +inp.value : inp.value);
    inp.addEventListener(k.type === 'text' || k.type === 'num' ? 'input' : 'change', () => {
      v[k.k] = read(); save();
      if (s.auto) { clearTimeout(T); T = setTimeout(showCur, k.type === 'text' || k.type === 'num' ? 450 : 60); }
    });
    box.appendChild(row);
  }
  const btns = el('div', 'ul-act');
  const go = el('button', 'ul-go', 'показать'); go.type = 'button'; go.addEventListener('click', showCur);
  const rs = el('button', '', 'по умолчанию'); rs.type = 'button'; rs.addEventListener('click', () => { ST.vals[s.id] = {}; save(); buildKnobs(s); if (s.auto) showCur(); });
  const cl = el('button', '', 'убрать'); cl.type = 'button'; cl.addEventListener('click', () => { const ui = UI(); if (ui) ui.reset(); });
  btns.append(go, rs, cl);
  box.appendChild(btns);
}
async function showCur () {
  const ui = UI();
  if (!ui || !ST.screen) return false;
  frame.focus();
  return ui.show(ST.screen, vals(ST.screen));
}

/* ── язык, версия, хад ── */
$('ul-lang').addEventListener('change', e => { ST.lang = e.target.value; save(); loadFrame(); });
$('ul-kids').checked = !!ST.kids;
$('ul-kids').addEventListener('change', e => { ST.kids = e.target.checked; save(); loadFrame(); });
$('ul-hud').checked = !!ST.hud;
$('ul-hud').addEventListener('change', e => { ST.hud = e.target.checked; save(); const ui = UI(); if (ui) ui.setHud(ST.hud); });

window.__uilab = {
  ready: READY,
  list: () => LIST,
  frame: () => frame.contentWindow,
  async show (id, v = {}) { await READY; ST.vals[id] = Object.assign({}, v); save(); pick(id, false); return showCur(); },
  size: k => setSize(k),
  async lang (l) { ST.lang = l; save(); $('ul-lang').value = l; loadFrame(); return READY; },
  async kids (on) { ST.kids = !!on; save(); $('ul-kids').checked = !!on; loadFrame(); return READY; },
  hud (on) { ST.hud = !!on; save(); $('ul-hud').checked = !!on; const ui = UI(); if (ui) ui.setHud(ST.hud); },
};

for (const b of $('ul-sizes').children) b.classList.toggle('on', b.dataset.k === ST.size);
fit();
loadFrame();
