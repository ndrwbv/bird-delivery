/* Радио в машине (М6, 09.10.2026). Правила словами — docs/CAREER.md «Радио в машине», имена файлов и
   промпты для Suno — docs/MUSIC.md «Радио».

   Поверх музыки (music.js): в смене (и «покататься») вместо дневной / ночной музыки игры играет станция.
   В меню, гараже и на чеке смены радио нет — там своя музыка. Налёт, погоня, ураган — напряжённая
   музыка игры важнее радио (если её файл есть), кончилось — снова станция.

     станции       — STATIONS: «Солнечный FM» (диско / поп), «Ретро-волна» (ВИА / эстрада), «Ночной эфир»
                     (синтвейв). Файлы — public/music/radio-<id>-1.mp3 … (music.js берёт слот «radio-<id>»);
                     у станции нет файлов — играет дневная / ночная музыка игры (запасной слот в music.js).
     кнопка        — F (клавиатура), крестовина ↓ (геймпад): следующая станция → … → «радио выкл» (тишина,
                     только мотор и город) → первая. Плашка станции — на PLATE с, маленькая, слева внизу.
     настройка     — «радио в машине: вкл / выкл» (dlv-radio; выкл — музыка игры, как без радио) и
                     «станция» (dlv-radio-st; ей же переключают с телефона, где нет клавиш).
     ведущий       — у каждой станции свой. Между песнями — реплика текстом на той же плашке: шутка про город,
                     реклама со щитов (billboards.js ADS) и своя, прогноз по погоде смены, пробки по ремонтам
                     (roadlife.js), привет курьеру, звонок в эфир Толика или героя. Не чаще раза в GAP[0] с:
                     на стыке песен, если прошло ≥ GAP[0] с; без стыка — всё равно через GAP[1] с. Занят эфир
                     (Толик пишет, диалог, катсцена, налёт, домофон, накладная) — ждёт. Взрослое — за ADULT.
                     Голоса пока нет — только текст.

   Из game.js:
     RADIO.init(api)   — { Store, S, ADULT, isPlaying, quiet(), weather(), season(), night(), works(), name(),
                          Snd, root() }
     RADIO.slot()      — для music.js: null — радио нет (музыка игры), 'off' — станция «выкл» (тишина),
                          'radio-<id>' — слот станции
     RADIO.onSong(slot, file) — music.js: началась новая песня (стык — время для ведущего)
     RADIO.next()      — кнопка: следующая станция
     RADIO.step(dt)    — кадр мира (CL.step): часы ведущего
     RADIO.clear()     — убрать плашку (конец смены, меню)
     RADIO.DEBUG       — __dlv.RADIO: state, STATS, say(kind), set(i), RAD */
import './radio.css';
import { t, N_, translit } from '../i18n/index.js';
import { ADS as BB_ADS } from './billboards.js';
import { HERO } from './heroes.js';                // HERO.STORY — сюжет героев в архиве (10.10.2026): их звонков нет

export const RAD = {
  HIDDEN: true,       // автор 10.10.2026: «Солнечный FM — скрой пока эту фичу»: радио нет совсем (ни станции, ни плашки, ни
                      // ведущего, ни строки в настройках, F / ↓ ничего не делают) — играет музыка игры. Вернуть — false
  PLATE: 2,           // с — плашка станции после переключения
  FIRST: [25, 40],    // с — первая реплика ведущего после начала езды
  GAP: [60, 90],      // с — между репликами: не раньше 60 с (на стыке песен); без стыка — через 60—90 с
  EDGE: 8,            // с — стык песен «свежий» столько после начала новой песни
  HOLD: 4, PER: 25, HOLD_MAX: 8,   // с — реплика висит 4 с + 1 с на 25 букв, не дольше 8 с
  RECENT: 14,         // столько последних реплик не повторяются
};

/* станции: id — имя слота в public/music (radio-<id>-1.mp3), fq — частота на плашке, host — ведущий */
export const STATIONS = [
  { id: 'disco', name: N_('Солнечный FM'), fq: '101.7', host: N_('Гена Позитив') },
  { id: 'retro', name: N_('Ретро-волна'), fq: '68.4', host: N_('Валентина Петровна') },
  { id: 'night', name: N_('Ночной эфир'), fq: '88.8', host: N_('Дюша Полночь') },
];

/* ═════════════ что говорит ведущий ═════════════
   st — только на этой станции; a — только во взрослой; {name} — имя курьера, {street} — улица ремонта */
