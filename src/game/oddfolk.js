/* ──────────────────────────────────────────────────────────────────────────
   Странные люди при вручении (автор 16.10.2026, трек «Встречи у двери» → «Материал автора 16.10»; тон — «No, I'm Not
   a Human»: короткие встречи, недосказанность). Правила словами — docs/ORDERS.md «Странные люди при вручении».

   1. Крик в квартиру (SHOUT): отдал пиццу — клиент иногда сначала орёт кому-то за спиной (мужу, детям, собаке, тёще,
      телевизору, соседу за стенкой) облачком над головой (сверху подпись «кричит в квартиру»), потом извиняется перед
      курьером вторым облачком. Шанс SHOUT.P на подходящее вручение (≈ 1 из 7). Окна нет, машину не держит.
      Взрослая — с матом (ADULT_SHOUT), детская — мягко (KIDS_SHOUT). Подряд один и тот же крик не бывает.
   2. Сценки у двери (SCENES) — окном разговора (dialog.js say, без таймеров, ждёт нажатия):
        kachok — качок и второй у него за спиной; в конце «На тебе Хабаровск» — +5 000 ₽ чаевых (только взрослая,
                 клиент — мужчина, один человек на адресе, вовремя);
        skin   — «Моя собственная кожа…» (и в детской);
        slysh  — незнакомец у подъезда: «Слышь.» «Слышь.» «Э.» «Купишь крэк?» «Брат.» — два ответа (только взрослая).
      Редко: шанс SCENE.P на подходящее вручение, не больше одной сценки за смену, та же сценка — не в эту и не в
      следующую смену (сохранение KEY), с 2-й смены игрока, режиссёр событий пускает ('odd' — лёгкое).
      Только в карьере, не на учебном и сюжетном заказе, не после разговора у двери (st.talk).
      После сценки клиент поручение не просит (orders.js delivered: st.odd) и клиентка не заигрывает.

   0. Жители Юга (locals.js, 17.10) — их заказ: окно разговора жителя (или его поручение), больше ничего.
   3. Клиенты автора у двери (regulars.js, 17.10) — до сценки: мэр, певица, лудоман, «папины дети»… Сценка и герой —
      не в одной смене; встреча у двери (сценка, герой, разговор у двери) — не на двух вручениях подряд (DOOR).

     ODD.init({ ADULT, Store, CAREER, shiftsDone() → законченных смен, pay(n, row, person) — чаевые в кошелёк и чек })
     ODD.onHand(st, onTime, o, api) — game.js при вручении (после handOver); api = { hold(on) } — держать вручение
       (следующий заказ не берётся, пока окно открыто). → 'scene' | 'shout' | '' (что выпало)
     ODD.DEBUG — __dlv.ODD: ST (счётчики; win — сколько окон сценок показано), force ('shout' | 'kachok' | 'skin' |
       'slysh' — следующее подходящее вручение — это), play(id) — сценку сейчас (без заказа; качок — с деньгами),
       shout(p) — крик над человеком p (без него — только тексты), hand(st, onTime, o) — вручение как из game.js,
       state — сохранение (какая сценка в какой смене), reset() — забыть
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import * as DIRECTOR from './director.js';
import * as TALK from './talk.js';             // облачка над головами (talk.js)
import * as REGS from './regulars.js';         // клиенты автора у двери: мэр, певица, лудоман, «папины дети» (regulars.js)
import * as LOCALS from './locals.js';         // жители Юга: заказ к его двери — окно разговора (locals.js)
import * as DCAST from './doorcast.js';        // кто говорит — виден в 3D: незнакомец подходит, второй из-за спины, собака, рот (doorcast.js)
import { makePerson } from './people.js';

export const SHOUT = { P: 0.15, SAY: 0.9, HOLD: 3.0, SORRY: 2.6, SORRY_HOLD: 2.8, COL: '#c0392b', SORRY_COL: '#3a6fb0' };
export const SCENE = { P: 0.15, FROM_SHIFT: 1, SAY: 0.6, HABAR: 5000, COL: '#7a4a2a' };
const KEY = 'dlv-odd';

/* крики в квартиру. sex: 'f' — кричит женщина (мужу), 'm' — мужчина (жене, тёще); нет — кто угодно */
const ADULT_SHOUT = /*i18n*/ [
  { s: N_('Да заткни ты свою пасть, скотина!') },
  { s: N_('Серёжа, блядь, я сказала — сиди в ванной, пока курьер не уйдёт!'), sex: 'f' },
  { s: N_('Выключи нахуй телевизор, там опять про забор!') },
  { s: N_('Мама, ну ёб твою мать, положи нож! Это не тебе пицца!') },
  { s: N_('Дети, сука, кто опять кота в морозилку положил?!') },
  { s: N_('Рекс, фу! Фу, блядь! Это не человек, это курьер!'), dog: true },   // собака — у ног, лает (doorcast.js)
  { s: N_('Тамара Петровна, ёбаный в рот, верните пульт!'), sex: 'm' },
  { s: N_('Ещё раз постучишь по батарее, сосед, — я тебе её в жопу засуну!') },
  { s: N_('Галя, не выходи! Тебя ищут!'), sex: 'm' },
  { s: N_('Валера, сожрёшь мой йогурт — тебе пиздец, понял?!'), sex: 'f' },
  { s: N_('Я тебе сказал: это не голоса, это холодильник! Ложись спать!'), sex: 'm' },
  { s: N_('Да не дыши ты так громко, блядь, человек пришёл!') },
];
const ADULT_SORRY = /*i18n*/ [
  N_('…Извини, сестра.'),
  N_('Извини, брат.'),
  N_('Пардон.'),
  N_('Не обращай внимания. У нас так всегда.'),
  N_('Это я не тебе. Сколько с меня?'),
  N_('Извини. Семья.'),
];
const KIDS_SHOUT = /*i18n*/ [
  { s: N_('Рекс, фу! Это не человек, это курьер!'), dog: true },
  { s: N_('Дети, кто опять кота в стиральную машину посадил?!') },
  { s: N_('Выключи телевизор, там опять про забор!') },
  { s: N_('Мама, это не тебе пицца! Положи вилку!') },
  { s: N_('Серёжа, сиди в ванной, пока курьер не уйдёт!'), sex: 'f' },
  { s: N_('Петя, слезь с люстры, у нас гости!') },
  { s: N_('Ещё раз постучишь по батарее — я тебе сам постучу!'), sex: 'm' },
  { s: N_('Я же сказала: это не голоса, это холодильник! Спать!'), sex: 'f' },
];
const KIDS_SORRY = /*i18n*/ [
  N_('Ой. Это я не тебе.'),
  N_('Пардон.'),
  N_('Извини. Семья.'),
  N_('Не обращай внимания.'),
  N_('Извините, пожалуйста.'),
];

/* внешность для портрета (people.js makeLook) — поверх лица клиента / прохожего */
const LOOK = {
  kachok: { hair: 'buzz', beard: 'none', brows: 'angry', shape: 'chubby', fat: true, head: 'none', glasses: 'none' },
  behind: { shape: 'thin', fat: false, brows: 'sad', hair: 'side', glasses: 'none', head: 'none' },
  skin:   { eyes: 'white', brows: 'raised', mouth: 'line', hair: 'bald', head: 'none', glasses: 'none' },
  slysh:  { age: 'young', head: 'hood', headC: '#2b2a30', eyes: 'narrow', beard: 'stubble', stubble: true, mouth: 'line', glasses: 'none' },
};
const dress = (person, k) => person && person.look
  ? Object.assign({}, person, { id: String(person.id || 'p') + '~odd-' + k, look: Object.assign({}, person.look, LOOK[k]) }) : person;
const stranger = k => dress(makePerson({ fem: false }), k);
const firstOf = p => (p && (p.first || String(p.name || '').split(/\s+/)[0])) || '';

let A = null;
const ST = { hands: 0, ok: 0, shouts: 0, scenes: 0, win: 0, by: {}, last: null, lastShout: '', lastSorry: '', paid: 0 };
const LAST = { s: -1, r: -1 };
let force = '';

export function init (api) { A = api; REGS.init(api); }

function load () {
  let v = null;
  try { v = A && A.Store ? A.Store.get(KEY, null) : null; } catch (e) { v = null; }
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return v && typeof v === 'object' ? v : { seen: {}, shift: -1 };
}
function save (v) { try { if (A && A.Store) A.Store.set(KEY, v); } catch (e) { /* без сохранения — не страшно */ } }
let SIM = 0;                                   // probe: номер смены для замера частоты (DEBUG.sim)
const shiftNo = () => SIM || (A && A.shiftsDone ? +A.shiftsDone() || 0 : 0) + 1;   // номер идущей смены (1 — первая)
let DOOR = -99, dry = false;                   // DOOR — на каком вручении (ST.hands) была встреча у двери: сценка, герой, разговор