const IDENT = [
  { st: 'disco', s: N_('Солнечный FM, сто один и семь! Ловимся только внутри периметра — снаружи всё равно никто не слушает.') },
  { st: 'disco', s: N_('С вами Гена Позитив! Солнце светит, пицца едет, я пою мимо нот. Танцуем!') },
  { st: 'disco', s: N_('Это был хит! У нас все хиты. Других пластинок на станции нет.') },
  { st: 'retro', s: N_('Дорогие радиослушатели! В эфире «Ретро-волна» — музыка вашей молодости и молодости нашего комбината.') },
  { st: 'retro', s: N_('По заявкам ветеранов комбината ставим эту песню в четырнадцатый раз. Они очень просили.') },
  { st: 'retro', s: N_('Валентина Петровна у микрофона. Если слышите шипение — это не помехи, это наш звукорежиссёр.') },
  { st: 'night', s: N_('Ночной эфир. Город спит, курьеры — нет. Эта песня — для тех, кто ещё в пути.') },
  { st: 'night', s: N_('Дюша Полночь с вами. Едете один по пустому проспекту? Помашите фонарю. Ему тоже одиноко.') },
  { st: 'night', s: N_('Тихо в Солнечном. Только лоси, доставка и вы.') },
];
const CITY = [
  { s: N_('Новости Солнечного: на проспекте опять положили новый асфальт. Под старый, чтобы никто не заметил.') },
  { s: N_('Мэрия напоминает: город у нас закрытый, а сердца открытые. Пропуск всё равно возьмите.') },
  { s: N_('Учёные комбината выяснили: если долго смотреть на реку, река начинает светиться. Не смотрите долго.') },
  { s: N_('В городе замечен лось. Лось просит не сигналить: он и так всё понимает.') },
  { s: N_('Бизнес-центр «Вот-вот» сообщает: сдача перенесена на «скоро». Следите за новостями.') },
  { s: N_('Опрос дня: кто быстрее — «Птица Пицца» или скорая? Скорая просила результаты не публиковать.') },
  { h: 1, s: N_('Новости спорта: Игорёк снова выиграл турнир по теннису. Соперником опять был он сам.') },
  { s: N_('Ремонт моста закончен! Шучу. Ремонт моста продолжается с 1987 года.') },
  { s: N_('Горячая линия Солнечного: потеряли кота — звоните. Нашли кота — тоже звоните, мы не знаем, что с ним делать.') },
  { a: 1, s: N_('Бабушки у второго подъезда передают: курьер на красной машине — хороший мальчик. Остальные — наркоманы.') },
  { a: 1, s: N_('Прогноз на утро: похмелье, местами стыд. К обеду прояснится.') },
  { a: 1, s: N_('Гена Позитив снова в эфире, хотя вчера клялся, что больше ни грамма. Ни грамма эфира, в смысле.') },
];
/* прогноз — по погоде смены (weather.js id); ночь — отдельно */
const WEATHER = {
  clear: [N_('Прогноз: ясно, без осадков. Пицца остынет только от вашей медлительности.'), N_('Над Солнечным солнечно. Редкий случай, когда название не врёт.')],
  heat: [N_('Жара! Асфальт плавится, мороженое тоже. Курьеры, пейте воду, а не только кофе.'), N_('Плюс тридцать в тени. В тени, правда, уже кто-то стоит — занято.')],
  golden: [N_('Золотая осень. Листья падают, цены нет. Аккуратнее — под листьями ямы.')],
  snowy: [N_('Снег! Коммунальщики уже вышли. Посмотрели. Ушли.'), N_('Сугробы по пояс. Сугроб с антенной — это машина соседа, не таранить.')],
  rain: [N_('Дождь до вечера. Лужи глубокие — проверено нашим звукорежиссёром.'), N_('Мокро. Тормозной путь сегодня длиннее очереди в поликлинику.')],
  storm: [N_('Гроза! Молнии бьют в высокое. Курьеры, вы не высокое — едем дальше.')],
  hurricane: [N_('Штормовое предупреждение: ураган. Крыши держите руками, пиццу — двумя.')],
};
const NIGHT = [N_('Ночью в Солнечном темно и тихо. Фары — не украшение, включайте.')];
const WORKS = [N_('Сводка с дорог: {street} — ремонт. Навигатор вас туда, конечно, всё равно отправит.'),
  N_('Пробки: {street}. Дорожники что-то копают, что — не знают даже они. Объезжайте.'),
  N_('{street}: закрыли полосу. Конусы стоят красиво, дорожники тоже.')];