function bubble (grp, text, col, y, hold, name) {
  const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: TALK.tex(text, col, name || ''), transparent: true, depthWrite: false }));
  b.position.set(0, y, 0);
  grp.add(b);
  TALK.track(b, 1);                                // у двери — важное, без очереди фоновых (talk.js)
  setTimeout(() => { if (b.parent) b.parent.remove(b); b.material.dispose(); }, hold * 1000);
  return b;
}
const pickNew = (pool, key) => {
  let k = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && k === LAST[key]) k = (k + 1) % pool.length;
  LAST[key] = k;
  return pool[k];
};

/* ── 1. крик в квартиру ── */
function shoutPool (fem) {
  const L = A && A.ADULT ? ADULT_SHOUT : KIDS_SHOUT;
  return L.filter(q => !q.sex || (q.sex === 'f') === !!fem);
}
/* текст крика и извинения (без показа) */
function shoutLines (fem, dog) {
  const pool = dog ? shoutPool(fem).filter(q => q.dog) : shoutPool(fem);
  const q = pool[(() => { let k = Math.floor(Math.random() * pool.length); if (pool.length > 1 && pool[k].s === ST.lastShout) k = (k + 1) % pool.length; return k; })()];
  ST.lastShout = q.s;
  const sorry = pickNew(A && A.ADULT ? ADULT_SORRY : KIDS_SORRY, 'r');
  ST.lastSorry = sorry;
  return { shout: t(q.s), sorry: t(sorry), dog: !!q.dog };
}
function shout (p, dog) {
  const L = shoutLines(!!(p.grp && p.grp.userData && p.grp.userData.fem), dog);
  ST.shouts++;
  ST.last = { kind: 'shout', shout: L.shout, sorry: L.sorry };
  // «Рекс, фу!» — собака тут же, у ног: выскочила из двери и лает на курьера, на крик — убегает домой (doorcast.js)
  const pup = L.dog && !dry ? DCAST.dog(p, { barks: 2, sec: SHOUT.SAY + SHOUT.SORRY + 0.4 }) : null;
  if (pup) ST.dogs = (ST.dogs || 0) + 1;
  // кричит — говорит ртом (doorcast.js), облачко над головой
  const mouth = (on, sec) => { const a = on ? DCAST.client(p, { nofocus: true }) : null; if (a) { DCAST.talk(a, true, on); setTimeout(() => { DCAST.talk(a, false); DCAST.leave(a); }, sec * 1000); } };
  setTimeout(() => {
    if (p.dead || !p.grp || !p.grp.parent) return;
    bubble(p.grp, L.shout, SHOUT.COL, 2.9, SHOUT.HOLD, L.dog ? t('кричит на собаку') : t('кричит в квартиру'));
    mouth('angry', 1.6);
    setTimeout(() => {
      if (p.dead || !p.grp || !p.grp.parent) return;
      bubble(p.grp, L.sorry, SHOUT.SORRY_COL, 2.9, SHOUT.SORRY_HOLD);
      mouth('ok', 1.1);
    }, SHOUT.SORRY * 1000);
  }, SHOUT.SAY * 1000);
  return L;
}

/* ── 2. сценки ── */
/* какие сценки можно на этом вручении */
function sceneOk (id, st, onTime) {
  const p = st && st.peds && st.peds[0];
  const male = !!(p && p.grp && p.grp.userData && !p.grp.userData.fem);
  if (id === 'kachok') return !!(A.ADULT && onTime && male && st.peds.length === 1 && st.persons && st.persons[0]);
  if (id === 'skin') return !!(st.peds.length === 1 && st.persons && st.persons[0]);
  if (id === 'slysh') return !!A.ADULT;
  return false;
}
const IDS = ['kachok', 'skin', 'slysh'];
function pickScene (st, onTime) {
  const sv = load(), n = shiftNo(), seen = {};
  // прогресс сбросили (смен стало меньше, чем в сохранении) — старые отметки не держат сценки
  for (const k in (sv.seen || {})) seen[k] = sv.seen[k] > n ? 0 : sv.seen[k];
  const ok = IDS.filter(id => sceneOk(id, st, onTime) && !(seen[id] >= n - 1));
  if (!ok.length) return '';
  ok.sort((a, b) => (seen[a] || 0) - (seen[b] || 0));
  const old = ok.filter(id => (seen[id] || 0) === (seen[ok[0]] || 0));   // давнее всех — из них случайно
  return old[Math.floor(Math.random() * old.length)];
}
function sceneRoll (st, onTime, o) {
  if (!A || !A.CAREER || !o || !o.ord) return '';
  if (force && IDS.includes(force)) { const f = force; if (!sceneOk(f, st, onTime)) return ''; force = ''; return f; }
  if (shiftNo() <= SCENE.FROM_SHIFT) return '';                     // первая смена новичка — без сценок
  const sv = load();
  if (sv.shift === shiftNo()) return '';                             // за смену — одна
  if (REGS.shiftHad(shiftNo())) return '';                           // в смене уже был клиент автора (regulars.js)
  if (ST.hands - DOOR < REGS.REG.GAP) return '';                     // встреча у двери — не на двух вручениях подряд
  if (Math.random() >= SCENE.P) return '';
  const id = pickScene(st, onTime);
  if (!id || !DIRECTOR.can('odd')) return '';
  return id;
}
function mark (id) {
  const sv = load(), n = shiftNo();
  sv.seen = sv.seen || {}; sv.seen[id] = n; sv.shift = n;
  save(sv);
}

/* окна сценки по очереди; null — закрыли снаружи (смена кончилась) — дальше не идём. s.who — кто говорит в мире (doorcast.js) */
async function chain (steps) {
  let r;
  for (const s of steps) {
    ST.win++;
    r = await DCAST.say(s.who || null, Object.assign({ head: t('у двери'), color: SCENE.COL, fillers: false }, s));
    if (r === null) return null;
  }
  return r;
}

/* PLAY[id](person, ped, pre): person — клиент из накладной, ped — он в мире (нет — сценка без мира, песочница),
   pre — клиент уже переодет под роль (playScene: rehuman при вручении, до того как долетела коробка) */
const PLAY = {
  /* качок: «ты такой слабый…», второй из-за спины, «на тебе Хабаровск» — +5 000 ₽ */
  async kachok (person, ped, pre) {
    const k = pre || dress(person || makePerson({ fem: false }), 'kachok'), name = firstOf(person) || t('качок');
    const back = stranger('behind');
    const me = DCAST.client(ped);
    let two = null;                                                    // второй выходит из-за спины на своей реплике
    const r = await chain([
      { who: me, person: k, name, emo: 'angry', mood: 'calm',
        text: t('Ты такой слабый. Просто дрищуган. Я бы тебя сложил и затолкал бы этому долбаёбу в жопу.'), accept: t('… промолчать') },
      { get who () { return two || (two = ped ? DCAST.extra(back, ped, 0, 1, { back: true }) : null); },
        person: back, name: t('из-за спины'), emo: 'scared', mood: 'nervous',
        text: t('Эээ, братан, не надо… оно болит ещё с того раза…'), accept: t('дальше') },
      { who: me, person: k, name, emo: 'ok', mood: 'calm',
        text: t('Тише, тише… На тебе Хабаровск. Больше не приезжай сюда.'), accept: t('взять'),
        pay: '+' + (A && A.money ? A.money(SCENE.HABAR) : SCENE.HABAR + ' ₽'), payLabel: t('чаевые') },
    ]);
    DCAST.leave(two); DCAST.leave(me);
    if (r === null) return { paid: 0 };
    const paid = A && A.pay ? A.pay(SCENE.HABAR, t('Хабаровск от качка'), k) : 0;
    ST.paid += paid || 0;
    return { paid };
  },
  /* кожа: монолог и два ответа (итога деньгами нет) */
  async skin (person, ped, pre) {
    const fem = !!(person && person.f);
    const s = pre || dress(person || makePerson({}), 'skin');
    const me = DCAST.client(ped);
    ST.win++;
    const r = await DCAST.say(me, { head: t('у двери'), color: SCENE.COL, fillers: false, person: s, name: firstOf(person) || t('клиент'), emo: 'sad', mood: 'calm', stack: true,
      text: fem ? t('Моя собственная кожа… она отказалась от меня. Предательство, которого я никогда не ждала. Собственный кожаный чехол выталкивает меня наружу.')
        : t('Моя собственная кожа… она отказалась от меня. Предательство, которого я никогда не ждал. Собственный кожаный чехол выталкивает меня наружу.'),
      accept: t('Сочувствую'), decline: t('Приятного аппетита') });
    DCAST.leave(me);
    return { ans: r === true ? 0 : r === false ? 1 : null };
  },
  /* «слышь»: незнакомец в капюшоне подходит к машине (руки в карманах), встаёт рядом лицом к курьеру — «Слышь.» «Слышь.» «Э.»
     «Купишь крэк?» «Брат.» — два ответа; ответил — уходит дальше по тротуару (doorcast.js) */
  async slysh (person, ped, pre, man) {
    const p = (man && man.person) || stranger('slysh'), name = t('незнакомец');
    const who = man || (ped !== undefined ? DCAST.stranger(p, ped) : null);
    if (who && who.ready) await who.ready;                             // дошёл — заговорил
    const beats = [N_('Слышь.'), N_('Слышь.'), N_('Э.'), N_('Купишь крэк?')];
    for (const b of beats) {
      ST.win++;
      const r = await DCAST.say(who, { head: t('у подъезда'), color: SCENE.COL, fillers: false, person: p, name, emo: 'ok', text: t(b), accept: t('… промолчать') });
      if (r === null) { DCAST.leave(who); return { ans: null }; }
    }
    ST.win++;
    const r = await DCAST.say(who, { head: t('у подъезда'), color: SCENE.COL, fillers: false, person: p, name, emo: 'ok', stack: true,
      text: t('Брат.'), accept: t('Ты ебнутый? Нет, конечно'), decline: t('Сори, брат, занят') });
    DCAST.leave(who);
    return { ans: r === true ? 0 : r === false ? 1 : null };
  },
};