const NO_WORKS = [N_('На дорогах Солнечного свободно. Подозрительно свободно. Где все?'), N_('Пробок нет. Если вы стоите — это не пробка, это вы.')];
const HELLO = [N_('Привет курьеру {name}! Палыч из пиццерии передаёт: вези быстрее, пицца не молодеет.'),
  N_('А этот трек — для {name}, который сейчас за рулём. Не отвлекайся на радио! Ну, разве что чуть-чуть.'),
  N_('Курьер {name}, вас просят подойти… ой, подъехать к пиццерии. Шучу. Работайте.'),
  N_('Привет всем курьерам «Птица Пицца». Особенно тому, кто только что проехал на красный. Да, тебе.'),
  N_('Привет всем, кто сейчас за рулём! Пристегнитесь — дальше будет хит.')];
/* реклама: рамка + щит (h — что, s — подпись); свои ролики радио — RADIO_ADS */
const AD_FRAME = [N_('Минутка рекламы. {h}. {s}.'), N_('Спонсор этого часа — {h}. {s}.'), N_('Реклама на нашей волне: {h}! {s}. Подробности — на щитах вдоль дорог.')];
const RADIO_ADS = [
  { h: N_('Птица Пицца'), s: N_('Пицца не приехала за 30 минут? Значит, курьер слушает наше радио') },
  { h: N_('Химчистка «Пятно»'), s: N_('Выводим всё. Кроме радиации') },
  { h: N_('Ателье «Иголка»'), s: N_('Подшиваем брюки, рукава и совесть') },
  { h: N_('Фото на пропуск'), s: N_('Улыбаться нельзя. Въезжать без пропуска — тоже') },
  { h: N_('Секция бокса «Сдача»'), s: N_('Сдачу даём всегда') },
  { h: N_('Гараж дяди Жени'), s: N_('Помнём, выправим, снова помнём. Постоянным — скидка') },
];
/* звонки в эфир: who — кто звонит */
const CALLS = [
  { who: N_('Толик'), s: N_('Алло, эфир? Это Толик. Мой курьер слушает вас вместо навигатора. Выключите ему музыку.') },
  { who: N_('Толик'), s: N_('Толик, «Птица Пицца». Передайте курьеру: опоздает — закажу песню за его счёт.') },
  { who: N_('Толик'), s: N_('Хочу заказать песню. Про то, как курьеры приезжают вовремя. Нет такой? Вот и я так думаю.') },
  { who: N_('Толик'), a: 1, s: N_('Курьер, бля, ты где? Я тебя по радио ищу, потому что телефон ты не берёшь.') },
  { who: N_('Толик'), a: 1, s: N_('Поставьте что-нибудь бодрое, а то мой курьер, сука, едет как на похороны.') },
  { who: N_('Лёха Арбуз'), h: 1, s: N_('Ставлю на то, что следующая песня — про любовь. Если нет — ставлю, что про лето.') },
  { who: N_('Жека'), h: 1, s: N_('Гараж дяди Жени на связи. Стучит мотор — заезжай. Не стучит — тоже заезжай, найдём.') },
  { who: N_('Игорёк'), h: 1, s: N_('Напечатал пиццу на 3D-принтере. Есть нельзя, но очень похоже.') },
  { who: N_('Настюша'), h: 1, s: N_('Привет девчонкам с танцев! И курьеру. Нет, не тому. Да, тебе.') },
  { who: N_('Ариша'), h: 1, s: N_('Мы с Лушей в эфире! Луша говорит «гав». Это значит: везите нам пиццу.') },
  { who: N_('Андрюша'), h: 1, s: N_('Я завайбкодил вам радио, оно иногда само ставит песни. Если играет тишина — это фича.') },
  { who: N_('Стёпа Тугарев'), a: 1, s: N_('Кальянная работает, бизнес идёт, болгарка в аренду. Всем мир, курьерам — дым бесплатно.') },
];
/* сколько весит каждая рубрика при выборе */
const KINDS = { ident: 2, city: 4, ad: 4, weather: 3, traffic: 3, hello: 2, call: 3 };

let A = null, EL = null, HIDE = 0;
const ST = { on: true, i: 0, act: false, since: 0, due: 75, edge: -99, tg: 0, recent: [], plate: null };
export const STATS = { lines: 0, kinds: {}, switches: 0, edges: 0, log: [] };

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const KEY_ON = 'dlv-radio', KEY_ST = 'dlv-radio-st';