function playScene (id, st, api) {
  ST.scenes++;
  ST.by[id] = (ST.by[id] || 0) + 1;
  ST.last = { kind: 'scene', id, res: null };
  mark(id);
  if (dry) return;
  DIRECTOR.start('odd', 30);
  const person = st && st.persons ? st.persons[0] : null;
  const ped = st && st.peds && st.peds[0];
  const hold = on => { try { if (api && api.hold) api.hold(on); } catch (e) { /* — */ } };
  // клиент в мире — тот, чьё лицо в окне: качок / «кожа» переодеты сразу, пока коробка ещё летит (держать её будет новое тело)
  let pre = null;
  if ((id === 'kachok' || id === 'skin') && person && ped && !ped.dead && A.rehuman) {
    try { pre = dress(person, id); A.rehuman(ped, pre); if (st.persons) st.persons[0] = ped.person || pre; } catch (e) { console.warn('[odd] rehuman', e); pre = null; }
  }
  // «слышь»: незнакомец выходит сразу — пока коробка летит, он уже идёт к машине
  const man = id === 'slysh' ? DCAST.stranger(stranger('slysh'), ped || null) : null;
  if (man) man.person = man.grp && man.grp.userData && man.grp.userData.person;
  setTimeout(() => {
    if (id !== 'slysh' && ped && (ped.dead || !ped.grp || !ped.grp.parent)) { DIRECTOR.end('odd'); return; }
    hold(true);
    PLAY[id](person, ped || null, pre, man).then(res => { ST.last.res = res; }, () => {}).finally(() => { hold(false); DIRECTOR.end('odd'); });
  }, SCENE.SAY * 1000);
}

/* вручение (game.js, после handOver): сценка, крик или ничего */
export function onHand (st, onTime, o, api) {
  if (!A || !st) return '';
  ST.hands++;
  const p = st.peds && st.peds[0];
  if (st.talk) DOOR = ST.hands;                                       // разговор у двери — тоже встреча
  if (!p || p.dead || p.surf || !p.grp || st.talk || st.bumped) return '';
  if (o && (o.tut || (st.pay && st.pay.story))) return '';
  ST.ok++;
  ST.hand = { fem: !!(p.grp.userData && p.grp.userData.fem), onTime: !!onTime, n: st.peds.length, ord: !!(o && o.ord), shift: shiftNo() };
  // житель Юга (locals.js): заказ к его двери — его окно разговора; его поручение — просит orders.js. Больше ничего на вручении
  const lc = LOCALS.hand(st, onTime, o, api, A);
  if (lc) { DOOR = ST.hands; st.odd = 'local'; return 'scene'; }
  const reg = REGS.roll(st, onTime, o, { shift: shiftNo(), gapOk: ST.hands - DOOR >= REGS.REG.GAP,   // клиент автора (regulars.js)
    sceneShift: load().shift === shiftNo(), dirOk: () => DIRECTOR.can('odd') });
  if (reg) { DOOR = ST.hands; st.odd = 'reg'; ST.regs = (ST.regs || 0) + 1; REGS.play(reg, st, api); return 'scene'; }
  const id = sceneRoll(st, onTime, o);
  if (id) DOOR = ST.hands;
  if (id) { st.odd = id; playScene(id, st, api); return 'scene'; }
  if (force === 'shout' || force === 'shout-dog' || Math.random() < SHOUT.P) { const fd = force === 'shout-dog'; if (force === 'shout' || fd) force = ''; st.odd = 'shout'; shout(p, fd); return 'shout'; }
  return '';
}

/* для probe: __dlv.ODD */
export const DEBUG = {
  SHOUT, SCENE, ST, ADULT_SHOUT, ADULT_SORRY, KIDS_SHOUT, KIDS_SORRY,
  REG: REGS.DEBUG,                               // клиенты автора у двери (regulars.js): __dlv.ODD.REG
  set force (v) { force = String(v || ''); }, get force () { return force; },
  get state () { return load(); },
  reset () { save({ seen: {}, shift: -1 }); DOOR = -99; },
  set dry (v) { dry = !!v; REGS.DEBUG.dry = !!v; }, get dry () { return dry; },
  /* замер частоты без окон: shifts смен по perShift вручений (клиент — мужчина / женщина поровну, вовремя, один);
     → по сменам: что было на каждом вручении ('s' сценка, 'r' герой, 'c' крик, '.' ничего) */
  sim (shifts = 20, perShift = 7, from = 1) {
    const was = dry; this.dry = true;
    const rows = [], tot = { scene: 0, reg: 0, shout: 0, consec: 0, sameHero: 0 }, heroAt = {};
    try {
      for (let n = from; n < from + shifts; n++) {
        SIM = n; let row = '', prev = false;
        for (let k = 0; k < perShift; k++) {
          const fem = Math.random() < 0.5, person = makePerson({ fem });
          const st = { peds: [{ grp: { userData: { fem }, parent: {} } }], persons: [person], pay: {} };
          const r = onHand(st, true, { ord: {} }, null);
          DIRECTOR.delivered();
          const door = r === 'scene';
          if (door && prev) tot.consec++;
          prev = door;
          if (st.odd === 'reg') { tot.reg++; row += 'r'; const id = REGS.DEBUG.ST.last && REGS.DEBUG.ST.last.id; if (heroAt[id] && n - heroAt[id] < REGS.REG.EVERY) tot.sameHero++; heroAt[id] = n; }
          else if (r === 'scene') { tot.scene++; row += 's'; } else if (r === 'shout') { tot.shout++; row += 'c'; } else row += '.';
        }
        rows.push(n + ' ' + row);
      }
    } finally { SIM = 0; this.dry = was; }
    return { rows, tot };
  },
  /* сценку сейчас, без заказа: person — клиент (нет — случайный) */
  play (id, person, ped) { if (!PLAY[id]) return null; ST.last = { kind: 'scene', id, res: null }; ST.by[id] = (ST.by[id] || 0) + 1;
    const man = id === 'slysh' && ped !== undefined ? DCAST.stranger(stranger('slysh'), ped) : null;
    if (man) man.person = man.grp && man.grp.userData && man.grp.userData.person;
    let pre = null;                                // ped — клиент в мире: качок / «кожа» переодеваются, как при вручении
    if ((id === 'kachok' || id === 'skin') && ped && !ped.dead && A && A.rehuman) { pre = dress(person || ped.person, id); A.rehuman(ped, pre); }
    return PLAY[id](person || (ped && ped.person), ped, pre, man || undefined).then(res => (ST.last.res = res)); },
  /* крик над человеком p (прохожий / клиент с grp); без него — только тексты */
  shout (p, fem, dog) { return p && p.grp ? shout(p, dog) : shoutLines(!!fem, dog); },   // dog — «Рекс, фу!» (собака у ног)
  /* вручение как из game.js (st — { peds, persons, pay }, o — { ord }) → 'scene' | 'shout' | '' */
  hand: (st, onTime, o, api) => onHand(st, onTime, o, api),
};