export function init (api) {
  A = api;
  const S = A.Store;
  if (S) {
    ST.on = !RAD.HIDDEN && String(S.get(KEY_ON, '1')) !== '0';
    const i = +S.get(KEY_ST, 0);
    ST.i = Number.isFinite(i) && i >= -1 && i < STATIONS.length ? i : 0;
  }
}

/* ── настройки ── */
export const enabled = () => ST.on;
export function setEnabled (on) { if (RAD.HIDDEN) return; ST.on = !!on; if (A && A.Store) A.Store.set(KEY_ON, on ? '1' : '0'); if (!on) clear(); }
export const station = () => (ST.i >= 0 ? STATIONS[ST.i] : null);
export const stationName = () => (ST.i >= 0 ? t(STATIONS[ST.i].name) : t('радио выкл'));

/* ── для music.js ── */
const active = () => !!(A && ST.on && A.isPlaying && A.isPlaying());
export function slot () {
  if (!active()) return null;
  return ST.i < 0 ? 'off' : 'radio-' + STATIONS[ST.i].id;
}
export function onSong (sl) {
  if (!active() || ST.i < 0) return;
  ST.edge = ST.tg;
  STATS.edges++;
}

/* ── кнопка: следующая станция; после последней — «выкл» ── */
export function next () {
  if (!A || RAD.HIDDEN) return;
  if (!ST.on) { show(t('радио выключено в настройках'), '', t('настройки → звук'), RAD.PLATE + 1); return; }
  set(ST.i + 1 >= STATIONS.length ? -1 : ST.i + 1);
}
export function set (i) {
  ST.i = i >= -1 && i < STATIONS.length ? i : 0;
  if (A && A.Store) A.Store.set(KEY_ST, String(ST.i));
  STATS.switches++;
  // шорох эфира — перестройка
  try { if (A.Snd && A.Snd.noise) A.Snd.noise(0.18, 0.05); } catch (e) { /* — */ }
  const s = station();
  if (s) show(t(s.name), s.fq + ' FM', '', RAD.PLATE);
  else show(t('радио выкл'), '', '', RAD.PLATE);
}

/* ── ведущий ── */
export function step (dt) {
  if (!A) return;
  const on = active() && ST.i >= 0;
  if (on && !ST.act) { ST.since = Math.max(ST.since, RAD.GAP[0] - rand(RAD.FIRST[0], RAD.FIRST[1])); ST.due = rand(RAD.GAP[0], RAD.GAP[1]); }
  ST.act = on;
  if (!on) return;
  ST.tg += dt;
  ST.since += dt;
  if (ST.since < RAD.GAP[0]) return;
  const edge = ST.tg - ST.edge < RAD.EDGE;
  if (!edge && ST.since < ST.due) return;
  let busy = false;
  try { busy = !!(A.quiet && A.quiet()); } catch (e) { /* — */ }
  if (busy || HIDE) return;          // эфир занят или плашка ещё висит — попробуем в следующем кадре
  speak();
}

function pickKind () {
  let sum = 0;
  for (const k in KINDS) sum += KINDS[k];
  let r = Math.random() * sum;
  for (const k in KINDS) { r -= KINDS[k]; if (r <= 0) return k; }
  return 'city';
}
const fresh = list => {
  const ok = list.filter(x => !ST.recent.includes(x.s || x));
  return ok.length ? ok : list;
};
// h: 1 — герои города: в архиве, автор 10.10.2026 (сюжет героев убран, heroes.js HERO.STORY) — не звучат; Стёпа и Толик — да
const adultOk = x => (!x.a || (A && A.ADULT)) && (!x.h || HERO.STORY);

/** собрать реплику: { kind, who, text }; kind — рубрика (для проверок можно задать) */
export function line (kind = pickKind()) {
  const s = station() || STATIONS[0];
  let who = t(s.host), key = '', text = '';
  const call = (q, p) => { key = q; text = t(q, p); };
  if (kind === 'ident') {
    const q = fresh(IDENT.filter(x => x.st === s.id));
    call(pick(q).s);
  } else if (kind === 'city') {
    call(pick(fresh(CITY.filter(adultOk))).s);
  } else if (kind === 'ad') {
    const bb = (BB_ADS || []).filter(adultOk);
    const ad = pick(fresh(Math.random() < 0.5 && bb.length ? bb : RADIO_ADS));
    key = ad.s;
    text = t(pick(AD_FRAME), { h: t(ad.h), s: t(ad.s) }).replace(/([.!?])\./g, '$1');
  } else if (kind === 'weather') {
    let w = 'clear', night = false;
    try { w = (A.weather && A.weather()) || 'clear'; night = !!(A.night && A.night()); } catch (e) { /* — */ }
    const q = (night && Math.random() < 0.4 ? NIGHT : WEATHER[w] || WEATHER.clear).map(s => ({ s }));
    call(pick(fresh(q)).s);
  } else if (kind === 'traffic') {
    let works = [];
    try { works = (A.works && A.works()) || []; } catch (e) { /* — */ }
    if (works.length) call(pick(fresh(WORKS.map(s => ({ s })))).s, { street: translit(pick(works)) });
    else call(pick(fresh(NO_WORKS.map(s => ({ s })))).s);
  } else if (kind === 'hello') {
    let n = '';
    try { n = (A.name && A.name()) || ''; } catch (e) { /* — */ }
    // имени нет — только приветы без имени
    call(pick(fresh(HELLO.filter(s => n || !s.includes('{name}')).map(s => ({ s })))).s, { name: n });
  } else {
    kind = 'call';
    const c = pick(fresh(CALLS.filter(adultOk)));
    who = t(c.who) + ' · ' + t('звонок в эфир');
    call(c.s);
  }
  return { kind, who, text, key };
}

function speak (kind) {
  const L = line(kind);
  ST.recent.push(L.key); if (ST.recent.length > RAD.RECENT) ST.recent.shift();
  ST.since = 0; ST.due = rand(RAD.GAP[0], RAD.GAP[1]); ST.edge = -99;
  STATS.lines++;
  STATS.kinds[L.kind] = (STATS.kinds[L.kind] || 0) + 1;
  STATS.log.push(Math.round(ST.tg) + 'с ' + L.kind + ': ' + L.text.slice(0, 60));
  if (STATS.log.length > 20) STATS.log.shift();
  const s = station();
  show(s ? t(s.name) : '', s ? s.fq + ' FM' : '', L.who, Math.min(RAD.HOLD_MAX, RAD.HOLD + L.text.length / RAD.PER), L.text);
  return L;
}

/* ── плашка: «[101.7 FM] Солнечный FM» + кто говорит + текст ── */
function root () {
  if (EL && EL.isConnected) return EL;
  EL = document.createElement('div');
  EL.id = 'radio';
  EL.setAttribute('aria-live', 'polite');
  EL.innerHTML = '<div class="rd-h"><b class="rd-fq"></b><span class="rd-st"></span></div><div class="rd-who"></div><div class="rd-tx"></div>';
  ((A && A.root && A.root()) || document.body).appendChild(EL);
  return EL;
}
function show (st, fq, who, secs, text = '') {
  if (typeof document === 'undefined') return;
  const el = root();
  el.querySelector('.rd-fq').textContent = fq;
  el.querySelector('.rd-fq').hidden = !fq;
  el.querySelector('.rd-st').textContent = st;
  el.querySelector('.rd-who').textContent = who;
  el.querySelector('.rd-who').hidden = !who;
  el.querySelector('.rd-tx').textContent = text;
  el.querySelector('.rd-tx').hidden = !text;
  el.classList.toggle('talk', !!text);
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  ST.plate = { st, who, text, until: Date.now() + secs * 1000 };
  clearTimeout(HIDE);
  HIDE = setTimeout(() => { HIDE = 0; el.classList.remove('on'); ST.plate = null; }, secs * 1000);
}
export function clear () {
  clearTimeout(HIDE); HIDE = 0; ST.plate = null;
  if (EL) EL.classList.remove('on');
}

export const DEBUG = {
  RAD, STATS, STATIONS,
  get state () {
    return { on: ST.on, i: ST.i, station: station() ? station().id : 'off', slot: slot(), act: ST.act, since: +ST.since.toFixed(1),
      due: +ST.due.toFixed(1), tg: +ST.tg.toFixed(1), plate: ST.plate ? { st: ST.plate.st, who: ST.plate.who, text: ST.plate.text } : null };
  },
  next, set, line, say: kind => speak(kind), enable: setEnabled,
  /* все строки ведущего (проверка: сколько фраз, взрослые) */
  count: () => ({ ident: IDENT.length, city: CITY.length, weather: Object.values(WEATHER).flat().length + NIGHT.length, traffic: WORKS.length + NO_WORKS.length,
    hello: HELLO.length, ads: AD_FRAME.length + RADIO_ADS.length, calls: CALLS.length }),
};
