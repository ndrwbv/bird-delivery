/* ──────────────────────────────────────────────────────────────────────────
   Доставка — Москва (lab/delivery/?map=moscow).

   Вторая карта той же игры: вместо выдуманной сетки — настоящий район
   вокруг Омега-Плазы на Ленинской Слободе, 19, где и стоит пиццерия.
   Улицы, дома с адресами, подъезды, деревья, лавочки, остановки,
   светофоры, переходы и Москва-река взяты из OpenStreetMap, рельеф — из
   SRTM (moscow-city.js, собирает scripts/osm_moscow.py).

   Движок — из заготовки lab/tomsk (город из карты, рельеф, мост, нитро),
   а он, в свою очередь, из основной «Доставки». Своё у Москвы: трафик
   едет по полосам с учётом одностороннего движения и поворачивает
   дугой, на перекрёстках светофоры с фазами, на улицах разметка и зебры,
   пешеходы ходят по тротуарам и переходят только по зебре, по городу
   гоняют таксисты и самокатчики, машины разных моделей, а радар по
   клику раскрывается в полную карту района.
   ────────────────────────────────────────────────────────────────────────── */

import * as THREE from '../vendor/three.module.min.js';
import { MAP } from './map.js';
import { MAP_IDS, MAP_META } from '../maps/index.js';
import Platform from '../platform/index.js';
import { t as $t, tn as $tn, N_, translit, lang as curLang, LANGS, LANG_NAMES } from '../i18n/index.js';
import { sanitizePois, OWN } from './brands.js';
import { makePerson, createHumanFactory, faceDataURL } from './people.js';
import { pollPad, applyToIN, rumble, pad as PAD } from '../input/gamepad.js';
import { makePadMenu } from '../input/padmenu.js';
import { fixMap, profileFn } from './mapcheck.js';
import * as MAPW from './mapworks.js';
import * as CBITS from './citybits.js';
import * as SEAS from './seasons.js';
import * as TREES from './trees.js';
import * as WTH from './weather.js';
import * as HUR from './hurricane.js';            // ураган: дом проваливается в шейдере статики (holeMat), забор и кран на месте (hurricane.js)
import * as LIFE from './life.js';               // парочки, богачи, графитисты, змеи и дроны в парках
import * as BUSES from './buses.js';             // автобусы: маршруты, остановки, двери, бегущий к автобусу (buses.js)
import * as WORLD from './world.js';
import * as SL from './streetlamps.js';
import * as WINS from './windows.js';          // окна: рамы, свет, комната за стеклом (windows.js)
import * as PAINT from './citypaint.js';         // дома в цвет по номеру, муралы на торцах (citypaint.js)
import * as BB from './billboards.js';            // щиты со смешной рекламой у больших дорог (billboards.js)
import * as CONSTR from './construction.js';     // стройки на пустырях: шиферный забор, кран, техника, «паспорт объекта», самосвалы (construction.js)
import * as RIVS from './rivals.js';             // точки «Вселенной суши» и «Королевы Бургеров», маскоты, их курьеры (rivals.js)
import * as CSH from './carshadow.js';           // пятно-тень под машиной игрока (carshadow.js)
import * as CARL from './carlights.js';         // огни машины игрока: стоп-сигналы, поворотники, задний ход (carlights.js)         // фонари: все сбиваются, шары и консоли, частный сектор (streetlamps.js)
import * as JUNK from './junk.js';              // остановки ломаются, мусор у подъездов, контейнеры (junk.js)             // плитка, аллеи; в карьере — мусор, бандиты, особняки, шашлыки
import * as DIRECTOR from './director.js';       // режиссёр событий: сессия начинается спокойно, события по нарастающей (director.js)
import * as RAID from './raid.js';               // налёт конкурентов на твою точку и ёлка-турель (raid.js)
import * as MAFIA from './mafia.js';             // мафиози у адреса: предупреждает, потом стреляет (детская — кидается помидорами)
import * as THUGS from './thugs.js';             // гопники прессуют прохожего в бандитских кругах — помог, респект (thugs.js)
import * as PROT from './protests.js';         // жизнь города: протест по ступеням, марши, драки, концерты во дворах (protests.js)
import * as GROW from './growth.js';             // пиццерия растёт: ступени 1—5 по доставкам в районе, вид у шара (growth.js)
import * as HEROES from './heroes.js';           // герои города: Лёха, Жека, Игорёк, Стёпа, Настюша, Ариша, Андрюша — места и реплики
import * as HB from './horsebox.js';             // коневозки в потоке: прицеп за машиной, конь в окне (horsebox.js)
import * as FLIRT from './flirt.js';            // взрослая: клиентка изредка заигрывает при вручении, курьер отказывает (flirt.js)
import * as YARDS from './yards.js';             // дворы многоэтажек: лавочки у подъездов, тропинки, низкие заборчики (yards.js)
import * as FAUNA from './fauna.js';             // лоси, лисы и зайцы в лесах; «лось на дороге!» (fauna.js)
import * as CATS from './cats.js';               // продухи подвалов и коты на крышах и во дворах (cats.js)
import * as WASTE from './wastelands.js';      // у пустырей назначение (огороды, битые машины, плиты, коробки, собаки, ларьки), тропинки и лужи (wastelands.js)
import * as DARKN from './darknight.js';       // тёмная ночь 23—5: костры дикарей-бургеров, ведьмы с котлами, привидения (darknight.js)
import * as NIGHT from './nightlife.js';         // взрослая: девушки у обочины ночью, стрип-клуб «Клубничка» (nightlife.js)
import * as RL from './roadlife.js';
import * as PZ from './pizzeria.js';
import * as PZD from './pizzadome.js';          // пиццерия-шар: отдельное здание у улицы рядом с прежней точкой (pizzadome.js)
import * as PAVE from './pave.js';             // где ходят люди: тротуары, пешеходки, дорожки — туда заборчики и конструкции не ставим (pave.js)
import * as LAWNP from './lawnprops.js';      // мелочь на газоне рядом с камерой: трава, заросли, покрышки, выбивалки, ракушки, мусор (lawnprops.js)
import * as FOREST from './forest.js';         // ельник в больших лесах: ели и сосны инстансами, опушка, снег зимой (forest.js)
import * as LWOOD from './leninwood.js';        // лес вдоль улицы Ленина: полоса ельника с полянами и проезжими тропами (leninwood.js)
import * as LM from './landmarks.js';            // заправки и каток
import * as ECON from './econ.js';               // карьера: все числа и формулы (docs/CAREER.md)
import * as DLG from './dialog.js';              // диалог с головой и печатающимся текстом
import * as ZN from './zones.js';                // районы города для заказов и событий
import * as DIST from './districts.js';          // карьера: 8 районов со своими пиццериями, волны щедрости
import * as CITYOPEN from './cityopen.js';      // карьера: все районы открыты — праздник, выбор перед сменой, «весь город»
import * as ORD from './orders.js';
import * as DOOR from './doorstep.js';            // мини-игры у клиента: домофон у подъезда (doorstep.js, minigames/intercom.js; docs/ORDERS.md)              // карьера: очередь заказов, поручения, развоз смены, оплата (docs/ORDERS.md)
import * as CAREERM from './career.js';          // карьера: смена 9—24, обед, итоги, донаты, слот, звёзды
import * as STORY from './story.js';             // сюжетные заказы и катсцены (баба Зина)
import * as HSTORY from './herostories.js';      // герои города, этап 3: истории Стёпы, Ариши, Лёхи по главам (через story.js)
import * as HEROQ from './heroquests.js';      // прогноз Игорька и удача Лёхи — у профиля свои (reprofile)
import * as STEPAB from './stepabench.js';     // Стёпа на лавочке у Ленинградской, 8 сам заказывает пиццу (через story.js)
import * as WORK from './workout.js';         // площадки-качалки у коробок: турник и брусья, люди качаются, курьер подтягивается сам (workout.js)
import * as KITES from './kites.js';          // воздушные змеи и дроны в парках и на Ленина (kites.js)
import * as AUTO from './cars.js';               // карьера: 14 машин, мотор и ресурс, заглохла, ямы, гараж Дяди Жени
import * as FEST from './festivals.js';          // фестивали на парковках ТЦ: кальянщики, тыква, День угнетения бургеров (festivals.js)
import * as HK from './hookah.js';               // кальянщики на лавочках (в детской — самовар)
import * as CULL from './cull.js';
import * as UPD from './update.js';              // обновление из меню: плашка «есть новая версия», настройки → версия (update.js)
import * as SET from './settings.js';           // настройки — карусель карточек, одна и та же из меню и из паузы (settings.js)
import * as PAUSE from './pausecz.js';             // пауза — карусель карточек: продолжить, чек, накладная, карта, настройки, управление, закончить смену
import * as PIX from './pixfx.js';              // пиксельные частицы одним мешем: дымок из-под колёс, осколки стёкол (pixfx.js)
import * as CG from './carglass.js';            // стёкла своей машины: курьер внутри, трещины и осколки (carglass.js)
import * as SFX from './sfx.js';                // звуки из файлов public/sfx вместо синтеза, звук в пространстве (sfx.js, docs/SOUNDS.md)
import * as IMPACT from './impact.js';         // удары слоями: тело по материалу, металл, стекло, обломки, скрежет бортом (impact.js, docs/SOUNDS.md)
import * as MUS from './music.js';               // музыка из public/music: меню, день, ночь, напряжённо, чек смены (music.js, docs/MUSIC.md)
import * as AMBI from './ambience.js';           // город шумит: фоновые петли и редкие звуки по месту и времени (ambience.js, docs/SOUNDS.md)
import * as MOTOR from './motor.js';            // мотор из записей: 4 петли по оборотам, коробка, отсечка, визг шин, нитро, гул потока (motor.js, docs/SOUNDS.md)
import * as EXH from './exhaust.js';            // дым из выхлопа по мотору, чихи перед поломкой, коптящие старые седаны (exhaust.js)
import * as WIPE from './wipers.js';            // дворники своей машины в дождь и снегопад (wipers.js)
import * as REARM from './carrear.js';          // зад своей машины подробно: труба, фонари в нише, номер, багажник внутри (carrear.js)
import * as DIRT from './cardirt.js';           // грязь и снег на своей машине по погоде и сезону (cardirt.js)
import * as BODYM from './carbody.js';             // кузов не из кубиков: скосы, арки, швы, ручки, номера, диски (carbody.js)
import * as DENTM from './cardent.js';             // своя машина мнётся формой и теряет бампер, крышку, зеркала, колпаки (cardent.js)
import * as GFX from './gfx.js';                 // настройки графики: пресеты, 30 к/с, дальность, город за меню (gfx.js, docs/CAREER.md)               // статика дальше камеры — со сцены, матрицы заморожены (Steam Deck)
import * as TRK from './tracks.js';              // следы колёс на газоне и снегу
import * as CHAT from './chat.js';             // «Толик управляющий» пишет справа сверху, как в iMessage (похвала, ругань, вычет за опоздание)
import * as PG from './piggy.js';                // карьера: копилка-свинья на хаде — кошелёк, куда в конце смены падает пачка (piggy.js)
import * as SC from './shiftcash.js';             // карьера: пачка купюр на хаде — заработок смены (shiftcash.js)
import * as RESPECT from './respect.js';         // респект: уважение на районе, копится через смены (respect.js)
import * as CREWS from './crews.js';             // компании в форме сетей: курят или бьют конкурентов (crews.js)
import * as HITS from './hits.js';               // сила удара по людям: упал и встал / лежит в луже / разорвало; самокат отдельно
import * as HINTS from './hints.js';             // подсказки первой смены одной строкой внизу, без пауз (hints.js)
import * as RQ from './ridequeue.js';           // очередь того, что всплывает в езде: чек → деньги → Толик → подсказка → достижение (ridequeue.js)
import { keyHTML, matchKey, setInput as glyphInput, inputKind } from '../input/glyphs.js';   // значки кнопок по вводу: [A] / Enter (glyphs.js)
import * as COLM from './collect.js';            // «мои находки» — лист накладной в окне меню
import * as FIRST from './intro.js';             // вступление первого запуска: пиццерия, Степан, машина (катсцена «как в ГТА»)
import * as ACH from './achievements.js';          // достижения Стима: таблица, счётчики, вызов моста (achievements.js, docs/STEAM.md)
import * as BOARD from './board.js';               // таблица рекордов «лучшая смена» в Стим-сборке (board.js, docs/STEAM.md §4.2)
import * as PROF from './profiles.js';           // профили: прогресс каждого под своими ключами, сброс — только текущего (profiles.js)
import * as QR from './quickrun.js';               // быстрый заезд из меню: сезон, длина, машина; сохранение карьеры не трогает (quickrun.js)
import * as CL from '../platform/crashlog.js';   // журнал ошибок, предохранитель шагов мира, сторож зависаний (docs/CRASHES.md)
import * as RELIEF from './relief.js';          // неровный газон: бугры и холмики на газонах и пустырях (relief.js)
import * as OSKM from './osk.js';                // экранная клавиатура Стима в полях ввода: поднять, гасить автоповтор, геймпад — не игре (osk.js)
import * as RW from './roadwear.js';            // асфальт разный: свежий, ровный, в заплатках, старый, разбитый (roadwear.js)
import * as LAWN from './lawn.js';              // пятна на газоне — в краске земли (lawn.js)
import * as DEADENDS from './deadends.js';       // тупики потока: разворот вместо исчезновения (deadends.js)
import * as NAR from './narrow.js';            // узкие дороги: одна полоса посередине, встречные прижимаются (narrow.js)
import * as EDL from './editlayer.js';         // правки города из редактора (editor.html): убранное не ставим, добавленное — кусок 'edits' (editlayer.js)
import * as LATE from './latebuild.js';         // поздняя сборка города: меню раньше, остальное — очередью после него (latebuild.js)
import * as STREAMS from './streams.js';        // речки и пруды: русло, вода тем же шейдером, вброд и утонуть (streams.js)
import * as WATER from './water.js';            // вода: волны, отражения неба и берега, блик, пена, круги от дождя (water.js)
import * as ICEM from './ice.js';              // лёд зимой: на Томь и пруды можно выехать, но лёд трещит и проваливается (ice.js)
import * as BEACH from './beach.js';            // пляж на Томи: насыпь, песок, зонтики, люди, ларёк, машина вязнет, заказы на пляж (beach.js)
import * as TALK from './talk.js';
import * as PKINST from './pickinst.js';          // подбираемое инстансами: кофе, аптечки, быки, кольца — 4 вызова на все (pickinst.js)
import * as REPLAY from './replay.js';         // повтор последних 10 с, замедление на аварии, ролик в «Видео» (replay.js, docs/CAREER.md «Повтор»)             // реплики над головами: читаемая плашка, крупнее вблизи, не больше нескольких (talk.js)
EDL.buildStart();                                 // город (всё до конца buildCity) — с зерном: одинаковый каждый запуск, правки редактора находят свои предметы (editlayer.js)

/* Прозрачное двустороннее three рисует в два прохода и перед каждым меняет material.side с needsUpdate —
   программа материала перебирается заново дважды на предмет в каждом кадре (кольца пинов и бонусов,
   лучи находок, лужи — ~40 на экране: ~5 тыс. раз в секунду, мусор и сборки мусора на Деке).
   Неосвещённым (MeshBasicMaterial: плоские кольца, круги, лучи без записи глубины) хватает одного
   прохода — на вид то же. Остальным материалам — как в three (true можно поставить и им) */
Object.defineProperty(THREE.Material.prototype, 'forceSinglePass', {
  configurable: true,
  get () { return this._fsp === true || this.isMeshBasicMaterial === true; },
  set (v) { this._fsp = v; },
});

/* Сохранения — через площадку (облако Яндекса / localStorage). Значения
   хранятся как есть: числа, строки, массивы. */
const Store = {
  get: (k, d) => { const v = Platform.store.get(k); return v === undefined || v === null ? d : v; },
  set: (k, v) => Platform.store.set(k, v),
};
/* Две версии игры. Детская (12+) — Яндекс, всегда: без крови, алкоголя,
   табака и бит. Взрослая (18+) — Стим по умолчанию: кровь и куски тел,
   пиво и водка в поручениях, курилка у пиццерии, пьющие компании ночью,
   биты в кофейной войне, «взрослые» находки. Версию задаёт сборка (Стим и web —
   взрослая, Яндекс — детская); переключателя у игрока нет с 04.10.2026 (старый
   ключ dlv-edition больше не читаем), ?kids — детская для проверки. */
const ADULT = !!Platform.features.adult && !new URLSearchParams(location.search).has('kids');
const GORE_ON = ADULT;
/* Карьера (Стим и dev): смена 9—24, экономика, машины, донаты. Только на карте,
   у которой есть MAP.career (Северск); на Яндексе — прежняя игра. ?nocareer — выключить */
const CAREER = Platform.id !== 'yandex' && !!MAP.career && !new URLSearchParams(location.search).has('nocareer');
/* районы карьеры (districts.js): где работаешь, что открыто, волна щедрости */
if (CAREER) DIST.init({ MAP, Store: { get: Store.get, set: Store.set, flush: () => Platform.store.flush && Platform.store.flush() } });
const DISTRICTS = CAREER && DIST.has();
/* прогресс доната на цель города: 0…1 (econ.js DONATE) */
/* деньги карьеры ×8 (econ.js MONEY_K): суммы, что заданы прямо в игре (кофейная война,
   похититель, находки, учебный заказ, курьеры-соперники); на Яндексе — как были */
const CASH = n => (CAREER ? n * ECON.MONEY_K : n);
/* старое сохранение — один раз переводим в новые деньги: кошелёк, донаты, рейтинг пиццерии */
if (CAREER && !Store.get('dlv-money-x8', 0)) {
  const K = ECON.MONEY_K, mul = key => { const v = +Store.get(key, 0) || 0; if (v) Store.set(key, Math.round(v * K)); };
  mul('dlv-msk-wallet'); mul('dlv-don-trash'); mul('dlv-don-gang');
  let c = Store.get('dlv-crew', null);
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = null; } }
  if (c && typeof c === 'object' && Array.isArray(c.crew)) { c.me = Math.round((c.me || 0) * K); for (const m of c.crew) m.total = Math.round((m.total || 0) * K); Store.set('dlv-crew', c); }
  Store.set('dlv-money-x8', 1);
}
const donated = k => clamp((+Store.get('dlv-don-' + k, 0) || 0) / ((ECON.DONATE[k] && ECON.DONATE[k].goal) || 1), 0, 1);
const NUMF = new Intl.NumberFormat(curLang() === 'zh' ? 'zh-CN' : curLang());
const money = n => NUMF.format(Math.round(n || 0)) + ' ₽';
const moneyOf = money;
/* винительный падеж имени — только в русском, в других языках имя как есть */
const accName = p => (p ? (curLang() === 'ru' && p.acc) || p.name : '');

/* ─────────────── мелочь ─────────────── */
const $ = id => document.getElementById(id);
/* ?intro — вместо игры катсцена-вступление к выпуску (см. раздел «вступление») */
const INTRO = false;               // катсцена дайджеста вырезана; флаг держим, чтобы не трогать проверки
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const chance = p => Math.random() < p;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const lerp = (a, b, t) => a + (b - a) * t;

/* ─────────────── звук: синтез + файлы автора (sfx.js, docs/SOUNDS.md) ───────────────
   Шины: main (вкл / выкл, M) ← звуки · мотор · музыка (три ползунка настроек, 0—100 %, сохраняются).
   Музыка — music.js (файлы public/music, docs/MUSIC.md): поток <audio> в шину musicBus.
   Snd.fx(имя, синтез, где) — именованный звук: есть файл public/sfx/имя*.ogg — играет файл, нет — синтез.
   «где» — { x, z, far } в мире: громкость от расстояния до своей машины и сторона по камере. */
const VOL_KEYS = { music: 'dlv-vol-music', sfx: 'dlv-vol-sfx', eng: 'dlv-vol-eng' };
const volGain = v => Math.pow(clamp(+v || 0, 0, 100) / 100, 2);     // ползунок → громкость: на слух ровнее, чем по прямой
SFX.load();
MUS.load();
const MUTE_Q = new URLSearchParams(location.search).has('mute');
const Snd = {
  // ?mute — без звука совсем (автопроверки, probe): общий регулятор всегда 0 — молчат синтез, файлы, мотор и музыка,
  // даже если проверка включит звук (Snd.set(true), M): счётчики файлов и синтеза при этом идут
  hard: MUTE_Q,
  on: !MUTE_Q && String(Store.get('dlv-sound', '1')) !== '0', ctx: null,
  muted: false,                  // площадка заглушила: реклама, свёрнутая вкладка
  vol: Object.fromEntries(Object.entries(VOL_KEYS).map(([k, key]) => { const v = +Store.get(key, 100); return [k, Number.isFinite(v) ? clamp(v, 0, 100) : 100]; })),
  SFX: SFX.DEBUG,
  MUS: MUS.DEBUG,                // музыка (music.js): __dlv.Snd.MUS.state, force(slot)
  amb: { want: AMBI.want, DEBUG: AMBI.DEBUG },   // петли «город шумит» (ambience.js): ураган шлёт свой вой через want()
  boot () {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.on = false; return; }
    this.ctx = new AC();
    const c = this.ctx;
    this.main = c.createGain();
    this.main.gain.value = this.on && !this.hard ? 0.45 : 0;
    this.main.connect(c.destination);
    const bus = k => { const g = c.createGain(); g.gain.value = volGain(this.vol[k]); g.connect(this.main); return g; };
    this.sfxBus = bus('sfx'); this.engBus = bus('eng'); this.musicBus = bus('music');
    this.master = this.sfxBus;       // старое имя: дождь и ветер (weather.js, hurricane.js) подключаются сюда — это «звуки»
    SFX.attach(c);
    // мотор (гул, коробка, отсечка, визг шин, свист нитро, гул потока) — motor.js: узлы строит сам на шине engBus
  },
  resume () { if (this.ctx && this.ctx.state === 'suspended' && !this.muted) this.ctx.resume(); },
  /* пауза от площадки: весь звук стоп, выбор игрока (on) не трогаем */
  mute (m) {
    this.muted = m;
    if (!this.ctx) return;
    if (m) this.ctx.suspend(); else this.ctx.resume();
  },
  /* Вкл/выкл — общим регулятором, через который идут все звуки: так звук
     гарантированно возвращается, что бы ни было запланировано в моторе */
  set (on) {
    this.on = on;
    this.boot(); this.resume();
    if (this.main) {
      const g = this.main.gain, now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(on && !this.hard ? 0.45 : 0, now + 0.05);
    }
    const b = document.getElementById('sfx');
    if (b) b.textContent = on ? $t('звук вкл') : $t('звук выкл');
    Store.set('dlv-sound', on ? '1' : '0');
  },
  /* ползунки настроек: k — 'music' | 'sfx' | 'eng', v — 0…100 */
  setVol (k, v) {
    if (!(k in VOL_KEYS)) return;
    v = clamp(Math.round(+v || 0), 0, 100);
    this.vol[k] = v;
    Store.set(VOL_KEYS[k], v);
    const bus = { music: this.musicBus, sfx: this.sfxBus, eng: this.engBus }[k];
    if (bus && this.ctx) { const now = this.ctx.currentTime; bus.gain.cancelScheduledValues(now); bus.gain.setTargetAtTime(volGain(v), now, 0.03); }
  },
  get music () { return MUS.has(); },   // есть треки в public/music (М5); нет — у ползунка «музыка» пометка «скоро»
  /* отпустил ползунок — короткий пример: звуки — монетка, мотор — «чих» стартера */
  preview (k) {
    this.boot(); this.resume();
    if (k === 'sfx') this.coin();
    else if (k === 'eng') this.fx('engine-crank', s => { s.noise(0.12, 0.22); s.blip(120, 0.14, 'sawtooth', 0.16); }, { eng: 1 });
  },
  /* «уши» — своя машина, правое ухо — по камере (каждый кадр из updateCar) */
  ear (x, z, rx, rz) { SFX.ear(x, z, rx, rz); },
  /* Именованный звук. name — имя или [имя, запасное…] (первое, у которого есть файл); synth(s) — синтез,
     если файлов нет: s.blip / s.noise — как Snd.blip / noise, но в тот же узел (сторона и расстояние; свой синтез — в s.out),
     и из setTimeout тоже. at — { x, z, far, near } точка в мире (без неё — «в машине», по центру);
     at.eng — звук мотора (заглохла, стартер, завелась): на шину «мотор», не «звуки»;
     v — громкость файла (сила удара), синтез свою силу знает сам. */
  fx (name, synth, at, v) {
    if (!this.ctx || !this.on) return false;
    const sp = at ? SFX.place(at) : null;
    if (sp && sp.g <= 0) return false;                       // дальше, чем слышно
    const out = SFX.node(at && at.eng ? this.engBus : this.sfxBus, sp);   // at.eng — звук мотора: ползунок «мотор»
    const names = Array.isArray(name) ? name : [name];
    for (const n of names) if (SFX.play(n, out, v)) return true;
    SFX.synthed(names[0]);
    if (synth) synth({ blip: (f, d, type, vv) => this.blip(f, d, type, vv, out), noise: (d, vv) => this.noise(d, vv, out), out, ctx: this.ctx });
    return true;
  },
  /* Мотор (motor.js, docs/SOUNDS.md «Мотор из записей»): 4 петли по оборотам, своя коробка, отсечка, хлопки на
     сбросе, визг шин, свист нитро. v — скорость вдоль машины, м/с; load — газ; info — MOTOR_IN из driveStep
     (без него — мотор молчит: пауза, карта, диалог) */
  engine (v, load, info) { MOTOR.input(v, load, info); },
  starter () { MOTOR.crank(); },                 // стартер при старте смены
  engineCut (sec) { MOTOR.cut(sec); },           // «чих» перед поломкой: мотор на миг пропадает (exhaust.js)
  motor: { DEBUG: MOTOR.DEBUG },
  /* out — куда (по умолчанию шина «звуки»; Snd.fx подставляет узел стороны и расстояния) */
  blip (f, d, type, v, out) {
    if (!this.ctx || !this.on) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square'; o.frequency.value = f;
    g.gain.value = v || 0.16;
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + d);
    o.connect(g); g.connect(out || this.sfxBus); o.start(); o.stop(this.ctx.currentTime + d);
  },
  noise (d, v, out) {
    if (!this.ctx || !this.on) return;
    const n = this.ctx.sampleRate * d;
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), a = b.getChannelData(0);
    for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const g = this.ctx.createGain(); g.gain.value = v || 0.28;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1300;
    s.connect(f); f.connect(g); g.connect(out || this.sfxBus); s.start();
  },
  /* именованные звуки (docs/SOUNDS.md): at — точка в мире, если звук не «в машине» */
  // удар машины слоями (impact.js, docs/SOUNDS.md «Удары слоями»): v — скорость удара, м/с (тычок / средний / с 15 — авария),
  // mat — во что: 'wall' | 'car' | 'pole' | 'fence' | 'person' | 'bin' | 'tree'; at — точка в мире
  crash (v = 10, at, mat) { return IMPACT.hit(+v || 10, mat || 'wall', at) || false; },
  impact (v, mat, at) { return IMPACT.hit(v, mat, at); },
  hit: { DEBUG: IMPACT.DEBUG },
  squish (at) { return this.fx('squish', s => { s.noise(0.13, 0.2); s.blip(210, 0.1, 'triangle', 0.12); }, at); },
  coin () { return this.fx('coin', s => [880, 1174, 1568].forEach((f, i) => setTimeout(() => s.blip(f, 0.12, 'square', 0.12), i * 70))); },
  order () { return this.fx('order', s => [520, 700].forEach((f, i) => setTimeout(() => s.blip(f, 0.1, 'square', 0.12), i * 90))); },
  tick () { return this.fx('tick', s => s.blip(1400, 0.05, 'square', 0.07)); },
  boom (at) { return this.fx('boom', s => { s.noise(0.7, 0.55); s.blip(70, 0.5, 'sawtooth', 0.26); }, at); },
  fail () { return this.fx('fail', s => [440, 330, 220, 150].forEach((f, i) => setTimeout(() => s.blip(f, 0.3, 'sawtooth', 0.15), i * 140))); },
  nosPick () { return this.fx('nitro-pick', s => [660, 990, 1320, 1760].forEach((f, i) => setTimeout(() => s.blip(f, 0.09, 'square', 0.1), i * 45))); },
  nosFire () { return this.fx('nitro', s => { s.noise(0.6, 0.32); s.blip(160, 0.4, 'sawtooth', 0.12); }); },
  // упёрся в закрытый район — глухой «бум» (раньше звука не было)
  thud () { return this.fx('thud', s => { s.noise(0.12, 0.2); s.blip(70, 0.14, 'triangle', 0.14); }); },
  // мелкий щелчок интерфейса: f — высота синтеза (листание, табы, карусели)
  click (f = 520, v = 0.04, d = 0.03) { return this.fx('ui-click', s => s.blip(f, d, 'square', v)); },
  // «нельзя» в интерфейсе: не хватает денег, кнопка закрыта
  deny (f = 220) { return this.fx('ui-deny', s => s.blip(f, 0.1, 'square', 0.08)); },
};
IMPACT.init({ Snd });                            // удары слоями (impact.js)
MOTOR.init({ Snd });                             // мотор из записей (motor.js)

/* ─────────────── рендер: маленький кадр, растянутый на экран ───────────────
   Ровно этим Hamster Rescue и берёт — крупный пиксель вместо сглаживания. */

const canvas = $('view');
/* сглаживание (MSAA ×4) — по настройке графики «сглаживание» (gfx.js), на маленьком кадре оно дешёвое:
   края домов и огни окон вдали ночью не рябят. ?aa=0 / ?aa=1 — на этот запуск (замеры) */
const AA_Q = new URLSearchParams(location.search).get('aa');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: AA_Q === '0' ? false : AA_Q === '1' ? true : GFX.aa() });
/* Размер «пикселя» игры в пикселях экрана. Раньше делили CSS-пиксели на
   два: на телефоне это 195 точек в ширину — каша. Теперь по короткой
   стороне в физических пикселях: примерно 540 точек, как на ноутбуке с
   1080 по высоте, — пиксель одного размера и на телефоне, и на десктопе.
   Сколько точек — настройка графики «чёткость» (gfx.js): ~430 / 540 / 720. */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86c6f2);
scene.fog = new THREE.Fog(0xc6e3f6, 230, 470);   // дальше тумана не рисуем: кадр дороже, чем вид

const cam = new THREE.PerspectiveCamera(64, 1, 0.4, 490);

scene.add(new THREE.HemisphereLight(0xeaf7ff, 0xb6c8a6, 1.7));
const sun = new THREE.DirectionalLight(0xfff6e4, 1.45);
sun.position.set(120, 180, 90);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xdfeaff, 0.5));

function resize () {
  const w = canvas.clientWidth || 640, h = canvas.clientHeight || 360;
  const dpr = window.devicePixelRatio || 1;
  const px = Math.max(1, Math.min(w, h) * dpr / GFX.pixelShort());
  renderer.setPixelRatio(1);
  renderer.setSize(Math.max(200, Math.round(w * dpr / px)), Math.max(112, Math.round(h * dpr / px)), false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  sizeRadar();
}
addEventListener('resize', resize);

/* ─────────────── склейка статики в один меш ─────────────── */

/* Цвет по строке '#a2b3c4' three.js каждый раз разбирает заново, а при сборке
   города таких вызовов сотни тысяч — разобранный держим в памяти */
const HEX_RGB = new Map();
function hexRGB (hex) {
  let c = HEX_RGB.get(hex);
  if (!c) {
    const k = new THREE.Color(hex);
    c = { r: k.r, g: k.g, b: k.b };
    if (typeof hex === 'string' || typeof hex === 'number') HEX_RGB.set(hex, c);
  }
  return c;
}
function paint (g, hex) {
  const c = hexRGB(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
function put (list, g, hex, x, y, z, rx = 0, ry = 0, rz = 0) {
  // икосаэдры приходят без индекса — склейке он нужен всем одинаково
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  paint(g, hex);
  if (rx) xform(g, XM.makeRotationX(rx));
  if (ry) xform(g, XM.makeRotationY(ry));
  if (rz) xform(g, XM.makeRotationZ(rz));
  xform(g, XM.makeTranslation(x, y, z));
  list.push(g);
  return g;
}
/* копия шаблона в масштабе — как g.clone().scale(sx, sy, sz) для склейки (вершины,
   нормали, индекс), только без постройки шаблона заново: clone() у Torus- и
   IcosahedronGeometry сначала строит фигуру по умолчанию и лишь потом копирует */
function geoScaled (g, sx, sy, sz) {
  const c = new THREE.BufferGeometry();
  for (const k of ['position', 'normal']) { const a = g.attributes[k]; if (a) c.setAttribute(k, new THREE.BufferAttribute(a.array.slice(), a.itemSize, a.normalized)); }
  if (g.index) c.setIndex(new THREE.BufferAttribute(g.index.array.slice(), 1));
  return xform(c, XM.makeScale(sx, sy, sz));
}
/* g.applyMatrix4(m) three.js — та же арифметика в том же порядке, только
   прямо по массивам: без временных векторов и обращений через аксессоры.
   Склейка зовёт это сотни тысяч раз. Что не по зубам — отдаём самому three.js */
const XM = new THREE.Matrix4(), XN = new THREE.Matrix3();
function xform (g, m) {
  const pa = g.attributes.position, na = g.attributes.normal;
  const plain = a => !a || (a.itemSize === 3 && !a.normalized && !a.isInterleavedBufferAttribute && a.array instanceof Float32Array);
  if (!pa || !plain(pa) || !plain(na) || g.attributes.tangent || g.boundingBox !== null || g.boundingSphere !== null) { g.applyMatrix4(m); return g; }
  const e = m.elements, a = pa.array;
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i], y = a[i + 1], z = a[i + 2];
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    a[i] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    a[i + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    a[i + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
  }
  pa.needsUpdate = true;
  if (na) {
    const n = XN.getNormalMatrix(m).elements, b = na.array;
    for (let i = 0; i < b.length; i += 3) {
      const x = b[i], y = b[i + 1], z = b[i + 2];
      let nx = n[0] * x + n[3] * y + n[6] * z, ny = n[1] * x + n[4] * y + n[7] * z, nz = n[2] * x + n[5] * y + n[8] * z;
      const k = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
      nx *= k; ny *= k; nz *= k;
      b[i] = nx; b[i + 1] = ny; b[i + 2] = nz;
    }
    na.needsUpdate = true;
  }
  return g;
}
/* Коробка как THREE.BoxGeometry(w, h, d), только без её сборки через массивы
   и без лишних объектов: та же раскладка граней (buildPlane three.js при одном
   сегменте), те же вершины, нормали и индексы до бита. Коробки box() идут
   только в склейку (mergeGeos), ей нужны вершины, нормали и индекс — без uv */
const BOX_IDX = new Uint16Array([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5, 8, 10, 9, 10, 11, 9, 12, 14, 13, 14, 15, 13, 16, 18, 17, 18, 19, 17, 20, 22, 21, 22, 23, 21]);
// оси граней: u, v, w, udir, vdir и какой размер куда (как в BoxGeometry)
const BOX_PLANES = [[2, 1, 0, -1, -1, 2, 1, 0, 1], [2, 1, 0, 1, -1, 2, 1, 0, -1], [0, 2, 1, 1, 1, 0, 2, 1, 1],
  [0, 2, 1, 1, -1, 0, 2, 1, -1], [0, 1, 2, 1, -1, 0, 1, 2, 1], [0, 1, 2, -1, -1, 0, 1, 2, -1]];
function boxGeo (w, h, d) {
  const S = [w, h, d], p = new Float32Array(72), nr = new Float32Array(72), V = [0, 0, 0];
  let o = 0;
  for (const [u, v, ww, ud, vd, si, sj, sk, sg] of BOX_PLANES) {
    const width = S[si], height = S[sj], depth = S[sk] * sg;
    const wh = width / 2, hh = height / 2, dh = depth / 2;
    for (let iy = 0; iy < 2; iy++) {
      const y = iy * height - hh;
      for (let ix = 0; ix < 2; ix++) {
        const x = ix * width - wh;
        V[u] = x * ud; V[v] = y * vd; V[ww] = dh;
        p[o] = V[0]; p[o + 1] = V[1]; p[o + 2] = V[2];
        V[u] = 0; V[v] = 0; V[ww] = depth > 0 ? 1 : -1;
        nr[o] = V[0]; nr[o + 1] = V[1]; nr[o + 2] = V[2];
        o += 3;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(new THREE.BufferAttribute(BOX_IDX, 1));            // индекс один на всех: его только читают
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
  g.parameters = { width: w, height: h, depth: d, widthSegments: 1, heightSegments: 1, depthSegments: 1 };
  return g;
}
const box = (list, w, h, d, hex, x, y, z, ry = 0) =>
  put(list, boxGeo(w, h, d), hex, x, y, z, 0, ry, 0);
const quad = (list, w, h, hex, x, y, z, rx = -Math.PI / 2, ry = 0) =>
  put(list, new THREE.PlaneGeometry(w, h), hex, x, y, z, rx, ry, 0);

function mergeGeos (list) {
  let vn = 0, iN = 0;
  for (const g of list) { vn += g.attributes.position.count; iN += g.index.count; }
  const pos = new Float32Array(vn * 3), nor = new Float32Array(vn * 3), col = new Float32Array(vn * 3);
  const idx = vn > 65535 ? new Uint32Array(iN) : new Uint16Array(iN);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    col.set(g.attributes.color.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* ─────────────── план города: настоящая Москва ───────────────
   Город не выдуман. Геометрия приезжает из moscow-city.js — выгрузка
   OpenStreetMap и SRTM вокруг Омега-Плазы: Ленинская Слобода,
   Автозаводская улица, Кожуховские проезды, метро «Автозаводская» и
   Москва-река с набережными, километр сто шестьдесят на девятьсот
   шестьдесят метров. Метры настоящие, город не сжат. Выдуман только
   Омега-мост через реку: настоящего в рамке нет. x на восток, z на юг. */

const CITY = MAP.data;
sanitizePois(CITY.pois);                       // чужие вывески → пародии и выдуманные (brands.js)
/* ТЦ: подсказки стиля из генератора карты (malls[].style) — на сам дом */
for (const m of CITY.malls || []) {
  const b = CITY.buildings.find(q => q.id === m.id);
  if (b && m.style) b.style = { stripe: m.style.stripe, sign: m.style.stripe, glass: m.style.glass };
}
WORLD.prepCity(CITY, MAP, CAREER);               // карьера: дома в круге MAP.career.rich — особняки (world.js)
/* Во вступлении камера не отходит от Омеги дальше пары сотен метров —
   город строим только вокруг неё: сборка в разы короче, кино стартует быстрее. */
const CW = CITY.meta.size[0], CD = CITY.meta.size[1];
const BOUNDS = { x0: -CW / 2 + 12, x1: CW / 2 - 12, z0: -CD / 2 + 12, z1: CD / 2 - 12 };
/* Край карты — многоугольник, если он у карты есть (Северск: по забору
   закрытого города), иначе прямоугольник. Многоугольник растрим на сетку
   в 8 м один раз — проверка «внутри ли» дальше стоит одного обращения. */
BEACH.prepare(MAP, CITY);                        // пляж: «карман» в заборе до воды — до границы и её маски (beach.js)
const BORDER = MAP.border || CITY.border || null;
/* Северск пока открыт кусок у пиццерии (MAP.open): BORDER — где можно ездить,
   DRAW_BORDER — старый забор: по нему решаем, что рисовать крупно (город за
   линией закрыт, но стоит как стоял) */
const DRAW_BORDER = MAP.open && CITY.border ? CITY.border : BORDER;
function polyMask (poly) {
  if (!poly) return null;
  const C = 8, x0 = BOUNDS.x0 - 12, z0 = BOUNDS.z0 - 12;
  const nx = Math.ceil((BOUNDS.x1 - BOUNDS.x0 + 24) / C) + 1, nz = Math.ceil((BOUNDS.z1 - BOUNDS.z0 + 24) / C) + 1;
  const a = new Uint8Array(nx * nz), n = poly.length;
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * C, xs = [];
    for (let i = 0, k = n - 1; i < n; k = i++) {
      const [xi, zi] = poly[i], [xk, zk] = poly[k];
      if ((zi > z) !== (zk > z)) xs.push(xi + (z - zi) / (zk - zi) * (xk - xi));
    }
    xs.sort((p, q) => p - q);
    for (let s = 0; s + 1 < xs.length; s += 2)
      for (let i = Math.max(0, Math.ceil((xs[s] - x0) / C)); i <= Math.min(nx - 1, Math.floor((xs[s + 1] - x0) / C)); i++) a[j * nx + i] = 1;
  }
  return { C, x0, z0, nx, nz, a };
}
const BMASK = polyMask(BORDER);
const DMASK = DRAW_BORDER === BORDER ? BMASK : polyMask(DRAW_BORDER);
const inMask = (M, x, z) => {
  const i = Math.round((x - M.x0) / M.C), j = Math.round((z - M.z0) / M.C);
  return i >= 0 && j >= 0 && i < M.nx && j < M.nz && M.a[j * M.nx + i] === 1;
};
const inBorder = (x, z) => !BMASK || inMask(BMASK, x, z);
/* точка далеко за старым забором: ни одна из восьми точек в 240 м вокруг не внутри */
const farOut = (x, z) => {
  if (!DMASK || inMask(DMASK, x, z)) return false;
  for (let a = 0; a < 8; a++) if (inMask(DMASK, x + Math.cos(a * 0.785) * 240, z + Math.sin(a * 0.785) * 240)) return false;
  return true;
};
const inBorderM = (x, z, m) => inBorder(x, z) && (m <= 0 || (inBorder(x + m, z) && inBorder(x - m, z) && inBorder(x, z + m) && inBorder(x, z - m)));
const LANE = 3.2;                              // смещение от осевой до центра полосы (запасное)

/* ширина полотна по классу: трасса, главная, вторая, третья,
   улица, тихая, пешеходка, проезд во двор */
const ROAD_W = [20, 16, 13.5, 11, 9, 7, 5, 5.5];
const ROAD_HEX = ['#9aa0ab', '#9aa0ab', '#9ea4af', '#a2a8b2', '#a4aab4', '#a7adb6', '#cdc6bb', '#aab0b8'];
const DRIVE_MAX = 5;                           // выше по классу — пешеходка, туда не едем
/* ширину полотна считает выгрузка: по числу полос из карты, а во дворах
   ещё и сужает, чтобы асфальт не залезал в стены */
const roadWidth = r => r.w || ROAD_W[r.c];
/* r.x — улица не связана с остальной сетью (обрывок за рамкой): рисуем, но не ездим */
const drivable = r => !r.x && r.c !== 6;

/* ── рельеф ──
   Москва тут плоская, но не везде: от Ленинской Слободы к реке берег
   спускается метров на пятнадцать-двадцать, а набережная лежит у самой
   воды. Высоты сняты с SRTM на сетку в двенадцать метров и лежат в
   moscow-city.js; ноль — урез Москвы-реки, всё, что ниже, — вода.

   Каждая клетка сетки режется диагональю на два плоских треугольника,
   и высота в точке считается ровно так же, как нарисована земля. Всё
   плоское — дороги, газоны, разметка — режется по этим же треугольникам
   (см. Mesher.dtri), поэтому ложится на склон без щелей и не тонет. */
const TER = CITY.terrain;
const TG = TER.g, TNX = TER.nx, TNZ = TER.nz, TX0 = TER.x0, TZ0 = TER.z0;
const TH = (() => {
  const bin = atob(TER.h), a = new Float32Array(TNX * TNZ);
  for (let i = 0; i < a.length; i++)
    a[i] = ((bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) - 1000) / 10;
  return a;
})();
/* Проверка и починка карты (mapcheck.js): до всего, что строится из улиц и
   рельефа, — сшить обрывы, выровнять рельеф под дорогами, поднять мосты
   над улицами и решить, чем закрыть тупики. ?nomapfix — как в выгрузке,
   ?mapcheck — сводка проблем в консоли и столбики над ними. */
const MAPCHECK = new URLSearchParams(location.search).has('mapcheck');
const MAPFIX = new URLSearchParams(location.search).has('nomapfix') ? null : fixMap(CITY, TH, { before: MAPCHECK });
/* Неровный газон: бугры 0,1—0,4 м и холмики 1—2,5 м на больших газонах — добавкой к высотам сетки
   до сборки города, поэтому всё (деревья, лавки, люди, колёса) встаёт на рельеф само. У дорог,
   дорожек, домов, подъездов, площадок, воды и пиццерий — ровно (relief.js, ?norelief — без него) */
RELIEF.addRelief(CITY, TH, TER, {
  roadHW: r => (roadWidth(r) + (r.c <= 5 ? 5.5 : 2) + (r.g || 0) * 2) / 2,
  spots: MAP.career ? [...((MAP.career.districts && MAP.career.districts.list) || []).filter(q => q.pizza).map(q => [q.pizza[0], q.pizza[1], 60]),
    ...(MAP.career.garages || []).map(q => [q.x, q.z, 45])] : [],
});
BEACH.shape(TH, TER);                             // пляж: песок намыт в реку, дно пологое — до сборки земли и воды (beach.js)
/* речки и пруды: русло ниже земли — до сборки города, как рельеф (streams.js; ?nostreams — как было) */
STREAMS.carve(CITY, TH, TER, {
  roadHW: r => (roadWidth(r) + (r.c <= 5 ? 5.5 : 2) + (r.g || 0) * 2) / 2, far: (x, z) => !!DMASK && farOut(x, z),
  spots: MAP.career ? [...((MAP.career.districts && MAP.career.districts.list) || []).filter(q => q.pizza).map(q => [q.pizza[0], q.pizza[1], 60]),
    ...(MAP.career.garages || []).map(q => [q.x, q.z, 45])] : [],
});

function groundH (x, z) {
  const u = (x - TX0) / TG, v = (z - TZ0) / TG;
  let i = Math.floor(u), j = Math.floor(v);
  if (i < 0) i = 0; else if (i > TNX - 2) i = TNX - 2;
  if (j < 0) j = 0; else if (j > TNZ - 2) j = TNZ - 2;
  const fu = u - i, fv = v - j, k = j * TNX + i;
  if (fu + fv <= 1) return TH[k] + (TH[k + 1] - TH[k]) * fu + (TH[k + TNX] - TH[k]) * fv;
  const h11 = TH[k + TNX + 1];
  return h11 + (TH[k + TNX] - h11) * (1 - fu) + (TH[k + 1] - h11) * (1 - fv);
}

/* нормаль склона — чтобы пятно крови легло на склон, а не воткнулось в него */
const TNORM = new THREE.Vector3();
function groundNormal (x, z) {
  const e = 1.5;
  TNORM.set(groundH(x - e, z) - groundH(x + e, z), 2 * e, groundH(x, z - e) - groundH(x, z + e));
  return TNORM.normalize();
}

/* ── мосты ──
   Под Омега-мостом река, поэтому по рельефу его не положишь.
   Настил идёт от берега до берега по прямой с лёгким горбом посередине,
   а машина на мосту стоит на настиле, а не на дне реки. */
const BRIDGES = [];
for (const r of CITY.roads) {
  if (!r.b) continue;
  const p = r.p, w = roadWidth(r);
  const acc = [0];
  for (let i = 1; i < p.length; i++) acc.push(acc[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = acc[acc.length - 1] || 1;
  const h0 = groundH(p[0][0], p[0][1]), h1 = groundH(p[p.length - 1][0], p[p.length - 1][1]);
  const arch = L > 120 ? Math.min(6, L * 0.01) : 0;
  // r.dk — профиль от починки карты: настил поднят над улицами под мостом
  const deck = r.dk ? profileFn(r.dk) : s => lerp(h0, h1, s / L) + arch * Math.sin(Math.PI * clamp(s / L, 0, 1));
  for (let i = 1; i < p.length; i++) {
    const x1 = p[i - 1][0], z1 = p[i - 1][1], x2 = p[i][0], z2 = p[i][1];
    // настил шире полотна: тротуары до самых перил
    const ws = w + (r.c <= 5 ? 5.5 : 2), m = ws / 2 + 2;
    BRIDGES.push({
      x1, z1, x2, z2, s1: acc[i - 1], s2: acc[i], L, w, ws, deck, road: r,
      bx0: Math.min(x1, x2) - m, bx1: Math.max(x1, x2) + m, bz0: Math.min(z1, z2) - m, bz1: Math.max(z1, z2) + m,
    });
  }
}
// у самых концов запас над землёй сходит на нет: иначе на въезде на мост ступенька
const deckAt = (b, t, x, z) => { const s = lerp(b.s1, b.s2, t); return Math.max(b.deck(s), groundH(x, z) + (MAPFIX ? Math.min(0.2, 0.04 * Math.min(s, b.L - s)) : 0.2)); };

/* По чему едет колесо: настил моста или земля. Под мостом у берега
   земля и настил близко, поэтому на настил переходим, только если уже
   ехали примерно на его высоте (prevY) — иначе у опоры машину бы
   выдёргивало наверх. Без prevY — для искр, крови и новых машин —
   мост в приоритете. */
function surfaceAt (x, z, prevY) {
  const h = groundH(x, z);
  for (const b of BRIDGES) {
    if (x < b.bx0 || x > b.bx1 || z < b.bz0 || z > b.bz1) continue;
    const dx = b.x2 - b.x1, dz = b.z2 - b.z1;
    // только между концами: за концом настила — уже земля. С зажатым t
    // вокруг каждого конца торчал круг «настила», и у левого берега
    // машина висела в воздухе над Сенной Курьей
    const t = ((x - b.x1) * dx + (z - b.z1) * dz) / (dx * dx + dz * dz || 1);
    if (t < 0 || t > 1) continue;
    // по ширине настила, а не полотна: иначе между полосой и перилами
    // оказывалась река, и машину отбрасывало посреди моста
    if (Math.hypot(x - b.x1 - dx * t, z - b.z1 - dz * t) > b.ws / 2 + 1) continue;
    const y = deckAt(b, t, x, z);
    if (y - h < 1.8 || prevY === undefined || Math.abs(y - prevY) < 2.5) return y;
  }
  return h;
}
const floorAt = (x, z) => surfaceAt(x, z);

/* ── препятствия ──
   В настоящем городе дом стоит под тем углом, под каким его построили,
   поэтому препятствие — не прямоугольник по осям мира, а повёрнутая
   коробка. Считаем в её собственных осях: это те же четыре сравнения. */
const SOLIDS = [];

function obb (cx, cz, hw, hd, ry) {
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const s = {
    cx, cz, hw, hd, cs, sn,
    ex: Math.abs(cs) * hw + Math.abs(sn) * hd,   // полуразмеры мирового бокса
    ez: Math.abs(sn) * hw + Math.abs(cs) * hd,
  };
  SOLIDS.push(s);
  return s;
}
const solid = (x0, z0, x1, z1) =>
  obb((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0);

/* Стен в городе десятки тысяч, перебирать все на каждый шаг нельзя —
   раскладываем по клеткам тридцать на тридцать метров. */
const SCELL = 30, SOLID_GRID = new Map();
const NO_SOLIDS = [null]; NO_SOLIDS.pop();        // пустой, но «массив объектов», как клетки: езда перебирает их одним кодом (V8)
const scellKey = (x, z) => Math.floor(x / SCELL) + ',' + Math.floor(z / SCELL);

function indexSolids () {
  SOLID_GRID.clear();
  for (const s of SOLIDS)
    for (let i = Math.floor((s.cx - s.ex) / SCELL); i <= Math.floor((s.cx + s.ex) / SCELL); i++)
      for (let j = Math.floor((s.cz - s.ez) / SCELL); j <= Math.floor((s.cz + s.ez) / SCELL); j++) {
        const k = i + ',' + j;
        let a = SOLID_GRID.get(k);
        if (!a) SOLID_GRID.set(k, a = []);
        a.push(s);
      }
}

const solidsNear = (x, z) => SOLID_GRID.get(scellKey(x, z)) || NO_SOLIDS;

/* выталкиваем по меньшему проникновению — человек скользит вдоль стены */
function pushOut (p, r) {
  for (const s of solidsNear(p.x, p.z)) {
    if (s.deckY !== undefined) continue;          // перила моста — не для пешеходов внизу
    const dx = p.x - s.cx, dz = p.z - s.cz;
    const lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
    const px = s.hw + r - Math.abs(lx), pz = s.hd + r - Math.abs(lz);
    if (px <= 0 || pz <= 0) continue;
    if (px < pz) { const d = (lx < 0 ? -1 : 1) * px; p.x += d * s.cs; p.z += d * s.sn; }
    else { const d = (lz < 0 ? -1 : 1) * pz; p.x -= d * s.sn; p.z += d * s.cs; }
  }
}

/* ── улицы кусками: по ним ищем ближайшую дорогу ──
   Нужно постоянно: куда развернуть лавочку, с какой стороны у дома
   подъезд, где припарковать чужую машину, что нарисовать на радаре. */
const RSEG = [];
for (const r of CITY.roads) {
  const w = roadWidth(r), p = r.p;
  for (let i = 1; i < p.length; i++)
    RSEG.push({ x1: p[i - 1][0], z1: p[i - 1][1], x2: p[i][0], z2: p[i][1], c: r.c, w, name: r.n, b: r.b || 0, x: r.x || 0, g: r.g || 0 });   // g — газон бульвара: ширина плиты за бордюром (hits.js)
}

PAVE.init({ RSEG, CITY, onAlley: (x, z, m) => WORLD.onAlley(x, z, m) });   // тротуары и дорожки: общее «сюда не ставить» (pave.js)

const RCELL = 64, ROAD_GRID = new Map();
for (let k = 0; k < RSEG.length; k++) {
  const s = RSEG[k];
  const i0 = Math.floor(Math.min(s.x1, s.x2) / RCELL), i1 = Math.floor(Math.max(s.x1, s.x2) / RCELL);
  const j0 = Math.floor(Math.min(s.z1, s.z2) / RCELL), j1 = Math.floor(Math.max(s.z1, s.z2) / RCELL);
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      const key = i + ',' + j;
      let a = ROAD_GRID.get(key);
      if (!a) ROAD_GRID.set(key, a = []);
      a.push(k);
    }
}

/* те же клетки сплошным массивом: при сборке города ближайшую дорогу
   спрашивают сотни тысяч раз, и строка-ключ на каждую клетку стоила заметно */
const RG = (() => {
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (const key of ROAD_GRID.keys()) { const [i, j] = key.split(',').map(Number); i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
  if (!(i1 >= i0)) return { i0: 0, j0: 0, ni: 0, nj: 0, cells: [] };
  const ni = i1 - i0 + 1, nj = j1 - j0 + 1, cells = new Array(ni * nj).fill(null);
  for (const [key, a] of ROAD_GRID) { const [i, j] = key.split(',').map(Number); cells[(i - i0) * nj + (j - j0)] = a; }
  return { i0, j0, ni, nj, cells };
})();

/* ближайшая точка на дороге: расстояние, сама точка и направление улицы */
function nearestRoad (x, z, maxCls = DRIVE_MAX, rings = 2) {
  const ci = Math.floor(x / RCELL), cj = Math.floor(z / RCELL);
  let bk = -1, bd = Infinity, bd2 = Infinity, bx = 0, bz = 0, bt = 0;
  const own = maxCls <= DRIVE_MAX;
  for (let i = ci - rings; i <= ci + rings; i++) {
    const ii = i - RG.i0;
    if (ii < 0 || ii >= RG.ni) continue;
    for (let j = cj - rings; j <= cj + rings; j++) {
      const jj = j - RG.j0;
      if (jj < 0 || jj >= RG.nj) continue;
      const a = RG.cells[ii * RG.nj + jj];
      if (!a) continue;
      for (let q = 0; q < a.length; q++) {
        const k = a[q], s = RSEG[k];
        if (s.c > maxCls || (s.x && own)) continue;
        const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
        const l2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - s.x1) * dx + (z - s.z1) * dz) / l2, 0, 1);
        const px = s.x1 + dx * t, pz = s.z1 + dz * t;
        // заведомо дальше лучшего — без гипотенузы (запас с лихвой покрывает округление)
        const ex = x - px, ez = z - pz;
        if (ex * ex + ez * ez > bd2 * 1.000001) continue;
        const d = Math.hypot(ex, ez);
        if (d < bd) { bd = d; bd2 = d * d; bk = k; bx = px; bz = pz; bt = t; }
      }
    }
  }
  return bk < 0 ? null : { d: bd, x: bx, z: bz, seg: RSEG[bk], t: bt };
}

/* ─────────────── быстрая сборка статики ───────────────
   Домов больше полутора тысяч, кусков дорог — тысячи. Заводить на каждую
   плоскость объект three.js слишком дорого, поэтому пишем вершины прямо
   в типизированные массивы и отдаём один меш на весь город. */

/* Вершина — только позиция и цвет байтами: нормали не храним, склейки
   рисуются плоским затенением (flatShading), и нормаль грани шейдер считает
   сам. Так статика Северска (4 млн треугольников) весит втрое меньше. */
/* ?zfight (с ?debug) — журнал плоского, что кладётся на рельеф (dtri): probe ищет куски разного цвета на одной
   высоте — они мерцают на стыке (группа О3, 09.10.2026; tools/probe-checks/zfight.js). Без флага — ничего не пишется */
const ZFLOG = typeof location !== 'undefined' && /[?&]zfight/.test(location.search) ? (window.__ZF = []) : null;
const ZFTAGS = ZFLOG && /[?&]zfight=tag/.test(location.search);   // ещё и кто положил (имя функции из стека; сборка медленнее в разы)
let ZF_ID = 0;
const ZFTAG = new Map();
function Mesher () {
  let n = 0;
  const ZMID = ++ZF_ID;
  const C = new THREE.Color();
  let cr = 0, cg = 0, cb = 0, GRAD = null;
  /* Треугольник сразу ложится в свою клетку (см. mesh): общий массив на весь
     город с последующей раскладкой по клеткам весил в Северске сотни мегабайт
     и стоил лишнего копирования. Клетки — в порядке первого треугольника */
  let ids = new Map(), BK = [], lastK = NaN, lastB = null;
  function bucket (ax, az, bx, bz, cx, cz) {
    // координаты — как они лягут во Float32Array: клетка та же, что и у склейки по готовому массиву
    const x0 = Math.fround(ax), z0 = Math.fround(az), x1 = Math.fround(bx), z1 = Math.fround(bz), x2 = Math.fround(cx), z2 = Math.fround(cz);
    const span = Math.max(Math.abs(x1 - x0), Math.abs(x2 - x0), Math.abs(z1 - z0), Math.abs(z2 - z0));
    const k = span > CHUNK ? -1 : (Math.floor((x0 + x1 + x2) / 3 / CHUNK) + 50000) * 100000 + Math.floor((z0 + z1 + z2) / 3 / CHUNK) + 50000;
    if (k === lastK) return lastB;
    let b = ids.get(k);
    if (b === undefined) { b = { cap: 1 << 10, n: 0, pos: new Float32Array(3 << 10), col: new Uint8Array(3 << 10) }; ids.set(k, b); BK.push(b); }
    lastK = k; lastB = b;
    return b;
  }
  function room (b, add) {
    if (b.n + add <= b.cap) return;
    while (b.n + add > b.cap) b.cap *= 2;
    const p2 = new Float32Array(b.cap * 3), c2 = new Uint8Array(b.cap * 3);
    p2.set(b.pos); c2.set(b.col);
    b.pos = p2; b.col = c2;
  }

  /* кусок многоугольника по одну сторону прямой a·x + b·z = c (Сазерленд — Ходжмен).
     Точки — парами x, z в готовых массивах: src из sn точек → dst, вернёт число точек.
     Арифметика та же, что была на массивах [x, z], — и ответ тот же до бита */
  function clipHalf (src, sn, dst, a, b, c) {
    let m = 0;
    for (let i = 0; i < sn; i++) {
      const j = (i + 1) % sn, px = src[i * 2], pz = src[i * 2 + 1], qx = src[j * 2], qz = src[j * 2 + 1];
      const dp = a * px + b * pz - c, dq = a * qx + b * qz - c;
      if (dp <= 0) { dst[m * 2] = px; dst[m * 2 + 1] = pz; m++; }
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
        const t = dp / (dp - dq);
        dst[m * 2] = px + (qx - px) * t; dst[m * 2 + 1] = pz + (qz - pz) * t; m++;
      }
    }
    return m;
  }
  function fan (P, np, lift) {
    const ax = P[0], az = P[1];
    for (let k = 1; k < np - 1; k++) {
      const bx = P[k * 2], bz = P[k * 2 + 1], cx = P[k * 2 + 2], cz = P[k * 2 + 3];
      if (Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) < 1e-4) continue;
      api.tri(ax, groundH(ax, az) + lift, az, bx, groundH(bx, bz) + lift, bz,
              cx, groundH(cx, cz) + lift, cz, 0, 1, 0);
    }
  }
  // треугольник после пяти отсечений — не больше восьми точек; запас с лихвой
  const CT = new Float64Array(64), C1 = new Float64Array(64), CX = new Float64Array(64), C2 = new Float64Array(64), CP = new Float64Array(64), CF = new Float64Array(64);

  const V2 = [];
  const api = {
    color (hex) {
      let k = BYTE_RGB.get(hex);
      if (k === undefined) {
        C.set(hex); k = (Math.round(C.r * 255) << 16) | (Math.round(C.g * 255) << 8) | Math.round(C.b * 255);
        if (typeof hex === 'string' || typeof hex === 'number') BYTE_RGB.set(hex, k);
      }
      cr = k >> 16; cg = (k >> 8) & 255; cb = k & 255;
      return api;
    },
    tri (ax, ay, az, bx, by, bz, cx, cy, cz) {
      const b = bucket(ax, az, bx, bz, cx, cz);
      room(b, 3);
      const p = b.pos, c = b.col, i = b.n * 3;
      p[i] = ax; p[i + 1] = ay; p[i + 2] = az; p[i + 3] = bx; p[i + 4] = by; p[i + 5] = bz; p[i + 6] = cx; p[i + 7] = cy; p[i + 8] = cz;
      if (GRAD) { GRAD(ax, az, c, i); GRAD(bx, bz, c, i + 3); GRAD(cx, cz, c, i + 6); }
      else { c[i] = c[i + 3] = c[i + 6] = cr; c[i + 1] = c[i + 4] = c[i + 7] = cg; c[i + 2] = c[i + 5] = c[i + 8] = cb; }
      b.n += 3; n += 3;
    },
    /* цвет по месту: fn(x, z, байты, i) кладёт цвет вершины в байты[i…i+2] (плавный стык асфальта,
       roadwear.js); null — снова один цвет на треугольник */
    grad (fn) { GRAD = fn || null; return api; },
    quad (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz) {
      api.tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz);
      api.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, nx, ny, nz);
    },
    /* Горизонтальный треугольник лицом вверх. Обход — по часовой в осях
       x/z: при плоской заливке свет считается по обходу, и при обратном
       порядке земля оказывается освещена снизу. Порядок чиним сами. */
    up (ax, ay, az, bx, by, bz, cx, cy, cz) {
      if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) > 0) api.tri(ax, ay, az, cx, cy, cz, bx, by, bz, 0, 1, 0);
      else api.tri(ax, ay, az, bx, by, bz, cx, cy, cz, 0, 1, 0);
    },
    /* Треугольник, положенный на рельеф на высоте lift над землёй.
       Режем его по клеткам сетки и по их диагоналям: каждый кусок лежит
       в одной плоскости с землёй под ним, поэтому ни щелей, ни провалов. */
    dtri (ax, az, bx, bz, cx, cz, lift) {
      if (ZFLOG) {
        const k0 = (cr << 16) | (cg << 8) | cb, q = [k0, k0, k0];
        if (GRAD) { const t3 = [0, 0, 0]; [[ax, az], [bx, bz], [cx, cz]].forEach(([x, z], i) => { GRAD(x, z, t3, 0); q[i] = (t3[0] << 16) | (t3[1] << 8) | t3[2]; }); }
        const st = !ZFTAGS ? '?' : (new Error().stack || '').split('\n').slice(2, 7).map(l => (l.match(/at (?:Object\.)?([\w$.]+) \(/) || [, '?'])[1]).filter(f => !/^(dtri|ribbon|disc|poly|rect|api\.\w+)$/.test(f)).slice(0, 2).join('<') || '?';
        let ti = ZFTAG.get(st); if (ti === undefined) { ti = ZFTAG.size; ZFTAG.set(st, ti); (window.__ZFT = window.__ZFT || []).push(st); }
        ZFLOG.push(ax, az, bx, bz, cx, cz, lift, q[0], q[1], q[2], ZMID * 10000 + ti);
      }
      if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) > 0) {
        let t = bx; bx = cx; cx = t; t = bz; bz = cz; cz = t;
      }
      const cl = (v, n) => (v < 0 ? 0 : v > n ? n : v);
      const i0 = cl(Math.floor((Math.min(ax, bx, cx) - TX0) / TG), TNX - 2);
      const i1 = cl(Math.floor((Math.max(ax, bx, cx) - TX0) / TG), TNX - 2);
      const j0 = cl(Math.floor((Math.min(az, bz, cz) - TZ0) / TG), TNZ - 2);
      const j1 = cl(Math.floor((Math.max(az, bz, cz) - TZ0) / TG), TNZ - 2);
      if (i0 === i1 && j0 === j1) {
        // целиком в одной половинке клетки — резать нечего
        const s = TX0 + i0 * TG + TZ0 + j0 * TG + TG;
        const sa = ax + az - s, sb = bx + bz - s, sc = cx + cz - s;
        if ((sa <= 0 && sb <= 0 && sc <= 0) || (sa >= 0 && sb >= 0 && sc >= 0)) {
          api.tri(ax, groundH(ax, az) + lift, az, bx, groundH(bx, bz) + lift, bz,
                  cx, groundH(cx, cz) + lift, cz, 0, 1, 0);
          return;
        }
      }
      CT[0] = ax; CT[1] = az; CT[2] = bx; CT[3] = bz; CT[4] = cx; CT[5] = cz;
      for (let i = i0; i <= i1; i++) {
        const sx = TX0 + i * TG;
        const n1 = clipHalf(CT, 3, C1, -1, 0, -sx);
        const nx = clipHalf(C1, n1, CX, 1, 0, sx + TG);
        if (nx < 3) continue;
        for (let j = j0; j <= j1; j++) {
          const sz = TZ0 + j * TG;
          const n2 = clipHalf(CX, nx, C2, 0, -1, -sz);
          const np = clipHalf(C2, n2, CP, 0, 1, sz + TG);
          if (np < 3) continue;
          fan(CF, clipHalf(CP, np, CF, 1, 1, sx + sz + TG), lift);
          fan(CF, clipHalf(CP, np, CF, -1, -1, -(sx + sz + TG)), lift);
        }
      }
    },
    /* прямоугольник по осям мира на рельефе */
    rect (x0, z0, x1, z1, lift) {
      api.dtri(x0, z1, x1, z1, x1, z0, lift);
      api.dtri(x0, z1, x1, z0, x0, z0, lift);
    },
    /* лента между двумя точками на рельефе: полотно, тротуар, дорожка */
    ribbon (x1, z1, x2, z2, w, lift) {
      const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz);
      if (l < 0.01) return;
      const nx = -dz / l * w / 2, nz = dx / l * w / 2;
      api.dtri(x1 + nx, z1 + nz, x2 + nx, z2 + nz, x2 - nx, z2 - nz, lift);
      api.dtri(x1 + nx, z1 + nz, x2 - nx, z2 - nz, x1 - nx, z1 - nz, lift);
    },
    /* лента с заданной высотой на концах — настил моста */
    ribbon3 (x1, y1, z1, x2, y2, z2, w) {
      const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz);
      if (l < 0.01) return;
      const nx = -dz / l * w / 2, nz = dx / l * w / 2;
      api.up(x1 + nx, y1, z1 + nz, x2 + nx, y2, z2 + nz, x2 - nx, y2, z2 - nz);
      api.up(x1 + nx, y1, z1 + nz, x2 - nx, y2, z2 - nz, x1 - nx, y1, z1 - nz);
    },
    /* пятно на изломе: без него поворот улицы рвётся */
    disc (x, z, r, lift, seg = 7) {
      for (let i = 0; i < seg; i++) {
        const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2;
        api.dtri(x, z, x + Math.cos(b) * r, z + Math.sin(b) * r, x + Math.cos(a) * r, z + Math.sin(a) * r, lift);
      }
    },
    /* стена дома от y0 до y1 */
    wall (x1, z1, x2, z2, y0, y1) {
      const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz);
      if (l < 0.01) return;
      api.quad(x1, y0, z1, x2, y0, z2, x2, y1, z2, x1, y1, z1, dz / l, 0, -dx / l);
    },
    /* Многоугольник: flat — ровная крыша на высоте y, иначе газон или
       пруд на рельефе на высоте y над землёй. Обход чинят up и dtri. */
    poly (pts, y, flat) {
      const m = pts.length;
      if (m < 3) return;
      V2.length = 0;
      for (let i = 0; i < m; i++) V2.push(new THREE.Vector2(pts[i][0], pts[i][1]));
      let faces;
      try { faces = THREE.ShapeUtils.triangulateShape(V2, []); } catch (e) { return; }
      for (const f of faces) {
        const a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];
        if (flat) api.up(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1]);
        else api.dtri(a[0], a[1], b[0], b[1], c[0], c[1], y);
      }
    },
    /* Город режем на клетки по сто метров: один меш на весь город
       рисовался целиком, даже то, что за спиной, — миллион треугольников
       каждый кадр. Клетку, которая не в кадре, three.js пропускает сам.
       Треугольник идёт в клетку своего центра; огромные (юбка до
       горизонта, гладь реки) — в отдельную общую. */
    /* keep — поздняя сборка (latebuild.js): меши того, что есть сейчас, а клетки не сбрасываем. Следующий
       mesh() допишет в те же клетки: у клетки с прибавкой меш получает новую склейку (старая — из видеокарты
       вон), новые клетки — новые меши. Так кусков и вызовов отрисовки столько же, как при сборке разом */
    mesh (mat, keep) {
      const grp = new THREE.Group();
      const geo = B => {
        // хвост запаса не копируем: вид на тот же буфер, после загрузки его отпустит dropArr
        const P = B.pos.subarray(0, B.n * 3), Cc = B.col.subarray(0, B.n * 3);
        const g = new THREE.BufferGeometry();
        const pa = new THREE.BufferAttribute(P, 3), ca = new THREE.BufferAttribute(Cc, 3, true);
        g.setAttribute('position', pa);
        g.setAttribute('color', ca);
        boundSphere(g);
        // после загрузки в видеокарту копия в памяти JS не нужна
        pa.onUpload(dropArr); ca.onUpload(dropArr);
        return g;
      };
      for (const B of BK) {
        if (B.me) {                                   // клетка уже с мешем (keep): дописалось — склейка заново
          if (B.n > B.n0) { const old = B.me.geometry; B.me.geometry = geo(B); old.dispose(); }
          continue;
        }
        // статика не двигается: матрицы не пересчитываем каждый кадр —
        // в Северске таких кусков десятки тысяч, обход съедал десятую часть кадра
        const me = new THREE.Mesh(geo(B), mat);
        me.matrixAutoUpdate = false;
        grp.add(me);
        if (keep) { B.me = me; B.n0 = B.n; }
      }
      grp.matrixAutoUpdate = false;
      grp.matrixWorldAutoUpdate = false;
      if (keep) return grp;
      // исходные массивы больше не нужны: меши собраны по клеткам. В Северске
      // они весили за гигабайт и держались в памяти всю игру
      BUILT_TRIS += n / 3;
      n = 0; ids = new Map(); BK = []; lastK = NaN; lastB = null;
      return grp;
    },
    verts () { return n; },
  };
  return api;
}

let BUILT_TRIS = 0;         // сколько треугольников статики собрано (для отладки)
const BYTE_RGB = new Map(); // цвет склейки байтами: '#a2b3c4' → 0xa2b3c4 после перевода в линейный
/* computeBoundingSphere three.js, только простыми циклами: тот же центр
   (середина коробки) и тот же радиус, а на миллионах вершин — в разы быстрее */
function boundSphere (g) {
  const a = g.attributes.position.array, n = a.length;
  if (!n) { g.computeBoundingSphere(); return g.boundingSphere; }
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i += 3) {
    const x = a[i], y = a[i + 1], z = a[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5, cz = (z0 + z1) * 0.5;
  let r2 = 0;
  for (let i = 0; i < n; i += 3) {
    const dx = cx - a[i], dy = cy - a[i + 1], dz = cz - a[i + 2], d = dx * dx + dy * dy + dz * dz;
    if (d > r2) r2 = d;
  }
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.sqrt(r2));
  return g.boundingSphere;
}
function dropArr () { this.array = null; }
// клетка статики, метров: по ним отсекается то, что не в кадре. Большому
// городу — крупнее: сорок тысяч мелких кусков дороже обходить, чем дорисовать лишнее
const CHUNK = MAP.border ? 200 : 100;
WINS.init(CHUNK);
// окна с комнатами — настройка графики (gfx.js): на Низкой комнаты за стеклом нет — рама, шторы и свет остаются (windows.js)
WINS.quality(GFX.winQ());
const LITM = Mesher();      // всё материальное: земля, дороги, дома
const FLATM = Mesher();     // разметка, окна, вывески — света не ловят

/* ── земля, зелёнка, вода ── */
/* 09.10.2026 (автор: «трава зелёная насыщенная, песочек рыжий»): зелень сочнее (было park #9ed07f, green #a2cf86,
   pitch #8dcd93, cem #aacd93, земля #a2d086…#bcd293 — бледно-салатовая), площадки — тёплый рыжий песок (было #d3bd88) */
const GREEN_HEX = {
  park: '#86c862', green: '#8cc96a', pitch: '#78c47c',
  play: '#e0b26e', cem: '#98c47a', water: '#6fb0c9',
};

/* цвет земли: пойма сочнее, на горе суше, дно под водой песчаное */
const GROUND_LOW = new THREE.Color('#8ccb6a'), GROUND_HIGH = new THREE.Color('#a4c96e');
const GROUND_BED = '#c9c08f', GC = new THREE.Color();
// высоты в карте — с шагом в десять сантиметров, разных значений немного: цвет по высоте — в памяти
const GROUND_HEX = new Map();
function groundHex (h) {
  if (h < 0) return GROUND_BED;
  let c = GROUND_HEX.get(h);
  if (c === undefined) GROUND_HEX.set(h, c = '#' + GC.copy(GROUND_LOW).lerp(GROUND_HIGH, clamp(h / 55, 0, 1)).getHexString());
  return c;
}

function osmGround () {
  // сама сетка рельефа: по два треугольника на клетку, диагональ та же,
  // что в groundH
  const hAt = (i, j) => TH[j * TNX + i];
  const cell = (i, j) => {
    const x0 = TX0 + i * TG, x1 = x0 + TG, z0 = TZ0 + j * TG, z1 = z0 + TG;
    const h00 = hAt(i, j), h10 = hAt(i + 1, j), h01 = hAt(i, j + 1), h11 = hAt(i + 1, j + 1);
    LITM.color(groundHex((h00 + h10 + h01) / 3));
    LITM.up(x0, h00, z0, x1, h10, z0, x0, h01, z1);
    LITM.color(groundHex((h11 + h10 + h01) / 3));
    LITM.up(x1, h11, z1, x0, h01, z1, x1, h10, z0);
  };
  /* Далеко за забором (карта с границей) земля — крупными кусками по
     четыре клетки: туда не проехать, а мелкая сетка на полгорода за
     оградой весила миллион треугольников. */
  const K = 4;
  for (let bj = 0; bj < TNZ - 1; bj += K)
    for (let bi = 0; bi < TNX - 1; bi += K) {
      const ei = Math.min(bi + K, TNX - 1), ej = Math.min(bj + K, TNZ - 1);
      const x0 = TX0 + bi * TG, z0 = TZ0 + bj * TG, x1 = TX0 + ei * TG, z1 = TZ0 + ej * TG;
      if (DMASK && farOut(x0, z0) && farOut(x1, z0) && farOut(x0, z1) && farOut(x1, z1) && farOut((x0 + x1) / 2, (z0 + z1) / 2)) {
        const h00 = hAt(bi, bj) - 0.3, h10 = hAt(ei, bj) - 0.3, h01 = hAt(bi, ej) - 0.3, h11 = hAt(ei, ej) - 0.3;
        LITM.color(groundHex((h00 + h10 + h01) / 3)); LITM.up(x0, h00, z0, x1, h10, z0, x0, h01, z1);
        LITM.color(groundHex((h11 + h10 + h01) / 3)); LITM.up(x1, h11, z1, x0, h01, z1, x1, h10, z0);
        continue;
      }
      for (let j = bj; j < ej; j++) for (let i = bi; i < ei; i++) cell(i, j);
    }
  // Юбка до горизонта: край сетки тянем наружу на той же высоте,
  // иначе за городом земля обрывается ступенькой в пустоту.
  const far = 1400;
  const gx1 = TX0 + (TNX - 1) * TG, gz1 = TZ0 + (TNZ - 1) * TG;
  const skirt = (ax, az, ha, bx, bz, hb, ox, oz) => {
    LITM.color(groundHex((ha + hb) / 2));
    LITM.up(ax, ha, az, bx, hb, bz, bx + ox, hb, bz + oz);
    LITM.up(ax, ha, az, bx + ox, hb, bz + oz, ax + ox, ha, az + oz);
  };
  for (let i = 0; i < TNX - 1; i++) {
    const xa = TX0 + i * TG, xb = xa + TG;
    skirt(xa, TZ0, hAt(i, 0), xb, TZ0, hAt(i + 1, 0), 0, -far);
    skirt(xa, gz1, hAt(i, TNZ - 1), xb, gz1, hAt(i + 1, TNZ - 1), 0, far);
  }
  for (let j = 0; j < TNZ - 1; j++) {
    const za = TZ0 + j * TG, zb = za + TG;
    skirt(TX0, za, hAt(0, j), TX0, zb, hAt(0, j + 1), -far, 0);
    skirt(gx1, za, hAt(TNX - 1, j), gx1, zb, hAt(TNX - 1, j + 1), far, 0);
  }
  for (const [cx, cz, i, j, sx, sz] of [[TX0, TZ0, 0, 0, -1, -1], [gx1, TZ0, TNX - 1, 0, 1, -1],
                                        [TX0, gz1, 0, TNZ - 1, -1, 1], [gx1, gz1, TNX - 1, TNZ - 1, 1, 1]]) {
    const h = hAt(i, j);
    LITM.color(groundHex(h));
    LITM.up(cx, h, cz, cx + sx * far, h, cz, cx + sx * far, h, cz + sz * far);
    LITM.up(cx, h, cz, cx + sx * far, h, cz + sz * far, cx, h, cz + sz * far);
  }

  // Томь — одна ровная гладь на нуле: дно под ней на три метра ниже,
  // берег выше, и кромка воды получается сама там, где земля уходит вниз
  // Вода — свой меш и шейдер (water.js): волны, отражения, пена, круги от дождя; тут — только сборка
  WATER.build({ THREE, scene, Mesher, seasonMat: SEAS.seasonMat, gfx: GFX, TH, ter: { g: TG, nx: TNX, nz: TNZ, x0: TX0, z0: TZ0 },
    rect: [TX0 - far, TZ0 - far, gx1 + far, gz1 + far], env: () => ENV, sun, snowAmt: SEAS.snowAmt, groundH,
    ponds: STREAMS.STATS.on ? [] : CITY.green.filter(g => g.k === 'water' && !(DMASK && g.p.every(q => farOut(q[0], q[1])))).map(g => g.p) });
  // речки и пруды — свой меш тем же шейдером, берег и камыш — в статике (streams.js)
  STREAMS.build({ WATER, LITM, Mesher, RSEG, CITY, groundH, surfaceAt, splash, Snd, CHAT, Store, toast: m => toast(m),
    get V () { return V; }, live: () => ['drive', 'back', 'handover', 'side'].includes(S.state) && !S.paused });
  // лёд зимой: треск, трещины, полынья, торосы у пляжа (ice.js)
  ICEM.init({ THREE, scene, WATER, STREAMS, BEACH, groundH, Snd, CHAT, Store, ADULT, splash, get V () { return V; },
    shake: k => { S.shake = Math.max(S.shake, k); } });

  for (const g of CITY.green) {
    if (DMASK && g.p.every(q => farOut(q[0], q[1]))) continue;      // за забором далеко — не рисуем
    if (g.k === 'water') continue;                                   // пруды — в воде (water.js)
    const gh = FOREST.isForest(g) ? FOREST.FOREST.FLOOR : GREEN_HEX[g.k] || '#84c164';
    LITM.color(gh);   // в ельнике земля темнее (forest.js)
    // разные зелёные куски (парк поверх двора, ельник поверх газона) — не на одной высоте: мерцали на стыке (О3)
    LITM.poly(g.p, g.k === 'water' ? 0.03 : 0.04 + flatRank(GREEN_RANK, gh, 5) * 0.0007);
  }
}

/* ── улицы: тротуар пошире, поверх него полотно, сверху осевая ── */
/* У бульвара (r.g — ширина газона, её считает генератор карты) между
   полотном и тротуаром — полоса травы с деревьями, плитка шире на два газона */
const SIDEWALK = r => roadWidth(r) + (r.c <= 5 ? 5.5 : 2) + (r.g || 0) * 2;

function osmRoads () {
  // промзоны и площадки — чуть другим цветом земли, под всем остальным
  for (const lot of CITY.lots) {
    if (lot.k === 'park' || (DMASK && lot.p.every(q => farOut(q[0], q[1])))) continue;
    LITM.color(lot.k === 'ind' ? '#c9c8bb' : '#cfcabd');
    LITM.poly(lot.p, lot.k === 'ind' ? 0.025 : 0.0265);   // промзона и площадка внахлёст — на разной высоте (О3)
  }
  // дорожки во дворах и парках: светлая плитка, по ним гуляют коллеги; вид плитки — world.js
  // разная плитка внахлёст — на 0,8 мм друг над другом (О3: на перекрёстке дорожек мерцало)
  for (const q of CITY.paths) {
    const ph = WORLD.pavePath(q), py = 0.07 + WORLD.paveStep(ph) * 0.0008;
    LITM.color(ph);
    for (let i = 1; i < q.length; i++) {
      LITM.ribbon(q[i - 1][0], q[i - 1][1], q[i][0], q[i][1], 2.0, py);
      if (i < q.length - 1) LITM.disc(q[i][0], q[i][1], 1, py, 6);
    }
  }
  RW.prepJoints(roadWidth);                        // где стык разных видов асфальта — плавный переход (roadwear.js)
  for (const pass of [0, 1]) {
    for (const r of CITY.roads) {
      if (r.b) continue;                          // мосты кладутся отдельно, над водой
      const w = pass ? roadWidth(r) : SIDEWALK(r);
      // На перекрёстке два полотна лежат в одной плоскости и мерцают.
      // Главная чуть выше второстепенной — поверх и рисуется.
      // Внутри класса — своя ступенька по виду асфальта (roadwear.js) и по плитке тротуара: два разных
      // полотна одного класса больше не лежат на одной высоте и не мерцают на стыке
      const pv = pass ? '' : WORLD.paveRoad(r);
      const y = (pass ? 0.14 : 0.09) + (7 - r.c) * 0.004 + (pass ? RW.rankY(r) : paveRank(pv));
      LITM.color(pass ? RW.roadHex(r, ROAD_HEX[r.c]) : pv);   // полотно — по виду асфальта (roadwear.js); тротуар: гладкий, брусчатка или в крапинку (world.js)
      // стык с другим видом асфальта — плавно: конец полотна перекрашен по месту (roadwear.js)
      const jp = pass ? RW.jointPts(r) : null;
      if (jp) LITM.grad(RW.jointGrad(r));
      const p = jp || r.p;
      for (let i = 1; i < p.length; i++) {
        LITM.ribbon(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1], w, y);
        if (jp && !p[i][2]) continue;                // добавленная точка перехода — на прямой, пятно не нужно
        // пятно на изломе и на перекрёстке: без него угол улицы рвётся
        const n = NODE_IDX.get(p[i][0] + ',' + p[i][1]);
        if (i < p.length - 1 || (n !== undefined && nodeDeg(n) >= 2)) LITM.disc(p[i][0], p[i][1], w / 2, y, 9);
      }
      if (jp) LITM.grad(null);
      if (pass) RW.decorate(LITM, r, w, y, (x, z) => { const n = NODE_IDX.get(x + ',' + z); return n !== undefined && nodeDeg(n) >= 3; });   // заплатки
    }
  }
}
/* ступенька тротуара по плитке (0—2,6 мм внутри класса): разная плитка одного класса — не на одной высоте.
   Шаг 1,3 мм (до 09.10.2026 — 0,5 мм: вдали точности глубины не хватало, стык тротуаров мерцал, О3);
   плитки три (world.js PAVE: гладкая, брусчатка, в крапинку) — до тротуара класса старше (+4 мм) тоже 1,3 мм */
function paveRank (hex) { return WORLD.paveStep(hex) * 0.0013; }
/* номер цвета в своём списке (первый встреченный — 0), не больше max: ступенька высоты для кусков, что лежат внахлёст */
const GREEN_RANK = new Map();
function flatRank (M, hex, max) {
  let k = M.get(hex);
  if (k === undefined) M.set(hex, k = Math.min(max, M.size));
  return k;
}

/* ── бордюры ──
   Тротуар — не просто светлая полоса: вдоль улицы он поднят над
   асфальтом на двадцать восемь сантиметров, по краю — бордюрный камень.
   У перекрёстков и зебр бордюр опущен (там, где машина уходит в дугу,
   поднятого тротуара нет), как и там, где тротуар одной улицы
   ложится на асфальт другой — у разделённых проспектов и дворовых
   проездов. Где тротуар поднят — помним по клеткам в метр: по ним
   машину подкидывает на бордюре, а люди стоят на тротуаре, а не в нём. */
const CURB_H = 0.28;
/* Клеток поднятого тротуара в Северске — сотни тысяч: обычный Set на них
   медленно растёт при сборке и медленнее отвечает в кадре. Тут — битовая
   карта по ключу rkey (64 млн клеток — 8 МБ) плюс список в порядке
   добавления для обхода; ключи вне карты — в запасной Set */
class CellSet {
  constructor (n) { this.n = n; this.bits = new Uint8Array((n >> 3) + 1); this.list = []; this.extra = new Set(); this.size = 0; }
  has (k) { return k >= 0 && k < this.n ? ((this.bits[k >> 3] >> (k & 7)) & 1) === 1 : this.extra.has(k); }
  add (k) {
    if (k >= 0 && k < this.n) { const b = k >> 3, m = 1 << (k & 7); if (this.bits[b] & m) return this; this.bits[b] |= m; }
    else { if (this.extra.has(k)) return this; this.extra.add(k); }
    this.list.push(k); this.size++;
    return this;
  }
  [Symbol.iterator] () { return this.list[Symbol.iterator](); }
}
const RAISED = new CellSet(8000 * 8000);
const rkey = (x, z) => (Math.round(x) + 4000) * 8000 + (Math.round(z) + 4000);
const curbAt = (x, z) => (RAISED.has(rkey(x, z)) ? CURB_H : 0);

function osmCurbs () {
  const SW0 = 2.75, STEP = 6;
  // плоская лента по высотам концов: на шести метрах склон почти прямой,
  // а треугольников вчетверо меньше, чем у ленты, нарезанной по рельефу
  const flat = (x1, z1, x2, z2, w, lift) =>
    LITM.ribbon3(x1, groundH(x1, z1) + lift, z1, x2, groundH(x2, z2) + lift, z2, w);
  for (const r of CITY.roads) {
    if (!drivable(r) || r.b || r.c > 5) continue;
    const w = roadWidth(r), SW = r.g || SW0;             // у бульвара за бордюром — газон
    for (let i = 1; i < r.p.length; i++) {
      const a = NODE_IDX.get(r.p[i - 1][0] + ',' + r.p[i - 1][1]), b = NODE_IDX.get(r.p[i][0] + ',' + r.p[i][1]);
      const e = a !== undefined && b !== undefined ? edgeOf(a, b) : null;
      if (!e) continue;
      const zebs = (ZEB_BY_EDGE.get(ukey(a, b)) || []).map(zb => (zb.a === a ? zb.d : e.len - zb.d));
      const d0 = nodeDeg(a) >= 3 ? e.tA + 0.5 : 0, d1 = e.len - (nodeDeg(b) >= 3 ? e.tB + 0.5 : 0);
      const A = NODES[a];
      for (const sd of [-1, 1]) {
        for (let d = d0; d < d1 - 0.2; d += STEP) {
          const dd = Math.min(d1, d + STEP);
          if (zebs.some(z => z > d - ZW / 2 - 1 && z < dd + ZW / 2 + 1)) continue;       // у зебры бордюр опущен
          const m = (d + dd) / 2;
          const cx = A.x + e.ux * m + e.rx * sd * (w / 2 + SW / 2), cz = A.z + e.uz * m + e.rz * sd * (w / 2 + SW / 2);
          // тротуар не должен ложиться на чужое полотно и в дом
          const other = nearestRoad(cx, cz, 7, 1);
          if (other && other.d < other.seg.w / 2 + 0.3 && other.seg.w !== w) continue;
          if (other && other.d < w / 2 - 0.1) continue;
          if (inHouse(cx, cz)) continue;
          if (MAPFIX && MAPW.curbOnAsphalt(CITY, A.x, A.z, e, d, dd, sd, w, SW)) continue;   // и краем — тоже (mapworks.js)
          const o1 = sd * (w / 2), o2 = sd * (w / 2 + SW);
          const p = (dist, o) => [A.x + e.ux * dist + e.rx * o, A.z + e.uz * dist + e.rz * o];
          const [ax, az] = p(d, o1), [bx, bz] = p(dd, o1);
          const mid = (o1 + o2) / 2;
          const [sx1, sz1] = p(d, mid), [sx2, sz2] = p(dd, mid);
          LITM.color(r.g ? groundHex(groundH(sx1, sz1)) : WORLD.paveRoad(r));
          flat(sx1, sz1, sx2, sz2, SW, CURB_H + 0.02);
          // бордюрный камень: светлая кромка сверху и грань к дороге
          const [kx1, kz1] = p(d, sd * (w / 2 + 0.12)), [kx2, kz2] = p(dd, sd * (w / 2 + 0.12));
          LITM.color('#f1ede6');
          flat(kx1, kz1, kx2, kz2, 0.24, CURB_H + 0.03);
          LITM.color('#b9b4ab');
          const ga = groundH(ax, az), gb = groundH(bx, bz);
          LITM.quad(ax, ga + 0.12, az, bx, gb + 0.12, bz, bx, gb + CURB_H + 0.03, bz, ax, ga + CURB_H + 0.03, az, e.rx * -sd, 0, e.rz * -sd);
          for (let t = d; t <= dd; t += 1)
            for (let o = w / 2 + 0.5; o < w / 2 + SW; o += 0.9) {
              const so = sd * o;                    // как p(t, sd * o), без массива на каждую клетку
              RAISED.add(rkey(A.x + e.ux * t + e.rx * so, A.z + e.uz * t + e.rz * so));
            }
        }
      }
    }
  }
}

/* ── разметка ──
   По правилам, как в Москве: на больших двусторонних — двойная
   сплошная, на улицах поменьше — прерывистая осевая, между полосами
   одного направления — прерывистая, по краю больших — сплошная. У
   перекрёстка разметка обрывается там же, где машина уходит в дугу, а
   вокруг зебры — за метр до неё. Стоп-линия — перед зеброй
   регулируемого въезда, на своей половине полотна. */
function osmMarkings () {
  FLATM.color('#f2efe6');
  const Y = 0.2;
  const seg = (e, o, d0, d1, wd) => {
    if (d1 - d0 < 0.3) return;
    const A = NODES[e.a];
    FLATM.ribbon(A.x + e.ux * d0 + e.rx * o, A.z + e.uz * d0 + e.rz * o,
                 A.x + e.ux * d1 + e.rx * o, A.z + e.uz * d1 + e.rz * o, wd, Y);
  };
  const DASH = 3, GAP = 6;
  for (const r of CITY.roads) {
    if (!drivable(r) || r.b || r.c > 4) continue;
    let acc = 0;
    for (let i = 1; i < r.p.length; i++) {
      const a = NODE_IDX.get(r.p[i - 1][0] + ',' + r.p[i - 1][1]), b = NODE_IDX.get(r.p[i][0] + ',' + r.p[i][1]);
      const e = a !== undefined && b !== undefined ? edgeOf(a, b) : null;
      if (!e || e.road !== r) { if (e) acc += e.len; continue; }
      const cut0 = nodeDeg(a) >= 3 ? e.tA + 1.2 : 0, cut1 = nodeDeg(b) >= 3 ? e.tB + 1.2 : 0;
      // куски без зебр: разметка через зебру не идёт
      let spans = [[cut0, e.len - cut1]];
      for (const zb of ZEB_BY_EDGE.get(ukey(a, b)) || []) {
        const d = zb.a === a ? zb.d : e.len - zb.d, z0 = d - ZW / 2 - 1, z1 = d + ZW / 2 + 1;
        spans = spans.flatMap(([s0, s1]) => (z1 <= s0 || z0 >= s1) ? [[s0, s1]] : [[s0, z0], [z1, s1]]);
      }
      // и стоп-линии: за ними на своей стороне — только зебра
      const n = e.two ? e.lanes || Math.max(1, Math.round(e.w / 3.3)) : laneCount(e), lw = (e.oneway ? e.w : e.w / 2) / n;   // разметка односторонней в тупик — как была (deadends.js)
      for (const [s0, s1] of spans) {
        if (s1 - s0 < 0.5) continue;
        const dashed = (o, wd) => {
          for (let d = s0 - ((acc + s0) % (DASH + GAP)); d < s1; d += DASH + GAP)
            seg(e, o, Math.max(s0, d), Math.min(s1, d + DASH), wd);
        };
        if (!e.oneway && !NAR.narrow(e)) {           // узкая — одна полоса, без осевой (narrow.js)
          if (e.c <= 2 || n >= 2) { seg(e, 0.18, s0, s1, 0.13); seg(e, -0.18, s0, s1, 0.13); }
          else if (e.w >= 7.5) dashed(0, 0.14);
          for (let k = 1; k < n; k++) { dashed(e.w / 2 - lw * k, 0.12); dashed(-(e.w / 2 - lw * k), 0.12); }
        } else for (let k = 1; k < n; k++) dashed(e.w / 2 - lw * k, 0.12);
        if (e.c <= 3 && e.w >= 9) { seg(e, e.w / 2 - 0.35, s0, s1, 0.13); seg(e, -(e.w / 2 - 0.35), s0, s1, 0.13); }
      }
      acc += e.len;
    }
  }
  // стоп-линии регулируемых въездов
  for (const g of SIG_GROUPS)
    for (const e of g.app) {
      const B = NODES[e.b], d = e.stopAt - 0.3;
      const x = B.x - e.ux * d, z = B.z - e.uz * d;
      const o0 = e.oneway ? -e.w / 2 + 0.3 : 0.3, o1 = e.w / 2 - 0.3;
      FLATM.ribbon(x + e.rx * o0, z + e.rz * o0, x + e.rx * o1, z + e.rz * o1, 0.5, Y);
    }
  // зебры: белые полосы вдоль движения, поперёк — во всю ширину полотна
  for (const zb of ZEBRAS) {
    const e = zb.e, A = NODES[zb.a], d = zb.d;
    const m = Math.floor((e.w - 0.6) / 1.15);
    for (let i = 0; i < m; i++) {
      const o = -((m - 1) * 1.15) / 2 + i * 1.15;
      FLATM.ribbon(A.x + e.ux * (d - ZW / 2) + e.rx * o, A.z + e.uz * (d - ZW / 2) + e.rz * o,
                   A.x + e.ux * (d + ZW / 2) + e.rx * o, A.z + e.uz * (d + ZW / 2) + e.rz * o, 0.6, Y + 0.005);
    }
  }
}

/* ── край карты ──
   Улицы нарисованы и за краем, до горизонта, а машину там держит рамка.
   Без знака это невидимая стена: едешь по Ленина на север — и встал.
   Поэтому там, где улица пересекает рамку, ставим перекрытие: бетонные
   блоки и полосатый щит поперёк полотна. */
let CLOSED_MAT = null;
function closedSign () {
  if (CLOSED_MAT) return CLOSED_MAT;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 40;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 40);
  x.strokeStyle = '#d9342c'; x.lineWidth = 5; x.strokeRect(3, 3, 122, 34);
  x.fillStyle = '#d9342c'; x.font = 'bold 13px sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText($t('ДОРОГА'), 64, 14); x.fillText($t('ЗАКРЫТА'), 64, 28);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return (CLOSED_MAT = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
}

/* перекрытие поперёк полотна: щит в полоску, знак, бетонные блоки.
   u — наружу, за рамку */
function edgeBlock (x, z, ux, uz, w) {
  const nx = -uz, nz = ux, ry = Math.atan2(-ux, -uz);
  const y = groundH(x, z);
  const n = Math.max(3, Math.round(w / 1.6));
  for (let k = 0; k < n; k++) {
    const o = (k + 0.5) / n * w - w / 2;
    box(LIT, w / n, 0.5, 0.2, k % 2 ? '#f2eee6' : '#d9342c', x + nx * o, y + 1.25, z + nz * o, ry);
  }
  for (const s of [-1, 1]) {
    box(LIT, 0.25, 1.6, 0.25, '#585460', x + nx * (w / 2) * s, y + 0.7, z + nz * (w / 2) * s, ry);
  }
  // знак над щитом, на двух стойках: видно издалека, с любой стороны
  for (const s of [-1, 1])
    box(LIT, 0.16, 3.4, 0.16, '#585460', x + nx * 1.9 * s, y + 1.7, z + nz * 1.9 * s, ry);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), closedSign());
  sign.position.set(x - ux * 0.05, y + 3.0, z - uz * 0.05);
  sign.rotation.y = ry;
  scene.add(sign);
  for (let k = 0; k < Math.ceil(w / 2.6); k++) {
    const o = (k + 0.5) * 2.6 - w / 2;
    box(LIT, 2.3, 0.8, 0.9, '#bdb6ab', x + nx * o + ux * 0.8, y + 0.35, z + nz * o + uz * 0.8, ry);
  }
  obb(x + ux * 0.4, z + uz * 0.4, w / 2 + 0.5, 0.8, Math.atan2(nz, nx));
}

function osmEdgeBlocks () {
  // у карты с границей по забору — свои края: КПП на выездах, остальное перекрыто
  if (BORDER) { borderEdges(); return; }
  const B = BOUNDS, into = 3;
  const inside = (x, z) => x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
  const done = [];
  for (const r of CITY.roads) {
    if (r.c > DRIVE_MAX || r.b) continue;
    const w = roadWidth(r) + 2;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
      const a = inside(x1, z1), b = inside(x2, z2);
      if (a === b) continue;
      // точка пересечения с рамкой — делением пополам, отрезок короткий
      let lo = 0, hi = 1;
      for (let k = 0; k < 24; k++) {
        const t = (lo + hi) / 2;
        (inside(lerp(x1, x2, t), lerp(z1, z2, t)) === a ? (lo = t) : (hi = t));
      }
      const len = Math.hypot(x2 - x1, z2 - z1) || 1;
      let ux = (x2 - x1) / len, uz = (z2 - z1) / len;
      if (!a) { ux = -ux; uz = -uz; }                  // u — наружу, за рамку
      const x = lerp(x1, x2, lo) - ux * into, z = lerp(z1, z2, lo) - uz * into;
      if (done.some(q => Math.hypot(q[0] - x, q[1] - z) < 8)) continue;
      done.push([x, z]);
      edgeBlock(x, z, ux, uz, w);
    }
  }
}

/* Северск: вдоль всей границы забор, на дорогах через неё — КПП (из карты)
   или перекрытие, если КПП там нет */
const KPPS = [];
function borderEdges () {
  CBITS.buildFence(cityApi(), CITY.fence || [BORDER.concat([BORDER[0]])]);
  for (const k of CITY.kpp || []) KPPS.push(CBITS.buildKpp(cityApi(), k));
  for (const [x, z, ux, uz, w] of CITY.closed || []) edgeBlock(x, z, ux, uz, (w || 8) + 2);
  if (MAP.open) openEdges();
}

/* Северск пока открыт у пиццерии (MAP.open): по линии за кольцом — тот же
   бетонный забор, но не сквозь дома и не поперёк улиц; на улицах через
   линию — перекрытие «дорога закрыта». Рёбра графа за линией закрыты:
   трафик туда не сворачивает, навигатор туда не ведёт. */
function openEdges () {
  const O = MAP.open, Z = O.z;
  const crosses = [];
  for (const r of CITY.roads) {
    if (!drivable(r) || r.c > DRIVE_MAX || r.b) continue;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
      if ((z1 >= Z) === (z2 >= Z)) continue;
      const t = (Z - z1) / (z2 - z1), x = lerp(x1, x2, t);
      if (!O.fence.some(f => x > f[0][0] && x < f[1][0])) continue;
      const len = Math.hypot(x2 - x1, z2 - z1) || 1;
      let ux = (x2 - x1) / len, uz = (z2 - z1) / len;
      if (uz > 0) { ux = -ux; uz = -uz; }           // u — наружу, на север, за линию
      const w = roadWidth(r) + 2;
      if (crosses.some(q => Math.abs(q.x - x) < q.w / 2 + w / 2)) continue;
      crosses.push({ x, w: w / Math.max(0.3, Math.abs(uz)) });
      edgeBlock(x + ux * 4, Z + uz * 4, ux, uz, w);
    }
  }
  // забор кусками: не сквозь дома и не поперёк проезжей части
  const lines = [];
  for (const f of O.fence) {
    let cur = null;
    for (let x = f[0][0]; x <= f[1][0]; x += 3) {
      const road = crosses.some(q => Math.abs(q.x - x) < q.w / 2 + 1);
      if (road || inHouse(x, Z, 0.8)) { if (cur && cur.length > 1) lines.push(cur); cur = null; continue; }
      (cur = cur || []).push([x, Z]);
    }
    if (cur && cur.length > 1) lines.push(cur);
  }
  CBITS.buildFence(cityApi(), lines);
}

/* ── мосты: настил, балки, перила и быки ──
   Настил режем на шаги по шесть метров — по ним же идёт горб. Перила —
   препятствие: с Коммунального в Томь не слетишь. */
function osmBridges () {
  for (const b of BRIDGES) {
    const r = b.road, w = roadWidth(r), ws = SIDEWALK(r);
    const dx = b.x2 - b.x1, dz = b.z2 - b.z1, len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
    const n = Math.max(1, Math.ceil(len / 6));
    const P = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = b.x1 + dx * t, z = b.z1 + dz * t;
      P.push([x, deckAt(b, t, x, z), z]);
    }
    const edge = ws / 2;
    for (let k = 1; k <= n; k++) {
      const [x1, y1, z1] = P[k - 1], [x2, y2, z2] = P[k];
      LITM.color('#e3ded4'); LITM.ribbon3(x1, y1 + 0.09, z1, x2, y2 + 0.09, z2, ws);
      LITM.color(ROAD_HEX[r.c]); LITM.ribbon3(x1, y1 + 0.14, z1, x2, y2 + 0.14, z2, w);
      // балки по краям и низ настила
      for (const s of [-1, 1]) {
        const ex1 = x1 + nx * edge * s, ez1 = z1 + nz * edge * s, ex2 = x2 + nx * edge * s, ez2 = z2 + nz * edge * s;
        LITM.color('#b9b2a8');
        LITM.quad(ex1, y1 - 1.8, ez1, ex2, y2 - 1.8, ez2, ex2, y2 + 0.09, ez2, ex1, y1 + 0.09, ez1, 0, 0, 0);
        LITM.color('#6d6874');
        LITM.quad(ex1, y1 + 0.09, ez1, ex2, y2 + 0.09, ez2, ex2, y2 + 1.0, ez2, ex1, y1 + 1.0, ez1, 0, 0, 0);
      }
      LITM.color('#a39c93'); LITM.ribbon3(x1, y1 - 1.8, z1, x2, y2 - 1.8, z2, ws);
      if (r.c <= 3 && !r.o && (k % 2)) {
        FLATM.color('#f2efe6');
        FLATM.ribbon3(lerp(x1, x2, 0.2), lerp(y1, y2, 0.2) + 0.19, lerp(z1, z2, 0.2),
                      lerp(x1, x2, 0.8), lerp(y1, y2, 0.8) + 0.19, lerp(z1, z2, 0.8), 0.4);
      }
    }
    // быки — там, где под настилом есть глубина
    const piers = Math.floor(len / 55);
    for (let k = 1; k <= piers; k++) {
      const t = k / (piers + 1), x = b.x1 + dx * t, z = b.z1 + dz * t;
      const top = deckAt(b, t, x, z) - 1.8, bot = Math.min(groundH(x, z), 0) - 1;
      if (top - bot < 4) continue;
      box(LIT, 3, top - bot, ws - 2, '#aaa398', x, (top + bot) / 2, z, Math.atan2(nx, nz));
    }
    // Перила — препятствие, но только там, где настил и правда высоко:
    // у концов он лежит почти на земле, и под ним проходят улицы (Сенная
    // Курья у левого берега). Препятствия в игре плоские, без высоты,
    // поэтому кусок перил помнит высоту настила (deckY) — и держит только
    // того, кто едет по мосту, а не под ним.
    // Высокие куски подряд сливаем в одну коробку: на стыке коротких
    // коробок машину, скребущую перила, выталкивало вдоль них назад, и она
    // вставала посреди моста.
    let run = null;
    const flush = () => {
      if (!run) return;
      const [ax, , az] = P[run.a], [bx, , bz] = P[run.b];
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, hl = Math.hypot(bx - ax, bz - az) / 2;
      for (const s of [-1, 1]) {
        const rail = obb(cx + nx * (edge + 0.4) * s, cz + nz * (edge + 0.4) * s, hl, 0.4, Math.atan2(uz, ux));
        rail.deckY = run.y;
        rail.rail = true;
      }
      run = null;
    };
    for (let k = 1; k <= n; k++) {
      const [x1, y1, z1] = P[k - 1], [x2, y2, z2] = P[k];
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, my = Math.min(y1, y2);
      if (my - Math.max(groundH(mx, mz), 0) < 2.5) { flush(); continue; }
      if (!run) run = { a: k - 1, b: k, y: my };
      else { run.b = k; run.y = Math.min(run.y, my); }
    }
    flush();
  }
}

/* ── списки, которые дальше читает вся игра ── */
const LAMPH = [];    // плафоны фонарей: ночью горят, поэтому отдельно от FLAT
const LAMP_SPOTS = [];   // где под фонарём ночью пятно света
const LIT = [];      // ламберт: реквизит, который всё-таки удобнее склеить
const FLAT = [];     // бейсик: вывески и стёкла
const HOUSES = [];   // дома с адресом — куда возят пиццу
const PARKED = [];   // припаркованные машины у бордюра
const PARKINGS = []; // парковки: центр и въезд, на въезде может стоять шлагбаум
const RINGS = [];    // тротуарные кольца вокруг домов — маршруты прохожих
const YARD_RINGS = []; // дорожки по паркам и дворам
let PIZZA = null;    // пиццерия, она же начало смены

/* ─── дома, деревья, фонари ─── */
const WALLS = ['#e9bcc8', '#c7d9ef', '#f0dcae', '#c2e0cd', '#d9c8ea', '#eecfb4', '#e6d3c0'];

/* пятно под кружок вступления: ни деревьев, ни фонарей, ни лавочек —
   иначе ствол встаёт между камерой и коробкой */
const introClear = () => false;

function tree (x, z, strip = 0, kind) {           // kind — порода силой (trees.js: дворы, кусты под окнами)
  if (introClear(x, z)) return;
  const y = groundH(x, z);
  if (y < 0.3) return;                         // в реке деревья не растут
  // парк в карте часто накрывает и улицу через него — дерево на полотне
  // было бы стеной посреди дороги; на газоне бульвара — ближе к бордюру
  const road = nearestRoad(x, z, DRIVE_MAX + 2, 1);
  if (road && road.d < road.seg.w / 2 + (strip ? 1 : 2.5)) return;
  if (WORLD.onAlley(x, z)) return;                 // на аллее парка (world.js) — не сажаем
  if (PZD.blocks(x, z, 0.8)) return;               // не в пиццерии-шаре и не на её площади (pizzadome.js)
  if (RIVS.blocks(x, z, 0.8)) return;              // не на террасе точки конкурента (rivals.js)
  if (EDL.gone('tree', x, z)) { const s = solid(x - 0.55, z - 0.55, x + 0.55, z + 0.55); s.tree = 1; s.edGone = 1; return true; }   // убрано в редакторе: без дерева, ствол — до конца сборки, чтобы город вокруг вышел тем же (editlayer.js)
  if (SEAS.seasonTree(x, z, y, kind) === false) return;   // вид дерева (trees.js) и сезон — seasons.js (у столиков пиццерии не сажает)
  solid(x - 0.55, z - 0.55, x + 0.55, z + 0.55).tree = 1;   // tree — удар звучит деревом (impact.js)
  return true;
}

function lamp (x, z) {
  addProp(x, z, 0, 'lamp', g => {
    propBox(g, 0.28, 6.8, 0.28, '#585460', 0, 2.8, 0);
    propBox(g, 1.6, 0.25, 0.3, '#585460', 0.7, 6.1, 0);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    bulb.position.set(1.3, 5.95, 0);
    g.add(bulb);
    g.userData.bulb = bulb;
  }, 0.9);
}

/* ─── двор: газон, дорожки, площадка, лавочки ───
   Половина заказов едет сюда, поэтому двор должен быть проезжим:
   заборчик ставим кусками и всегда оставляем заезды. */
const BENCHES = [];

/* Куда лавочку развернуть. Модель смотрит в +Z при ry = 0, то есть
   направление взгляда — (sin ry, cos ry). Нужна ближайшая дорога:
   сидят лицом к улице, а не в забор и не в стену дома. */
function faceRoad (x, z) {
  const road = nearestRoad(x, z, DRIVE_MAX + 2, 2);
  if (!road) return 0;
  const dx = road.x - x, dz = road.z - z;
  if (Math.hypot(dx, dz) < 0.3) return 0;
  return Math.atan2(dx, dz);
}

/* Уличный реквизит живёт отдельными мешами, а не в склейке: только так
   его можно снести машиной. Каждый объект висит на пивоте в точке
   основания — от удара пивот заваливается набок. */
const PROPS = [];
const TILT_AXIS = new THREE.Vector3();

function addProp (x, z, ry, kind, build, r) {
  const pivot = new THREE.Group();
  pivot.position.set(x, groundH(x, z) + curbAt(x, z), z);
  const inner = new THREE.Group();
  inner.rotation.y = ry;
  build(inner);
  pivot.add(inner);
  scene.add(pivot);
  const p = { pivot, inner, x, z, ry, kind, r, down: 0, tilt: 0, tiltV: 0, ax: 1, az: 0 };
  PROPS.push(p);
  return p;
}

const propMat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
const propBox = (g, w, h, d, hex, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), propMat(hex));
  m.position.set(x, y, z);
  g.add(m);
  return m;
};

/* Лавочка у стены — вдоль неё, спинкой к дому; иначе — лицом к улице */
function wallFace (x, z, maxD) {
  let best = null, bd = maxD;
  for (const b of HOUSE_GRID.get(Math.floor(x / 40) + ',' + Math.floor(z / 40)) || []) {
    const p = b.p;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
      const qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(x - qx, z - qz);
      if (d < bd && d > 0.01) { bd = d; best = Math.atan2(x - qx, z - qz); }
    }
  }
  return best;
}

/* Лавочка не встаёт на асфальт — ни на улицу, ни во двор на проезд —
   и не встаёт в дом: иначе гость садится посреди дороги. */
function benchSpotOk (x, z) {
  const road = nearestRoad(x, z, 7, 1);
  if (road && road.d < road.seg.w / 2 + 1.0) return false;
  if (WORLD.onAlley(x, z, 0.6)) return false;          // посреди аллеи (world.js) — нет
  if (RIVS.blocks(x, z, 1)) return false;              // на террасе точки конкурента (rivals.js) — нет
  return !inHouse(x, z, 1.4);
}

function bench (x, z, ry) {
  if (introClear(x, z)) return null;
  const y = groundH(x, z);
  if (y < 0.3 || !benchSpotOk(x, z)) return null;
  if (ry === undefined) { const wf = wallFace(x, z, 5); ry = wf !== null ? wf : faceRoad(x, z); }
  const p = addProp(x, z, ry, 'bench', g => {
    // одним мешем: лавочек под три сотни, по четыре меша было бы тысяча вызовов
    const parts = [];
    box(parts, 2.6, 0.18, 0.7, '#8a6b4e', 0, 0.62, 0);
    box(parts, 2.6, 0.7, 0.16, '#8a6b4e', 0, 1.05, -0.28);
    // ножки уходят в землю: на склоне лавочка не висит одним краем
    box(parts, 0.18, 0.9, 0.6, '#5c5560', -1.15, 0.1, 0);
    box(parts, 0.18, 0.9, 0.6, '#5c5560', 1.15, 0.1, 0);
    g.add(new THREE.Mesh(mergeGeos(parts), SMASH_MAT));
  }, 1.7);
  BENCHES.push({ x, z, y, ry, prop: p });
  return p;
}

/* ─── мелочь во дворах: заборчики, песочницы, горки, кусты, мусорки ───
   Всего этого сотни штук, и отдельным мешем каждая стоила бы вызова
   отрисовки. Поэтому склеиваем по клеткам сто метров, как статику, но
   помним, какие вершины чьи: сбил — вершины вещи схлопываются в точку
   (её больше не видно), а вместо неё разлетаются обломки. Кадр от этого
   не тяжелеет, а сбивается всё. */
const SMASH = [];
const SM_CELL = 20, SMASH_GRID = new Map(), SM_CHUNKS = new Map();
const SMASH_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/* столбы (фонари, знаки, рекламные стелы конкурентов, табличка парковки курьеров): it.post = 1 —
   медленнее POST_KNOCK м/с (~22 км/ч) машина упирается, быстрее — сбивает (08.10.2026: «сквозь столбики
   можно проезжать»). POST_N — сколько таких есть: без них медленный ход не проверяем */
const POST_KNOCK = 6;
let POST_N = 0;
const markPost = it => { if (it && !it.post) { it.post = 1; POST_N++; } return it; };
function smashAdd (kind, x, z, r, geos, hex) {
  const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
  if (!SM_CHUNKS.has(k)) SM_CHUNKS.set(k, { geos: [], items: [] });
  const ch = SM_CHUNKS.get(k);
  let nv = 0;
  for (const g of geos) { ch.geos.push(g); nv += g.attributes.position.count; }
  const it = { kind, x, z, r, hex, nv, down: 0, mesh: null, v0: 0, g0: ch.geos.length - geos.length, gn: geos.length };   // g0, gn — где её куски в клетке: правки редактора вынимают убранное до склейки (editlayer.js)
  if (kind === 'lamp' || (kind === 'sign' && r <= 0.8)) markPost(it);   // столб: медленно — твёрдый (POST_KNOCK)
  ch.items.push(it);
  SMASH.push(it);
  const gk = Math.floor(x / SM_CELL) + ',' + Math.floor(z / SM_CELL);
  if (!SMASH_GRID.has(gk)) SMASH_GRID.set(gk, []);
  SMASH_GRID.get(gk).push(it);
  return it;
}

/* вещь, у которой свой меш (высокие чёрные заборы roadlife.js — одним мешем с текстурой):
   v0…v0+nv — её вершины в этом меше, сбил — схлопываются так же */
function smashMesh (kind, x, z, r, mesh, v0, nv, hex) {
  const it = { kind, x, z, r, hex, nv, down: 0, mesh, v0 };
  SMASH.push(it);
  const gk = Math.floor(x / SM_CELL) + ',' + Math.floor(z / SM_CELL);
  if (!SMASH_GRID.has(gk)) SMASH_GRID.set(gk, []);
  SMASH_GRID.get(gk).push(it);
  return it;
}

function smashBuild () {
  for (const ch of SM_CHUNKS.values()) {
    let v = 0;
    for (const it of ch.items) { it.v0 = v; v += it.nv; }
    const m = new THREE.Mesh(mergeGeos(ch.geos), SMASH_MAT);
    boundSphere(m.geometry);
    scene.add(m);
    for (const it of ch.items) it.mesh = m;
    ch.geos = null;
  }
}

/* снести: вершины — в точку у земли, вместо вещи — обломки */
function smashHit (it, nx, nz, force, quiet) {
  if (it.down) return;
  if (it.junk) return it.junk(it, nx, nz, force, quiet);   // остановка, мусор, контейнер — по-своему (junk.js)
  it.down = 1;
  if (it.onDown) it.onDown(it, nx, nz, force, quiet);           // фонарь: гаснет и падает (streetlamps.js)
  const pos = it.mesh.geometry.attributes.position, a = pos.array, gy = groundH(it.x, it.z);
  for (let i = it.v0; i < it.v0 + it.nv; i++) { a[i * 3] = it.x; a[i * 3 + 1] = gy - 1; a[i * 3 + 2] = it.z; }
  pos.needsUpdate = true;
  const bar = it.kind === 'fence' || it.kind === 'bigfence';         // заборы — летят прутья и планки
  const n = bar ? 4 : it.kind === 'bush' ? 5 : 6;
  for (let i = 0; i < n; i++) {
    const hex = it.kind === 'bin' || it.kind === 'dump' ? (i < 2 ? it.hex : pick(['#e8e2d4', '#8a6b4e', '#d95d5d', '#59b06a', '#4f7fd6'])) : it.hex;
    const s = it.kind === 'bush' ? rand(0.3, 0.55) : rand(0.15, 0.5);
    const m = new THREE.Mesh(it.kind === 'bush' ? new THREE.IcosahedronGeometry(s, 0) : new THREE.BoxGeometry(s * (bar ? 3 : 1), s * (it.kind === 'bigfence' ? 1.4 : 0.5), s * (it.kind === 'bigfence' ? 0.3 : 1)), propMat(hex));
    m.position.set(it.x + rand(-0.5, 0.5), gy + rand(0.4, 1.0), it.z + rand(-0.5, 0.5));
    scene.add(m);
    GORE.push({ m, vx: nx * rand(2, 5) * (0.4 + force / 30) + rand(-2.5, 2.5), vy: rand(2.5, 6), vz: nz * rand(2, 5) * (0.4 + force / 30) + rand(-2.5, 2.5),
      spin: rand(-10, 10), life: rand(8, 14), bleed: 1e9, rest: 0 });
  }
  if (quiet) return;
  sparks(it.x, 0.5, it.z, 4, nx, nz);
  Snd.fx('smash', s => s.noise(0.18, 0.22), { x: it.x, z: it.z });
  S.shake = Math.max(S.shake, 0.15);
}

/* что рядом с точкой — по клеткам двадцать метров */
function smashNear (x, z, fn) {
  const ci = Math.floor(x / SM_CELL), cj = Math.floor(z / SM_CELL);
  for (let i = ci - 1; i <= ci + 1; i++)
    for (let j = cj - 1; j <= cj + 1; j++)
      for (const it of SMASH_GRID.get(i + ',' + j) || []) if (!it.down) fn(it);
}

/* сбиваемый забор ближе r: дорожку у дома и тропинку к тротуару через него не ведём —
   заборы пиццерий, строек и пустырей встают раньше дорожек (pave.js — правило наоборот) */
function fenceNear (x, z, r) {
  let f = false;
  smashNear(x, z, it => { if (!f && (it.kind === 'fence' || it.kind === 'bigfence') && !it.rshop && Math.hypot(it.x - x, it.z - z) < r + Math.min(it.r, 1.3)) f = true; });
  return f;
}

/* ── расстановка ── */
function osmYardBits () {
  if (INTRO) return;
  // заборчики вдоль улиц: кусками, с проходами у перекрёстков, подъездов и дорожек —
  // двор должен остаться проезжим. Стоят за тротуаром, по краю газона (до 04.10.2026 —
  // в 0,8 м от бордюра, посреди тротуара); на тротуар, дорожку и аллею не встают (pave.js)
  let segs = 0;
  const FENCE = ['#3f7a4a', '#4f6fa8', '#8a3b3b', '#d8d2c8'];
  for (const r of CITY.roads) {
    if (r.c !== 4 || r.b || r.x || segs > 900) continue;
    const w = PAVE.walkHalf({ w: roadWidth(r), c: r.c, g: r.g }) + 0.35, hex = pick(FENCE);
    for (const sd of [-1, 1]) {
      if (!chance(0.45)) continue;
      for (let i = 1; i < r.p.length; i++) {
        const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
        const len = Math.hypot(x2 - x1, z2 - z1);
        if (len < 12) continue;
        const ux = (x2 - x1) / len, uz = (z2 - z1) / len, nx = -uz * sd, nz = ux * sd, ry = Math.atan2(-uz, ux);
        for (let d = 7; d + 2.5 < len - 7; d += 2.6) {
          const cx = x1 + ux * (d + 1.25) + nx * w, cz = z1 + uz * (d + 1.25) + nz * w;
          if (!inBounds(cx, cz, -30) || inHouse(cx, cz, 1.2)) continue;
          const near = nearestRoad(cx, cz, 7, 1);
          if (near && near.seg.c !== 7 && near.d < near.seg.w / 2 + 0.4) continue;        // чужое полотно
          if (near && near.seg.c === 7 && near.d < 1.8) continue;                          // дорожка — проход
          if (CITY.entrances.some(e => Math.abs(e[0] - cx) < 5 && Math.abs(e[1] - cz) < 5)) continue;
          if (PAVE.onPave(cx, cz, 0.2) || PAVE.onPave(cx - ux * 1.25, cz - uz * 1.25, 0.1) || PAVE.onPave(cx + ux * 1.25, cz + uz * 1.25, 0.1)) continue;   // чужой тротуар, дорожка — проход
          const gy = groundH(cx, cz), g = [];
          put(g, new THREE.BoxGeometry(2.5, 0.07, 0.06), hex, cx, gy + 0.75, cz, 0, ry, 0);
          put(g, new THREE.BoxGeometry(2.5, 0.07, 0.06), hex, cx, gy + 0.35, cz, 0, ry, 0);
          for (const o of [-1.2, 1.2]) put(g, new THREE.BoxGeometry(0.08, 0.85, 0.08), hex, cx + ux * o, gy + 0.42, cz + uz * o);
          smashAdd('fence', cx, cz, 1.3, g, hex);
          if (++segs > 900) break;
        }
      }
    }
  }
  // детские площадки: песочница, горка, пара кустов
  for (const pl of CITY.green) {
    if (pl.k !== 'play') continue;
    let cx = 0, cz = 0;
    for (const q of pl.p) { cx += q[0] / pl.p.length; cz += q[1] / pl.p.length; }
    if (!inBounds(cx, cz, -20) || !inPoly(cx, cz, pl.p) || inHouse(cx, cz, 3)) continue;
    const gy = groundH(cx, cz), ry = rand(0, 3.14);
    const g = [];
    for (const [ox, oz, w, d] of [[0, 1.4, 3.0, 0.2], [0, -1.4, 3.0, 0.2], [1.4, 0, 0.2, 2.6], [-1.4, 0, 0.2, 2.6]])
      put(g, new THREE.BoxGeometry(w, 0.3, d), '#c9803a', cx + ox, gy + 0.15, cz + oz);
    put(g, new THREE.BoxGeometry(2.6, 0.1, 2.6), '#e8d49a', cx, gy + 0.1, cz);
    smashAdd('sand', cx, cz, 1.8, g, '#c9803a');
    const sx = cx + Math.cos(ry) * 6, sz = cz + Math.sin(ry) * 6;
    if (!inHouse(sx, sz, 2) && inPoly(sx, sz, pl.p)) {
      const sy = groundH(sx, sz), g2 = [], fx = Math.cos(ry + 1.57), fz = Math.sin(ry + 1.57), rr = Math.atan2(fx, fz);
      put(g2, new THREE.BoxGeometry(1.2, 0.12, 1.2), '#e04836', sx, sy + 1.8, sz);                         // площадка
      for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) put(g2, new THREE.BoxGeometry(0.1, 1.8, 0.1), '#4f7fd6', sx + a, sy + 0.9, sz + b);
      const slx = sx + fx * 1.9, slz = sz + fz * 1.9;
      put(g2, new THREE.BoxGeometry(0.8, 0.08, 3.0), '#ffd23f', slx, sy + 0.95, slz, -0.62, rr, 0);          // скат
      put(g2, new THREE.BoxGeometry(0.8, 1.6, 0.08), '#4f7fd6', sx - fx * 0.75, sy + 0.9, sz - fz * 0.75, 0.25, rr, 0);   // лесенка
      smashAdd('slide', sx + fx * 0.8, sz + fz * 0.8, 2.0, g2, '#ffd23f');
    }
  }
  // кусты: у подъездов по бокам и вдоль стен во дворах
  let bushes = 0;
  const bush = (x, z) => {
    if (bushes > 520 || inHouse(x, z, 0.6) || !inBounds(x, z, -30)) return;
    const near = nearestRoad(x, z, 7, 1);
    if (near && near.d < near.seg.w / 2 + 0.8) return;
    const gy = groundH(x, z), g = [], hex = pick(['#4f8f3f', '#5aa04a', '#467f38']);
    put(g, new THREE.IcosahedronGeometry(rand(0.6, 0.85), 0), hex, x, gy + 0.55, z);
    put(g, new THREE.IcosahedronGeometry(rand(0.45, 0.6), 0), '#6fb05a', x + rand(-0.4, 0.4), gy + 0.85, z + rand(-0.4, 0.4));
    smashAdd('bush', x, z, 0.9, g, hex);
    bushes++;
  };
  for (const [x, z, nx, nz] of CITY.entrances) {
    if (!inBounds(x, z, -40)) continue;
    const tx = nz, tz = -nx;
    if (chance(0.7)) for (const sd of [-1, 1]) bush(x + nx * 1.4 + tx * 2.2 * sd, z + nz * 1.4 + tz * 2.2 * sd);
    // урна у подъезда
    if (chance(0.55)) {
      const bx = x + nx * 1.6 - tx * 1.6, bz = z + nz * 1.6 - tz * 1.6;
      if (!inHouse(bx, bz, 0.4)) {
        const gy = groundH(bx, bz), g = [];
        put(g, new THREE.CylinderGeometry(0.28, 0.24, 0.8, 8), '#4e5a4a', bx, gy + 0.4, bz);
        put(g, new THREE.CylinderGeometry(0.3, 0.3, 0.06, 8), '#3a4238', bx, gy + 0.82, bz);
        smashAdd('bin', bx, bz, 0.5, g, '#4e5a4a');
      }
    }
  }
  for (const pl of CITY.green) {
    if (pl.k !== 'green' || bushes > 520) continue;
    for (let i = 0; i < Math.min(pl.p.length, 8); i++) if (chance(0.35)) {
      const a = pl.p[i], b = pl.p[(i + 1) % pl.p.length];
      bush(lerp(a[0], b[0], 0.5), lerp(a[1], b[1], 0.5));
    }
  }
  // мусорные баки у дворовых парковок
  for (const pk of PARKINGS) {
    if (!chance(0.6)) continue;
    const dx = pk.cx - pk.ex, dz = pk.cz - pk.ez, l = Math.hypot(dx, dz) || 1;
    const ux = dx / l, uz = dz / l, nx = -uz, nz = ux;
    for (let i = 0; i < 2; i++) {
      const bx = pk.ex + ux * 6 + nx * (5 + i * 1.8), bz = pk.ez + uz * 6 + nz * (5 + i * 1.8);
      if (inHouse(bx, bz, 1) || !inBounds(bx, bz, -30)) continue;
      const near = nearestRoad(bx, bz, 7, 1);
      if (near && near.d < near.seg.w / 2 + 1) continue;
      JUNK.can(bx, bz, Math.atan2(nx, nz), 0);              // тяжёлый контейнер (junk.js): толкается, опрокидывается
    }
  }
}

/* ─── футбольные площадки ───
   Коробки из карты (leisure=pitch) плюс несколько своих в больших дворах:
   искусственный газон, белая разметка, ворота с сеткой и низкий
   заборчик по периметру — ворота и забор сбиваются, как вся дворовая
   мелочь. Днём на ближней площадке играют трое на трое: бегут за мячом,
   бьют по воротам, после гола — «ГОООЛ!» и мяч в центр. Мяч можно пнуть
   машиной, игроков — задавить. */
const PITCHES = [];
function pitchAt (cx, cz, ang, L, W, own) {
  const ux = Math.cos(ang), uz = Math.sin(ang), nx = -uz, nz = ux;
  const P = (a, b) => [cx + ux * a + nx * b, cz + uz * a + nz * b];
  // все углы с запасом — не в доме, не на дороге, внутри области
  for (const [a, b] of [[-L / 2 - 1, -W / 2 - 1], [L / 2 + 1, -W / 2 - 1], [L / 2 + 1, W / 2 + 1], [-L / 2 - 1, W / 2 + 1], [0, 0]]) {
    const [x, z] = P(a, b);
    if (!inBounds(x, z, 25) || inHouse(x, z, 0.5)) return false;
    const r = nearestRoad(x, z, DRIVE_MAX, 1);
    if (r && r.d < r.seg.w / 2 + 0.8) return false;
  }
  if (PITCHES.some(p => Math.hypot(p.cx - cx, p.cz - cz) < 30)) return false;
  const gy = groundH(cx, cz);
  const ry = Math.atan2(-uz, ux);                     // поворот коробки: её x — вдоль поля
  if (own) box(LIT, L + 1, 0.06, W + 1, '#4f9a4a', cx, gy + 0.03, cz, ry);
  // разметка: периметр, центральная линия, центральный круг и штрафные
  const line = (a0, b0, a1, b1) => {
    const [x0, z0] = P(a0, b0), [x1, z1] = P(a1, b1), l = Math.hypot(x1 - x0, z1 - z0);
    box(LIT, l + 0.1, 0.03, 0.12, '#f4f4ee', (x0 + x1) / 2, groundH((x0 + x1) / 2, (z0 + z1) / 2) + 0.08, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
  };
  line(-L / 2, -W / 2, L / 2, -W / 2); line(-L / 2, W / 2, L / 2, W / 2);
  line(-L / 2, -W / 2, -L / 2, W / 2); line(L / 2, -W / 2, L / 2, W / 2);
  line(0, -W / 2, 0, W / 2);
  const cr = Math.min(3, W / 5);
  for (let i = 0; i < 12; i++) line(Math.cos(i / 12 * 6.283) * cr, Math.sin(i / 12 * 6.283) * cr, Math.cos((i + 1) / 12 * 6.283) * cr, Math.sin((i + 1) / 12 * 6.283) * cr);
  const pb = Math.min(6, L / 6), pw = Math.min(9, W * 0.55);
  for (const sd of [-1, 1]) { line(sd * L / 2, -pw / 2, sd * (L / 2 - pb), -pw / 2); line(sd * (L / 2 - pb), -pw / 2, sd * (L / 2 - pb), pw / 2); line(sd * (L / 2 - pb), pw / 2, sd * L / 2, pw / 2); }
  // ворота: штанги, перекладина и сетка — сбиваемые
  const GW = Math.min(3.6, W * 0.3);
  for (const sd of [-1, 1]) {
    const [gx, gz] = P(sd * L / 2, 0), g = [], gyy = groundH(gx, gz);
    for (const o of [-1, 1]) { const [x, z] = P(sd * L / 2, o * GW / 2); put(g, new THREE.BoxGeometry(0.12, 2.0, 0.12), '#f4f4ee', x, gyy + 1.0, z); }
    const [bx, bz] = P(sd * (L / 2 + 0.05), 0);
    put(g, new THREE.BoxGeometry(0.12, 0.12, GW), '#f4f4ee', bx, gyy + 2.0, bz, 0, ry + Math.PI / 2, 0);
    const [nx2, nz2] = P(sd * (L / 2 + 0.8), 0);
    put(g, new THREE.BoxGeometry(0.04, 1.9, GW), '#c9cfd6', nx2, gyy + 0.95, nz2, 0, ry + Math.PI / 2, 0);
    smashAdd('goal', gx, gz, 1.8, g, '#f4f4ee');
  }
  // низкий заборчик по периметру, с проходами посередине длинных сторон
  const fence = (a0, b0, a1, b1) => {
    const [x0, z0] = P(a0, b0), [x1, z1] = P(a1, b1), l = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(l / 2.6));
    const ex = (x1 - x0) / l, ez = (z1 - z0) / l, fr = Math.atan2(-ez, ex);
    for (let i = 0; i < n; i++) {
      const cx2 = x0 + ex * (i + 0.5) * l / n, cz2 = z0 + ez * (i + 0.5) * l / n, fy = groundH(cx2, cz2), g = [];
      if (PAVE.onPave(cx2, cz2, 0.1)) continue;          // не поперёк тротуара, дорожки и аллеи (pave.js)
      put(g, new THREE.BoxGeometry(l / n, 0.06, 0.05), '#3f6fa8', cx2, fy + 0.95, cz2, 0, fr, 0);
      put(g, new THREE.BoxGeometry(l / n, 0.06, 0.05), '#3f6fa8', cx2, fy + 0.45, cz2, 0, fr, 0);
      put(g, new THREE.BoxGeometry(0.07, 1.0, 0.07), '#3f6fa8', cx2 - ex * l / n / 2, fy + 0.5, cz2 - ez * l / n / 2);
      smashAdd('fence', cx2, cz2, 1.3, g, '#3f6fa8');
    }
  };
  const fa = L / 2 + 1.5, fb = W / 2 + 1.5;
  fence(-fa, -fb, -3, -fb); fence(3, -fb, fa, -fb);
  fence(-fa, fb, -3, fb); fence(3, fb, fa, fb);
  fence(-fa, -fb, -fa, fb); fence(fa, -fb, fa, fb);
  PITCHES.push({ cx, cz, ux, uz, nx, nz, L, W, GW, gy, game: null });
  return true;
}

function osmPitches () {
  if (INTRO) return;
  const obb = p => {
    let best = 0, ang = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
    }
    const ux = Math.cos(ang), uz = Math.sin(ang);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const q of p) { const a = q[0] * ux + q[1] * uz, b = -q[0] * uz + q[1] * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
    return { cx: am * ux - bm * uz, cz: am * uz + bm * ux, ang, len: a1 - a0, wid: b1 - b0 };
  };
  for (const g of CITY.green) {
    if (g.k !== 'pitch') continue;
    const o = obb(g.p);
    if (o.len < 16 || o.wid < 9) continue;
    pitchAt(o.cx, o.cz, o.ang, Math.min(o.len - 2, 40), Math.min(o.wid - 2, 22), false);
  }
  // свои коробки в больших дворах — где есть место
  let own = 0;
  for (const g of CITY.green) {
    if (own >= 10 || g.k !== 'green') continue;
    const o = obb(g.p);
    if (o.len < 32 || o.wid < 22 || !inPoly(o.cx, o.cz, g.p)) continue;
    if (pitchAt(o.cx, o.cz, o.ang, 26, 15, true)) own++;
  }
}

/* игра: трое на трое на ближней площадке, только днём */
function startGame (pt) {
  const players = [];
  for (let i = 0; i < 6; i++) {
    const team = i < 3 ? 0 : 1;
    const grp = makeHuman(chance(0.3) ? nextPerson() : null, { shirt: team ? '#3f7fd6' : '#d95d5d', pants: '#f4f4ee', fat: chance(0.12) });
    const home = { a: (team ? 1 : -1) * pt.L * [0.35, 0.15, 0.2][i % 3], b: [0, -pt.W * 0.25, pt.W * 0.25][i % 3] };
    const x = pt.cx + pt.ux * home.a + pt.nx * home.b, z = pt.cz + pt.uz * home.a + pt.nz * home.b;
    grp.position.set(x, groundH(x, z), z);
    scene.add(grp);
    players.push({ grp, team, home, x, z, ph: rand(0, 6), dead: 0, shock: 0, kickCd: 0 });
  }
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), new THREE.MeshLambertMaterial({ color: 0xf4f4ee, flatShading: true }));
  scene.add(ball);
  pt.game = { players, ball, bx: pt.cx, bz: pt.cz, by: 0.24, vx: 0, vz: 0, vy: 0, say: null, sayT: 0, outT: 0, score: [0, 0] };
}
function endGame (pt) {
  const G = pt.game;
  if (!G) return;
  for (const p of G.players) if (!p.dead) dropMesh(p.grp);
  dropMesh(G.ball);
  if (G.say && G.say.parent) { G.say.parent.remove(G.say); G.say.material.dispose(); }
  pt.game = null;
}

let pitchScanT = 0;
function updateFootball (dt) {
  if (INTRO || !PITCHES.length) return;
  const day = ENV.night < 0.45 && ENV.rain < 0.5;
  if ((pitchScanT -= dt) <= 0) {
    pitchScanT = 1;
    for (const pt of PITCHES) {
      const d = Math.hypot(pt.cx - V.x, pt.cz - V.z);
      if (pt.game && (d > 220 || !day)) endGame(pt);
    }
    if (day) {
      const near = PITCHES.filter(p => !p.game && Math.hypot(p.cx - V.x, p.cz - V.z) < 160)
        .sort((a, b) => Math.hypot(a.cx - V.x, a.cz - V.z) - Math.hypot(b.cx - V.x, b.cz - V.z));
      if (near.length && PITCHES.filter(p => p.game).length < 2) startGame(near[0]);
    }
  }
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (const pt of PITCHES) {
    const G = pt.game;
    if (!G) continue;
    const dV = Math.hypot(pt.cx - V.x, pt.cz - V.z);
    const loc = (x, z) => { const dx = x - pt.cx, dz = z - pt.cz; return [dx * pt.ux + dz * pt.uz, dx * pt.nx + dz * pt.nz]; };
    // мяч: катится, трётся о газон, отскакивает от бортов коробки
    G.vy -= 18 * dt; G.by += G.vy * dt;
    if (G.by < 0.24) { G.by = 0.24; G.vy = Math.abs(G.vy) > 2 ? -G.vy * 0.45 : 0; }
    G.bx += G.vx * dt; G.bz += G.vz * dt;
    const fr = Math.exp(-(G.by > 0.3 ? 0.3 : 1.2) * dt);
    G.vx *= fr; G.vz *= fr;
    let [ba, bb] = loc(G.bx, G.bz);
    const inside = Math.abs(ba) < pt.L / 2 + 1.5 && Math.abs(bb) < pt.W / 2 + 1.5;
    if (inside) {
      // гол: мяч пересёк лицевую в створе ворот
      if (Math.abs(ba) > pt.L / 2 && Math.abs(bb) < pt.GW / 2 && G.by < 2) {
        const who = ba > 0 ? 0 : 1;
        G.score[who]++;
        if (G.say && G.say.parent) { G.say.parent.remove(G.say); G.say.material.dispose(); }
        const sc = G.players.find(p => p.team === who && !p.dead);
        if (sc) { G.say = sayBubble(sc.grp, $t('ГОООЛ!') + ' ' + G.score[0] + ':' + G.score[1], '#3f8f4d', 2.7); G.sayT = 2.5; }
        if (dV < 80) Snd.coin();
        G.bx = pt.cx; G.bz = pt.cz; G.vx = G.vz = G.vy = 0; G.by = 0.24;
      } else {
        // борта: заборчик держит мяч внутри
        const va = G.vx * pt.ux + G.vz * pt.uz, vb = G.vx * pt.nx + G.vz * pt.nz;
        let na = va, nb = vb;
        if (Math.abs(ba) > pt.L / 2 + 1.2 && ba * va > 0) na = -va * 0.6;
        if (Math.abs(bb) > pt.W / 2 + 1.2 && bb * vb > 0) nb = -vb * 0.6;
        G.vx = pt.ux * na + pt.nx * nb; G.vz = pt.uz * na + pt.nz * nb;
      }
      G.outT = 0;
    } else if ((G.outT += dt) > 4) {
      // улетел за забор — достают новый
      G.bx = pt.cx; G.bz = pt.cz; G.vx = G.vz = G.vy = 0; G.by = 0.24; G.outT = 0;
    }
    // машина пинает мяч
    if (vsp > 2 && Math.hypot(G.bx - V.x, G.bz - V.z) < 2.2) {
      G.vx = V.vx * 1.3 + rand(-2, 2); G.vz = V.vz * 1.3 + rand(-2, 2); G.vy = Math.min(9, vsp * 0.35);
      Snd.fx('ball', s => s.blip(260, 0.06, 'square', 0.08), { x: G.bx, z: G.bz });
    }
    G.ball.position.set(G.bx, groundH(G.bx, G.bz) + G.by, G.bz);
    G.ball.rotation.x += Math.hypot(G.vx, G.vz) * dt * 3;
    // игроки: ближний к мячу от каждой команды бежит к нему, остальные держат позицию
    const chaser = [0, 1].map(team => {
      let best = null, bd = Infinity;
      for (const p of G.players) if (!p.dead && p.team === team && p.shock <= 0) { const d = Math.hypot(p.x - G.bx, p.z - G.bz); if (d < bd) { bd = d; best = p; } }
      return best;
    });
    for (const p of G.players) {
      if (p.dead) continue;
      const u = p.grp.userData;
      p.grp.visible = dV < 130;
      // под колёса — до испуга: рядом сбили одного — остальные не бессмертные (04.10.2026)
      if (vsp > 3) {
        const ex = p.x - V.x, ez = p.z - V.z;
        if (Math.abs(ex * fx + ez * fz) < CAR_L + 0.5 && Math.abs(ex * fz - ez * fx) < CAR_W + 0.35) {
          p.dead = 1; dropMesh(p.grp);
          gibHuman(p, V.vx, V.vz);
          S.people++;
          Snd.squish();
          continue;
        }
      }
      if (p.shock > 0) { p.shock -= dt; handsUp(u, dt); continue; }
      let tx, tz, spd;
      if (p === chaser[p.team] && inside) { tx = G.bx; tz = G.bz; spd = 4.6 * u.pace; }
      else {
        const ha = p.home.a + clamp(ba * 0.35, -pt.L * 0.2, pt.L * 0.2), hb = p.home.b + clamp(bb * 0.3, -pt.W * 0.2, pt.W * 0.2);
        tx = pt.cx + pt.ux * ha + pt.nx * hb; tz = pt.cz + pt.uz * ha + pt.nz * hb; spd = 2.6 * u.pace;
      }
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d > 0.3) { const k = Math.min(1, spd * dt / d); p.x += dx * k; p.z += dz * k; p.ph += dt * spd * 3; p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(dx, dz), 10, dt); }
      const sw = d > 0.3 ? Math.sin(p.ph) * 0.9 : 0;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
      p.grp.position.set(p.x, groundH(p.x, p.z), p.z);
      // удар: в сторону чужих ворот, с разбросом
      p.kickCd -= dt;
      if (p.kickCd <= 0 && Math.hypot(p.x - G.bx, p.z - G.bz) < 0.8 && G.by < 0.6) {
        p.kickCd = 0.8;
        const ga = (p.team ? -1 : 1) * pt.L / 2, gb = rand(-pt.GW, pt.GW);
        const gx = pt.cx + pt.ux * ga + pt.nx * gb, gz = pt.cz + pt.uz * ga + pt.nz * gb;
        const kx = gx - G.bx, kz = gz - G.bz, kl = Math.hypot(kx, kz) || 1, pw = rand(7, 12);
        G.vx = kx / kl * pw; G.vz = kz / kl * pw; G.vy = chance(0.3) ? rand(2, 4) : 0;
        u.legR.rotation.x = -1.1;
        Snd.fx('ball', s => s.blip(200, 0.04, 'square', 0.05), { x: G.bx, z: G.bz, far: 50 });
      }
    }
    if (G.sayT > 0 && (G.sayT -= dt) <= 0 && G.say) { G.say.parent && G.say.parent.remove(G.say); G.say.material.dispose(); G.say = null; }
  }
}

/* ─── войны брендов: компании в форме сетей на улицах — crews.js (блок 9) ───
   Раньше здесь спала «кофейная война» команд у кофеен; теперь компании «Птицы Пиццы»,
   «Вселенной суши» и «Королевы Бургеров» стоят по тротуарам и курят (детская — едят мороженое)
   или бьют друг друга. Что нужно модулю: */
const crewsApi = () => ({
  V, S, scene, CAREER, ADULT, CAR_L, CAR_W, makeHuman, dropMesh, gibHuman, sayBubble, groundH, curbAt, inHouse, inBounds, nearestRoad, pushOut,
  emote, toast, popBonus, Snd, warStick, blood, fxAdd, puffGeo, money, addWallet, calmStart, intro: INTRO,
  onRunOver: () => { S.people++; Snd.squish(); },
});
let CREWS_API = null;

/* ─── бонус: сёрфер на Москве-реке ───
   Изредка приходит заказ от сёрфера: он катается на доске по реке.
   Подъезжаешь к набережной, притормаживаешь — и коробка летит прямо ему
   на доску. Плата вдвое. Сёрфер один и тот же на всю смену — завсегдатай. */
const SURF = { f: null, person: null };
function surfPlan () {
  if (SURF.f || INTRO || SEAS.iced()) return null;   // зимой река во льду — сёрфера нет
  // берег на нашей стороне: от середины реки к курьеру, до первой суши
  const side = V.x > riverX(V.z) ? 1 : -1;
  for (let k = 0; k < 25; k++) {
    const z = rand(BOUNDS.z0 + 80, BOUNDS.z1 - 80), rx = riverX(z);
    if (!rx && rx !== 0) continue;
    let x = rx, ok = false;
    for (let s = 0; s < 80; s++) { x += side * 2; if (groundH(x, z) > 0.4) { ok = true; break; } }
    if (!ok || !inBounds(x, z, 30)) continue;
    const road = nearestRoad(x + side * 6, z, DRIVE_MAX, 2);
    if (!road || road.d > 45) continue;
    const d = Math.hypot(x - V.x, z - V.z);
    if (d < 150 || d > 750) continue;
    const sx = x - side * 11;                          // на воде в одиннадцати метрах от берега
    if (groundH(sx, z) > -0.3) continue;
    const person = SURF.person || (SURF.person = makePerson({ fat: false }));
    const grp = makeHuman(person, { fat: false, shirt: '#ffd23f', pants: '#1f7a8a' });
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 2.3), new THREE.MeshLambertMaterial({ color: 0xf0522a }));
    board.position.y = -0.04;
    grp.add(board);
    grp.userData.armL.rotation.z = -1.2; grp.userData.armR.rotation.z = 1.2;      // руки в стороны — баланс
    scene.add(grp);
    const f = { grp, person, x: sx, z, z0: z, bx: x, side, ph: 0, dead: 0, surf: 1, served: 0, freeT: 0, t: 0 };
    SURF.f = f;
    return { kind: 'solo', surf: true, stops: [{ peds: [f], reach: 26, surf: true }], why: $t(MAP.river.surfWhy, { name: person.name }) };
  }
  return null;
}
function updateSurf (dt) {
  const f = SURF.f;
  if (!f) return;
  f.grp.visible = !SEAS.iced();
  f.t += dt; f.ph += dt;
  // катается вдоль берега туда-обратно, качается на волне
  const sway = Math.sin(f.ph * 0.35) * 18;
  f.z = f.z0 + sway;
  f.x = f.bx - f.side * (11 + Math.sin(f.ph * 0.6) * 2);
  f.grp.position.set(f.x, 0.12 + Math.sin(f.ph * 2.2) * 0.08, f.z);
  f.grp.rotation.y = Math.cos(f.ph * 0.35) > 0 ? 0 : Math.PI;
  f.grp.rotation.z = Math.sin(f.ph * 1.7) * 0.12;
  if (chance(dt * 2)) splash(f.x + rand(-1, 1), f.z + rand(-1.2, 1.2));
  if (f.served) {
    if ((f.freeT -= dt) <= 0) { dropMesh(f.grp); SURF.f = null; }
  } else if (!S.order || !S.order.stops.some(st => st.peds.includes(f))) {
    // заказ отменился (смена кончилась) — сёрфер уплывает
    if (f.t > 3) { dropMesh(f.grp); SURF.f = null; }
  }
}

/* ─── веранды у кафе ───
   У части кафе и ресторанов из карты к фасаду пристроена стеклянная
   веранда: пол, крыша на столбиках, стекло с трёх сторон, внутри столики
   и стулья, за ними сидят коллеги. Стекло держит, пока въезжаешь тихо;
   на скорости — осколки во все стороны, люди вскакивают с поднятыми
   руками и разбегаются, а столики и стулья сбиваются, как дворовая
   мелочь. Людей заводим, только когда курьер рядом: лиц не грузим зря. */
const VERANDAS = [];
const GLASS_MAT = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
function osmVerandas () {
  if (INTRO) return;
  for (const poi of CITY.pois) {
    if (VERANDAS.length >= 26) break;
    if (!poi.w || (poi.k !== 'cafe' && poi.k !== 'food')) continue;
    const [wx, wz, nx, nz, wl] = poi.w;
    if (!inBounds(wx, wz, 30) || introClear(wx, wz, 12)) continue;
    const tx = nz, tz = -nx, W = clamp(wl - 1, 3.4, 5.6), D = 2.6;
    const cx = wx + nx * (D / 2 + 0.1), cz = wz + nz * (D / 2 + 0.1);
    if (VERANDAS.some(v => Math.hypot(v.x - cx, v.z - cz) < W + 2)) continue;
    // все углы — не в доме и не на проезжей части
    let bad = false;
    for (const [a, b] of [[-0.5, 1], [0.5, 1], [-0.5, 0.35], [0.5, 0.35], [0, 1.15]]) {
      const x = wx + tx * W * a + nx * D * b, z = wz + tz * W * a + nz * D * b;
      const r = nearestRoad(x, z, DRIVE_MAX, 1);
      if (inHouse(x, z, 0.2) || (r && r.d < r.seg.w / 2 + 0.6)) { bad = true; break; }
    }
    if (bad) continue;
    const gy = groundH(cx, cz), ry = Math.atan2(nx, nz);
    // пол, крыша, столбики — в общую склейку
    box(LIT, W, 0.14, D, '#7a5a44', cx, gy + 0.07, cz, ry);
    box(LIT, W + 0.3, 0.14, D + 0.3, '#3b3742', cx, gy + 2.95, cz, ry);
    for (const [a, b] of [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]])
      box(LIT, 0.1, 2.9, 0.1, '#3b3742', cx + tx * W * a + nx * D * b, gy + 1.45, cz + tz * W * a + nz * D * b);
    // стекло с трёх сторон — свой меш: разбивается целиком
    const gl = [];
    const plane = (w, x, z, r) => { const g = new THREE.PlaneGeometry(w, 2.55); g.rotateY(r); g.translate(x, gy + 1.45, z); gl.push(g); };
    plane(W, cx + nx * D / 2, cz + nz * D / 2, ry);
    for (const sd of [-1, 1]) plane(D, cx + tx * W / 2 * sd, cz + tz * W / 2 * sd, ry + Math.PI / 2);
    const glass = new THREE.Mesh(mergeUV(gl), GLASS_MAT);
    glass.renderOrder = 4;
    scene.add(glass);
    // столики и стулья — сбиваемые, как мелочь во дворах
    const seats = [];
    for (const sd of [-1, 1]) {
      const qx = cx + tx * W / 4 * sd, qz = cz + tz * W / 4 * sd, g = [];
      put(g, new THREE.CylinderGeometry(0.45, 0.45, 0.06, 10), '#e8e2d4', qx, gy + 0.78, qz);
      put(g, new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), '#3b3742', qx, gy + 0.42, qz);
      for (const cs of [-1, 1]) {
        const sx = qx + tx * 0.8 * cs, sz = qz + tz * 0.8 * cs;
        put(g, new THREE.BoxGeometry(0.42, 0.06, 0.42), '#8a3b3b', sx, gy + 0.5, sz);
        put(g, new THREE.BoxGeometry(0.06, 0.48, 0.06), '#3b3742', sx, gy + 0.25, sz);
        seats.push({ x: sx, z: sz, ry: Math.atan2(qx - sx, qz - sz) });
      }
      smashAdd('table', qx, qz, 0.9, g, '#e8e2d4');
    }
    // стекло держит машину, пока не разобьёшь
    const s = obb(cx, cz, W / 2, D / 2, Math.atan2(tz, tx));
    const v = { x: cx, z: cz, nx, nz, tx, tz, W, D, gy, glass, s, seats, people: [], broken: 0, name: poi.n };
    s.veranda = v;
    VERANDAS.push(v);
  }
}

function verandaBreak (v, dx, dz, speed) {
  if (v.broken) return;
  v.broken = 1;
  v.glass.visible = false;
  v.s.hw = v.s.hd = -50;                            // препятствия больше нет
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(rand(0.15, 0.45), rand(0.15, 0.4), 0.03),
      new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.7 }));
    const a = rand(-0.5, 0.5);
    m.position.set(v.x + v.nx * v.D / 2 + v.tx * v.W * a, v.gy + rand(0.3, 2.4), v.z + v.nz * v.D / 2 + v.tz * v.W * a);
    scene.add(m);
    GORE.push({ m, vx: dx * speed * rand(0.2, 0.5) + rand(-2, 2), vy: rand(1, 4), vz: dz * speed * rand(0.2, 0.5) + rand(-2, 2),
      spin: rand(-14, 14), life: rand(6, 10), bleed: 1e9, rest: 0 });
  }
  Snd.fx('glass', s => { s.noise(0.35, 0.4); for (let i = 0; i < 4; i++) setTimeout(() => s.blip(rand(1800, 3200), 0.05, 'triangle', 0.06), i * 60); });
  S.shake = Math.max(S.shake, 0.4);
  // сидевшие вскакивают, поднимают руки и разбегаются
  for (const q of v.people) if (!q.dead) { q.panic = rand(0.6, 1.2); q.run = rand(3.5, 5); }
}

function updateVerandas (dt) {
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (const v of VERANDAS) {
    const d = Math.hypot(v.x - V.x, v.z - V.z);
    // посетители: заводим рядом, убираем вдали, пока стекло цело
    if (!v.broken && !v.people.length && d < 150) {
      for (const st of v.seats) {
        if (!chance(0.6)) continue;
        const person = nextPerson();
        const grp = makeHuman(person, { fat: chance(0.25) });
        grp.rotation.y = st.ry;
        grp.userData.legL.rotation.x = grp.userData.legR.rotation.x = -1.45;
        grp.userData.armL.rotation.x = grp.userData.armR.rotation.x = -0.6;
        grp.position.set(st.x, v.gy + 0.36, st.z);
        scene.add(grp);
        v.people.push({ grp, x: st.x, z: st.z, person, dead: 0, panic: 0, run: 0, ph: rand(0, 6) });
      }
    } else if (!v.broken && v.people.length && d > 220) {
      for (const q of v.people) if (!q.dead) dropMesh(q.grp);
      v.people = [];
    }
    for (const q of v.people) {
      if (q.dead || q.gone) continue;
      const u = q.grp.userData;
      if (q.panic > 0) {
        q.panic -= dt;
        u.legL.rotation.x = u.legR.rotation.x = 0;
        q.grp.position.y = groundH(q.x, q.z) + 0.1;
        handsUp(u, dt);
      } else if (q.run > 0) {
        // бегом наружу и прочь от машины
        q.run -= dt; q.ph += dt * 15;
        let ax = q.x - V.x, az = q.z - V.z;
        const l = Math.hypot(ax, az) || 1;
        ax = ax / l + v.nx; az = az / l + v.nz;
        const l2 = Math.hypot(ax, az) || 1;
        q.x += ax / l2 * 3.8 * dt; q.z += az / l2 * 3.8 * dt;
        q.grp.rotation.y = damp(q.grp.rotation.y, Math.atan2(ax, az), 10, dt);
        q.grp.position.set(q.x, groundH(q.x, q.z) + curbAt(q.x, q.z) + Math.abs(Math.sin(q.ph)) * 0.1, q.z);
        const sw = Math.sin(q.ph) * 1.1;
        u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
        u.armL.rotation.x = -2.6; u.armR.rotation.x = -2.6;
        if (q.run <= 0) { q.gone = 1; dropMesh(q.grp); }
      } else {
        // сидят: едят, болтают, крутят головой
        q.ph += dt;
        u.head.rotation.y = Math.sin(q.ph * 0.6) * 0.4;
        u.armR.rotation.x = -0.6 - Math.max(0, Math.sin(q.ph * 1.3)) * 0.6;
      }
      q.grp.visible = d < 130;
      // стекло разбито — под колёса можно и их
      if (v.broken && vsp > 3) {
        const dx = q.x - V.x, dz = q.z - V.z;
        if (Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
          q.dead = 1; dropMesh(q.grp);
          gibHuman(q, V.vx, V.vz);
          S.people++;
          Snd.squish();
        }
      }
    }
  }
}

/* ─── дома ───
   Контур настоящий, из карты: стены ставим по рёбрам, крышу получаем
   триангуляцией контура, окна кладём лентами по этажам. Этажность —
   из тега карты, а где его не проставили, прикидываем по площади.
   Препятствие на дом — не один ящик, а коробка на каждую стену:
   у томских домов углы какие угодно, и по осям мира они не ложатся. */

const ROOFS = ['#c3b6bc', '#bcafb8', '#b4b0bd', '#c7bdb0'];
const KIND_WALL = { ind: '#cfc7bb', pub: '#e6dfd2', church: '#f0e7d6', shop: '#e9e1d3' };
const OFFICE_WALLS = ['#b7c4cf', '#c9d0d6', '#aebccb', '#d2d6da'];
const GLASS = ['#7fa7c6', '#86aecb', '#789fbf', '#8fb6d2'];
const PITCH = ['#9a6b5e', '#7d6a80', '#6f8a72', '#8a7a5e', '#8b5f55'];
const GAR_DOORS = ['#6d7f8c', '#8a5a44', '#4f7a5a', '#5a6f9a', '#9a9a92', '#7a4a3a', '#3f5f7a', '#b0a58f'];
const SHC = new THREE.Color();
const shade = (hex, k) => '#' + SHC.set(hex).multiplyScalar(k).getHexString();
/* цвет стен — тот же, что в osmBuildings: из карты, по типу или из палитры */
const hexOf = b => b._hex || '#e6d3c0';

/* Фасад по типу дома. Офис (Омега и соседи) — сплошное стекло лентами
   по этажам и импосты сверху донизу. Жилой — сетка окон, часть светится,
   на длинных стенах балконы. Магазин — витрина во весь первый этаж.
   Промка — лента окон под крышей и рёбра профлиста. Маленьким домам со
   скатной крышей в карте — скатная крыша и в игре. */
const WINQ = [];                                   // окна, которые горят ночью (см. buildNight)
function winQuad (ax, y0, az, bx, y1, bz) {
  WINQ.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
}
function facade (b, p, ccw, lv, area, hLo, hHi, h, cx, cz, arch) {
  const n = p.length, seed = Math.abs(Math.round(cx * 7 + cz * 13));
  const walls = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n];
    const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.4) continue;
    const ox = (ccw ? dz : -dz) / len, oz = (ccw ? -dx : dx) / len;
    walls.push({ a, c, dx, dz, len, ox, oz, ux: dx / len, uz: dz / len });
  }
  // полоса на стене: from..to вдоль стены (метры), y0..y1, чуть снаружи
  const band = (w, from, to, y0, y1, out = 0.08, lit = 0) => {
    const ax = w.a[0] + w.ux * from + w.ox * out, az = w.a[1] + w.uz * from + w.oz * out;
    const bx = w.a[0] + w.ux * to + w.ox * out, bz = w.a[1] + w.uz * to + w.oz * out;
    FLATM.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, w.ox, 0, w.oz);
    if (lit && Math.random() < lit) {
      const o2 = 0.05;
      winQuad(ax + w.ox * o2, y0, az + w.oz * o2, bx + w.ox * o2, y1, bz + w.oz * o2);
    }
  };
  const FH = 3.15, base = hHi;
  const floors = Math.min(lv, 16);
  const k = b.k, st = b.st;

  if (k === 'gar') {
    // гаражи: ряд металлических ворот по длинным стенам, у каждого свой цвет
    for (const w of walls) {
      if (w.len < 5) continue;
      const m = Math.floor(w.len / 3.2), pad = (w.len - m * 3.2) / 2;
      for (let i = 0; i < m; i++) {
        FLATM.color(GAR_DOORS[(seed + i * 7) % GAR_DOORS.length]);
        band(w, pad + i * 3.2 + 0.35, pad + (i + 1) * 3.2 - 0.35, base + 0.05, base + 2.25, 0.06);
      }
    }
  } else if (k === 'mall') {
    // ТЦ: стеклянный первый этаж, над ним облицовка полосами, вывеска на главной стене
    const sty = b.style || {};
    let main = null;
    for (const w of walls) {
      if (w.len < 4) continue;
      FLATM.color(sty.glass === false ? '#8fb0cc' : '#9ec3dc');
      band(w, 0.4, w.len - 0.4, base + 0.3, base + 3.6, 0.08, 0.7);
      FLATM.color(sty.stripe || '#f0522a');
      band(w, 0, w.len, base + 3.8, base + 4.3, 0.1);
      if (floors > 1) { FLATM.color(sty.glass2 || '#7fa7c6'); band(w, 1, w.len - 1, base + 5, h - 1.2, 0.08, 0.3); }
      if (!main || w.len > main.len) main = w;
    }
    if (main && b.n) CBITS.mallSign(cityApi(), { len: main.len, mx: (main.a[0] + main.c[0]) / 2, mz: (main.a[1] + main.c[1]) / 2, ox: main.ox, oz: main.oz }, h, b.n, sty);
  } else if (k === 'church') {
    // храм: высокие узкие окна, главы — ниже, над крышей
    for (const w of walls) {
      if (w.len < 3) continue;
      const m = Math.max(1, Math.floor(w.len / 3.4)), pad = (w.len - m * 3.4) / 2;
      for (let i = 0; i < m; i++) { FLATM.color('#5f7f9f'); band(w, pad + i * 3.4 + 1.1, pad + i * 3.4 + 2.3, base + 1.4, base + Math.min(h - base - 1.2, 5.2), 0.08, 0.3); }
    }
  } else if (k === 'off') {
    for (const w of walls) {
      if (w.len < 3) continue;
      for (let f = 0; f < floors; f++) {
        FLATM.color(GLASS[(seed + f) % GLASS.length]);
        band(w, 0.25, w.len - 0.25, base + 0.35 + f * FH, base + f * FH + FH - 0.45, 0.08, 0.3);
      }
      // импосты: тёмные вертикали через каждые полтора метра
      FLATM.color('#50606e');
      const m = Math.floor(w.len / 1.6);
      for (let i = 1; i < m; i++) band(w, i * w.len / m - 0.06, i * w.len / m + 0.06, base + 0.3, base + floors * FH - 0.4, 0.11);
    }
  } else if (k === 'ind') {
    for (const w of walls) {
      if (w.len < 6) continue;
      FLATM.color('#8fa9bd');
      band(w, 1, w.len - 1, h - 2.6, h - 1.5);
      FLATM.color('#b8b0a4');
      const m = Math.floor(w.len / 2.2);
      for (let i = 1; i < m; i++) band(w, i * w.len / m - 0.07, i * w.len / m + 0.07, base + 0.2, h - 2.9, 0.1);
    }
  } else {
    const shop = k === 'shop' || k === 'pub' && lv <= 2;
    const winW = k === 'pub' ? 2.0 : 1.3, step = k === 'pub' ? 3.6 : 3.0;
    const mw = INTRO ? null : PAINT.mural(b, walls, base, h, lv, arch, { inHouse, nearestRoad });   // мурал на торце — там без окон (citypaint.js)
    const wsty = WINS.style(seed, st);              // переплёт и рама — свои у дома
    for (const w of walls) {
      if (w.len < 4.5 || w === mw) continue;
      const cols = Math.max(1, Math.floor((w.len - 1) / step));
      const pad = (w.len - cols * step) / 2;
      let f0 = 0;
      const cu = arch ? arch.cut.get(w.a) : undefined;
      const inArch = (m, half, y) => cu !== undefined && y < arch.top + 0.3 && Math.abs(m - cu) < ARCH_W / 2 + half + 0.3;
      // полоса по стене с аркой: проём (и чуть по краям) ниже свода пропускаем — швы и пояса не висят в воздухе арки
      const bandA = (w, from, to, y0, y1, out) => {
        if (cu === undefined || y0 >= arch.top + 0.2) return band(w, from, to, y0, y1, out);
        const g0 = cu - ARCH_W / 2 - 0.15, g1 = cu + ARCH_W / 2 + 0.15;
        if (to <= g0 || from >= g1) return band(w, from, to, y0, y1, out);
        if (from < g0) band(w, from, g0, y0, y1, out);
        if (to > g1) band(w, g1, to, y0, y1, out);
        if (y1 > arch.top + 0.2) band(w, Math.max(from, g0), Math.min(to, g1), arch.top + 0.2, y1, out);
      };
      if (cu === undefined && (shop || (k === 'res' && lv >= 5 && w.len > 14 && seed % 3 === 0))) {
        // витрина во весь первый этаж
        FLATM.color('#cfe3f2');
        band(w, 0.6, w.len - 0.6, base + 0.4, base + 2.9, 0.08, 0.85);
        f0 = 1;
      }
      for (let f = f0; f < floors; f++)
        for (let i = 0; i < cols; i++) {
          const m = pad + (i + 0.5) * step;
          if (inArch(m, winW / 2, base + 0.9 + f * FH)) continue;
          // у сталинок окна выше, у частных домов — поменьше; рама, свет и комната — шейдер (windows.js)
          const wy0 = st === 'stalin' ? 0.7 : 0.9, wy1 = st === 'stalin' ? 2.7 : st === 'priv' ? 2.2 : 2.5;
          WINS.add(w, m - winW / 2, m + winW / 2, base + wy0 + f * FH, base + wy1 + f * FH, 0.08, wsty);
        }
      if (st === 'panel' && w.len > 8) {
        // панельный дом: швы между плитами — по этажам и через три метра
        FLATM.color(shade(hexOf(b), 0.86));
        for (let f = 1; f < floors; f++) bandA(w, 0, w.len, base + f * FH - 0.05, base + f * FH + 0.05, 0.06);
        for (let i = 0; i <= cols; i++) bandA(w, pad + i * step - 0.05, pad + i * step + 0.05, base, base + floors * FH, 0.06);
      } else if (st === 'stalin' && w.len > 6) {
        // сталинка: карниз под крышей, междуэтажный пояс, светлые пилястры
        FLATM.color('#f4ede0');
        band(w, 0, w.len, h - 0.7, h - 0.2, 0.22);
        bandA(w, 0, w.len, base + FH - 0.15, base + FH + 0.1, 0.12);
        for (let i = 0; i <= cols; i += 2) bandA(w, pad + i * step - 0.25, pad + i * step + 0.25, base + FH, h - 0.7, 0.14);
      }
      // балконы — на длинных стенах жилых домов, через колонку
      if (k === 'res' && w.len > 16 && lv >= 3)
        for (let f = 1; f < floors; f++)
          for (let i = (seed + f) % 2; i < cols; i += 2) {
            if (chance(0.3)) continue;
            const m = pad + (i + 0.5) * step;
            if (inArch(m, 1.1, base + f * FH)) continue;
            const bx = w.a[0] + w.ux * m + w.ox * 0.55, bz = w.a[1] + w.uz * m + w.oz * 0.55;
            box(LIT, 2.2, 0.9, 1.0, chance(0.5) ? '#d8d2c8' : '#c9bfb4', bx, base + f * FH + 0.45, bz, Math.atan2(w.ox, w.oz));
          }
    }
  }

  // крыша: двускатная / вальмовая, если так в карте (частный сектор, сталинки)
  if (k === 'church') CBITS.churchTop(cityApi(), p, h + (b.roof === 'g' || b.roof === 'h' ? 2.5 : 0), cx, cz, area, seed);
  if (b.roof === 'g' || b.roof === 'h') {
    const roofHex = b.rc || PITCH[seed % PITCH.length];
    if (CBITS.gableRoof(cityApi(), p, h, hexOf(b), roofHex, b.roof === 'h')) return;
  }
  const pitched = b.roof && b.roof !== 'f' && area < 420 && n <= 10 && lv <= 4;
  if (k === 'gar') {
    LITM.color('#57524d');                                          // рубероид
    LITM.poly(p, h, true);
    return;
  }
  if (pitched) {
    // шатёр к центру: у маленьких домов в карте почти всегда выпуклый контур
    LITM.color(PITCH[seed % PITCH.length]);
    const top = h + Math.min(3.2, Math.sqrt(area) * 0.25);
    for (const w of walls) {
      const a = w.a, c = w.c;
      LITM.tri(a[0], h, a[1], c[0], h, c[1], cx, top, cz, w.ox, 0.8, w.oz);
    }
  } else {
    LITM.color(k === 'off' ? '#a9b0b8' : ROOFS[(n + lv) % ROOFS.length]);
    LITM.poly(p, h, true);
    // парапет и надстройки: выход на крышу, вентиляция, у офиса — кондиционеры
    if (area > 150) {
      for (let i = 0; i < (k === 'off' || k === 'ind' ? 3 : 1); i++) {
        const tx = cx + rand(-1, 1) * Math.sqrt(area) * 0.18, tz = cz + rand(-1, 1) * Math.sqrt(area) * 0.18;
        if (!inPoly(tx, tz, p)) continue;
        box(LIT, k === 'off' ? 2.6 : 2.2, k === 'off' ? 1.4 : 2.2, k === 'off' ? 1.6 : 2.2, k === 'off' ? '#c4c9cf' : '#9c8f96', tx, h + 0.7, tz);
      }
    }
  }
}

function inPoly (x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/* ── арки ──
   В длинных жилых домах бывает сквозной проезд во двор. В карте таких
   проездов в рамке нет, поэтому прорубаем сами: у части домов берём
   самую длинную стену, от случайной точки на ней бросаем луч внутрь до
   противоположной стены и режем в обеих проём пять метров шириной.
   Внутри — стены тоннеля и потолок, а препятствия стен разбиты на куски
   слева и справа от проёма: через арку правда можно проехать. */
const ARCH_W = 5.2;
const ARCHES = [];
function archFor (b, p, ccw, lv, area) {
  if ((b.k && b.k !== 'res') || lv < 3 || area < 350 || INTRO || Math.random() > 0.4) return null;
  const n = p.length;
  let bi = -1, bl = 0;
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (l > bl) { bl = l; bi = i; }
  }
  if (bl < 26) return null;
  const a = p[bi], c = p[(bi + 1) % n], len = bl;
  const ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len;
  const ox = ccw ? uz : -uz, oz = ccw ? -ux : ux;          // наружу из контура
  const ix = -ox, iz = -oz;
  const u = len * rand(0.35, 0.65), mx = a[0] + ux * u, mz = a[1] + uz * u;
  // луч внутрь: первая встречная стена, примерно параллельная
  let best = null;
  for (let j = 0; j < n; j++) {
    if (j === bi) continue;
    const q0 = p[j], q1 = p[(j + 1) % n];
    const ex = q1[0] - q0[0], ez = q1[1] - q0[1], el = Math.hypot(ex, ez);
    if (el < ARCH_W + 2) continue;
    const den = ix * ez - iz * ex;
    if (Math.abs(den) < 1e-6) continue;
    const t = ((q0[0] - mx) * ez - (q0[1] - mz) * ex) / den;
    const sq = ((q0[0] - mx) * iz - (q0[1] - mz) * ix) / den;
    if (t < 6 || t > 24 || sq < 0 || sq > 1) continue;
    if (Math.abs((ex * ux + ez * uz) / el) < 0.85) continue;
    const sm = sq * el;
    if (sm < ARCH_W / 2 + 1 || sm > el - ARCH_W / 2 - 1) continue;
    if (!best || t < best.t) best = { t, j, s: sm };
  }
  if (!best || u < ARCH_W / 2 + 1 || u > len - ARCH_W / 2 - 1) return null;
  if (!inBounds(mx, mz, 40) || !inBounds(mx + ix * best.t, mz + iz * best.t, 40)) return null;   // у края карты не проехать
  // с обеих сторон должно быть куда выехать: не в соседний дом
  if (inHouse(mx + ox * 3, mz + oz * 3, 1) || inHouse(mx + ix * (best.t + 3), mz + iz * (best.t + 3), 1)) return null;
  const top = Math.max(groundH(mx, mz), groundH(mx + ix * best.t, mz + iz * best.t)) + 4.4;
  const cut = new Map([[p[bi], u], [p[best.j], best.s]]);
  return { cut, top, mx, mz, ix, iz, ux, uz, t: best.t };
}

/* ── подъезды и парадные ──
   Дверь, козырёк, лампа над дверью и ступенька. Парадная — шире, с
   колоннами, фронтоном и лестницей в две ступени. */
function entranceAt (x, z, nx, nz, grand) {
  const ry = Math.atan2(nx, nz), tx = nz, tz = -nx;
  const gy = groundH(x + nx, z + nz);
  if (grand) {
    put(FLAT, new THREE.PlaneGeometry(2.3, 3.0), '#4a3a2e', x + nx * 0.09, gy + 1.5, z + nz * 0.09, 0, ry, 0);
    put(FLAT, new THREE.PlaneGeometry(0.7, 0.2), '#fff3c4', x + nx * 0.1, gy + 3.25, z + nz * 0.1, 0, ry, 0);
    for (const s of [-1, 1]) put(LIT, new THREE.CylinderGeometry(0.24, 0.28, 3.6, 8), '#ece4d4', x + nx * 1.1 + tx * 1.7 * s, gy + 1.8, z + nz * 1.1 + tz * 1.7 * s);
    box(LIT, 4.3, 0.3, 1.6, '#e3dacb', x + nx * 0.9, gy + 3.75, z + nz * 0.9, ry);
    const px = x + nx * 1.65, pz = z + nz * 1.65;
    LITM.color('#e3dacb');
    LITM.tri(px - tx * 2.15, gy + 3.9, pz - tz * 2.15, px + tx * 2.15, gy + 3.9, pz + tz * 2.15, px, gy + 4.9, pz, nx, 0, nz);
    box(LIT, 3.6, 0.2, 1.8, '#c9c2b6', x + nx * 1.0, gy + 0.1, z + nz * 1.0, ry);
    box(LIT, 3.0, 0.2, 1.1, '#c9c2b6', x + nx * 0.65, gy + 0.3, z + nz * 0.65, ry);
    return;
  }
  put(FLAT, new THREE.PlaneGeometry(1.5, 2.25), '#5a4636', x + nx * 0.09, gy + 1.12, z + nz * 0.09, 0, ry, 0);
  put(FLAT, new THREE.PlaneGeometry(0.5, 0.18), '#fff3c4', x + nx * 0.1, gy + 2.45, z + nz * 0.1, 0, ry, 0);
  box(LIT, 2.5, 0.18, 1.35, '#8f8a93', x + nx * 0.7, gy + 2.7, z + nz * 0.7, ry);
  box(LIT, 2.1, 0.22, 0.9, '#c9c2b6', x + nx * 0.45, gy + 0.08, z + nz * 0.45, ry);
}

/* Дому без подъездов в карте — свои: по одному на каждые шестнадцать
   метров самой длинной стены, что смотрит во двор, а не на проспект.
   Старым домам с адресом иногда — парадная на фасад к улице. Новые
   подъезды тоже становятся точками доставки. */
const GEN_ENTR = [];
function genEntrances (b, p, ccw, lv, area, arch, bestEdge) {
  // В карьере адреса нужны и в особняках, частном секторе, гаражах и промзоне —
  // иначе заказы туда повторяются: двери и там (у гаражей и цехов — одна, не у всех)
  const small = CAREER && (b.st === 'villa' || b.k === 'priv' || b.st === 'priv');
  const work = CAREER && (b.k === 'gar' || b.k === 'ind') && area > 60 && (Math.abs(Math.sin(p[0][0] * 12.9 + p[0][1] * 78.2)) * 43758 % 1) < (b.k === 'gar' ? 0.3 : 0.5);
  if (INTRO || (area < 250 && !small && !(work && area > 60)) || (b.k && b.k !== 'res' && b.k !== 'pub' && !small && !work)) return;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  if (CITY.entrances.some(e => e[0] > x0 - 3 && e[0] < x1 + 3 && e[1] > z0 - 3 && e[1] < z1 + 3)) return;
  const ok = (x, z) => {
    if (inHouse(x, z, 0.8) || !inBounds(x, z, -40)) return false;
    const r = nearestRoad(x, z, 7, 1);
    if (r && r.d < r.seg.w / 2 + 1.5) return false;
    if (arch && Math.hypot(x - arch.mx, z - arch.mz) < 6) return false;
    return true;
  };
  // парадная — у старого дома с адресом, на стене к улице
  if (bestEdge && (b.k === 'pub' || (lv <= 6 && b.a && chance(0.3)))) {
    const x = bestEdge.mx, z = bestEdge.mz;
    if (ok(x + bestEdge.ox * 1.5, z + bestEdge.oz * 1.5)) { entranceAt(x, z, bestEdge.ox, bestEdge.oz, true); GEN_ENTR.push([x, z, bestEdge.ox, bestEdge.oz]); }
    if (b.k === 'pub') return;
  }
  // подъезды — на самой длинной стене, которая дальше всех от дороги
  let best = null, score = -1;
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 10) continue;
    const ox = (ccw ? dz : -dz) / len, oz = (ccw ? -dx : dx) / len;
    const mx = (a[0] + c[0]) / 2 + ox * 4, mz = (a[1] + c[1]) / 2 + oz * 4;
    const r = nearestRoad(mx, mz, DRIVE_MAX, 1);
    const sc = len * (r && r.seg.c <= 3 && r.d < 18 ? 0.3 : 1);
    if (sc > score) { score = sc; best = { a, dx, dz, len, ox, oz }; }
  }
  if (!best) return;
  const k = clamp(Math.floor(best.len / 16), 1, 4);
  for (let i = 0; i < k; i++) {
    const t = (i + 0.5) / k, x = best.a[0] + best.dx * t, z = best.a[1] + best.dz * t;
    if (!ok(x + best.ox * 1.5, z + best.oz * 1.5)) continue;
    entranceAt(x, z, best.ox, best.oz, false);
    GEN_ENTR.push([x, z, best.ox, best.oz]);
  }
}

function osmBuildings (skip) {
  for (const b of CITY.buildings) {
    const p = b.p, n = p.length;
    // на пятне пиццерии настоящий дом не строим — иначе они срастутся
    // (если пиццерия стоит в настоящем доме, skip пустой)
    if (skip && Math.hypot(p[0][0] - skip.x, p[0][1] - skip.z) < 22) continue;

    // Дом на склоне: стены начинаются от самого низкого угла и уходят
    // чуть в землю, крыша ровная над самым высоким — снизу по склону
    // видно цоколь, как у настоящих домов на томских горках.
    let hLo = Infinity, hHi = -Infinity;
    for (const q of p) {
      const g = groundH(q[0], q[1]);
      if (g < hLo) hLo = g;
      if (g > hHi) hHi = g;
    }

    // площадь, центр и направление обхода контура
    let s2 = 0, cx = 0, cz = 0;
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n];
      const cr = a[0] * c[1] - c[0] * a[1];
      s2 += cr;
      cx += (a[0] + c[0]) * cr;
      cz += (a[1] + c[1]) * cr;
    }
    const area = Math.abs(s2) / 2;
    if (s2) { cx /= 3 * s2; cz /= 3 * s2; } else { cx = p[0][0]; cz = p[0][1]; }
    const ccw = s2 > 0;                       // от этого зависит, куда смотрит фасад

    const lv = b.lv || (area > 1200 ? 5 : area > 600 ? 4 : area > 220 ? 2 : 1);
    const h = b.k === 'gar' ? hHi + 2.7 : hHi + 3.15 * lv + 1.1;
    const seed = Math.abs(Math.round(cx * 7 + cz * 13));
    const hex = PAINT.wallHex(b) || b.col || (b.k === 'off' ? OFFICE_WALLS[seed % OFFICE_WALLS.length]   // жилые — палитра по номеру дома (citypaint.js)
      : KIND_WALL[b.k] || WALLS[seed % WALLS.length]);
    b._hex = hex;

    // стены и препятствия
    const arch = archFor(b, p, ccw, lv, area);
    LITM.color(hex);
    let bestEdge = null, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n];
      const dx = c[0] - a[0], dz = c[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.4) continue;
      const cu = arch ? arch.cut.get(a) : undefined;
      if (cu !== undefined) {
        // стена с проёмом: слева, справа и перемычка над аркой
        const ux = dx / len, uz = dz / len, g0 = cu - ARCH_W / 2, g1 = cu + ARCH_W / 2, ry = Math.atan2(dz, dx);
        LITM.wall(a[0], a[1], a[0] + ux * g0, a[1] + uz * g0, hLo - 0.6, h);
        LITM.wall(a[0] + ux * g1, a[1] + uz * g1, c[0], c[1], hLo - 0.6, h);
        LITM.wall(a[0] + ux * g0, a[1] + uz * g0, a[0] + ux * g1, a[1] + uz * g1, arch.top, h);
        obb(a[0] + ux * g0 / 2, a[1] + uz * g0 / 2, g0 / 2, 0.5, ry);
        obb(a[0] + ux * (g1 + len) / 2, a[1] + uz * (g1 + len) / 2, (len - g1) / 2, 0.5, ry);
      } else {
        LITM.wall(a[0], a[1], c[0], c[1], hLo - 0.6, h);
        obb((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, len / 2, 0.5, Math.atan2(dz, dx));
      }

      // какая стена ближе к проезжей части — та и станет фасадом
      if (b.a) {
        const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
        const road = nearestRoad(mx, mz, DRIVE_MAX + 2, 1);
        if (road && road.d < bestD) {
          const ox = ccw ? dz / len : -dz / len;     // наружу из контура
          const oz = ccw ? -dx / len : dx / len;
          bestD = road.d;
          bestEdge = { mx, mz, ox, oz, road };
        }
      }
    }

    if (arch) {
      // тоннель: стены по бокам проезда и потолок
      LITM.color('#6e6770');
      const pts = [];
      for (const sd of [-1, 1]) {
        const x1 = arch.mx + arch.ux * sd * ARCH_W / 2, z1 = arch.mz + arch.uz * sd * ARCH_W / 2;
        const x2 = x1 + arch.ix * arch.t, z2 = z1 + arch.iz * arch.t;
        LITM.wall(x1, z1, x2, z2, hLo - 0.6, arch.top);
        obb((x1 + x2) / 2, (z1 + z2) / 2, arch.t / 2, 0.3, Math.atan2(z2 - z1, x2 - x1));
        pts.push([x1, z1], [x2, z2]);
      }
      LITM.color('#57525c');
      LITM.poly([pts[0], pts[1], pts[3], pts[2]], arch.top, true);
      ARCHES.push({ x: arch.mx + arch.ix * arch.t / 2, z: arch.mz + arch.iz * arch.t / 2, mx: arch.mx, mz: arch.mz, ix: arch.ix, iz: arch.iz, t: arch.t, ux: arch.ux, uz: arch.uz, top: arch.top });   // ux/top — стены тоннеля для граффити (life.js)
    }
    facade(b, p, ccw, lv, area, hLo, hHi, h, cx, cz, arch);
    genEntrances(b, p, ccw, lv, area, arch, bestEdge);

    // дом с адресом — точка доставки
    if (b.a && bestEdge) {
      HOUSES.push({
        x: bestEdge.mx + bestEdge.ox * 1.2,
        z: bestEdge.mz + bestEdge.oz * 1.2,
        mx: bestEdge.mx + bestEdge.ox * 5,
        mz: bestEdge.mz + bestEdge.oz * 5,
        addr: b.a[0] + ', ' + b.a[1],
        name: b.n || '',
        lv,
      });
    }

    // вокруг дома ходят прохожие: кольцо по габариту контура — только
    // внутри области, иначе к гостю за краем карты не подъехать
    if (area > 200 && RINGS.length < 900) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const q of p) {
        if (q[0] < x0) x0 = q[0];
        if (q[0] > x1) x1 = q[0];
        if (q[1] < z0) z0 = q[1];
        if (q[1] > z1) z1 = q[1];
      }
      if (x0 > BOUNDS.x0 + 20 && x1 < BOUNDS.x1 - 20 && z0 > BOUNDS.z0 + 20 && z1 < BOUNDS.z1 - 20)
        RINGS.push({ x0: x0 - 3.2, x1: x1 + 3.2, z0: z0 - 3.2, z1: z1 + 3.2 });
    }
  }
}

/* адрес по точке: ближайший дом, у которого он есть в карте */
function realAddress (x, z) {
  let best = null, bd = Infinity;
  for (const h of HOUSES) {
    const d = (h.x - x) ** 2 + (h.z - z) ** 2;
    if (d < bd) { bd = d; best = h; }
  }
  return translit(best ? best.addr : MAP.fallbackAddr || '');
}

/* ─── улица: зелень, лавочки, фонари, остановки, чужие машины ───
   Реквизита в настоящем городе понадобилось бы тысячи, поэтому живыми
   (ломаемыми) остаются лавочки и фонари в центре, остальное уезжает
   в общую склейку — там оно ничего не стоит. */

function* osmStreetLife () {                      // шагами (yield) — поздняя сборка, latebuild.js
  // деревья и лавочки по паркам и скверам
  let trees = 0, benches = 0, ng = 0;
  for (const g of CITY.green) {
    if (++ng % 150 === 0) yield 'green';
    if (g.k === 'water' || trees > 900) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of g.p) {
      if (q[0] < x0) x0 = q[0];
      if (q[0] > x1) x1 = q[0];
      if (q[1] < z0) z0 = q[1];
      if (q[1] > z1) z1 = q[1];
    }
    const w = x1 - x0, d = z1 - z0;
    if (w < 12 || d < 12) continue;
    const want = clamp(Math.round(w * d / 900), 1, 14);
    for (let k = 0; k < want && trees < 900; k++) {
      const tx = rand(x0 + 3, x1 - 3), tz = rand(z0 + 3, z1 - 3);
      if (!inPoly(tx, tz, g.p)) continue;
      tree(tx, tz);
      trees++;
    }
    // в парках сидят на лавочках — гостю есть куда присесть
    if (g.k === 'park' && benches < 150 && w > 30 && d > 30) {
      for (let k = 0; k < 3 && benches < 150; k++) {
        const bx = rand(x0 + 5, x1 - 5), bz = rand(z0 + 5, z1 - 5);
        if (!inPoly(bx, bz, g.p)) continue;
        bench(bx, bz);
        benches++;
      }
      if (x0 > BOUNDS.x0 && x1 < BOUNDS.x1 && z0 > BOUNDS.z0 && z1 < BOUNDS.z1)
        YARD_RINGS.push({ x0: x0 + 4, x1: x1 - 4, z0: z0 + 4, z1: z1 - 4, inner: true });
    }
  }

  yield 'green';
  // лавочки у подъездов: без них гостю негде ждать за пределами парков
  const step = Math.max(1, Math.floor(HOUSES.length / 260));
  for (let i = 0; i < HOUSES.length && benches < 120; i += step) {
    const h = HOUSES[i];
    if (!chance(0.4)) continue;
    bench(h.x + (h.mx - h.x) * 0.45 + rand(-2.5, 2.5), h.z + (h.mz - h.z) * 0.45 + rand(-2.5, 2.5));
    benches++;
  }

  // Фонари вдоль улиц и в частном секторе — сбиваются: столб в склейке
  // сбиваемого, плафон — в LAMPH, пятно — в LAMP_SPOTS (streetlamps.js)
  SL.streets({ THREE, scene, CITY, MAP, ZEBRAS, LAMPH, LAMP_SPOTS, put, smashAdd, groundH, curbAt, roadWidth, nearestRoad, inHouse, introClear, startClear });

  yield 'lamps';
  // остановки: будка на тротуаре, развёрнутая к дороге
  for (const s of CITY.stops) {
    const road = nearestRoad(s.p[0], s.p[1], DRIVE_MAX, 1);
    if (!road || road.d > 26) continue;
    const dx = s.p[0] - road.x, dz = s.p[1] - road.z;
    const l = Math.hypot(dx, dz) || 1;
    const px = road.x + dx / l * (road.seg.w / 2 + 2), pz = road.z + dz / l * (road.seg.w / 2 + 2);
    const ry = Math.atan2(dx / l, dz / l);
    const py = groundH(px, pz);
    if (road.seg.b) continue;
    if (road.seg.g) box(LIT, 5.2, 0.12, 3.0, '#e3ded4', px, py + CURB_H, pz, ry);      // площадка на газоне бульвара
    // будка (крыша, стеклянная задняя стенка — со стороны домов, стойки, лавочка) и её препятствие 4,4 × 1,1 м —
    // в junk.js: на скорости ломается
    JUNK.stop(px, py, pz, ry);
  }

  // парковки из карты: шлагбаум вешается на въезд ближайшей
  for (const lot of CITY.lots) {
    if (lot.k !== 'park' || PARKINGS.length > 200) continue;
    let cx = 0, cz = 0;
    for (const q of lot.p) { cx += q[0] / lot.p.length; cz += q[1] / lot.p.length; }
    const road = nearestRoad(cx, cz, DRIVE_MAX, 1);
    if (!road || road.d > 40) continue;
    PARKINGS.push({ cx, cz, ex: road.x, ez: road.z });
  }
}

/* ─── Москва: подъезды, деревья вдоль улиц, лавочки и метро из карты ─── */

/* дом по точке: сетка контуров, чтобы не сажать дерево в стену */
const HOUSE_GRID = new Map();
for (const b of CITY.buildings) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++)
    for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) {
      const k = i + ',' + j;
      if (!HOUSE_GRID.has(k)) HOUSE_GRID.set(k, []);
      HOUSE_GRID.get(k).push(b);
    }
}
/* своя постройка (пиццерия-шар) — как дом: деревья, лавочки, гаражи её обходят */
function houseFoot (p, k = 'pizza') {
  const b = { p, k };
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++) for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) {
    const k2 = i + ',' + j;
    if (!HOUSE_GRID.has(k2)) HOUSE_GRID.set(k2, []);
    HOUSE_GRID.get(k2).push(b);
  }
}
function inHouse (x, z, m = 0) {
  const a = HOUSE_GRID.get(Math.floor(x / 40) + ',' + Math.floor(z / 40));
  if (!a) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i].p;
    if (inPoly(x, z, p)) return true;
    if (m && (inPoly(x + m, z, p) || inPoly(x - m, z, p) || inPoly(x, z + m, p) || inPoly(x, z - m, p))) return true;
  }
  return false;
}
/* для камеры: участки строек и пустырей (заборы, грядки) — не стены; только дома и пристройки */
const FOOT_SOFT = new Set(['waste', 'site']);
function inWall (x, z, m = 0) {
  const a = HOUSE_GRID.get(Math.floor(x / 40) + ',' + Math.floor(z / 40));
  if (!a) return false;
  for (let i = 0; i < a.length; i++) {
    if (FOOT_SOFT.has(a[i].k)) continue;
    const p = a[i].p;
    if (inPoly(x, z, p)) return true;
    if (m && (inPoly(x + m, z, p) || inPoly(x - m, z, p) || inPoly(x, z + m, p) || inPoly(x, z - m, p))) return true;
  }
  return false;
}

/* Подъезды — настоящие, из карты (entrance=*): дверь, козырёк, лампа
   над дверью и ступенька, у части — лавочка и урна. Дом в карте знает,
   где у него подъезды, поэтому они стоят не где попало, а где в жизни. */
function* osmEntrances () {                      // шагами (yield) — поздняя сборка, latebuild.js
  const osm = CITY.entrances.length;
  for (const e of GEN_ENTR) CITY.entrances.push(e);      // свои подъезды — тоже точки доставки
  for (const [x, z, nx, nz] of CITY.entrances.slice(0, osm)) {
    if (!inBounds(x, z, -60)) continue;
    const ry = Math.atan2(nx, nz), tx = nz, tz = -nx;
    const gy = groundH(x + nx, z + nz);
    entranceAt(x, z, nx, nz, false);
    if (chance(0.4)) {
      const s = chance(0.5) ? 1 : -1;
      bench(x + nx * 3.0 + tx * 2.8 * s, z + nz * 3.0 + tz * 2.8 * s, ry);      // у дорожки, спинкой к дому
    }
  }
  yield 'ents';
  yield* houseWalks();
  // у многоэтажек: тропинка от двери к общей дорожке, заборчики, лавочки (yards.js) — шагами: на Деке ~1,3 с одним куском
  if (!INTRO) BUILD_T.yards = yield* YARDS.steps({ THREE, CITY, HOUSE_GRID, LITM, BENCHES, YARD_PATHS, box, put, smashAdd, groundH, inHouse, inBounds, inPoly, nearestRoad, DRIVE_MAX, fenceNear,
    solidAt, rivBlocks: RIVS.blocks, SMASH,
    benchOk: (x, z) => benchSpotOk(x, z) && !introClear(x, z) && groundH(x, z) >= 0.3 });
}

/* Дорожка у подъездов: вдоль всей стены, где двери, — плитка в два метра
   шириной (как отмостка с тротуаром у настоящих домов), с заходом за углы.
   От её конца, что ближе к улице, — тропинка до тротуара. Кусок, что лёг бы
   на асфальт или в соседний дом, пропускаем. Дорожки — и в список дворовых
   (по ним гуляют прохожие, их видно на карте). */
function* houseWalks () {                         // шагами — по 40 домов (latebuild.js)
  const walls = new Map();                           // дом → стены с подъездами
  for (const [x, z, nx, nz] of CITY.entrances) {
    if (!inBounds(x, z, -40)) continue;
    const ix = x - nx * 0.6, iz = z - nz * 0.6;
    let hb = null;
    for (const b of HOUSE_GRID.get(Math.floor(ix / 40) + ',' + Math.floor(iz / 40)) || []) if (inPoly(ix, iz, b.p)) { hb = b; break; }
    if (!hb || hb.k === 'gar' || hb.k === 'ind') continue;          // у гаражей и цехов дорожек-отмосток нет
    const p = hb.p;
    let bi = -1, bd = 3;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0) continue;
    let set = walls.get(hb);
    if (!set) walls.set(hb, set = new Map());
    if (!set.has(bi)) set.set(bi, [nx, nz]);
  }
  const W = 2.0, OFF = 1.35, STEP = 3;
  const onAsphalt = (x, z) => { const r = nearestRoad(x, z, 7, 1); return !!r && r.d < r.seg.w / 2 + 0.6; };
  let n = 0;
  LITM.color('#d9d0c0');
  let nb = 0;
  for (const [b, set] of walls) {
    if (++nb % 40 === 0) { yield 'walks'; LITM.color('#d9d0c0'); }   // цвет — свой и после шага
    const p = b.p;
    for (const [i, [nx, nz]] of set) {
      const a = p[i], c = p[(i + 1) % p.length], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 4) continue;
      const ux = dx / len, uz = dz / len;
      // стена наружу — в сторону двери (у кривого контура нормаль ребра и двери совпадают)
      const ox = nx, oz = nz;
      const pts = [];
      for (let d = -0.8; d < len + 0.8 - 0.01; d += STEP) {
        const d2 = Math.min(len + 0.8, d + STEP);
        const x1 = a[0] + ux * d + ox * OFF, z1 = a[1] + uz * d + oz * OFF;
        const x2 = a[0] + ux * d2 + ox * OFF, z2 = a[1] + uz * d2 + oz * OFF;
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        if (onAsphalt(mx, mz) || inHouse(mx, mz, 0.3) || fenceNear(mx, mz, 1) || fenceNear(x1, z1, 1) || fenceNear(x2, z2, 1)) { if (pts.length > 1) { YARD_PATHS.push(pts.slice()); CITY.paths.push(pts.slice()); } pts.length = 0; continue; }
        LITM.ribbon(x1, z1, x2, z2, W, 0.08);
        if (!pts.length) pts.push([x1, z1]);
        pts.push([x2, z2]);
      }
      if (pts.length > 1) { YARD_PATHS.push(pts.slice()); CITY.paths.push(pts.slice()); }
      n++;
      // тропинка до тротуара — от того конца дорожки, что ближе к улице
      let best = null;
      for (const d of [-0.4, len / 2, len + 0.4]) {
        const sx = a[0] + ux * d + ox * (OFF + W / 2), sz = a[1] + uz * d + oz * (OFF + W / 2);
        const r = nearestRoad(sx, sz, DRIVE_MAX, 2);
        if (!r || r.d > 40) continue;
        if (!best || r.d < best.r.d) best = { sx, sz, r };
      }
      if (!best) continue;
      const { sx, sz, r } = best;
      const ddx = sx - r.x, ddz = sz - r.z, dl = Math.hypot(ddx, ddz) || 1;
      const edge = r.seg.w / 2 + (r.seg.c <= 5 ? 2.4 + (r.seg.g || 0) : 0.6);
      const ex = r.x + ddx / dl * edge, ez = r.z + ddz / dl * edge, L = Math.hypot(ex - sx, ez - sz);
      if (L < 1.5 || L > 38) continue;
      let clear = true;
      for (let t = 0.1; clear && t < 0.96; t += 0.08) { const qx = lerp(sx, ex, t), qz = lerp(sz, ez, t); if (inHouse(qx, qz, 0.4) || (t < 0.9 && onAsphalt(qx, qz)) || fenceNear(qx, qz, 0.8)) clear = false; }
      if (!clear) continue;
      LITM.color(YARDS.YARD.COLOR);                  // цвет-метка: зимой тропинка протоптана (seasons.js), сугробы мимо (yards.js onYard)
      LITM.ribbon(sx, sz, ex, ez, 1.5, 0.085);
      LITM.disc(ex, ez, 0.75, 0.085, 6);
      LITM.color('#d9d0c0');
      YARD_PATHS.push([[sx, sz], [ex, ez]]); CITY.paths.push([[sx, sz], [ex, ez]]);
      YARDS.addTrail([[sx, sz], [ex, ez]], 0.75);
    }
  }
  BUILD_T.walks = n;
  yield 'walks';
}

/* Деревья: настоящие точки и ряды из карты, а вдоль улиц — липы по
   краю тротуара через каждые тринадцать метров, как на московских
   улицах. У перекрёстков, остановок и зебр не сажаем: заслоняют. */
function osmStreetTrees () {
  const ALLEY = new Set(TREES.alleyRoads(CITY, MAP.id));   // аллея-арка (trees.js) — там свои деревья
  BUILD_T.alley = TREES.plantAlley({ CITY, mapId: MAP.id, tree, roadWidth, NODE_IDX, nodeDeg, ZEBRAS, inHouse, inBounds, solidAt });
  for (const [x, z] of CITY.trees) if (!inHouse(x, z, 1.2)) tree(x, z);
  boulevardTrees();
  let n = 0;
  for (const r of CITY.roads) {
    if (!drivable(r) || r.b || r.g || r.c < 2 || r.c > 4 || n > 700 || ALLEY.has(r)) continue;
    const off = roadWidth(r) / 2 + 3.5;
    let acc = rand(0, 13);
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
      const len = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / len, uz = (z2 - z1) / len;
      for (; acc < len; acc += 13) {
        const bx = x1 + ux * acc, bz = z1 + uz * acc;
        const near = NODE_IDX.get(r.p[acc < len / 2 ? i - 1 : i][0] + ',' + r.p[acc < len / 2 ? i - 1 : i][1]);
        if (near !== undefined && nodeDeg(near) >= 3 && Math.min(acc, len - acc) < 14) continue;
        for (const s of [-1, 1]) {
          const x = bx - uz * off * s, z = bz + ux * off * s;
          if (!inBounds(x, z, -50) || inHouse(x, z, 1.5) || chance(0.25)) continue;
          if (ZEBRAS.some(q => Math.abs(q.x - x) < 9 && Math.abs(q.z - z) < 9)) continue;
          if (CITY.stops.some(q => Math.abs(q.p[0] - x) < 8 && Math.abs(q.p[1] - z) < 8)) continue;
          tree(x, z);
          n++;
        }
      }
      acc -= len;
    }
  }
  for (const [x, z] of CITY.benches) if (inBounds(x, z, -40) && !inHouse(x, z, 0.8)) bench(x, z);
}

/* Бульвар: ряд деревьев по середине газона через восемь метров, у
   перекрёстков, зебр и остановок — просвет, чтобы было видно, кто идёт */
function boulevardTrees () {
  let n = 0;
  for (const r of CITY.roads) {
    if (!r.g || !drivable(r) || r.b || n > 1600) continue;
    const off = roadWidth(r) / 2 + r.g / 2;
    let acc = rand(0, 8);
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
      const len = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / len, uz = (z2 - z1) / len;
      const na = NODE_IDX.get(x1 + ',' + z1), nb = NODE_IDX.get(x2 + ',' + z2);
      for (; acc < len; acc += rand(7, 9)) {
        if ((na !== undefined && nodeDeg(na) >= 3 && acc < 16) || (nb !== undefined && nodeDeg(nb) >= 3 && len - acc < 16)) continue;
        const bx = x1 + ux * acc, bz = z1 + uz * acc;
        for (const s of [-1, 1]) {
          const x = bx - uz * off * s, z = bz + ux * off * s;
          if (!inBounds(x, z, -50) || inHouse(x, z, 1.5) || chance(0.08)) continue;
          if (ZEBRAS.some(q => Math.abs(q.x - x) < 7 && Math.abs(q.z - z) < 7)) continue;
          if (CITY.stops.some(q => Math.abs(q.p[0] - x) < 9 && Math.abs(q.p[1] - z) < 9)) continue;
          tree(x, z, 1);
          n++;
        }
      }
      acc -= len;
    }
  }
  BUILD_T.boulTrees = n;
}

/* вход в метро: столб с красной «М», его видно через два квартала */
function osmMetro () {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 32, 32);
  x.fillStyle = '#e42313'; x.font = 'bold 28px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText($t('М'), 16, 18);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  const mat = new THREE.MeshBasicMaterial({ map: t });
  for (const m of CITY.metro || []) {
    if (m.k !== 'in') continue;
    const [mx, mz] = m.p, gy = groundH(mx, mz);
    box(LIT, 0.22, 4.2, 0.22, '#585460', mx, gy + 2.1, mz);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mat);
    cube.position.set(mx, gy + 4.6, mz);
    scene.add(cube);
    solid(mx - 0.3, mz - 0.3, mx + 0.3, mz + 0.3);
  }
}

/* ─── заведения: вывески, двери, тропинки, въезды ───
   Кафе, аптеки, магазины и банки вокруг Омеги — из карты, с настоящими
   названиями. Вывеска висит на стене, что ближе к улице, в фирменных
   цветах, если бренд известен, а под ней — стеклянная дверь и тропинка
   до тротуара. Все вывески нарисованы в одну текстуру-атлас и лежат
   в одном меше: три сотни табличек — один вызов отрисовки. */
const KIND_SIGN = {
  cafe: ['#6b4a3a', '#fff3d6'], food: ['#c84b3c', '#ffffff'], grocery: ['#3f8f4d', '#ffffff'], pharm: ['#2e9e6a', '#ffffff'],
  bank: ['#1f3f7a', '#ffffff'], pickup: ['#2f5fd0', '#ffffff'], shop: ['#3a6ea8', '#ffffff'], fuel: ['#d0342c', '#ffffff'],
};
const SIGNS = [];                                  // где висят: для тропинок и радара

function osmSigns () {
  const CW = 256, CH = 52, COLS = 8, ROWS = 39;
  const atlas = document.createElement('canvas');
  atlas.width = CW * COLS; atlas.height = CH * ROWS;
  const ax = atlas.getContext('2d');
  const pos = [], uv = [], idx = [];
  let cell = 0;
  for (const poi of CITY.pois) {
    if (!poi.w || cell >= COLS * ROWS) continue;
    const [wx, wz, nx, nz, wl] = poi.w;
    if (!inBounds(wx, wz, -40)) continue;
    // соседние вывески на одной стене — в ряд вверх, больше двух рядов не лепим
    const same = SIGNS.filter(q => Math.hypot(q.x - wx, q.z - wz) < 4.8 && q.nx * nx + q.nz * nz > 0.9);
    if (same.length >= 2) continue;
    const row = same.length;
    const tx = nz, tz = -nx;                        // вдоль стены
    const w = Math.min(4.6, Math.max(2.4, wl - 1)), hgt = w * CH / CW;
    const gy = groundH(wx + nx, wz + nz);
    const y0 = gy + 3.25 + row * (hgt + 0.25);
    // рисуем табличку в свою клетку атласа
    const [bg, fg] = poi.c || KIND_SIGN[poi.k] || KIND_SIGN.shop;
    const cx0 = (cell % COLS) * CW, cy0 = Math.floor(cell / COLS) * CH;
    ax.fillStyle = bg; ax.fillRect(cx0, cy0, CW, CH);
    ax.fillStyle = fg; ax.fillRect(cx0 + 3, cy0 + 3, CW - 6, 2); ax.fillRect(cx0 + 3, cy0 + CH - 5, CW - 6, 2);
    let label = poi.n.length > 26 ? poi.n.slice(0, 25) + '…' : poi.n;
    if (poi.k === 'pharm') label = '✚ ' + label;
    let fs = 30;
    ax.font = 'bold ' + fs + 'px sans-serif';
    while (fs > 11 && ax.measureText(label).width > CW - 16) { fs -= 1; ax.font = 'bold ' + fs + 'px sans-serif'; }
    ax.textAlign = 'center'; ax.textBaseline = 'middle';
    ax.fillText(label, cx0 + CW / 2, cy0 + CH / 2 + 1);
    // квадрат вывески на стене, чуть наружу
    const ox = wx + nx * 0.14, oz = wz + nz * 0.14, vi = pos.length / 3;
    const L = [ox - tx * w / 2, oz - tz * w / 2], R = [ox + tx * w / 2, oz + tz * w / 2];
    pos.push(L[0], y0, L[1], R[0], y0, R[1], R[0], y0 + hgt, R[1], L[0], y0 + hgt, L[1]);
    const u0 = cx0 / atlas.width, u1 = (cx0 + CW) / atlas.width;
    const v0 = 1 - (cy0 + CH) / atlas.height, v1 = 1 - cy0 / atlas.height;
    // L — слева, R — справа, если стоять лицом к стене: текст читается снаружи
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    cell++;
    SIGNS.push({ x: wx, z: wz, nx, nz, n: poi.n, n0: poi.n0, k: poi.k, c: poi.c });
    if (row) continue;
    // дверь со стеклом и козырёк в цвет вывески
    const ry = Math.atan2(nx, nz);
    put(FLAT, new THREE.PlaneGeometry(1.5, 2.3), '#9ec3dc', wx + nx * 0.1, gy + 1.15, wz + nz * 0.1, 0, ry, 0);
    put(FLAT, new THREE.PlaneGeometry(1.6, 0.12), '#3b3742', wx + nx * 0.11, gy + 2.33, wz + nz * 0.11, 0, ry, 0);
    box(LIT, Math.min(w, 3.2), 0.16, 0.9, bg, wx + nx * 0.5, gy + 2.85, wz + nz * 0.5, ry);
    // тропинка до тротуара — если дверь не на нём и путь не идёт сквозь дом
    const road = nearestRoad(wx + nx * 2, wz + nz * 2, 7, 1);
    if (road) {
      const dx = wx - road.x, dz = wz - road.z, dl = Math.hypot(dx, dz) || 1;
      const edge = road.seg.w / 2 + (road.seg.c <= 5 ? 2.6 : 0.8);
      const ex = road.x + dx / dl * edge, ez = road.z + dz / dl * edge;
      const sx = wx + nx * 0.6, sz = wz + nz * 0.6, len = Math.hypot(ex - sx, ez - sz);
      let clear = len > 1.5 && len < 45;
      for (let t = 0.15; clear && t < 0.95; t += 0.1) if (inHouse(lerp(sx, ex, t), lerp(sz, ez, t))) clear = false;
      if (clear) {
        LITM.color('#d6ccbb');
        LITM.ribbon(sx, sz, ex, ez, 1.6, 0.085);
        LITM.disc(ex, ez, 0.8, 0.085, 6);
      }
    }
  }
  const tex = new THREE.CanvasTexture(atlas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })));
}

/* въезд в дом: проём шириной с проезд, рама и рольставни */
function osmGates () {
  for (const [x, z, nx, nz, w] of CITY.gates) {
    if (!inBounds(x, z, -40)) continue;
    const ry = Math.atan2(nx, nz), tx = nz, tz = -nx;
    const gy = groundH(x + nx, z + nz), W = w + 0.6, H = Math.min(4.4, 2.6 + w * 0.3);
    put(FLAT, new THREE.PlaneGeometry(W, H), '#3d3944', x + nx * 0.1, gy + H / 2, z + nz * 0.1, 0, ry, 0);
    for (let y = 0.3; y < H - 0.1; y += 0.42)
      put(FLAT, new THREE.PlaneGeometry(W - 0.2, 0.07), '#56515e', x + nx * 0.12, gy + y, z + nz * 0.12, 0, ry, 0);
    for (const s of [-1, 1]) box(LIT, 0.4, H + 0.3, 0.5, '#8e8a92', x + tx * (W / 2 + 0.2) * s + nx * 0.2, gy + H / 2, z + tz * (W / 2 + 0.2) * s + nz * 0.2, ry);
    box(LIT, W + 1.2, 0.4, 0.5, '#8e8a92', x + nx * 0.2, gy + H + 0.2, z + nz * 0.2, ry);
    // жёлто-чёрная полоса над въездом: видно, что это ворота, а не стена
    for (let i = 0; i < 6; i++) {
      const o = -W / 2 + (i + 0.5) * W / 6;
      box(LIT, W / 6, 0.22, 0.1, i % 2 ? '#1b1a1f' : '#f2c230', x + tx * o + nx * 0.47, gy + H + 0.2, z + tz * o + nz * 0.47, ry);
    }
  }
}

/* Лёгкая машина — для парковок. Каждую модель один раз собираем целиком
   в белом цвете и склеиваем в одну геометрию, запомнив, какие вершины —
   кузов. Машина на парковке — копия шаблона с перекрашенным кузовом: один
   меш и почти даром по времени (собирать сорок деталей на каждую из сотни
   машин — это треть секунды загрузки). Задели — получает полную модель
   с панелями, которые мнутся (см. fullCar).
   Такси (10.10.2026, вызовы отрисовки на Деке) — тоже лёгкое: полная модель — ~20 мешей и столько же
   вызовов, а такси в потоке — каждая третья. Шашечки и жёлтый короб фонаря — в склейке кузова,
   надпись «ТАКСИ» — отдельный меш с текстурой, аварийка — один меш на четыре огонька (мигает
   на остановке, как у полной). Без тени-кружка — как у всех лёгких. */
const LITE = {};
const LITE_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const LITE_BASIC = new THREE.MeshBasicMaterial({ vertexColors: true });
const LITE_HAZ = new THREE.MeshBasicMaterial({ color: 0xffa024 });
for (const m of [LITE_MAT, LITE_BASIC, LITE_HAZ, RL.LED_MAT]) m.userData.shared = true;   // общие на все лёгкие: respawnTraffic их не освобождает
function liteTemplate (model, taxi) {
  const key = taxi ? model + ':taxi' : model;
  if (LITE[key]) return LITE[key];
  const g = makeCar('#ffffff', false, model, !!taxi);
  g.updateMatrixWorld(true);
  const lit = [], flat = [], haz = [], sign = [];
  for (const m of g.userData.hazard) haz.push(put([], m.geometry.clone().applyMatrix4(m.matrixWorld), '#ffa024', 0, 0, 0));
  g.traverse(o => {
    if (!o.isMesh || !o.visible || o.material.transparent) return;
    if (Array.isArray(o.material)) {
      // фонарь такси: короб — жёлтым в склейку, торцы с надписью (грани 4 и 5 коробки) — своим мешем с текстурой
      if (!taxi) return;
      const box = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const hex = '#' + o.material[0].color.getHexString();
      for (const gr of o.geometry.groups) {
        const part = box.clone();
        part.setIndex(Array.from(box.index.array.subarray(gr.start, gr.start + gr.count)));
        if (gr.materialIndex >= 4) sign.push(part);
        else { part.deleteAttribute('uv'); lit.push(put([], part, hex, 0, 0, 0)); }
      }
      return;
    }
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (o.material.vertexColors) {
      if (!geo.index) return;
      lit.push(geo);
    } else put(o.material.isMeshBasicMaterial ? flat : lit, geo, '#' + o.material.color.getHexString(), 0, 0, 0);
  });
  const T = { lit: mergeGeos(lit), flat: flat.length ? mergeGeos(flat) : null, hl: g.userData.hl, haz: haz.length ? mergeGeos(haz) : null, sign: null };
  if (sign.length) {
    // два торца фонаря — одна геометрия: вершины, нормали, uv; индекс — оба куска подряд
    const b = sign[0], idx = [];
    for (const q of sign) idx.push(...q.index.array);
    T.sign = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) T.sign.setAttribute(k, b.attributes[k]);
    T.sign.setIndex(idx);
  }
  for (const k of ['flat', 'haz', 'sign']) if (T[k]) T[k].userData.shared = true;   // общие на все машины модели
  // кузов — вершины, покрашенные в белый, в его тёмный оттенок (×0,78) или в глубокую тень (×0,62 — лючок, carbody.js)
  const c = T.lit.attributes.color.array;
  T.mask = new Uint8Array(c.length / 3);
  for (let i = 0; i < T.mask.length; i++) {
    const r = c[i * 3], gg = c[i * 3 + 1], b = c[i * 3 + 2];
    if (Math.abs(r - gg) < 0.01 && Math.abs(gg - b) < 0.01 && (r > 0.99 || Math.abs(r - 0.78) < 0.02 || Math.abs(r - 0.62) < 0.01)) T.mask[i] = r > 0.99 ? 1 : r > 0.7 ? 2 : 3;
  }
  g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (!Array.isArray(o.material)) o.material.dispose(); } });
  return (LITE[key] = T);
}
const LC = new THREE.Color(), LD = new THREE.Color(), LE = new THREE.Color();
function makeCarLite (hex, model, taxi) {
  const T = liteTemplate(model, taxi);
  const geo = T.lit.clone();
  const col = geo.attributes.color.array;
  LC.set(hex); LD.copy(LC).multiplyScalar(0.78); LE.copy(LC).multiplyScalar(0.62);
  for (let i = 0; i < T.mask.length; i++) {
    const m = T.mask[i];
    if (!m) continue;
    const q = m === 1 ? LC : m === 2 ? LD : LE;
    col[i * 3] = q.r; col[i * 3 + 1] = q.g; col[i * 3 + 2] = q.b;
  }
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(new THREE.Mesh(geo, LITE_MAT));
  if (T.flat) g.add(new THREE.Mesh(T.flat, model === 'cn' ? RL.LED_MAT : LITE_BASIC));   // LED китайца ночью не темнеет
  const hazard = [];
  if (taxi) {
    g.add(new THREE.Mesh(T.sign, taxiSignMat()));
    const hz = new THREE.Mesh(T.haz, LITE_HAZ);
    hz.visible = false;
    g.add(hz); hazard.push(hz);
  }
  g.userData = dbl({ lite: true, hl: T.hl, wheels: [], steer: [], panels: [], glass: [], hazard, dmg: 0, bodyHex: hex, model, taxi: !!taxi });
  return g;
}
/* задели лёгкую машину — ставим полную: у неё панели мнутся по-настоящему */
function fullCar (t) {
  if (!t.mesh.userData.lite) return;
  const old = t.mesh;
  t.mesh = makeCar(old.userData.bodyHex, false, old.userData.model, !!old.userData.taxi);
  t.mesh.position.copy(old.position);
  t.mesh.rotation.copy(old.rotation);
  scene.remove(old);
  old.children[0].geometry.dispose();
  scene.add(t.mesh);
}

/* ─── рампы ───
   Во дворах, на проездах и парковках стоят трамплины: жёлто-чёрный клин
   в шесть метров длиной и метр с небольшим высотой. Въехал на скорости —
   с верхней кромки машина уходит в полёт по дуге. Сзади клин — стенка,
   а над ней в полёте пролетаешь. */
const RAMPS = [];
const RAMP_L = 6, RAMP_W = 3.6, RAMP_H = 1.3;

function addRamp (x, z, ux, uz) {
  const rx = -uz, rz = ux, y = groundH(x, z);
  const P = (u, v, h) => [x + ux * u + rx * v, y + h, z + uz * u + rz * v];
  const quad = (a, b, c, d, hex) => {
    LITM.color(hex);
    LITM.quad(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], 0, 1, 0);
  };
  // скат — полосами, чтобы читался как трамплин
  const n = 6;
  for (let i = 0; i < n; i++) {
    const u0 = -RAMP_L / 2 + i * RAMP_L / n, u1 = u0 + RAMP_L / n;
    const h0 = RAMP_H * i / n, h1 = RAMP_H * (i + 1) / n;
    quad(P(u0, -RAMP_W / 2, h0 + 0.02), P(u1, -RAMP_W / 2, h1 + 0.02), P(u1, RAMP_W / 2, h1 + 0.02), P(u0, RAMP_W / 2, h0 + 0.02), i % 2 ? '#1f1d24' : '#f2c230');
  }
  // бока и задняя стенка
  LITM.color('#8e8a92');
  for (const v of [-RAMP_W / 2, RAMP_W / 2]) {
    const a = P(-RAMP_L / 2, v, 0), b = P(RAMP_L / 2, v, 0), c = P(RAMP_L / 2, v, RAMP_H);
    LITM.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], rx, 0, rz);
  }
  quad(P(RAMP_L / 2, -RAMP_W / 2, 0), P(RAMP_L / 2, RAMP_W / 2, 0), P(RAMP_L / 2, RAMP_W / 2, RAMP_H), P(RAMP_L / 2, -RAMP_W / 2, RAMP_H), '#6d6874');
  const back = obb(x + ux * (RAMP_L / 2 - 0.4), z + uz * (RAMP_L / 2 - 0.4), 0.4, RAMP_W / 2, Math.atan2(uz, ux));
  back.ramp = y + RAMP_H;
  back.rux = ux; back.ruz = uz;                     // куда смотрит скат: съезжающих вперёд стенка не держит
  RAMPS.push({ x, z, ux, uz, y });
}

function osmRamps () {
  const segs = RSEG.filter(q => q.c === 7 && !q.x && Math.hypot(q.x2 - q.x1, q.z2 - q.z1) > 24);
  for (let k = 0; k < 400 && RAMPS.length < 14 && segs.length; k++) {
    const q = pick(segs), t = rand(0.35, 0.65);
    const x = lerp(q.x1, q.x2, t), z = lerp(q.z1, q.z2, t);
    if (!inBounds(x, z, 40) || RAMPS.some(r => Math.hypot(r.x - x, r.z - z) < 90)) continue;
    if (PIZZA && Math.hypot(PIZZA.x - x, PIZZA.z - z) < 40) continue;
    const l = Math.hypot(q.x2 - q.x1, q.z2 - q.z1), s = chance(0.5) ? 1 : -1;
    addRamp(x, z, (q.x2 - q.x1) / l * s, (q.z2 - q.z1) / l * s);
  }
}

/* высота рампы в точке: 0 — не на ней */
function rampLift (x, z) {
  for (const r of RAMPS) {
    const dx = x - r.x, dz = z - r.z;
    if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
    const u = dx * r.ux + dz * r.uz, v = -dx * r.uz + dz * r.ux;
    if (Math.abs(v) > RAMP_W / 2 || u < -RAMP_L / 2 || u > RAMP_L / 2) continue;
    return RAMP_H * (u + RAMP_L / 2) / RAMP_L;
  }
  return 0;
}

/* ─── парковки ───
   Площадки amenity=parking из карты: асфальт, разметка мест и машины
   рядами, как во всех московских дворах. Живыми — такими, что мнутся и
   взрываются, — оставляем три десятка ближайших к пиццерии: каждая такая
   машина — два десятка мешей. Остальные — коробки в общей склейке, у
   каждой своё препятствие. */
function osmParkingLots (near) {
  const spots = [];
  for (const lot of CITY.lots) {
    if (lot.k !== 'park') continue;
    const p = lot.p, n = p.length;
    LITM.color('#a6abb3');
    LITM.poly(p, 0.11);
    // ряды — вдоль самой длинной стороны площадки
    let best = 0, ux = 1, uz = 0;
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l > best) { best = l; ux = (c[0] - a[0]) / l; uz = (c[1] - a[1]) / l; }
    }
    const rx = -uz, rz = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of p) {
      const u = q[0] * ux + q[1] * uz, v = q[0] * rx + q[1] * rz;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const edgeD = (x, z) => {
      let d = Infinity;
      for (let i = 0; i < n; i++) {
        const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1];
        const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        d = Math.min(d, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
      }
      return d;
    };
    for (let v = v0 + 3; v < v1 - 2.5; v += 5.6)
      for (let u = u0 + 1.6; u < u1 - 1.4; u += 2.7) {
        const x = u * ux + v * rx, z = u * uz + v * rz;
        if (!inPoly(x, z, p) || edgeD(x, z) < 1.5) continue;
        const road = nearestRoad(x, z, 7, 1);
        if (road && road.d < road.seg.w / 2 + 2.2) continue;         // проезд между рядами не занимаем
        // место: две полоски по бокам
        FLATM.color('#eeeae0');
        for (const s of [-1.35, 1.35])
          FLATM.ribbon(x + ux * s - rx * 2.2, z + uz * s - rz * 2.2, x + ux * s + rx * 2.2, z + uz * s + rz * 2.2, 0.14, 0.17);
        if (chance(0.4)) spots.push([x, z, Math.atan2(rx, rz) + (chance(0.5) ? Math.PI : 0)]);
      }
  }
  // near — пиццерия или все пиццерии районов: машины стоят у той, что ближе
  const ns = (Array.isArray(near) ? near : [near]).filter(Boolean);
  const dn = q => Math.min(...ns.map(n => Math.hypot(q[0] - n.x, q[1] - n.z)));
  for (const q of spots) q.dn = dn(q);
  spots.sort((a, b) => a.dn - b.dn);
  // все стоящие — живые: их толкают, мнут и взрывают, как любые другие.
  // Больше полутора сотен (с районами — двухсот сорока) не ставим: остальные места пустые
  const cap = ns.length > 1 ? 240 : 150;
  spots.forEach((q, i) => { if (i < cap && q.dn > 14) PARKED.push(q); });
}

/* ─── пиццерия ───
   «Птица Пицца» — на первом этаже бизнес-центра на Ленинской Слободе, 19. Дом строится как все остальные, а на
   фасад, что смотрит на Ленинскую Слободу, вешаем вывеску, козырёк,
   витрину и дверь. */
/* Дом пиццерии — из настроек карты: по адресу (Москва) или по точке
   (Северск: meta.home — где пиццерия стоит в карте) */
function homeBuilding (at) {
  const H = MAP.home || {};
  if (H.street && !at) return CITY.buildings.find(q => q.a && H.street.test(q.a[0]) && q.a[1] === H.house);
  const pt = at || H.point || CITY.meta.home;
  if (!pt) return null;
  let best = null, bd = 60;
  for (const q of CITY.buildings) {
    if (inPoly(pt[0], pt[1], q.p)) return q;
    for (const v of q.p) { const d = Math.hypot(v[0] - pt[0], v[1] - pt[1]); if (d < bd) { bd = d; best = q; } }
  }
  return best;
}
const homeAddr = () => { if (MAP.home && MAP.home.addr) return MAP.home.addr; const b = homeBuilding(); return b && b.a ? b.a.join(', ') : ''; };
function dodoHouse (b = homeBuilding()) {
  if (!b) return null;
  const p = b.p, n = p.length;
  let cx = 0, cz = 0;
  for (const q of p) { cx += q[0]; cz += q[1]; }
  cx /= n; cz /= n;
  let best = null;
  for (let i = 0; i < n; i++) {
    const a = p[i], c = p[(i + 1) % n];
    const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 8) continue;
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    let ox = -dz / len, oz = dx / len;
    if (ox * (mx - cx) + oz * (mz - cz) < 0) { ox = -ox; oz = -oz; }     // наружу из дома
    const road = nearestRoad(mx + ox * 4, mz + oz * 4, 4, 1);           // улица, не дворовый проезд
    if (!road) continue;
    const score = road.d - len * 0.15 - (MAP.home && MAP.home.street && MAP.home.street.test(road.seg.name) ? 30 : 0);
    if (!best || score < best.score) best = { score, mx, mz, ox, oz, ux: dx / len, uz: dz / len, len, road, cx, cz };
  }
  if (best) best.b = b;
  return best;
}

/* вывеска «Птицы Пиццы»: красная плашка, жёлтая птичка-логотип и надпись */
function birdLogo (x, cx, cy, s) {
  x.fillStyle = '#ffd23f';
  x.beginPath(); x.ellipse(cx, cy, 9 * s, 7 * s, 0, 0, 7); x.fill();              // тело
  x.beginPath(); x.arc(cx + 7 * s, cy - 6 * s, 5 * s, 0, 7); x.fill();             // голова
  x.fillStyle = '#ff8a2b';
  x.beginPath(); x.moveTo(cx + 11 * s, cy - 7 * s); x.lineTo(cx + 16 * s, cy - 5 * s); x.lineTo(cx + 11 * s, cy - 3 * s); x.fill();   // клюв
  x.fillStyle = '#f2b43a';
  x.beginPath(); x.moveTo(cx - 3 * s, cy - 2 * s); x.lineTo(cx - 12 * s, cy - 9 * s); x.lineTo(cx - 6 * s, cy + 3 * s); x.fill();     // крыло
  x.fillStyle = '#1b1a1f'; x.beginPath(); x.arc(cx + 8 * s, cy - 7 * s, 1.2 * s, 0, 7); x.fill();
}
function signTex () {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#f0522a'; x.fillRect(0, 0, 256, 32);
  birdLogo(x, 22, 18, 1.2);
  x.fillStyle = '#ffffff'; x.font = 'bold 20px sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(OWN.pizza().toUpperCase(), 140, 17);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/* f — фасад (dodoHouse). Ставит вывеску, маркизу, парковку курьеров и
   возвращает пиццерию: куда подъезжать (x, z), дом (bx, bz, by), окно выдачи
   (wx, wy, wz), имя, места на парковке (slots) и курилку (smoke) */
function dodoFacade (f, name) {
  // пиццерия — отдельный оранжевый шар на свободном месте рядом (pizzadome.js); места нет — в доме, как раньше
  const D = PZD.build(pizzaApi(), f, { brand: OWN.pizza(), lots: RIVAL_SPEC.length + 1, lane: LANE });
  if (D) return Object.assign(D, { name: OWN.pizza() + ' · ' + translit(name || homeAddr()) });
  const ry = Math.atan2(f.ox, f.oz);                  // модель смотрит в +Z — значит, на улицу
  const gy = groundH(f.mx + f.ox * 1.5, f.mz + f.oz * 1.5);
  const at = (along, out) => [f.mx + f.ux * along + f.ox * out, f.mz + f.uz * along + f.oz * out];
  const w = Math.min(f.len - 3, 18);

  const [sx, sz] = at(0, 0.35);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), new THREE.MeshBasicMaterial({ map: signTex() }));
  sign.position.set(sx, gy + 5.2, sz);
  sign.rotation.y = ry;
  scene.add(sign);
  PZ.cozyFront(pizzaApi(), f, gy, w);                // маркиза с гирляндой, тёплая витрина, столики
  const slots = PZ.courierLot(pizzaApi(), f, RIVAL_SPEC.length + 1);
  const [dx2, dz2] = at(w / 2 - 2.2, 0.14);
  put(FLAT, new THREE.PlaneGeometry(2.2, 2.9), '#6b4c3a', dx2, gy + 1.45, dz2, 0, ry, 0);  // дверь

  // подъезжать — в ближнюю к дому полосу проспекта
  const r = f.road;
  const ddx = f.mx - r.x, ddz = f.mz - r.z, dl = Math.hypot(ddx, ddz) || 1;
  const off = Math.min(LANE, Math.max(0, dl - 4));
  const [wx, wz] = at(0, 0.8);                          // окно выдачи: отсюда вылетает коробка
  const [sx2, sz2] = at(w / 2 + 6, 3.2);
  return {
    x: r.x + ddx / dl * off, z: r.z + ddz / dl * off,
    bx: f.cx, bz: f.cz, by: gy, wx, wz, wy: gy + 2.4, name: OWN.pizza() + ' · ' + translit(name || homeAddr()),
    slots, smoke: { x: sx2, z: sz2 },
  };
}

/* ─── пиццерии районов ───
   В карьере с районами (MAP.career.districts) у каждого района своя пиццерия:
   дом у точки pizza из настроек карты, тот же фасад и парковка курьеров.
   PIZZERIAS[i] — пиццерия района i; PIZZA — та, где работаешь (usePizzeria).
   Курилка у пиццерии — только у первой (SMOKE_SPOT не переезжает). */
const PIZZERIAS = [];
function buildDistrictPizzerias () {
  DIST.list().forEach((d, i) => {
    if (i === 0) { PIZZERIAS.push(PIZZA); return; }
    const b = d.pizza && homeBuilding(d.pizza), f = b && dodoHouse(b);
    PIZZERIAS.push(f ? dodoFacade(f, b.a ? b.a.join(', ') : $t(d.name)) : null);    // без адреса — по названию района
  });
}
/* выезд со стоянки курьеров свободен: в START_CLEAR.LEN м перед каждым местом (полосой в 2 × HALF м)
   знаков не ставим (roadlife.js) — 09.10.2026, автор: «на старте прямо перед машиной стоит знак», и первая
   секунда игры начиналась с упора в столб. Все пиццерии: место старта меняется с районом */
const START_CLEAR = { LEN: 14, HALF: 2.6 };
function startClear (x, z) {
  for (const P of PIZZERIAS.length ? PIZZERIAS : [PIZZA]) {
    if (!P || !P.slots) continue;
    for (const s of P.slots) {
      const dx = x - s.x, dz = z - s.z, fx = Math.sin(s.h), fz = Math.cos(s.h), a = dx * fx + dz * fz;
      if (a > -1 && a < START_CLEAR.LEN && Math.abs(dx * fz - dz * fx) < START_CLEAR.HALF) return true;
    }
  }
  return false;
}
function usePizzeria (i) {
  if (!PIZZERIAS.length) return;
  const P = PIZZERIAS[i] || PIZZERIAS[0];
  if (P === PIZZA) return;
  PIZZA = P;
  COURIER_SLOTS = P.slots || null;           // парковки нет — встаём на улице у пиццерии (startPose)
}

/* Запасной вариант, если дома с пиццерией в выгрузке нет: отдельная
   коробка на ближайшем к центру общепите, фасадом к улице. */
function buildPizzeria (cx, cz, ry) {
  const w = 22, d = 14, h = 8;
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const at = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
  const gy = groundH(cx, cz);

  box(LIT, w, h + 2, d, '#f4eee5', cx, gy + h / 2 - 0.8, cz, ry);
  box(LIT, w + 1.4, 1, d + 1.4, '#b0a2a9', cx, gy + h + 0.6, cz, ry);
  const [sx, sz] = at(0, d / 2 + 0.3);
  box(FLAT, w - 4, 2.4, 0.5, '#f0522a', sx, gy + h - 1.4, sz, ry);              // вывеска
  const [kx, kz] = at(0, d / 2 + 1.4);
  box(LIT, w - 2, 0.5, 3.2, '#f0522a', kx, gy + 4.6, kz, ry);                   // козырёк
  const [vx, vz] = at(0, d / 2 + 0.1);
  put(FLAT, new THREE.PlaneGeometry(w - 6, 3.4), '#cfe3f2', vx, gy + 2.4, vz, 0, ry, 0);
  const [dx2, dz2] = at(w / 2 - 4, d / 2 + 0.12);
  put(FLAT, new THREE.PlaneGeometry(3, 3.4), '#6b4c3a', dx2, gy + 1.92, dz2, 0, ry, 0);
  obb(cx, cz, w / 2, d / 2, ry);

  const [px, pz] = at(0, d / 2 + 11);        // куда подъезжать
  const [wx, wz] = at(0, d / 2 + 0.6);      // окно выдачи: отсюда вылетает коробка
  PIZZA = { x: px, z: pz, bx: cx, bz: cz, by: gy, wx, wz, wy: gy + 2.6, name: $t('пиццерия') };
}

/* где стоит запасная пиццерия: точка Додо из карты, а если её нет —
   ближайший к центру общепит */
function pizzaSpot () {
  const dodo = CITY.pois.filter(p => /додо|dodo/i.test(p.n0 || ''));
  const food = CITY.pois.filter(p => p.k === 'food');
  const list = (dodo.length ? dodo : food.length ? food : CITY.pois).slice()
    .sort((a, b) => Math.hypot(a.p[0], a.p[1]) - Math.hypot(b.p[0], b.p[1]));
  for (const p of list) {
    const road = nearestRoad(p.p[0], p.p[1], DRIVE_MAX, 2);
    if (!road || road.d < 14 || road.d > 60) continue;    // не на полотне и не в глуши
    return { x: p.p[0], z: p.p[1], ry: Math.atan2(p.p[0] - road.x, p.p[1] - road.z), road };
  }
  const p = list[0] || { p: [0, 0] };
  const road = nearestRoad(p.p[0], p.p[1], DRIVE_MAX, 4);
  return { x: p.p[0], z: p.p[1], ry: road ? Math.atan2(p.p[0] - road.x, p.p[1] - road.z) : 0, road };
}

/* что нужно mapworks.js (тупики, ремонт, ?mapcheck) из игры: сам он переменных
   этого модуля не видит. Списки — геттерами: часть объявлена ниже по файлу */
const mapApi = () => ({
  THREE, scene, cam, V, S, CITY, TH, LIT, LITM, FLAT, box, put, mergeGeos, obb, smashAdd, makeHuman, gibHuman, toast,
  groundH, surfaceAt, curbAt, inHouse, inBounds, nearestRoad, ROAD_HEX, RAISED, SOLIDS, BRIDGES,
  roadHexAt: (x, z, c) => { const q = nearestRoad(x, z, 7, 1); return RW.segHex(q && q.seg, ROAD_HEX[c]); },   // вид асфальта улицы (roadwear.js)
  onRunOver: () => { S.people++; },
  get TRAFFIC () { return TRAFFIC; }, get PEOPLE () { return PEOPLE; }, get PEDS () { return PEDS; }, get SCOOTS () { return SCOOTS; },
  get CROWDS () { return CROWDS; }, get DRIVERS () { return DRIVERS; }, get SMOKERS () { return SMOKERS; },
});
let MAPW_API = null;
/* что нужно roadlife.js (знаки, заборы, пробки за авариями, ремонт) */
const roadApi = () => ({
  THREE, scene, cam, V, S, CITY, box, put, mergeGeos, obb, smashAdd, smashMesh, SMASH, SOLIDS, SOLID_GRID, SCELL, PARKED, DRIVE_MAX,
  groundH, curbAt, inHouse, inPoly, inBounds, nearestRoad, NODES, NODE_IDX, edgeOf, edgeRun, laneCount, laneOff, routeNodes, nodeNear, nearestNode,
  walkLeg, walkSpawn, walkersAll, pushOut,          // pushOut — слетевший с мопеда обходит стены (mopeds.js)
  ZEBRAS, SIG_GROUPS, TRAFFIC, ACCIDENTS, newCar, placeTraffic, poseTraffic, poseOnSlope, svcGone, makeHuman, dropMesh, gibHuman, sayBubble, Snd, toast, calmStart, nearClient,
  onRunOver: () => { S.people++; },
  deadendBlocks: e => DEADENDS.blocksExit(DE_API, e),
  shownAt: (x, z) => flowShown(x, z),              // место видно курьеру — машину потока отсюда не переставлять (deadends.js)   // ремонт тут оставит одностороннюю без выезда (deadends.js)
  get PIZZA () { return PIZZA; }, get ENV () { return ENV; }, get tG () { return tG; }, startClear,
});
let RL_API = null;
/* что нужно billboards.js (щиты с рекламой) */
const bbApi = () => ({
  scene, CITY, ADULT, LIT, box, obb, groundH, inHouse, inBounds, nearestRoad, roadWidth,
  get ENV () { return ENV; },
});
let BB_API = null;
/* что нужно construction.js (стройки на пустырях) */
/* что нужно rivals.js (точки конкурентов, маскоты, курьеры-конкуренты) */
const rivApi = () => ({
  scene, CITY, ADULT, CAREER, LIT, LITM, LAMPH, V, S, SOLIDS, SMASH, NODES, PIZZERIAS, GEN_ENTR, TRAFFIC, CAR_L, CAR_W,
  box, put, boxGeo, mergeGeos, obb, smashAdd, smashMesh, addFoot: houseFoot, groundH, inHouse, inBounds, nearestRoad, roadWidth,
  edgeOf, edgeRun, poseTraffic, placeTraffic, newCar, svcGone, sayBubble, fxAdd, gibBurger, puff, Snd,
  distAt: DIST.has() ? (x, z) => DIST.at(x, z) : null,
});
const consApi = () => ({
  scene, CITY, ADULT, LIT, LITM, V, S, SOLIDS, GORE, SMASH, NODES, edgeOf, PIZZERIAS, GEN_ENTR, box, put, boxGeo, mergeGeos, obb, smashAdd, smashMesh,
  groundH, inHouse, inBounds, nearestRoad, roadWidth, pushOut, sparks, puff, Snd, hurt: hurtCar, addFoot: houseFoot,
  distAt: DIST.has() ? (x, z) => DIST.at(x, z) : null,
  get TRAFFIC () { return TRAFFIC; },
});
const ENV_API = { get ENV () { return ENV; } };    // пиццерия-шар: ночная подсветка (pizzadome.js)
/* что нужно citybits.js (забор, КПП, рельсы, крыши, купола, вывески ТЦ) */
/* что нужно pizzeria.js: ламповый фасад и парковка курьеров */
const pizzaApi = () => ({
  THREE, scene, LIT, FLAT, LITM, FLATM, LAMPH, LAMP_SPOTS, box, put, smashAdd, groundH, inHouse,
  CITY, SOLIDS, obb, inBounds, nearestRoad, addFoot: houseFoot,
  distAt: DISTRICTS ? (x, z) => DIST.at(x, z) : null,
  onRoad: (x, z, m) => { const r = nearestRoad(x, z, 7, 1); return !!r && r.d < r.seg.w / 2 + m; },
  onOtherRoad: (x, z, seg) => { const r = nearestRoad(x, z, 7, 1); return !!r && r.seg !== seg && r.d < r.seg.w / 2 + 0.3; },
});
/* места на парковке курьеров: [0] — твоё, дальше — соперников */
let COURIER_SLOTS = null;
const cityApi = () => ({ THREE, scene, LIT, FLAT, LITM, FLATM, LAMPH, LAMP_SPOTS, box, put, obb, groundH, nearestRoad, makeHuman });
/* что нужно world.js (плитка, аллеи, мусор, бандиты, особняки, шашлыки) */
const worldApi = () => ({
  THREE, scene, cam, V, S, CITY, MAP, CAREER, ADULT, LITM, LIT, LAMPH, LAMP_SPOTS, BENCHES, TRAFFIC, HUMAN_VC, SMASH, GEN_ENTR,
  box, boxGeo, geoScaled, put, mergeGeos, smashAdd, groundH, curbAt, inHouse, inPoly, inBounds, nearestRoad, pushOut, tree,
  makeHuman, dropMesh, gibHuman, handsUp, sayBubble, puff, sparks, toast, Snd, newCar, makeCarLite, poseOnSlope, donated, money,
  shiftN: () => +Store.get('dlv-shifts', 0) || 0,
  pay: n => { const p = Math.max(0, Math.min(wallet(), Math.round(n))); if (p) addWallet(-p); return p; },   // мзда — из кошелька
  hurt: n => { S.hurt = 0; hurtCar(n, 9, V.x + rand(-1, 1), V.z + rand(-1, 1)); },
  dent: (x, z, f) => dentCar(car, x, z, f),
  onRunOver: () => { S.people++; Snd.squish(); },
  get PIZZA () { return PIZZA; }, get ENV () { return ENV; }, get fenceAt () { return RL.RL.fenceAt; },
});
let WORLD_API = null;
/* что нужно junk.js (остановки, мусор у подъездов, контейнеры) */
const junkApi = () => ({
  scene, CITY, V, S, CAREER, LIT, SMASH, GORE, put, box, boxGeo, geoScaled, mergeGeos, smashAdd, obb,
  groundH, curbAt, inHouse, inBounds, nearestRoad, pushOut, sparks, puff, Snd, donated, hurt: hurtCar,
  get PIZZA () { return PIZZA; },
});
/* что нужно mafia.js (мафиози у адреса) */
const mafiaApi = () => ({
  V, S, scene, CAREER, ADULT, CAR_L, CAR_W, makeHuman, dropMesh, gibHuman, sayBubble, groundH, curbAt, inHouse, inBounds, pushOut, sparks, puff, toast, Snd,
  onRoad: (x, z) => { const r = nearestRoad(x, z); return !!r && r.d < (r.seg.w || 7) / 2 + 0.8; },
  hurt: n => { S.hurt = 0; hurtCar(n, 0, V.x + rand(-1, 1), V.z + rand(-1, 1)); },   // выстрел/помидор — полсердца, без мятин и поломок
  bump: () => { V.vx *= 0.25; V.vz *= 0.25; S.shake = Math.max(S.shake, 0.35); Snd.crash(8); },
  onRunOver: () => { S.people++; Snd.squish(); ACH.add('mafia'); },
  reward: (n, title) => { const v = CAREER ? n : Math.round(n / ECON.MONEY_K); S.money += v; if (!S.freeRun) addWallet(v); if (title) popBonus(title, '+' + money(v)); return v; },
});
let MAFIA_API = null;
/* что нужно thugs.js (гопники прессуют прохожего) */
const thugsApi = () => ({
  V, S, scene, CAREER, ADULT, HUMAN_VC, box, mergeGeos, makeHuman, dropMesh, gibHuman, sayBubble, handsUp, emote, groundH, curbAt, inHouse, inBounds, nearestRoad, toast, Snd, money,
  popBonus,
  onRunOver: () => { S.people++; Snd.squish(); },
  reward: n => { const v = CAREER ? n : Math.round(n / ECON.MONEY_K / 10) * 10; S.money += v; if (!S.freeRun) addWallet(v); return v; },
});
let THUGS_API = null;
/* что нужно protests.js (протест по ступеням, концерты во дворах) */
const protApi = () => ({
  V, S, scene, CAREER, ADULT, HUMAN_VC, BENCHES, Store, put, mergeGeos, makeHuman, dropMesh, gibHuman, sayBubble, emote, puff, groundH, curbAt, inHouse, inBounds, nearestRoad,
  CAR_L, CAR_W, sparks, Snd,                       // тумбы сбиваются машиной (protests.js PROT.HIT)
  segs: () => RSEG, get ENV () { return ENV; }, chat: s => CHAT.say(s),
  popBonus,
  onRunOver: () => { S.people++; Snd.squish(); },
});
let PROT_API = null;
/* что нужно growth.js (вид пиццерии по ступени: гости, очередь, гирлянды, оркестр) */
const growApi = () => ({
  V, S, scene, CAREER, ADULT, HUMAN_VC, PIZZERIAS, box, put, mergeGeos, makeHuman, dropMesh, gibHuman, emote, groundH, smashMesh,
  popBonus,
  onRunOver: () => { S.people++; Snd.squish(); },
  get PIZZA () { return PIZZA; }, get ENV () { return ENV; },
});
let GROW_API = null;
/* что нужно heroes.js (герои города: места, реплики, сбить) */
const heroesApi = () => ({
  V, S, scene, CAREER, ADULT, CAR_L, CAR_W, Store, CITY, PITCHES, BENCHES, PIZZERIAS, makeHuman, dropMesh, gibHuman, groundH, curbAt,
  inHouse, inBounds, nearestRoad, pushOut, emote, fxAdd, puffGeo, Snd,
  garages: () => (CAREER ? AUTO.garages() : []), hookahSpots: () => HK.spots(),
  onRunOver: () => { S.people++; Snd.squish(); },
  get PIZZA () { return PIZZA; },
});
let HEROES_API = null;
/* что нужно fauna.js (лоси, лисы, зайцы в лесах) */
const faunaApi = () => ({
  V, S, scene, cam, CITY, CAR_L, CAR_W, ADULT, groundH, inPoly, inHouse, inBounds, nearestRoad, toast, emote, sparks, sayBubble, Snd,
  hurt: (n, vn, x, z) => { ACH.add('moose'); hurtCar(n, vn, x, z, 'person'); },   // зовётся только при ударе о лося (звук — мягкое тело)
  ram: (vn, x, z) => hurtCar(0.5, vn, x, z, 'person'),      // лось боднул машину: половинка сердца и мятина (fauna.js RAM)
});
let FAUNA_API = null;
/* что нужно horsebox.js (коневозки в потоке) */
const hbApi = () => ({
  V, S, scene, TRAFFIC, CAR_L, CAR_W, put, mergeGeos, surfaceAt, pushOut, sparks, puff, sayBubble, Snd,
  hurt: (n, vn, x, z) => hurtCar(n, vn, x, z, 'car'),
});
let HB_API = null;
/* что нужно cats.js (продухи подвалов, коты) */
const catsApi = () => ({
  V, S, scene, cam, CITY, FLATM, ARCHES, WGRID, groundH, inHouse, inPoly, nearestRoad, hexOf, Snd,
});
let CATS_API = null;
/* дым из выхлопа (exhaust.js) */
let EXH_API = null;
/* мотор (motor.js): что едет машина — из driveStep одним объектом без мусора в кадре; api — поток, ресурс мотора, хлопок */
const MOTOR_IN = { live: true, dead: false, brake: 0, hand: 0, side: 0, air: false, nos: false, vmax: 48, surf: 1, id: '' };
let MOTOR_API = null;
const motorApi = () => ({ TRAFFIC, V, live: () => isPlaying(), carId: () => (CAREER ? AUTO.current().id : ''), health: () => (CAREER ? AUTO.engine().c : 100), pop: loud => EXH.liftPop(loud) });
/* грязь и снег на машине (cardirt.js): идёт ли смена и погода — одним объектом без мусора в кадре */
const LIVE_DIRT = new Set(['drive', 'back', 'side', 'handover']);
const DIRT_ENV = { rain: 0, snowFall: 0, snow: 0, mud: 0, wet: 0 };
const DIRT_W = w => { w.rain = SEAS.snowy() ? 0 : ENV.rain; w.snowFall = SEAS.snowFall(); w.snow = SEAS.snowAmt(); w.mud = SEAS.mudAmt(); w.wet = SEAS.wetAmt(); return w; };
const exhApi = () => ({ V, TRAFFIC, cam, career: CAREER, auto: AUTO, snd: Snd, car: () => car, gas: () => IN.gas,
  live: () => isPlaying() && S.state !== 'loading', snow: SEAS.snowAmt, night: () => ENV.night });
/* что нужно darknight.js (тёмная ночь: костры, котлы, привидения) */
/* что нужно wastelands.js (назначение пустырей, тропинки, лужи) */
const wasteApi = () => ({
  scene, V, S, CITY, ADULT, LIT, LITM, SOLIDS, BENCHES, GEN_ENTR, CAR_L, CAR_W,
  box, put, boxGeo, mergeGeos, obb, smashAdd, groundH, inHouse, inBounds, nearestRoad, addFoot: houseFoot,
  makeHuman, makePerson, dropMesh, gibHuman, sayBubble, Snd,
  pitch: (cx, cz, ang, L, W) => pitchAt(cx, cz, ang, L, W, false),   // коробка на пустыре — та же, что во дворах: ворота, бортики, игра днём
  runOver: () => { S.people++; Snd.squish(); },
  get PITCHES () { return PITCHES; }, get ENV () { return ENV; },
});
/* что нужно beach.js (пляж на Томи) */
const beachApi = () => ({
  scene, V, S, ADULT, LIT, LITM, CAR_L, CAR_W, put, boxGeo, mergeGeos, obb, smashMesh, groundH, inBounds,
  makeHuman, makePerson, dropMesh, gibHuman, sayBubble, puff, Snd,
  runOver: () => { S.people++; Snd.squish(); },
  get ENV () { return ENV; },
});
const darkApi = () => ({
  scene, cam, V, CITY, ADULT, CAR_L, CAR_W, put, boxGeo, mergeGeos, groundH, makeHuman, makePerson, dropMesh, gibHuman, gibBurger, sayBubble, fxAdd, puff, sparks, Snd,
  isOpenAt: DIST.has() ? (x, z) => DIST.isOpen(DIST.at(x, z)) : null,
  runOver: () => { S.people++; },
  get ENV () { return ENV; },
});
/* что нужно nightlife.js (только ADULT): девушки у обочины, стрип-клуб */
const nightApi = () => ({
  THREE, scene, cam, V, S, CITY, MAP, LIT, HUMAN_VC, CAR_L, CAR_W, box, put, obb, groundH, curbAt, inHouse, inBounds, nearestRoad, pushOut,
  makeHuman, makePerson, dropMesh, gibHuman, sayBubble, Snd,
  unLod: g => HUMANS.delete(g),                    // танцовщицы в клубе: всегда ближний вариант (дальний — без купальника)
  addFoot: p => {                                  // пристройка клуба — как дом: деревья, лавочки и прохожие её обходят
    const b = { p, k: 'club' };
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++) for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) {
      const k = i + ',' + j;
      if (!HOUSE_GRID.has(k)) HOUSE_GRID.set(k, []);
      HOUSE_GRID.get(k).push(b);
    }
  },
  runOver: () => { S.people++; Snd.squish(); },
  get ENV () { return ENV; },
});
const landApi = () => ({ ...cityApi(), inHouse, makePerson, smashAdd, curbAt });
let RINK = null;                                  // каток с катающимися (landmarks.js), если он есть в карте

/* ─── сборка города ─── */
const BUILD_T = {};                               // сколько собирался каждый кусок — для отладки
function* timedSteps (k, it) {                    // шаги куска (latebuild.js) — время суммой в BUILD_T[k]
  let ms = BUILD_T[k] || 0;
  for (;;) {
    const t0 = performance.now(), r = it.next();
    ms += performance.now() - t0; BUILD_T[k] = Math.round(ms);
    if (r.done) return r.value;
    yield r.value;
  }
}
function buildCity () {
  const house = dodoHouse();
  const spot = house ? null : pizzaSpot();
  const tm0 = (k, f) => { const t0 = performance.now(); f(); BUILD_T[k] = Math.round(performance.now() - t0); };
  tm0('ground', osmGround);
  RW.init({ CITY, MAP, nearestRoad, get ENV () { return ENV; } });   // вид асфальта улиц — до полотна (roadwear.js); ENV — позже, на дождь
  tm0('roads', osmRoads);
  tm0('curbs', osmCurbs);
  tm0('marks', osmMarkings);
  tm0('bridges', osmBridges);
  tm0('edge', osmEdgeBlocks);
  if (CITY.rails) tm0('rails', () => { BUILD_T.railKm = Math.round(CBITS.buildRails(cityApi(), CITY.rails, CITY.levelx)); });
  if (MAPFIX) { BUILD_T.mapfix = Math.round(MAPFIX.ms); BUILD_T.mapfixT = MAPFIX.T; tm0('mapworks', () => MAPW.buildWorks(MAPFIX, mapApi())); }   // тупики: блоки и ремонт
  { const t0 = performance.now(); osmBuildings(spot); BUILD_T.houses = Math.round(performance.now() - t0); }
  if (house) { PIZZA = dodoFacade(house); COURIER_SLOTS = PIZZA.slots; SMOKE_SPOT = PIZZA.smoke; }
  else buildPizzeria(spot.x, spot.z, spot.ry);
  if (DISTRICTS && house) { buildDistrictPizzerias(); usePizzeria(DIST.cur()); }
  // во вступлении место под кружок знаем заранее — его держим пустым

  // дальше — то, что в меню не главное: с поздней сборкой (latebuild.js) — очередью после первого кадра меню, в том же порядке
  // кусок может вернуть итератор (шаги по кадрам, latebuild.js) — время в BUILD_T тогда суммой шагов
  const tm = (k, f) => LATE.add(k, () => { const t0 = performance.now(), r = f(); BUILD_T[k] = Math.round(performance.now() - t0); return r && r.next ? timedSteps(k, r) : r; });
  if (ADULT && !INTRO) tm('nightlife', () => NIGHT.build(nightApi()));   // стрип-клуб и места «ночных бабочек» (nightlife.js) — до деревьев и лавочек: они обходят пристройку
  tm('world', () => WORLD.build(worldApi()));     // аллеи; в карьере — газоны особняков, мусор, гаражи (world.js) — до деревьев и лавочек
  if (!INTRO && !new URLSearchParams(location.search).has('nocons')) tm('construction', () => CONSTR.build(consApi()));   // стройки на пустырях — до деревьев и лавочек: участок обходят (construction.js); ?nocons — без них
  if (!INTRO && !new URLSearchParams(location.search).has('norivals')) tm('rivals', () => RIVS.build(rivApi()));   // точки конкурентов — тоже до деревьев, лавочек и smashBuild (rivals.js); ?norivals — без них
  if (!INTRO) tm('darknight', () => DARKN.build(darkApi()));   // тёмная ночь: места костров и котлов — свободные пустыри после строек (darknight.js)
  if (!INTRO && !new URLSearchParams(location.search).has('nowaste')) tm('wastelands', () => WASTE.build(wasteApi()));   // назначение пустырей — после строек, точек и костров (wastelands.js); ?nowaste — без них
  if (!INTRO) tm('beach', () => BEACH.build(beachApi()));   // пляж на Томи: песок, ларёк, летнее — после пустырей, до мелочи на газоне (beach.js)
  tm('life', function* () { JUNK.init(junkApi()); yield 'junk'; yield* osmStreetLife(); });   // шагами (latebuild.js)
  tm('entr', osmEntrances);
  tm('vents', () => { BUILD_T.ventsInfo = CATS.build(CATS_API || (CATS_API = catsApi())); });   // продухи подвалов — после подъездов (cats.js)
  tm('signs', osmSigns);
  tm('gates', osmGates);
  tm('trees', osmStreetTrees);
  tm('metro', osmMetro);
  tm('lots', () => osmParkingLots(PIZZERIAS.length ? PIZZERIAS : PIZZA));
  tm('lights', buildLights);
  tm('ramps', osmRamps);
  tm('landmarks', () => {                          // заправки из карты, каток — если карта его назвала
    BUILD_T.fuel = LM.buildFuel(landApi(), CITY.pois);
    if (MAP.landmarks && MAP.landmarks.rink) RINK = LM.buildRink(landApi(), CITY.green, MAP.landmarks.rink);
  });
  tm('roadlife', () => RL.build(roadApi()));      // знаки и заборы (roadlife.js) — до smashBuild
  if (!INTRO) tm('billboards', () => BB.build(bbApi()));   // щиты с рекламой у больших дорог (billboards.js)
  if (CAREER) tm('cars', () => { BUILD_T.carsInfo = AUTO.build(); });   // ямы в статику дорог, гараж Дяди Жени (cars.js)
  // дворы — мелкими кусками: каждый — своя задача, меню между ними не стоит
  tm('yard', () => { osmPitches(); if (!INTRO) BUILD_T.workout = WORK.build({ THREE, PITCHES, LIT, box, obb, groundH, inHouse, nearestRoad, solidAt, BENCHES, onPave: PAVE.onPave }); });
  tm('yardbits', function* () { osmYardBits(); yield 'bits'; if (!INTRO) JUNK.yard(); yield 'junk'; osmVerandas(); });
  if (!INTRO) tm('yardtrees', function* () { BUILD_T.yardTrees = yield* TREES.plantYardsSteps({ CITY, tree, inHouse, inBounds, inPoly, groundH, nearestRoad, solidAt, SMASH, YARD_PATHS, PITCHES }); });   // шагами (latebuild.js)   // группы деревьев во дворах и кусты под окнами (trees.js)
  tm('edits', () => EDL.apply({ THREE, scene, tree, bench, lamp: o => SL.lamp({ THREE, scene, LAMPH, LAMP_SPOTS, put, smashAdd, groundH, curbAt }, o), unlamp: SL.unlamp, smashAdd, put, box, LIT, obb, groundH, curbAt,
    BENCHES, PROPS, SOLIDS, SMASH, SMASH_GRID, SM_CHUNKS, SM_CELL, LAMPH, LAMP_SPOTS }));   // правки из редактора: поставить добавленное (editlayer.js)
  tm('seasonyard', SEAS.seasonYard);
  tm('smash', smashBuild);
  tm('seasons', SEAS.seasonSteps);                // сугробы, ёлки, гирлянды — шагами (latebuild.js)
  if (!INTRO) tm('trails', WASTE.trails);         // тропинки наискосок, вытоптанное у лавочек, лужи — после дворов и лавочек (wastelands.js)

  /* склейка статики: сначала то, что уже собрано (земля, дороги, дома — их видно в меню), потом —
     после поздних кусков — их полотно, плитка и ямы отдельными мешами по тем же клеткам и с тем же материалом */
  const tq = performance.now();
  const litMat = HUR.holeMat(LAWN.lawnMat(RW.wearMat(WORLD.paveMat(SEAS.seasonMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }))))));   // + узор плитки (world.js), + вид асфальта (roadwear.js), + пятна газона (lawn.js), + ураган (hurricane.js)
  const flatMat = HUR.holeMat(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const groups = [];
  const meshNow = keep => { for (const g of [LITM.mesh(litMat, keep), FLATM.mesh(flatMat, keep)]) { if (g.children.length) { groups.push(g); scene.add(g); } } };
  if (LATE.busy()) {                              // поздняя сборка: видимое — в сцену сразу, в видеокарту — при первом кадре
    meshNow(true);
    // шейдеры города — видеокарта компилирует их сама, пока здесь строится остальное (первый кадр меню не ждёт компиляции)
    try { renderer.compileAsync(scene, cam).catch(() => {}); } catch (e) { /* — */ }
  }
  BUILD_T.mesh = Math.round(performance.now() - tq);
  LATE.add('mesh', () => { const t0 = performance.now(); meshNow(); BUILD_T.meshLate = Math.round(performance.now() - t0); });
  WINS.build(scene);                              // окна — по клеткам, один материал (windows.js)
  PAINT.build(scene);                             // муралы — один меш (citypaint.js)
  /* Всю статику — сразу в видеокарту, одним кадром в крохотную цель:
     иначе куски, которых ещё не было в кадре, держат свои вершины и в
     памяти JS (onUpload их отпускает только после загрузки) */
  LATE.add('upload', () => {
    const tu = performance.now();
    const tmp = new THREE.Scene(), rt = new THREE.WebGLRenderTarget(4, 4);
    for (const g of groups) { for (const m of g.children) m.frustumCulled = false; tmp.add(g); }
    renderer.setRenderTarget(rt); renderer.render(tmp, cam); renderer.setRenderTarget(null); rt.dispose();
    for (const g of groups) { for (const m of g.children) m.frustumCulled = true; scene.add(g); }
    BUILD_T.upload = Math.round(performance.now() - tu);
    BUILD_T.tris = Math.round(BUILT_TRIS);
    MAPW.freeAsphalt();
  });
}

/* ─────────────── граф улиц: маршрут, полосы, светофоры, зебры ───────────────
   Узлы — точки карты, рёбра — куски улиц между ними. Перекрёстки в
   выгрузке сохранены специально (scripts/osm_moscow.py режет линию на
   куски по общим узлам), иначе улица и переулок в графе просто не
   встретились бы. Поиск в ширину даёт кратчайший путь для навигатора;
   ехать по нему или дворами — дело водителя.

   Каждое ребро хранится в обе стороны: у направления своя правая
   сторона, свои полосы и своё «можно ли сюда ехать» — на односторонней
   улице трафик против шерсти не поедет. */

const NODES = [];
const NODE_IDX = new Map();
const EDGES = new Map();                          // направленные рёбра
const ekey = (a, b) => a * 100000 + b;
const edgeOf = (a, b) => EDGES.get(ekey(a, b));
const ukey = (a, b) => (a < b ? ekey(a, b) : ekey(b, a));    // ребро без направления
{
  const node = (x, z) => {
    const k = x + ',' + z;
    let i = NODE_IDX.get(k);
    if (i === undefined) { i = NODES.length; NODE_IDX.set(k, i); NODES.push({ x, z, nb: [] }); }
    return i;
  };
  const link = (a, b, r, okAB, okBA) => {
    if (EDGES.has(ekey(a, b))) return;            // две улицы по одним узлам — берём первую
    const A = NODES[a], B = NODES[b];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    if (len < 0.3) return;
    const ux = (B.x - A.x) / len, uz = (B.z - A.z) / len, w = roadWidth(r);
    const mk = (from, to, ok, sg) => ({
      a: from, b: to, len, ux: ux * sg, uz: uz * sg, rx: -uz * sg, rz: ux * sg,
      w, c: r.c, ok, oneway: !!r.o, lanes: r.l || 0, road: r, tA: 0, tB: 0, sig: null, stopAt: 0,
    });
    A.nb.push(b); B.nb.push(a);
    EDGES.set(ekey(a, b), mk(a, b, okAB, 1));
    EDGES.set(ekey(b, a), mk(b, a, okBA, -1));
  };
  for (const r of CITY.roads) {
    if (!drivable(r)) continue;                    // пешеходка и обрывки за рамкой не в счёт
    let prev = node(r.p[0][0], r.p[0][1]);
    for (let i = 1; i < r.p.length; i++) {
      const cur = node(r.p[i][0], r.p[i][1]);
      if (cur === prev) continue;
      link(prev, cur, r, true, !r.o);
      prev = cur;
    }
  }
}
// номера узлов на концах куска (b у куска уже занято — это мост)
for (const s of RSEG) { s.na = NODE_IDX.get(s.x1 + ',' + s.z1); s.nb = NODE_IDX.get(s.x2 + ',' + s.z2); }
/* закрытая часть города (MAP.open): узлы за линией — out, рёбра к ним закрыты (openEdges) */
if (MAP.open) {
  for (const N of NODES) N.out = !inBorder(N.x, N.z);
  for (const e of EDGES.values()) if (NODES[e.a].out || NODES[e.b].out) e.closed = 1;
}

/* узлов тысячи, перебирать их на каждый пересчёт маршрута
   незачем — раскладываем по клеткам сто двадцать метров */
const NCELL = 120, NODE_GRID = new Map();
for (let k = 0; k < NODES.length; k++) {
  const key = Math.floor(NODES[k].x / NCELL) + ',' + Math.floor(NODES[k].z / NCELL);
  let a = NODE_GRID.get(key);
  if (!a) NODE_GRID.set(key, a = []);
  a.push(k);
}

function nearestNode (x, z) {
  const ci = Math.floor(x / NCELL), cj = Math.floor(z / NCELL);
  let best = -1, bd = Infinity;
  for (let ring = 1; ring <= 8; ring++) {
    for (let i = ci - ring; i <= ci + ring; i++)
      for (let j = cj - ring; j <= cj + ring; j++) {
        const a = NODE_GRID.get(i + ',' + j);
        if (!a) continue;
        for (const k of a) {
          const d = (NODES[k].x - x) ** 2 + (NODES[k].z - z) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
      }
    if (best >= 0) break;
  }
  return best < 0 ? 0 : best;
}

function routeNodes (fromX, fromZ, toX, toZ) {
  const a = nearestNode(fromX, fromZ), b = nearestNode(toX, toZ);
  if (a === b) return [NODES[a]];
  const prev = new Int32Array(NODES.length).fill(-1);
  const seen = new Uint8Array(NODES.length);
  const q = [a]; seen[a] = 1;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    if (cur === b) break;
    for (const nb of NODES[cur].nb) {
      if (seen[nb] || ((NODES[nb].out || NODES[nb].lock) && nb !== b)) continue;     // за линию закрытого города и в закрытый район не ведём
      seen[nb] = 1; prev[nb] = cur; q.push(nb);
    }
  }
  const path = [];
  for (let k = b; k !== -1; k = prev[k]) { path.unshift(NODES[k]); if (k === a) break; }
  return path;
}

/* Полосы. На двусторонней улице половина полотна — своё направление,
   на односторонней всё полотно. Полоса 0 — крайняя правая, у бордюра;
   смещение считается от осевой вдоль правой нормали ребра. */
function laneCount (e) {
  if (e.oneway && !e.two) return e.lanes || Math.max(1, Math.round(e.w / 3.3));
  if (NAR.narrow(e)) return 1;                     // узкая двусторонняя — одна полоса посередине (narrow.js)
  return e.lanes ? Math.max(1, Math.floor(e.lanes / 2)) : (e.w >= 12.5 ? 2 : 1);
}
function laneOff (e, k) {
  if (NAR.narrow(e)) return 0;
  const n = laneCount(e), lw = (e.oneway && !e.two ? e.w : e.w / 2) / n;   // two — одностороння в тупик, для потока двусторонняя (deadends.js)
  return e.w / 2 - lw * (Math.min(k, n - 1) + 0.5);
}

/* Обрезка у перекрёстка. Машина едет по ребру не от узла до узла, а от
   края перекрёстка до края, а сам перекрёсток проходит дугой. На изломе
   улицы (узел с двумя рёбрами) дуга маленькая, на прямой её нет вовсе. */
const nodeDeg = n => NODES[n].nb.length;
for (let n = 0; n < NODES.length; n++) {
  const N = NODES[n], deg = N.nb.length;
  let maxW = 0;
  for (const m of N.nb) maxW = Math.max(maxW, edgeOf(n, m).w);
  let t = 0;
  if (deg >= 3) t = maxW / 2 + 1.2;
  else if (deg === 2) {
    const e1 = edgeOf(n, N.nb[0]), e2 = edgeOf(n, N.nb[1]);
    const straight = -(e1.ux * e2.ux + e1.uz * e2.uz);          // 1 — улица идёт прямо
    if (straight < 0.96) t = Math.min(6, maxW / 2);
  }
  for (const m of N.nb) {
    const e = edgeOf(n, m), tt = Math.min(t, e.len * 0.42);
    e.tA = tt; edgeOf(m, n).tB = tt;
  }
}
const edgeRun = e => Math.max(0.2, e.len - e.tA - e.tB);   // сколько ехать по ребру до дуги

/* ── светофоры ──
   Настоящие — из карты (highway=traffic_signals), а на пересечениях двух
   больших улиц, где в карте светофора нет, ставим свой. Узлы одного
   перекрёстка (у разделённых проспектов их по четыре) собираются в
   группу; у группы две фазы: вдоль главной улицы и поперёк. Внутри
   группы машина не останавливается — только на въезде в неё. */
const ZW = 3.4;                                    // ширина зебры вдоль дороги
const inBounds = (x, z, m = 0) => x > BOUNDS.x0 + m && x < BOUNDS.x1 - m && z > BOUNDS.z0 + m && z < BOUNDS.z1 - m && (m < 0 || inBorderM(x, z, m));
/* тупики потока (deadends.js): одностороння в тупик — для потока двусторонний тупик с разворотом,
   а не исчезновение машины на глазах; пересчёт — когда открылся район (districtLocks). ?nodeadend — как было */
const DE_API = { NODES, EDGES, edgeOf, flowOk: e => NAR.flowOk(e, nodeDeg), inside: inBounds, lockNear: n => NODES[n].nb.some(m => edgeOf(n, m).lock),
  dry: new URLSearchParams(location.search).has('nodeadend') };
DEADENDS.mark(DE_API);
const SIG_GROUPS = [];
{
  const centers = [];
  for (const [x, z] of CITY.signals) if (inBounds(x, z, -10)) centers.push({ x, z, real: 1 });
  // свои: перекрёсток, где сходятся две разные улицы не меньше третьего класса
  for (let n = 0; n < NODES.length; n++) {
    const N = NODES[n];
    if (N.nb.length < 3 || !inBounds(N.x, N.z, 20)) continue;
    const names = new Set();
    for (const m of N.nb) { const e = edgeOf(n, m); if (e.c <= 3) names.add(e.road.n || e.road); }
    if (names.size < 2) continue;
    if (centers.some(c => Math.hypot(c.x - N.x, c.z - N.z) < 70)) continue;
    centers.push({ x: N.x, z: N.z, real: 0 });
  }
  // центры ближе сорока метров — один перекрёсток
  const used = new Array(centers.length).fill(false);
  for (let i = 0; i < centers.length; i++) {
    if (used[i]) continue;
    const cl = [centers[i]]; used[i] = true;
    for (let k = 0; k < cl.length; k++)
      for (let j = 0; j < centers.length; j++)
        if (!used[j] && Math.hypot(centers[j].x - cl[k].x, centers[j].z - cl[k].z) < 40) { used[j] = true; cl.push(centers[j]); }
    const nodes = new Set();
    for (let n = 0; n < NODES.length; n++) {
      const N = NODES[n];
      if (N.nb.length < 3) continue;
      if (cl.some(c => Math.hypot(c.x - N.x, c.z - N.z) < 24)) nodes.add(n);
    }
    // светофор посреди улицы — у перехода: ближайший узел, даже если это излом
    if (!nodes.size) {
      const c = cl[0], k = nearestNode(c.x, c.z);
      if (Math.hypot(NODES[k].x - c.x, NODES[k].z - c.z) < 14) nodes.add(k);
    }
    if (!nodes.size) continue;
    const g = { nodes, app: [], real: cl.some(c => c.real), x: 0, z: 0 };
    for (const n of nodes) { g.x += NODES[n].x / nodes.size; g.z += NODES[n].z / nodes.size; }
    for (const n of nodes)
      for (const m of NODES[n].nb) {
        if (nodes.has(m)) continue;
        const e = edgeOf(m, n);
        if (e.c <= 5) g.app.push(e);
      }
    if (g.app.length < 2) continue;
    // главная ось — по самой крупной улице, дальше всё поперёк неё
    const main = g.app.slice().sort((p, q) => p.c - q.c || q.len - p.len)[0];
    for (const e of g.app) {
      const ph = Math.abs(e.ux * main.ux + e.uz * main.uz) >= 0.7 ? 0 : 1;
      // стоп-линия — перед зеброй; если ребро короткое, зебры нет, стоим у края
      const room = e.len - e.tA - e.tB;
      const zeb = room > ZW + 6;
      e.sig = { g, ph, zeb };
      e.stopAt = e.tB + (zeb ? ZW + 1.4 : 0.6);
    }
    SIG_GROUPS.push(g);
  }
}

/* ── зебры ──
   На каждом въезде в регулируемый перекрёсток, там, где переход стоит в
   карте, и на части нерегулируемых перекрёстков. Зебра знает ребро, на
   котором лежит, — по ней пешеходы и переходят улицу, а машины перед
   ней пропускают тех, кто уже вышел на полотно. */
const ZEBRAS = [];
const ZEB_BY_EDGE = new Map();
function addZebra (a, b, dA, sig) {
  // dA — расстояние от узла a вдоль ребра a→b до середины зебры
  const e = edgeOf(a, b), A = NODES[a];
  const x = A.x + e.ux * dA, z = A.z + e.uz * dA;
  if (ZEBRAS.some(q => Math.hypot(q.x - x, q.z - z) < 9)) return null;
  const zb = { a, b, d: dA, x, z, ux: e.ux, uz: e.uz, w: e.w, sig, e };
  ZEBRAS.push(zb);
  const k = ukey(a, b);
  let l = ZEB_BY_EDGE.get(k);
  if (!l) ZEB_BY_EDGE.set(k, l = []);
  l.push(zb);
  return zb;
}
for (const g of SIG_GROUPS)
  for (const e of g.app)
    if (e.sig.zeb) addZebra(e.a, e.b, e.len - e.tB - ZW / 2 - 0.3, e.sig);
for (const [x, z] of CITY.crossings) {
  const road = nearestRoad(x, z, 4, 1);
  if (!road || road.d > 5 || road.seg.na === undefined || road.seg.nb === undefined) continue;
  const e = edgeOf(road.seg.na, road.seg.nb);
  if (!e || e.len - e.tA - e.tB < ZW + 2) continue;
  const dA = clamp(road.t * e.len, e.tA + ZW / 2 + 0.3, e.len - e.tB - ZW / 2 - 0.3);
  // рядом с регулируемым перекрёстком переход живёт по его светофору
  const into = edgeOf(e.a, e.b).sig || edgeOf(e.b, e.a).sig;
  addZebra(e.a, e.b, dA, into && Math.hypot(x - into.g.x, z - into.g.z) < 45 ? into : null);
}
for (let n = 0; n < NODES.length; n++) {
  const N = NODES[n];
  if (N.nb.length < 3 || !inBounds(N.x, N.z, 30) || Math.random() > 0.45) continue;
  if (ZEBRAS.some(q => Math.hypot(q.x - N.x, q.z - N.z) < 30)) continue;
  for (const m of N.nb) {
    const e = edgeOf(m, n);
    if (e.c > 4 || e.len - e.tA - e.tB < ZW + 6) continue;
    addZebra(m, n, e.len - e.tB - ZW / 2 - 0.3, null);
  }
}

/* светофорный цикл: одна фаза едет, другая стоит, между ними жёлтый
   и пара секунд «все стоят» — чтобы перекрёсток успел опустеть */
const TL_PLAN = [[0, 'g', 14], [0, 'y', 2.5], [-1, 'r', 2], [1, 'g', 11], [1, 'y', 2.5], [-1, 'r', 2]];
const TL = { t: 0, i: 0 };
const lightOf = ph => (TL_PLAN[TL.i][0] === ph ? TL_PLAN[TL.i][1] : 'r');

/* ─────────────── эффекты: искры, дым, огонь, кровь, следы ───────────────
   Один список на всё: у частицы своя скорость, время жизни и то,
   как она гаснет. Материалы клонируются — иначе гаснут все разом. */

const FX = [], DECALS = [];
PIX.init(scene, GFX.fxLow, cam);                  // пул пиксельных частиц — одна отрисовка (pixfx.js)
const sparkGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
const bitGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const puffGeo = new THREE.IcosahedronGeometry(0.5, 0);

/* Высоты у эффектов передаются от земли: пол под частицей берём один
   раз, при рождении, — далеко она всё равно не улетает. */
function fxAdd (mesh, o, floor) {
  // графика «эффекты: меньше» (gfx.js): мелкие частицы — через одну, все — короче
  if (GFX.fxLow()) {
    const g = mesh.geometry;
    if ((g === sparkGeo || g === bitGeo || g === puffGeo) && GFX.fxDrop()) { if (mesh.material && mesh.material.dispose) mesh.material.dispose(); return; }
    const k = GFX.fxLife();
    if (o.life) o.life *= k;
    if (o.max) o.max *= k;
  }
  scene.add(mesh);
  FX.push(Object.assign({ mesh, vx: 0, vy: 0, vz: 0, life: 1, max: 1, grow: 0, spin: 0, gravity: 0, fade: 1, floor }, o));
}

/* искры — от чиркания о стену и от удара в чужую машину */
function sparks (x, y, z, n, dirx, dirz) {
  const f = floorAt(x, z);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: chance(0.5) ? 0xfff3c4 : 0xffa022 }));
    m.position.set(x, f + y, z);
    fxAdd(m, {
      vx: (dirx || 0) * rand(1, 4) + rand(-5, 5), vy: rand(1.5, 6), vz: (dirz || 0) * rand(1, 4) + rand(-5, 5),
      life: rand(0.25, 0.6), max: 0.6, gravity: 16, spin: rand(-20, 20),
    }, f);
  }
}

/* дым из-под капота: чем хуже машине, тем чернее */
function puff (x, y, z, dark, size) {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
    color: dark ? 0x3a3238 : 0xd8d5d0, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  m.position.set(x, floorAt(x, z) + y, z);
  m.scale.setScalar(size || 0.7);
  fxAdd(m, { vy: rand(1.4, 2.6), vx: rand(-0.6, 0.6), vz: rand(-0.6, 0.6), life: rand(1, 1.8), max: 1.8, grow: 1.5, spin: rand(-1, 1) });
}

/* пламя нитро: голубое, бьёт назад и быстро гаснет. Высота — готовая,
   от настила или земли под машиной */
function nosFlame (x, y, z, bx, bz) {
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
      color: chance(0.5) ? 0x6fd3ff : 0xe6f7ff, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    m.position.set(x + rand(-0.15, 0.15), y + rand(-0.1, 0.1), z + rand(-0.15, 0.15));
    m.scale.setScalar(rand(0.25, 0.45));
    fxAdd(m, { vx: bx * rand(8, 14) + V.vx * 0.6, vy: rand(0, 0.6), vz: bz * rand(8, 14) + V.vz * 0.6,
               life: rand(0.15, 0.3), max: 0.3, grow: 2.5 });
  }
}

/* брызги над Томью: высота — от воды, а не от дна */
function splash (x, z) {
  const w = Math.max(0, groundH(x, z));
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
      color: 0xeaf6ff, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    m.position.set(x + rand(-1.5, 1.5), w + rand(0.1, 0.6), z + rand(-1.5, 1.5));
    m.scale.setScalar(rand(0.4, 0.8));
    fxAdd(m, { vy: rand(2, 4.5), vx: rand(-1.5, 1.5), vz: rand(-1.5, 1.5), life: rand(0.5, 0.9), max: 0.9, grow: 1.2, gravity: 9 }, w);
  }
}

function fire (x, y, z) {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
    color: chance(0.5) ? 0xff8a2b : 0xffd34d, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  m.position.set(x, floorAt(x, z) + y, z);
  m.scale.setScalar(rand(0.5, 1.1));
  fxAdd(m, { vy: rand(2, 4), vx: rand(-1.2, 1.2), vz: rand(-1.2, 1.2), life: rand(0.4, 0.8), max: 0.8, grow: 2.2 });
}

/* след на асфальте: кровь, копоть. Лежит и медленно выцветает */
function decal (x, z, hex, r, life) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 10),
    new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.85, depthWrite: false }));
  // ложится по склону: круг смотрит вдоль нормали земли
  // на верх того, что нарисовано (асфальт, поднятый тротуар, сугроб — hits.js topAt): с рельефа + 0,2 пятна прятались под тротуаром
  const y = HITS.topAt(x, z), onDeck = y - groundH(x, z) > 0.4;
  const nrm = onDeck ? TNORM.set(0, 1, 0) : groundNormal(x, z);
  const lift = 0.03 + DECALS.length * 0.002;
  m.position.set(x + nrm.x * lift, y + nrm.y * lift, z + nrm.z * lift);
  m.lookAt(m.position.x + nrm.x, m.position.y + nrm.y, m.position.z + nrm.z);
  m.scale.set(rand(0.8, 1.3), rand(0.8, 1.3), 1);
  scene.add(m);
  const dl = (life || 30) * (GFX.fxLow() ? 0.5 : 1);   // «эффекты: меньше» — следы вдвое короче и не больше 35
  DECALS.push({ m, life: dl, max: dl });
  while (DECALS.length > GFX.decalMax()) { const d = DECALS.shift(); scene.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose(); }
}

function blood (x, y, z, n) {
  if (!GORE_ON) return;
  const f = floorAt(x, z);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(bitGeo, new THREE.MeshBasicMaterial({ color: chance(0.4) ? 0x8f1f2b : 0xc42b32 }));
    m.position.set(x, f + y, z);
    fxAdd(m, { vx: rand(-6, 6), vy: rand(2, 7), vz: rand(-6, 6), life: rand(0.5, 1.2), max: 1.2, gravity: 17, spin: rand(-14, 14) }, f);
  }
  for (let i = 0; i < 3; i++) decal(x + rand(-1.6, 1.6), z + rand(-1.6, 1.6), 0x8f1f2b, rand(0.7, 1.4), 40);
}

function boom (x, z, r = 11) {
  for (let i = 0; i < 16; i++) fire(x + rand(-1.5, 1.5), rand(0.5, 3), z + rand(-1.5, 1.5));
  for (let i = 0; i < 10; i++) puff(x + rand(-2, 2), rand(1, 3.5), z + rand(-2, 2), true, rand(0.9, 1.7));
  sparks(x, 1, z, 26);
  const f = floorAt(x, z);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(bitGeo, new THREE.MeshLambertMaterial({ color: 0x2a2530, flatShading: true }));
    m.position.set(x, f + 1, z);
    m.scale.setScalar(rand(0.8, 2.4));
    fxAdd(m, { vx: rand(-9, 9), vy: rand(5, 12), vz: rand(-9, 9), life: rand(1.4, 2.4), max: 2.4, gravity: 18, spin: rand(-12, 12) }, f);
  }
  decal(x, z, 0x231d24, 3.4, 60);
  Snd.boom({ x, z, far: 220 });
  blastAt(x, z, r);
}

/* ударная волна: людей рвёт, бургеры рассыпает, соседние машины расшвыривает */
function blastAt (x, z, r) {
  BLASTING = true;                                 // взрыв рвёт и без нитро (shredHit)
  try { blastPeople(x, z, r); } finally { BLASTING = false; }
}
function blastPeople (x, z, r) {
  for (const p of PEOPLE) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > r) continue;
    const k = (1 - d / r) * 26;
    runOver(p, (p.x - x) / (d || 1) * k, (p.z - z) / (d || 1) * k);
  }
  for (const p of PEDS) {
    if (p.dead) continue;
    if (Math.hypot(p.x - x, p.z - z) > r) continue;
    p.dead = 1; p.deadT = rand(6, 14);
    p.grp.visible = false;
    gibBurger(p.x, p.z);
    S.burgers++;
    if (!S.freeRun) RESPECT.add(null, 'burger', true);   // +1, не больше 10 за смену (econ.js RESPECT.CAP), без всплывашки
  }
  for (const p of SCOOTS) {
    if (!p.dead && Math.hypot(p.x - x, p.z - z) < r) runOverScoot(p, p.x - x, p.z - z, null, 100);
  }
  smashNear(x, z, it => { const d = Math.hypot(it.x - x, it.z - z); if (d < r) smashHit(it, (it.x - x) / (d || 1), (it.z - z) / (d || 1), 20, true); });
  LAWNP.boom(x, z, r);                             // мелочь на газоне (lawnprops.js)
  for (const p of SMOKERS) {
    if (p.dead || Math.hypot(p.x - x, p.z - z) > r) continue;
    p.dead = 1; p.deadT = rand(25, 40); p.grp.visible = false;
    gibHuman(p, p.x - x, p.z - z, 100);
    S.people++;
  }
  for (const d of DRIVERS) {
    if (d.dead || Math.hypot(d.x - x, d.z - z) > r) continue;
    gibHuman(d, d.x - x, d.z - z, 100);
    dropMesh(d.grp); d.gone = 1; d.dead = 1;
  }
  for (const t of TRAFFIC) {
    if (t.wreck) continue;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d > r || d < 0.5) continue;
    const k = (1 - d / r) * 34;
    fullCar(t);
    dentCar(t.mesh, x, z, k);
    knockCar(t, (t.x - x) / d, (t.z - z) / d, k);
    // взрыв бьёт соседей: у кого кончилось здоровье — рвёт следом, с
    // задержкой, и так по цепочке через всю парковку
    t.hp -= k * 4.6;                              // соседнее место на парковке — в 2,7 м: рвёт наверняка
    if (t.hp <= 0 && !t.chainT) t.chainT = rand(0.25, 0.8);
  }
  // и самого курьера подбрасывает и мнёт, если стоял рядом
  const dp = Math.hypot(V.x - x, V.z - z);
  if (dp < r && dp > 0.3) {
    const k = (1 - dp / r) * 22;
    if (dp < r * 0.8) hurtCar(1 + (dp < r * 0.4 ? 1 : 0), 20, x, z);
    V.vx += (V.x - x) / dp * k;
    V.vz += (V.z - z) / dp * k;
    S.shake = Math.max(S.shake, 1.2);
  }
}

function updateFX (dt) {
  for (let i = FX.length - 1; i >= 0; i--) {
    const f = FX[i], m = f.mesh;
    f.vy -= f.gravity * dt;
    m.position.x += f.vx * dt; m.position.y += f.vy * dt; m.position.z += f.vz * dt;
    if (f.spin) { m.rotation.x += f.spin * dt; m.rotation.z += f.spin * 0.7 * dt; }
    if (f.grow) m.scale.multiplyScalar(1 + f.grow * dt);
    if (f.gravity && m.position.y < (f.floor || 0) + 0.12) { m.position.y = (f.floor || 0) + 0.12; f.vy *= -0.3; f.vx *= 0.5; f.vz *= 0.5; }
    f.life -= dt;
    if (m.material && m.material.transparent) m.material.opacity = clamp(f.life / f.max, 0, 1) * 0.85;
    if (f.life <= 0) { scene.remove(m); if (m.material && m.material.dispose) m.material.dispose(); FX.splice(i, 1); }
  }
  for (let i = DECALS.length - 1; i >= 0; i--) {
    const d = DECALS[i];
    d.life -= dt;
    if (d.life < 6) d.m.material.opacity = Math.max(0, d.life / 6) * 0.85;
    if (d.life <= 0) { scene.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose(); DECALS.splice(i, 1); }
  }
}

/* ─────────────── эмоции гостя ───────────────
   Сердечки, если привёз вовремя, и злая реплика, если опоздал.
   Рисуем на канвасе — спрайт всегда развёрнут к камере. */

const emoteTexCache = new Map();
function emoteTex (kind) {
  if (kind === 'note') kind = 'note' + ((Math.random() * 4) | 0);
  if (emoteTexCache.has(kind)) return emoteTexCache.get(kind);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  if (kind === 'heart') {
    x.fillStyle = '#ff5d7a';
    x.beginPath();
    x.moveTo(32, 56);
    x.bezierCurveTo(-6, 30, 10, 4, 32, 20);
    x.bezierCurveTo(54, 4, 70, 30, 32, 56);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.beginPath(); x.ellipse(22, 22, 6, 4, -0.5, 0, Math.PI * 2); x.fill();
  } else if (kind.startsWith('note')) {
    x.fillStyle = pick(['#ffd85e', '#ff8ad0', '#6fd3ff', '#9dff7a']);
    x.beginPath(); x.ellipse(22, 48, 11, 8, -0.4, 0, Math.PI * 2); x.fill();
    x.fillRect(29, 10, 6, 38);
    x.fillRect(29, 10, 20, 7);
  } else if (kind === 'star') {
    // звёздочка «в отключке» — пятиконечная, жёлтая с тёмным контуром
    x.fillStyle = '#ffd23f'; x.strokeStyle = '#7a4a10'; x.lineWidth = 3;
    x.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 26, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r); }
    x.closePath(); x.fill(); x.stroke();
  } else {
    x.fillStyle = '#e8323c';
    x.fillRect(26, 8, 12, 30);
    x.fillRect(26, 44, 12, 12);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  emoteTexCache.set(kind, t);
  return t;
}

function emote (x, y, z, kind, n) {
  for (let i = 0; i < (n || 4); i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: emoteTex(kind), transparent: true, depthWrite: false, opacity: 0.9,
    }));
    m.position.set(x + rand(-0.4, 0.4), floorAt(x, z) + y, z + rand(-0.4, 0.4));
    m.scale.setScalar(rand(0.5, 0.85));
    fxAdd(m, { vy: rand(1, 1.8), vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), life: rand(1.2, 2), max: 2 });
  }
}

/* пар от горячей пиццы */
function steam (x, y, z) {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false,
  }));
  m.position.set(x + rand(-0.1, 0.1), groundH(x, z) + y, z + rand(-0.1, 0.1));
  m.scale.setScalar(0.16);
  fxAdd(m, { vy: rand(0.6, 1.1), life: rand(0.9, 1.5), max: 1.5, grow: 1.2 });
}

/* коробка с пиццей — и летящая, и та, что уже в руках */
function pizzaBox () {
  const g = new THREE.Group();
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.85), mat('#f0522a'));
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.1), mat('#fff3d6'));
  l.position.set(0, 0.13, 0);
  g.add(b, l);
  return g;
}

/* ─────────────── машины ───────────────
   Четыре кузова. Седан — советский: длинный капот, коробка салона,
   короткий багажник, хромированные бамперы и круглые фары, так ездит и
   курьер. Хетчбек — короче, без багажника, салон до самой кормы.
   Смарт — двухместная табуретка: два с половиной метра, высокий салон,
   каркас другого цвета. Кроссовер — выше и длиннее, с рейлингами.
   Кузов собран из отдельных панелей — только так их можно мять. */

const CAR_SPEC = {
  //       длина  ширина  низ   капот  багаж  салон: длина, сдвиг, высота  колесо  база: перед, зад
  sedan: { L: 4.3, W: 1.74, h: 0.42, hood: 1.5, trunk: 1.05, cab: 2.0, cz: -0.22, ch: 0.62, r: 0.44, fz: 1.4, bz: -1.45 },
  coupe: { L: 4.45, W: 1.84, h: 0.36, hood: 1.75, trunk: 0.85, cab: 1.55, cz: -0.4, ch: 0.48, r: 0.45, fz: 1.48, bz: -1.45 },
  hatch: { L: 3.9, W: 1.72, h: 0.44, hood: 1.2, trunk: 0, cab: 2.25, cz: -0.55, ch: 0.66, r: 0.42, fz: 1.25, bz: -1.3 },
  smart: { L: 2.7, W: 1.6, h: 0.46, hood: 0.55, trunk: 0, cab: 1.75, cz: -0.35, ch: 0.82, r: 0.38, fz: 0.9, bz: -0.9 },
  suv:   { L: 4.5, W: 1.86, h: 0.58, hood: 1.35, trunk: 0, cab: 2.7, cz: -0.8, ch: 0.72, r: 0.5, fz: 1.5, bz: -1.5 },
  cn:    { L: 4.6, W: 1.9, h: 0.56, hood: 1.3, trunk: 0, cab: 2.75, cz: -0.75, ch: 0.7, r: 0.5, fz: 1.52, bz: -1.52 },   // китайский кроссовер (roadlife.js)
};

let TAXI_SIGN = null;
function taxiSignMat () {
  if (TAXI_SIGN) return TAXI_SIGN;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = '#ffd21f'; x.fillRect(0, 0, 64, 16);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++)
    if ((i + j) % 2) { x.fillStyle = '#1b1a1f'; x.fillRect(i * 4, j * 8, 4, 8); x.fillRect(32 + i * 4, j * 8, 4, 8); }
  x.fillStyle = '#1b1a1f'; x.font = 'bold 9px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#ffd21f'; x.fillRect(14, 2, 36, 12);
  x.fillStyle = '#1b1a1f'; x.fillText($t('ТАКСИ'), 32, 8.5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  TAXI_SIGN = new THREE.MeshBasicMaterial({ map: t });
  TAXI_SIGN.userData.shared = true;               // одна на все такси: лёгкие (makeCarLite) её делят
  return TAXI_SIGN;
}

/* opts: tint — тонировка в ноль, low — занижение (кузов на двенадцать
   сантиметров ниже, колёса уходят в арки), lux — хромированные бамперы
   при любой тонировке (чёрная машина богача, life.js) */
function makeCar (bodyHex, roofSign, model = 'sedan', taxi = false, opts = {}) {
  const S = opts.spec || CAR_SPEC[model] || CAR_SPEC.sedan;   // spec, lift, dress, chrome, roofHex — машины карьеры (cars.js)
  const dy = opts.low ? -0.13 : opts.lift || 0;
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';          // курс, потом тангаж по склону, потом крен
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const panels = [];
  /* Всё, что не мнётся отдельно, склеиваем в один меш с цветом по
     вершинам: машина из сорока мешей — сорок вызовов отрисовки, а их на
     улице полсотни. Отдельными остаются панели (их мнёт), лобовое и
     заднее стекло (мутнеют), фары, колёса и тень. */
  const bulk = [];
  const add = (geo, hex, x, y, z, panel) => {
    if (opts.see) geo = DENTM.tess(geo);                // своя машина: частая сетка — есть что мять (cardent.js)
    if (!panel) { put(bulk, geo, hex, x, y + dy, z); return null; }
    const me = new THREE.Mesh(geo, mat(hex));
    me.position.set(x, y, z);
    me.name = panel;
    g.add(me);
    if (panel !== 'keep') panels.push({ m: me, p: me.position.clone(), r: me.rotation.clone(), hex });
    return me;
  };

  const dark = '#' + new THREE.Color(bodyHex).multiplyScalar(0.78).getHexString();
  const CHR = opts.chrome || ((model === 'sedan' && !opts.tint) || opts.lux ? '#cfd3d8' : '#3a3940'), GLASS = opts.tint ? '#16181e' : '#5b7ea3';
  const L = S.L, W = S.W, hl = L / 2;
  const y0 = 0.2 + S.h / 2 + 0.22;                 // середина нижней коробки
  const top = y0 + S.h / 2;                         // верх крыльев, от него растёт салон
  const frame = opts.roofHex || (model === 'smart' ? (bodyHex === '#3c4048' ? '#c9ccd2' : '#2b2a30') : bodyHex);

  // днище и крылья; у своей машины-седана сзади — ванна багажника с обивкой (carrear.js)
  // углы кузова, порогов, бамперов срезаны, рёбра капота, крышки и крыши скруглены (carbody.js); своя — частой сеткой
  const BB = BODYM.BODY, bev = (w, h, d, o) => BODYM.bevBox(w, h, d, Object.assign({ dense: !!opts.see }, o));
  const RK = opts.see ? { S, W, L, hl, y0, bodyHex, bev } : null;
  if (!(RK && REARM.body(add, RK))) add(bev(W, S.h, L, { c: BB.CORNER }), bodyHex, 0, y0, 0);
  add(bev(W + 0.12, 0.2, L - 0.3, { c: BB.SILL }), dark, 0, y0 - S.h / 2 + 0.02, 0);
  // капот и багажник — отдельные панели
  const hoodM = add(bev(W - 0.06, 0.16, S.hood, { c: BB.HOOD, t: BB.LID, ends: 1 }), bodyHex, 0, top + 0.06, hl - S.hood / 2 - 0.05, 'hood');
  let trunk = null;
  if (S.trunk) {
    const tm = add(bev(W - 0.06, 0.16, S.trunk, { c: BB.CORNER, t: BB.LID, ends: -1 }), bodyHex, 0, top + 0.08, -hl + S.trunk / 2 + 0.05, 'trunk');
    // петля — у переднего края крышки: открывается, задирая корму
    trunk = { m: tm, hy: top + 0.08, hz: -hl + S.trunk + 0.05, len: S.trunk, a: 0, want: 0, py: top + 0.35, pz: -hl + S.trunk / 2 };
  }
  // салон: стойки и крыша (у смарта — каркасом другого цвета)
  const cy = top + S.ch / 2, gh = S.ch * 0.72;
  // своя машина (opts.see): салон — рама и стёкла, внутри курьер; стёкла трескаются и бьются (carglass.js)
  const cg = opts.see ? CG.cabin(g, add, { S, W, top, cy, gh, frame, tint: !!opts.tint, dy, rb: opts.rake ? opts.rake.b : 0 }) : null;
  // машины потока (без своей морды): салон-трапеция — наклонные стёкла и стойки (carbody.js)
  const door = Math.min(1.85, S.cab * 0.85), four = model !== 'smart' && model !== 'coupe' && !opts.two;
  // машины гаража со своей мордой — салон как был, только у классических седанов наклонное заднее стекло (LOOK.rake)
  const rake = opts.dress ? opts.rake : BODYM.RAKE[model];
  const TR = !cg && rake ? BODYM.cabin(add, { S, W, top, frame, GLASS, rake, four, tuck: opts.dress ? 0 : undefined, doorTop: top - 0.1 + (S.h + 0.08) / 2 }) : null;
  if (!cg && !TR) add(new THREE.BoxGeometry(W - 0.12, S.ch, S.cab), frame, 0, cy, S.cz);
  const roofZ = TR ? TR.roofZ : cg ? cg.roofZ : S.cz, roofLen = TR ? TR.roofLen : cg ? cg.roofLen : S.cab;
  add(bev(TR ? TR.roofW - 0.02 : W - 0.24, 0.12, roofLen - 0.05, { t: BB.ROOF }), frame, 0, top + S.ch + 0.04, roofZ, 'roof');
  // двери: шов, ручки, молдинг — в меше двери (мнутся и двигаются с ней)
  for (const s of [-1, 1]) {
    const dm = add(new THREE.BoxGeometry(0.1, S.h + 0.08, door), dark, s * (W / 2 + 0.02), top - 0.1, S.cz + 0.02, s < 0 ? 'doorL' : 'doorR');
    if (!taxi) REARM.dressPanel(dm, dark, BODYM.doorParts(s, S.h + 0.08, door, { four, handle: opts.handle, molding: opts.molding === undefined ? '#26252b' : opts.molding }), { put, mergeGeos });
  }
  // стёкла (у своей машины — carglass.js, выше)
  const wsF = cg ? null : TR ? add(TR.front, GLASS, 0, 0, 0, 'keep') : add(new THREE.BoxGeometry(W - 0.28, gh, 0.1), GLASS, 0, cy + 0.02, S.cz + S.cab / 2 + 0.01, 'keep');
  const wsB = cg ? null : TR ? add(TR.back, GLASS, 0, 0, 0, 'keep') : add(new THREE.BoxGeometry(W - 0.28, gh * 0.9, 0.1), GLASS, 0, cy + 0.02, S.cz - S.cab / 2 - 0.01, 'keep');
  if (!cg && !TR) {
    add(new THREE.BoxGeometry(0.1, gh * 0.84, S.cab - 0.3), GLASS, -W / 2 + 0.05, cy + 0.03, S.cz);
    add(new THREE.BoxGeometry(0.1, gh * 0.84, S.cab - 0.3), GLASS, W / 2 - 0.05, cy + 0.03, S.cz);
  }
  // бамперы: у седана хромированные, у остальных пластик
  const bumperF = add(bev(W + 0.14, 0.16, 0.22, { c: BB.BUMPER, t: opts.see ? 0.03 : 0 }), CHR, 0, y0 - 0.04, hl - 0.03, 'bumperF');
  const bumperR = add(bev(W + 0.14, 0.16, 0.22, { c: BB.BUMPER, t: opts.see ? 0.03 : 0 }), CHR, 0, y0 - 0.04, -hl + 0.03, 'bumperR');
  // номера — на бамперах (мнутся и отваливаются с ними); сзади у своей машины — настоящий, с буквами (carrear.js)
  REARM.dressPanel(bumperF, CHR, BODYM.plateParts(0.22, false, opts.plateF), { put, mergeGeos });
  if (!RK) REARM.dressPanel(bumperR, CHR, BODYM.plateParts(0.22, true), { put, mergeGeos });
  // решётка, фары, фонари
  add(new THREE.BoxGeometry(W * 0.6, 0.2, 0.1), '#2b2530', 0, top - 0.08, hl - 0.02);
  // арки колёс полукругом; у машин потока — зеркала, лючок бензобака, рёбра решётки (carbody.js)
  BODYM.arches(add, { S, W, dy, y0, hex: bodyHex, flare: opts.flare || (model === 'suv' || model === 'cn' ? '#26252a' : null) });
  if (!opts.see) BODYM.trim(add, { S, W, top, y0, hl, cf: TR ? TR.cf : S.cz + S.cab / 2, bodyHex,
    shade: '#' + new THREE.Color(bodyHex).multiplyScalar(0.62).getHexString(), grille: !opts.dress && model !== 'cn' });
  if (opts.dress) opts.dress(g, add, { S, W, L, hl, top, y0, bodyHex, CHR, GLASS, dy, see: !!opts.see, rb: opts.rake ? Math.min(opts.rake.b, S.cab * 0.3) : 0 });   // своя морда и фары (cars.js)
  else if (model === 'cn') RL.cnCar(g, add, { S, W, L, hl, top, y0, bodyHex });   // узкие LED во всю ширину — вместо фар
  else for (const s of [-1, 1]) {
    const h = new THREE.Mesh(model === 'sedan' ? new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10) : new THREE.BoxGeometry(0.4, 0.1, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xfff1c8 }));
    if (model === 'sedan') h.rotation.x = Math.PI / 2;
    h.position.set((W / 2 - 0.22) * s, top - 0.06, hl - 0.02);
    g.add(h);
    add(new THREE.BoxGeometry(0.38, 0.16, 0.08), '#e8323c', (W / 2 - 0.22) * s, top - 0.04, -hl + 0.02);
    if (RK) REARM.lampDepth(add, add, [{ w: 0.38, h: 0.16, x: (W / 2 - 0.22) * s, y: top - 0.04, face: -hl - 0.02, tail: true }], { minY: y0 + 0.05 });   // фонарь в нише (carrear.js)
  }
  if (model === 'coupe') {
    // спойлер на багажнике и воздухозаборник на капоте
    for (const sx of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.08, 0.26, 0.12), '#2b2a30', sx, top + 0.3, -hl + 0.35);
    add(new THREE.BoxGeometry(W - 0.2, 0.06, 0.34), '#2b2a30', 0, top + 0.44, -hl + 0.35);
    add(new THREE.BoxGeometry(0.5, 0.06, 0.5), '#2b2a30', 0, top + 0.16, hl - 0.9);
  }
  if (model === 'suv') {
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.08, roofLen - 0.2), '#2b2a30', (Math.min(W / 2 - 0.25, TR ? TR.roofW / 2 - 0.1 : 9)) * s, top + S.ch + 0.14, roofZ);
    add(new THREE.BoxGeometry(0.5, 0.5, 0.3), '#2b2a30', 0, y0 + 0.2, -hl - 0.12);          // запаска на двери
  }
  // своя машина: зад подробно — труба, бампер с номером, крышка с замком и наклейкой, брызговики (carrear.js)
  if (RK) REARM.rear(g, add, Object.assign(RK, { top, CHR, dy, put, mergeGeos, bumper: bumperR, trunk, brand: OWN.pizza(), logo: birdLogo,
    dual: !!opts.dual, spare: !!opts.spare || model === 'suv' }));

  if (roofSign) {   // шашка доставки — свою машину видно в потоке
    add(new THREE.BoxGeometry(1.3, 0.42, 0.62), '#ffffff', 0, top + S.ch + 0.3, S.cz);
    add(new THREE.BoxGeometry(0.95, 0.2, 0.68), '#f0522a', 0, top + S.ch + 0.3, S.cz);
  }
  const hazard = [];
  for (const [x, z] of [[-W / 2 + 0.1, hl - 0.05], [W / 2 - 0.1, hl - 0.05], [-W / 2 + 0.1, -hl + 0.05], [W / 2 - 0.1, -hl + 0.05]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.1), new THREE.MeshBasicMaterial({ color: 0xffa024 }));
    m.position.set(x, top + 0.08, z);
    m.visible = false;
    g.add(m);
    hazard.push(m);
  }
  if (taxi) {
    // шашечки по бортам и фонарь «такси» на крыше
    const n = Math.max(4, Math.round(door / 0.22));
    for (const s of [-1, 1])
      for (let i = 0; i < n; i++) {
        if (i % 2) continue;
        const z = S.cz - door / 2 + (i + 0.5) * door / n;
        add(new THREE.BoxGeometry(0.03, 0.12, door / n), '#1b1a1f', (W / 2 + 0.085) * s, top - 0.02, z);
        add(new THREE.BoxGeometry(0.03, 0.12, door / n), '#1b1a1f', (W / 2 + 0.085) * s, top - 0.14, z + door / n);
      }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 0.3), [
      mat('#ffd21f'), mat('#ffd21f'), mat('#ffd21f'), mat('#ffd21f'), taxiSignMat(), taxiSignMat()]);
    sign.position.set(0, top + S.ch + 0.22, S.cz);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
  }

  // своя машина: зеркала на дверях — отлетают от удара в бок (cardent.js)
  const mirrors = opts.see ? DENTM.mirrors(g, { W, top, cf: S.cz + S.cab / 2, hex: bodyHex, put, mergeGeos }) : null;
  // занижение: всё, что уже на машине отдельными мешами, — ниже вместе с кузовом
  if (dy) { for (const c of g.children) c.position.y += dy; for (const p of panels) p.p.y += dy; if (trunk) { trunk.hy += dy; trunk.py += dy; } }
  // склейка кузова — одним мешем
  if (bulk.length) { const bm = new THREE.Mesh(mergeGeos(bulk), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); bm.userData.bulk = 1; g.add(bm); }

  const wheels = [], steer = [];
  const wx = W / 2 + 0.02;
  const wmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  for (const [x, z, front] of [[-wx, S.fz, 1], [wx, S.fz, 1], [-wx, S.bz, 0], [wx, S.bz, 0]]) {
    const pv = new THREE.Group();
    pv.position.set(x, S.r, z);
    // шина и диск — один меш: колпак, штамповка или литьё (carbody.js)
    const parts = [];
    BODYM.wheel(parts, put, S.r, Math.sign(x), opts.wheel || BODYM.WHEEL_BY_MODEL[model] || 'alloy');
    const wm = new THREE.Mesh(mergeGeos(parts), wmat);
    pv.add(wm);
    g.add(pv);
    wheels.push(wm); if (front) steer.push(pv);
  }
  const sh = new THREE.Mesh(new THREE.CircleGeometry(hl + 0.25, 14),
    new THREE.MeshBasicMaterial({ color: 0x24303f, transparent: true, opacity: 0.26, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; sh.scale.set(W / (L + 0.5) * 1.15, 1, 1);
  g.add(sh);

  g.userData = { wheels, steer, panels, glass: cg ? [] : [wsF, wsB], cg, dmg: 0, smokeT: 0, bodyHex, hazard, hl, model, trunk,
    pipe: RK ? RK.pipe : null, cargo: RK ? RK.cargo : null,   // труба и коробки в багажнике своей машины (carrear.js)
    see: !!opts.see, W, y0: y0 + dy, mirrors, armor: opts.armor || 0,   // своя машина: мнётся формой, теряет детали (cardent.js)
    hood: hoodM ? { m: hoodM, y: hoodM.position.y, z: hoodM.position.z, len: S.hood } : null,
    // дописывают потом (cars.js — сразу, огни и дворники — в первом кадре езды): поля — с рождения, форма одна (dbl у V)
    careerId: undefined, ws: undefined, wsB: undefined, hatch: undefined, lights: undefined, wipers: undefined };
  dbl(g.userData);
  return g;
}

/* мятина: панель у точки удара вдавливается, темнеет и кособочится */
function dentCar (g, wx, wz, force) {
  const u = g.userData;
  if (!u || !u.panels) return;
  const inv = new THREE.Vector3(wx - g.position.x, 0, wz - g.position.z);
  inv.applyAxisAngle(new THREE.Vector3(0, 1, 0), -g.rotation.y);
  const f = clamp(force / 26, 0.12, 1);
  const gb = CG.STATS.broken, gc = CG.STATS.cracked, gl = CG.STATS.lamps;
  if (u.cg) CG.hit(u.cg, inv.x, inv.z, force, g);   // своя машина: стекло у удара трескается или бьётся (carglass.js)
  if (u.see) IMPACT.glass(CG.STATS.broken - gb, CG.STATS.cracked - gc, CG.STATS.lamps - gl, { x: wx, z: wz });   // и звенит (impact.js)
  u.dmg = clamp(u.dmg + f * 0.3, 0, 1);
  let best = null, bd = 1e9;
  for (const p of u.panels) {
    const d = (p.m.position.x - inv.x) ** 2 + (p.m.position.z - inv.z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  for (const p of u.panels) {
    const w = p === best ? 1 : (Math.hypot(p.p.x - inv.x, p.p.z - inv.z) < 2 ? 0.35 : 0);
    if (!w) continue;
    p.m.position.y = Math.max(p.p.y - 0.34, p.m.position.y - 0.13 * f * w);
    p.m.position.x += (p.p.x - inv.x > 0 ? 1 : -1) * 0.05 * f * w;
    p.m.rotation.z = clamp(p.m.rotation.z + rand(-0.22, 0.22) * f * w, -0.45, 0.45);
    p.m.rotation.x = clamp(p.m.rotation.x + rand(-0.18, 0.18) * f * w, -0.4, 0.4);
    p.m.material.color.lerp(new THREE.Color(0x6b6068), 0.22 * f * w);
  }
  // стёкла трескаются и мутнеют
  if (u.dmg > 0.45) for (const w of u.glass) w.material.color.lerp(new THREE.Color(0x2b2f36), 0.35);
  if (u.see) { DENTM.hit(g, inv.x, inv.z, force); return; }   // своя машина: вершины вдавливаются, детали отлетают (cardent.js)
  // бампер отваливается
  if (u.dmg > 0.7) {
    const b = u.panels.find(p => p.m.parent && p.m.geometry.parameters && p.m.geometry.parameters.depth === 0.22 && !p.dropped);
    if (b && !b.dropped) {
      b.dropped = true;
      b.m.position.y = 0.2; b.m.rotation.z = rand(-0.8, 0.8);
    }
  }
}

/* ─────────────── бургеры-пешеходы ───────────────
   Те же слои и цвета, что в lab/vice: булка, котлета, сыр, салат,
   помидор, шапка с кунжутом. От наезда рассыпаются на ингредиенты. */

function makeBurger () {
  const g = new THREE.Group();
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); g.add(me); return me; };
  const legL = add(new THREE.BoxGeometry(0.11, 0.3, 0.11), mat('#3a2c22'), -0.16, 0.15, 0);
  const legR = add(new THREE.BoxGeometry(0.11, 0.3, 0.11), mat('#3a2c22'), 0.16, 0.15, 0);
  // булка, котлета, сыр, салат, помидор, кунжут и глаза — одним мешем:
  // бургеров на улице сорок, по двадцать мешей было бы восемьсот вызовов
  const b = [];
  put(b, new THREE.CylinderGeometry(0.42, 0.46, 0.18, 12), '#e8b563', 0, 0.39, 0);
  put(b, new THREE.CylinderGeometry(0.45, 0.45, 0.13, 12), '#7a4526', 0, 0.545, 0);
  put(b, new THREE.BoxGeometry(0.84, 0.05, 0.84), '#ffd34d', 0, 0.635, 0, 0, Math.PI / 4);
  put(b, new THREE.CylinderGeometry(0.46, 0.44, 0.07, 12), '#5fbf4a', 0, 0.695, 0);
  put(b, new THREE.CylinderGeometry(0.4, 0.4, 0.07, 10), '#e04836', 0, 0.755, 0);
  put(b, new THREE.SphereGeometry(0.46, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), '#e8a84f', 0, 0.78, 0);
  for (let i = 0; i < 5; i++)
    put(b, new THREE.SphereGeometry(0.028, 5, 4), '#fff3d6', Math.cos(i * 2.1) * 0.3, 1.12, Math.sin(i * 2.1) * 0.3);
  for (const s of [-1, 1]) {
    put(b, new THREE.SphereGeometry(0.075, 7, 5), '#ffffff', 0.14 * s, 0.95, 0.36);
    put(b, new THREE.SphereGeometry(0.032, 6, 5), '#1b1410', 0.14 * s, 0.95, 0.425);
  }
  g.add(new THREE.Mesh(mergeGeos(b), BURGER_MAT));
  g.userData = { legL, legR };
  return g;
}
const BURGER_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const GIB_SPECS = [
  ['cyl', 0.44, 0.16, '#e8b563'], ['cyl', 0.44, 0.12, '#7a4526'],
  ['box', 0.8, 0.05, '#ffd34d'], ['cyl', 0.44, 0.07, '#5fbf4a'],
  ['cyl', 0.38, 0.07, '#e04836'], ['cap', 0.44, 0.44, '#e8a84f'],
  ['box', 0.12, 0.3, '#3a2c22'], ['box', 0.12, 0.3, '#3a2c22'],
];
const GIBS = [];
function gibBurger (x, z) {
  const floor = groundH(x, z);
  for (const [kind, a, b, hex] of GIB_SPECS) {
    const geo = kind === 'box' ? new THREE.BoxGeometry(a, b, a)
      : kind === 'cap' ? new THREE.SphereGeometry(a, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)
      : new THREE.CylinderGeometry(a, a, b, 8);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
    m.position.set(x + rand(-0.2, 0.2), floor + rand(0.5, 1.1), z + rand(-0.2, 0.2));
    scene.add(m);
    GIBS.push({ m, floor, vx: rand(-5, 5), vy: rand(4.5, 9), vz: rand(-5, 5), ax: rand(-9, 9), az: rand(-9, 9), life: 4.5 });
  }
}
function updateGibs (dt) {
  for (let i = GIBS.length - 1; i >= 0; i--) {
    const g = GIBS[i];
    g.vy -= 19 * dt;
    g.m.position.x += g.vx * dt; g.m.position.y += g.vy * dt; g.m.position.z += g.vz * dt;
    g.m.rotation.x += g.ax * dt; g.m.rotation.z += g.az * dt;
    if (g.m.position.y < g.floor + 0.3 && g.vy < 0) { g.m.position.y = g.floor + 0.3; g.vy *= -0.35; g.vx *= 0.6; g.vz *= 0.6; }
    if ((g.life -= dt * GFX.gibFade()) < 0.6) g.m.scale.setScalar(Math.max(0.001, g.life / 0.6));
    if (g.life <= 0) { scene.remove(g.m); g.m.geometry.dispose(); g.m.material.dispose(); GIBS.splice(i, 1); }
  }
}

/* ─────────────── тротуары ───────────────
   Пешеходы ходят не кольцами вокруг домов, а по тротуарам настоящих
   улиц: вдоль ребра графа, в полутора метрах от бордюра. На перекрёстке
   сворачивают так, чтобы не сходить с тротуара, — по правой стороне
   направо, по левой налево, то есть обходят квартал. Дорогу переходят
   только по зебре; если у зебры светофор — ждут, пока машинам не
   загорится красный. Во дворах часть коллег гуляет по дорожкам из карты.

   Состояние на тротуаре: ребро a→b, сторона (1 — справа по ходу, −1 —
   слева), следующий узел c и отрезок от угла до угла: углы — точки,
   где сходятся линии тротуаров двух улиц. */

// по мостам не гуляют: высоту людям берём с земли, и на мосту они шли бы по дну реки
const walkable = e => !!e && e.c <= 5 && !(MAPFIX && e.road.b);
const walkOff = (e, bike) => e.w / 2 + (bike ? 0.9 : 1.5) + (e.road.g || 0);   // бульвар: тротуар за газоном
/* Есть ли у ребра тротуар с этой стороны: линия тротуара не должна лежать на чужом полотне.
   У проспекта из двух встречных половин (две одностороннние улицы рядом) внутренняя «сторона» —
   разделительная полоса или вторая половина: там люди гуляли вдоль по проезжей части (04.10.2026).
   Смотрим три точки (¼, ½, ¾ ребра); на полотне две из трёх — стороны нет. Помним на ребре. */
function walkSideOk (e, side, bike) {
  const key = side * (bike ? 2 : 1);
  const C = e.wok || (e.wok = {});
  if (C[key] !== undefined) return C[key];
  const o = walkOff(e, bike) * side, A = NODES[e.a];
  let bad = 0;
  for (const t of [0.25, 0.5, 0.75]) {
    const x = A.x + e.ux * e.len * t + e.rx * o, z = A.z + e.uz * e.len * t + e.rz * o;
    const r = nearestRoad(x, z, DRIVE_MAX, 1);
    if (r && r.d < r.seg.w / 2 + 0.3) bad++;
  }
  return (C[key] = bad < 2);
}
/* переходят быстро: по зебре — во столько раз быстрее своего шага */
const CROSS_K = 1.7;

/* Самокатчики держатся главных улиц (08.10.2026, автор: «чаще по главным, реже по второстепенным»):
   на перекрёстке, кроме обычного поворота за угол, можно проехать прямо (через устье поперечной
   улицы, |угол| < SCOOT_MAIN.STRAIGHT) — из этих двух главная (класс ≤ SCOOT_MAIN.C) берётся
   с вероятностью SCOOT_MAIN.KEEP; новый самокатчик — на главной в SCOOT_MAIN.SPAWN случаев. */
const SCOOT_MAIN = { C: 3, STRAIGHT: 0.6, KEEP: 0.7, SPAWN: 0.7 };
function walkNext (a, b, side, bike) {
  const e = edgeOf(a, b);
  let best = -1, bs = side > 0 ? -Infinity : Infinity, str = -1, sa = 9;
  for (const c of NODES[b].nb) {
    if (c === a || !inBounds(NODES[c].x, NODES[c].z, -30)) continue;
    const n = edgeOf(b, c);
    if (!walkable(n) || !walkSideOk(n, side, bike)) continue;   // с этой стороны нет тротуара — туда не сворачивает
    const ang = Math.atan2(e.ux * n.uz - e.uz * n.ux, e.ux * n.ux + e.uz * n.uz);   // плюс — направо
    if (side > 0 ? ang > bs : ang < bs) { bs = ang; best = c; }
    if (bike && n.c <= SCOOT_MAIN.C && Math.abs(ang) < SCOOT_MAIN.STRAIGHT && Math.abs(ang) < sa) { sa = Math.abs(ang); str = c; }
  }
  // самокат: за угол — на второстепенную, а прямо — главная: чаще прямо
  if (bike && str >= 0 && str !== best && edgeOf(b, best).c > SCOOT_MAIN.C && chance(SCOOT_MAIN.KEEP)) return str;
  return best;
}

/* угол тротуара у узла b: пересечение линий вдоль a→b и b→c */
function walkCorner (a, b, c, side, bike) {
  const e1 = edgeOf(a, b), B = NODES[b];
  const L1 = walkOff(e1, bike) * side;
  const p1x = B.x + e1.rx * L1, p1z = B.z + e1.rz * L1;
  if (c < 0) return [p1x, p1z];                    // тупик: разворот тут же
  const e2 = edgeOf(b, c), L2 = walkOff(e2, bike) * side;
  const p2x = B.x + e2.rx * L2, p2z = B.z + e2.rz * L2;
  const den = e1.ux * e2.uz - e1.uz * e2.ux;
  if (Math.abs(den) < 0.15) return [(p1x + p2x) / 2, (p1z + p2z) / 2];
  const s = ((p2x - p1x) * e2.uz - (p2z - p1z) * e2.ux) / den;
  const mx = p1x + e1.ux * s, mz = p1z + e1.uz * s;
  if (Math.hypot(mx - B.x, mz - B.z) > 3 * Math.max(Math.abs(L1), Math.abs(L2))) return [(p1x + p2x) / 2, (p1z + p2z) / 2];
  return [mx, mz];
}

function walkLeg (p, sx, sz) {
  const W = p.w;
  W.c = walkNext(W.a, W.b, W.side, p.bike);
  [W.ex, W.ez] = walkCorner(W.a, W.b, W.c, W.side, p.bike);
  W.sx = sx; W.sz = sz; W.d = 0;
  W.L = Math.max(0.01, Math.hypot(W.ex - sx, W.ez - sz));
}

/* поставить на тротуар ребра a→b, на долю t его длины */
function walkInit (p, a, b, side, t) {
  const e0 = edgeOf(a, b);
  if (!walkSideOk(e0, side, p.bike) && walkSideOk(e0, -side, p.bike)) side = -side;   // с той стороны — полотно
  const e = e0, A = NODES[a], o = walkOff(e, p.bike) * side;
  p.w = { a, b, side, c: -1, sx: 0, sz: 0, ex: 0, ez: 0, d: 0, L: 1 };
  p.path = null; p.cross = null;
  const x = A.x + e.ux * e.len * t + e.rx * o, z = A.z + e.uz * e.len * t + e.rz * o;
  walkLeg(p, x, z);
  p.x = x; p.z = z;
}

/* снова на тротуар оттуда, где стоит: после лавочки, заказа, толкотни */
function walkSnap (p) {
  const road = nearestRoad(p.x, p.z, 5, 1);
  if (!road || road.seg.na === undefined || road.d > 25) return walkSpawn(p, 40, 300);
  const e = edgeOf(road.seg.na, road.seg.nb);
  if (!walkable(e) || (!walkSideOk(e, 1, p.bike) && !walkSideOk(e, -1, p.bike))) return walkSpawn(p, 40, 300);
  const side = (p.x - road.x) * e.rx + (p.z - road.z) * e.rz >= 0 ? 1 : -1;
  const [a, b] = chance(0.5) ? [e.a, e.b] : [e.b, e.a];
  const tt = a === e.a ? road.t : 1 - road.t;
  walkInit(p, a, b, a === e.a ? side : -side, tt);
}

/* куда поставить нового прохожего: тротуар рядом с курьером, а часть
   коллег — на дворовую дорожку */
const YARD_PATHS = CITY.paths.filter(q => q.length >= 2 && inBounds(q[0][0], q[0][1], 10));
function walkSpawn (p, rmin, rmax, c = V) {
  if (p.yard && YARD_PATHS.length) {
    let best = null, bd = 1e9;
    for (let k = 0; k < 30; k++) {
      const q = pick(YARD_PATHS), m = q[(q.length / 2) | 0];
      const d = Math.hypot(m[0] - c.x, m[1] - c.z);
      if (d >= rmin && d <= rmax) { best = q; break; }
      const miss = d < rmin ? rmin - d : d - rmax;
      if (miss < bd) { bd = miss; best = q; }
    }
    p.w = null; p.cross = null;
    p.path = { q: best, i: (Math.random() * (best.length - 1)) | 0, d: 0, dir: chance(0.5) ? 1 : -1 };
    p.x = best[p.path.i][0]; p.z = best[p.path.i][1];
    return;
  }
  const wantMain = p.bike && chance(SCOOT_MAIN.SPAWN);   // самокатчик — чаще на главной (SCOOT_MAIN)
  for (let k = 0; k < 20; k++) {
    const a = nodeNear(c.x, c.z, rmin, rmax);
    let opts = NODES[a].nb.filter(b => { const e = edgeOf(a, b); return walkable(e) && (walkSideOk(e, 1, p.bike) || walkSideOk(e, -1, p.bike)); });
    if (wantMain && k < 16) { opts = opts.filter(b => edgeOf(a, b).c <= SCOOT_MAIN.C); }
    if (!opts.length) continue;
    walkInit(p, a, pick(opts), chance(0.5) ? 1 : -1, rand(0.15, 0.85));
    return;
  }
}

/* шаг по дворовой дорожке: туда и обратно */
function pathStep (p, dt) {
  const P = p.path, q = P.q;
  let i = P.i, j = i + P.dir;
  if (j < 0 || j >= q.length) { P.dir = -P.dir; j = i + P.dir; }
  const ax = q[i][0], az = q[i][1], bx = q[j][0], bz = q[j][1];
  const L = Math.hypot(bx - ax, bz - az) || 0.01;
  P.d += p.speed * dt;
  if (P.d >= L) { P.d -= L; P.i = j; return pathStep(p, 0); }
  const nx = lerp(ax, bx, P.d / L), nz = lerp(az, bz, P.d / L);
  const ang = Math.atan2(nx - p.x, nz - p.z);
  p.x = nx; p.z = nz;
  return ang;
}

/* Общий шаг для людей, бургеров и самокатчиков. Возвращает, куда смотреть. */
/* Вернуться к прогулке оттуда, где стоит. Гости ждут в глубине дворов,
   до улицы бывает и сто метров, — поэтому не переносим, а ведём пешком к
   ближайшему тротуару и оттуда — дальше по кварталу. Раньше гость с пиццей
   тут же переносился за сотню метров и для игрока просто исчезал. */
function walkBack (p) {
  const road = nearestRoad(p.x, p.z, 5, 3);
  if (road && road.d > 3) {
    const dx = p.x - road.x, dz = p.z - road.z, l = Math.hypot(dx, dz) || 1;
    const o = road.seg.w / 2 + 1.5;
    p.goTo = { x: road.x + dx / l * o, z: road.z + dz / l * o, t: 60 };
    p.w = null; p.path = null;
  } else walkSnap(p);
}

function walkerStep (p, dt, legSwing) {
  if (p.resnap) { p.resnap = false; walkBack(p); }
  if (p.goTo) {
    // идёт к тротуару своим ходом, стены обходит выталкиванием
    const G = p.goTo, dx = G.x - p.x, dz = G.z - p.z, d = Math.hypot(dx, dz);
    p.ph += dt * legSwing;
    if (d < 0.6 || (G.t -= dt) <= 0) { p.goTo = null; walkSnap(p); return NaN; }
    const k = Math.min(1, p.speed * dt / d);
    p.x += dx * k; p.z += dz * k;
    return Math.atan2(dx, dz);
  }
  if (!p.w && !p.path) walkSpawn(p, 60, 300);
  p.ph += dt * legSwing;
  if (p.path) return pathStep(p, dt);
  const W = p.w;

  // переходит по зебре: поперёк полотна, с тротуара на тротуар
  if (p.cross) {
    const C = p.cross, e = edgeOf(W.a, W.b);
    if (C.wait) {
      p.ph -= dt * legSwing;                          // стоит — ноги не идут
      if (!C.zb.sig || lightOf(C.zb.sig.ph) === 'r') C.wait = false;
      return Math.atan2(-e.rx * W.side, -e.rz * W.side);
    }
    C.t = Math.min(1, C.t + p.speed * CROSS_K * dt / C.span);   // по зебре — быстрым шагом
    p.ph += dt * legSwing * (CROSS_K - 1);
    const o = lerp(C.o0, -C.o0, C.t);
    const nx = C.x + e.rx * o, nz = C.z + e.rz * o;
    const ang = Math.atan2(nx - p.x, nz - p.z);
    p.x = nx; p.z = nz;
    if (C.t >= 1) {
      p.cross = null;
      W.side = -W.side;
      walkLeg(p, p.x, p.z);
      p.crossT = rand(25, 80);
    }
    return ang;
  }

  RL.walkGuard(p);                                  // у забора стройки — назад (roadlife.js)
  const d0 = W.d;
  W.d += p.speed * dt;
  if (W.d >= W.L) {
    // угол квартала: дальше по следующей улице, из тупика — назад по той же
    let a = W.b, b = W.c;
    if (b < 0) { b = W.a; W.side = -W.side; }
    W.a = a; W.b = b;
    walkLeg(p, W.ex, W.ez);
  } else {
    // собрался на ту сторону — ждём ближайшей зебры на своей улице
    p.crossT -= dt;
    if (p.crossT <= 0) {
      const list = ZEB_BY_EDGE.get(ukey(W.a, W.b));
      if (list && !walkSideOk(edgeOf(W.a, W.b), -W.side, p.bike)) p.crossT = rand(25, 80);   // на той стороне тротуара нет (разделительная) — не переходит
      else if (list) {
        const e = edgeOf(W.a, W.b), ux = (W.ex - W.sx) / W.L, uz = (W.ez - W.sz) / W.L;
        for (const zb of list) {
          const along = (zb.x - W.sx) * ux + (zb.z - W.sz) * uz;
          if (along < d0 || along > W.d) continue;
          const o0 = walkOff(e, p.bike) * W.side;
          p.cross = { zb, x: zb.x, z: zb.z, o0, span: Math.abs(o0) * 2, t: 0,
                      wait: !!(zb.sig && lightOf(zb.sig.ph) !== 'r') };
          p.x = zb.x + e.rx * o0; p.z = zb.z + e.rz * o0;
          W.d = along;
          return Math.atan2(-e.rx * W.side, -e.rz * W.side);
        }
      }
    }
  }
  const k = W.d / W.L;
  const nx = lerp(W.sx, W.ex, k), nz = lerp(W.sz, W.ez, k);
  const ang = Math.atan2(nx - p.x, nz - p.z);
  p.x = nx; p.z = nz;
  return ang;
}

/* Машина стоит или ползёт (медленнее ECON.CLIENT_HIT.SOFT — тогда наезда нет) — люди её
   обходят, а не проходят насквозь (04.10.2026): точку пути, попавшую в кузов (+ полметра),
   выносим к ближнему борту; сторону запоминаем, пока человек у машины, — не перескакивает
   через капот. Сдвиг набирается плавно (DODGE.V м/с), без рывков. Быстрее — наезд, как был. */
const DODGE = { L: 0.6, W: 0.45, V: 10 };
function dodgeCar (p, dt) {
  let tx = 0, tz = 0, rx = p.x, rz = p.z;
  // шаг не двигал (ждёт у зебры) — в p.x ещё прошлый сдвиг: снимаем, чтобы не копился
  if (p.dpx === p.x && p.dpz === p.z) { rx -= p.dox || 0; rz -= p.doz || 0; }
  const sp = Math.hypot(V.vx, V.vz);
  if (sp < ECON.CLIENT_HIT.SOFT && !V.air && Math.abs(rx - V.x) < 6 && Math.abs(rz - V.z) < 6) {
    const fx = Math.sin(V.h), fz = Math.cos(V.h), dx = rx - V.x, dz = rz - V.z;
    const al = dx * fx + dz * fz, ac = dx * fz - dz * fx;
    const HL = CAR_L + DODGE.L, HW = CAR_W + DODGE.W;
    if (Math.abs(al) < HL && Math.abs(ac) < HW) {
      if (!p.dodge) p.dodge = HW - Math.abs(ac) <= HL - Math.abs(al) ? (ac >= 0 ? 1 : -1) : (al >= 0 ? 2 : -2);
      let nal = al, nac = ac;
      if (Math.abs(p.dodge) === 1) nac = p.dodge * HW; else nal = Math.sign(p.dodge) * HL;
      tx = fx * (nal - al) + fz * (nac - ac); tz = fz * (nal - al) - fx * (nac - ac);
    } else p.dodge = 0;
  } else p.dodge = 0;
  if (p.goTo) { p.x = rx + tx; p.z = rz + tz; p.dox = p.doz = 0; p.dpx = p.dpz = NaN; return; }   // идёт своим ходом — сдвиг сразу и насовсем
  const k = DODGE.V * dt;
  const ox = p.dox || 0, oz = p.doz || 0, ex = tx - ox, ez = tz - oz, el = Math.hypot(ex, ez);
  p.dox = el > k ? ox + ex / el * k : tx; p.doz = el > k ? oz + ez / el * k : tz;
  p.x = rx + p.dox; p.z = rz + p.doz;
  p.dpx = p.x; p.dpz = p.z;
}

const PEDS = [];
function initPeds () {
  for (let k = 0; k < 40; k++) {
    const p = dbl({ grp: makeBurger(), speed: rand(1.1, 1.8), ph: rand(0, 9), crossT: rand(10, 60), x: 0, z: 0, dead: 0, deadT: 0, w: null, path: null, cross: null, dodge: 0, dox: 0, doz: 0, dpx: 0, dpz: 0 });   // поля ходьбы — с рождения (dbl у V)
    walkSpawn(p, 30, 380);
    scene.add(p.grp);
    PEDS.push(p);
  }
  const H = burgerHangout();
  if (H) for (let k = 0; k < 16; k++) {
    const p = { grp: makeBurger(), speed: rand(0.5, 0.9), ph: rand(0, 9), x: 0, z: 0, dead: 0, deadT: 0, hang: H, ha: rand(0, 6.3), hr: rand(1.5, H.r) };
    hangPlace(p);
    scene.add(p.grp);
    PEDS.push(p);
  }
}

/* Сходка бургеров: у названного картой ТЦ (MAP.landmarks.burgers) — на
   площадке перед стеной, что смотрит на ближайшую улицу. Толпятся
   кружком, подпрыгивают, поворачиваются друг к другу; сбитый — через
   время возвращается сюда же, а не в другой квартал. */
function burgerHangout () {
  const nm = MAP.landmarks && MAP.landmarks.burgers;
  if (!nm) return null;
  let best = null;
  for (const b of CITY.buildings) {
    if (b.n !== nm) continue;
    for (let i = 0; i < b.p.length; i++) {
      const a = b.p[i], c = b.p[(i + 1) % b.p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 12) continue;
      let ox = (c[1] - a[1]) / L, oz = -(c[0] - a[0]) / L;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (inPoly(mx + ox * 0.5, mz + oz * 0.5, b.p)) { ox = -ox; oz = -oz; }
      const x = mx + ox * 9, z = mz + oz * 9;
      const r = nearestRoad(x, z, DRIVE_MAX, 2);
      if (inHouse(x, z, 3) || !r || r.d < r.seg.w / 2 + 3) continue;
      if (!best || r.d < best.d) best = { x, z, d: r.d, r: 5.5 };
    }
  }
  return best;
}
function hangPlace (p) {
  p.x = p.hang.x + Math.cos(p.ha) * p.hr; p.z = p.hang.z + Math.sin(p.ha) * p.hr;
}
function hangStep (p, dt) {
  p.ph += dt * 4;
  p.ha += dt * p.speed * 0.12 * (p.hr > 3 ? 1 : -1);
  p.hr = clamp(p.hr + Math.sin(p.ph * 0.13) * dt * 0.4, 1.2, p.hang.r);
  // к своему месту в кружке — шагом: после испуга не телепортируется
  const tx = p.hang.x + Math.cos(p.ha) * p.hr, tz = p.hang.z + Math.sin(p.ha) * p.hr;
  const d = Math.hypot(tx - p.x, tz - p.z), st = Math.min(d, 2.6 * dt);
  if (d > 0.001) { p.x += (tx - p.x) / d * st; p.z += (tz - p.z) / d * st; }
  pushOut(p, 0.5);
  const g = p.grp;
  g.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + Math.abs(Math.sin(p.ph * 1.6)) * 0.28, p.z);
  g.rotation.y = damp(g.rotation.y, Math.atan2(p.hang.x - p.x, p.hang.z - p.z) + Math.sin(p.ph * 0.3) * 0.6, 5, dt);
  const sw = Math.sin(p.ph * 1.6) * 0.5;
  g.userData.legL.rotation.x = sw;
  g.userData.legR.rotation.x = -sw;
}

function updatePeds (dt) {
  for (const p of PEDS) {
    if (p.dead) {
      if ((p.deadT -= dt) <= 0) {                // возрождается в другом квартале (со сходки — на сходке)
        p.dead = 0; p.grp.visible = true;
        if (p.hang) hangPlace(p); else walkSpawn(p, 90, 400);
      }
      continue;
    }
    if (p.panic) { panicStep(p, dt); continue; }
    if (p.hang) { if ((p.x - V.x) ** 2 + (p.z - V.z) ** 2 < 300 * 300) hangStep(p, dt); continue; }
    if (Math.hypot(p.x - V.x, p.z - V.z) > 480) walkSpawn(p, 120, 380);
    const dl = GFX.lag(p, dt, V.x, V.z);           // вдали — раз в N кадров (gfx.js)
    if (!dl) continue;
    const ang = walkerStep(p, dl, 7);
    dodgeCar(p, dl);                             // стоящую машину обходят
    pushOut(p, 0.5);
    const g = p.grp;
    g.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.05, p.z);
    if (!Number.isNaN(ang)) g.rotation.y = damp(g.rotation.y, ang, 8, dl);
    const sw = Math.sin(p.ph) * 0.7;
    g.userData.legL.rotation.x = sw;
    g.userData.legR.rotation.x = -sw;
  }
}

/* ─────────────── прохожие ───────────────
   Обычные люди рядом с бургерами: ходят теми же кольцами,
   от наезда улетают, и после них на асфальте остаётся пятно. */

/* Люди на улицах — выдуманные: имя, должность и внешность собирает
   people.js из зерна (раньше тут ходили настоящие коллеги с фотографиями).
   Внешность та же и в карточке заказа (faceDataURL), и на улице. */
const PEOPLE = [];
const GRACE = 18;        // столько ещё терпят после срока, потом смена кончена

/* Люди разные: мужчины и женщины, высокие и низкие, худые и толстые,
   причёски, бороды, кепки, очки, лица. Толстые и низкие ходят медленнее —
   pace, множитель к скорости шага. Руки, ноги, туловище и всё на голове —
   по мешу с общим материалом: людей на улице полсотни, лишние вызовы ни к чему. */
const HUMAN_VC = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
/* Убрать человека (или любую группу) насовсем — и освободить память
   видеокарты. Раньше каждый сбитый, ушедший или сменившийся человек
   оставался в памяти: за длинную смену набегали тысячи геометрий и
   материалов, и игра начинала подтормаживать. Общие материалы и
   спрайтовую геометрию three.js не трогаем. */
function dropMesh (g) {
  scene.remove(g);
  HUMANS.delete(g);
  g.traverse(o => { if (o !== g && o.userData && o.userData.lod) HUMANS.delete(o); });
  g.traverse(o => {
    if (o.isSprite) { o.material.dispose(); return; }
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [].concat(o.material)) if (m !== HUMAN_VC && m !== SMASH_MAT && m !== BURGER_MAT && m !== GLASS_MAT && !m.userData.keep) m.dispose();   // keep — общие текстуры лиц
  });
}
/* makeHuman(person, o): o — { fem, fat, h, skin, shirt, pants, cap, face: false }.
   Фабрику заводим при первом вызове: HUMANS объявлен ниже. */
let humanFactory = null;
function makeHuman (person, o = {}) {
  if (!humanFactory) humanFactory = createHumanFactory({ THREE, HUMAN_VC, HUMANS });
  return humanFactory(person, o);
}
/* все люди — для переключения ближний/дальний вариант (humanLod) */
const HUMANS = new Set();
const LOD_P = new THREE.Vector3();
function humanLod () {
  const cx = cam.position.x, cz = cam.position.z, L = GFX.hideR().lod;   // 45 м; на Низкой — 32 (gfx.js)
  for (const g of HUMANS) {
    const p = g.parent === scene ? g.position : g.parent ? g.parent.position : null;
    if (!p) continue;
    const far = (p.x - cx) ** 2 + (p.z - cz) ** 2 > L * L;
    const u = g.userData;
    if (u.far === far) continue;
    u.far = far;
    u.lod.visible = far;
    for (const m of u.parts) m.visible = !far;
  }
}

/* очередной клиент или прохожий — всегда новый выдуманный человек */
function nextPerson () { return makePerson(); }

function initPeople () {
  for (let k = 0; k < (INTRO ? 18 : 44); k++) {
    // во вступлении лица у прохожих не грузим: в кадре их не разглядеть, а
    // сорок аватарок стояли в очереди перед четырьмя лицами героев
    const person = INTRO ? null : nextPerson();
    const p = {
      person, yard: k % 4 === 3,                 // каждый четвёртый гуляет во дворе
      grp: makeHuman(person), speed: 0, base: rand(1.1, 1.7), ph: rand(0, 9),
      crossT: rand(15, 80), restT: rand(10, 70), idle: null,
      x: 0, z: 0, dead: 0, deadT: 0,
      w: null, path: null, cross: null, dodge: 0, dox: 0, doz: 0, dpx: 0, dpz: 0,                                     // ходьба и гость пиццерии — с рождения (dbl у V)
      guest: false, sitting: 0, sitAt: null, waitAt: null, sitRy: 0, party: false,
    };
    dbl(p);
    p.speed = p.base * p.grp.userData.pace;
    walkSpawn(p, 30, 380);
    scene.add(p.grp);
    PEOPLE.push(p);
  }
}

/* ─────────────── самокатчики ───────────────
   Электросамокаты из шеринга: гоняют по тротуару у самого бордюра
   вчетверо быстрее пешеходов и переходят — точнее, переезжают — по
   зебре. Сбил — самокат улетает отдельно, человек как все. */
const SCOOTS = [];
const SCOOT_HEX = ['#7bd64a', '#8e5bd8', '#ffd23f', '#2fb8a8'];

function makeScooter (two) {
  const g = makeHuman(null, { fat: false });
  const u = g.userData;
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const deck = pick(SCOOT_HEX);
  const sc = new THREE.Group();
  const add = (w, h, d, hex, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex)); m.position.set(x, y, z); sc.add(m); return m; };
  add(0.22, 0.07, 1.05, deck, 0, 0.12, 0);
  add(0.06, 1.05, 0.06, '#2b2a30', 0, 0.62, 0.5).rotation.x = -0.18;
  add(0.56, 0.05, 0.05, '#2b2a30', 0, 1.13, 0.58);
  add(0.12, 0.16, 0.08, deck, 0, 1.0, 0.57);
  for (const z of [0.5, -0.48]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8).rotateZ(Math.PI / 2), mat('#1b1a1f'));
    w.position.set(0, 0.1, z);
    sc.add(w);
  }
  g.add(sc);
  // стоит на деке: ноги врозь вдоль, руки на руле
  for (const o of g.children) if (o !== sc) o.position.y += 0.16;
  u.legL.rotation.x = 0.25; u.legR.rotation.x = -0.25;
  u.armL.rotation.x = -1.05; u.armR.rotation.x = -1.05;
  u.scoot = sc; u.deck = deck;
  // вдвоём на одном самокате: второй стоит сзади и держится за первого
  if (two) {
    const q = makeHuman(null, { fat: false });
    const s2 = 1 / g.scale.x;                     // масштаб первого не должен сжимать второго дважды
    q.scale.multiplyScalar(s2);
    q.position.set(0, 0.16 * s2, -0.42);
    q.userData.armL.rotation.x = -1.3; q.userData.armR.rotation.x = -1.3;
    q.userData.legL.rotation.x = 0.15; q.userData.legR.rotation.x = -0.1;
    g.add(q);
    u.pass = q;
  }
  return g;
}

function initScoots () {
  for (let k = 0; k < 16; k++) {
    const two = chance(0.25);
    const p = dbl({ grp: makeScooter(two), two, bike: true, speed: rand(4.5, 6.8) * (two ? 0.8 : 1), ph: 0, crossT: rand(8, 40), x: 0, z: 0, dead: 0, deadT: 0, lean: 0, w: null, path: null, cross: null, dodge: 0, dox: 0, doz: 0, dpx: 0, dpz: 0 });
    walkSpawn(p, 30, 380);
    scene.add(p.grp);
    SCOOTS.push(p);
  }
}

function updateScoots (dt) {
  for (const p of SCOOTS) {
    if (p.dead) {
      if ((p.deadT -= dt) <= 0) {
        p.dead = 0;
        dropMesh(p.grp);
        p.two = chance(0.25);
        p.grp = makeScooter(p.two);
        scene.add(p.grp);
        walkSpawn(p, 120, 400);
      }
      continue;
    }
    if (Math.hypot(p.x - V.x, p.z - V.z) > 480) walkSpawn(p, 120, 380);
    const dl = GFX.lag(p, dt, V.x, V.z);           // вдали — раз в N кадров (gfx.js)
    if (!dl) continue;
    const ang = walkerStep(p, dl, 0);
    dodgeCar(p, dl);                               // стоящую машину объезжает
    pushOut(p, 0.45);
    const g = p.grp;
    g.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z), p.z);
    if (!Number.isNaN(ang)) {
      const dh = Math.atan2(Math.sin(ang - g.rotation.y), Math.cos(ang - g.rotation.y));
      g.rotation.y += dh * Math.min(1, dl * 9);
      p.lean = damp(p.lean, clamp(-dh * 2.5, -0.35, 0.35), 6, dl);
    }
    g.rotation.z = p.lean;
  }
}

/* сбил самокатчика: самокат кувыркается и лежит отдельно (HITS.wreck), человек перелетает
   вперёд через руль (HITS.hit с over) — во взрослой разбивается о землю на куски. Медленнее HITS.TIER.FALL — свалился, встал, ушёл: не считается.
   kmh — для взрыва (там vx/vz — направление, а не скорость) */
function runOverScoot (p, vx, vz, by, kmh) {
  p.dead = 1; p.deadT = rand(14, 22);
  const u = p.grp.userData;
  const blast = kmh != null;
  if (kmh == null) kmh = HITS.kmhOf(vx, vz);
  const up = HITS.isFall(kmh);
  if (u.scoot) { HITS.wreck(u.scoot, vx, vz); u.scoot = null; }
  p.grp.visible = false;
  // машина — через руль вперёд по ходу самоката (hits.js throwOver); взрыв (kmh задан) — от взрыва
  const hx = Math.sin(p.grp.rotation.y), hz = Math.cos(p.grp.rotation.y);
  const over = blast ? null : { hx, hz, sp: p.speed || 0 };
  HITS.hit(p, vx, vz, kmh, { up, y0: 0.16, over });
  const pass = u.pass;
  if (pass) HITS.hit({ x: p.x - hx * 0.5, z: p.z - hz * 0.5, grp: pass }, vx, vz, kmh, { up, y0: 0.16, over });
  if (up) { Snd.fx('whoosh', s => s.noise(0.15, 0.22)); return; }
  Snd.squish();
  if (by) return;
  S.scoots += pass ? 2 : 1;
}

/* Гость перестаёт гулять: если рядом лавочка — доходит и садится,
   иначе стоит на месте. И всё время разворачивается к курьеру. */
function freeBench (x, z, maxD) {
  let best = null, bd = maxD;
  for (const b of BENCHES) {
    if (b.taken || (b.prop && b.prop.down)) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/* сидит просто так: дошёл до лавочки, посидел, пошёл дальше */
function idleSitStep (p, dt) {
  const u = p.grp.userData;
  const b = p.idle.b;
  if (b.prop && b.prop.down) { releaseIdle(p); return; }

  if (p.idle.phase === 'walk') {
    const dx = b.x - p.x, dz = b.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) {
      p.ph += dt * 7;
      const k = Math.min(1, p.speed * dt / d);
      p.x += dx * k; p.z += dz * k;
      p.grp.position.set(p.x, groundH(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.04, p.z);
      p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(dx, dz), 8, dt);
      const sw = Math.sin(p.ph) * 0.8;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
      if (p.idle.give -= dt, p.idle.give < 0) releaseIdle(p);   // не дошёл — бросаем затею
      return;
    }
    p.idle.phase = 'sit';
    p.x = b.x; p.z = b.z;
    p.grp.rotation.y = b.ry;
  }

  p.grp.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + 0.42, p.z);
  u.legL.rotation.x = damp(u.legL.rotation.x, -1.45, 8, dt);
  u.legR.rotation.x = damp(u.legR.rotation.x, -1.45, 8, dt);
  u.armL.rotation.x = damp(u.armL.rotation.x, -0.3, 6, dt);
  u.armR.rotation.x = damp(u.armR.rotation.x, -0.3, 6, dt);
  if ((p.idle.t -= dt) <= 0) releaseIdle(p);
}

function releaseIdle (p) {
  if (p.idle) p.idle.b.taken = 0;
  p.idle = null;
  p.restT = rand(45, 110);
  p.resnap = true;                                // с лавочки — обратно на тротуар
  p.grp.position.y = groundH(p.x, p.z);
  p.grp.userData.legL.rotation.x = 0;
  p.grp.userData.legR.rotation.x = 0;
}

function makeGuest (p, at) {
  if (p.surf) { p.guest = true; return; }          // сёрфер на реке — своим ходом (updateSurf)
  if (p.after) afterDrop(p, true);
  p.guest = true;
  p.sitting = 0;
  p.sitAt = null;
  p.waitAt = at || null;
  // уже сидел на лавочке — там и ждёт
  if (p.idle) {
    const b = p.idle.b, seated = p.idle.phase === 'sit';
    p.idle = null;
    if (!at) {
      p.sitAt = b; b.taken = 1;
      if (seated) { p.sitting = 1; p.sitRy = b.ry; p.grp.rotation.y = b.ry; }
      return;
    }
    b.taken = 0;
  }
  if (at) return;                               // подойти к своим и стоять рядом
  const best = freeBench(p.x, p.z, 14);
  if (best && chance(0.7)) { p.sitAt = best; best.taken = 1; }
}

/* Клиент заказа сразу встаёт туда, где будет ждать (лавочка, рядом со своими или где стоял):
   он далеко, а пин и маршрут с принятия до вручения не двигаются (docs/ORDERS.md «Адрес не
   двигается»). Курьерам смены (orders.js boardCrew / staffArrive) — не сюда: они идут пешком. */
function settleGuest (p) {
  if (!p || p.surf || !p.guest) return;
  const b = p.sitAt || p.waitAt;
  if (b && !p.sitting) {
    p.x = b.x; p.z = b.z;
    if (p.waitAt) { p.waitAt = null; pushOut(p, 0.45); }
    else { p.sitting = 1; p.sitRy = b.ry; p.grp.rotation.y = b.ry; }
  }
  p.grp.position.set(p.x, groundH(p.x, p.z), p.z);
}
/* неподвижная точка адреса: st.at — туда пин, маршрут и проверка «подъехал» (checkArrival).
   Пин — прямо перед клиентом (pinFront), а не на нём. Сёрфер катается вдоль берега — пин на берегу
   напротив середины его заплыва */
function pinStop (st) {
  if (st.at || !st.peds.length) return;
  const f = st.peds[0];
  if (f.surf) { st.at = { x: f.bx, z: f.z0 }; return; }
  st.peds.forEach(settleGuest);
  const n = st.peds.length;
  const cx = st.peds.reduce((a, p) => a + p.x, 0) / n, cz = st.peds.reduce((a, p) => a + p.z, 0) / n;
  const rr = st.peds.reduce((a, p) => Math.max(a, Math.hypot(p.x - cx, p.z - cz)), 0);   // групповой — кружок вокруг середины
  st.at = pinFront(cx, cz, Math.max(PIN.OFF, rr + PIN.OFF - 1));
}

/* Пин — прямо перед клиентом, на свободном месте (docs/ORDERS.md «Адрес не двигается»).
   От клиента 16 лучей: луч идёт, пока не упрётся в дом или забор; пин — на PIN.OFF м по лучу
   (места меньше — ближе, но не ближе PIN.MIN), там, где машине есть куда встать: не в доме и
   PIN.WALL м от его стен, не в заборе, будке, дереве (SOLIDS, радиус PIN.CAR), не в воде.
   Из подходящих — где простора за пином больше, чуть лучше — в сторону ближайшего проезда или
   дорожки. Места нет нигде — пин на клиенте, как раньше. */
const PIN = { OFF: 3.5, MIN: 2.2, WALL: 1.6, CAR: 1.3, DIRS: 16, LOOK: 9 };
function solidAt (x, z, r) {
  for (const s of solidsNear(x, z)) {
    if (s.deckY !== undefined) continue;          // перила моста — не на земле
    const dx = x - s.cx, dz = z - s.cz;
    const lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
    if (Math.abs(lx) < s.hw + r && Math.abs(lz) < s.hd + r) return true;
  }
  return false;
}
const pinRay = (x, z) => !inHouse(x, z) && !solidAt(x, z, 0.25) && !YARDS.blocks(x, z, 0.25) && !FEST.blocks(x, z);   // и не внутрь фестиваля (festivals.js)   // заборчики и лавочки у подъездов (yards.js) — тоже
const pinFree = (x, z) => inBounds(x, z, 5) && groundH(x, z) >= 0.3 && !inHouse(x, z, PIN.WALL) && !solidAt(x, z, PIN.CAR) && !YARDS.blocks(x, z, PIN.CAR) && !FEST.blocks(x, z, PIN.CAR);
function pinFront (cx, cz, off = PIN.OFF) {
  const r = nearestRoad(cx, cz, 7, 2);           // любая дорога, проезд во двор или дорожка
  const ra = r && r.d > 0.5 ? Math.atan2(r.x - cx, r.z - cz) : null;
  const look = Math.max(PIN.LOOK, off + 4);
  let best = null, bs = -Infinity;
  for (let i = 0; i < PIN.DIRS; i++) {
    const a = i / PIN.DIRS * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
    let L = 0;                                     // докуда луч свободен
    for (let s = 0.5; s <= look; s += 0.5) { if (!pinRay(cx + sx * s, cz + sz * s)) break; L = s; }
    let dd = 0;
    for (let s = Math.min(off, L); s >= PIN.MIN; s -= 0.5) if (pinFree(cx + sx * s, cz + sz * s)) { dd = s; break; }
    if (!dd) continue;
    let C = 0;                                     // простор за пином: машине есть откуда заехать
    for (let s = dd + 0.5; s <= Math.min(L, look); s += 0.5) { if (!pinFree(cx + sx * s, cz + sz * s)) break; C = s - dd; }
    const sc = dd * 2 + C + (ra === null ? 0 : 2 * Math.cos(a - ra));
    if (sc > bs) { bs = sc; best = { x: cx + sx * dd, z: cz + sz * dd }; }
  }
  return best || { x: cx, z: cz };
}

/* У ждущего клиента никого лишнего: курьеры на мопедах (mopeds.js), конкуренты с их гостями
   (rivalGoal) и ночные компании не встают ближе r м к нему и к его пину. Отданные — не в счёт */
function nearClient (x, z, r) {
  const o = S.order;
  if (!o || !o.stops) return false;
  const r2 = r * r;
  for (let i = 0; i < o.stops.length; i++) {
    const st = o.stops[i];
    if (st.done || (i < o.idx && st.done !== false)) continue;
    for (const p of st.peds) if (!p.served && (p.x - x) ** 2 + (p.z - z) ** 2 < r2) return true;
    if (st.at && (st.at.x - x) ** 2 + (st.at.z - z) ** 2 < r2) return true;
  }
  return false;
}
const GUEST_GAP = 0.9;                            // ближе к ждущему клиенту стоящий прохожий не встанет

function clearGuest (p) {
  if (!p.guest) return;
  if (p.sitAt) p.sitAt.taken = 0;
  p.guest = false; p.sitting = 0; p.sitAt = null; p.waitAt = null; p.party = false;
  p.resnap = !p.path;                             // дождался пиццы — дальше по тротуару
  p.grp.position.y = groundH(p.x, p.z);
  p.grp.userData.legL.rotation.x = 0;
  p.grp.userData.legR.rotation.x = 0;
  p.grp.userData.head.rotation.y = 0;
}

function guestStep (p, dt) {
  const u = p.grp.userData;
  const b = p.sitAt || p.waitAt;

  // в клиенте никто не стоит: прохожий ближе GUEST_GAP — на край (сидящих на лавочке не трогаем)
  if (!p.served) for (const q of PEOPLE) {
    if (q === p || q.dead || q.guest || q.idle || q.sitting) continue;
    const dx = q.x - p.x, dz = q.z - p.z, dd = dx * dx + dz * dz;
    if (dd >= GUEST_GAP * GUEST_GAP) continue;
    const l = Math.sqrt(dd);
    if (l < 1e-3) q.x += GUEST_GAP;
    else { q.x = p.x + dx / l * GUEST_GAP; q.z = p.z + dz / l * GUEST_GAP; }
    pushOut(q, 0.45);
  }
  if (p.lie && BEACH.lieStep(p, dt)) return;     // пляж: лежит на полотенце / сидит и машет (beach.js)

  if (b && !p.sitting) {
    // доходит до лавочки
    const dx = b.x - p.x, dz = b.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) {
      p.ph += dt * 7;
      const k = Math.min(1, 2.2 * dt / d);
      p.x += dx * k; p.z += dz * k;
      pushOut(p, 0.45);
      p.grp.position.set(p.x, groundH(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.04, p.z);
      p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(dx, dz), 8, dt);
      const sw = Math.sin(p.ph) * 0.8;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
      return;
    }
    if (p.waitAt) { p.waitAt = null; }          // дошёл до своих — дальше просто стоит
    else {
      p.sitting = 1;
      p.x = b.x; p.z = b.z;
      p.sitRy = b.ry;
      p.grp.rotation.y = b.ry;
    }
  }

  if (p.sitting) {
    p.grp.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + 0.42, p.z);
    // курьер подъехал не с той стороны — гость встаёт и разворачивается
    const toCar = Math.atan2(V.x - p.x, V.z - p.z);
    const off = Math.atan2(Math.sin(toCar - p.sitRy), Math.cos(toCar - p.sitRy));
    if (Math.abs(off) > 1.9 && Math.hypot(V.x - p.x, V.z - p.z) < 26) { p.sitting = 0; p.sitAt = null; }
    u.legL.rotation.x = damp(u.legL.rotation.x, -1.45, 8, dt);
    u.legR.rotation.x = damp(u.legR.rotation.x, -1.45, 8, dt);
    u.armL.rotation.x = damp(u.armL.rotation.x, -0.3, 6, dt);
    u.armR.rotation.x = damp(u.armR.rotation.x, -0.3, 6, dt);
    // сидя разворачивается головой
    u.head.rotation.y = damp(u.head.rotation.y, clamp(off, -1.1, 1.1), 5, dt);
  } else if (p.party && !p.served) {
    // тусовка: прыгают в такт, руки вверх по очереди, пританцовывают
    p.partyPh += dt;
    const t = p.partyPh, beat = Math.abs(Math.sin(t * 7));
    p.grp.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + beat * 0.32, p.z);
    p.grp.rotation.y += Math.sin(t * 1.3) * dt * 2.5;
    u.armL.rotation.x = -2.6 + Math.sin(t * 7) * 0.5;
    u.armR.rotation.x = -2.6 + Math.sin(t * 7 + Math.PI) * 0.5;
    u.armL.rotation.z = -0.3; u.armR.rotation.z = 0.3;
    u.legL.rotation.x = Math.sin(t * 7) * 0.4; u.legR.rotation.x = -Math.sin(t * 7) * 0.4;
    u.head.rotation.y = Math.sin(t * 3.5) * 0.4;
  } else {
    p.grp.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z), p.z);
    u.legL.rotation.x = damp(u.legL.rotation.x, 0, 6, dt);
    u.legR.rotation.x = damp(u.legR.rotation.x, 0, 6, dt);
    u.armL.rotation.x = damp(u.armL.rotation.x, 0, 6, dt);
    u.armR.rotation.x = damp(u.armR.rotation.x, 0, 6, dt);
    u.armL.rotation.z = damp(u.armL.rotation.z, 0, 6, dt);
    u.armR.rotation.z = damp(u.armR.rotation.z, 0, 6, dt);
    // стоя разворачивается всем корпусом и ждёт
    p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(V.x - p.x, V.z - p.z), 4, dt);
  }

  // получил пиццу — постоял с ней и пошёл дальше
  if (p.served) {
    p.freeT -= dt;
    if (p.freeT <= 0) {
      p.served = 0; p.holdT = 0;
      clearGuest(p);
      // домой в подъезд или на лавочку есть; нет — как раньше, дальше по тротуару без коробки
      if (!afterStart(p, p.afterMood)) dropHold(p);
      return;
    }
  }

  // горячая пицца в руках парит
  if (p.holdT > 0) {
    p.holdT -= dt;
    p.steamT = (p.steamT || 0) - dt;
    if (p.steamT <= 0) {
      p.steamT = 0.2;
      steam(p.x, (p.sitting ? 1.25 : 1.35), p.z + 0.1);
    }
  }
}

/* ── клиент после пиццы (docs/ORDERS.md «Клиент после пиццы») ──
   Получил коробку, постоял AFTER.HOLD с (злой — AFTER.HOLD_ANGRY) — и:
     довольный: в AFTER.BENCH (30 %) случаев — на свободную лавочку ближе AFTER.BENCH_R (25 м):
       садится, открывает коробку, ест AFTER.EAT с (кусок ко рту, крошки), потом сердечки
       и «м-м-м», сидит AFTER.CHILL с и уходит по тротуару; лавочки нет — домой;
     домой — к ближайшему подъезду ближе AFTER.DOOR_R (45 м): дверь открывается, заходит,
       дверь закрывается; вместо него где-то вдали появляется другой прохожий;
     злой (опоздал или задел его машиной) — не ест: быстро топает к подъезду, злится «!».
   Одновременно — не больше AFTER.MAX (4); остальные, как раньше, уходят по тротуару.
   Уехал дальше AFTER.FAR (140 м) или застрял дольше AFTER.GIVE (25 с) — сразу: «домашний»
   пропадает (вдали другой прохожий), с лавочки встаёт и уходит. */
const AFTER = { HOLD: 3, HOLD_ANGRY: 1.5, BENCH: 0.3, BENCH_R: 25, DOOR_R: 45, MAX: 4, FAR: 140, EAT: 7, CHILL: 8, GIVE: 25 };
function afterCount () { let n = 0; for (const q of PEOPLE) if (q.after) n++; return n; }
function nearEntrance (x, z, r) {
  let best = null, bd = r * r;
  for (const e of CITY.entrances) { const d = (e[0] - x) ** 2 + (e[1] - z) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}
/* дом у подъезда (домофон, doorstep.js): этажей у ближайшего дома с адресом, если дверь подъезда ближе r м; иначе 0 */
function entranceLv (x, z, r = ECON.DOOR.DOOR_R) {
  if (!nearEntrance(x, z, r)) return 0;
  let best = null, bd = 60 * 60;
  for (const h of HOUSES) { const d = (h.x - x) ** 2 + (h.z - z) ** 2; if (d < bd) { bd = d; best = h; } }
  return best ? best.lv || 0 : 0;
}
function dropHold (p) {
  if (!p.hold) return;
  p.grp.remove(p.hold);
  p.hold.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  p.hold = null;
}
function afterStart (p, mood) {
  if (!mood || p.surf || p.dead || !p.hold || p.base === undefined || afterCount() >= AFTER.MAX || Math.hypot(p.x - V.x, p.z - V.z) > AFTER.FAR) return false;
  const angry = mood === 'angry';
  if (!angry && chance(AFTER.BENCH)) {
    let b = null, bd = AFTER.BENCH_R;
    for (const q of BENCHES) {
      if (q.taken || (q.prop && q.prop.down) || HK.busy(q)) continue;      // занята или там кальянщики
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) { bd = d; b = q; }
    }
    if (b) { b.taken = 1; p.after = { k: 'bench', b, ph: 'walk', t: 0, give: AFTER.GIVE }; return true; }
  }
  const e = nearEntrance(p.x, p.z, AFTER.DOOR_R);
  if (!e) return false;
  p.after = { k: 'door', e, ph: 'walk', t: 0, give: AFTER.GIVE, angry, sayT: rand(0.6, 1.2) };
  return true;
}
/* идёт к точке; злой — топает: шаг чаще и шире, подпрыгивает */
function afterWalk (p, tx, tz, sp, dt, stomp, push) {
  const u = p.grp.userData, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d > 0.02) {
    const k = Math.min(1, sp * dt / d);
    p.x += dx * k; p.z += dz * k;
    if (push) pushOut(p, 0.45);
    p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(dx, dz), 8, dt);
  }
  p.ph += dt * (stomp ? 11 : 7);
  p.grp.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + Math.abs(Math.sin(p.ph)) * (stomp ? 0.09 : 0.04), p.z);
  const sw = Math.sin(p.ph) * (stomp ? 1.05 : 0.75);
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  u.armL.rotation.x = u.armR.rotation.x = -1.15 + (stomp ? Math.sin(p.ph * 2) * 0.15 : 0);   // коробка перед собой
  u.armL.rotation.z = u.armR.rotation.z = 0;
  return d;
}
/* закончил: true — исчез (вошёл в подъезд, вместо него — новый прохожий вдали), иначе — дальше по тротуару */
function afterDrop (p, keep) {
  const A = p.after;
  if (!A) return;
  if (A.b) A.b.taken = 0;
  if (A.slice) { A.slice.parent && A.slice.parent.remove(A.slice); A.slice.material.dispose(); A.slice = null; }
  if (A.bubble) { p.grp.remove(A.bubble); A.bubble.material.dispose(); A.bubble = null; }
  p.after = null;
  const u = p.grp.userData;
  if (A.k === 'door' && !keep) {
    p.hold = null;                                // коробка уходит вместе с мешем
    dropMesh(p.grp);
    p.person = nextPerson(); p.grp = makeHuman(p.person); p.speed = p.base * p.grp.userData.pace;
    scene.add(p.grp);
    walkSpawn(p, 90, 400); p.crossT = rand(20, 90); p.restT = rand(20, 70);
    return;
  }
  dropHold(p);
  p.resnap = true;
  p.restT = rand(45, 110);
  p.grp.position.y = groundH(p.x, p.z);
  u.legL.rotation.x = u.legR.rotation.x = 0; u.armL.rotation.x = u.armR.rotation.x = 0; u.head.rotation.y = 0;
}
/* дверь подъезда: тёмный проём и створка, открывается наружу и закрывается за жильцом */
const DOORS = [];
let DOOR_GEO = null;
function doorOpen (e) {
  const [x, z, nx, nz] = e, ry = Math.atan2(nx, nz), tx = nz, tz = -nx, gy = groundH(x + nx, z + nz);
  if (!DOOR_GEO) DOOR_GEO = { hole: new THREE.PlaneGeometry(1.0, 2.15), leaf: new THREE.BoxGeometry(1.0, 2.15, 0.06), hm: new THREE.MeshBasicMaterial({ color: 0x0c0a09 }), lm: new THREE.MeshLambertMaterial({ color: '#5a4636', flatShading: true }) };
  const g = new THREE.Group();
  const hole = new THREE.Mesh(DOOR_GEO.hole, DOOR_GEO.hm);
  hole.position.set(x + nx * 0.12, gy + 1.08, z + nz * 0.12); hole.rotation.y = ry;
  const hinge = new THREE.Group();
  hinge.position.set(x + nx * 0.16 + tx * 0.5, gy + 1.08, z + nz * 0.16 + tz * 0.5); hinge.rotation.y = ry;
  const leaf = new THREE.Mesh(DOOR_GEO.leaf, DOOR_GEO.lm);
  leaf.position.x = -0.5;
  hinge.add(leaf);
  g.add(hole, hinge);
  scene.add(g);
  const d = { g, hinge, ry, t: 0, shut: -1, x, z };
  DOORS.push(d);
  Snd.fx('door-open', s => s.blip(180, 0.12, 'triangle', 0.06), { x, z, far: 60 });
  return d;
}
function updateDoors (dt) {
  for (let i = DOORS.length - 1; i >= 0; i--) {
    const d = DOORS[i];
    d.t += dt;
    if (d.shut < 0 && d.t > 8) d.shut = d.t;      // жилец не дошёл — закрывается сама
    const open = Math.min(1, d.t / 0.4) * (d.shut < 0 ? 1 : Math.max(0, 1 - (d.t - d.shut) / 0.5));
    d.hinge.rotation.y = d.ry + open * 1.45;
    if (d.shut >= 0 && open <= 0) { scene.remove(d.g); DOORS.splice(i, 1); Snd.fx('door-close', s => s.blip(120, 0.08, 'square', 0.07), { x: d.x, z: d.z, far: 60 }); }
  }
}
/* крошки от куска пиццы */
function crumbs (x, y, z) {
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: chance(0.5) ? 0xe8b04a : 0xc96a2e }));
    m.position.set(x + rand(-0.08, 0.08), y, z + rand(-0.08, 0.08));
    m.scale.setScalar(0.6);
    fxAdd(m, { vx: rand(-0.4, 0.4), vy: rand(0, 0.6), vz: rand(-0.4, 0.4), gravity: 9, life: rand(0.6, 0.9), max: 0.9, floor: floorAt(x, z) - 0.08 });
  }
}
/* открытая коробка: крышка откинута, внутри пицца (дети box — p.hold) */
function openBox (box) {
  const lab = box.children[1];
  if (lab) lab.visible = false;
  const lidG = new THREE.Group();
  lidG.position.set(0, 0.11, -0.425);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 0.85), new THREE.MeshLambertMaterial({ color: '#f0522a', flatShading: true }));
  lid.position.z = 0.425;
  lidG.add(lid);
  const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 10), new THREE.MeshLambertMaterial({ color: '#f2c14e', flatShading: true }));
  pie.position.y = 0.115;
  box.add(lidG, pie);
  return lidG;
}
function afterStep (p, dt) {
  const A = p.after, u = p.grp.userData;
  A.t += dt;
  const far = Math.hypot(p.x - V.x, p.z - V.z) > AFTER.FAR;
  if (p.guest || !p.hold) { afterDrop(p, true); return; }
  if (A.k === 'door') {
    const [ex, ez, nx, nz] = A.e;
    if (A.ph === 'walk') {
      const d = afterWalk(p, ex + nx * 1.4, ez + nz * 1.4, A.angry ? 2.8 : 1.5, dt, A.angry, true);
      if (A.angry && (A.sayT -= dt) <= 0) { A.sayT = rand(1.3, 2.2); emote(p.x, 2.1, p.z, 'angry', 1); }
      if (d < 0.6) { A.ph = 'in'; A.door = doorOpen(A.e); A.t = 0; }
      else if (far || (A.give -= dt) <= 0) afterDrop(p, Math.hypot(p.x - V.x, p.z - V.z) < 45);   // застрял: при курьере — просто уходит, без телепорта
      return;
    }
    // дверь открылась — шагнул в проём и пропал
    if (A.t < 0.35) { afterWalk(p, ex + nx * 1.4, ez + nz * 1.4, 0, dt, false, false); p.grp.rotation.y = damp(p.grp.rotation.y, Math.atan2(-nx, -nz), 10, dt); return; }
    const d = afterWalk(p, ex + nx * 0.1, ez + nz * 0.1, A.angry ? 2.4 : 1.4, dt, A.angry, false);
    if (d < 0.15 || A.t > 3) { if (A.door) A.door.shut = A.door.t; afterDrop(p); }
    return;
  }
  // лавочка
  const b = A.b;
  if ((b.prop && b.prop.down) || far) { afterDrop(p); return; }
  if (A.ph === 'walk') {
    const d = afterWalk(p, b.x, b.z, 1.5, dt, false, true);
    if (d < 0.5) {
      A.ph = 'open'; A.t = 0;
      p.x = b.x; p.z = b.z; p.grp.rotation.y = b.ry;
      p.hold.position.set(0, 0.86, 0.34);
      A.lid = openBox(p.hold);
    } else if ((A.give -= dt) <= 0) afterDrop(p);
    return;
  }
  p.grp.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + 0.42, p.z);
  p.grp.rotation.y = b.ry;
  u.legL.rotation.x = damp(u.legL.rotation.x, -1.45, 8, dt);
  u.legR.rotation.x = damp(u.legR.rotation.x, -1.45, 8, dt);
  u.armL.rotation.x = damp(u.armL.rotation.x, -0.75, 6, dt);     // левой придерживает коробку
  if (A.ph === 'open') {
    A.lid.rotation.x = -1.9 * Math.min(1, A.t / 0.6);
    u.armR.rotation.x = damp(u.armR.rotation.x, -0.9, 6, dt);
    if (A.t > 0.7) {
      A.ph = 'eat'; A.t = 0;
      A.slice = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.24), new THREE.MeshLambertMaterial({ color: '#f2b440', flatShading: true }));
      A.slice.position.set(0, -0.56, 0.1);
      u.armR.add(A.slice);
      steam(p.x, 1.2, p.z);
    }
    return;
  }
  if (A.ph === 'eat') {
    // кусок ко рту и обратно, раз в 1,4 с — укус и крошки
    const c = (A.t % 1.4) / 1.4, up = c < 0.45 ? c / 0.45 : c < 0.6 ? 1 : 1 - (c - 0.6) / 0.4;
    u.armR.rotation.x = -0.9 - up * 1.55;
    u.head.rotation.x = up > 0.95 ? Math.sin(A.t * 30) * 0.06 : 0;    // жуёт
    const was = A.bite || 0; A.bite = Math.floor((A.t + 0.75) / 1.4);
    if (A.bite !== was && A.t > 0.5) { const f = Math.sin(b.ry), g = Math.cos(b.ry); crumbs(p.x + f * 0.3, groundH(p.x, p.z) + 1.55, p.z + g * 0.3); }
    if (A.t > AFTER.EAT) {
      A.ph = 'chill'; A.t = 0;
      if (A.slice) { u.armR.remove(A.slice); A.slice.geometry.dispose(); A.slice.material.dispose(); A.slice = null; }
      u.head.rotation.x = 0;
      emote(p.x, 2.0, p.z, 'heart', 5);
      A.bubble = sayBubble(p.grp, $t('м-м-м'), '#e0507a', 2.4);
      Snd.fx('yum', s => s.blip(660, 0.12, 'triangle', 0.08), { x: p.x, z: p.z });
    }
    return;
  }
  // сидит довольный: откинулся, покачивает головой; иногда сердечко
  u.armR.rotation.x = damp(u.armR.rotation.x, -0.6, 4, dt);
  u.head.rotation.y = Math.sin(A.t * 1.6) * 0.3;
  if (A.bubble && A.t > 2.6) { p.grp.remove(A.bubble); A.bubble.material.dispose(); A.bubble = null; }
  if (A.t > 2 && Math.floor(A.t / 3) !== Math.floor((A.t - dt) / 3)) emote(p.x, 2.0, p.z, 'heart', 1);
  if (A.t > AFTER.CHILL) afterDrop(p);
}

function updatePeople (dt) {
  updateDoors(dt);
  for (const p of PEOPLE) {
    if (p.dead) {
      if ((p.deadT -= dt) <= 0) {
        p.dead = 0; p.fly = null; p.fall = null;
        dropMesh(p.grp);                      // возвращается уже другим человеком
        p.person = nextPerson();
        p.grp = makeHuman(p.person);
        p.speed = p.base * p.grp.userData.pace;
        p.panic = null; p.shock = 0;
        scene.add(p.grp);
        if (p.idle) { p.idle.b.taken = 0; p.idle = null; }
        if (p.after) { if (p.after.b) p.after.b.taken = 0; p.after = null; p.hold = null; }
        walkSpawn(p, 90, 400); p.crossT = rand(20, 90); p.restT = rand(20, 70);
      }
      continue;
    }
    if (p.fall && HITS.fallStep(p, dt)) continue;   // упал от лёгкого удара — лежит и встаёт
    if (p.guest) { guestStep(p, dt); if (p.shock > 0) shockStep(p, dt); continue; }
    if (p.after) { afterStep(p, dt); continue; }
    if (p.panic) { panicStep(p, dt); continue; }
    if (p.idle) { idleSitStep(p, dt); continue; }

    // вдали — раз в N кадров (графика, gfx.js); клиенты, сидящие, напуганные — выше, всегда
    const dl = GFX.lag(p, dt, V.x, V.z);
    if (!dl) continue;
    // изредка кто-нибудь садится передохнуть на свободную лавочку
    p.restT -= dl;
    if (!p.guest && !p.idle && Math.hypot(p.x - V.x, p.z - V.z) > 480) walkSpawn(p, 120, 380);
    if (p.restT <= 0 && !p.cross) {
      const b = freeBench(p.x, p.z, 15);
      if (b) { b.taken = 1; p.idle = { b, phase: 'walk', t: rand(20, 60), give: 14 }; continue; }
      p.restT = rand(20, 50);
    }

    const ang = walkerStep(p, dl, 7 * (p.grp.userData.fat ? 0.75 : 1));
    dodgeCar(p, dl);                             // стоящую машину обходят, а не проходят насквозь
    pushOut(p, 0.45);                            // не залезать в стены и изгороди
    const g = p.grp;
    g.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.04, p.z);
    if (!Number.isNaN(ang)) g.rotation.y = damp(g.rotation.y, ang, 8, dl);
    const sw = Math.sin(p.ph) * 0.8;
    g.userData.legL.rotation.x = sw; g.userData.legR.rotation.x = -sw;
    g.userData.armL.rotation.x = -sw * 0.7; g.userData.armR.rotation.x = sw * 0.7;
  }
}

/* ── паника ──
   Рядом кого-то задавили: сначала стоят с поднятыми руками, потом
   бегут прочь от места, размахивая руками, и только через несколько
   секунд успокаиваются и возвращаются на тротуар. Гость, который ждёт
   пиццу, и курильщики не убегают — только поднимают руки. */
function scare (x, z, r = 26) {
  if (INTRO) return;
  for (const p of PEOPLE) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > r || d < 0.3) continue;
    if (p.guest) { p.shock = rand(1.6, 2.6); continue; }
    if (p.idle) { p.idle.b.taken = 0; p.idle = null; p.grp.userData.legL.rotation.x = 0; p.grp.userData.legR.rotation.x = 0; }
    p.panic = { x, z, t: rand(0.5, 1.2), run: rand(3.5, 6), spd: rand(3.4, 4.6) * p.grp.userData.pace };
    if (chance(0.5)) emote(p.x, 2.3, p.z, 'angry', 2);
  }
  for (const p of SMOKERS) if (!p.dead && Math.hypot(p.x - x, p.z - z) < r) p.shock = rand(2, 3.5);
  for (const c of CROWDS) for (const q of c.people) if (!q.dead && Math.hypot(q.x - x, q.z - z) < r) q.shock = rand(1.5, 3);
  for (const a of ACCIDENTS) for (const f of a.fighters) if (!f.dead && Math.hypot(f.x - x, f.z - z) < r) f.shock = rand(1.5, 3);
  LIFE.scare(x, z, r);
  for (const pt of PITCHES) if (pt.game) for (const q of pt.game.players) if (!q.dead && Math.hypot(q.x - x, q.z - z) < r) q.shock = rand(1.5, 3);
  for (const p of PEDS) {
    if (p.dead || Math.hypot(p.x - x, p.z - z) > r) continue;
    p.panic = { x, z, t: 0.3, run: rand(3, 5), spd: rand(3.5, 4.5) };
  }
}

function handsUp (u, dt, k = 1) {
  u.armL.rotation.x = damp(u.armL.rotation.x, -2.9 * k, 14, dt);
  u.armR.rotation.x = damp(u.armR.rotation.x, -2.9 * k, 14, dt);
  u.armL.rotation.z = damp(u.armL.rotation.z, -0.3, 10, dt);
  u.armR.rotation.z = damp(u.armR.rotation.z, 0.3, 10, dt);
}
function shockStep (p, dt) {
  p.shock -= dt;
  const u = p.grp.userData;
  if (p.shock > 0) handsUp(u, dt);
  else { u.armL.rotation.z = 0; u.armR.rotation.z = 0; }
}

function panicStep (p, dt) {
  const P = p.panic, u = p.grp.userData, g = p.grp;
  const dx = p.x - P.x, dz = p.z - P.z, l = Math.hypot(dx, dz) || 1;
  if (P.t > 0) {
    // замер: руки вверх, лицом к тому, что случилось
    P.t -= dt;
    if (u.armL) handsUp(u, dt);
    u.legL.rotation.x = damp(u.legL.rotation.x, 0, 10, dt);
    u.legR.rotation.x = damp(u.legR.rotation.x, 0, 10, dt);
    g.rotation.y = damp(g.rotation.y, Math.atan2(-dx, -dz), 10, dt);
    g.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z), p.z);
    return;
  }
  // бегом прочь, руки над головой
  P.run -= dt;
  p.ph += dt * 16;
  p.x += dx / l * P.spd * dt; p.z += dz / l * P.spd * dt;
  pushOut(p, 0.45);
  g.rotation.y = damp(g.rotation.y, Math.atan2(dx, dz), 10, dt);
  g.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.1, p.z);
  const sw = Math.sin(p.ph) * 1.1;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  if (u.armL) {
    u.armL.rotation.x = -2.6 + Math.sin(p.ph) * 0.5; u.armR.rotation.x = -2.6 - Math.sin(p.ph) * 0.5;
    u.armL.rotation.z = -0.3; u.armR.rotation.z = 0.3;
  }
  if (P.run <= 0) {
    p.panic = null;
    if (u.armL) { u.armL.rotation.z = 0; u.armR.rotation.z = 0; }
    walkBack(p);
  }
}

/* Куски тела: летят, падают и остаются лежать. Пока лежат — под ними
   растёт лужа, поэтому место наезда видно ещё долго. */
const GORE = [];

/* сбит: что будет — решает скорость удара (hits.js TIER, docs/CONTENT.md «Сила удара»);
   kmh — если удар не от машины (взрыв): тогда скорость не из vx/vz */
function gibHuman (p, vx, vz, kmh) { HITS.hit(p, vx, vz, kmh); DARKN.onHit(p, vx, vz); }   // ночью встанет привидением (darknight.js)

/* На куски — только на нитро (04.10.2026, docs/CONTENT.md «Сила удара»): горит нитро (или бист с нитро),
   машина ещё быстрее своей максималки (разгон нитро не сбросила) или взрыв. Удар не от твоей машины
   (дальше 9 м) — никогда. Обычный удар — просто отлетает. */
let BLASTING = false;
function shredHit (p) {
  if (BLASTING) return true;
  if (!p || Math.hypot(p.x - V.x, p.z - V.z) > 9) return false;
  return NOS.burn || (FXS.beastT > 0 && !!IN.nitro) || Math.hypot(V.vx, V.vz) > VMAX + 0.5;
}

/* взрослая, быстрее HITS.TIER.BURST: разрывает на куски — куски, их кровь и как тают — hits.js burst */
function burstHuman (p, vx, vz, low) {
  HITS.burst(p, vx, vz, low);
  blood(p.x, 1, p.z, 16);
  decal(p.x, p.z, 0x8f1f2b, 1.9, 60);
  scare(p.x, p.z);
  callAmbulance(p.x, p.z);
}

function updateGore (dt) {
  for (let i = GORE.length - 1; i >= 0; i--) {
    const g = GORE[i];
    if (!g.rest) {
      g.vy -= 19 * dt;
      g.m.position.x += g.vx * dt; g.m.position.y += g.vy * dt; g.m.position.z += g.vz * dt;
      g.m.rotation.x += g.spin * dt; g.m.rotation.z += g.spin * 0.6 * dt;
      // пол под куском — там, куда он долетел: на склоне это важно
      const fl = HITS.topAt(g.m.position.x, g.m.position.z, g.m.position.y);   // верх асфальта, тротуара, сугроба
      if (g.m.position.y < fl + 0.18) {
        g.m.position.y = fl + 0.18;
        g.vy *= -0.28; g.vx *= 0.55; g.vz *= 0.55; g.spin *= 0.5;
        if (Math.hypot(g.vx, g.vz) < 0.6 && Math.abs(g.vy) < 0.8) {
          g.rest = 1;
          g.m.rotation.set(Math.PI / 2, g.m.rotation.y, 0);   // лёг плашмя
          if (g.soft) g.m.position.y = fl + 0.15;
          else if (g.flesh) decal(g.m.position.x, g.m.position.z, 0x8f1f2b, rand(0.6, 1.1), 50);   // кровь — только у людей, не у знаков и сугробов
        }
      }
    } else {
      // лежит и подтекает
      g.bleed -= dt;
      if (g.bleed <= 0) {
        g.bleed = rand(1.6, 3.4);
        decal(g.m.position.x + rand(-0.6, 0.6), g.m.position.z + rand(-0.6, 0.6), 0x8f1f2b, rand(0.4, 0.9), 40);
      }
    }
    // лежит «в отключке»: звёздочки над головой, в конце — облачко пыли
    if (g.soft && g.rest && (g.starT -= dt) <= 0) { g.starT = 0.7; emote(g.m.position.x, 0.9, g.m.position.z, 'star', 1); }
    g.life -= g.soft ? dt : dt * GFX.gibFade();     // «в отключке» лежит как лежал; куски и обломки на «меньше» тают быстрее
    if (g.life < 1) g.m.scale.setScalar(Math.max(0.001, g.life));
    if (g.soft && g.life <= 0) puff(g.m.position.x, 0.3, g.m.position.z, false, 0.8);
    if (g.life <= 0) { scene.remove(g.m); g.m.geometry.dispose(); if (g.m.material !== HUMAN_VC) g.m.material.dispose(); GORE.splice(i, 1); }
  }
}

function runOver (p, vx, vz) {
  const victim = p.person;
  const wasTarget = checkVictim(p);
  p.dead = 1; p.deadT = rand(18, 26);
  p.fly = null; p.fall = null;
  p.grp.visible = false;
  gibHuman(p, vx, vz);
  S.people++;
  Snd.squish();
  // карьера: сбил своего клиента — заказ сорван и штраф в цену его заказа (CLIENT_KILL); со смены снимают, только если END_SHIFT
  if (wasTarget && CAREER) { CAREERM.clientKilled(victim, clientFee(p)); setTimeout(() => { if (isPlaying()) CHAT.react('kill'); }, 1200); if (ECON.CLIENT_KILL.END_SHIFT) gameOver('сбил клиента', victim ? [victim] : [], { x: p.x, z: p.z }); }
  else if (wasTarget) gameOver('не доставил', victim ? [victim] : [], { x: p.x, z: p.z });
}

/* Снос: лавочка разлетается досками, столб заваливается набок и гаснет. */
function knockProp (p, nx, nz, force) {
  if (p.down) return;
  p.down = 1;
  sparks(p.x, 0.8, p.z, 8, nx, nz);

  if (p.kind === 'bench') {
    scene.remove(p.pivot);
    const c = Math.cos(p.ry), sn = Math.sin(p.ry);
    for (let i = 0; i < 7; i++) {
      const plank = i < 5;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(plank ? rand(0.5, 1.1) : 0.18, plank ? 0.16 : 0.5, plank ? 0.5 : 0.6),
        propMat(plank ? '#8a6b4e' : '#5c5560'));
      m.position.set(p.x + c * rand(-1.2, 1.2), groundH(p.x, p.z) + rand(0.5, 1.1), p.z - sn * rand(-1.2, 1.2));
      m.rotation.set(rand(0, 6), p.ry, rand(0, 6));
      scene.add(m);
      GORE.push({
        m, vx: nx * rand(2, 7) + rand(-3, 3), vy: rand(2.5, 6), vz: nz * rand(2, 7) + rand(-3, 3),
        spin: rand(-10, 10), life: rand(14, 20), bleed: 1e9, rest: 0,
      });
    }
    Snd.fx('smash', s => s.noise(0.25, 0.3), { x: p.x, z: p.z });
    return;
  }

  // столб валится в ту сторону, куда его ударили
  TILT_AXIS.set(-nz, 0, nx).normalize();
  p.ax = TILT_AXIS.x; p.az = TILT_AXIS.z;
  p.tiltV = 2.6 + clamp(force, 0, 30) * 0.09;
  const bulb = p.inner.userData.bulb;
  if (bulb) bulb.material = new THREE.MeshBasicMaterial({ color: 0x2e2b33 });
  for (const b of p.inner.userData.bulbs || []) b.material = LIGHT_OFF;
  Snd.fx('pole', s => { s.noise(0.35, 0.34); s.blip(120, 0.2, 'sawtooth', 0.16); }, { x: p.x, z: p.z });
}

function updateProps (dt) {
  for (const p of PROPS) {
    if (!p.down || p.tilt >= 1.45) continue;
    p.tilt = Math.min(1.45, p.tilt + p.tiltV * dt);
    p.tiltV += 5 * dt;                       // разгоняется, пока падает
    TILT_AXIS.set(p.ax, 0, p.az);
    p.pivot.quaternion.setFromAxisAngle(TILT_AXIS, p.tilt);
    if (p.tilt >= 1.45) sparks(p.x + p.ax * 2, 0.4, p.z + p.az * 2, 4);
  }
}

/* ─────────────── светофоры ───────────────
   Где стоят и как переключаются — посчитано в графе (SIG_GROUPS, TL).
   Здесь сами столбы: на правом тротуаре у стоп-линии, а над широкой
   улицей — на Г-образной консоли, чтобы голову было видно из любой
   полосы. Лампы делят материалы по фазам: переключить весь город —
   шесть строчек. */

const LAMP_ON = { r: 0xe8323c, y: 0xffc63d, g: 0x3fd15e };
const LAMP_DIM = { r: 0x4a2226, y: 0x4a3d20, g: 0x1f3a26 };
const LAMP = [0, 1].map(() => ({
  r: new THREE.MeshBasicMaterial({ color: LAMP_DIM.r }),
  y: new THREE.MeshBasicMaterial({ color: LAMP_DIM.y }),
  g: new THREE.MeshBasicMaterial({ color: LAMP_DIM.g }),
}));
const LIGHT_OFF = new THREE.MeshBasicMaterial({ color: 0x2e2b33 });
const LIGHT_BODY = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });   // столб и головы — как propMat, цвет в вершинах (без сезонного шейдера SMASH_MAT)
/* лампы светофора — один меш на столб (10.10.2026): у каждой лампы в вершинах «чья она» — красный канал у
   красной, зелёный у жёлтой, синий у зелёной; цвет берётся из LAMP[фаза] (updateLights красит их, как раньше) */
const BULB = [0, 1].map(ph => {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uLR = { value: LAMP[ph].r.color }; sh.uniforms.uLY = { value: LAMP[ph].y.color }; sh.uniforms.uLG = { value: LAMP[ph].g.color };
    sh.fragmentShader = 'uniform vec3 uLR, uLY, uLG;\n' + sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb = uLR * vColor.r + uLY * vColor.g + uLG * vColor.b;');
  };
  m.customProgramCacheKey = () => 'tl-bulbs';
  return m;
});

const LIGHT_AT = [];                              // где уже стоят столбы светофоров
function buildLights () {
  const bulbGeo = new THREE.SphereGeometry(0.17, 8, 6);
  for (const g of SIG_GROUPS)
    for (const e of g.app) {
      const B = NODES[e.b];
      const off = e.w / 2 + 0.9;
      const x = B.x - e.ux * e.stopAt + e.rx * off, z = B.z - e.uz * e.stopAt + e.rz * off;
      if (!inBounds(x, z, -60)) continue;
      const ry = Math.atan2(-e.ux, -e.uz);               // голова смотрит на тех, кто подъезжает
      // Большой перекрёсток в карте — несколько узлов, и у каждого свой
      // въезд: столбы вставали частоколом и прямо на полотне. Второй столб
      // в ту же сторону ближе восьми метров и столб на асфальте не ставим.
      const on = nearestRoad(x, z, 7, 1);
      if (on && on.d < on.seg.w / 2 - 0.3) continue;
      if (LIGHT_AT.some(q => (q[0] - x) ** 2 + (q[1] - z) ** 2 < 64 && Math.abs(Math.atan2(Math.sin(q[2] - ry), Math.cos(q[2] - ry))) < 0.7)) continue;
      LIGHT_AT.push([x, z, ry]);
      const arm = e.w >= 10 ? Math.min(e.w / 2 + 0.9 - laneOff(e, 0) + 1.4, e.w * 0.7) : 0;
      /* светофор — 2 меша (10.10.2026, вызовы отрисовки на Деке): столб, консоль, головы и козырьки — одной
         склейкой с цветом в вершинах; все лампы — второй (BULB фазы). Было 8 мешей, с консолью — 16:
         на большом перекрёстке — под сотню вызовов */
      addProp(x, z, ry, 'light', gr => {
        const parts = [], lit = [], SEL = { r: '#ff0000', y: '#00ff00', g: '#0000ff' };
        box(parts, 0.24, arm ? 6.4 : 4.4, 0.24, '#4e4a55', 0, arm ? 3.2 : 2.2, 0);
        const head = (hx, hy) => {
          box(parts, 0.55, 1.55, 0.42, '#2f2b36', hx, hy, 0.05);
          for (const [k, dy] of [['r', 0.46], ['y', 0], ['g', -0.46]]) {
            put(lit, bulbGeo.clone(), SEL[k], hx, hy + dy, 0.26);
            box(parts, 0.62, 0.06, 0.3, '#2f2b36', hx, hy + dy + 0.2, 0.36);
          }
        };
        head(0.3, 3.1);
        if (arm) {
          // консоль над полосами: вторая голова висит над дорогой
          box(parts, arm, 0.18, 0.18, '#4e4a55', -arm / 2, 6.3, 0);
          head(-arm + 0.2, 5.4);
        }
        gr.add(new THREE.Mesh(mergeGeos(parts), LIGHT_BODY));
        const b = new THREE.Mesh(mergeGeos(lit), BULB[e.sig.ph]);
        gr.add(b);
        gr.userData.bulbs = [b];                     // сбили — LIGHT_OFF (knockProp)
      }, 0.8);
    }
}

function updateLights (dt) {
  TL.t += dt;
  if (TL.t > TL_PLAN[TL.i][2]) { TL.t = 0; TL.i = (TL.i + 1) % TL_PLAN.length; }
  for (const ph of [0, 1]) {
    const st = lightOf(ph);
    // жёлтый мигает перед красным, зелёный последние секунды — тоже
    const blink = st === 'g' && TL_PLAN[TL.i][2] - TL.t < 2.5 && Math.floor(TL.t * 3) % 2;
    for (const k of ['r', 'y', 'g'])
      LAMP[ph][k].color.setHex(st === k && !blink ? LAMP_ON[k] : LAMP_DIM[k]);
  }
}

/* Пешеходы не должны проходить друг сквозь друга. Перебирать всех со
   всеми дорого, поэтому раскладываем их по клеткам пять на пять метров
   и смотрим только соседние. Сидящих не трогаем. */
const WGRID = new Map();

function separateWalkers (dt) {
  WGRID.clear();
  const all = [];
  for (const p of PEOPLE) if (!p.dead) all.push(p);
  for (const p of PEDS) if (!p.dead) all.push(p);
  for (const p of all) {
    const k = Math.floor(p.x / 5) * 4099 + Math.floor(p.z / 5);   // число, а не строка «x,z»: без мусора в каждом кадре (город ±4 км — клеток по 5 м меньше 2049)
    let b = WGRID.get(k);
    if (!b) WGRID.set(k, b = []);
    b.push(p);
  }
  for (const p of all) {
    if (p.sitting || (p.idle && p.idle.phase === 'sit')) continue;
    const ci = Math.floor(p.x / 5), cj = Math.floor(p.z / 5);
    let moved = false;
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++) {
        const b = WGRID.get(i * 4099 + j);
        if (!b) continue;
        for (const q of b) {
          if (q === p) continue;
          const dx = p.x - q.x, dz = p.z - q.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 0.81 || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), k2 = (0.9 - d) / d * 0.45;
          p.x += dx * k2; p.z += dz * k2;
          moved = true;
        }
      }
    if (moved) {
      pushOut(p, 0.45);
      p.grp.position.x = p.x;
      p.grp.position.z = p.z;
    }
  }
}

/* ─────────────── трафик ───────────────
   Машина едет по своей полосе от края перекрёстка до края, а через
   перекрёсток — дугой Безье из своей полосы в полосу следующей улицы.
   На односторонней улице против движения не поедет, на красный стоит
   у стоп-линии, перед зеброй пропускает тех, кто уже вышел на дорогу.
   Каждая третья — жёлтое такси: гонит быстрее и встаёт у бордюра где
   попало, с аварийкой. */

const TRAFFIC = [];
const CAR_HEX = ['#7fa8e0', '#8fd0a4', '#e6dfd2', '#d99ab8', '#e8cf8a', '#b9a7dd', '#f2f2ee', '#3c4048', '#9aa6b8', '#c85a4f'];
const MODELS = ['sedan', 'sedan', 'hatch', 'hatch', 'hatch', 'smart', 'suv', 'suv', 'cn', 'cn', 'cn'];   // cn — китайцы, каждая четвёртая
const TAXI_HEX = '#ffc400';

function newCar (parked) {
  const night = !parked && trafficNight();          // ночью редкие машины — быстрые, такси через одну (econ.js TRAFFIC)
  const taxi = !parked && chance(night ? ECON.TRAFFIC.NIGHT_TAXI : 0.3);
  const model = taxi ? pick(['sedan', 'hatch', 'suv', 'cn']) : pick(MODELS);
  // Поток — лёгкие машины (один-два меша вместо двадцати), как на парковке:
  // полную модель с мнущимися панелями ставим, когда задели (fullCar).
  // Такси — тоже лёгкие (три меша: кузов с шашечками, фары, надпись; аварийка — четвёртый, мигает)
  const mesh = makeCarLite(taxi ? TAXI_HEX : pick(CAR_HEX), model, taxi);
  return carObj(mesh, model, taxi, !!parked, (taxi ? rand(12, 17) : rand(9, 14)) * (night ? ECON.TRAFFIC.NIGHT_SPEED : 1), 100, rand(8, 30));
}
/* Машина в TRAFFIC — сразу со ВСЕМИ полями, в одном порядке, даже с теми, что потом заводят другие
   модули (коневозка, самосвал, бургер-машина, лось, пробка, погоня, скорая, мопед…). Значения — те же,
   что были бы «до появления поля» (undefined / 0 там, где читают через `|| 0`).
   Зачем (09.10.2026, хвост кадров на Деке): раньше поле дописывалось на ходу — у объекта менялась
   скрытая форма V8, и весь оптимизированный код, что трогает машины (поток, скорая, конкуренты,
   радар, удары, прохожие), выбрасывался — 10—15 раз за 30 с; кадры после этого шли медленным кодом
   и сорили памятью (~15 МБ/с). Новое поле машины — дописать сюда, а не только в свой модуль. */
let CAR_NUM = null;                               // числовые поля машины — «дробные» с рождения (dbl у V)
function carObj (mesh, model, taxi, parked, cruise, hp, stopCd) {
  const t = {
    mesh, model, taxi, hl: mesh.userData.hl, parked,
    e: null, s: 0, lane: 0, turn: null, cruise, speed: 0,
    x: 0, z: 0, h: 0, wheel: 0, hp, wreck: 0, wreckT: 0, hitT: 0,
    knock: 0, kvx: 0, kvy: 0, kvz: 0, spin: 0, y: 0, roll: 0, smokeT: 0,
    rejoin: 0, jx: 0, jz: 0, jh: 0, waitT: 0, ghost: 0, pull: 0, stopT: 0, stopCd,
    gy: undefined, rollV: 0, nar: 0, chainT: 0, stalled: 0, stallT: 0, angry: 0, moved: 0, driver: null, gone: 0,
    accident: 0, lux: 0, onBoom: undefined, _lag: 0, _lk: undefined,
    // службы и погоня (newSvc, chaseStart): у потока — пусто
    svc: undefined, path: undefined, pi: 0, goal: undefined, arrived: 0, repath: 0, acc: undefined, corner: undefined, gap: undefined, peds: undefined,
    dot: undefined, aggr: 0, passT: 0, honkT: 0, stuckT: 0, ramCd: 0, rival: undefined, onWreck: undefined, chase: undefined, cruise0: 0, dbg: undefined,
    // другие модули: самосвал (construction.js), бургер-машина (rivals.js), коневозка (horsebox.js), лось (fauna.js), пробка (roadlife.js), мопед (mopeds.js)
    cnRoll: 0, dump: undefined, rvRoll: 0, hbRoll: 0, bcar: undefined, rvGoal: undefined, rvHome: undefined, rvTrips: 0, hb: undefined, tow: 0,
    mooseT: 0, mooseN: 0, mooseHonk: 0, rlPull: 0, rlGo: 0, rlJam: undefined, rlWait: 0, rlOut: 0, mp: undefined,
    bus: undefined,                                // автобус (buses.js): маршрут, остановка, двери — у потока пусто
  };
  return dbl(t, CAR_NUM || (CAR_NUM = Object.keys(t).filter(k => typeof t[k] === 'number' || k === 'cruise' || k === 'hp' || k === 'stopCd')));
}

/* Трафик по часам (econ.js TRAFFIC, docs/SEVERSK.md): сколько машин в потоке — по часам
   игры (те же часы, что на приборке). Раз в STEP_S секунд — плюс или минус одна машина.
   Рождается только за HIDE_R м, убирается там же или вне кадра камеры дальше 40 м —
   на глазах никто не появляется и не исчезает. Сильно не хватает или лишние (> 6:
   смена началась ночью / утром) — шаги чаще, по 0,3 с. */
const trafficHour = () => { try { return dashHour(ENV.t) % 24; } catch (e) { return 12; } };   // до объявления ENV (первая расстановка) — полдень
function trafficNight () { const h = trafficHour(), [a, b] = ECON.TRAFFIC.NIGHT; return h >= a && h < b; }
const trafficWant = () => Math.round(ECON.trafficAt(trafficHour()) * (TOUCH ? ECON.TRAFFIC.TOUCH_K : 1));
const isFlow = t => !t.parked && !t.svc && !t.gone && !t.chase && t.model !== 'moped' && !t.bus;   // автобусов своё число (buses.js)   // мопеды доставки — свои (mopeds.js)
const TDEN = { t: 2, want: 0, n: 0, fr: new THREE.Frustum(), m: new THREE.Matrix4(), sp: new THREE.Sphere(new THREE.Vector3(), 3.5) };
function trafficDensity (dt) {
  if (INTRO || (TDEN.t -= dt) > 0) return;
  let n = 0;
  for (const t of TRAFFIC) if (isFlow(t)) n++;
  const want = trafficWant(), T = ECON.TRAFFIC;
  TDEN.want = want; TDEN.n = n;
  TDEN.t = Math.abs(want - n) > 6 ? 0.3 : T.STEP_S;
  if (n < want) spawnTraffic(1, T.HIDE_R, 340);
  else if (n > want) {
    TDEN.fr.setFromProjectionMatrix(TDEN.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let far = null, fd = 0;
    for (const t of TRAFFIC) {
      if (!isFlow(t) || t.knock || t.wreck || t.driver || t.stalled || t.hitT > 0 || t.chainT > 0) continue;
      const d = Math.hypot(t.x - V.x, t.z - V.z);
      if (d < 40) continue;
      if (d < T.HIDE_R) { TDEN.sp.center.set(t.x, (t.gy || 0) + 1, t.z); if (TDEN.fr.intersectsSphere(TDEN.sp)) continue; }   // в кадре — не трогаем
      if (d > fd) { fd = d; far = t; }
    }
    if (far) svcGone(far);                         // из списка — в конце updateTraffic
  }
}

/* видно ли место курьеру: ближе 200 м или в кадре камеры. Машину потока оттуда не убираем и не
   переставляем — на глазах машины не исчезают (deadends.js, docs/CAREER.md «Тупики односторонних улиц») */
const flowShown = (x, z) => (x - V.x) ** 2 + (z - V.z) ** 2 < DEADENDS.DEADEND.HIDE ** 2 || CULL.inView(x, 1.2, z, 3);
/* ставим машину на случайную полосу рядом с курьером: не под капотом,
   но и не на другом конце карты */
function placeTraffic (t, rmin, rmax, why = 'other') {
  if (t.bus) { BUSES.relocate(t); return !t.gone; }   // автобус — только на свой маршрут (buses.js)
  if (t.e && t.mesh.parent) DEADENDS.counted(Math.sqrt((t.x - V.x) ** 2 + (t.z - V.z) ** 2), t.x, t.z, why, CULL.inView(t.x, (t.gy || 0) + 1, t.z, 3));   // счётчик перестановок на виду (deadends.js)
  const L = nodesNear(V.x, V.z, rmin, rmax);       // кольцо узлов — один раз на все попытки
  for (let k = 0; k < 24; k++) {
    const a = nodeFrom(L, V.x, V.z);
    const opts = NODES[a].nb.map(b => edgeOf(a, b)).filter(e => e.ok && e.c <= 5 && edgeRun(e) > 8 && !e.closed && !e.lock && NAR.flowOk(e, nodeDeg) && inBounds(NODES[e.b].x, NODES[e.b].z) && inBounds(NODES[e.a].x, NODES[e.a].z));
    if (!opts.length) continue;
    const e = pick(opts);
    t.e = e; t.s = rand(0, edgeRun(e) * 0.8); t.lane = (Math.random() * laneCount(e)) | 0; t.turn = null;
    t.rejoin = 0; t.pull = 0; t.stopT = 0;
    t.gy = undefined;              // высота — с нового места: со старой машину на мосту сажало на землю под настилом
    poseTraffic(t, 0);
    // не рождаться внутри другой машины — но и без места не оставаться
    if (k < 23 && TRAFFIC.some(o => o !== t && Math.hypot(o.x - t.x, o.z - t.z) < 7)) continue;
    return true;
  }
  return false;
}

function spawnTraffic (n, rmin = 40, rmax = 330) {
  for (let k = 0; k < n; k++) {
    const t = newCar(false);
    scene.add(t.mesh);
    TRAFFIC.push(t);
    placeTraffic(t, rmin, rmax);
  }
}

/* тень под машиной игрока (carshadow.js): по позе кузова; в прыжке — на земле под ним */
CSH.init(scene);
function carShadow () {
  const p = car.position, gy = V.air ? surfaceAt(V.x, V.z, V.y) + 0.15 : p.y;
  CSH.step(p.x, p.z, car.rotation.y, gy, p.y, car.rotation.x, car.rotation.z, ENV.night || 0, car.visible && car.parent === scene && V.sink === undefined, sun.position.x - V.x, sun.position.z - V.z);
}

/* На чём стоят колёса (04.10.2026): полотно, тротуар, газон и плитка нарисованы над рельефом
   (osmRoads: полотно 0,14—0,17 м, тротуар без бордюра 0,09—0,12, газон 0,04; плитка, площадки,
   парковки — tracks.js pavedLift), а машины ставились на сам рельеф — колёса уходили в асфальт
   на 15—18 см. Теперь кузов — на верх того, что под ним. Поднятый бордюр (0,28) — отдельно:
   у игрока V.kerb, чужие на тротуар не заезжают. На мосту — настил (surfaceAt), без добавки */
function paveLift (x, z) {
  const r = nearestRoad(x, z, 7, 1);
  let y = 0.03;
  if (r) {
    const s = r.seg, k = (7 - s.c) * 0.004;
    if (s.b) return r.d < s.w / 2 + 4 ? 0 : y;
    if (r.d < s.w / 2 + 0.1) return 0.14 + k;
    if (r.d < s.w / 2 + (s.c <= 5 ? 2.75 : 1)) y = 0.09 + k;
  }
  return Math.max(y, TRK.pavedLift(x, z));
}

/* Машину ставим на то, по чему она едет, и наклоняем по склону:
   высоту берём под передними и задними колёсами. */
function poseOnSlope (t) {
  const k = (t.hl || 2) * 0.72;
  const hx = Math.sin(t.h) * k, hz = Math.cos(t.h) * k;
  t.gy = surfaceAt(t.x, t.z, t.gy);
  const f = surfaceAt(t.x + hx, t.z + hz, t.gy), b = surfaceAt(t.x - hx, t.z - hz, t.gy);
  t.mesh.position.set(t.x, t.gy + paveLift(t.x, t.z), t.z);   // колёса — на асфальт, а не в него (paveLift)
  t.mesh.rotation.set(-Math.atan((f - b) / (2 * k)), t.h, 0);
}

/* точка полосы на ребре: s — сколько проехали от края перекрёстка */
function lanePoint (e, lane, s, extra) {
  const A = NODES[e.a], o = laneOff(e, lane) + (extra || 0), d = e.tA + s;
  return [A.x + e.ux * d + e.rx * o, A.z + e.uz * d + e.rz * o];
}

function bez (T, q) {
  const u = 1 - q;
  if (T.p3) {                                      // разворот в тупике — кубическая: касательные по улице на обоих концах (startTurn)
    const a = u * u * u, b = 3 * u * u * q, c = 3 * u * q * q, f = q * q * q;
    return [a * T.p0[0] + b * T.p1[0] + c * T.p2[0] + f * T.p3[0], a * T.p0[1] + b * T.p1[1] + c * T.p2[1] + f * T.p3[1]];
  }
  return [u * u * T.p0[0] + 2 * u * q * T.p1[0] + q * q * T.p2[0],
          u * u * T.p0[1] + 2 * u * q * T.p1[1] + q * q * T.p2[1]];
}

function poseTraffic (t, dt) {
  let lx, lz, lh;
  if (t.turn) {
    const T = t.turn, q = clamp(T.q, 0, 1);
    [lx, lz] = bez(T, q);
    let dx, dz;
    if (T.p3) {
      const u = 1 - q;
      dx = 3 * u * u * (T.p1[0] - T.p0[0]) + 6 * u * q * (T.p2[0] - T.p1[0]) + 3 * q * q * (T.p3[0] - T.p2[0]);
      dz = 3 * u * u * (T.p1[1] - T.p0[1]) + 6 * u * q * (T.p2[1] - T.p1[1]) + 3 * q * q * (T.p3[1] - T.p2[1]);
    } else {
      dx = 2 * (1 - q) * (T.p1[0] - T.p0[0]) + 2 * q * (T.p2[0] - T.p1[0]);
      dz = 2 * (1 - q) * (T.p1[1] - T.p0[1]) + 2 * q * (T.p2[1] - T.p1[1]);
    }
    lh = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : t.h;
  } else {
    const e = t.e;
    [lx, lz] = lanePoint(e, t.lane, t.s, t.pull + (t.nar || 0));   // nar — прижался вправо на узкой (narrow.js)
    lh = Math.atan2(e.ux, e.uz);
  }
  // После кувырка машина не прыгает обратно в полосу, а доезжает до неё
  // за пару секунд с того места, где легла.
  if (t.rejoin > 0) {
    t.rejoin = Math.max(0, t.rejoin - (dt || 0) * 0.7);
    const k = t.rejoin;
    lx = lerp(lx, t.jx, k);
    lz = lerp(lz, t.jz, k);
    const dh = Math.atan2(Math.sin(t.jh - lh), Math.cos(t.jh - lh));
    lh += dh * k;
  }
  t.x = lx; t.z = lz; t.h = lh;
  poseOnSlope(t);
  if (dt) {
    t.wheel += t.speed * dt / 0.46;
    for (const w of t.mesh.userData.wheels) w.rotation.x = t.wheel;
    for (const s of t.mesh.userData.steer) s.rotation.y = damp(s.rotation.y, t.turn ? clamp(t.turn.bend * 0.5, -0.5, 0.5) : 0, 8, dt);
  }
}

/* Куда свернуть на перекрёстке. Прямо — охотнее, в сторону — реже,
   назад — только из тупика. Во дворы трафик не заезжает. */
function nextEdge (e) {
  const opts = [];
  let sum = 0;
  for (const c of NODES[e.b].nb) {
    if (c === e.a) continue;
    const n = edgeOf(e.b, c);
    if (!n.ok || n.c > 5 || n.closed || n.lock || !NAR.flowOk(n, nodeDeg)) continue;    // самые узкие — в одну сторону (narrow.js); closed — ремонт (roadlife.js), lock — закрытый район
    if (!inBounds(NODES[c].x, NODES[c].z, -40)) continue;   // за рамку не уезжаем
    const dot = e.ux * n.ux + e.uz * n.uz;
    const w = 0.35 + Math.max(0, dot) * 2.2 + (n.c <= 3 ? 0.6 : 0);
    opts.push([n, w]); sum += w;
  }
  if (!opts.length) {
    const back = edgeOf(e.b, e.a);
    if (back.uturn) DEADENDS.ST.uturns++;          // одностороння в тупик — разворот (deadends.js)
    return back.ok ? back : null;
  }
  let r = Math.random() * sum;
  for (const [n, w] of opts) if ((r -= w) <= 0) return n;
  return opts[opts.length - 1][0];
}

/* дуга через перекрёсток: из конца своей полосы в начало следующей */
function startTurn (t, over) {
  const e = t.e, n = (t.bus && BUSES.nextEdge(t, e)) || (t.dump && CONSTR.nextEdge(t, e)) || (t.rvGoal && RIVS.nextEdge(t, e)) || nextEdge(e);   // автобус — по маршруту (buses.js)   // самосвал сворачивает к стройке (construction.js)
  if (!n) {
    // с конца улицы ехать некуда (ремонт перекрыл выезд): рядом с курьером — стоит у конца и ждёт,
    // переставить можно только вдали (deadends.js: на глазах машины не исчезают)
    if (!t.bus && !DE_API.dry && (t.x - V.x) ** 2 + (t.z - V.z) ** 2 < DEADENDS.DEADEND.HIDE ** 2) {
      if (t.speed > t.cruise * 0.5) DEADENDS.ST.waits++;   // доехал и встал (дальше — стоит, скорость не набирает)
      t.s = edgeRun(e); t.speed = 0; return;
    }
    placeTraffic(t, 120, 340, 'turn'); return;
  }
  const lane = clamp(t.lane, 0, laneCount(n) - 1);
  // Разворот в тупике (deadends.js): на узкой оба конца дуги на оси — машину развернуло бы на месте рывком.
  // Новая полоса — у правого бордюра (nar, к оси возвращается плавно — narrow.js relax), дуга — кубическая
  // петля вперёд, касательные по улице на обоих концах; едет медленно (updateTraffic: ut)
  const back = n.b === e.a, ut = back || e.ux * n.ux + e.uz * n.uz < -0.7;   // разворот или почти (> 135°)
  const nar2 = back ? Math.max(0, Math.max(0, e.w / 2 - 1.1) - laneOff(n, lane)) : 0;
  const p0 = lanePoint(e, t.lane, edgeRun(e), t.nar || 0), p2 = lanePoint(n, lane, 0, nar2);
  t.nar = 0;
  if (ut) {
    const lat = (p2[0] - p0[0]) * e.rx + (p2[1] - p0[1]) * e.rz, k = Math.max(2.5, Math.hypot(p2[0] - p0[0], p2[1] - p0[1]) * 0.7);
    const T = { p0, p1: [p0[0] + e.ux * k, p0[1] + e.uz * k], p2: [p2[0] - n.ux * k, p2[1] - n.uz * k], p3: p2, q: 0, len: 0, next: n, lane, bend: lat < 0 ? -1 : 1, nar: nar2, ut: 1 };
    let prev = p0;
    for (let i = 1; i <= 12; i++) { const q = bez(T, i / 12); T.len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
    T.q = Math.min(0.9, over / T.len);
    t.turn = T;
    return;
  }
  // вершина дуги — пересечение двух полос; если они почти параллельны
  // или пересекаются где-то далеко — середина между концами с выносом
  const den = e.ux * n.uz - e.uz * n.ux;
  const d = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
  let p1 = null;
  if (Math.abs(den) > 0.2) {
    const a = ((p2[0] - p0[0]) * n.uz - (p2[1] - p0[1]) * n.ux) / den;
    const px = p0[0] + e.ux * a, pz = p0[1] + e.uz * a;
    const b = (px - p2[0]) * -n.ux + (pz - p2[1]) * -n.uz;
    if (a > 0 && b > 0 && a < d * 2 + 4 && b < d * 2 + 4) p1 = [px, pz];
  }
  if (!p1) p1 = [(p0[0] + p2[0]) / 2 + (e.ux - n.ux) * d * 0.25, (p0[1] + p2[1]) / 2 + (e.uz - n.uz) * d * 0.25];
  const T = { p0, p1, p2, p3: null, q: 0, len: 0, next: n, lane, bend: e.ux * n.uz - e.uz * n.ux, nar: 0, ut: 0 };
  let prev = p0;
  for (let k = 1; k <= 8; k++) { const q = bez(T, k / 8); T.len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  if (T.len < 0.4) { t.e = n; t.lane = lane; t.s = over; return; }
  T.q = over / T.len;
  t.turn = T;
}

function wreckCar (t) {
  if (t.wreck || t.bus) return;                   // автобус не горит (buses.js)
  if (t.onBoom) t.onBoom();
  fullCar(t);
  t.wreck = 1; t.wreckT = rand(11, 16); t.chainT = 0;
  t.speed = 0;
  boom(t.x, t.z);
  t.mesh.traverse(o => { if (o.isMesh && o.material.color) o.material.color.setHex(0x241f26); });
}

/* Удар отбрасывает машину по земле: юзом, с разворотом и небольшим
   подскоком, а не кувырком в небо. Крен — пружина: качнуло и вернуло. */
function knockCar (t, nx, nz, force) {
  if (t.bus) return;                              // автобус не отбросить (buses.js)
  const f = clamp(force, 6, 60);
  t.knock = 1;
  t.kvx = nx * f * 0.95 + t.kvx * 0.3;
  t.kvz = nz * f * 0.95 + t.kvz * 0.3;
  t.kvy = clamp(f * 0.1, 1, 4.2);
  t.spin = rand(-1, 1) * (1.4 + f * 0.07);
  t.rollV = (t.rollV || 0) + rand(-1, 1) * Math.min(2.2, f * 0.06);
  t.speed = 0;
}

/* Прицепляем упавшую машину к ближайшей полосе, куда смотрит её нос,
   и запоминаем позу, с которой она будет возвращаться. */
function rejoinRoad (t) {
  if (t.svc) { t.repath = 1; t.turn = null; t.rejoin = 0; t.speed = 0; return; }   // у скорой и курьеров свой маршрут
  const road = nearestRoad(t.x, t.z, 5, 2);
  let e = road && road.seg.na !== undefined ? edgeOf(road.seg.na, road.seg.nb) : null;
  if (e) {
    if (!e.ok || e.ux * Math.sin(t.h) + e.uz * Math.cos(t.h) < 0) {
      const r = edgeOf(e.b, e.a);
      if (r.ok) e = r;
    }
  }
  if (!e || !e.ok) { placeTraffic(t, 120, 340, 'rejoin'); return; }
  t.e = e; t.turn = null; t.lane = 0; t.pull = 0;
  t.s = clamp(((t.x - NODES[e.a].x) * e.ux + (t.z - NODES[e.a].z) * e.uz) - e.tA, 0, edgeRun(e) * 0.95);
  t.jx = t.x; t.jz = t.z; t.jh = t.h;
  t.rejoin = 1;
  t.speed = 0;
}

/* Узел в кольце вокруг курьера: не под капотом, но и не на другом конце
   города — иначе улицы вокруг стоят пустые. Ищем по клеткам вокруг. */
/* узлы в кольце rmin…rmax: { ok: [номера], best — ближайший к кольцу, если в кольце пусто }.
   «Внутри границы с запасом 8 м» у узла не меняется — считаем один раз (n.ib8): на больших
   перекрёстках в кольце 340 м тысячи узлов, и placeTraffic звал это до 24 раз подряд —
   рывки 20—70 мс на Деке, когда машины перерождались пачкой */
function nodesNear (x, z, rmin, rmax) {
  const ci = Math.floor(x / NCELL), cj = Math.floor(z / NCELL), R = Math.ceil(rmax / NCELL);
  const ok = [];
  let best = -1, bd = 1e9;
  for (let i = ci - R; i <= ci + R; i++)
    for (let j = cj - R; j <= cj + R; j++) {
      const a = NODE_GRID.get(i + ',' + j);
      if (!a) continue;
      for (const k of a) {
        const N = NODES[k];
        if (!N.nb.length) continue;
        if (N.ib8 === undefined) N.ib8 = inBounds(N.x, N.z, 8);
        if (!N.ib8) continue;
        const d = Math.hypot(N.x - x, N.z - z);
        if (d >= rmin && d <= rmax) { ok.push(k); continue; }
        const miss = d < rmin ? rmin - d : d - rmax;
        if (miss < bd) { bd = miss; best = k; }
      }
    }
  return { ok, best };
}
const nodeFrom = (L, x, z) => (L.ok.length ? pick(L.ok) : L.best >= 0 ? L.best : nearestNode(x, z));
function nodeNear (x, z, rmin, rmax) { return nodeFrom(nodesNear(x, z, rmin, rmax), x, z); }

function respawnTraffic (t, why = 'respawn') {
  if (t.bus) { BUSES.relocate(t); return; }      // автобус — на свой маршрут ближе к курьеру (buses.js)
  t.wreck = 0; t.knock = 0; t.hp = 100; t.y = 0; t.roll = 0; t.smokeT = 0; t.gy = undefined;
  t.stalled = 0; t.angry = 0; t.chainT = 0;
  if (t.driver) { scene.remove(t.driver.grp); t.driver.gone = 1; t.driver.dead = 1; t.driver = null; }
  scene.remove(t.mesh);
  // общие геометрии и материалы лёгких машин (шаблон модели, LITE_MAT…) не освобождаем: их рисуют другие машины
  t.mesh.traverse(o => { if (o.isMesh) { if (!o.geometry.userData.shared) o.geometry.dispose(); if (o.material.dispose && !o.material.userData.shared) o.material.dispose(); } });
  const fresh = newCar(false);
  Object.assign(t, { mesh: fresh.mesh, model: fresh.model, taxi: fresh.taxi, hl: fresh.hl, cruise: fresh.cruise });
  scene.add(t.mesh);
  HB.onRespawn(t);                                // старый прицеп долой, жребий на коневозку заново (horsebox.js)
  CONSTR.onRespawn(t);                            // и на самосвал (construction.js)
  RIVS.onRespawn(t);                              // была машиной-бургером — больше нет (rivals.js)
  // сразу ставим на новое место: иначе в следующем кадре машина всё ещё
  // числится за полкилометра и рождается заново — и так каждый кадр
  placeTraffic(t, 120, 340, why);
}

/* все, кто ходит и ездит по тротуарам: машины перед ними тормозят */
const walkersAll = () => [PEOPLE, PEDS, SCOOTS, AMB.medics, CREWS.WALKERS, LIFE.WALKERS];   // CREWS — компании в форме сетей (crews.js)

/* «прямо по курсу — кто-то есть»: тормозит машину потока AH.t до AH.slow. Одна функция на всех, а не
   замыкание на каждую машину в каждом кадре — меньше мусора (на Деке сборка мусора рвала кадры) */
const AH = { t: null, hx: 0, hz: 0, slow: 1 };
function aheadOf (ox, oz, gap, half, reach) {
  const t = AH.t, hx = AH.hx, hz = AH.hz, dx = ox - t.x, dz = oz - t.z;
  const fw = dx * hx + dz * hz;
  if (fw <= 0 || fw > reach) return false;
  if (Math.abs(-hz * dx + hx * dz) > half) return false;
  AH.slow = Math.min(AH.slow, clamp((fw - gap) / 7, 0, 1));
  return true;
}
function updateTraffic (dt0) {
  trafficDensity(dt0);
  let respN = 0;
  const WALK = walkersAll();                       // списки пешеходов — раз на кадр, а не на каждую машину
  for (const t of TRAFFIC) {
    // вдали — раз в N кадров с накопленным временем (графика «машины и люди вдали», gfx.js); летящие, погоня, службы — всегда
    const dt = t.knock || t.chase || t.svc ? dt0 : GFX.lag(t, dt0, V.x, V.z);
    if (!dt) continue;
    if (t.hitT > 0) t.hitT -= dt;
    if (t.chainT > 0 && !t.wreck && (t.chainT -= dt) <= 0) { t.chainT = 0; wreckCar(t); S.wrecks++; }
    // укатилась за полкилометра — возвращаем в соседние кварталы
    if (!t.parked && !t.wreck && !t.knock && !t.driver && !t.svc &&
        (t.x - V.x) * (t.x - V.x) + (t.z - V.z) * (t.z - V.z) > 520 * 520) { if (respN < 2) { respN++; respawnTraffic(t, 'far'); } continue; }   // не больше двух за кадр: после прыжка (смерть, новая смена) машины перерождались пачкой по 15—20 — кадр 80—130 мс на Деке
    // сгоревшая, но ещё летящая сперва доигрывает падение
    if (t.wreck && !t.knock) {
      t.smokeT -= dt;
      if (t.smokeT <= 0) { t.smokeT = 0.25; puff(t.x, 1.4, t.z, true, rand(0.6, 1.1)); if (chance(0.4)) fire(t.x, 1.2, t.z); }
      if ((t.wreckT -= dt) <= 0 && !t.parked) {
        // сгоревшая на глазах не исчезает: тлеет, пока курьер ближе 200 м или она в кадре (deadends.js)
        if (t.svc && !t.chase) t.onWreck(t);
        else if (flowShown(t.x, t.z)) { t.wreckT = 1; DEADENDS.ST.kept++; }
        else if (t.svc) t.onWreck(t); else respawnTraffic(t, 'wreck');
      }
      else if (t.wreckT <= 0 && t.accident && !t.gone) svcGone(t);
      continue;
    }
    if (t.knock) {
      // пока летит и кувыркается, ей никто не управляет
      if (t.wreck) { t.smokeT -= dt; if (t.smokeT <= 0) { t.smokeT = 0.25; puff(t.x, 1.4, t.z, true, rand(0.6, 1.1)); } }
      t.kvy -= 22 * dt;
      t.x += t.kvx * dt; t.z += t.kvz * dt; t.y += t.kvy * dt;
      // в дом не въезжает — тормозит об стену
      const bx = t.x, bz = t.z;
      pushOut(t, 1.1);
      if (bx !== t.x || bz !== t.z) { t.kvx *= 0.4; t.kvz *= 0.4; }
      t.gy = surfaceAt(t.x, t.z, t.gy);            // t.y — высота над тем, что под ней
      t.h += t.spin * dt;
      t.rollV = (t.rollV || 0) - t.roll * 14 * dt;
      t.rollV *= Math.exp(-3 * dt);
      t.roll = clamp(t.roll + t.rollV * dt, -0.55, 0.55);
      const onGround = t.y <= 0;
      if (onGround) {
        if (t.kvy < -3) sparks(t.x, 0.3, t.z, 4);
        t.y = 0; t.kvy = t.kvy < -3 ? -t.kvy * 0.2 : 0;
        // юз по асфальту: скорость и вращение гаснут
        const sp = Math.hypot(t.kvx, t.kvz), k = Math.max(0, sp - 11 * dt) / (sp || 1);
        t.kvx *= k; t.kvz *= k; t.spin *= Math.exp(-2.2 * dt);
        if (sp > 4 && Math.random() < dt * 12) puff(t.x, 0.2, t.z, false, 0.35);
        if (sp < 0.8 && Math.abs(t.roll) < 0.04) {
          t.knock = 0; t.roll = 0; t.rollV = 0; t.y = 0;
          poseOnSlope(t);
          if (t.angry && !t.wreck) { t.angry = 0; if (!chaseStart(t)) stallCar(t); }   // изредка — не выходит, а гонится
          else if (!t.parked && !t.stalled) rejoinRoad(t);
        }
      }
      // наклонённый кузов приподнимаем, иначе угол уходит под асфальт
      t.mesh.position.set(t.x, t.gy + t.y + Math.abs(Math.sin(t.roll)) * 0.9, t.z);
      t.mesh.rotation.set(0, t.h, t.roll);
      if (t.hp < 45) { t.smokeT -= dt; if (t.smokeT <= 0) { t.smokeT = 0.3; puff(t.x, 1.3, t.z, t.hp < 25, 0.6); } }
      continue;
    }
    if (t.hp < 45) { t.smokeT -= dt; if (t.smokeT <= 0) { t.smokeT = 0.45; puff(t.x, 1.3, t.z, t.hp < 25, 0.55); } }
    if (t.parked) { if (t.moved) { poseOnSlope(t); t.moved = 0; } continue; }
    if (t.stalled) {
      // стоит с аварийкой, пока водитель разбирается
      poseOnSlope(t);
      const hz3 = t.mesh.userData.hazard, on = Math.floor(tG * 2.5) % 2 === 0;
      if (hz3) for (const m of hz3) m.visible = on;
      if (!t.driver && (t.stallT -= dt) <= 0) { t.stalled = 0; for (const m of hz3 || []) m.visible = false; rejoinRoad(t); }
      continue;
    }
    if (t.chase) { chaseDrive(t, dt); continue; }
    if (t.svc) { svcDrive(t, dt); continue; }
    if (!t.e) { placeTraffic(t, 120, 340, 'none'); if (!t.e) continue; }

    // Тормозит перед всем, что стоит прямо по курсу — не только перед
    // своей полосой: упавшую поперёк машину объезжать не умеет, но и не таранит.
    const hx = Math.sin(t.h), hz = Math.cos(t.h);
    AH.t = t; AH.hx = hx; AH.hz = hz; AH.slow = 1;
    const ahead = aheadOf;
    let blocked = false;
    if (t.ghost > 0) t.ghost -= dt;
    else for (let oi = 0; oi < TRAFFIC.length; oi++) {     // по индексу: машин ~300 × 300 в кадре — без объектов-итераторов
      const o = TRAFFIC[oi];
      if (o === t || Math.abs(o.x - t.x) > 16 || Math.abs(o.z - t.z) > 16) continue;
      // встречную не ждём: она в своей полосе
      if (!o.knock && !o.parked && Math.sin(o.h) * hx + Math.cos(o.h) * hz < -0.3) continue;
      // клинч — только с тем, кто стоит поперёк; в попутной очереди просто ждём
      if (ahead(o.x, o.z, (t.hl || 2) + (o.hl || 2) + 1.4 + (o.tow || 0), 1.9, 15) &&   // tow — прицеп сзади (horsebox.js)
          Math.abs(Math.sin(o.h) * hx + Math.cos(o.h) * hz) < 0.85) blocked = true;
    }
    const bo = t.bus ? t.hl - 2 : 0;               // автобус длиннее: нос дальше от середины (buses.js)
    ahead(V.x, V.z, 6 + bo, 2.1 + bo * 0.1, 15 + bo);
    // пешеходы и самокатчики на полотне: пропускаем
    for (let li = 0; li < WALK.length; li++)
      for (let pi = 0, list = WALK[li]; pi < list.length; pi++) {
        const p = list[pi];
        if (p.dead || Math.abs(p.x - t.x) > 13 + bo || Math.abs(p.z - t.z) > 13 + bo) continue;
        ahead(p.x, p.z, 3.4 + bo, 1.8 + bo * 0.1, 12 + bo);
      }
    let slow = AH.slow;
    slow = Math.min(slow, FAUNA.trafficYield(t, dt));   // лось на полосе: тормозит, сигналит, ждёт (fauna.js)
    slow = Math.min(slow, PROT.trafficHold(t));          // колонна митингующих на полотне: стоят и ждут (protests.js)
    // красный: встаём у стоп-линии. Кто уже въехал — доезжает; на жёлтом
    // тот, кому до линии пара метров, тоже проезжает, а не тормозит в пол
    if (!t.turn && t.e.sig) {
      const e = t.e, st = lightOf(e.sig.ph);
      const toLine = e.len - e.stopAt - e.tA - t.s;
      if (st !== 'g' && toLine > -0.5 && toLine < 34 + bo && !(st === 'y' && toLine < 5 + bo && t.speed > 6))
        slow = Math.min(slow, clamp((toLine - 0.6 - bo) / 9, 0, 1));
    }
    // такси встаёт у бордюра: высадить, подобрать, посмотреть в телефон
    if (t.taxi && !t.turn) {
      const e = t.e, curb = e.w / 2 - 1.1 - laneOff(e, 0);
      if (t.stopT > 0) {
        t.pull = damp(t.pull, Math.max(0, curb), 2.5, dt);
        if (t.pull > curb - 0.3) { slow = 0; t.stopT -= dt; }
        else slow = Math.min(slow, 0.35);
      } else {
        t.pull = damp(t.pull, 0, 2, dt);
        t.stopCd -= dt;
        if (t.stopCd <= 0 && t.lane === 0 && e.c >= 3 && edgeRun(e) - t.s > 22 && !e.sig && curb > 0.4) {
          t.stopT = rand(3.5, 7); t.stopCd = rand(18, 45);
        }
      }
      const hz2 = t.mesh.userData.hazard;
      if (hz2 && hz2.length) { const on = t.stopT > 0 && Math.floor(tG * 2.5) % 2 === 0; for (const m of hz2) m.visible = on; }
    }
    if (t.bus) slow = Math.min(slow, BUSES.drive(t, dt));   // остановка: прижаться, двери, 4—8 с; поворотники; мягкий разгон (buses.js)
    slow = Math.min(slow, RL.hold(t, dt));        // пробка за аварией, ремонт (roadlife.js)
    if (t.turn ? t.turn.ut : t.e.trap && edgeRun(t.e) - t.s < 18) slow = Math.min(slow, 0.3);   // к концу тупика и в развороте — медленно (startTurn, deadends.js)
    if (!t.turn && NAR.narrow(t.e)) slow = Math.min(slow, NAR.step(t, dt, TRAFFIC, V));   // узкая: встречные прижимаются и сбавляют (narrow.js)
    else NAR.relax(t, dt);
    t.speed = damp(t.speed, t.cruise * slow, 3.2, dt);
    if (slow < 0.02) t.speed = 0;                 // иначе доползает за стоп-линию
    // встали из-за поперечной машины и стоим долго — значит, сцепились на
    // перекрёстке: пару секунд едем, не глядя на других (людей видим всегда)
    if (t.speed < 0.3 && blocked) { if ((t.waitT += dt) > 5) { t.ghost = 1.6; t.waitT = 0; } }
    else t.waitT = 0;

    const step = t.speed * dt;
    if (t.turn) {
      t.turn.q += step / t.turn.len;
      if (t.turn.q >= 1) {
        const over = (t.turn.q - 1) * t.turn.len;
        t.e = t.turn.next; t.lane = t.turn.lane; t.s = over; t.nar = t.turn.nar; t.turn = null;   // nar — после разворота у бордюра (startTurn)
      }
    } else {
      t.s += step;
      if (t.s >= edgeRun(t.e)) startTurn(t, t.s - edgeRun(t.e));
    }
    poseTraffic(t, dt);
  }
  for (let i = TRAFFIC.length - 1; i >= 0; i--) if (TRAFFIC[i].gone) TRAFFIC.splice(i, 1);
}

/* ─────────────── кофе у пиццерии ───────────────
   У входа всегда стоит кружок сотрудников с горячим кофе: отпивают, от
   стаканчиков идёт пар, болтают. Заказов не делают, никуда не уходят.
   Сбил — на месте встаёт другой: кружок не пустеет. (Раньше тут была
   курилка — табак площадки не пропускают.) */
const SMOKERS = [];
let SMOKE_SPOT = null;
/* завсегдатаи курилки: всегда тут и всегда рядом друг с другом —
   двое выдуманных, одни и те же на всю смену */
let SMOKE_REGULARS = null;

function initSmokers () {
  if (!SMOKE_SPOT) return;
  if (!SMOKE_REGULARS) SMOKE_REGULARS = [makePerson(), makePerson()];
  const { x, z } = SMOKE_SPOT;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.4;
    const regular = SMOKE_REGULARS[i] || null;
    const p = { person: regular || nextPerson(), regular, x: x + Math.sin(a) * 1.5, z: z + Math.cos(a) * 1.5, a, dead: 0, deadT: 0,
                ph: rand(0, 6), puffT: rand(0.5, 3), grp: null };
    smokerBody(p);
    SMOKERS.push(p);
  }
}

function smokerBody (p) {
  if (p.grp) dropMesh(p.grp);
  p.grp = makeHuman(p.person);
  // взрослая версия — сигарета, детская — стаканчик кофе с красной крышкой
  if (ADULT) {
    const cig = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), new THREE.MeshBasicMaterial({ color: 0xf4f1ea }));
    cig.position.set(0, -0.5, 0.12);
    p.grp.userData.armR.add(cig);
  } else {
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0xf4f1ea }));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 8), new THREE.MeshLambertMaterial({ color: 0xf0522a }));
  lid.position.y = 0.11; cup.add(lid);
  cup.position.set(0, -0.55, 0.1);
  p.grp.userData.armR.add(cup);
  }
  p.grp.position.set(p.x, groundH(p.x, p.z), p.z);
  p.grp.rotation.y = Math.atan2(SMOKE_SPOT.x - p.x, SMOKE_SPOT.z - p.z);   // лицом в кружок
  scene.add(p.grp);
}

function updateSmokers (dt) {
  for (const p of SMOKERS) {
    if (p.dead) {
      if ((p.deadT -= dt) <= 0) { p.dead = 0; p.person = p.regular || nextPerson(); smokerBody(p); }
      continue;
    }
    p.ph += dt;
    const u = p.grp.userData;
    // глоток: рука к лицу раз в несколько секунд
    const drag = Math.max(0, Math.sin(p.ph * 0.9)) ** 6;
    u.armR.rotation.x = -0.5 - drag * 1.7;
    u.armL.rotation.x = -0.2;
    u.head.rotation.y = Math.sin(p.ph * 0.4 + p.a) * 0.35;         // крутят головой — болтают
    if (p.shock > 0) shockStep(p, dt);
    if ((p.puffT -= dt) <= 0) {
      p.puffT = rand(1.4, 3.2);
      const fx = Math.sin(p.grp.rotation.y), fz = Math.cos(p.grp.rotation.y);
      if (ADULT) {
        // затяжка — облачко дыма у лица
        const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xe9e7e2, transparent: true, opacity: 0.5, depthWrite: false }));
        m.position.set(p.x + fx * 0.4, groundH(p.x, p.z) + 1.6, p.z + fz * 0.4);
        m.scale.setScalar(0.22);
        fxAdd(m, { vy: rand(0.5, 0.9), vx: fx * 0.4 + rand(-0.2, 0.2), vz: fz * 0.4 + rand(-0.2, 0.2), life: rand(1.4, 2.2), max: 2.2, grow: 1.3 });
      } else
      // пар от горячего кофе — маленький и у руки, а не облако у лица
      steam(p.x + fx * 0.35 + Math.cos(p.grp.rotation.y) * 0.3, 1.25, p.z + fz * 0.35 - Math.sin(p.grp.rotation.y) * 0.3);
    }
    // под колёсами — как все
    const dx = p.x - V.x, dz = p.z - V.z, fx = Math.sin(V.h), fz = Math.cos(V.h);
    if (Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35 && Math.hypot(V.vx, V.vz) > 3) {
      p.dead = 1; p.deadT = rand(25, 40);
      p.grp.visible = false;
      gibHuman(p, V.vx, V.vz);
      S.people++;
      Snd.squish();
    }
  }
}

/* ─────────────── злой водитель ───────────────
   Протаранил чужую машину — она не уезжает как ни в чём не бывало, а
   встаёт с аварийкой, и из неё выходит водитель. Бежит к тебе и бьёт
   по машине: мятины, искры, раз в пару секунд — минус сердце. Уехал
   дальше семидесяти метров или прошло полминуты — плюнул, вернулся за
   руль и поехал. Можно и задавить — но это уже совсем другая статья. */
const DRIVERS = [];
const RAGE = [$t('ты чё?!'), $t('куда прёшь!'), $t('стоять!'), $t('ну всё!'), $t('выходи!'), $t('я тебя запомнил'), $t('страховка есть?'), '!!!', $t('в глаза смотри!')];
/* облачко с руганью: белое, с красной обводкой, текст — пиксельным шрифтом */
function rageTex (text, col = '#d9342c') { return TALK.tex(text, col); }   // читаемая плашка (talk.js)

function stallCar (t) {
  t.stalled = 1; t.speed = 0; t.stallT = 30;
  const hx = Math.sin(t.h), hz = Math.cos(t.h);
  // выходит со стороны водителя: слева по ходу
  const x = t.x + hz * 1.4 - hx * 0.3, z = t.z - hx * 1.4 - hz * 0.3;
  const grp = makeHuman(null);
  grp.position.set(x, groundH(x, z), z);
  // злится: лицо багровое, над головой облачко с руганью
  const u = grp.userData;
  for (const m of [].concat(u.head.material)) m.color.set('#d8534a');
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: rageTex(pick(RAGE)), transparent: true, depthWrite: false }));
  bubble.scale.set(2.4, 1.2, 1);
  bubble.position.set(0, 2.55, 0);
  grp.add(bubble);
  TALK.track(bubble);
  scene.add(grp);
  const d = { t, grp, x, z, state: 'chase', hitT: 0.6, ph: 0, give: 28, dead: 0, punch: 0, strikes: 0, bubble, sayT: 1.6, bangT: 0.3 };
  t.driver = d;
  DRIVERS.push(d);
}

/* ─────────────── обиженный водитель гонится (econ.js CHASE) ───────────────
   Задел машину и уехал: когда её перестанет кувыркать, а ты уже дальше AWAY м, —
   изредка (P, не чаще раза в CD с) водитель не выходит ругаться, а гонится: гудит,
   над крышей «эй, стой!», на радаре — красная точка. Издали едет по улицам к тебе
   (маршрут как у скорой, svcDrive), ближе 40 м — прямо: заходит перед носом и бьёт
   по тормозам, разворачиваясь поперёк. Отстал (LOSE м) или вышло время — бросает,
   ты оторвался: ESCAPE ₽. Врезались — обычный удар по правилам hurtCar, и он остывает. */
const CHASE = { next: 0, n: 0 };
const CHASE_LINES = () => [$t('эй, стой!'), $t('а ну стой!'), $t('догоню!'), $t('эй, стой!')];
function chaseStart (t) {
  const C = ECON.CHASE;
  if (INTRO || t.parked || t.svc || t.wreck || tG < CHASE.next || !['drive', 'back', 'side'].includes(S.state)) return false;
  const d0 = Math.hypot(V.x - t.x, V.z - t.z);
  if (d0 < C.AWAY || d0 > C.LOSE * 0.6 || !(SBX.chase || chance(C.P))) return false;
  CHASE.next = tG + C.CD; CHASE.n++;
  fullCar(t);
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: rageTex(CHASE_LINES()[0]), transparent: true, depthWrite: false }));
  bubble.scale.set(3, 1.5, 1); bubble.position.set(0, 2.9, 0);
  t.mesh.add(bubble);
  TALK.track(bubble);
  t.chase = { T: rand(...C.T), brakeT: 0, brakeCd: 2, pathT: 0, stuckT: 0, sayT: 1.8, swerve: chance(0.5) ? 1 : -1, bubble };
  Object.assign(t, { svc: 'chase', aggr: 1, passT: 0, honkT: 0, acc: 7, corner: 0.55, gap: 1, peds: true, dot: '#ff3b30',
    cruise0: t.cruise, cruise: VMAX * C.VMAX_K, path: null, goal: { x: V.x, z: V.z }, repath: 1, turn: null, e: null });
  t.onWreck = () => { chaseEnd(t, 'wreck'); respawnTraffic(t, 'wreck'); };
  honk(t);
  toast($t('водитель обиделся — гонится за тобой!'));
  return true;
}
function chaseEnd (t, why) {
  const C = t.chase;
  if (!C) return;
  if (C.bubble.parent) C.bubble.parent.remove(C.bubble);
  C.bubble.material.map.dispose(); C.bubble.material.dispose();
  t.chase = null; t.svc = null; t.aggr = 0; t.dot = null; t.onWreck = null; t.path = null; t.goal = null;
  t.cruise = t.cruise0 || rand(9, 14); t.acc = 3;
  if (why === 'escaped' && S.state !== 'over') {
    const pay = CAREER ? ECON.CHASE.ESCAPE : Math.round(ECON.CHASE.ESCAPE / ECON.MONEY_K);
    if (pay > 0 && !S.freeRun) { S.money += pay; addWallet(pay); popPay(pay, [[$t('оторвался от погони'), pay, '']], $t('оторвался!')); }
    else toast($t('оторвался!') + ' · ' + $t('водитель отстал'));
  }
  if (why !== 'wreck' && !t.knock) rejoinRoad(t);
}
function chaseDrive (t, dt) {
  const C = t.chase, K = ECON.CHASE;
  C.T -= dt;
  const dx = V.x - t.x, dz = V.z - t.z, d = Math.hypot(dx, dz);
  if (!['drive', 'back', 'side', 'handover', 'brief', 'loading'].includes(S.state)) { chaseEnd(t, 'quit'); return; }
  if (C.T <= 0 || d > K.LOSE) { chaseEnd(t, d > 40 ? 'escaped' : 'quit'); return; }   // время вышло, а он рядом — просто бросил, без награды
  // ругается: облачко меняет текст, гудит
  if ((C.sayT -= dt) <= 0) {
    C.sayT = rand(1.6, 2.6);
    C.bubble.material.map.dispose(); C.bubble.material.map = rageTex(pick(CHASE_LINES())); C.bubble.material.needsUpdate = true;
    t.honkT = 0; honk(t);
  }
  C.bubble.position.x = Math.sin(tG * 40) * 0.05;
  const vp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  t.cruise = VMAX * K.VMAX_K;
  if (C.pathT > 0) C.pathT -= dt;
  if (d > 40 || C.pathT > 0) {
    // издали — по улицам, маршрут к тебе обновляем раз в 1,5 с
    if ((C.repT = (C.repT || 0) - dt) <= 0) { C.repT = 1.5; t.goal = { x: V.x + V.vx, z: V.z + V.vz }; t.repath = 1; }
    svcDrive(t, dt);
    return;
  }
  // вблизи — прямо: точка перед твоим носом; обогнал — тормозит поперёк
  const along = -(dx * fx + dz * fz), side = -(dx * fz - dz * fx);   // где он относительно тебя: вперёд / вбок
  if (C.brakeCd > 0) C.brakeCd -= dt;
  if (C.brakeT <= 0 && C.brakeCd <= 0 && along > 3.5 && along < 16 && Math.abs(side) < 2.4 && vp > 5) {
    C.brakeT = K.BRAKE_S; C.brakeCd = 5; t.honkT = 0; honk(t);
  }
  let want, th;
  if (C.brakeT > 0) {
    C.brakeT -= dt;
    want = 0;
    th = V.h + C.swerve * 0.55;                    // встаёт наискосок поперёк полосы
    t.speed = Math.max(0, t.speed - 16 * dt);
  } else {
    // сзади — уходит на соседнюю полосу (обгон), поравнялся — подрезает к твоей полосе
    const lead = clamp(d / 12, 0.3, 1.2), off = along < 2 ? 3.6 * C.swerve : clamp(3.6 - (along - 2) * 0.9, 0, 3.6) * C.swerve;
    const tx = V.x + V.vx * lead + fx * (along < 2 ? 4 : 8) + fz * off, tz = V.z + V.vz * lead + fz * (along < 2 ? 4 : 8) - fx * off;
    th = Math.atan2(tx - t.x, tz - t.z);
    want = Math.min(t.cruise, vp + K.CATCH + (along < -6 ? 4 : 0));
    if (along < 0 && along > -10 && Math.abs(side) < 2.2) want = Math.min(want, vp + 1);   // прямо за тобой — не таранит в зад, а выходит на обгон
    t.speed = damp(t.speed, want, want > t.speed ? t.acc : 5, dt);
  }
  const dh = Math.atan2(Math.sin(th - t.h), Math.cos(th - t.h)), rate = 3 * clamp(t.speed / 5, 0.4, 1.3);
  t.h += clamp(dh, -rate * dt, rate * dt);
  t.x += Math.sin(t.h) * t.speed * dt; t.z += Math.cos(t.h) * t.speed * dt;
  const bx = t.x, bz = t.z;
  pushOut(t, 1.1);                                 // в дом не въезжает
  if (bx !== t.x || bz !== t.z) t.speed *= 0.9;
  // упёрся (дом, забор) — пару секунд по улицам
  if (want > 3 && t.speed < 1.2) { if ((C.stuckT += dt) > 1.5) { C.stuckT = 0; C.pathT = 3; t.repath = 1; } } else C.stuckT = 0;
  t.wheel += t.speed * dt / 0.46;
  for (const w of t.mesh.userData.wheels || []) w.rotation.x = t.wheel;
  for (const s of t.mesh.userData.steer || []) s.rotation.y = damp(s.rotation.y, clamp(dh, -0.5, 0.5), 8, dt);
  poseOnSlope(t);
}

function updateDrivers (dt) {
  for (let i = DRIVERS.length - 1; i >= 0; i--) {
    const d = DRIVERS[i], t = d.t, u = d.grp.userData;
    if (d.dead || t.wreck) {
      if (!d.gone) { dropMesh(d.grp); d.gone = 1; }
      // водителя задавили — машина без хозяина так и стоит с аварийкой:
      // вести её некому. Раньше она тут же «оживала» и прыгала на полосу —
      // выглядело так, будто водитель превратился в машину
      t.driver = null;
      if (t.wreck) t.stalled = 0;
      else t.stallT = Infinity;
      DRIVERS.splice(i, 1);
      continue;
    }
    const dxV = V.x - d.x, dzV = V.z - d.z, dV = Math.hypot(dxV, dzV);
    d.give -= dt;
    if (d.state !== 'back' && (dV > 70 || d.give <= 0 || S.state === 'over' || S.state === 'title')) d.state = 'back';
    let tx, tz, spd = 0;
    if (d.state === 'chase') {
      if (dV < 2.6) d.state = 'hit';
      else { tx = V.x; tz = V.z; spd = 4.3; }
    } else if (d.state === 'hit') {
      if (dV > 3.4) d.state = 'chase';
      d.hitT -= dt;
      d.punch = Math.max(0, d.punch - dt * 4);
      if (d.hitT <= 0) {
        d.hitT = 0.75; d.punch = 1; d.strikes++;
        const hx = d.x + dxV * 0.6, hz = d.z + dzV * 0.6;
        dentCar(car, hx, hz, 8);
        sparks(hx, 1, hz, 5, -dxV / (dV || 1), -dzV / (dV || 1));
        Snd.fx('punch', s => s.blip(110, 0.08, 'square', 0.12), { x: hx, z: hz });
        S.shake = Math.max(S.shake, 0.18);
        if (d.strikes % 3 === 0) hurtCar(1, 14, hx, hz, 'person');
      }
      d.grp.rotation.y = damp(d.grp.rotation.y, Math.atan2(dxV, dzV), 10, dt);
    } else {
      // обратно за руль
      const dxC = t.x - d.x, dzC = t.z - d.z, dC = Math.hypot(dxC, dzC);
      if (dC < 1.6) {
        dropMesh(d.grp); d.gone = 1;
        DRIVERS.splice(i, 1);
        t.driver = null; t.stalled = 0;
        rejoinRoad(t);
        continue;
      }
      tx = t.x; tz = t.z; spd = 2.2;
    }
    if (spd) {
      const dx = tx - d.x, dz = tz - d.z, l = Math.hypot(dx, dz) || 1;
      d.x += dx / l * spd * dt; d.z += dz / l * spd * dt;
      pushOut(d, 0.45);
      d.ph += dt * spd * 3;
      d.grp.rotation.y = damp(d.grp.rotation.y, Math.atan2(dx, dz), 10, dt);
    }
    d.grp.position.set(d.x, groundH(d.x, d.z) + curbAt(d.x, d.z) + (spd ? Math.abs(Math.sin(d.ph)) * 0.08 : 0), d.z);
    // ругается: облачко меняет текст, вылетают красные «!», облачко дрожит
    if (d.state !== 'back') {
      if ((d.sayT -= dt) <= 0) {
        d.sayT = rand(1.3, 2.2);
        d.bubble.material.map = rageTex(pick(RAGE));
        d.bubble.material.needsUpdate = true;
      }
      if ((d.bangT -= dt) <= 0) { d.bangT = rand(0.35, 0.7); emote(d.x, 2.2, d.z, 'angry', 1); }
      d.bubble.userData.mute = 0;                  // показывает talk.js (ближние, не больше нескольких)
      d.bubble.position.x = Math.sin(tG * 40) * 0.05;
    } else d.bubble.userData.mute = 1;
    const sw = spd ? Math.sin(d.ph) * 0.9 : 0;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.armL.rotation.x = d.state === 'chase' ? -2.5 + Math.sin(tG * 18) * 0.3 : -sw * 0.8;   // кулаком трясёт
    u.armR.rotation.x = d.state === 'hit' ? -1.4 - d.punch * 0.9 : sw * 0.8;
    // задавить водителя — на скорости, как всех
    if (d.state !== 'back' || dV < 5) {
      const fx = Math.sin(V.h), fz = Math.cos(V.h), along = -dxV * fx - dzV * fz, across = -dxV * fz + dzV * fx;
      if (Math.abs(along) < CAR_L + 0.5 && Math.abs(across) < CAR_W + 0.35 && Math.hypot(V.vx, V.vz) > 3) {
        gibHuman(d, V.vx, V.vz);
        dropMesh(d.grp); d.gone = 1; d.dead = 1;
        S.people++;
        Snd.squish();
      }
    }
  }
}

/* ─────────────── машины с маршрутом: скорая и курьеры ───────────────
   Обычный трафик катается куда глаза глядят. Скорой и курьерам-
   соперникам нужно в конкретное место, поэтому у них свой маршрут:
   узлы кратчайшего пути, сдвинутые на правую полосу. Живут они в том же
   списке TRAFFIC — значит, таранить, взрывать и подбрасывать их можно
   так же, как всех, а трафик перед ними тормозит. */

const rightOf = (a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [-dz / l, dx / l];
};

function lanePath (x0, z0, x1, z1) {
  const nodes = RL.svcNodes(x0, z0, x1, z1) || routeNodes(x0, z0, x1, z1);   // в объезд ремонта (roadlife.js)
  const r0 = nearestRoad(x0, z0, DRIVE_MAX, 2), r1 = nearestRoad(x1, z1, DRIVE_MAX, 3);
  const st = r0 ? [r0.x, r0.z] : [x0, z0], en = r1 ? [r1.x, r1.z] : [x1, z1];
  // узел за точкой назначения (или за спиной на старте) не нужен: иначе
  // машина проскакивает мимо до перекрёстка и возвращается
  const onSeg = (q, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
    const k = ((q[0] - a.x) * dx + (q[1] - a.z) * dz) / l2;
    return k > 0 && k < 1 && Math.abs((q[0] - a.x) * dz - (q[1] - a.z) * dx) / Math.sqrt(l2) < 8;
  };
  while (nodes.length >= 2 && onSeg(en, nodes[nodes.length - 2], nodes[nodes.length - 1])) nodes.pop();
  while (nodes.length >= 2 && onSeg(st, nodes[1], nodes[0])) nodes.shift();
  const raw = [st];
  for (const n of nodes) raw.push([n.x, n.z]);
  raw.push(en);
  const pts = raw.filter((q, i) => i === 0 || Math.hypot(q[0] - raw[i - 1][0], q[1] - raw[i - 1][1]) > 2);
  if (pts.length < 2) return pts;
  // сдвиг на правую полосу; на изломе — по биссектрисе, чтобы полоса не сужалась
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const b = pts[i];
    const n1 = i > 0 ? rightOf(pts[i - 1], b) : null, n2 = i < pts.length - 1 ? rightOf(b, pts[i + 1]) : null;
    let nx = (n1 ? n1[0] : 0) + (n2 ? n2[0] : 0), nz = (n1 ? n1[1] : 0) + (n2 ? n2[1] : 0);
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const ref = n1 || n2, dot = Math.max(0.55, nx * ref[0] + nz * ref[1]);
    const r = nearestRoad(b[0], b[1], DRIVE_MAX, 1);
    const o = (r ? Math.min(1.9, r.seg.w / 4) : 1.3) / dot;
    out.push([b[0] + nx * o, b[1] + nz * o]);
  }
  return out;
}

function svcRoute (t, x, z) {
  t.goal = { x, z };
  t.path = lanePath(t.x, t.z, x, z);
  t.pi = 0; t.arrived = 0;
  const P = t.path;
  // первая точка за спиной — начинаем со следующей
  if (P.length > 1 && Math.hypot(P[1][0] - t.x, P[1][1] - t.z) < Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1])) t.pi = 1;
}

/* новая машина с маршрутом: поля те же, что у трафика, плюс свои */
function newSvc (mesh, kind, o = {}) {
  const t = carObj(mesh, mesh.userData.model, false, false, 13, 160, 1e9);   // все поля сразу — см. carObj
  t.svc = kind; t.path = null; t.goal = null;
  t.acc = 3; t.corner = 0.35; t.gap = 1.4; t.peds = true;
  return Object.assign(t, o);
}

function svcPlace (t, x, z, tx, tz) {
  t.x = x; t.z = z; t.gy = undefined;
  svcRoute(t, tx, tz);
  const P = t.path, q = P[Math.min(t.pi + 1, P.length - 1)] || [tx, tz];
  t.h = Math.atan2(q[0] - x, q[1] - z);
  poseOnSlope(t);
}

function svcDrive (t, dt) {
  if (t.ramT > 0) {
    // таран: прямо на курьера, на полном ходу, ни на кого не глядя
    t.ramT -= dt;
    const a1 = Math.atan2(V.x - t.x, V.z - t.z), dh = Math.atan2(Math.sin(a1 - t.h), Math.cos(a1 - t.h));
    t.speed = damp(t.speed, t.cruise * 1.2 * RL.svcHold(t, dt), t.acc, dt);   // и на таран — не сквозь щиты ремонта
    t.h += clamp(dh, -3 * dt, 3 * dt);
    t.x += Math.sin(t.h) * t.speed * dt; t.z += Math.cos(t.h) * t.speed * dt;
    t.wheel += t.speed * dt / 0.46;
    for (const w of t.mesh.userData.wheels) w.rotation.x = t.wheel;
    poseOnSlope(t);
    if (t.ramT <= 0) { t.ramT = 0; t.repath = 1; }
    return;
  }
  if (t.repath && t.goal) { t.repath = 0; svcRoute(t, t.goal.x, t.goal.z); }
  const P = t.path;
  let want = 0, dh = 0;
  if (P && t.pi < P.length) {
    let tx = P[t.pi][0], tz = P[t.pi][1], d = Math.hypot(tx - t.x, tz - t.z);
    while (d < 3.5 && t.pi < P.length - 1) { t.pi++; tx = P[t.pi][0]; tz = P[t.pi][1]; d = Math.hypot(tx - t.x, tz - t.z); }
    const last = t.pi === P.length - 1;
    if (last && d < 2.2) t.pi++;
    want = t.cruise;
    if (t.passT > 0 && !last) {
      // обгон по встречке: держим цель на полосу левее
      t.passT -= dt;
      tx += Math.cos(t.h) * 3.3; tz -= Math.sin(t.h) * 3.3;
    }
    const a1 = Math.atan2(tx - t.x, tz - t.z);
    if (!last) {
      // перед поворотом сбрасывает: аккуратный — сильно, лихач — чуть-чуть
      const a2 = Math.atan2(P[t.pi + 1][0] - tx, P[t.pi + 1][1] - tz);
      const turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
      if (d < 22) want *= lerp(1, t.corner, clamp(turn / 1.5, 0, 1));
    } else want = Math.min(want, 1.5 + d * 0.7);
    dh = Math.atan2(Math.sin(a1 - t.h), Math.cos(a1 - t.h));
    want *= clamp(1.3 - Math.abs(dh), 0.25, 1);    // отвернулся от цели — сперва довернуть
  } else t.arrived = 1;

  // впереди: чужие машины, курьер, люди на полотне
  let slow = 1;
  const hx = Math.sin(t.h), hz = Math.cos(t.h);
  const ahead = (ox, oz, gap, half, reach) => {
    const dx = ox - t.x, dz = oz - t.z, fw = dx * hx + dz * hz;
    if (fw <= 0 || fw > reach || Math.abs(-hz * dx + hx * dz) > half) return;
    slow = Math.min(slow, clamp((fw - gap) / 7, 0, 1));
  };
  if (t.ghost > 0) t.ghost -= dt;
  else {
    for (const o of TRAFFIC) {
      if (o === t || Math.abs(o.x - t.x) > 18 || Math.abs(o.z - t.z) > 18) continue;
      if (!o.knock && !o.parked && Math.sin(o.h) * hx + Math.cos(o.h) * hz < -0.3) continue;   // встречная
      if (t.aggr) {
        // злой курьер за медленными не плетётся: уходит на обгон, а кто не
        // успел убраться — того расталкивает (см. updateRivals)
        if (t.passT > 0) continue;
        const dx = o.x - t.x, dz = o.z - t.z, fw = dx * hx + dz * hz;
        if (fw > 0 && fw < 20 && Math.abs(-hz * dx + hx * dz) < 2.2 && o.speed < t.speed + 2) { t.passT = rand(1.8, 2.6); honk(t); continue; }
        continue;
      }
      ahead(o.x, o.z, (t.hl || 2) + (o.hl || 2) + t.gap + (o.tow || 0), 1.9, 16);
    }
    // курьер стоит или плетётся впереди — злой объезжает и его, по встречке
    const vdx = V.x - t.x, vdz = V.z - t.z, vfw = vdx * hx + vdz * hz;
    if (t.aggr && t.passT <= 0 && vfw > 0 && vfw < 16 && Math.abs(-hz * vdx + hx * vdz) < 2.4 && Math.hypot(V.vx, V.vz) < t.speed + 3) { t.passT = 2.4; honk(t); }
    if (!(t.aggr && t.passT > 0)) ahead(V.x, V.z, (t.aggr ? 3 : 4.5) + t.gap, 2.1, 16);
    if (t.peds) for (const list of walkersAll())
      for (const p of list) {
        if (p.dead || Math.abs(p.x - t.x) > 13 || Math.abs(p.z - t.z) > 13) continue;
        ahead(p.x, p.z, t.aggr ? 1.8 : 3.2, 1.8, 12);
      }
  }
  slow = Math.min(slow, RL.svcHold(t, dt));        // щиты ремонта: встать, найти объезд (roadlife.js)
  const goal = want * slow;
  { const D = t.dbg || (t.dbg = [0, 0, 0]); D[0] = want; D[1] = slow; D[2] = dh; }   // для отладки: чего хочет и что держит (тот же массив — без мусора в кадре)
  t.speed = damp(t.speed, goal, goal > t.speed ? t.acc : 5, dt);
  if (goal < 0.3) t.speed = Math.max(0, t.speed - 8 * dt);
  // стоит и не может проехать — через четыре секунды протискивается
  if (slow < 0.05 && want > 1) { if ((t.waitT += dt) > (t.aggr ? 1 : 4)) { t.ghost = 2; t.waitT = 0; honk(t); } } else t.waitT = 0;
  if (t.honkT > 0) t.honkT -= dt;
  // Страховка: хочет ехать, а стоит — упёрся носом в машину курьера (физика
  // каждый кадр режет скорость, и «протиснуться» не срабатывало) или в
  // кого-то ещё. Через две секунды — в объезд по соседней полосе.
  if (want > 1 && t.speed < 0.8) { if ((t.stuckT = (t.stuckT || 0) + dt) > 2) { t.passT = 2.4; t.ghost = 2; t.stuckT = 0; honk(t); } }
  else t.stuckT = 0;
  const rate = (t.aggr ? 3.2 : 2.4) * clamp(t.speed / 4, 0.35, 1.3);
  t.h += clamp(dh, -rate * dt, rate * dt);
  t.x += Math.sin(t.h) * t.speed * dt;
  t.z += Math.cos(t.h) * t.speed * dt;
  t.wheel += t.speed * dt / 0.46;
  for (const w of t.mesh.userData.wheels) w.rotation.x = t.wheel;
  for (const s of t.mesh.userData.steer) s.rotation.y = damp(s.rotation.y, clamp(dh, -0.5, 0.5), 8, dt);
  poseOnSlope(t);
}

/* гудок: злой курьер сигналит, когда обгоняет или протискивается — если ты рядом */
function honk (t) {
  if (t.honkT > 0 || !t.aggr) return;
  t.honkT = 3;
  const d = Math.hypot(t.x - V.x, t.z - V.z);
  if (d < 60) Snd.fx('honk', s => { s.blip(420, 0.14, 'square', 0.07); setTimeout(() => s.blip(420, 0.2, 'square', 0.07), 170); }, { x: t.x, z: t.z, far: 60 });
}

/* убрать машину с маршрутом совсем: из списка — после цикла по трафику */
function svcGone (t) {
  t.gone = 1;
  scene.remove(t.mesh);
  t.mesh.traverse(o => { if (o.isMesh) { if (!o.geometry.userData.shared) o.geometry.dispose(); if (o.material.dispose && o.material !== HUMAN_VC && !o.material.userData.shared) o.material.dispose(); } });   // общее у лёгких машин — не трогаем
}

/* ─────────────── скорая ───────────────
   Сбили человека — на место едет скорая: с мигалкой и сиреной, по
   улицам, как все, трафик перед ней тормозит. Встаёт у ближайшей
   дороги, двое фельдшеров идут к месту, собирают всё, что осталось,
   отмывают асфальт от крови и уносят носилки. Если рядом ещё вызов —
   едет туда, иначе уезжает. Скорую тоже можно протаранить, а
   фельдшеров — задавить, и тогда вызов будет уже про них. */
const AMB = { t: null, state: 'idle', cd: 0, inc: null, medics: [], workT: 0, sirenT: 0, siren: 0, flashT: 0, goT: 0 };
const INCIDENTS = [];

function callAmbulance (x, z) {
  if (INTRO) return;
  const near = i => i && Math.hypot(i.x - x, i.z - z) < 14;
  if (INCIDENTS.some(near) || near(AMB.inc) || INCIDENTS.length >= 4) return;
  INCIDENTS.push({ x, z });
}

function makeAmbulance () {
  const g = makeCar('#f4f4f0', false, 'suv');
  const S = CAR_SPEC.suv, W = S.W, top = 0.42 + S.h;
  const parts = [];
  for (const sx of [-1, 1]) {
    box(parts, 0.03, 0.18, S.L - 0.5, '#d9262c', sx * (W / 2 + 0.09), top - 0.3, 0);
    box(parts, 0.03, 0.34, 0.1, '#d9262c', sx * (W / 2 + 0.1), top - 0.05, S.cz + 0.1);
    box(parts, 0.03, 0.1, 0.34, '#d9262c', sx * (W / 2 + 0.1), top - 0.05, S.cz + 0.1);
  }
  box(parts, 1.1, 0.1, 0.34, '#2b2a30', 0, top + S.ch + 0.16, S.cz + 0.7);
  g.add(new THREE.Mesh(mergeGeos(parts), HUMAN_VC));
  const flash = [];
  for (const [sx, hex] of [[-0.27, 0x2f7bff], [0.27, 0xff2a2a]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: hex }));
    m.position.set(sx, top + S.ch + 0.3, S.cz + 0.7);
    g.add(m); flash.push(m);
  }
  g.userData.flash = flash;
  return g;
}

function makeMedic () {
  return { grp: makeHuman(null, { shirt: '#eef2f4', pants: '#2f5fa8', fat: false }), x: 0, z: 0, ph: 0, dead: 0, ox: 0, oz: 0 };
}

/* узел подальше от курьера — туда скорая уезжает и там пропадает */
function farNode (x, z) {
  let best = nodeNear(x, z, 220, 380), bd = 0;
  for (let k = 0; k < 8; k++) {
    const n = nodeNear(x, z, 220, 380), d = Math.hypot(NODES[n].x - V.x, NODES[n].z - V.z);
    if (d > bd) { bd = d; best = n; }
  }
  return NODES[best];
}

function ambDispatch (inc) {
  const m = makeAmbulance();
  const t = newSvc(m, 'amb', { cruise: 16, acc: 3.5, corner: 0.4, gap: 1.2, dot: '#ff4d4d' });
  const n = NODES[nodeNear(inc.x, inc.z, 90, 170)];
  svcPlace(t, n.x, n.z, inc.x, inc.z);
  scene.add(m);
  TRAFFIC.push(t);
  Object.assign(AMB, { t, inc, state: 'go', goT: 0, medics: [] });
  t.onWreck = () => { svcGone(t); ambReset(); };
}

function ambReset () {
  for (const d of AMB.medics) if (!d.dead) dropMesh(d.grp);
  if (AMB.t && !AMB.t.gone) svcGone(AMB.t);
  Object.assign(AMB, { t: null, inc: null, state: 'idle', cd: 3, medics: [] });
}

/* фельдшер идёт к точке; true — дошёл */
function medicWalk (d, x, z, dt, spd = 2.4) {
  const dx = x - d.x, dz = z - d.z, l = Math.hypot(dx, dz);
  const u = d.grp.userData;
  if (l < 0.5) { u.legL.rotation.x = damp(u.legL.rotation.x, 0, 8, dt); u.legR.rotation.x = damp(u.legR.rotation.x, 0, 8, dt); return true; }
  d.x += dx / l * spd * dt; d.z += dz / l * spd * dt;
  pushOut(d, 0.45);
  d.ph += dt * 8;
  const sw = Math.sin(d.ph) * 0.8;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  d.grp.rotation.y = damp(d.grp.rotation.y, Math.atan2(dx, dz), 10, dt);
  return false;
}

function updateAmb (dt) {
  AMB.cd -= dt;
  const t = AMB.t;
  if (!t) {
    if (!INCIDENTS.length || AMB.cd > 0 || S.state === 'title' || S.state === 'intro') return;
    INCIDENTS.sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z));
    const inc = INCIDENTS.shift();
    if (Math.hypot(inc.x - V.x, inc.z - V.z) < 420) ambDispatch(inc);   // далеко — всё равно не видно
    return;
  }
  // мигалка и сирена — пока едет на вызов и пока стоит
  const on = AMB.state !== 'leave' && !t.wreck;
  if ((AMB.flashT -= dt) <= 0) {
    AMB.flashT = 0.13; AMB.siren ^= 1;
    const [b, r] = t.mesh.userData.flash;
    b.visible = !on || AMB.siren === 1; r.visible = !on || AMB.siren === 0;
  }
  if (AMB.state === 'go' && (AMB.sirenT -= dt) <= 0) {
    AMB.sirenT = 0.42;
    const d = Math.hypot(t.x - V.x, t.z - V.z);
    if (d < 170) Snd.fx('siren', s => s.blip(AMB.siren ? 760 : 580, 0.36, 'triangle', 0.09), { x: t.x, z: t.z, far: 170 });
  }
  if (t.wreck) { for (const d of AMB.medics) if (!d.dead) handsUp(d.grp.userData, dt); return; }

  const side = () => {
    const hx = Math.sin(t.h), hz = Math.cos(t.h);
    return [[t.x + hz * 1.4 - hx * 0.4, t.z - hx * 1.4 - hz * 0.4], [t.x - hz * 1.4 - hx * 0.4, t.z + hx * 1.4 - hz * 0.4]];
  };
  const inc = AMB.inc, alive = AMB.medics.filter(d => !d.dead);
  if (AMB.state === 'go') {
    AMB.goT += dt;
    if (t.arrived && t.speed < 0.5 && !t.knock && !t.stalled) {
      AMB.state = 'walk';
      const sp = side();
      for (let i = 0; i < 2; i++) {
        const d = makeMedic();
        [d.x, d.z] = sp[i];
        d.ox = i ? 0.7 : -0.7; d.oz = i ? 0.4 : -0.4;
        scene.add(d.grp);
        AMB.medics.push(d);
      }
    } else if (AMB.goT > 75) { AMB.state = 'leave'; const n = farNode(t.x, t.z); svcRoute(t, n.x, n.z); }
  } else if (AMB.state === 'walk') {
    let done = true;
    for (const d of alive) if (!medicWalk(d, inc.x + d.ox, inc.z + d.oz, dt)) done = false;
    if (!alive.length) AMB.state = 'back';
    else if (done) { AMB.state = 'work'; AMB.workT = 4.5; }
  } else if (AMB.state === 'work') {
    AMB.workT -= dt;
    for (const d of alive) {
      // склонились: руки вниз-вперёд, голова опущена, чуть покачиваются
      const u = d.grp.userData;
      d.grp.rotation.y = damp(d.grp.rotation.y, Math.atan2(inc.x - d.x, inc.z - d.z), 6, dt);
      u.armL.rotation.x = -1.2 + Math.sin(tG * 6 + d.ox) * 0.3; u.armR.rotation.x = -1.2 - Math.sin(tG * 6 + d.ox) * 0.3;
      u.head.rotation.x = 0.5;
    }
    // отмывают: кровь и то, что осталось, пропадает вокруг места
    for (const dc of DECALS) if (Math.hypot(dc.m.position.x - inc.x, dc.m.position.z - inc.z) < 7) dc.life = Math.min(dc.life, 1 + Math.random() * AMB.workT);
    for (const g of GORE) if (Math.hypot(g.m.position.x - inc.x, g.m.position.z - inc.z) < 8) g.life = Math.min(g.life, 1 + Math.random() * AMB.workT);
    if (AMB.workT <= 0) {
      AMB.state = 'back';
      if (alive[0]) {
        // носилки: у первого в руках, мешок сверху
        const st = [];
        box(st, 0.62, 0.08, 1.9, '#ff7a1a', 0, 0.85, 1.05);
        box(st, 0.5, 0.24, 1.5, '#2b2a30', 0, 1.0, 1.05);
        const m = new THREE.Mesh(mergeGeos(st), HUMAN_VC);
        alive[0].grp.add(m); alive[0].stretch = m;
      }
      for (const d of alive) { d.grp.userData.head.rotation.x = 0; d.grp.userData.armL.rotation.x = -1.3; d.grp.userData.armR.rotation.x = -1.3; }
    }
  } else if (AMB.state === 'back') {
    const sp = side();
    let done = true;
    alive.forEach((d, i) => { if (!medicWalk(d, sp[i % 2][0], sp[i % 2][1], dt, 2)) done = false; });
    if (done) {
      for (const d of alive) dropMesh(d.grp);
      AMB.medics = [];
      // ещё вызов рядом — туда же, иначе домой
      const k = INCIDENTS.findIndex(i => Math.hypot(i.x - t.x, i.z - t.z) < 140);
      if (k >= 0) { AMB.inc = INCIDENTS.splice(k, 1)[0]; AMB.state = 'go'; AMB.goT = 0; svcRoute(t, AMB.inc.x, AMB.inc.z); }
      else { AMB.state = 'leave'; AMB.inc = null; const n = farNode(t.x, t.z); svcRoute(t, n.x, n.z); }
    }
  } else if (AMB.state === 'leave') {
    if (t.arrived || Math.hypot(t.x - V.x, t.z - V.z) > 300) ambReset();
  }

  // фельдшеры: стоят на земле, под колёсами — как все
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (const d of AMB.medics) {
    if (d.dead) continue;
    d.grp.position.set(d.x, groundH(d.x, d.z) + curbAt(d.x, d.z), d.z);
    const dx = d.x - V.x, dz = d.z - V.z;
    if (vsp > 3 && Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
      d.dead = 1; dropMesh(d.grp);
      gibHuman(d, V.vx, V.vz);
      S.people++;
      Snd.squish();
    }
  }
}

/* ─────────────── другие курьеры на смене ───────────────
   Ты на смене не один: из той же пиццерии возят ещё четверо, имена им
   раздаёт генератор людей при старте смены. Каждый по кругу берёт заказ,
   едет по улицам к гостю, пару секунд отдаёт коробку и возвращается.
   Стиль вождения у всех свой: первый гонит и людей не видит, второй
   лихачит в поворотах, третий едет аккуратно и пропускает всех,
   четвёртая агрессивная — расталкивает поток. Тебя свои не таранят никогда.
   Заработок копится, как у тебя, — сбоку висит рейтинг смены. Их можно
   таранить, взрывать и злить, как любые машины, — но выбил своего
   (сгорел от твоего удара) — штраф ECON.COLLEAGUE_KO (colleagueKO).

   Курьеры-конкуренты (FOE_SPEC, ECON.FOES): по одному от чужих сетей —
   «Вселенная суши» и «Королева Бургеров» (docs/IDEAS.md, блок 9). Ездят по
   району со своими заказами, в рейтинге их нет, без шашки пиццы на крыше,
   над машиной — табличка сети. Изредка бодают тебя: ты впереди в 6—28 м
   почти по их курсу, между таранами 35—60 с. Выбил — ECON.RIVAL_KO: из сумки разлетаются купюры (rivalSpill). */
const RIVAL_SPEC = [
  // обычный трафик едет 9–14 м/с, такси до 17: курьеры — заметно злее
  // и людей не пропускает никто: кто не отскочил — тот под колёсами
  { hex: '#2f8f5b', model: 'sedan', cruise: 29, corner: 0.85, acc: 9, gap: 0.2, peds: false, tip: 1.0, aggr: 1 },
  { hex: '#8e5bd8', model: 'hatch', cruise: 27, corner: 0.8, acc: 8.5, gap: 0.3, peds: false, tip: 1.0, aggr: 1 },
  { hex: '#3f7fd6', model: 'suv', cruise: 23, corner: 0.65, acc: 6.5, gap: 0.6, peds: false, tip: 1.25, aggr: 0.8 },
  { hex: '#d9537a', model: 'smart', cruise: 28, corner: 0.85, acc: 9, gap: 0.2, peds: false, tip: 1.1, fem: true, aggr: 1 },
];
const RIVALS = [];
/* конкуренты: ram — бодают тебя (редко, ECON.FOES), brand — сеть, tag — короткая табличка над машиной */
const FOE_SPEC = [
  { hex: '#4fc8e8', model: 'hatch', cruise: 26, corner: 0.8, acc: 8.5, gap: 0.3, peds: true, tip: 1, aggr: 0.6, ram: true, brand: N_('Вселенная суши'), tag: N_('суши') },
  { hex: '#f2c230', model: 'sedan', cruise: 25, corner: 0.75, acc: 8, gap: 0.4, peds: true, tip: 1, aggr: 0.6, ram: true, brand: N_('Королева Бургеров'), tag: N_('бургеры') },
];
const FOES = [];

function nameTex (text, hex) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 26px "Press Start 2P", sans-serif';
  const w = Math.min(248, x.measureText(text).width + 28);
  x.fillStyle = hex; x.strokeStyle = '#33210c'; x.lineWidth = 6;
  x.beginPath(); x.roundRect(128 - w / 2, 8, w, 44, 12); x.fill(); x.stroke();
  x.fillStyle = '#fff3d6'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rivalCar (R) {
  const m = makeCar(R.spec.hex, !R.foe, R.spec.model);   // шашка «Птицы Пиццы» — только у своих
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: R.tagTex, transparent: true, depthWrite: false }));
  tag.scale.set(3.2, 0.8, 1); tag.position.set(0, 3.1, 0);
  // вплотную к камере табличка закрывала полэкрана — у камеры она тает
  const wp = new THREE.Vector3();
  tag.onBeforeRender = () => { tag.getWorldPosition(wp); tag.material.opacity = clamp((wp.distanceTo(cam.position) - 9) / 8, 0, 1); };
  m.add(tag);
  return m;
}

/* Где курьеры ждут заказ: колонной у тебя за спиной, по той же полосе,
   с шагом шесть с половиной метров. Раньше они вставали кругом у
   пиццерии — и ты на старте оказывался зажат со всех сторон. */
const RIVAL_REST = [];
function restSlots () {
  RIVAL_REST.length = 0;
  // есть парковка курьеров у пиццерии — все стоят там, каждый на своём месте
  if (COURIER_SLOTS) { for (let i = 0; i < RIVAL_SPEC.length; i++) RIVAL_REST.push(COURIER_SLOTS[i + 1] || COURIER_SLOTS[COURIER_SLOTS.length - 1]); return; }
  const hx = Math.sin(V.h), hz = Math.cos(V.h);
  let d = 8;
  for (let i = 0; i < RIVAL_SPEC.length; i++) {
    let x = V.x - hx * d, z = V.z - hz * d;
    for (let k = 0; k < 10; k++) {
      const r = nearestRoad(x, z, DRIVE_MAX, 1);
      if (!inHouse(x, z, 1.5) && r && r.d < r.seg.w / 2) break;
      d += 2; x = V.x - hx * d; z = V.z - hz * d;
    }
    RIVAL_REST.push({ x, z, h: V.h });
    d += 6.5;
  }
}

function rivalSpawn (R, delay) {
  const t = newSvc(rivalCar(R), 'rival', {
    cruise: R.spec.cruise, corner: R.spec.corner, acc: R.spec.acc, gap: R.spec.gap, peds: R.spec.peds, dot: R.spec.hex, hp: 120,
    aggr: R.spec.aggr || 0, passT: 0, honkT: 0,
  });
  t.rival = R;
  R.t = t; R.state = 'wait'; R.wait = delay; R.goal = null;
  // свои — на парковке курьеров у пиццерии; конкурент — где-то на улице района, подальше от тебя
  const slot = R.foe ? rivalGoal(160) : RIVAL_REST[R.slot] || { x: PIZZA.x, z: PIZZA.z, h: 0 };
  if (!slot) { svcGone(t); R.t = null; R.back = 3; return; }        // места не нашлось — попробуем через 3 с
  if (R.foe && slot.w) { const o = Math.min(1.9, slot.w / 4); slot.x -= Math.cos(slot.h) * o; slot.z += Math.sin(slot.h) * o; }   // на правую полосу (как rightOf)
  t.x = slot.x; t.z = slot.z; t.h = slot.h; t.gy = undefined;
  poseOnSlope(t);
  t.path = null; t.arrived = 1; t.ramCd = rand(...ECON.FOES.RAM_FIRST);
  scene.add(t.mesh);
  TRAFFIC.push(t);
  t.onWreck = () => {
    svcGone(t);
    R.t = null; R.back = Math.max(2, (R.outEnd || 0) - tG);   // сгорел — вычеркнут до конца минуты
  };
  t.onBoom = () => {
    if (R.out) return;
    R.out = 1; R.outEnd = tG + 60;
    // сгорел от твоего удара (въехал за RIVAL_KO.HIT_S секунд до взрыва)
    const mine = !S.freeRun && t.pHitT !== undefined && tG - t.pHitT < ECON.RIVAL_KO.HIT_S;
    const near = Math.hypot(t.x - V.x, t.z - V.z) < 200;
    if (mine && R.foe && !R.ko) {
      // конкурент (econ.js RIVAL_KO): из сумки разлетаются купюры — собери за 25 с; раз за смену с каждого
      R.ko = 1;
      ACH.add('rivals');
      RESPECT.gain('rivalCar');                    // взорвал машину конкурента — респект (econ.js RESPECT.GAIN)
      rivalSpill(t.x, t.z);
      popBonus($t('выбил конкурента!'), $t('из сумки «{brand}» разлетелись деньги — собирай!', { brand: $t(R.spec.brand) }));
    } else if (mine && !R.foe) colleagueKO(R);
    else if (R.foe) {
      if (mine) RESPECT.gain('rivalCar');          // денег второй раз нет, а респект — каждый раз
      if (near) toast($t('курьер «{brand}» сгорел', { brand: $t(R.spec.brand) }) + ' · ' + (mine ? $t('с этого уже получил — без денег') : $t('не от твоего удара — без денег')));
    }
    else if (near) toast($t('{who} вычеркнут', { who: R.name }) + ' · ' + $t('из смены на минуту — сгорел вместе с заказом'));
  };
}

/* Выбил своего — коллега из твоей пиццерии сгорел от твоего удара: штраф ECON.COLLEAGUE_KO.FINE
   из кошелька (сколько есть) и из «за смену», каждый раз. Вне карьеры — FINE / MONEY_K.
   ХУК для блока 9 (docs/IDEAS.md, шкала респекта): здесь же — «минус респект за своего»;
   тогда штраф деньгами убрать или уменьшить. */
function colleagueKO (R) {
  const fine = CAREER ? ECON.COLLEAGUE_KO.FINE : Math.round(ECON.COLLEAGUE_KO.FINE / ECON.MONEY_K);
  const got = Math.max(0, Math.min(fine, wallet()));
  if (got) addWallet(-got);
  S.money = Math.max(0, S.money - fine);
  popBonus($t('выбил своего!'), $t('{who} из твоей пиццерии · штраф −{money}', { who: R.name, money: money(fine) }));
  RESPECT.gain('ownCourier');                      // и минус респект (econ.js RESPECT.GAIN.ownCourier)
  if (Snd.fail) Snd.fail();
}

const RIVAL_ALL = [RIVALS, FOES];                 // свои и конкуренты — одна и та же езда (updateRivals)
function initRivals () {
  clearRivals();
  restSlots();
  RIVAL_SPEC.slice(0, CAREER ? GROW.couriers() : RIVAL_SPEC.length).forEach((spec, i) => {   // своих на смене — по ступени пиццерии (growth.js, econ.js GROWTH.COURIERS)
    const person = makePerson({ fem: !!spec.fem, seed: CAREER ? CAREERM.crewSeed(i) : undefined });   // четвёртая — реплики в женском роде; в карьере — те же люди, что в рейтинге пиццерии
    const R = { spec, person, name: person.first, money: 0, done: 0, t: null, tagTex: nameTex(person.first, spec.hex), back: 0, slot: i };
    RIVALS.push(R);
    rivalSpawn(R, 6 + i * 3.5);                       // первыми трогаются передние, пока ты грузишься
  });
  // конкуренты: над машиной — табличка сети, а не имя
  FOE_SPEC.slice(0, ECON.FOES.N).forEach((spec, i) => {
    const person = makePerson({});
    const R = { spec, person, name: person.first, foe: true, money: 0, done: 0, t: null, tagTex: nameTex($t(spec.tag), spec.hex), back: 0, slot: -1 };
    FOES.push(R);
    rivalSpawn(R, 4 + i * 6);
  });
}
function clearRivals () {
  for (const L of RIVAL_ALL) for (const R of L) { if (R.t && !R.t.gone) svcGone(R.t); dropGuest(R); R.tagTex.dispose(); }
  RIVALS.length = 0; FOES.length = 0;
}

/* Куда везёт: гость ждёт у бордюра на улице где-нибудь по району — в
   полутора-шестистах метрах от пиццерии и не ближе девяноста к тебе.
   Раньше соперники брали те же точки во дворах вокруг курьера и кружили
   рядом; теперь их видно на улицах по всему району. */
function rivalGoal (fromV = 90) {
  for (let k = 0; k < 60; k++) {
    const sg = pick(RSEG);
    if (sg.c > 4 || sg.b || sg.x || sg.na === undefined || sg.nb === undefined) continue;
    const q = rand(0.2, 0.8), x = lerp(sg.x1, sg.x2, q), z = lerp(sg.z1, sg.z2, q);
    const dP = Math.hypot(x - PIZZA.x, z - PIZZA.z);
    if (dP < 140 || dP > 650 || Math.hypot(x - V.x, z - V.z) < fromV || !inBounds(x, z, 30) || x < riverX(z)) continue;
    if (nearClient(x, z, 40)) continue;           // не к твоему ждущему клиенту
    return { x, z, w: sg.w, h: Math.atan2(sg.x2 - sg.x1, sg.z2 - sg.z1) };   // h — курс по улице (старт конкурента)
  }
  return null;
}

/* гость соперника: стоит на тротуаре у точки, где тот встанет, лицом к дороге */
function rivalGuest (R, t) {
  const P = t.path;
  if (!P || P.length < 2) return null;
  const a = P[P.length - 2], b = P[P.length - 1], n = rightOf(a, b), w = R.goal.w;
  const o = w / 2 + 1.4 - Math.min(1.9, w / 4);
  const x = b[0] + n[0] * o, z = b[1] + n[1] * o;
  if (inHouse(x, z, 0.5)) return null;
  const grp = makeHuman(null);
  grp.rotation.y = Math.atan2(-n[0], -n[1]);
  grp.position.set(x, groundH(x, z) + curbAt(x, z), z);
  scene.add(grp);
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { grp, x, z, got: 0, t: 0, dead: 0, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l, ph: 0 };
}
function dropGuest (R) { if (R.guest && !R.guest.dead) dropMesh(R.guest.grp); R.guest = null; }

function guestTick (R, dt) {
  const q = R.guest;
  if (!q) return;
  const u = q.grp.userData;
  if (q.got) {
    // получил и пошёл по тротуару вдоль улицы
    q.t += dt; q.ph += dt * 7;
    q.x += q.dx * 1.2 * dt; q.z += q.dz * 1.2 * dt;
    pushOut(q, 0.45);
    q.grp.rotation.y = damp(q.grp.rotation.y, Math.atan2(q.dx, q.dz), 6, dt);
    const sw = Math.sin(q.ph) * 0.8;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    if (q.t > 14) { dropGuest(R); return; }
  } else if (R.t && Math.hypot(R.t.x - q.x, R.t.z - q.z) < 60) {
    // машу рукой своему курьеру
    u.armR.rotation.x = -2.6 + Math.sin(tG * 8) * 0.4;
  }
  q.grp.position.set(q.x, groundH(q.x, q.z) + curbAt(q.x, q.z), q.z);
  q.grp.visible = Math.hypot(q.x - V.x, q.z - V.z) < 170;
  // под твои колёса — как все
  const fx = Math.sin(V.h), fz = Math.cos(V.h), dx = q.x - V.x, dz = q.z - V.z;
  if (Math.hypot(V.vx, V.vz) > 3 && Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
    q.dead = 1; dropMesh(q.grp);
    gibHuman(q, V.vx, V.vz);
    S.people++;
    Snd.squish();
    R.guest = null;
    R.lost = 1;
  }
}

function updateRivals (dt) {
  for (const L of RIVAL_ALL) for (const R of L) {
    guestTick(R, dt);
    if (!R.t) {
      if ((R.back -= dt) <= 0) { R.out = 0; rivalSpawn(R, 2); }
      continue;
    }
    const t = R.t;
    if (t.wreck || t.knock || t.stalled) continue;
    if (R.state === 'wait') {
      t.speed = 0; t.path = null;
      // вернулся с заказа — заезжает на своё место на парковке
      const sl = !R.foe && COURIER_SLOTS && RIVAL_REST[R.slot];
      if (sl) {
        const dx = sl.x - t.x, dz = sl.z - t.z, d = Math.hypot(dx, dz);
        if (d > 0.3) { const k = Math.min(1, 4 * dt / d); t.x += dx * k; t.z += dz * k; t.h += Math.atan2(Math.sin(sl.h - t.h), Math.cos(sl.h - t.h)) * Math.min(1, 3 * dt); poseOnSlope(t); }
      }
      if (calmStart()) { R.wait = Math.max(R.wait, 1); continue; }    // первый заказ — стоят на парковке и ждут
      if ((R.wait -= dt) <= 0) {
        R.goal = rivalGoal();
        if (!R.goal) { R.wait = 3; continue; }
        R.state = 'go'; R.fee = Math.round(CASH(120 + Math.hypot(R.goal.x - PIZZA.x, R.goal.z - PIZZA.z) * 1.7) * 0.9);
        svcRoute(t, R.goal.x, R.goal.z);
        dropGuest(R); R.lost = 0;
        R.guest = rivalGuest(R, t);
      }
    } else if (R.state === 'go') {
      if (t.arrived && t.speed < 0.6) {
        R.state = 'give'; R.wait = 2.5;
        const q = R.guest;
        if (q) flyBox({ x: t.x, y: groundH(t.x, t.z) + 1.3, z: t.z }, { x: q.x, y: groundH(q.x, q.z) + 1.15, z: q.z }, 0.6, () => {
          if (q.dead) return;
          const bx = pizzaBox(); bx.scale.setScalar(0.75); bx.position.set(0, 1.12, 0.32);
          q.grp.add(bx); q.got = 1;
          q.grp.userData.armL.rotation.x = q.grp.userData.armR.rotation.x = -1.2;
          if (Math.hypot(q.x - V.x, q.z - V.z) < 120) emote(q.x, 2.1, q.z, 'heart', 3);
        });
      }
    } else if (R.state === 'give') {
      // отдаёт коробку: стоит с аварийкой
      const hz = t.mesh.userData.hazard, on = Math.floor(tG * 2.5) % 2 === 0;
      if (hz) for (const m of hz) m.visible = on;
      if ((R.wait -= dt) <= 0) {
        if (hz) for (const m of hz) m.visible = false;
        if (!R.lost) { R.money += Math.round(R.fee * R.spec.tip); R.done++; }
        // конкурент в пиццерию не возвращается — сразу за следующим заказом
        if (R.foe) { R.state = 'wait'; R.wait = rand(0.5, 1.5); continue; }
        R.state = 'home';
        const slot = RIVAL_REST[R.slot];
        svcRoute(t, slot ? slot.x : PIZZA.x, slot ? slot.z : PIZZA.z);
      }
    } else if (R.state === 'home') {
      if (t.arrived && t.speed < 0.6) { R.state = 'wait'; R.wait = rand(1.5, 3.5); }
    }
    // конкурент бодается (свои — никогда): ты впереди, близко и почти по курсу — таран, редко (ECON.FOES)
    if (R.spec.ram && R.foe && (R.state === 'go' || R.state === 'home') && !S.ride && !calmStart()) {
      t.ramCd -= dt;
      const dx = V.x - t.x, dz = V.z - t.z, dV = Math.hypot(dx, dz);
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - t.h), Math.cos(Math.atan2(dx, dz) - t.h)));
      if (t.ramCd <= 0 && !t.ramT && dV > 6 && dV < 28 && off < 0.8 && ['drive', 'back', 'side'].includes(S.state) && chance(dt * 1.5)) {
        t.ramT = 2.6; t.ramCd = rand(...ECON.FOES.RAM_CD);
        Snd.fx('ram', s => s.blip(330, 0.25, 'sawtooth', 0.1), { x: t.x, z: t.z });
      }
    }
    // злой курьер расталкивает машины, которые не успели уйти с дороги
    if (t.aggr && t.speed > 7 && !t.knock) {
      const hx = Math.sin(t.h), hz = Math.cos(t.h);
      for (const o of TRAFFIC) {
        if (o === t || o.svc || o.knock || o.wreck || o.hitT > 0) continue;
        const dx = o.x - t.x, dz = o.z - t.z;
        if (Math.abs(dx) > 7 || Math.abs(dz) > 7) continue;
        const fw = dx * hx + dz * hz, side = -hz * dx + hx * dz;
        if (fw < 0 || fw > (t.hl || 2) + (o.hl || 2) + 0.3 || Math.abs(side) > 1.8) continue;
        const push = t.speed * 0.55, sg = side >= 0 ? 1 : -1;
        fullCar(o);
        dentCar(o.mesh, t.x + hx * 2, t.z + hz * 2, push);
        knockCar(o, hx * 0.6 - hz * sg * 0.8, hz * 0.6 + hx * sg * 0.8, push);
        o.hitT = 1.2; o.hp -= push * 1.5;
        sparks(t.x + hx * 2, 0.8, t.z + hz * 2, 6, hx, hz);
        t.speed *= 0.75;
        if (Math.hypot(t.x - V.x, t.z - V.z) < 90) {
          Snd.crash(push, { x: t.x + hx * 2, z: t.z + hz * 2 }, 'car');
        }
        if (o.hp <= 0) wreckCar(o);
        break;
      }
    }
    // лихач людей не видит — и сбивает: считается на нём, не на тебе
    if (!t.peds && t.speed > 6) {
      const hx = Math.sin(t.h), hz = Math.cos(t.h);
      const under = q => { const dx = q.x - t.x, dz = q.z - t.z; return Math.abs(dx * hx + dz * hz) < (t.hl || 2) + 0.4 && Math.abs(dx * hz - dz * hx) < 1.2; };
      for (const p of PEOPLE) {
        if (p.dead || p.guest || !under(p)) continue;
        p.dead = 1; p.deadT = rand(18, 26); p.fly = null; p.grp.visible = false;
        gibHuman(p, hx * t.speed, hz * t.speed);
      }
      for (const p of SCOOTS) {
        if (p.dead || !under(p)) continue;
        runOverScoot(p, hx * t.speed, hz * t.speed, R.name);
      }
      for (const p of PEDS) {
        if (p.dead || !under(p)) continue;
        p.dead = 1; p.deadT = rand(6, 14); p.grp.visible = false;
        gibBurger(p.x, p.z);
      }
    }
  }
}

/* рейтинг смены: на хаде — только «место 2 из 5» (≥ 11 px), вся таблица курьеров — в паузе (renderPause) */
const elRivals = $('rivals');
let rivalsT = 0;
function rivalBoard () {
  const rows = RIVALS.map(R => ({ n: R.name, m: R.money, hex: R.spec.hex, out: R.out ? Math.max(1, Math.ceil(R.outEnd - tG)) : 0 }));
  rows.push({ n: $t('ты'), m: S.money, me: true });
  rows.sort((a, b) => b.m - a.m || (a.me ? -1 : 1));
  return rows;
}
function rivalsStep (dt) {
  if (!elRivals) return;
  const on = RIVALS.length && ['drive', 'back', 'handover', 'side', 'brief', 'loading'].includes(S.state);
  elRivals.hidden = !on;
  if (!on || (rivalsT -= dt) > 0) return;
  rivalsT = 0.5;
  // в езде — одна строка «место 2 из 5» крупно (≥ 11 px), вся таблица — в паузе (UI-REVIEW № 31)
  const rows = rivalBoard(), me = rows.findIndex(r => r.me);
  const html = '<li class="me"><i class="you"></i><b>' + $t('место {i} из {n}', { i: me + 1, n: rows.length }) + '</b></li>';
  if (elRivals.innerHTML !== html) elRivals.innerHTML = html;
}

/* ─────────────── аварии на дорогах ───────────────
   Время от времени где-то впереди на улице случается авария: две машины
   встали друг другу в бампер, косо, на аварийках, капоты подняты, из-под
   одного дымит. Водители вышли и дерутся: машут кулаками, орут. Поток
   встаёт за ними и через несколько секунд протискивается, курьеры-
   соперники объезжают. Машины можно протаранить и взорвать, драчунов —
   задавить. Через полторы минуты (или если уехал далеко) всё
   рассасывается. */
const ACCIDENTS = [];
const FIGHT_LINES = [$t('ты чё?!'), $t('сам ты!'), $t('куда смотрел?!'), $t('страховка есть?'), $t('я тебя запомнил'), $t('ну всё!'), $t('выходи!'), $t('в глаза смотри!'), $t('гаишников жду')];
let accCd = 40;

function raiseHood (mesh, a) {
  const h = mesh.userData.hood;
  if (!h) return;
  h.m.rotation.x = -a;
  h.m.position.y = h.y + Math.sin(a) * h.len / 2;
  h.m.position.z = h.z - h.len / 2 + Math.cos(a) * h.len / 2;
}

/* авария рождается по кадрам (на Деке разом — до 17 мс рывка): машина, машина, водители — по шагу за кадр;
   в ACCIDENTS — когда готова. spawnAccident() из отладки (__dlv) — разом, как раньше */
let ACC_BUILD = null;
function spawnAccident (steps) {
  const it = accidentSteps();
  if (it.next().done) return false;              // первый шаг — место; нет места — нет аварии
  if (steps) { ACC_BUILD = it; return true; }
  while (!it.next().done);
  return true;
}
function* accidentSteps () {
  for (let k = 0; k < 40; k++) {
    // кусок улицы — из клеток вокруг курьера: в большом городе случайный кусок почти всегда за километр
    const cell = ROAD_GRID.get(Math.floor((V.x + rand(-260, 260)) / RCELL) + ',' + Math.floor((V.z + rand(-260, 260)) / RCELL));
    const sg = cell ? RSEG[pick(cell)] : pick(RSEG);
    if (sg.c > 3 || sg.b || sg.x) continue;
    const q = rand(0.25, 0.75), rx = lerp(sg.x1, sg.x2, q), rz = lerp(sg.z1, sg.z2, q);
    const dV = Math.hypot(rx - V.x, rz - V.z);
    if (dV < 110 || dV > 260 || !inBounds(rx, rz, 40)) continue;
    if (ACCIDENTS.some(a => Math.hypot(a.x - rx, a.z - rz) < 120)) continue;
    if (PIZZA && Math.hypot(rx - PIZZA.x, rz - PIZZA.z) < 60) continue;
    const len = Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1) || 1, ux = (sg.x2 - sg.x1) / len, uz = (sg.z2 - sg.z1) / len;
    const side = chance(0.5) ? 1 : -1, nx = -uz * side, nz = ux * side;
    const off = Math.max(1.6, sg.w / 4);                       // своя полоса у правого края
    const dir = side > 0 ? Math.atan2(ux, uz) : Math.atan2(-ux, -uz);
    const cars = [];
    for (let i = 0; i < 2; i++) {
      yield 1;                                     // место нашлось; машины — по одной за кадр
      const t = newCar(false);
      t.taxi = false; t.parked = true; t.accident = 1;
      if (t.mesh.userData.lite) { const lm = t.mesh; t.mesh = makeCar(lm.userData.bodyHex, false, lm.userData.model, !!lm.userData.taxi); lm.children.forEach(c => { if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose(); }); t.hl = t.mesh.userData.hl; }
      const back = i ? -5.2 : 0;
      t.x = rx + nx * off + Math.sin(dir) * back + rand(-0.3, 0.3);
      t.z = rz + nz * off + Math.cos(dir) * back + rand(-0.3, 0.3);
      t.h = dir + (i ? rand(-0.35, -0.15) : rand(0.2, 0.45));
      t.gy = undefined;
      scene.add(t.mesh);
      poseOnSlope(t);
      // мятины: у переднего — зад, у заднего — перед
      const hx = Math.sin(t.h), hz = Math.cos(t.h), sgn = i ? 1 : -1;
      dentCar(t.mesh, t.x + hx * 2 * sgn, t.z + hz * 2 * sgn, 22);
      dentCar(t.mesh, t.x + hx * 2 * sgn, t.z + hz * 2 * sgn, 18);
      raiseHood(t.mesh, i ? 1.05 : 0.8);
      t.hp = 70;
      TRAFFIC.push(t);
      cars.push(t);
    }
    yield 1;
    // водители: друг напротив друга у тротуара, между машинами
    const fx = rx + nx * (off + 2.4) - Math.sin(dir) * 2.6, fz = rz + nz * (off + 2.4) - Math.cos(dir) * 2.6;
    const fighters = [];
    for (let i = 0; i < 2; i++) {
      const s2 = i ? 1 : -1, x = fx + Math.sin(dir) * 0.75 * s2, z = fz + Math.cos(dir) * 0.75 * s2;
      const grp = makeHuman(chance(0.3) ? nextPerson() : null);
      grp.rotation.y = Math.atan2(fx - x, fz - z);
      grp.position.set(x, groundH(x, z) + curbAt(x, z), z);
      scene.add(grp);
      fighters.push({ grp, x, z, ph: rand(0, 6), dead: 0, shock: 0, bubble: sayBubble(grp, pick(FIGHT_LINES), '#d9342c', 2.6), sayT: rand(0.5, 1.5) });
    }
    ACCIDENTS.push({ x: rx, z: rz, cars, fighters, t: 90, warned: 0, smokeT: 0 });
    return;
  }
}

function clearAccident (a) {
  for (const t of a.cars) if (!t.gone && TRAFFIC.includes(t)) svcGone(t);
  for (const f of a.fighters) if (!f.dead) dropMesh(f.grp);
}

function updateAccidents (dt) {
  const live = ['drive', 'back', 'handover', 'side'].includes(S.state) || S.ride && S.state === 'drive';
  if (ACC_BUILD && (!live || ACC_BUILD.next().done)) { if (!live) while (!ACC_BUILD.next().done); ACC_BUILD = null; }   // рождается по кадрам
  if (live && !ACC_BUILD && !calmStart() && ACCIDENTS.length < 2 && (accCd -= dt) <= 0) { accCd = rand(50, 100); if (chance(0.7)) spawnAccident(true); }
  const blink = Math.floor(tG * 2.5) % 2 === 0;
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (let i = ACCIDENTS.length - 1; i >= 0; i--) {
    const a = ACCIDENTS[i], dV = Math.hypot(a.x - V.x, a.z - V.z);
    a.t -= dt;
    if ((a.t <= 0 && dV > 90) || dV > 380 || S.state === 'title' || S.state === 'over') { clearAccident(a); ACCIDENTS.splice(i, 1); continue; }
    // аварийки мигают, из-под капота дымок
    for (const t of a.cars) {
      if (t.wreck || t.gone) continue;
      const hz = t.mesh.userData.hazard;
      if (hz) for (const m of hz) m.visible = blink;
    }
    if ((a.smokeT -= dt) <= 0 && dV < 150) {
      a.smokeT = 0.5;
      const t = a.cars[1];
      if (t && !t.wreck && !t.gone) puff(t.x + Math.sin(t.h) * 1.9, 1.2, t.z + Math.cos(t.h) * 1.9, false, 0.5);
    }
    // драка: кулаки по очереди, подскоки, ругань облачками
    for (const f of a.fighters) {
      if (f.dead) continue;
      const u = f.grp.userData;
      f.grp.visible = dV < 130;
      // под колёса — до испуга: рядом сбили одного — остальные не бессмертные (04.10.2026)
      if (vsp > 3) {
        const dx = f.x - V.x, dz = f.z - V.z;
        if (Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
          f.dead = 1; dropMesh(f.grp);
          gibHuman(f, V.vx, V.vz);
          S.people++;
          Snd.squish();
          continue;
        }
      }
      if (f.shock > 0) { f.shock -= dt; handsUp(u, dt); continue; }
      f.ph += dt * 9;
      u.armR.rotation.x = -1.4 - Math.max(0, Math.sin(f.ph)) * 0.9;
      u.armL.rotation.x = -1.4 - Math.max(0, Math.sin(f.ph + Math.PI)) * 0.9;
      u.legL.rotation.x = Math.sin(f.ph * 0.5) * 0.3; u.legR.rotation.x = -Math.sin(f.ph * 0.5) * 0.3;
      f.grp.position.y = groundH(f.x, f.z) + curbAt(f.x, f.z) + Math.abs(Math.sin(f.ph * 0.5)) * 0.08;
      f.grp.rotation.z = Math.sin(f.ph * 0.5) * 0.08;
      if ((f.sayT -= dt) <= 0) { f.sayT = rand(1.2, 2.2); setSay(f.bubble, pick(FIGHT_LINES), '#d9342c'); if (dV < 60 && chance(0.5)) Snd.fx('fight', s => s.blip(110, 0.08, 'square', 0.06), { x: f.x, z: f.z, far: 60 }); }
      f.bubble.position.x = Math.sin(tG * 30) * 0.04;
    }
  }
}

/* ─────────────── похититель пиццы ───────────────
   Время от времени на районе появляется тип в чёрном с чужой коробкой
   пиццы: бежит по тротуару и орёт кусками — «ААА!», «УКРАЛ ПИЦЦУ!»,
   «ХАХАХАХ», «МОЯ! МОЯ!», «НЯМ-НЯМ», «БУДУ КУШАТЬ», «ПИЦЦА!», а следом
   бежит хозяин пиццы: «отдай…», «мою пиццу…». Увидев курьера ближе
   двадцати метров, вор удирает, на радаре — красная точка. Сбил —
   респект и триста рублей, хозяин рад; не поймал за полторы минуты —
   скрылся, хозяин грустит. */
const THIEF = { p: null, c: null, cd: 45 };
const THIEF_LINES = [$t('ААА!'), $t('УКРАЛ ПИЦЦУ!'), $t('ХАХАХАХ'), $t('МОЯ!'), $t('МОЯ!'), $t('НЯМ-НЯМ'), $t('БУДУ КУШАТЬ'), $t('ПИЦЦА!')];
const OWNER_LINES = [$t('отдай…'), $t('мою пиццу…'), $t('отдай мою пиццу…')];
const LINE_TEX = new Map();                          // реплик мало — текстуры один раз
const lineTex = (text, col) => {
  const k = col + text;
  if (!LINE_TEX.has(k)) LINE_TEX.set(k, rageTex(text, col));
  return LINE_TEX.get(k);
};
function sayBubble (grp, text, col, y = 2.7) {
  const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: lineTex(text, col), transparent: true, depthWrite: false }));
  b.scale.set(2.8, 1.4, 1); b.position.set(0, y, 0);
  grp.add(b);
  return TALK.track(b);                            // размер и кого показать — talk.js
}
function setSay (b, text, col) { b.material.map = lineTex(text, col); b.material.needsUpdate = true; }
function spawnThief () {
  const grp = makeHuman(null, { shirt: '#1b1a1f', pants: '#1b1a1f', cap: '#1b1a1f', fat: false, fem: false, face: false });   // в маске — без лица
  const u = grp.userData;
  for (const m of [].concat(u.head.material)) if (!m.map) m.color.set('#2b2a30');
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0xfff3d6 }));
  eyes.position.set(0, 0.06, 0.16);
  u.head.add(eyes);
  const b = pizzaBox();
  b.scale.setScalar(0.75); b.position.set(0, 1.12, 0.36);
  grp.add(b);
  u.armL.rotation.x = u.armR.rotation.x = -1.25;
  const bubble = sayBubble(grp, THIEF_LINES[0], '#d9342c');
  const p = { grp, speed: 3.2, ph: 0, crossT: 1e9, x: 0, z: 0, dead: 0, t: 90, bubble, line: 0, sayT: 1.1 };
  walkSpawn(p, 60, 150);
  scene.add(grp);
  THIEF.p = p;
  // хозяин пиццы — в паре метров позади, тянет руки
  if (THIEF.c) dropOwner();
  const person = nextPerson();
  const og = makeHuman(person, { fat: false });
  og.userData.armL.rotation.x = og.userData.armR.rotation.x = -1.5;
  const c = { grp: og, person, x: p.x - 3, z: p.z, ph: 0, dead: 0, bubble: sayBubble(og, OWNER_LINES[0], '#4f7fd6'), line: 0, sayT: 1.5, leaveT: 0 };
  scene.add(og);
  THIEF.c = c;
  if (!CAREER || (+Store.get('dlv-shifts', 0) || 0) >= 1) toast($t('на районе похититель пиццы — сбей, будет респект'));   // новичку в первой смене — без тоста (UI-REVIEW № 39)
}
function dropOwner () { const c = THIEF.c; if (!c) return; if (!c.dead) dropMesh(c.grp); THIEF.c = null; }
function dropThief (msg, caught) {
  const p = THIEF.p;
  if (!p) return;
  if (!p.dead) dropMesh(p.grp);
  THIEF.p = null; THIEF.cd = rand(60, 110);
  if (msg) toast(msg);
  // хозяин: поймали — радуется, нет — грустит; потом уходит
  const c = THIEF.c;
  if (c && !c.dead) {
    setSay(c.bubble, caught ? $t('спасибо!!!') : $t('эх…'), caught ? '#3f8f4d' : '#4f7fd6');
    c.leaveT = caught ? 4 : 3;
    c.grp.userData.armL.rotation.x = c.grp.userData.armR.rotation.x = caught ? -2.8 : 0;
    if (caught) emote(c.x, 2.3, c.z, 'heart', 5);
  } else THIEF.c = null;
}
/* хозяин пиццы бежит за вором, пока тот не пойман или не скрылся */
function ownerStep (dt) {
  const c = THIEF.c;
  if (!c || c.dead) return;
  const u = c.grp.userData, p = THIEF.p;
  if (c.leaveT > 0) {
    if ((c.leaveT -= dt) <= 0) { dropOwner(); return; }
    u.legL.rotation.x = u.legR.rotation.x = 0;
  } else if (p) {
    // держится в трёх метрах позади вора
    const hx = Math.sin(p.grp.rotation.y), hz = Math.cos(p.grp.rotation.y);
    const tx = p.x - hx * 3, tz = p.z - hz * 3, dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    const sp = Math.min(d * 2.2, 5.6);
    if (d > 0.2) { c.x += dx / d * sp * dt; c.z += dz / d * sp * dt; c.grp.rotation.y = damp(c.grp.rotation.y, Math.atan2(p.x - c.x, p.z - c.z), 8, dt); }
    if (d > 12) { c.x = tx; c.z = tz; }                   // отстал за углом — догоняет
    c.ph += dt * sp * 3;
    const sw = Math.sin(c.ph) * 0.9;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.armL.rotation.x = -1.5 + Math.sin(c.ph) * 0.2; u.armR.rotation.x = -1.5 - Math.sin(c.ph) * 0.2;
    if ((c.sayT -= dt) <= 0) { c.sayT = 1.5; c.line = (c.line + 1) % OWNER_LINES.length; setSay(c.bubble, OWNER_LINES[c.line], '#4f7fd6'); }
  }
  pushOut(c, 0.45);
  c.grp.position.set(c.x, groundH(c.x, c.z) + curbAt(c.x, c.z) + Math.abs(Math.sin(c.ph)) * 0.06, c.z);
  c.bubble.position.y = 2.7 + Math.sin(tG * 4 + 1) * 0.08;
  // хозяина тоже можно задавить — но это уже совсем свинство
  const fx = Math.sin(V.h), fz = Math.cos(V.h), dx = c.x - V.x, dz = c.z - V.z;
  if (Math.hypot(V.vx, V.vz) > 3 && Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
    c.dead = 1; dropMesh(c.grp);
    gibHuman(c, V.vx, V.vz);
    S.people++;
    Snd.squish();
    THIEF.c = null;
  }
}
function updateThief (dt) {
  const live = ['drive', 'back', 'handover', 'side'].includes(S.state);
  ownerStep(dt);
  if (!THIEF.p) { if (live && !calmStart() && (THIEF.cd -= dt) <= 0) spawnThief(); return; }
  const p = THIEF.p, u = p.grp.userData;
  if (!live && S.state !== 'brief' && S.state !== 'loading') { dropThief(); dropOwner(); return; }
  if ((p.sayT -= dt) <= 0) { p.sayT = 1.1; p.line = (p.line + 1) % THIEF_LINES.length; setSay(p.bubble, THIEF_LINES[p.line], '#d9342c'); }
  const dV = Math.hypot(p.x - V.x, p.z - V.z);
  if ((p.t -= dt) <= 0 || dV > 330) { dropThief(); return; }
  let ang;
  if (dV < 20) {
    // удирает от машины, пока не отстанет
    const dx = p.x - V.x, dz = p.z - V.z;
    p.x += dx / dV * 5.2 * dt; p.z += dz / dV * 5.2 * dt;
    p.ph += dt * 15; ang = Math.atan2(dx, dz); p.fled = 1;
  } else {
    if (p.fled) { p.fled = 0; walkBack(p); }
    ang = walkerStep(p, dt, 11);
  }
  pushOut(p, 0.45);
  p.grp.position.set(p.x, groundH(p.x, p.z) + curbAt(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.08, p.z);
  if (!Number.isNaN(ang)) p.grp.rotation.y = damp(p.grp.rotation.y, ang, 10, dt);
  const sw = Math.sin(p.ph) * 1;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  p.bubble.position.y = 2.7 + Math.sin(tG * 5) * 0.08;
  // сбить — как всех, только это хорошо
  const fx = Math.sin(V.h), fz = Math.cos(V.h), dx = p.x - V.x, dz = p.z - V.z;
  if (Math.hypot(V.vx, V.vz) > 3 && Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
    p.dead = 1;
    dropMesh(p.grp);
    gibHuman(p, V.vx, V.vz);
    S.burgers++;
    S.money += CASH(300);
    if (!S.freeRun) addWallet(CASH(300));
    Snd.squish();
    toast($t('респект!') + ' ' + $t('похититель пиццы наказан · +{money}', { money: money(CASH(300)) }));
    if (!S.freeRun) RESPECT.gain('thief');
    dropThief('', true);
  }
}

/* ─────────────── маркер адреса ─────────────── */
const marker = new THREE.Group();
{
  const pin = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.2, 4),
    new THREE.MeshBasicMaterial({ color: 0xf0522a }));
  pin.rotation.x = Math.PI; pin.position.y = 4.4;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff8a2b }));
  ball.position.y = 6.6;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 16, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 8;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 20),
    new THREE.MeshBasicMaterial({ color: 0xf0522a, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3;
  marker.add(pin, ball, beam, ring);
  marker.userData = { pin, ball, ring };
  scene.add(marker);
}

/* ─────────────── кофе-нитро и бонусы во дворах ───────────────
   Нитро здесь — кофе: синий стаканчик кофе крутится над кольцом на
   асфальте. Проехал сквозь — полбака. Стаканчики лежат на улицах с
   самого начала, возвращаются на то же место через двадцать пять
   секунд, а каждые несколько секунд у дороги рядом с курьером
   появляется ещё один — нитро всегда где-то впереди.

   Во дворах, на проездах и дорожках, лежат три бонуса:
   щит — десять секунд неуязвимости, аптечка — плюс сердце,
   бык — бист-мод: пятнадцать секунд Shift не жжёт нитро, а просто
   разгоняет вдвое быстрее. Далёкие не рисуем — их всё равно съест туман. */
const NITRO_CANS = [];                             // все подбираемые: кофе и бонусы
/* сколько и как часто. Карьера (Северск, 30.09.2026) — гуще: нитро и аптечек
   заметно больше, и пока машина побита, аптечка появляется у дороги впереди */
const PK = CAREER
  ? { nos: 90, nosGap: 38, bonus: 44, bonusGap: 48, kinds: ['heal', 'shield', 'heal', 'beast', 'heal'],
      nosRespawn: 16, bonusRespawn: 28, spawn: [3, 6], spawnCap: 26, heal: [9, 15] }
  : { nos: 50, nosGap: 45, bonus: 21, bonusGap: 70, kinds: ['shield', 'heal', 'beast'],
      nosRespawn: 25, bonusRespawn: 45, spawn: [5, 9], spawnCap: 18, heal: null };
const NOS_RESPAWN = PK.nosRespawn, BONUS_RESPAWN = PK.bonusRespawn;
const PICK_HEX = { nos: '#6fd3ff', shield: '#8f9bff', heal: '#ff4d6d', beast: '#ff8a1c', cash: '#3fd46b', life: '#ffc93c' };

const PICK_MAT = (() => {
  const m = hex => new THREE.MeshBasicMaterial({ color: hex });
  const ring = hex => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  return {
    cup: m(0x1f5bff), sleeve: m(0x0c2f9e), lid: m(0xf4f6fb), logo: m(0xffffff),
    shield: new THREE.MeshBasicMaterial({ color: 0x8f9bff, transparent: true, opacity: 0.55, depthWrite: false }),
    star: m(0xe8ecff), heal: m(0xff4d6d), white: m(0xffffff), beast: m(0xff8a1c), horn: m(0xf3e3c2), dark: m(0x2a1d1a),
    ring: Object.fromEntries(Object.entries(PICK_HEX).map(([k, v]) => [k, ring(v)])),
  };
})();
const ringGeo = new THREE.RingGeometry(1.6, 2.1, 18);
/* склейки подбираемого (pickupModel): те же детали, что ниже по отдельности, цвета — как у материалов */
PICK_MAT.vc = new THREE.MeshBasicMaterial({ vertexColors: true });
const PICK_ONE = (() => {
  const L = () => [], hx = mat => mat.color.getHex(), O = {};
  let l = L();
  put(l, new THREE.CylinderGeometry(0.44, 0.32, 1.15, 12), hx(PICK_MAT.cup), 0, 0, 0);
  put(l, new THREE.CylinderGeometry(0.43, 0.39, 0.42, 12), hx(PICK_MAT.sleeve), 0, -0.02, 0);
  put(l, new THREE.CylinderGeometry(0.49, 0.47, 0.14, 12), hx(PICK_MAT.lid), 0, 0.64, 0);
  put(l, new THREE.CylinderGeometry(0.34, 0.46, 0.14, 12), hx(PICK_MAT.lid), 0, 0.76, 0);
  put(l, new THREE.BoxGeometry(0.2, 0.24, 0.06), hx(PICK_MAT.logo), 0, -0.02, 0.41);
  O.nos = mergeGeos(l);
  l = L();
  put(l, new THREE.BoxGeometry(1.2, 1.2, 0.3), hx(PICK_MAT.white), 0, 0, 0);
  put(l, new THREE.BoxGeometry(0.9, 0.3, 0.34), hx(PICK_MAT.heal), 0, 0, 0);
  put(l, new THREE.BoxGeometry(0.3, 0.9, 0.34), hx(PICK_MAT.heal), 0, 0, 0);
  O.heal = mergeGeos(l);
  l = L();
  put(l, new THREE.BoxGeometry(0.9, 0.8, 0.8), hx(PICK_MAT.beast), 0, 0, 0);
  put(l, new THREE.BoxGeometry(0.5, 0.3, 0.2), hx(PICK_MAT.dark), 0, -0.2, 0.42);
  for (const s of [-1, 1]) put(l, new THREE.ConeGeometry(0.14, 0.7, 6), hx(PICK_MAT.horn), s * 0.6, 0.45, 0, 0, 0, -s * 0.9);
  O.beast = mergeGeos(l);
  for (const k in O) O[k].userData.shared = true;   // dropPickup её не освобождает
  return O;
})();

/* деньги на улице и лишнее сердце — пиксель-арт на плашке (крутится, как бонусы) и искорка рядом.
   Буквы: k — контур, g/G/d — зелёная купюра, y/Y/o — золото, w — белый блик, r/R — красное сердце, b — бумажная лента */
const PX_ART = {
  coin: ['..kkkkkk..', '.kYYYYyyk.', 'kYwYyyyyok', 'kYwyykyyok', 'kYyykkkyok', 'kYyyykyyok', 'kYyyykyyok', 'kYyykkkyok', '.kyyyyyok.', '..kkkkkk..'],
  bill: ['kkkkkkkkkkkkkkkk', 'kGggggggggggggGk', 'kgdddggggggdddgk', 'kgdgggwwwwgggdgk', 'kgggggwddwgggggk', 'kgdgggwwwwgggdgk', 'kgdddggggggdddgk', 'kGggggggggggggGk', 'kkkkkkkkkkkkkkkk'],
  stash: ['..kkkkkkkkkkkkkk', '.kGggggggggggggk', 'kkkkkkkkkkkkkkkk', 'kGggggbbbbgggGgk', 'kgdgggbbbbggdggk', 'kgggggbbbbgggggk', 'kgdgggbbbbggdggk', 'kGggggbbbbgggGgk', 'kkkkkkkkkkkkkkkk', '.kggggggggggggk.', '..kkkkkkkkkkkk..'],
  life: ['..yyy...yyy..', '.yRRRy.yRRRy.', 'yRwwRRyRRRRry', 'yRwRRRRRRRRry', 'yRRRRRRRRRRry', '.yRRRRRRRRry.', '..yRRRRRRry..', '...yRRRRry...', '....yRRry....', '.....yry.....', '......y......'],
  spark: ['...w...', '...w...', '..www..', 'wwwYwww', '..www..', '...w...', '...w...'],
};
const PX_COL = { k: '#1d2a1a', G: '#9af0a8', g: '#3fbf5c', d: '#1f7a35', y: '#ffc93c', Y: '#fff1a8', o: '#b07a12', w: '#ffffff', R: '#ff2d4a', r: '#a3102a', b: '#f4f0dc' };
const PX_MAT = {};
function pxMat (key) {
  if (PX_MAT[key]) return PX_MAT[key];
  const rows = PX_ART[key], c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const col = PX_COL[row[i]]; if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); } } });
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return (PX_MAT[key] = key === 'spark'
    ? new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })
    : new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
}

function pickupModel (kind, opt = {}) {
  const body = new THREE.Group(), M = PICK_MAT;
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); body.add(me); return me; };
  if (kind === 'cash' || kind === 'life') {
    const art = kind === 'life' ? 'life' : opt.art || 'bill', rows = PX_ART[art];
    const h = kind === 'life' ? 1.5 : art === 'coin' ? 0.95 : art === 'stash' ? 1.25 : 1.0, w = h * rows[0].length / rows.length;
    add(new THREE.PlaneGeometry(w, h), pxMat(art));
    const sp = new THREE.Sprite(pxMat('spark'));
    sp.position.set(w * 0.45, h * 0.45, 0.05);
    body.add(sp);
    body.userData.spark = sp;
    return body;
  }
  /* стаканчик, аптечка и бык — одной склейкой на вид (цвета — в вершинах, тот же неосвещённый материал):
     у каждого подбираемого было 3—5 мешей, своих геометрий, и столько же вызовов отрисовки — на карте их
     под сотню, ~160 вызовов на кадр из ~460 (09.10.2026, хвост кадров на Деке). Геометрия общая на всех */
  const one = PICK_ONE[kind];
  if (one) { const me = new THREE.Mesh(one, PICK_MAT.vc); body.add(me); if (kind === 'nos') body.rotation.z = 0.25; return body; }
  if (kind === 'nos') {
    // стаканчик: синий, с рукавом потемнее, белой крышкой и буквой D на рукаве
    add(new THREE.CylinderGeometry(0.44, 0.32, 1.15, 12), M.cup);
    add(new THREE.CylinderGeometry(0.43, 0.39, 0.42, 12), M.sleeve, 0, -0.02, 0);
    add(new THREE.CylinderGeometry(0.49, 0.47, 0.14, 12), M.lid, 0, 0.64, 0);
    add(new THREE.CylinderGeometry(0.34, 0.46, 0.14, 12), M.lid, 0, 0.76, 0);
    add(new THREE.BoxGeometry(0.2, 0.24, 0.06), M.logo, 0, -0.02, 0.41);
    body.rotation.z = 0.25;
  } else if (kind === 'shield') {
    add(new THREE.IcosahedronGeometry(0.85, 1), M.shield);
    add(new THREE.OctahedronGeometry(0.42, 0), M.star);
  } else if (kind === 'heal') {
    add(new THREE.BoxGeometry(1.2, 1.2, 0.3), M.white);
    add(new THREE.BoxGeometry(0.9, 0.3, 0.34), M.heal);
    add(new THREE.BoxGeometry(0.3, 0.9, 0.34), M.heal);
  } else {
    // бык: морда и рога — бист-мод
    add(new THREE.BoxGeometry(0.9, 0.8, 0.8), M.beast);
    add(new THREE.BoxGeometry(0.5, 0.3, 0.2), M.dark, 0, -0.2, 0.42);
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.14, 0.7, 6), M.horn, s * 0.6, 0.45, 0).rotation.z = -s * 0.9;
  }
  return body;
}

/* кофе, аптечка, бык, щит и все кольца — инстансами (pickinst.js): у такого подбираемого body и ring — пустые узлы
   (вращение, подпрыгивание, пульс кольца), рисует их PKI.step() перед отрисовкой. Деньги и сердце — модельками */
const PKI = PKINST.create(THREE, scene, { ringGeo, ringHex: PICK_HEX, geos: {
  nos: [[PICK_ONE.nos, PICK_MAT.vc]], heal: [[PICK_ONE.heal, PICK_MAT.vc]], beast: [[PICK_ONE.beast, PICK_MAT.vc]],
  shield: [[new THREE.IcosahedronGeometry(0.85, 1), PICK_MAT.shield], [new THREE.OctahedronGeometry(0.42, 0), PICK_MAT.star]] } });
{ const ob = scene.onBeforeRender; scene.onBeforeRender = function (...a) { PKI.step(); ob.apply(this, a); }; }
function addPickup (kind, x, z, fixed, opt) {
  const g = new THREE.Group(), inst = !!PICK_ONE[kind] || kind === 'shield';
  const body = inst ? new THREE.Group() : pickupModel(kind, opt);
  if (inst && kind === 'nos') body.rotation.z = 0.25;
  const ring = new THREE.Object3D();             // кольцо — всегда инстансом (один вызов на все виды)
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25;
  g.add(body, ring);
  PKI.add(g, kind, body, ring);
  const y = surfaceAt(x, z);
  g.position.set(x, y, z);
  scene.add(g);
  // все поля сразу (opt — только их значения): форма объекта не меняется на ходу — см. carObj
  const n = { kind, x, z, y, g, body, ring, t: 0, ph: rand(0, 6), fixed, spark: body.userData.spark || null,
    amount: 0, stash: false, far: 0, art: undefined, spill: false, life: undefined, keep: false, fly: null };
  if (opt) Object.assign(n, opt);
  NITRO_CANS.push(n);
  return n;
}

/* убрать подбираемое со сцены: геометрии модельки у каждого свои — освобождаем
   (материалы и кольцо общие, их не трогаем) */
function dropPickup (n) {
  scene.remove(n.g);
  PKI.drop(n.g);
  n.body.traverse(o => { if (o.geometry && !o.isSprite && !o.geometry.userData.shared) o.geometry.dispose(); });   // у спрайтов и склеек (PICK_ONE) геометрия общая на всю игру
}

/* где положить кофе: середина улицы, подальше от других и от пиццерии */
function coffeeSpot (near, rmin, rmax, segs = COFFEE_SEGS) {
  const B = BOUNDS;
  if (!segs.length) return null;
  for (let k = 0; k < 60; k++) {
    const q = pick(segs), t = rand(0.25, 0.75);
    const x = lerp(q.x1, q.x2, t), z = lerp(q.z1, q.z2, t);
    if (x < B.x0 + 30 || x > B.x1 - 30 || z < B.z0 + 30 || z > B.z1 - 30 || !inBorder(x, z)) continue;
    if (near) { const d = Math.hypot(x - near.x, z - near.z); if (d < rmin || d > rmax) continue; }
    if (NITRO_CANS.some(n => n.kind === 'nos' && n.t <= 0 && Math.hypot(n.x - x, n.z - z) < PK.nosGap)) continue;
    if (PIZZA && Math.hypot(PIZZA.x - x, PIZZA.z - z) < 25) continue;
    return [x, z];
  }
  return null;
}
let COFFEE_SEGS = [];

function buildNitro () {
  COFFEE_SEGS = RSEG.filter(q => q.c <= 4 && !q.b && !q.x && Math.hypot(q.x2 - q.x1, q.z2 - q.z1) > 25);
  // бонусы — во дворах: на проездах и дворовых дорожках, по кругу три вида
  const yard = [];
  for (const q of RSEG) if (q.c === 7 && !q.x && Math.hypot(q.x2 - q.x1, q.z2 - q.z1) > 12) yard.push([(q.x1 + q.x2) / 2, (q.z1 + q.z2) / 2]);
  for (const q of YARD_PATHS) { const m = q[(q.length / 2) | 0]; yard.push([m[0], m[1]]); }
  YARD_SPOTS = yard.filter(([x, z]) => inBounds(x, z, 25) && !inHouse(x, z, 1.5));
  if (DISTRICTS) { scatterPickups(); return; }      // карьера с районами — раскладываем по району, где работаешь
  for (let k = 0; k < PK.nos; k++) { const p = coffeeSpot(null); if (p) addPickup('nos', p[0], p[1], true); }
  placeBonuses(PK.bonus, YARD_SPOTS);
}
function placeBonuses (count, spots) {
  const kinds = PK.kinds;
  let n = 0;
  for (let k = 0; k < 1200 && n < count && spots.length; k++) {
    const [x, z] = pick(spots);
    if (NITRO_CANS.some(o => o.kind !== 'nos' && Math.hypot(o.x - x, o.z - z) < PK.bonusGap)) continue;
    addPickup(kinds[n % kinds.length], x, z, true);
    n++;
  }
}
let YARD_SPOTS = [];
/* Районы (DISTRICTS): кофе и бонусы — только в районе, где работаешь, и сколько —
   по волне щедрости (ECON.PACE): один стаканчик на NOS_PER_M метров улиц района и на вдвое
   больше — дворовых проездов, × nos (всего не больше NOS_MAX),
   бонусов во дворах — BONUS_SHARE от этого × kits / nos. Раскладываем заново в
   начале каждой смены и когда меняешь район. */
const DIST_SEGS = new Map(), DIST_YARD = new Map();
const PICK_INFO = { nos: 0, bonus: 0, district: -1, pace: '' };
function scatterPickups () {
  if (!DISTRICTS || !COFFEE_SEGS.length) return;
  // «весь город» (cityopen.js) — по всем районам: улицы всего города, общий потолок NOS_MAX
  const city = DIST.city(), di = city ? 'city' : DIST.cur(), pc = DIST.pace(), P = ECON.PACE;
  const inMine = (x, z) => (city ? DIST.isOpen(DIST.at(x, z)) : DIST.at(x, z) === di);
  for (const n of NITRO_CANS) dropPickup(n);
  NITRO_CANS.length = 0;
  if (!DIST_SEGS.has(di)) {
    // улицы района (c ≤ 5) и дворовые проезды (c 7): в микрорайонах Северска больших улиц
    // мало, почти всё — проезды, туда же ведут заказы
    const ok = q => !q.b && !q.x && Math.hypot(q.x2 - q.x1, q.z2 - q.z1) > 25 && inMine((q.x1 + q.x2) / 2, (q.z1 + q.z2) / 2);
    DIST_SEGS.set(di, { street: RSEG.filter(q => q.c <= 5 && ok(q)), yard: RSEG.filter(q => q.c === 7 && ok(q)) });
    DIST_YARD.set(di, YARD_SPOTS.filter(([x, z]) => inMine(x, z)));
  }
  const S2 = DIST_SEGS.get(di), yard = DIST_YARD.get(di);
  const km = list => list.reduce((a, q) => a + Math.hypot(q.x2 - q.x1, q.z2 - q.z1), 0);
  const ls = km(S2.street), ly = km(S2.yard);
  // кофе: на улицах — один на NOS_PER_M метров, во дворах — вдвое реже; в обычную смену —
  // не больше NOS_MAX, волна множит уже после этого (в огромном районе тоже чувствуется)
  let ns = ls / P.NOS_PER_M, ny = ly / (P.NOS_PER_M * 2);
  const cap = P.NOS_MAX / Math.max(P.NOS_MAX, ns + ny) * pc.nos;
  ns = Math.round(ns * cap); ny = Math.round(ny * cap);
  for (let k = 0; k < ns; k++) { const p = coffeeSpot(null, 0, 0, S2.street); if (p) addPickup('nos', p[0], p[1], true); }
  for (let k = 0; k < ny; k++) { const p = coffeeSpot(null, 0, 0, S2.yard); if (p) addPickup('nos', p[0], p[1], true); }
  const bonus = Math.round((ns + ny) * P.BONUS_SHARE * pc.kits / pc.nos);
  placeBonuses(bonus, yard);
  const len = ls + ly;
  Object.assign(PICK_INFO, { nos: NITRO_CANS.filter(n => n.kind === 'nos').length, bonus: NITRO_CANS.filter(n => n.kind !== 'nos').length, district: di, pace: pc.id, roadM: Math.round(len) });
}
/* заехал в другой район — подсказка: чей он и когда откроется закрытый.
   В закрытый район не проехать: на въездах — перекрытия «дорога закрыта» (districtLocks),
   а упёрся в границу где угодно (дворами, газоном) — машину отбрасывает назад */
const DW = { t: 0, last: -1, ok: null, bump: 0 };
function districtWatch (dt) {
  DW.bump -= dt;
  if (S.state !== 'title' && S.state !== 'dying' && S.state !== 'over') {
    const here = DIST.at(V.x, V.z);
    if (!DIST.isOpen(here) && DW.ok) {
      V.x = DW.ok.x; V.z = DW.ok.z; V.vx *= -0.3; V.vz *= -0.3;
      if (DW.bump <= 0) {
        DW.bump = 2.5;
        const p = DIST.opened() - 1, left = Math.max(1, DIST.need(p) - DIST.shiftsIn(p)), name = $t(DIST.list()[here].name);
        toast(here === p + 1 ? $tn(left, 'район «{name}» закрыт: ещё {n} смена в районе «{prev}»|район «{name}» закрыт: ещё {n} смены в районе «{prev}»|район «{name}» закрыт: ещё {n} смен в районе «{prev}»', { name, prev: $t(DIST.list()[p].name) })
          : $t('район «{name}» пока закрыт', { name }));
        Snd.thud && Snd.thud();
      }
    } else DW.ok = { x: V.x, z: V.z };
  }
  if ((DW.t -= dt) > 0) return;
  DW.t = 0.6;
  if (!isPlaying() || S.state === 'brief' || S.state === 'loading') return;
  const i = DIST.at(V.x, V.z);
  if (i === DW.last) return;
  const first = DW.last < 0;
  DW.last = i;
  if (first) return;
  const name = $t(DIST.list()[i].name);
  if (!DIST.isOpen(i)) {
    const p = DIST.opened() - 1, left = Math.max(1, DIST.need(p) - DIST.shiftsIn(p));
    toast(i === p + 1 ? $tn(left, 'район «{name}» закрыт: ещё {n} смена в районе «{prev}»|район «{name}» закрыт: ещё {n} смены в районе «{prev}»|район «{name}» закрыт: ещё {n} смен в районе «{prev}»', { name, prev: $t(DIST.list()[p].name) })
      : $t('район «{name}» пока закрыт', { name }));
  } else if (DIST.city()) toast($t('район «{name}»', { name }));
  else if (i !== DIST.cur()) toast(S.ride ? $t('район «{name}»', { name }) : $t('район «{name}» — не твой на этой смене, заказов тут нет', { name }));
  else toast($t('твой район — «{name}»', { name }));
}
/* Закрытые районы: узлы графа в них — lock (навигатор туда не ведёт), рёбра — lock (трафик
   не сворачивает), на улицах через границу — перекрытие «дорога закрыта» своим мешем, чтобы
   убрать, когда район откроется. Пересобираем, только когда изменилось число открытых. */
const LOCKS = { n: -1, group: null };
const LOCK_MAT = {};
function districtLocks () {
  if (!DISTRICTS || !NODES.length) return;
  const open = DIST.opened();
  if (open === LOCKS.n) return;
  LOCKS.n = open;
  for (const N of NODES) N.lock = !DIST.isOpen(DIST.at(N.x, N.z));
  for (const e of EDGES.values()) e.lock = NODES[e.a].lock || NODES[e.b].lock ? 1 : 0;
  DEADENDS.mark(DE_API);                          // одностороння в закрытый район — тупик с разворотом (deadends.js)
  if (LOCKS.group) { scene.remove(LOCKS.group); LOCKS.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.geometry && o.geometry !== LOCK_MAT.box) o.geometry.dispose(); }); }
  const g = LOCKS.group = new THREE.Group();
  if (!LOCK_MAT.box) {
    LOCK_MAT.box = new THREE.BoxGeometry(1, 1, 1);
    for (const [k, hex] of [['red', '#d9342c'], ['white', '#f2eee6'], ['post', '#585460'], ['block', '#bdb6ab']]) LOCK_MAT[k] = new THREE.MeshLambertMaterial({ color: hex });
  }
  /* кубики перекрытий — по одному InstancedMesh на цвет (09.10.2026): раньше каждый кубик был своим мешем —
     ~360 штук по всему городу, three.js перебирал их в каждом кадре и рисовал каждый отдельным вызовом */
  const BX = { red: [], white: [], post: [], block: [] };
  const bx = (mat, sx, sy, sz, x, y, z, ry) => BX[mat].push(sx, sy, sz, x, y, z, ry);
  const done = [];
  for (const q of RSEG) {
    if (q.b || q.x || !(q.c <= 5 || q.c === 7)) continue;
    let a = DIST.at(q.x1, q.z1), b = DIST.at(q.x2, q.z2);
    if (a === b || DIST.isOpen(a) === DIST.isOpen(b)) continue;
    // точка перехода границы — делением отрезка пополам; u — от открытого к закрытому
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 14; k++) { const tm = (t0 + t1) / 2; if (DIST.at(lerp(q.x1, q.x2, tm), lerp(q.z1, q.z2, tm)) === a) t0 = tm; else t1 = tm; }
    const L = Math.hypot(q.x2 - q.x1, q.z2 - q.z1) || 1;
    let ux = (q.x2 - q.x1) / L, uz = (q.z2 - q.z1) / L;
    if (!DIST.isOpen(a)) { ux = -ux; uz = -uz; }
    const x = lerp(q.x1, q.x2, t0) - ux * 2.5, z = lerp(q.z1, q.z2, t0) - uz * 2.5;
    if (done.some(d => Math.hypot(d[0] - x, d[1] - z) < 4)) continue;      // у двух половин проспекта — по своему щиту
    done.push([x, z]);
    const w = (q.w || 6) + 4, nx = -uz, nz = ux, ry = Math.atan2(-ux, -uz), y = groundH(x, z);
    const n = Math.max(3, Math.round(w / 1.6));
    for (let k = 0; k < n; k++) { const o = (k + 0.5) / n * w - w / 2; bx(k % 2 ? 'white' : 'red', w / n, 0.5, 0.2, x + nx * o, y + 1.25, z + nz * o, ry); }
    for (const sd of [-1, 1]) bx('post', 0.25, 1.6, 0.25, x + nx * (w / 2) * sd, y + 0.7, z + nz * (w / 2) * sd, ry);
    for (let k = 0; k < Math.ceil(w / 2.6); k++) { const o = (k + 0.5) * 2.6 - w / 2; bx('block', 2.3, 0.8, 0.9, x + nx * o + ux * 0.8, y + 0.35, z + nz * o + uz * 0.8, ry); }
    if (q.c <= 5) {
      for (const sd of [-1, 1]) bx('post', 0.16, 3.4, 0.16, x + nx * 1.9 * sd, y + 1.7, z + nz * 1.9 * sd, ry);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), closedSign());
      sign.position.set(x - ux * 0.05, y + 3.0, z - uz * 0.05); sign.rotation.y = ry;
      g.add(sign);
    }
  }
  LOCKS.count = done.length;
  { const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), SC = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    for (const k in BX) {
      const A = BX[k], n = A.length / 7;
      if (!n) continue;
      const im = new THREE.InstancedMesh(LOCK_MAT.box, LOCK_MAT[k], n);
      for (let i = 0; i < n; i++) {
        const o = i * 7;
        M.compose(P.set(A[o + 3], A[o + 4], A[o + 5]), Q.setFromAxisAngle(UP, A[o + 6]), SC.set(A[o], A[o + 1], A[o + 2]));
        im.setMatrixAt(i, M);
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      g.add(im);
    } }
  // перекрытия стоят, пока район не откроют (тогда группа строится заново):
  // матрицы считаем один раз — иначе это сотни деталей в каждом кадре
  g.updateMatrixWorld(true);
  g.traverse(o => { o.matrixAutoUpdate = false; });
  g.matrixWorldAutoUpdate = false;
  scene.add(g);
}
/* сменили район в меню или открылся новый: пиццерия, кофе, карта, перекрытия */
if (DISTRICTS) DIST.onChange(i => { usePizzeria(i); scatterPickups(); FM.dist = null; districtLocks(); });

/* волна щедрости: × к паузе до возвращения взятого и к паузе между свежими у дороги */
const paceK = k => (DISTRICTS ? DIST.pace()[k] || 1 : 1);
/* машина побита — аптечка у дороги впереди, раз в PK.heal секунд (карьера) */
function healSpawn () {
  if (!PK.heal || S.hp >= S.hpMax || NITRO_CANS.some(n => n.kind === 'heal' && !n.fixed)) return;
  const fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (let k = 0; k < 40; k++) {
    const p = k < 25 && YARD_SPOTS.length ? pick(YARD_SPOTS) : coffeeSpot(V, 60, 220);
    if (!p) continue;
    const dx = p[0] - V.x, dz = p[1] - V.z, d = Math.hypot(dx, dz);
    if (d < 60 || d > 240 || (dx * fx + dz * fz) / d < 0.2) continue;       // впереди, а не за спиной
    addPickup('heal', p[0], p[1], false);
    return;
  }
}

const FXS = { shieldT: 0, beastT: 0, spawnT: 4, aura: null };

function takePickup (n) {
  n.g.visible = false;
  if (!n.fixed) { dropPickup(n); NITRO_CANS.splice(NITRO_CANS.indexOf(n), 1); }
  else n.t = (n.kind === 'nos' ? NOS_RESPAWN : BONUS_RESPAWN) * paceK('respawn');
  if (n.kind === 'nos') {
    NOS.tank = Math.min(1, NOS.tank + NOS_CAN);
    Snd.nosPick();
    if (!HINTS.coffee()) toast(NOS.tank >= 1 ? $t('кофе: полный бак · {key}', { key: nitroKey() }) : $t('кофе + · {key}', { key: nitroKey() }));
  } else if (n.kind === 'shield') {
    FXS.shieldT = 10;
    Snd.nosPick();
    toast($t('щит: десять секунд машину не бьёт'));
  } else if (n.kind === 'cash') {
    // деньги на улице (ECON.STREET_CASH): в кошелёк и в «за смену»; «+N ₽» летит в кошелёк (walletHud)
    S.money += n.amount;
    if (!S.freeRun) addWallet(n.amount);
    Snd.coin(); setTimeout(() => Snd.coin(), 110);
    if (n.stash) setTimeout(() => Snd.coin(), 220);
    emote(n.x, 1.6, n.z, 'star', n.stash ? 6 : 3);
    toast(n.stash ? $t('заначка! +{money}', { money: money(n.amount) }) : n.spill ? $t('из сумки конкурента: +{money}', { money: money(n.amount) }) : $t('деньги на асфальте: +{money}', { money: money(n.amount) }));
  } else if (n.kind === 'life') {
    // лишнее сердце (ECON.EXTRA_LIFE): полные — ещё одна ячейка до конца смены, побита — +1 сердце
    XLIFE.taken = true;
    if (S.hp >= S.hpMax && (S.lifeExtra || 0) < ECON.EXTRA_LIFE.EXTRA_MAX) {
      S.lifeExtra = (S.lifeExtra || 0) + 1; S.hpMax += 1; S.hp = S.hpMax;
      toast($t('золотое сердце: +1 сердце сверх машины до конца смены'));
    } else {
      S.hp = Math.min(S.hpMax, S.hp + 1);
      toast($t('золотое сердце: +1 сердце'));
    }
    hudHearts();
    Snd.coin(); emote(V.x, 2.4, V.z, 'heart', 5);
  } else if (n.kind === 'heal') {
    S.hp = Math.min(S.hpMax, S.hp + 1);
    hudHearts();
    Snd.coin();
    toast(S.hp >= S.hpMax ? $t('аптечка: машина как новая') : $t('аптечка: +1 сердце'));
  } else {
    FXS.beastT = BEAST.T;
    Snd.nosFire();
    toast($t('бист-мод: пятнадцать секунд машина на 60 % быстрее · {key} — ещё быстрее', { key: nitroKey() }));
  }
}

/* ── деньги на улице (ECON.STREET_CASH) и лишнее сердце (ECON.EXTRA_LIFE) ──
   Место — не на проезжей части: двор/проезд (YARD_SPOTS) или тротуар у улицы (сбоку от
   полосы на ширину дороги + 2,5 м), в своём районе, не в доме, подальше от другой купюры. */
const LOOT = { t: 0, n: 0, stash: false };
const XLIFE = { at: -1, t: 0, taken: false, retry: 0 };
function offRoadSpot (rmin, rmax, ahead) {
  const fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (let k = 0; k < 50; k++) {
    let x, z;
    if (k % 3 !== 2 && YARD_SPOTS.length) [x, z] = pick(YARD_SPOTS);
    else {
      const q = pick(COFFEE_SEGS.length ? COFFEE_SEGS : RSEG);
      if (!q) continue;
      const L = Math.hypot(q.x2 - q.x1, q.z2 - q.z1) || 1, t = rand(0.2, 0.8), off = ((q.w || 6) / 2 + 2.5) * (chance(0.5) ? 1 : -1);
      x = lerp(q.x1, q.x2, t) - (q.z2 - q.z1) / L * off; z = lerp(q.z1, q.z2, t) + (q.x2 - q.x1) / L * off;
    }
    const dx = x - V.x, dz = z - V.z, d = Math.hypot(dx, dz);
    if (d < rmin || d > rmax || (ahead && (dx * fx + dz * fz) / d < 0.2)) continue;
    if (!inBounds(x, z, 25) || inHouse(x, z, 1.5)) continue;
    if (DISTRICTS && !DIST.mine(DIST.at(x, z))) continue;
    if (PIZZA && Math.hypot(PIZZA.x - x, PIZZA.z - z) < 30) continue;
    if (NITRO_CANS.some(o => (o.kind === 'cash' || o.kind === 'life') && Math.hypot(o.x - x, o.z - z) < 40)) continue;
    return [x, z];
  }
  return null;
}
function streetLoot (dt, live) {
  if (!live || S.ride) return;
  const C = ECON.STREET_CASH;
  if ((LOOT.t -= dt) <= 0) {
    LOOT.t = rand(C.RESPAWN[0], C.RESPAWN[1]);
    if (LOOT.n < C.PER_SHIFT && NITRO_CANS.filter(o => o.kind === 'cash' && !o.spill).length < C.ON) {
      const p = offRoadSpot(C.R[0], C.R[1], false);
      if (p) {
        const v = ECON.streetCash(CAREER ? 1 : ECON.MONEY_K, Math.random, !LOOT.stash);
        if (v.stash) LOOT.stash = true;
        LOOT.n++;
        addPickup('cash', p[0], p[1], false, { amount: v.amount, stash: v.stash, far: C.FAR, art: v.stash ? 'stash' : v.amount < 200 / (CAREER ? 1 : ECON.MONEY_K) ? 'coin' : 'bill' });
      } else LOOT.t = 2;
    }
  }
  const E = ECON.EXTRA_LIFE;
  if (XLIFE.at >= 0 && (XLIFE.t += dt) >= XLIFE.at && (XLIFE.retry -= dt) <= 0) {
    XLIFE.retry = 1;
    const p = offRoadSpot(E.R[0], E.R[1], true);
    if (p) { addPickup('life', p[0], p[1], false, { keep: true }); XLIFE.at = -1; toast($t('впереди во дворе блестит золотое сердце')); }
  }
}
/* выбил конкурента (ECON.RIVAL_KO): купюры вылетают из горящей машины и ложатся вокруг в R
   метрах; подбираются, как деньги на улице, только приземлившись; через LIFE секунд пропадают */
function rivalSpill (x, z) {
  const C = ECON.RIVAL_KO, k = CAREER ? 1 : ECON.MONEY_K;
  const bills = ECON.rivalBills(k);
  bills.forEach((amount, i) => {
    let px = x, pz = z;
    for (let tr = 0; tr < 8; tr++) {
      const a = i / bills.length * Math.PI * 2 + rand(-0.4, 0.4), d = rand(C.R[0], C.R[1]) * (tr < 5 ? 1 : 0.6);
      px = x + Math.sin(a) * d; pz = z + Math.cos(a) * d;
      if (!inHouse(px, pz, 0.8)) break;
    }
    const n = addPickup('cash', px, pz, false, { amount, spill: true, life: C.LIFE, far: 600, art: amount < 200 / k ? 'coin' : 'bill' });
    n.fly = { x0: x, z0: z, y0: n.y + 1.2, t: -i * 0.05, dur: rand(0.6, 0.95), up: rand(3, 5.5) };
    n.g.position.set(x, n.y + 1.2, z);
  });
  Snd.coin(); setTimeout(() => Snd.coin(), 90); setTimeout(() => Snd.coin(), 180);
}
/* начало смены: купюры и сердце прошлой — убрать, счёт заново; сердце в эту смену — с шансом EXTRA_LIFE.CHANCE */
function lootReset () {
  for (let i = NITRO_CANS.length - 1; i >= 0; i--) {
    const n = NITRO_CANS[i];
    if (n.kind === 'cash' || n.kind === 'life') { dropPickup(n); NITRO_CANS.splice(i, 1); }
  }
  const C = ECON.STREET_CASH, E = ECON.EXTRA_LIFE;
  LOOT.t = rand(C.FIRST[0], C.FIRST[1]); LOOT.n = 0; LOOT.stash = false;
  XLIFE.t = 0; XLIFE.taken = false; XLIFE.retry = 0; XLIFE.at = !S.ride && chance(E.CHANCE) ? rand(E.AT[0], E.AT[1]) : -1;
  S.lifeExtra = 0;
}

function updateNitro (dt) {
  const live = S.state === 'drive' || S.state === 'back' || S.state === 'handover' || S.state === 'side';
  streetLoot(dt, live);                             // деньги на улице и лишнее сердце
  // время от времени — свежий стаканчик у дороги впереди
  if (live && PK.heal && (FXS.healT = (FXS.healT || PK.heal[0]) - dt) <= 0) { FXS.healT = rand(PK.heal[0], PK.heal[1]) * paceK('spawn'); healSpawn(); }
  if (live && (FXS.spawnT -= dt) <= 0) {
    FXS.spawnT = rand(PK.spawn[0], PK.spawn[1]) * paceK('spawn');
    if (NITRO_CANS.filter(n => !n.fixed && n.kind === 'nos').length < PK.spawnCap * Math.max(1, paceK('nos'))) {
      const p = coffeeSpot(V, 50, 200);
      if (p) addPickup('nos', p[0], p[1], false);
    }
  }
  for (let i = NITRO_CANS.length - 1; i >= 0; i--) {
    const n = NITRO_CANS[i];
    if (n.t > 0) n.t -= dt;
    // временный стаканчик, от которого уехали, исчезает (лишнее сердце — нет, деньги — дальше STREET_CASH.FAR)
    if (!n.fixed && !n.keep && Math.hypot(n.x - V.x, n.z - V.z) > (n.far || 420)) { dropPickup(n); NITRO_CANS.splice(i, 1); continue; }
    // купюры выбитого конкурента (rivalSpill): живут RIVAL_KO.LIFE секунд, последние 5 — мигают
    if (n.life !== undefined && (n.life -= dt) <= 0) { dropPickup(n); NITRO_CANS.splice(i, 1); continue; }
    const near = Math.abs(n.x - V.x) < 460 && Math.abs(n.z - V.z) < 460;
    const shown = n.t <= 0 && near && !(n.life < 5 && Math.floor(n.life * 6) % 2);
    // вне кадра — не рисуем и не крутим (их на карте под сотню, у каждого 6—8 деталей); подобрать — как раньше
    n.g.visible = shown && (!!n.fly || CULL.inView(n.x, n.y + 1.2, n.z, 2.5));
    if (n.fly) {
      // летит из сумки: дуга от машины к месту, где ляжет; поймать можно только на земле
      const f = n.fly;
      f.t += dt;
      const p = clamp(f.t / f.dur, 0, 1);
      n.g.position.set(lerp(f.x0, n.x, p), lerp(f.y0, n.y, p) + 4 * f.up * p * (1 - p), lerp(f.z0, n.z, p));
      n.body.rotation.y += dt * 9;
      if (p >= 1) { n.fly = null; n.g.position.set(n.x, n.y, n.z); }
      continue;
    }
    if (!shown && !(n.life < 5)) continue;
    n.ph += dt;
    if (n.g.visible) {
      n.body.rotation.y += dt * 2.2;
      n.body.position.y = (n.kind === 'cash' ? 0.95 : 1.6) + Math.sin(n.ph * 2.4) * (n.kind === 'cash' ? 0.12 : 0.25);
      if (n.spark) { const k = Math.max(0, Math.sin(n.ph * 4.1)); n.spark.scale.setScalar(0.05 + k * k * 0.7); }
      const p = 1 + Math.sin(n.ph * 3.2) * 0.12;
      n.ring.scale.set(p, p, p);
    }
    if (!live || Math.hypot(n.x - V.x, n.z - V.z) > 3.4 || Math.abs(n.y - V.y) > 3) continue;
    takePickup(n);
  }
  // щит светится вокруг машины
  FXS.shieldT = Math.max(0, FXS.shieldT - dt);
  FXS.beastT = Math.max(0, FXS.beastT - dt);
  if (!FXS.aura) {
    FXS.aura = new THREE.Mesh(new THREE.SphereGeometry(3.1, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0x8f9bff, transparent: true, opacity: 0.22, depthWrite: false }));
    scene.add(FXS.aura);
  }
  FXS.aura.visible = FXS.shieldT > 0 && (FXS.shieldT > 2 || Math.floor(FXS.shieldT * 6) % 2 === 0);
  FXS.aura.position.set(V.x, V.y + 1.1, V.z);
}

/* ─────────────── коллекция ───────────────
   Десять предметов разбросаны по району, четыре — во дворах у пиццерии.
   Висят над землёй, крутятся и светятся. Подобрал — +1000 ₽ и предмет
   навсегда в коллекции, с карты он пропадает. В меню — сетка: найденные с
   картинкой, остальные под вопросом. Все иконки нарисованы кодом (colIcon):
   чужих картинок в игре нет. */
const COLLECT = ADULT ? [
  // взрослая версия: половина находок — то, что в детской нельзя
  { id: 'latte', name: $t('латте с медовой пенкой') },
  { id: 'snus', name: $t('шайба снюса'), near: true },
  { id: 'cig', name: $t('пачка «Шапмэн» с вишней'), near: true },
  { id: 'cassette', name: $t('аудиокассета'), near: true },
  { id: 'herb', name: $t('подозрительный свёрток'), near: true },
  { id: 'beer', name: $t('пиво «Жигулёвочка»') },
  { id: 'salmon', name: $t('пицца с лососем') },
  { id: 'pager', name: $t('пейджер') },
  { id: 'penguin', name: $t('плюшевый пингвин'), far: true },
  { id: 'peel', name: $t('золотая лопата для пиццы'), far: true },
] : [
  { id: 'latte', name: $t('латте с медовой пенкой') },
  { id: 'duck', name: $t('резиновая уточка'), near: true },
  { id: 'cactus', name: $t('кактус в горшке'), near: true },
  { id: 'cassette', name: $t('аудиокассета'), near: true },
  { id: 'cube', name: $t('кубик-головоломка'), near: true },
  { id: 'gnome', name: $t('садовый гном') },
  { id: 'salmon', name: $t('пицца с лососем') },
  { id: 'pager', name: $t('пейджер') },
  { id: 'penguin', name: $t('плюшевый пингвин'), far: true },
  { id: 'peel', name: $t('золотая лопата для пиццы'), far: true },
];
const COL_PRIZE = CASH(1000);
const colGot = () => { const v = Store.get('dlv-msk-col', []); return Array.isArray(v) ? v : []; };

/* иконка предмета — на канвасе 128×128: и для меню, и для спрайта на карте */
function colIcon (c, done) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const R = (hex, a, b, w, h) => { x.fillStyle = hex; x.fillRect(a, b, w, h); };
  const T = (t, a, b, hex, fs) => { x.fillStyle = hex; x.font = 'bold ' + fs + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, a, b); };

  const C = (hex, a, b, r) => { x.fillStyle = hex; x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); };
  switch (c.id) {
    case 'latte':
      R('#e9f2f8', 38, 22, 52, 90); R('#6b4a3a', 42, 70, 44, 38); R('#e6cfa8', 42, 44, 44, 26);
      R('#ffe08a', 40, 26, 48, 20); R('#f2b441', 46, 30, 6, 30); R('#f2b441', 70, 28, 6, 36);           // медовые подтёки
      R('#8a6b4e', 44, 104, 40, 8); R('#f0522a', 70, 4, 6, 40);                                      // соломинка
      break;
    case 'duck':
      C('#ffd23f', 58, 82, 34); C('#ffd23f', 76, 44, 22); R('#ff8a2b', 92, 44, 22, 10);               // тело, голова, клюв
      C('#1b1a1f', 80, 38, 4); R('#f2b43a', 30, 70, 30, 12);                                        // глаз, крыло
      R('#6fb0c9', 18, 110, 92, 8);
      break;
    case 'cactus':
      R('#c9803a', 36, 84, 56, 34); R('#a8652a', 32, 80, 64, 10);                                   // горшок
      R('#4fae3a', 54, 22, 20, 62); R('#4fae3a', 34, 42, 14, 12); R('#4fae3a', 34, 42, 8, 30);
      R('#4fae3a', 80, 34, 14, 12); R('#4fae3a', 86, 26, 8, 24);                                    // отростки
      R('#ff5d7a', 58, 14, 12, 10);                                                                // цветок
      for (const [a, b] of [[60, 34], [66, 50], [58, 64], [68, 72]]) R('#d8f0c8', a, b, 3, 3);
      break;
    case 'cassette':
      R('#2b2a30', 14, 34, 100, 64); R('#e8e2d4', 22, 42, 84, 28); R('#e04836', 22, 48, 84, 6);
      C('#2b2a30', 46, 60, 9); C('#2b2a30', 82, 60, 9); C('#e8e2d4', 46, 60, 3); C('#e8e2d4', 82, 60, 3);
      R('#57525c', 36, 80, 56, 12);
      break;
    case 'cube': {
      const cols = ['#e04836', '#ffd23f', '#4f7fd6', '#59b06a', '#ff8a2b', '#f4f4ee'];
      R('#1b1a1f', 22, 22, 84, 84);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R(cols[(i * 3 + j * 2 + 1) % 6], 26 + i * 27, 26 + j * 27, 23, 23);
      break;
    }
    case 'gnome':
      x.fillStyle = '#e04836'; x.beginPath(); x.moveTo(64, 8); x.lineTo(90, 50); x.lineTo(38, 50); x.closePath(); x.fill();   // колпак
      C('#f0c8a0', 64, 58, 14); C('#f4f4ee', 64, 76, 18);                                             // лицо и борода
      R('#4f7fd6', 42, 84, 44, 30); R('#3a2c22', 42, 112, 18, 8); R('#3a2c22', 68, 112, 18, 8);
      C('#1b1a1f', 58, 56, 2.5); C('#1b1a1f', 70, 56, 2.5); C('#ff9a7a', 64, 62, 4);
      break;
    case 'salmon':
      x.fillStyle = '#e8b563'; x.beginPath(); x.moveTo(64, 116); x.lineTo(18, 26); x.lineTo(110, 26); x.closePath(); x.fill();
      x.fillStyle = '#fff3d6'; x.beginPath(); x.moveTo(64, 104); x.lineTo(28, 34); x.lineTo(100, 34); x.closePath(); x.fill();
      for (const [a, b] of [[50, 44], [74, 46], [62, 64], [56, 84], [70, 76]]) { R('#ff8a70', a - 7, b - 5, 14, 10); R('#ffd0c0', a - 7, b - 5, 14, 3); }
      for (const [a, b] of [[40, 40], [86, 42], [64, 52], [66, 92]]) R('#4fae3a', a, b, 4, 4);
      break;
    case 'pager':
      R('#3a3940', 28, 30, 72, 70); R('#9fd08a', 36, 38, 56, 24); R('#57525c', 28, 24, 20, 8);
      T('1234', 64, 50, '#2f5a38', 16);
      for (let i = 0; i < 3; i++) R('#8e8a92', 38 + i * 18, 72, 14, 10);
      R('#e04836', 84, 72, 10, 10);
      break;
    case 'penguin':
      C('#1b1a1f', 64, 76, 36); C('#f4f4ee', 64, 82, 24); C('#1b1a1f', 64, 38, 24); C('#f4f4ee', 64, 42, 14);
      C('#1b1a1f', 58, 38, 3); C('#1b1a1f', 70, 38, 3); R('#ff8a2b', 60, 44, 8, 6);
      R('#ff8a2b', 44, 108, 14, 8); R('#ff8a2b', 70, 108, 14, 8); R('#e04836', 44, 58, 40, 6);   // лапы и шарф
      break;
    case 'herb':
      x.fillStyle = '#c9a877'; x.beginPath(); x.moveTo(30, 110); x.lineTo(98, 110); x.lineTo(80, 40); x.lineTo(48, 40); x.closePath(); x.fill();
      R('#a88859', 52, 30, 24, 12);
      x.fillStyle = '#4fae3a';
      for (const [a, b, r] of [[50, 22, 12], [66, 14, 13], [80, 24, 11], [60, 30, 10]]) { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); }
      T('?', 64, 80, '#6b4a3a', 30);
      break;
    case 'snus':
      x.fillStyle = '#1f3f7a'; x.beginPath(); x.ellipse(64, 70, 46, 30, 0, 0, 7); x.fill();
      x.fillStyle = '#2f5fd0'; x.beginPath(); x.ellipse(64, 60, 46, 30, 0, 0, 7); x.fill();
      x.strokeStyle = '#fff3d6'; x.lineWidth = 4; x.beginPath(); x.ellipse(64, 60, 34, 20, 0, 0, 7); x.stroke();
      T('SNUS', 64, 61, '#fff3d6', 14);
      break;
    case 'cig':
      // пачка пародийной марки: сигареты торчат, вишня на пачке
      R('#2b2a30', 36, 18, 56, 94); R('#8a1c3a', 38, 20, 52, 90); R('#ffd3dc', 38, 34, 52, 12);
      T('ШАПМЭН', 64, 40, '#8a1c3a', 8);
      C('#e8323c', 58, 74, 7); C('#e8323c', 70, 76, 7); R('#4fae3a', 62, 60, 4, 10);
      R('#f3e9d8', 44, 10, 10, 14); R('#f3e9d8', 58, 8, 10, 16); R('#f3e9d8', 72, 11, 10, 13);
      R('#d9832c', 44, 10, 10, 3); R('#d9832c', 58, 8, 10, 3); R('#d9832c', 72, 11, 10, 3);
      break;
    case 'beer':
      R('#6b3f1c', 50, 40, 28, 74); R('#6b3f1c', 56, 12, 16, 30); R('#e8d7a8', 54, 8, 20, 8);
      R('#f2e3b0', 50, 64, 28, 30); T('ЖИГ', 64, 79, '#6b3f1c', 12);
      break;
    case 'peel':
      R('#c8a15a', 58, 60, 12, 60); R('#ffd85e', 30, 10, 68, 56); R('#f2b441', 30, 58, 68, 8);
      R('#fff3b0', 38, 16, 12, 30);                                                                // блик
      break;
  }
  if (!done) {
    // рамка: чтобы иконка на карте читалась издалека
    x.strokeStyle = '#ffd85e'; x.lineWidth = 6; x.strokeRect(4, 4, 120, 120);
  }
  return cv;
}

const COL_ON_MAP = [];
function buildCollect () {
  const got = colGot();
  // места — детерминированно по id, чтобы от захода к заходу не прыгали
  const hash = s => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  const near = SPOTS.filter(s => { const d = Math.hypot(s.x - PIZZA.x, s.z - PIZZA.z); return d > 40 && d < 190; });
  const farBank = SPOTS.filter(s => s.x < riverX(s.z));
  const rest = SPOTS.filter(s => Math.hypot(s.x - PIZZA.x, s.z - PIZZA.z) > 260 && s.x > riverX(s.z));
  const used = [];
  for (const c of COLLECT) {
    if (got.includes(c.id)) continue;
    const pool = (c.near ? near : c.far ? farBank : rest).filter(s => used.every(u => Math.hypot(u.x - s.x, u.z - s.z) > 70));
    if (!pool.length) continue;
    const sp = pool[hash(c.id) % pool.length];
    used.push(sp);
    const tex = new THREE.CanvasTexture(colIcon(c, false));
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    spr.scale.set(1.9, 1.9, 1);
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 9, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xd88cff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 4.5;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.8, 20),
      new THREE.MeshBasicMaterial({ color: 0xd88cff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25;
    g.add(beam, ring, spr);
    g.position.set(sp.x, groundH(sp.x, sp.z) + curbAt(sp.x, sp.z), sp.z);
    scene.add(g);
    COL_ON_MAP.push({ c, x: sp.x, z: sp.z, y: g.position.y, g, spr, ring, ph: rand(0, 6) });
  }
}

function updateCollect (dt) {
  const live = S.state === 'drive' || S.state === 'back' || S.state === 'handover' || S.state === 'side';
  for (let i = COL_ON_MAP.length - 1; i >= 0; i--) {
    const o = COL_ON_MAP[i];
    o.ph += dt;
    o.g.visible = Math.abs(o.x - V.x) < 400 && Math.abs(o.z - V.z) < 400;
    if (!o.g.visible) continue;
    o.spr.position.y = 1.9 + Math.sin(o.ph * 2.2) * 0.3;
    o.spr.material.rotation = Math.sin(o.ph * 1.5) * 0.25;
    const k = 1 + Math.sin(o.ph * 3) * 0.12;
    o.ring.scale.set(k, k, k);
    if (!live || Math.hypot(o.x - V.x, o.z - V.z) > 3.6 || Math.abs(o.y - V.y) > 3) continue;
    // подобрал: в коллекцию навсегда и тысяча на счёт
    const got = colGot();
    if (!got.includes(o.c.id)) got.push(o.c.id);
    Store.set('dlv-msk-col', got);
    // находка — сразу в кошелёк; в смене ещё и в её счёт
    addWallet(COL_PRIZE);
    if (!S.ride) S.money += COL_PRIZE;
    toast($t('находка!') + ' ' + o.c.name + ' · +' + money(COL_PRIZE) + ' · ' + $t('{i} из {n}', { i: got.length, n: COLLECT.length }));
    scene.remove(o.g);
    COL_ON_MAP.splice(i, 1);
  }
}

/* коллекция в меню: найденные — картинкой, остальные — под вопросом */
/* «мои находки» — лист накладной (collect.js): шапка, полоска, сетка карточек, записка под курсором, [B] назад */
function renderCollect () { COLM.render(elPanelBody, { items: COLLECT, got: colGot(), icon: colIcon, prize: money(COL_PRIZE) }); }

/* ─────────────── маршрут по асфальту ───────────────
   Пунктирная оранжевая дорожка от машины до адреса, как навигатор
   в ГТА. Пересчитывается пару раз в секунду, поэтому объезды
   и срезы отрабатываются сразу. */

let routePts = [];

/* Маршрут — только по асфальту. Узлы графа (NODES) — это вершины самих
   ломаных улиц, поэтому соседние узлы пути всегда соединены куском дороги,
   и на изгибе линия идёт по изгибу. Через пустыри линия резала на концах:
   путь начинался и кончался в ближайшем УЗЛЕ, а он бывал на соседней улице
   через квартал (или на пешеходке, по которой не ехать). Теперь:
   — начало — точка на той улице, где стоит машина (на мосту — на мосту);
     съехал с дороги — короткий отрезок до ближайшего асфальта;
   — дальше кратчайший путь по метрам (A*), а не по числу перекрёстков;
     назад, против хода машины, — на 20 м «дороже», чтобы без нужды не
     разворачивал;
   — конец — точка на дороге у клиента: выбираем по сумме «путь по дороге +
     пешком до клиента вдвое дороже», а если отрезок к клиенту проходит сквозь
     дом — штраф 400 м: двор с другой стороны квартала не берём. Последний
     отрезок к клиенту — единственный не по асфальту (ждут во дворах).
   Куски улиц разложены по клеткам 40 м — свои, только для маршрута. */
const RE_CELL = 40, RE_BACK = 20;
let RE = null;                                    // { a, b: узлы кусков; grid: клетка → номера кусков }
const reKey = (i, j) => (i + 20000) * 40000 + (j + 20000);
function routeEdges () {
  if (RE) return RE;
  const A = [], B = [], grid = new Map();
  for (const e of EDGES.values()) {
    if (e.a > e.b) continue;                       // ребро хранится в обе стороны — берём одно
    const id = A.length, P = NODES[e.a], Q = NODES[e.b];
    A.push(e.a); B.push(e.b);
    const n = Math.max(1, Math.ceil(e.len / 20));  // точки через ≤ 20 м: любая точка куска не дальше 10 м от них
    for (let k = 0; k <= n; k++) {
      const key = reKey(Math.floor(lerp(P.x, Q.x, k / n) / RE_CELL), Math.floor(lerp(P.z, Q.z, k / n) / RE_CELL));
      let c = grid.get(key);
      if (!c) grid.set(key, c = []);
      if (c[c.length - 1] !== id) c.push(id);
    }
  }
  return (RE = { a: Int32Array.from(A), b: Int32Array.from(B), grid, seen: new Uint32Array(A.length), gen: 0 });
}
/* куски улиц в радиусе r: fn(a, b, x, z, d) — концы, ближайшая точка и расстояние до неё */
function edgesNear (x, z, r, fn) {
  const E = routeEdges(), g = ++E.gen, rr = Math.ceil((r + 10) / RE_CELL);
  const ci = Math.floor(x / RE_CELL), cj = Math.floor(z / RE_CELL);
  for (let i = ci - rr; i <= ci + rr; i++)
    for (let j = cj - rr; j <= cj + rr; j++) {
      const c = E.grid.get(reKey(i, j));
      if (!c) continue;
      for (const id of c) {
        if (E.seen[id] === g) continue;
        E.seen[id] = g;
        const P = NODES[E.a[id]], Q = NODES[E.b[id]], dx = Q.x - P.x, dz = Q.z - P.z;
        const t = clamp(((x - P.x) * dx + (z - P.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        const px = P.x + dx * t, pz = P.z + dz * t, d = Math.hypot(px - x, pz - z);
        if (d <= r) fn(E.a[id], E.b[id], px, pz, d);
      }
    }
}
/* отрезок к клиенту проходит сквозь дом? (концы не считаем: клиент стоит у стены) */
function throughHouse (x0, z0, x1, z1) {
  const l = Math.hypot(x1 - x0, z1 - z0);
  for (let d = 1.5; d < l - 1.5; d += 2) { const x = lerp(x0, x1, d / l), z = lerp(z0, z1, d / l); if (inHouse(x, z) || FEST.blocks(x, z)) return true; }   // и сквозь фестиваль (festivals.js)
  return false;
}
/* куда на дороге подъезжать к клиенту: кандидаты на ближних кусках улиц.
   Клиент стоит на месте — считаем один раз на адрес */
const RT = { key: NaN, cand: [], tail: new Map(), g: null, prev: null, stamp: null, gen: 0, hk: [], hv: [] };
function routeTail (x, z) {
  const key = Math.round(x * 2) * 1e6 + Math.round(z * 2);
  if (key === RT.key) return;
  RT.key = key; RT.cand = []; RT.tail = new Map();
  for (const r of [80, 200, 500, 1500]) {
    edgesNear(x, z, r, (a, b, px, pz, d) => {
      if (NODES[a].fx && NODES[a].fx.has(b)) return;   // проезд сквозь фестиваль закрыт блоками (festivals.js)
      RT.cand.push({ a, b, x: px, z: pz, c: d * 2 + (d > 4 && throughHouse(px, pz, x, z) ? 400 : 0) });
    });
    if (RT.cand.length) break;
  }
  RT.cand.forEach((q, i) => {
    for (const n of [q.a, q.b]) {
      const c = Math.hypot(NODES[n].x - q.x, NODES[n].z - q.z) + q.c, t = RT.tail.get(n);
      if (!t || c < t.c) RT.tail.set(n, { c, i });
    }
  });
}
function rtPush (k, v) {
  const K = RT.hk, H = RT.hv;
  let i = K.length;
  K.push(k); H.push(v);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (K[p] <= k) break;
    K[i] = K[p]; H[i] = H[p]; i = p;
  }
  K[i] = k; H[i] = v;
}
function rtPop () {                               // вершина кучи: ключ — RT.top, вернёт узел
  const K = RT.hk, H = RT.hv, v = H[0];
  RT.top = K[0];
  const k = K.pop(), w = H.pop(), n = K.length;
  if (n) {
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && K[c + 1] < K[c]) c++;
      if (K[c] >= k) break;
      K[i] = K[c]; H[i] = H[c]; i = c;
    }
    K[i] = k; H[i] = w;
  }
  return v;
}

/* ломаная от (x0, z0) до (x1, z1) по улицам; h — куда смотрит машина, deck — она на мосту */
function roadPath (x0, z0, x1, z1, h, deck) {
  // откуда: кусок улицы под машиной (мост — если едем по мосту)
  let sa = -1, sb = -1, spx = x0, spz = z0, sc = Infinity;
  for (const r of [30, 120, 400]) {
    edgesNear(x0, z0, r, (a, b, px, pz, d) => {
      const c = d + (!!edgeOf(a, b).road.b !== deck ? 12 : 0);
      if (c < sc) { sc = c; sa = a; sb = b; spx = px; spz = pz; }
    });
    if (sa >= 0) break;
  }
  routeTail(x1, z1);
  if (sa < 0 || !RT.cand.length) return [[x0, z0], [x1, z1]];
  if (!RT.g || RT.g.length !== NODES.length) {
    RT.g = new Float64Array(NODES.length); RT.prev = new Int32Array(NODES.length); RT.stamp = new Uint32Array(NODES.length);
  }
  const G = RT.g, PR = RT.prev, ST = RT.stamp, hx = Math.sin(h), hz = Math.cos(h);
  for (const free of [false, true]) {             // второй заход — сквозь закрытые районы, если иначе не доехать
    const gen = ++RT.gen;
    RT.hk.length = 0; RT.hv.length = 0;
    // та же улица, что у клиента, — прямо по ней
    let best = Infinity, bn = -1, bi = -1, cn = -1, ch = Infinity;
    RT.cand.forEach((q, i) => {
      if (!((q.a === sa && q.b === sb) || (q.a === sb && q.b === sa))) return;
      const c = Math.hypot(q.x - spx, q.z - spz) + q.c;
      if (c < best) { best = c; bi = i; bn = -1; }
    });
    const relax = (n, g, p) => {
      if (ST[n] === gen && G[n] <= g) return;
      ST[n] = gen; G[n] = g; PR[n] = p;
      rtPush(g + Math.hypot(NODES[n].x - x1, NODES[n].z - z1), n);
    };
    for (const n of [sa, sb]) {
      const N = NODES[n], dx = N.x - spx, dz = N.z - spz;
      relax(n, Math.hypot(dx, dz) + (dx * hx + dz * hz < -1 ? RE_BACK : 0), -1);
    }
    while (RT.hk.length) {
      const u = rtPop(), g = G[u];
      const hu = Math.hypot(NODES[u].x - x1, NODES[u].z - z1);
      if (RT.top > g + hu + 1e-6) continue;       // устаревшая запись
      if (RT.top >= best) break;
      if (hu < ch) { ch = hu; cn = u; }
      const t = RT.tail.get(u);
      if (t && g + t.c < best) { best = g + t.c; bn = u; bi = t.i; }
      const U = NODES[u];
      for (const v of U.nb) {
        const N = NODES[v];
        if (!free && (N.out || N.lock) && !RT.tail.has(v)) continue;   // за линию закрытого города и в закрытый район не ведём
        if (U.fx && U.fx.has(v)) continue;           // сквозь фестиваль — блоки (festivals.js)
        relax(v, g + Math.hypot(N.x - U.x, N.z - U.z), u);
      }
    }
    if (bi < 0 && !free) continue;
    // клиент у улицы, не связанной с нашей сетью, — довозим до ближайшей точки, куда доехать можно
    const q = bi >= 0 ? RT.cand[bi] : null, mid = [];
    for (let k = q ? bn : cn; k !== -1; k = PR[k]) mid.push([NODES[k].x, NODES[k].z]);
    mid.reverse();
    return q ? [[x0, z0], [spx, spz], ...mid, [q.x, q.z], [x1, z1]] : [[x0, z0], [spx, spz], ...mid, [x1, z1]];
  }
  return [[x0, z0], [x1, z1]];
}

/* цвет пути — везде, где он нарисован (радар, большая карта, полоса на асфальте, кольцо-маркер — orders.js):
   в пиццерию (назад после заказа, «заедь за сменой») — зелёный, к клиенту — оранжевый */
const ROUTE_HEX = { home: '#3fd15e', client: '#ff8a2b' };
function routeHome () {
  if (S.state === 'back') return true;
  const o = S.order, st = o && o.stops && o.stops[o.idx];
  return !!(st && st.pickup);
}
const routeHex = () => (routeHome() ? ROUTE_HEX.home : ROUTE_HEX.client);

function rebuildRoutePath () {
  const tgt = S.target;
  if (!tgt) { routePts = []; return; }
  const pts = roadPath(V.x, V.z, tgt.x, tgt.z, V.h, V.y - groundH(V.x, V.z) > 2.5);
  routePts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 2);
}

/* ─────────────── гараж и кошелёк ───────────────
   Деньги смены в конце падают в кошелёк — он копится между сменами в
   браузере. В магазине на них покупаются машины: каждая следующая на
   одно сердце крепче. Купленные остаются навсегда, выбранная выезжает на
   смену. Своя оранжевая курьерская — бесплатно, пять сердец. */
const CARS = [
  // каждая следующая — на сердце крепче и быстрее: vmax — максималка, м/с, acc — разгон
  { id: 'dodo', name: $t('Птица-седан'), note: $t('курьерская, своя'), model: 'sedan', hex: '#f0522a', hp: 5, price: 0, vmax: 48, acc: 36 },
  { id: 'drista', name: ADULT ? $t('Мада Дриста') : $t('Мада Тень'), note: $t('тонированный заниженный седан'), model: 'sedan', hex: '#2b2d33', hp: 6, price: 2500, tint: true, low: true, vmax: 51, acc: 38 },
  { id: 'malina', name: $t('Мада Малина'), note: $t('хэтчбек малинового цвета'), model: 'hatch', hex: '#c2185b', hp: 7, price: 5000, vmax: 54, acc: 40 },
  { id: 'shmolf', name: $t('Пельпаген Шмольф'), note: $t('хэтчбек, чёрный'), model: 'hatch', hex: '#17171b', hp: 8, price: 9000, vmax: 57, acc: 42 },
  { id: 'bladen', name: $t('Стрела Спорт'), note: $t('спортивное купе — самый быстрый'), model: 'coupe', hex: '#e0d2b0', hp: 9, price: 15000, vmax: 66, acc: 48 },
];
const wallet = () => +Store.get('dlv-msk-wallet', 0) || 0;
const addWallet = n => Store.set('dlv-msk-wallet', wallet() + n);
const owned = () => { const v = Store.get('dlv-msk-cars', ['dodo']); return Array.isArray(v) ? v : ['dodo']; };
const curCar = () => CAREER ? AUTO.current() : CARS.find(c => c.id === Store.get('dlv-msk-car', 'dodo') && owned().includes(c.id)) || CARS[0];
const makeCourier = () => { const c = curCar(); return CAREER ? AUTO.makeModel(c.id, { see: true }) : makeCar(c.hex, true, c.model, false, Object.assign({}, c, { see: true })); };   // see — курьер за стёклами (carglass.js)
/* карьера: четырнадцать машин, поломки, ямы и гараж Дяди Жени — cars.js. Кошелёк
   career.js может подменить: AUTO.init({ wallet, addWallet }) */
if (CAREER) AUTO.init({ THREE, scene, MAP, CITY, Store, Platform, Snd, DLG, ZN, donated, money, wallet, addWallet, rumble,
  makeCar, put, box, mergeGeos, obb, LIT, LITM, FLAT, LAMPH, LAMP_SPOTS, HUMAN_VC, groundH, nearestRoad, roadWidth, inBounds,
  makeHuman, makePerson, toast, puff, inHouse, SOLIDS, resetCar: () => resetCar(),
  get S () { return S; }, get V () { return V; }, get car () { return car; }, get PIZZA () { return PIZZA; } });

/* машина сбоку — для витрины магазина: силуэт по модели, цвет, стёкла */
function carPic (c) {
  const cv = document.createElement('canvas');
  cv.width = 220; cv.height = 96;
  const x = cv.getContext('2d');
  const low = c.low ? 5 : 0, glass = c.tint ? '#16181e' : '#8fb0cc';
  const shape = {
    sedan: [[18, 62], [30, 46], [70, 44], [92, 24], [150, 24], [170, 44], [206, 48], [206, 66], [18, 66]],
    hatch: [[26, 62], [34, 46], [70, 42], [96, 20], [176, 20], [192, 42], [196, 66], [26, 66]],
    coupe: [[12, 64], [20, 50], [80, 46], [110, 28], [150, 28], [182, 46], [210, 52], [210, 68], [12, 68]],
  }[c.model];
  x.fillStyle = c.hex; x.strokeStyle = '#33210c'; x.lineWidth = 3;
  x.beginPath(); shape.forEach(([a, b], i) => (i ? x.lineTo(a, b + low) : x.moveTo(a, b + low))); x.closePath(); x.fill(); x.stroke();
  // окна
  const win = { sedan: [[96, 28], [146, 28], [162, 44], [80, 44]], hatch: [[100, 24], [172, 24], [184, 42], [76, 42]], coupe: [[114, 32], [148, 32], [172, 46], [90, 46]] }[c.model];
  x.fillStyle = glass;
  x.beginPath(); win.forEach(([a, b], i) => (i ? x.lineTo(a, b + low) : x.moveTo(a, b + low))); x.closePath(); x.fill();
  if (c.model === 'coupe') { x.fillStyle = '#2b2a30'; x.fillRect(14, 44 + low, 22, 5); x.fillRect(22, 44 + low, 4, 10); }
  if (c.id === 'dodo') { x.fillStyle = '#fff'; x.fillRect(104, 14, 34, 10); x.fillStyle = '#f0522a'; x.fillRect(110, 16, 22, 6); }
  // колёса
  for (const wx of c.model === 'coupe' ? [52, 172] : c.model === 'hatch' ? [60, 166] : [56, 170]) {
    x.fillStyle = '#221c19'; x.beginPath(); x.arc(wx, 68, 15, 0, 7); x.fill();
    x.fillStyle = '#d7d2c8'; x.beginPath(); x.arc(wx, 68, 6, 0, 7); x.fill();
  }
  return cv;
}

/* ─── окна меню: «мои коллекции» и «магазин» ─── */
const elPanel = $('panel'), elPanelBody = $('pn-body');
function openPanel (kind) {
  elPanel.hidden = false;
  elPanel.dataset.kind = kind;
  if (kind === 'collect') {
    renderCollect();
  } else renderShop();
}
function closePanel () { elPanel.hidden = true; elPanel.dataset.back = ''; elPanel.dataset.sub = ''; }
/* B / Esc: язык и «стереть прогресс?», открытые из настроек, — назад в настройки */
function panelBack () { if (elPanel.dataset.back === 'settings') renderSettings(elPanel.dataset.kind === 'reset' ? 'set-reset' : undefined); else closePanel(); }

/* ─── площадка: реклама, пауза, язык, настройки ───
   Всё, что зависит от Яндекса или Стима, идёт через Platform. Полноэкранная
   реклама — раз в AD_EVERY доставок сразу после «принять» и перед «ещё
   раз»; частоту сверху режет сама площадка. Видео за награду — только по
   кнопке в конце смены: удваивает заработанное в кошелёк (не в рекорд). */
const AD_EVERY = 3;
const EXT = { paused: false };                     // пауза от площадки: реклама, свернули вкладку
const isPlaying = () => ['drive', 'back', 'handover', 'side', 'loading', 'brief'].includes(S.state);
/* плюс не чаще раза в три минуты своей игры: заказ — короткий «уровень»,
   рекламу между заказами площадка терпит, но не каждые полторы минуты */
const AD_GAP = 180000;
let adLast = performance.now();
const adDue = () => Platform.features.ads && !S.ride && (S.done || 0) > 0 && (S.done || 0) - (S.adDone || 0) >= AD_EVERY && performance.now() - adLast > AD_GAP;
async function showAd () {
  adLast = performance.now();
  Platform.gameplayStop();
  try { await Platform.showInterstitial(); } catch (e) { console.warn('[ad]', e); }
}
const nitroKey = () => (matchMedia('(pointer: coarse)').matches ? $t('кнопку кофе') : PAD.active ? 'A' : 'Shift');
Platform.onPause(() => {
  EXT.paused = true;
  Snd.mute(true);
  for (const k in IN) IN[k] = 0;
  joyReset();
});
Platform.onResume(() => {
  EXT.paused = false;
  Snd.mute(false);
  last = performance.now();                         // кадр после паузы — не прыжком
});

/* конец смены: кнопки «удвоить за рекламу» и «войти в Яндекс» */
function overExtras () {
  const x2 = $('ov-x2'), au = $('ov-auth');
  x2.hidden = !(Platform.features.ads && S.money > 0 && !S.freeRun);
  x2.disabled = false;
  au.hidden = !(Platform.id === 'yandex' && !Platform.player.authorized && !S.freeRun);
  $('ov-extra').hidden = x2.hidden && au.hidden;
}
$('ov-x2').addEventListener('click', async () => {
  const b = $('ov-x2');
  b.disabled = true;
  let ok = false;
  try { ok = await Platform.showRewarded(); } catch (e) { console.warn('[rewarded]', e); }
  if (ok) { addWallet(S.money); popBonus($t('заработок удвоен!'), '+' + money(S.money) + ' ' + $t('в копилку')); b.hidden = true; }
  else b.disabled = false;
});
$('ov-auth').addEventListener('click', async () => {
  try { await Platform.player.auth(); } catch (e) { /* отказался */ }
  if (Platform.player.authorized) {
    $('ov-auth').hidden = true;
    S.name = Platform.player.name || S.name;
    if (S.money > 0 && !S.freeRun) LB.save({ name: S.name, money: S.money, delivered: S.delivered, lv: levelOf(getXP()) }).then(() => LB.render(S.money));
  }
});

/* язык: окно со списком — названия на своих языках. Смена — перезагрузка:
   строки игры переводятся при загрузке. Поэтому язык — только в меню, не в паузе,
   а в самый первый запуск его спрашивают до загрузки (src/langpick.js) */
function renderLangs () {
  elPanel.dataset.kind = 'lang';
  // текущий язык — выбран сразу: A на нём просто закрывает окно
  elPanelBody.innerHTML = '<div class="pn-t">🌐 ' + $t('язык') + '</div><div class="lang-grid">' +
    LANGS.map(l => '<button type="button" lang="' + l + '" data-l="' + l + '"' + (l === curLang() ? ' class="cur" autofocus' : '') + '>' + LANG_NAMES[l] + '</button>').join('') + '</div>';
  elPanelBody.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.l === curLang()) { closePanel(); return; }
    Platform.setLang(b.dataset.l);
    Platform.store.flush && Platform.store.flush();
    setTimeout(() => location.reload(), 150);
  }));
}
/* Настройки — окно почти во всю ширину, крупные строки «что — кнопка» (стиль — delivery.css,
   #panel[data-kind="settings"]). focus — id кнопки, которую только что нажали: после
   перерисовки геймпад остаётся на ней, а не прыгает на крестик. */
const escHtml = s => String(s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
const SHELL = Platform.id === 'steam' && Platform.shell ? Platform.shell : null;   // версия и обновления — только Стим/Электрон
UPD.init(SHELL);                                   // спросить оболочку, что вышло на GitHub (без окон; в браузере и из Стима — ничего)
// тестовые кнопки настроек: в локальных/dev-сборках — всегда, в релизной (CI задаёт BUILD_VERSION → __RELEASE__) — только с ?debug
const testTools = () => !(typeof __RELEASE__ !== 'undefined' && __RELEASE__) || new URLSearchParams(location.search).has('debug');
/* настройки — карусель карточек (settings.js): из главного меню и из паузы одно и то же */
SET.init({
  panel: () => elPanel, body: () => elPanelBody, kind: () => elPanel.dataset.kind,
  inMenu: () => !isPlaying() && !S.paused, career: CAREER, steam: Platform.id === 'steam', Snd, GFX,
  langs: LANGS, langNames: LANG_NAMES, lang: curLang,
  setLang: l => { if (l === curLang()) { closePanel(); return; } Platform.setLang(l); Platform.store.flush && Platform.store.flush(); setTimeout(() => location.reload(), 150); },
  name: () => S.name, askName: cb => CAREERM.askName(cb),
  prof: PROF, openProfiles: () => { closePanel(); CAREERM.openProfiles(() => { if (isPlaying() || S.paused) return; elPanel.hidden = false; elPanel.dataset.kind = 'settings'; renderSettings('set-prof'); }); },   // «назад» из профилей — снова в настройки
  unlock: { on: () => !!(DISTRICTS && testTools()), all: () => DIST.allOpen(), run: () => { CITYOPEN.unlockAll(); closePanel(); CITYOPEN.party(() => CAREERM.menu()); } },
  canReset: () => !isPlaying() && !S.paused, reset: () => renderReset(),
  keys: () => keysInfo(),
  door: CAREER ? { on: () => DOOR.enabled(), set: v => DOOR.setEnabled(v) } : null,   // «мини-игры у клиента: вкл / выкл» (doorstep.js)
  selected: () => padSel(), navReset: () => { padMenu.clear(); if (CAREER) CAREERM.kbClear(); },
});
function renderSettings (focus) { SET.render(focus); }
// какая кнопка сейчас выбрана геймпадом — чтобы перерисовка её не сбросила
const padSel = () => { try { const el = padMenu.selected(); return el && el.isConnected ? el : null; } catch (e) { return null; } };

/* ─── сброс прогресса: второй шаг — экран «что сотрётся, что останется» ───
   Стираем все ключи игры (dlv-*), кроме настроек из RESET_KEEP. Список PROGRESS_KEYS —
   на случай, если localStorage закрыт (Яндекс в iframe): ключи из него тоже обнуляются.
   Через Platform.store — так на Яндексе чистится и облако. Потом — перезагрузка. */
const RESET_KEEP = ['dlv-lang', 'dlv-sound', 'dlv-doorgames', 'dlv-vol-music', 'dlv-vol-sfx', 'dlv-vol-eng', 'dlv-gfx', 'dlv-edition', 'dlv-name', 'dlv-map', 'dlv-money-x8', 'dlv-__ts', 'dlv-ach'];   // dlv-ach — достижения, как в Стиме, не стираются
const PROGRESS_KEYS = [
  'dlv-msk-wallet', 'dlv-msk-cars', 'dlv-msk-car', 'dlv-msk-best', 'dlv-msk-xp', 'dlv-msk-col', 'dlv-msk-tut', 'dlv-msk-guide', 'dlv-msk-nostut', 'dlv-intro', 'dlv-garage-tut', 'dlv-hints',
  'dlv-shifts', 'dlv-stars', 'dlv-crew', 'dlv-story', 'dlv-season', 'dlv-used-addr', 'dlv-lb-local', 'dlv-boss', 'dlv-clock', 'dlv-rev-sale',
  'dlv-car-owned', 'dlv-car-cur', 'dlv-car-up', 'dlv-car-L', 'dlv-car-eng', 'dlv-car-paint', 'dlv-district', 'dlv-dist-shifts', 'dlv-dist-open', 'dlv-city-mode', 'dlv-city-party', 'dlv-knocked', 'dlv-pz-grow', 'dlv-delivered', 'dlv-honor',
  ...Object.keys(ECON.DONATE || {}).map(k => 'dlv-don-' + k),
];
function renderReset () {
  elPanel.dataset.kind = 'reset'; elPanel.dataset.back = 'settings';
  const li = a => '<ul>' + a.map(s => '<li>' + s + '</li>').join('') + '</ul>';
  const gone = [$t('копилка — все деньги'), $t('купленные машины и улучшения'), $t('открытые районы'),
    $t('смены, звёзды и сюжетные заказы'), $t('мои находки'), PROF.on() ? $t('рекорд профиля') : $t('рекорды и таблица на этом устройстве'),
    $t('рейтинг пиццерии и донаты'), $t('обучение — покажется заново')];
  const stay = [$t('язык'), $t('звук'), $t('графика'),
    ...(Platform.features.nameInput ? [$t('имя курьера')] : []), ...(PROF.on() ? [$t('таблица рекордов на этом устройстве'), ...(PROF.list().length > 1 ? [$t('другие профили')] : [])] : [])];
  // «отмена» — первой и выбрана сразу: случайное A ничего не сотрёт
  elPanelBody.innerHTML = '<div class="pn-t">' + (PROF.on() ? $t('стереть прогресс профиля «{name}»?', { name: escHtml(PROF.curName()) }) : $t('стереть весь прогресс?')) + '</div>' +
    '<div class="rs-cols"><div class="rs-gone"><b>' + $t('сотрётся') + '</b>' + li(gone) + '</div>' +
    '<div class="rs-stay"><b>' + $t('останется') + '</b>' + li(stay) + '</div></div>' +
    '<div class="pn-n">' + $t('вернуть будет нельзя: игра начнётся с первой смены, как в первый раз') + (PROF.on() && PROF.list().length > 1 ? ' ' + $t('другие профили не тронет') : '') + '</div>' +
    '<div class="rs-btns"><button type="button" id="rs-no" autofocus>' + $t('отмена') + '</button>' +
    '<button type="button" id="rs-yes" class="set-danger">' + $t('да, стереть всё') + '</button></div>';
  $('rs-no').onclick = () => renderSettings('set-reset');
  $('rs-yes').onclick = resetProgress;
}
async function resetProgress () {
  if (isPlaying()) return;                          // посреди смены не стираем
  $('rs-yes').disabled = true; $('rs-no').disabled = true;
  const keys = new Set(PROGRESS_KEYS);
  for (const k of PROF.keys()) keys.add(k);         // ключи текущего профиля (без профилей — все dlv-*): другие профили не трогаем
  // Яндекс: null, а не «удалить» — если облако не успеет, пустая локальная копия новее и победит при слиянии
  const blank = Platform.id === 'yandex' ? null : undefined;
  for (const k of keys) if (!RESET_KEEP.includes(k) && !(PROF.on() && PROF.shared(k))) Platform.store.set(k, blank);   // общее на все профили (таблица на устройстве) — остаётся
  // облако Яндекса — дождаться отправки (не дольше 4 с), иначе старое вернётся после перезагрузки
  try { await Promise.race([Promise.resolve(Platform.store.flush && Platform.store.flush()), new Promise(r => setTimeout(r, 4000))]); } catch (e) { /* — */ }
  // с профилями (Стим, web) — без перезагрузки: как новый профиль (reprofile); Яндекс — перезагрузка
  let soft = false;
  if (PROF.on() && CAREER) { try { soft = reprofile(); } catch (e) { console.error('[reset] reprofile', e); } }
  if (soft) { closePanel(); CAREERM.menu(); return; }
  location.reload();
}
/* ─── смена профиля без перезагрузки (profiles.js go → api.swap) ───
   Город у всех профилей один — пересобирать его незачем (на Деке это ~10 с). Ключи сохранения уже
   смотрят в новый профиль (profiles.js phys); здесь — заново прочитать то, что игра держит в памяти:
   рекорд и имя, машина, район и пиццерия, перекрытия закрытых районов, находки на карте, сюжет, герои,
   подсказки обучения, рост пиццерий, унесённые ураганом дома, респект, сезон, сессия режиссёра.
   Деньги, смены, звёзды, машины, районы и прочее игра и так читает из сохранения каждый раз.
   Только из меню; посреди смены, в паузе или быстром заезде — false (profiles.js перезагрузит). */
function reprofile () {
  LATE.flush();                                   // город ещё достраивался за меню — сначала достроить (latebuild.js)
  if (isPlaying() || S.paused || QR.on() || FIRST.on()) return false;
  const t0 = performance.now();
  S.best = +Store.get('dlv-msk-best', 0) || 0;
  S.name = Platform.features.nameInput ? Store.get('dlv-name', '') : (Platform.player.name || '');
  elName.value = S.name || '';
  STORY.reload(true); ORD.reloadUsed(); HEROES.reloadSave(); HSTORY.resetSession(); HEROQ.reload(); HINTS.reload(); GROW.reload();
  RESPECT.DEBUG.reload(); DIRECTOR.reload(); SEAS.reloadSaved(); HUR.reload();
  if (CAREER) { AUTO.reprofile(); CAREERM.reprofile(); }
  if (DISTRICTS) { CITYOPEN.repair(); usePizzeria(DIST.cur()); FM.dist = null; DW.ok = null; districtLocks(); }
  startPose();
  resetCar(); carStats(); S.hpMax = S.hp = curCar().hp;
  // находки: у профиля свои — снять разложенные и разложить его ненайденные
  for (const o of COL_ON_MAP) { scene.remove(o.g); o.g.traverse(m => { if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); } if (m.geometry) m.geometry.dispose(); }); }
  COL_ON_MAP.length = 0;
  buildCollect();
  if (DISTRICTS) scatterPickups();
  renderProfile();
  GFX.poke(); requestAnimationFrame(() => requestAnimationFrame(() => CULL.refresh()));   // камера меню переехала к пиццерии профиля: дальнее — сразу
  REPROFILE_MS = performance.now() - t0;
  return true;
}
let REPROFILE_MS = 0;
$('st-lang').addEventListener('click', () => { elPanel.hidden = false; elPanel.dataset.back = ''; renderLangs(); });
/* Выбор карты убран: Стим — это Северск, Яндекс — Москва. Для отладки кнопка
   возвращается адресом ?maps. Смена — перезагрузка */
if (MAP_IDS.length > 1 && new URLSearchParams(location.search).has('maps')) {
  $('st-map').hidden = false;
  $('st-map-n').textContent = $t(MAP.title);
  $('st-map').addEventListener('click', () => {
    elPanel.hidden = false; elPanel.dataset.kind = 'maps';
    elPanelBody.innerHTML = '<div class="pn-t">🗺 ' + $t('карта') + '</div><div class="lang-grid">' +
      MAP_IDS.map(id => '<button type="button" data-m="' + id + '"' + (id === MAP.id ? ' class="cur"' : '') + '><b>' + $t(MAP_META[id].title) + '</b><br><small>' + $t(MAP_META[id].note) + '</small></button>').join('') + '</div>';
    elPanelBody.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.m === MAP.id) { closePanel(); return; }
      Store.set('dlv-map', b.dataset.m); Platform.store.flush && Platform.store.flush();
      setTimeout(() => location.replace(location.pathname + location.search.replace(/[?&]map=[^&]*/, '')), 150);
    }));
  });
}
$('st-lang-n').textContent = LANG_NAMES[curLang()];
$('st-set').addEventListener('click', () => { elPanel.hidden = false; elPanel.dataset.kind = 'settings'; renderSettings(); });
if (Platform.features.quit) { $('st-quit').hidden = false; $('st-quit').addEventListener('click', () => Platform.quit()); }
/* имя спрашиваем только там, где его нет в профиле площадки */
if (!Platform.features.nameInput) for (const el of [$('st-name'), document.querySelector('#start label')]) if (el) el.hidden = true;
$('pn-close').addEventListener('click', closePanel);
elPanel.addEventListener('click', e => { if (e.target === elPanel) closePanel(); });
$('st-col').addEventListener('click', () => openPanel('collect'));
$('st-shop').addEventListener('click', () => openPanel('shop'));

function renderShop () {
  const have = owned(), cur = curCar(), cash = wallet();
  elPanelBody.innerHTML = '<div class="pn-t">' + $t('гараж') + ' <span>' + $t('в копилке {money}', { money: money(cash) }) + '</span></div><div id="shop"></div>' +
    '<div class="pn-n">' + $t('доставляй заказы — деньги сразу падают в копилку и не пропадут, даже если смена сорвётся. Каждая следующая машина — на одно сердце крепче и быстрее') + '</div>';
  const list = $('shop');
  for (const c of CARS) {
    const card = document.createElement('div');
    card.className = 'sh-c' + (c.id === cur.id ? ' cur' : '');
    card.appendChild(carPic(c));
    const info = document.createElement('div');
    info.className = 'sh-i';
    info.innerHTML = '<b>' + c.name + '</b><span>' + c.note + '</span><em>' + '♥'.repeat(c.hp) + '</em>' +
      '<i class="sh-sp">' + $t('{n} км/ч', { n: Math.round(c.vmax * 3.6) }) + '</i>';
    card.appendChild(info);
    const btn = document.createElement('button');
    btn.type = 'button';
    if (c.id === cur.id) { btn.textContent = $t('на смене'); btn.disabled = true; }
    else if (have.includes(c.id)) { btn.textContent = $t('выбрать'); btn.onclick = () => { Store.set('dlv-msk-car', c.id); resetCar(); renderShop(); }; }
    else {
      btn.textContent = money(c.price);
      btn.disabled = cash < c.price;
      btn.onclick = () => {
        if (wallet() < c.price) return;
        addWallet(-c.price);
        Store.set('dlv-msk-cars', owned().concat(c.id));
        Store.set('dlv-msk-car', c.id);
        Platform.store.flush && Platform.store.flush();   // покупка — сохранить сразу
        resetCar();
        Snd.coin();
        renderShop();
      };
    }
    card.appendChild(btn);
    list.appendChild(card);
  }
}

/* ─────────────── игрок ─────────────── */

let car = makeCourier();
DENTM.init({ scene, groundH, onLand: (x, z, v, key, again) => IMPACT.debris({ x, z }, v, key, again) });                     // куда падают отлетевшие детали (cardent.js)
scene.add(car);

/* Скрытая форма V8 (docs/AGENTS.md → «Хвост кадров»): у того, что читает почти весь код кадра (V, S, IN,
   userData машин, машины потока), все поля — с рождения, а числа — сразу «дробные» (dbl). Иначе новое поле
   или первое дробное число в целом поле посреди смены перестраивает форму объекта, и оптимизированный код
   всех, кто его читает (езда, поток, радар, службы…), выбрасывается. Новое поле V/S — дописать сюда. */
function dbl (o, keys) {
  for (const k of keys || Object.keys(o)) { const v = o[k]; if (typeof v === 'number') { o[k] = 0.5; o[k] = v; } }
  return o;
}
const V = dbl({
  x: 0, y: 0, z: 0, h: 0, vx: 0, vz: 0, steerVis: 0, wheel: 0, pitch: 0, roll: 0,
  camX: 0, camY: 0, camZ: 0, camH: 0, splashT: 0,
  vy: 0, air: false, hero: 0, sink: undefined, sinkL: undefined, wade: 0, steer: 0, edgeT: 0, rlift: 0, kerb: 0, lean: 0, camPull: 0,
});

const S = {
  state: 'title',          // title | drive | back | handover | over
  hp: 5, hpMax: 5, money: 0, orders: 0, lvl0: 1, burgers: 0, people: 0, wrecks: 0, scoots: 0, delivered: 0, best: +Store.get('dlv-msk-best', 0) || 0,
  target: null, addr: '', fee: 0, time: 0, timeMax: 1, handT: 0,
  order: null, delivered: 0, name: Platform.features.nameInput ? Store.get('dlv-name', '') : (Platform.player.name || ''),
  routeT: 0, tickT: 0, shake: 0, hurt: 0, paused: false,
  // без времени: срок не тикает и за опоздание смену не снимают;
  // freeRun — смена, в которой режим хоть раз включали: в зачёт она не идёт
  free: false,             // без срока — только «просто покататься»
  ride: false,             // просто катаемся: без заказов и зачёта
  freeRun: false,
  // смена (startShift, career.js, orders.js) — тоже с рождения, значения как в начале смены
  done: 0, mealDone: 0, meals: 0, tipMul: 1, nosEff: 1, mealTime: 0, side: null, shiftT: 0, revives: 0, stops: 0, lunch: null, tips: 0,
  lifeExtra: 0, addrLine: '', lateTold: false, backFee: 0, backNoFine: false,
};
dbl(S);

const IN = dbl({ gas: 0, brake: 0, left: 0, right: 0, hand: 0, nitro: 0, joy: 0, jx: 0 });

/* после сгоревшей смены кузов возвращается целым и некопчёным */
function resetCar () {
  V.sink = undefined; V.sinkL = undefined; V.wade = 0;
  ICEM.reset();                                   // треск льда — с нуля (ice.js)
  dropMesh(car);
  car = makeCourier();
  car.position.set(V.x, V.y, V.z);
  car.rotation.y = V.h;
  scene.add(car);
}

/* ─────────────── физика ─────────────── */
let ACC = 36, VMAX = 48;                       // у каждой машины свои — ставятся в startRun (carStats)
const BRK = 38, TURN = 2.3;
/* Мокрая дорога (дождь, зимой — снег; wet 0…1): боковое сцепление — как быстро гаснет снос вбок, 1/с
   (сухо SIDE_DRY, в ливень SIDE_WET), и тормоз слабее на BRAKE. До 03.10.2026 было 2,6 и 45 % —
   в ливень машину носило под 37° и она казалась неуправляемой; теперь ~18° и тормоз −25 %. */
const WET = { SIDE_DRY: 8.5, SIDE_WET: 5.5, BRAKE: 0.25 };
/* Горка: под гору разгоняет, в гору тянет назад. Настоящие девять и
   восемь десятых здесь почти не чувствуются — у машины аркадный разгон
   в тридцать шесть, поэтому склон усилен. Стоящая машина не катится:
   считаем, что курьер держит ручник. */
const SLOPE_G = 24;

/* Нитро. Бак — от нуля до единицы, полного хватает на пять секунд.
   Пока жжёшь, машину толкает сверх газа и потолок скорости растёт с
   48 до 62 м/с — с двухсот двадцати назад сбрасывает плавно, без стены. */
const NOS = { tank: 0.5, burn: false, was: false, flameT: 0 };
const NOS_BURN = 0.2, NOS_CAN = 0.5, NOS_ACC = 55;
/* Бист-мод (бонус, T секунд): вся машина злее, даже без кнопок — максималка ×VMAX и разгон
   ×ACC на обычном газу (у стартовой машины на прямой ~140 → ~230 км/ч, 160 км/ч — за секунду). Держишь нитро —
   ещё и ракета до ×NITRO максималки, кофе не тратится. docs/CAREER.md «Бонусы на дороге» */
const BEAST = { T: 15, VMAX: 1.6, ACC: 1.8, NITRO: 2 };
let VBOOST = 62;                                  // потолок на нитро: максималка машины плюс четырнадцать
/* в районе подальше машина быстрее: ECON.DISTRICT.SPEED — к максималке и разгону */
/* управляемость машины (econ.js HANDLING, CAR_LIST.handling 1…10): поворот, «тупеет» на скорости, руль, снос.
   Нет числа (детская версия, машины вне карьеры) — как было: руль мгновенный, всё ×1 */
let HANDLE = { h: 5, turn: 1, fall: 1, rate: Infinity, side: 1 };
function carStats () {
  const c = curCar(), k = DISTRICTS ? DIST.speed() : 1; VMAX = (c.vmax || 48) * k; ACC = (c.acc || 36) * k; VBOOST = VMAX + 14;
  HANDLE = c.handling != null ? ECON.handlingK(c.handling) : { h: 5, turn: 1, fall: 1, rate: Infinity, side: 1 };
}
/* габариты кузова: по ним считаются все попадания, а не по одному кругу */
const CAR_L = 2.2, CAR_W = 1.0;
/* стоящая чужая машина (припаркованная, в пробке, на светофоре — медленнее SPEED м/с, с аварийкой, сгоревшая)
   твёрдая: въехал быстрее 18 км/ч — её отбрасывает на KNOCK нашей скорости сближения, мы теряем STOP скорости
   по удару (едущую — по-старому: её всей скоростью, мы теряем 10 %). 09.10.2026, автор: «сквозь стоящие машины
   можно проехать» — её отбрасывало всей нашей скоростью, а летящую мы пропускали сквозь себя */
const CAR_STAND = { SPEED: 1.5, KNOCK: 0.55, STOP: 0.8 };

/* физика машины — шагами не длиннее 1/60 с: на 30 к/с (графика, gfx.js) кадр считает два шага,
   и путь машины тот же, что на 60 (проверка — docs/CAREER.md «Настройки графики») */
function driveSub (dt) {
  const n = Math.max(1, Math.ceil(dt * 60 - 0.05));
  let vf = 0;
  for (let i = 0; i < n; i++) vf = driveStep(dt / n);
  return vf;
}
/* по чему едет колесо, с замёрзшей Томью: лёд на уровне воды (ice.js floor) */
const iceSurf = (x, z, y) => Math.max(surfaceAt(x, z, y), ICEM.floor());
function driveStep (dt) {
  const fx = Math.sin(V.h), fz = Math.cos(V.h);
  const sx = fz, sz = -fx;
  let vf = V.vx * fx + V.vz * fz;
  let vl = V.vx * sx + V.vz * sz;
  const px0 = V.x, pz0 = V.z;

  // уклон под колёсами: разница высот под передней и задней осью
  const hN = iceSurf(V.x + fx * 1.4, V.z + fz * 1.4, V.y), hT = iceSurf(V.x - fx * 1.45, V.z - fz * 1.45, V.y);
  const slope = (hN - hT) / 2.85;
  if (IN.gas || IN.brake || Math.abs(vf) > 1.2) vf -= slope * SLOPE_G * dt;

  const dead = CAREER && AUTO.stalled();          // заглохла: ни газа, ни нитро, катится накатом (cars.js)
  const bk = !dead && FXS.beastT > 0;             // бист-мод: потолок и разгон выше (BEAST)
  const beast = bk && !!IN.nitro;                 // …и с нитро — ракета, кофе не тратится
  const vmax = bk ? VMAX * BEAST.VMAX : VMAX, acc = bk ? ACC * BEAST.ACC : ACC;
  NOS.burn = !!IN.nitro && NOS.tank > 0 && !beast && !dead;
  if (beast) vf += acc * Math.max(0.2, 1 - vf / (VMAX * BEAST.NITRO)) * dt;
  if (NOS.burn) {
    NOS.tank = Math.max(0, NOS.tank - NOS_BURN * (S.nosEff || 1) * dt);
    vf += NOS_ACC * dt;
    if (!NOS.was) { Snd.nosFire(); S.shake = Math.max(S.shake, 0.25); }
  }
  NOS.was = NOS.burn;

  const sand = V.air ? 0 : BEACH.sandAt(V.x, V.z);  // песок пляжа: вязнет — разгон меньше, тормозит, сильнее заносит (beach.js SAND)
  if (IN.gas && !V.air && !dead) vf += acc * Math.max(0.25, 1 - vf / vmax) * (sand ? 1 - BEACH.SAND.ACC * Math.min(1, sand) : 1) * dt;
  const wet = Math.min(1, ENV.rain + SEAS.slip());   // дождь, а зимой и снег
  if (IN.brake) vf -= (vf > 0.4 ? BRK * (1 - wet * WET.BRAKE) : dead ? 0 : ACC * 0.5) * dt;
  if (dead) vf -= vf * 0.55 * dt;                 // без мотора — накатом до остановки
  vf = clamp(vf, -15, beast ? VMAX * BEAST.NITRO : Math.max(VBOOST, vmax));
  if (!NOS.burn && !beast && vf > vmax) vf -= (vf - vmax) * 1.4 * dt;   // после нитро сбрасывает, а не упирается
  vf -= vf * 0.3 * dt;
  if (V.wade && !V.air) vf -= vf * STREAMS.drag(V.wade) * dt;   // вброд по речке или у берега пруда — сильно тормозит (streams.js)
  if (IN.hand) vf -= vf * 1.1 * dt;
  if (sand) vf -= vf * BEACH.SAND.DRAG * sand * dt;
  // ручник пускает в занос, в дождь чуть носит (WET); у баржи снос гаснет медленнее, у резкой — быстрее (HANDLE.side); на песке — тоже носит
  vl *= Math.exp(-(IN.hand ? 2.2 : lerp(WET.SIDE_DRY, WET.SIDE_WET, wet) * HANDLE.side) * (sand ? 1 - BEACH.SAND.SIDE * Math.min(1, sand) : 1) * dt);

  // руль крутится до упора не мгновенно: HANDLE.rate долей упора в секунду (к центру — быстрее)
  const want = IN.joy ? -clamp(IN.jx * 1.35, -1, 1) : (IN.left ? 1 : 0) - (IN.right ? 1 : 0);
  const sr = HANDLE.rate * (Math.abs(want) < Math.abs(V.steer || 0) || want * (V.steer || 0) < 0 ? ECON.HANDLING.RETURN : 1) * dt;
  const sv = V.steer = Number.isFinite(sr) ? (V.steer || 0) + clamp(want - (V.steer || 0), -sr, sr) : want;
  const spd = Math.abs(vf);
  const grip = clamp(spd / 8, 0, 1) / (1 + spd * 0.014 * HANDLE.fall) * (V.air ? 0.15 : 1);
  V.h += sv * TURN * HANDLE.turn * grip * (IN.hand ? 1.5 : 1) * Math.sign(vf || 1) * dt;
  V.steerVis = damp(V.steerVis, sv * 0.42, 10, dt);

  V.vx = fx * vf + sx * vl;
  V.vz = fz * vf + sz * vl;
  V.x += V.vx * dt;
  V.z += V.vz * dt;
  V.wheel += vf * dt / 0.46;

  let out = V.x < BOUNDS.x0 || V.x > BOUNDS.x1 || V.z < BOUNDS.z0 || V.z > BOUNDS.z1;
  // граница-многоугольник: за забор не выехать — откатываем на шаг и гасим скорость
  if (BMASK && !out && !inBorder(V.x, V.z)) { V.x = px0; V.z = pz0; V.vx *= -0.2; V.vz *= -0.2; out = true; }
  if (V.x < BOUNDS.x0) { V.x = BOUNDS.x0; V.vx = Math.max(0, V.vx); }
  if (V.x > BOUNDS.x1) { V.x = BOUNDS.x1; V.vx = Math.min(0, V.vx); }
  if (V.z < BOUNDS.z0) { V.z = BOUNDS.z0; V.vz = Math.max(0, V.vz); }
  if (V.z > BOUNDS.z1) { V.z = BOUNDS.z1; V.vz = Math.min(0, V.vz); }
  // упёрся в край — говорим, что дальше карты нет
  V.edgeT = (V.edgeT || 0) - dt;
  if (out && V.edgeT <= 0 && S.state !== 'title') {
    V.edgeT = 4;
    toast($t(MAP.open && Math.abs(V.z - MAP.open.z) < 30 ? MAP.open.toast : MAP.edgeToast));
  }

  // Река: с моста в неё не съехать — перила, а с берега — можно, и это
  // конец смены: машина уходит под воду. Над водой в полёте с трамплина
  // ещё не тонем — только когда плюхнулись. Пока смена не началась
  // (заставка, загрузка), по-старому отбрасывает назад.
  const live = S.state === 'drive' || S.state === 'back' || S.state === 'handover' || S.state === 'side';
  // речка и пруд (streams.js): мелко — вброд, глубже метра — тонешь, как в Томи
  const wd = V.sink === undefined ? STREAMS.at(V.x, V.z, V.y) : null;
  V.wade = wd && !(V.air && V.y > wd.y + 0.2) ? wd.d : 0;
  if (V.sink !== undefined) {
    V.vx *= Math.exp(-2.2 * dt); V.vz *= Math.exp(-2.2 * dt);
  } else if (wd && wd.d >= STREAMS.CFG.DROWN && live && !(V.air && V.y > wd.y + 0.2)) {
    drown(wd.y);
  } else if (iceSurf(V.x, V.z, V.y) < -0.15 - BEACH.wade(V.x, V.z) && live && !(V.air && V.y > 0.2)) {   // у пляжа — по колено можно (beach.js)
    drown();
  } else if (iceSurf(V.x, V.z, V.y) < -0.15 - BEACH.wade(V.x, V.z)) {
    V.x = px0; V.z = pz0;
    const sp = Math.hypot(V.vx, V.vz);
    V.vx *= -0.25; V.vz *= -0.25;
    if (sp > 3 && V.splashT <= 0) {
      V.splashT = 0.6;
      splash(V.x + fx * 2.6, V.z + fz * 2.6);
      Snd.fx('splash', s => s.noise(0.35, 0.3));
      toast($t(pick(MAP.waterToasts)));
    }
  }
  // лёд зимой (ice.js): глубже 0,5 м под льдом — трещит, треск 1 — проломился, машина уходит под воду
  if (V.sink === undefined && live && !V.air) {
    const br = ICEM.drive(dt, Math.hypot(V.vx, V.vz));
    if (br) drown(br.y);
  }
  V.splashT -= dt;

  // Кузов считаем двумя кругами — носом и кормой. Один круг радиусом
  // с полдлины машины цеплял всё вокруг; так габарит совпадает с тем,
  // что видно на экране, и в просвет между машинами реально пролезаешь.
  const noseX = V.x + fx * CAR_L * 0.55, noseZ = V.z + fz * CAR_L * 0.55;
  const tailX = V.x - fx * CAR_L * 0.55, tailZ = V.z - fz * CAR_L * 0.55;
  const bump = (vn, s) => {
    const mat = IMPACT.solidMat(s);                // во что: стена, столб, забор, дерево (звук удара — impact.js)
    if (vn > 2.5) { sparks(V.x + fx * 2, 0.7, V.z + fz * 2, vn > 12 ? 9 : 4, 0, 0); Snd.impact(vn, mat, { x: V.x + fx * 2, z: V.z + fz * 2 }); }
    if (vn > 13) hurtCar(wallDmg(vn), vn, V.x + fx * 2, V.z + fz * 2, mat);   // до SOFT_HIT.WALL — только мятина
  };
  // Стены домов стоят под любым углом, поэтому выталкиваем в осях самой
  // стены: сначала находим, с какой стороны коробки мы влезли, а потом
  // гасим скорость по её нормали — вдоль стены машина продолжает ехать.
  const r = CAR_W;
  for (const [cx, cz] of [[noseX, noseZ], [tailX, tailZ]]) {
    for (const s of FOREST.withTrees(LAWNP.withSolids(solidsNear(cx, cz), cx, cz), cx, cz)) {     // + ракушки (lawnprops.js)     // + стволы ельника (forest.js)
      if (s.deckY !== undefined && V.y < s.deckY - 1.2) continue; // едем под мостом, не по нему
      // задняя стенка рампы держит только тех, кто заезжает сзади: кто уже
      // на скате или летит над ней — проезжает
      if (s.ramp !== undefined && (V.y > s.ramp - 0.5 || (V.rlift || 0) > 0 || V.air || V.rampSafe > 0 ||
          V.vx * s.rux + V.vz * s.ruz > 0)) continue;
      const dx = cx - s.cx, dz = cz - s.cz;
      const lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
      const px = s.hw + r - Math.abs(lx), pz = s.hd + r - Math.abs(lz);
      if (px <= 0 || pz <= 0) continue;
      let nx, nz, pen;
      // от перил выталкиваем только вбок, не вдоль
      if (px < pz && !s.rail) { const sg = lx < 0 ? -1 : 1; nx = sg * s.cs; nz = sg * s.sn; pen = px; }
      else { const sg = lz < 0 ? -1 : 1; nx = -sg * s.sn; nz = sg * s.cs; pen = pz; }
      // остановка: на скорости ломается и не держит (junk.js)
      if (s.stop && JUNK.stopHit(s, -(V.vx * nx + V.vz * nz), V.vx / (Math.hypot(V.vx, V.vz) || 1), V.vz / (Math.hypot(V.vx, V.vz) || 1), Math.hypot(V.vx, V.vz))) break;
      // стекло веранды: на скорости бьётся и не держит
      if (s.veranda && -(V.vx * nx + V.vz * nz) > 6) {
        const l = Math.hypot(V.vx, V.vz) || 1;
        verandaBreak(s.veranda, V.vx / l, V.vz / l, l);
        V.vx *= 0.85; V.vz *= 0.85;
        break;
      }
      V.x += nx * pen; V.z += nz * pen;
      const vn = V.vx * nx + V.vz * nz;
      if (vn < 0) {
        bump(-vn, s);
        V.vx -= vn * nx * 1.2; V.vz -= vn * nz * 1.2;
      }
      // трёшься бортом: скрежет-петля от скорости вдоль стены (impact.js)
      { const vt = Math.abs(V.vx * -nz + V.vz * nx); if (vt > IMPACT.IMP.RUB_MIN && Math.max(s.hw, s.hd) > 0.8) IMPACT.rub(IMPACT.rubK(vt), 'wall'); }
      break;
    }
  }

  // чужие машины: тоже два круга на кузов. Сильный удар по едущей не тормозит нас,
  // а раскидывает её — иначе таран ощущается как стена. Стоящая (припаркованная, в пробке,
  // на светофоре, с аварийкой) — твёрдая (CAR_STAND, 09.10.2026: «сквозь стоящие машины можно проехать»)
  for (const t of TRAFFIC) {
    if (t.gone) continue;
    if (t.bus) { BUSES.hit(t, noseX, noseZ, tailX, tailZ); continue; }   // автобус — коробкой, его не сдвинуть (buses.js)
    if (Math.hypot(V.x - t.x, V.z - t.z) > 7) continue;
    const tfx = Math.sin(t.h), tfz = Math.cos(t.h);
    let nx = 0, nz = 0, d = 1e9, hx = 0, hz = 0;
    for (const [ax, az] of [[noseX, noseZ], [tailX, tailZ]])
      for (const k of [0.55, -0.55]) {
        const bx = t.x + tfx * (t.hl || CAR_L) * k, bz = t.z + tfz * (t.hl || CAR_L) * k;
        const dd = Math.hypot(ax - bx, az - bz);
        if (dd < d) { d = dd; nx = ax - bx; nz = az - bz; hx = (ax + bx) / 2; hz = (az + bz) / 2; }
      }
    const need = CAR_W * 2;
    if (d > need || d === 0) continue;
    nx /= d; nz /= d;
    // уже отлетает от удара: второй раз не бьём, но и насквозь не пускаем — до 09.10.2026 летящую
    // пропускало сквозь себя, и машина проходила через ту, в которую только что врезалась.
    // Расталкиваемся пополам и делим скорость сближения: догнал — толкнул её дальше
    if (t.knock || t.hitT > 0) {
      const kvx = t.knock ? t.kvx : tfx * t.speed, kvz = t.knock ? t.kvz : tfz * t.speed, pen = need - d;
      V.x += nx * pen * 0.5; V.z += nz * pen * 0.5;
      t.x -= nx * pen * 0.5; t.z -= nz * pen * 0.5;
      const kn = (V.vx - kvx) * nx + (V.vz - kvz) * nz;
      if (kn < 0) {
        V.vx -= kn * nx * 0.5; V.vz -= kn * nz * 0.5;
        if (t.knock) { t.kvx += kn * nx * 0.5; t.kvz += kn * nz * 0.5; }
      }
      continue;
    }
    const tvx = tfx * t.speed, tvz = tfz * t.speed;
    const vn = (V.vx - tvx) * nx + (V.vz - tvz) * nz;
    if (vn >= 0) continue;
    const stand = t.parked || t.stalled || t.wreck || Math.abs(t.speed || 0) < CAR_STAND.SPEED;
    const hit = -vn;
    sparks(hx, 0.8, hz, hit > 10 ? 14 : 5, -nx, -nz);
    Snd.impact(hit, 'car', { x: hx, z: hz });       // удар слоями (impact.js); hurtCar ниже тот же удар не повторит
    { const vt = Math.abs((V.vx - tvx) * -nz + (V.vz - tvz) * nx); if (vt > IMPACT.IMP.RUB_MIN) IMPACT.rub(IMPACT.rubK(vt), 'car'); }   // бортом о машину — скрежет
    // Курьер-соперник, который сам налетел на тебя (на обгоне, из-за
    // спины), — не авария: мягко расталкиваемся, без урона и без злого
    // водителя. Бьёт только таран курьера-конкурента (FOE_SPEC), а злится — только если въехал ты.
    const mine = -(V.vx * nx + V.vz * nz), theirs = tvx * nx + tvz * nz;
    const graze = t.svc === 'rival' && !(t.ramT > 0) && (hit < 20 || theirs > mine);
    if (graze) { t.passT = Math.max(t.passT || 0, 1.5); t.x -= nx * 0.4; t.z -= nz * 0.4; }
    if (hit > 5 && !t.wreck && !graze) {
      // таран: их отбрасывает, мы теряем десятую часть хода
      fullCar(t);
      dentCar(t.mesh, hx, hz, hit);
      t.hp -= hit * 2.4;
      if (t.rival) t.pHitT = tG;                   // въехал ты — сгорит в ближайшие секунды: конкурент — косарь, свой — штраф (onBoom в rivalSpawn)
      knockCar(t, -nx, -nz, stand ? hit * CAR_STAND.KNOCK : hit);
      if (t.ramT > 0) {
        // бодает: толкает курьера туда, куда ехала
        V.vx += nx * hit * 0.7; V.vz += nz * hit * 0.7;
        S.shake = Math.max(S.shake, 0.6);
        t.ramT = 0; t.repath = 1;
      } else if (t.chase) chaseEnd(t, 'caught');   // догнал и врезались — остыл, едет дальше
      else if (!t.parked && hit > 6 && !t.driver) t.angry = 1;     // приземлится — выйдет разбираться (или погонится — chaseStart)
      hurtCar(carDmg(hit), hit, hx, hz, 'car');   // лёгкий удар (до SOFT_HIT.CAR) — только мятина
      t.hitT = 0.5;
      if (stand) {
        // стоящая — как стена, которая чуть подаётся: её толкает на ~половину нашей скорости,
        // мы теряем CAR_STAND.STOP скорости по удару и не проходим сквозь
        V.x += nx * (need - d) * 0.5; V.z += nz * (need - d) * 0.5;
        t.x -= nx * (need - d) * 0.5; t.z -= nz * (need - d) * 0.5;
        V.vx -= vn * nx * CAR_STAND.STOP; V.vz -= vn * nz * CAR_STAND.STOP;
        S.shake = Math.max(S.shake, Math.min(0.6, hit * 0.035));
      } else {
        t.x -= nx * (need - d); t.z -= nz * (need - d);
        V.vx *= 0.9; V.vz *= 0.9;
      }
      if (t.hp <= 0) { wreckCar(t); S.wrecks++; }
    } else if (t.parked || t.stalled) {
      // стоящую машину можно подвинуть: делим толчок пополам, и она
      // проворачивается вокруг точки, в которую упёрлись
      const push = need - d;
      t.x -= nx * push * 0.65; t.z -= nz * push * 0.65;
      V.x += nx * push * 0.35; V.z += nz * push * 0.35;
      const lx = hx - t.x, lz = hz - t.z;
      t.h += clamp((lx * -nz + lz * nx) * 0.02 * hit, -0.08, 0.08);
      V.vx -= vn * nx * 0.45; V.vz -= vn * nz * 0.45;
      t.moved = 1;
      poseOnSlope(t);
    } else {
      V.x += nx * (need - d); V.z += nz * (need - d);
      V.vx -= vn * nx * 0.7; V.vz -= vn * nz * 0.7;
      t.speed *= 0.5;
      S.shake = Math.max(S.shake, Math.min(0.3, hit * 0.02));
    }
  }

  // уличный реквизит: не стена, а то, что сносится
  if (Math.abs(vf) > 4) {
    for (const pr of PROPS) {
      if (pr.down) continue;
      if (Math.abs(pr.x - V.x) > 6 || Math.abs(pr.z - V.z) > 6) continue;
      const hit = Math.hypot(pr.x - noseX, pr.z - noseZ) < pr.r + CAR_W
        || Math.hypot(pr.x - tailX, pr.z - tailZ) < pr.r + CAR_W;
      if (!hit) continue;
      const l = Math.hypot(V.vx, V.vz) || 1;
      knockProp(pr, V.vx / l, V.vz / l, Math.abs(vf));
      Snd.impact(Math.abs(vf) * (pr.kind === 'bench' ? 0.5 : 0.75), pr.kind === 'bench' ? 'fence' : 'pole', { x: pr.x, z: pr.z });   // удар слоями (impact.js)
      S.shake = Math.max(S.shake, 0.35);
      V.vx *= 0.94; V.vz *= 0.94;
    }
  }

  // дворовая мелочь: сносится на любом ходу быстрее пешехода; столбы (it.post — фонари, знаки,
  // рекламные стелы) медленнее POST_KNOCK — твёрдые: упираешься, как в тумбы протеста (08.10.2026)
  {
    const sp = Math.abs(vf), l = Math.hypot(V.vx, V.vz) || 1;
    if (sp > 2.5 || POST_N) smashNear(V.x, V.z, it => {
      if (it.heavy) return;                       // остановки и контейнеры — ниже и в стенах (junk.js)
      if (!it.post && sp <= 2.5) return;
      const rr = it.r + CAR_W, dn = Math.hypot(it.x - noseX, it.z - noseZ), dt2 = Math.hypot(it.x - tailX, it.z - tailZ);
      if (dn >= rr && dt2 >= rr) return;
      if (it.post && sp <= POST_KNOCK) {
        const nose = dn < dt2, cx = nose ? noseX : tailX, cz = nose ? noseZ : tailZ, d = nose ? dn : dt2;
        let nx = cx - it.x, nz = cz - it.z;
        if (d < 1e-4) { nx = nose ? -fx : fx; nz = nose ? -fz : fz; } else { nx /= d; nz /= d; }
        V.x += nx * (rr - d); V.z += nz * (rr - d);
        const vn = V.vx * nx + V.vz * nz;
        if (vn < 0) { V.vx -= vn * nx; V.vz -= vn * nz; Snd.impact(-vn, 'pole', { x: it.x, z: it.z }); }   // упёрся в столб — «донг» (impact.js)
        return;
      }
      { const [m, k] = IMPACT.smashMat(it); Snd.impact(sp * k, m, { x: it.x, z: it.z }); }   // удар слоями: лёгкое — слабее скорости (impact.js)
      smashHit(it, V.vx / l, V.vz / l, sp);
      const k = it.slow || (it.kind === 'dump' ? 0.85 : it.kind === 'bigfence' ? 0.92 : 0.96); V.vx *= k; V.vz *= k;   // высокий забор тормозит заметнее
    });
  }

  { const k = LAWNP.car(noseX, noseZ, tailX, tailZ, CAR_W, vf, V.vx, V.vz); if (k !== 1) { V.vx *= k; V.vz *= k; } }   // мелочь на газоне (lawnprops.js)
  JUNK.car(noseX, noseZ, tailX, tailZ, CAR_W);    // контейнеры: упираются, толкаются, опрокидываются (junk.js)
  CONSTR.car(noseX, noseZ, tailX, tailZ, CAR_W);  // бытовки и техника строек: толкаются, мнутся (construction.js)

  // пешеходов ловим прямоугольником кузова, а не кругом вокруг центра
  const underCar = (px, pz) => {
    const dx = px - V.x, dz = pz - V.z;
    const along = dx * fx + dz * fz, across = dx * sx + dz * sz;
    return Math.abs(along) < CAR_L + 0.5 && Math.abs(across) < CAR_W + 0.35;
  };

  for (const p of PEOPLE) {
    if (p.dead) continue;
    if (!underCar(p.x, p.z)) continue;
    if (Math.abs(vf) < ECON.CLIENT_HIT.SOFT) continue;
    // свой клиент и удар несильный (ECON.CLIENT_HIT) — цел, но без чаевых
    if (Math.abs(vf) < ECON.CLIENT_HIT.HARD && clientBump(p, fx, fz, sx, sz)) continue;
    // медленно (HITS.TIER.FALL) — упал и встал, не «сбит»
    if (HITS.isFall(Math.abs(vf) * 3.6)) { if (!p.fall) { if (p.idle) releaseIdle(p); HITS.fall(p, V.vx, V.vz); Snd.impact(Math.abs(vf), 'person', { x: p.x, z: p.z }); } continue; }
    runOver(p, V.vx, V.vz);
    S.shake = Math.max(S.shake, 0.35);
    V.vx *= 0.99; V.vz *= 0.99;
  }

  for (const p of SCOOTS) {
    if (p.dead || !underCar(p.x, p.z) || Math.abs(vf) < 3) continue;
    runOverScoot(p, V.vx, V.vz);
    S.shake = Math.max(S.shake, 0.3);
  }

  // бургеры: на скорости разлетаются, пешком — просто расталкиваются
  for (const p of PEDS) {
    if (p.dead) continue;
    if (!underCar(p.x, p.z)) continue;
    if (Math.abs(vf) < 3) continue;
    p.dead = 1; p.deadT = rand(6, 14);
    p.grp.visible = false;
    gibBurger(p.x, p.z);
    S.burgers++;
    if (!S.freeRun) RESPECT.add(null, 'burger', true);
    S.shake = Math.max(S.shake, 0.22);
    Snd.squish();
  }

  // визуал: машина стоит на склоне — тангаж по осям, крен по бортам
  // Земля под колёсами — рельеф, мост или рампа. С верхней кромки рампы
  // машина уходит в полёт: вертикальная скорость — по уклону клина.
  const lift = rampLift(V.x, V.z);
  const gnd = iceSurf(V.x, V.z, V.y - (V.rlift || 0)) + lift;
  if (V.air) {
    V.vy -= 22 * dt;
    V.y += V.vy * dt;
    if (V.y <= gnd) {
      if (V.vy < -7) { S.shake = Math.max(S.shake, clamp(-V.vy * 0.04, 0.2, 0.7)); sparks(V.x, 0.3, V.z, 8); Snd.crash(-V.vy, null, 'wall'); }
      V.y = gnd; V.vy = 0; V.air = false;
      V.rampSafe = 1.5;
    }
  } else if ((V.rlift || 0) > RAMP_H * 0.7 && lift < 0.2 && vf > 6) {
    // трамплин не бьёт, а подкидывает: плюс четверть скорости и полёт
    // без урона — в воздухе и ещё полторы секунды после приземления
    const boost = Math.min(1.25, (VMAX * 1.3) / Math.max(vf, 1));
    V.vx *= boost; V.vz *= boost;
    V.air = true;
    V.rampSafe = 1.5;
    V.vy = vf * boost * RAMP_H / RAMP_L * 1.15;
    V.y = V.y + V.vy * dt;
    S.shake = Math.max(S.shake, 0.15);
    Snd.nosFire();
  } else V.y = gnd;
  if (V.sink !== undefined) {
    // тонет: сначала качается на воде, потом нос вниз и ко дну
    V.sink += dt;
    V.air = false;
    V.y = V.sinkL !== undefined ? Math.max(V.sinkL - 3.5, V.sinkL + 0.1 - Math.max(0, V.sink - 0.5) * 1.1)   // в пруду дно у берега близко — уходим сквозь него, под водой не видно
      : Math.max(gnd, 0.1 - Math.max(0, V.sink - 0.5) * 1.1);
    V.bubT = (V.bubT || 0) - dt;
    if (V.bubT <= 0 && V.sink < 3.5) { V.bubT = 0.25; splash(V.x + rand(-1.2, 1.2), V.z + rand(-1.8, 1.8)); }
  }
  V.rlift = lift;
  if (!V.air && V.rampSafe > 0) V.rampSafe -= dt;
  let f2 = iceSurf(V.x + fx * 1.4, V.z + fz * 1.4, V.y) + rampLift(V.x + fx * 1.4, V.z + fz * 1.4);
  let t2 = iceSurf(V.x - fx * 1.45, V.z - fz * 1.45, V.y) + rampLift(V.x - fx * 1.45, V.z - fz * 1.45);
  let l2 = iceSurf(V.x + sx * 0.9, V.z + sz * 0.9, V.y), r2 = iceSurf(V.x - sx * 0.9, V.z - sz * 0.9, V.y);
  // в полёте нос идёт за траекторией, на земле — за уклоном
  if (V.sink !== undefined) { f2 = t2 + clamp(V.sink - 0.5, 0, 1) * -1.3; l2 = r2 = 0; }
  V.pitch = damp(V.pitch, V.air ? -Math.atan2(V.vy, Math.max(4, Math.abs(vf))) * 0.8 : -Math.atan((f2 - t2) / 2.85), V.air ? 4 : 12, dt);
  V.roll = damp(V.roll, V.air ? 0 : Math.atan((l2 - r2) / 1.8), 12, dt);
  // бордюр: тротуар выше дороги — заехал, и кузов стоит на нём
  V.kerb = damp(V.kerb || 0, V.air || lift > 0 ? 0 : Math.max(curbAt(V.x, V.z), paveLift(V.x, V.z)) - STREAMS.sinkBy(V.wade || 0), 22, dt);   // + верх асфальта и плитки (paveLift): колёса не в асфальте
  car.position.set(V.x, V.y + V.kerb, V.z);
  car.rotation.y = V.h;
  car.rotation.x = V.pitch;
  for (const w of car.userData.wheels) w.rotation.x = V.wheel;
  for (const s of car.userData.steer) s.rotation.y = V.steerVis;
  V.lean = damp(V.lean || 0, -V.steerVis * clamp(Math.abs(vf) / VMAX, 0, 1) * 0.12, 6, dt);
  car.rotation.z = V.roll + V.lean;
  ICEM.pose(car, dt);                              // на трещащем льду проседает и качается, проломился — на бок (ice.js)
  CARL.step(car, dt, vf, sv, IN.brake, IN.gas, ENV.night);   // стоп-сигналы, поворотники, задний ход (carlights.js)

  // огонь из выхлопа, пока горит нитро
  if ((NOS.burn || beast) && (NOS.flameT -= dt) <= 0) {
    NOS.flameT = 0.03;
    const pp = car.userData.pipe || { x: 0.45, y: 0.5, z: -2.15 };   // из той же трубы, что и дым (carrear.js)
    nosFlame(V.x + fx * (pp.z - 0.2) + sx * pp.x, V.y + pp.y, V.z + fz * (pp.z - 0.2) + sz * pp.x, -fx, -fz);
  }
  if (!dead) PIX.tires(dt, car, car.userData.careerId, V, vf, IN.gas);   // резкий старт — дымок из-под ведущих колёс (pixfx.js)

  MOTOR_IN.live = true; MOTOR_IN.dead = dead || S.state === 'dying' || V.sink !== undefined;
  MOTOR_IN.brake = IN.brake; MOTOR_IN.hand = IN.hand; MOTOR_IN.side = V.vx * sx + V.vz * sz; MOTOR_IN.air = !!V.air;
  MOTOR_IN.nos = NOS.burn || beast; MOTOR_IN.vmax = VMAX; MOTOR_IN.id = car.userData.careerId || '';
  MOTOR_IN.surf = sand || V.wade ? 0 : (1 - 0.55 * wet) * (1 - 0.8 * Math.min(1, SEAS.snowAmt()));   // визг шин: мокро — тише, снег, песок, вброд — нет
  Snd.engine(vf, !dead && (IN.gas || NOS.burn || beast), MOTOR_IN);
  { const e = cam.matrixWorld.elements; Snd.ear(V.x, V.z, e[0], e[2]); }   // уши — в машине, правое — по камере (звук в мире слева / справа)
  return vf;
}

/* съехал в Москву-реку: большой плюх, и смена кончается — вплавь не довезёшь */
function drown (lvl) {
  V.sink = 0;
  V.sinkL = lvl;                                  // уровень воды: пруд выше Томи (streams.js); нет — Томь, ноль
  V.air = false; V.vy = 0;
  splash(V.x, V.z); splash(V.x + Math.sin(V.h) * 2, V.z + Math.cos(V.h) * 2);
  Snd.fx('drown', s => s.noise(0.6, 0.45));
  S.shake = Math.max(S.shake, 0.4);
  gameOver('утонул', [], { x: V.x, z: V.z });
}

/* Сколько сердец снимает удар (docs/CAREER.md «Сердца»). dmg — сила удара из места
   столкновения: стена/дом wallDmg, машина carDmg, взрыв 1—2, бандиты 1.
   dmg ≤ 0 — толчок: мятина и искры, сердца целы. Легонько (< 0,8) — половинка,
   сильно (< 1,5) — целое, очень сильно — два. */
const HIT_HEARTS = { HALF_BELOW: 0.8, TWO_FROM: 1.5 };
const hitHearts = dmg => (dmg < HIT_HEARTS.HALF_BELOW ? 0.5 : dmg < HIT_HEARTS.TWO_FROM ? 1 : 2);
/* Лёгкие удары (04.10.2026: «за мелкие тычки снимает много»): ниже порога — только мятина.
   Стена/дом/столб: без урона до WALL м/с «в лоб» (было 13 — 47 км/ч); дальше (vn − 13) × 0,16, как было.
   Машина: без урона до CAR м/с сближения (было 5 — 18 км/ч), от CAR до CAR_ONE — половинка,
   дальше (удар − 5) × 0,14, но не меньше целого — сильные удары как были. */
const SOFT_HIT = { WALL: 15, CAR: 8.5, CAR_ONE: 12.5 };
const wallDmg = vn => (vn < SOFT_HIT.WALL ? 0 : (vn - 13) * 0.16);
const carDmg = hit => (hit < SOFT_HIT.CAR ? 0 : hit < SOFT_HIT.CAR_ONE ? 0.5 : Math.max(HIT_HEARTS.HALF_BELOW, (hit - 5) * 0.14));
function hurtCar (dmg, vn, hx, hz, mat) {          // mat — во что (звук удара, impact.js): без него — 'car'
  if (S.state === 'over' || S.state === 'dying' || S.state === 'title') return;
  if (V.air || V.rampSafe > 0) return;            // с трамплина — без урона
  if (FXS.shieldT > 0) { sparks(hx === undefined ? V.x : hx, 1, hz === undefined ? V.z : hz, 6); return; }
  dentCar(car, hx === undefined ? V.x : hx, hz === undefined ? V.z : hz, vn);   // мятина видна на кузове
  REPLAY.crash(vn);                                // авария (от 15 м/с): короткое замедление, тряска, «вуух» (replay.js)
  if (!(dmg > 0)) { rumble(0.3, 120); return; }    // толчок: без урона и без «удара» (смена без ударов цела)
  if (S.hurt > 0) return;
  if (CAREER) AUTO.onHit(vn);                     // удар: мотор изнашивается (cars.js, econ.js BREAK)
  rumble(dmg > 1 ? 0.9 : 0.6, 240);
  S.hp -= SBX.god ? 0 : hitHearts(dmg);          // SBX.god — песочница: бесконечное здоровье (мятины остаются)
  elHearts.classList.remove('hit'); void elHearts.offsetWidth; elHearts.classList.add('hit');
  S.hurt = 0.9;
  S.shake = Math.max(S.shake, 0.5);
  Snd.crash(vn, hx === undefined ? null : { x: hx, z: hz }, mat || 'car');   // тот же удар, что уже прозвучал у места столкновения, не повторится
  hudHearts();
  if (S.hp <= 0) {
    S.hp = 0; hudHearts();
    // своя машина рвётся сильнее чужой: людей рядом разносит, соседние
    // машины подбрасывает и поджигает — дальше они рвутся по цепочке сами
    boom(V.x, V.z, 18);
    gameOver('машина всё', [], { x: V.x, z: V.z });
  }
}

/* ─────────────── камера ─────────────── */
const camInWall = (x, z) => {
  for (const s of solidsNear(x, z)) {
    if (s.deckY !== undefined) continue;          // перила низкие, камера над ними
    const dx = x - s.cx, dz = z - s.cz;
    const lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
    if (Math.abs(lx) < s.hw + 1.2 && Math.abs(lz) < s.hd + 1.2) return true;
  }
  return false;
};

/* мелочь (деревья, столбы, остановки) камеру не толкает — только дома и стены */
const camClear = (x, z) => {
  for (const s of solidsNear(x, z)) {
    if (s.deckY !== undefined || Math.max(s.hw, s.hd) < 3) continue;   // машины, деревья, столбы — не стены
    const dx = x - s.cx, dz = z - s.cz;
    const lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
    if (Math.abs(lx) < s.hw + 0.9 && Math.abs(lz) < s.hd + 0.9) return false;
  }
  return !inWall(x, z, 0.9);   // участки строек и пустырей — не стены (inWall)
};

function camStep (dt, vf) {
  // на нитро кадр расходится шире — скорость видно
  const fov = damp(cam.fov, NOS.burn ? 80 : FXS.beastT > 0 ? (IN.nitro ? 84 : 72) : 64, 3.5, dt);
  if (Math.abs(fov - cam.fov) > 0.02) { cam.fov = fov; cam.updateProjectionMatrix(); }
  /* Смена начинается на парковке: за спиной дом, и камера сзади упёрлась бы
     в стену. Пока машина стоит — кадр спереди-сбоку: машина и светящаяся
     пиццерия за ней. Тронулся — камера плавно уходит за спину. */
  if (V.hero) {
    if (Math.abs(vf) > 0.8 || IN.gas || IN.brake || IN.left || IN.right) V.hero = 0;
    else {
      const fx = Math.sin(V.h), fz = Math.cos(V.h), rx = Math.cos(V.h), rz = -Math.sin(V.h);
      let hx = 0, hz = 0;
      for (const side of [1, -1]) {
        hx = V.x + fx * 10 + rx * 6 * side; hz = V.z + fz * 10 + rz * 6 * side;
        if (camClear(hx, hz)) break;
      }
      V.camX = V.camX === undefined ? hx : damp(V.camX, hx, 4, dt);
      V.camZ = V.camZ === undefined ? hz : damp(V.camZ, hz, 4, dt);
      V.camY = damp(V.camY || V.y + 4, Math.max(V.y + 4.2, groundH(V.camX, V.camZ) + 2.5), 4, dt);
      V.camH = V.h; V.camPull = 0;
      cam.position.set(V.camX, V.camY, V.camZ);
      cam.lookAt(V.x - fx * 3, V.y + 1.6, V.z - fz * 3);
      return;
    }
  }
  V.camH = damp(V.camH, V.h, 4.5, dt);
  const full = 12.5 + clamp(Math.abs(vf) / VMAX, 0, 1) * 4.5;
  /* Камера упирается в дом, а не входит в него: идём от машины назад по
     линии взгляда и останавливаемся у первой стены. Чем ближе пришлось
     подойти, тем выше камера поднимается и смотрит на машину сверху —
     так её и улицу видно даже в узком проезде. Подходит к стене быстро,
     отходит обратно плавно. */
  const sx = Math.sin(V.camH), sz = Math.cos(V.camH);
  let back = full;
  for (let d = 2; d <= full; d += 0.75) if (!camClear(V.x - sx * d, V.z - sz * d)) { back = Math.max(2.5, d - 1.4); break; }
  const pull = full - back;
  V.camPull = damp(V.camPull || 0, pull, pull > (V.camPull || 0) ? 18 : 2.5, dt);
  const eff = full - V.camPull;
  const tx = V.x - sx * eff, tz = V.z - sz * eff;
  V.camX = damp(V.camX, tx, 9, dt);
  V.camZ = damp(V.camZ, tz, 9, dt);
  // отстающая камера всё равно могла оказаться в стене — тогда сразу на место
  if (!camClear(V.camX, V.camZ)) { V.camX = tx; V.camZ = tz; }
  // камера висит над машиной, но не ниже горки у себя за спиной; у стены — выше
  const want = Math.max(V.y + 6.2 + V.camPull * 0.6, groundH(V.camX, V.camZ) + 3);
  V.camY = damp(V.camY, want, 6, dt);
  const sh = S.shake;
  cam.position.set(V.camX + (sh ? rand(-sh, sh) : 0), V.camY + (sh ? rand(-sh, sh) : 0), V.camZ);
  // смотрим туда, куда едем: под гору взгляд опускается вместе с дорогой
  const ax = V.x + Math.sin(V.h) * 7, az = V.z + Math.cos(V.h) * 7;
  cam.lookAt(ax, lerp(V.y, surfaceAt(ax, az, V.y), 0.6) + 2.2, az);
  S.shake = Math.max(0, S.shake - dt * 2.2);
}

/* ─────────────── радар ─────────────── */
const radarC = $('radarc');
const rctx = radarC.getContext('2d');
let radarSize = 132;

function sizeRadar () {
  if (!radarC) return;
  const dpr = Math.min(devicePixelRatio, 2);
  radarSize = radarC.parentElement.clientWidth;
  radarC.width = radarSize * dpr;
  radarC.height = radarSize * dpr;
  rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* радар каждый кадр: вода — из готовой сетки (рельеф не меняется; было ~1100 вызовов groundH на кадр),
   улицы — по сплошной сетке RG и отметке кадра вместо нового Set (без мусора в кадре) */
const RADAR_WST = 9, RADAR_WX0 = Math.floor(BOUNDS.x0 / RADAR_WST) - 20, RADAR_WZ0 = Math.floor(BOUNDS.z0 / RADAR_WST) - 20;
const RADAR_WNX = Math.ceil(BOUNDS.x1 / RADAR_WST) + 20 - RADAR_WX0, RADAR_WNZ = Math.ceil(BOUNDS.z1 / RADAR_WST) + 20 - RADAR_WZ0;
const RADAR_WET = new Uint8Array(RADAR_WNX * RADAR_WNZ);   // 0 — не знаем, 1 — суша, 2 — вода
function radarWater (i, j) {                     // i, j — номер узла сетки 9 м
  const ii = i - RADAR_WX0, jj = j - RADAR_WZ0;
  if (ii < 0 || jj < 0 || ii >= RADAR_WNX || jj >= RADAR_WNZ) return groundH(i * RADAR_WST, j * RADAR_WST) < 0;
  const k = ii * RADAR_WNZ + jj;
  let w = RADAR_WET[k];
  if (!w) RADAR_WET[k] = w = groundH(i * RADAR_WST, j * RADAR_WST) < 0 ? 2 : 1;
  return w === 2;
}
const RADAR_SEEN = new Uint32Array(RSEG.length);
let radarStamp = 0;
const RADAR_W = new Map();                       // толщина линии → номера отрезков: улицы одной толщины — одним штрихом
/* вода, улицы и машины — одним путём на цвет/толщину, а не fillRect/stroke на каждую клетку и отрезок
   (сотни вызовов холста в кадре). Цвета непрозрачные — картинка та же */
function drawRadar () {
  const R = radarSize / 2, s = R / 135;
  rctx.clearRect(0, 0, radarSize, radarSize);
  rctx.save();
  rctx.beginPath(); rctx.arc(R, R, R, 0, Math.PI * 2); rctx.clip();
  // фон, вода и улицы — приглушённые: ярко на радаре только заказ — маршрут и пин адреса
  rctx.fillStyle = '#b3c3a4'; rctx.fillRect(0, 0, radarSize, radarSize);
  rctx.translate(R, R);
  const cs = Math.cos(V.h), sn = Math.sin(V.h);
  const tr = (wx, wz) => {
    const dx = wx - V.x, dz = wz - V.z;
    return [(dz * sn - dx * cs) * s, -(dx * sn + dz * cs) * s];
  };
  // Томь на радаре: без неё непонятно, где мост
  rctx.fillStyle = '#93b2bf';
  const st = RADAR_WST, half = st * s * 0.8;
  const qx = (wx, wz) => ((wz - V.z) * sn - (wx - V.x) * cs) * s, qy = (wx, wz) => -((wx - V.x) * sn + (wz - V.z) * cs) * s;
  rctx.beginPath();
  for (let dx = -144; dx <= 144; dx += st)
    for (let dz = -144; dz <= 144; dz += st) {
      const i = Math.round((V.x + dx) / st), j = Math.round((V.z + dz) / st);
      if (!radarWater(i, j)) continue;
      const wx = i * st, wz = j * st, a = qx(wx, wz), b = qy(wx, wz);
      rctx.rect(a - half, b - half, half * 2, half * 2);
    }
  rctx.fill();
  rctx.strokeStyle = '#9ea1a8'; rctx.lineCap = 'butt';
  const ci = Math.floor(V.x / RCELL), cj = Math.floor(V.z / RCELL);
  const stamp = ++radarStamp;
  for (let i = ci - 3; i <= ci + 3; i++) {
    const ii = i - RG.i0;
    if (ii < 0 || ii >= RG.ni) continue;
    for (let j = cj - 3; j <= cj + 3; j++) {
      const jj = j - RG.j0;
      if (jj < 0 || jj >= RG.nj) continue;
      const cell = RG.cells[ii * RG.nj + jj];
      if (!cell) continue;
      for (let q = 0; q < cell.length; q++) {
        const k = cell[q];
        if (RADAR_SEEN[k] === stamp) continue;
        RADAR_SEEN[k] = stamp;
        const sg = RSEG[k];
        if (sg.c > DRIVE_MAX + 2) continue;
        const lw = Math.max(1.4, sg.w * s);
        let L = RADAR_W.get(lw);
        if (!L) RADAR_W.set(lw, L = { lw, a: [] });
        L.a.push(k);
      }
    }
  }
  for (const W of RADAR_W.values()) {
    const L = W.a;
    if (!L.length) continue;
    rctx.lineWidth = W.lw;
    rctx.beginPath();
    for (let q = 0; q < L.length; q++) { const sg = RSEG[L[q]]; rctx.moveTo(qx(sg.x1, sg.z1), qy(sg.x1, sg.z1)); rctx.lineTo(qx(sg.x2, sg.z2), qy(sg.x2, sg.z2)); }
    rctx.stroke();
    L.length = 0;
  }
  if (RADAR_W.size > 64) RADAR_W.clear();
  rctx.globalAlpha = 0.5;                           // пробки и бандиты — видны, но тише маршрута
  RL.drawRadar(rctx, tr, s);                        // пробки — красным
  WORLD.drawRadar(rctx, tr, s);                     // бандитские районы — красные круги (world.js)
  THUGS.drawRadar(rctx, tr, s);                     // гопники прессуют прохожего — мигающая точка (thugs.js)
  rctx.globalAlpha = 1;
  // проложенный маршрут
  // проложенный маршрут — самое яркое после пина: толще, с тёмной каймой, чтобы читался на любом фоне
  if (routePts.length > 1) {
    rctx.lineJoin = 'round'; rctx.lineCap = 'round';
    rctx.beginPath();
    routePts.forEach((p, i) => { const [a, b] = tr(p[0], p[1]); i ? rctx.lineTo(a, b) : rctx.moveTo(a, b); });
    rctx.strokeStyle = 'rgba(70, 30, 6, 0.6)'; rctx.lineWidth = 6; rctx.stroke();
    rctx.strokeStyle = routeHex(); rctx.lineWidth = 3.6; rctx.stroke();
    rctx.lineCap = 'butt';
  }
  // за краем карты — затемнение: туда не проехать
  {
    const [ax, ay] = tr(BOUNDS.x0, BOUNDS.z0), [bx, by] = tr(BOUNDS.x1, BOUNDS.z0);
    const [cx, cy] = tr(BOUNDS.x1, BOUNDS.z1), [dx, dy] = tr(BOUNDS.x0, BOUNDS.z1);
    rctx.fillStyle = 'rgba(45, 38, 58, 0.45)';
    rctx.beginPath();
    rctx.rect(-R, -R, R * 2, R * 2);
    rctx.moveTo(ax, ay); rctx.lineTo(bx, by); rctx.lineTo(cx, cy); rctx.lineTo(dx, dy); rctx.closePath();
    rctx.fill('evenodd');
  }
  // метки — тихие квадратики, яркое только адрес (пин, ниже). Пересчёт в точку
  // радара — без массива: машин и баллонов много, а рисуем каждый кадр
  const rA = (wx, wz) => ((wz - V.z) * sn - (wx - V.x) * cs) * s;
  const rB = (wx, wz) => -((wx - V.x) * sn + (wz - V.z) * cs) * s;
  const blip = (wx, wz, hex, size) => {
    let a = rA(wx, wz), b = rB(wx, wz);
    const len = Math.hypot(a, b);
    if (len > R - 7) { a *= (R - 7) / len; b *= (R - 7) / len; }
    rctx.fillStyle = hex; rctx.fillRect(a - size, b - size, size * 2, size * 2);
  };
  rctx.globalAlpha = 0.75;
  if (PIZZA) {                                       // пиццерия — домиком (у края радара — прижат к краю)
    let a = rA(PIZZA.x, PIZZA.z), b = rB(PIZZA.x, PIZZA.z);
    const len = Math.hypot(a, b);
    if (len > R - 8) { a *= (R - 8) / len; b *= (R - 8) / len; }
    houseIcon(rctx, a, b, 4, '#ffffff', '#33210c', '#f0522a');
  }
  if (CAREER) AUTO.radar(rctx, tr, R);             // гараж Дяди Жени
  rctx.globalAlpha = 1;
  if (THIEF.p && Math.floor(tG * 4) % 2 === 0) blip(THIEF.p.x, THIEF.p.z, '#ff2d6e', 3.6);
  if (CAREER) RAID.radar(rctx, rA, rB, R);         // налёт на точку — мигает (raid.js)
  rctx.globalAlpha = 0.5;                           // находки, бонусы и машины — тихо, чтобы не спорили с адресом
  // находки — просто фиолетовые точки
  for (const o of COL_ON_MAP) {
    const a = rA(o.x, o.z), b = rB(o.x, o.z);
    if (Math.hypot(a, b) < R - 4) colDot(rctx, a, b, 2.2);
  }
  // кофе и бонусы — только те, что в пределах радара
  for (const n of NITRO_CANS) {
    if (n.t > 0) continue;
    const a = rA(n.x, n.z), b = rB(n.x, n.z);
    if (Math.hypot(a, b) < R - 4) { rctx.fillStyle = PICK_HEX[n.kind]; rctx.fillRect(a - 1.5, b - 1.5, 3, 3); }
  }
  rctx.beginPath();                                 // машины потока — одним путём (их ~300), со своим цветом — по одной
  for (let i = 0; i < TRAFFIC.length; i++) {
    const t = TRAFFIC[i];
    if (t.dot) continue;
    let a = rA(t.x, t.z), b = rB(t.x, t.z);
    const len = Math.sqrt(a * a + b * b);
    if (len > R - 7) { a *= (R - 7) / len; b *= (R - 7) / len; }
    rctx.rect(a - 1.6, b - 1.6, 3.2, 3.2);
  }
  rctx.fillStyle = '#5b6b80'; rctx.fill();
  for (let i = 0; i < TRAFFIC.length; i++) { const t = TRAFFIC[i]; if (t.dot) blip(t.x, t.z, t.dot, 2.4); }
  rctx.globalAlpha = 1;
  rctx.fillStyle = '#fff'; rctx.strokeStyle = '#33210c'; rctx.lineWidth = 1.4;
  rctx.beginPath();
  rctx.moveTo(0, -6.4); rctx.lineTo(4.6, 5.4); rctx.lineTo(0, 2.8); rctx.lineTo(-4.6, 5.4);
  rctx.closePath(); rctx.fill(); rctx.stroke();
  // куда везти — поверх всего: мигающий пин, а за краем радара — стрелка у края
  eachTarget((wx, wz, main, kind) => {
    const a = rA(wx, wz), b = rB(wx, wz), len = Math.hypot(a, b);
    const out = len > R - 6;
    if (main && CAREER) {                            // срочный — ещё и красное кольцо (orders.js)
      const k = out ? (R - 7) / len : 1;
      ORD.radarRing(rctx, a * k, b * k);
    }
    if (out) targetArrow(rctx, a, b, R, main, kind);
    else targetPin(rctx, a, b, 1, main, kind);
  });
  rctx.restore();
}

/* ─────────────── полная карта района ───────────────
   Радар показывает сотню метров вокруг. По клику на него (или Tab,
   или кнопке «карта») раскрывается весь район: подложка рисуется один
   раз после сборки города, а поверх — где ты, пиццерия, заказ,
   маршрут, светофоры в текущей фазе, машины и баллоны нитро. Пока
   карта открыта, игра стоит. */
const elFull = $('fullmap'), fullC = $('fullmapc'), fctx = fullC.getContext('2d');
/* z — экранных (css) пикселей на пиксель подложки, zt — куда зумим (плавно), cx/cy — центр окна
   в пикселях подложки, ax/ay — точка зума от центра окна (под курсором / между пальцами) */
const FM = { base: null, s: 1, pad: 40, open: false, fromPause: false, bw: 0, bh: 0, bb: new Map(), named: [],
  z: 1, zt: 1, cx: 0, cy: 0, ax: 0, ay: 0, t: 0, vw: 0, vh: 0, dpr: 1,
  keys: Object.create(null), padX: 0, padY: 0, padZ: 0, ptr: new Map(), moved: 0, tiles: new Map(), tick: 0 };
const fmX = x => (x - BOUNDS.x0 + FM.pad) * FM.s, fmZ = z => (z - BOUNDS.z0 + FM.pad) * FM.s;

/* рамка (в пикселях подложки) ломаной p с запасом pad метров — чтобы рисовать только видимое */
function fmBox (p, pad) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const q of p) { if (q[0] < a) a = q[0]; if (q[0] > c) c = q[0]; if (q[1] < b) b = q[1]; if (q[1] > d) d = q[1]; }
  return [fmX(a - pad), fmZ(b - pad), fmX(c + pad), fmZ(d + pad)];
}

function buildFullMap () {
  const W = BOUNDS.x1 - BOUNDS.x0 + FM.pad * 2, D = BOUNDS.z1 - BOUNDS.z0 + FM.pad * 2;
  FM.s = Math.min(2, (matchMedia('(pointer: coarse)').matches ? 2200 : 1400) / Math.max(W, D));   // на телефоне карту смотрят крупно
  FM.bw = Math.round(W * FM.s); FM.bh = Math.round(D * FM.s);
  for (const l of CITY.lots) FM.bb.set(l, fmBox(l.p, 0));
  for (const g of CITY.green) FM.bb.set(g, fmBox(g.p, 0));
  for (const q of CITY.paths) FM.bb.set(q, fmBox(q, 2));
  for (const r of CITY.roads) FM.bb.set(r, fmBox(r.p, SIDEWALK(r) + 2));
  for (const b of CITY.buildings) FM.bb.set(b, fmBox(b.p, 1));
  for (const r of CITY.rails || []) FM.bb.set(r, fmBox(r.p, 4));
  // подписи главных улиц — по разу на название, у середины самого длинного куска
  const named = new Map();
  for (const r of CITY.roads) {
    if (!r.n || r.c > 4 || r.x) continue;
    let len = 0;
    for (let i = 1; i < r.p.length; i++) len += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
    if (!named.has(r.n) || named.get(r.n).len < len) named.set(r.n, { r, len });
  }
  for (const [n, { r }] of named) {
    const i = Math.max(1, (r.p.length / 2) | 0), a = r.p[i - 1], b = r.p[i];
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
    FM.named.push({ t: translit(n), x: fmX((a[0] + b[0]) / 2), y: fmZ((a[1] + b[1]) / 2), ang });
  }
  const c = document.createElement('canvas');
  c.width = FM.bw; c.height = FM.bh;
  paintBase(c.getContext('2d'), 1, [0, 0, c.width, c.height]);
  FM.base = c;
}

/* Подложка карты: город целиком (px = 1, один раз) или кусок-плитка при зуме (px — пикселей
   подложки на экранный пиксель, тонкие линии и подписи — в экранных пикселях, не в метрах).
   x уже со своим масштабом в координатах подложки, B — видимая рамка [x0, y0, x1, y1]. */
function paintBase (x, px, B) {
  const vis = o => { const b = FM.bb.get(o); return !b || !(b[2] < B[0] || b[0] > B[2] || b[3] < B[1] || b[1] > B[3]); };
  const poly = (p, fill) => {
    x.beginPath();
    p.forEach((q, i) => (i ? x.lineTo(fmX(q[0]), fmZ(q[1])) : x.moveTo(fmX(q[0]), fmZ(q[1]))));
    x.closePath(); x.fillStyle = fill; x.fill();
  };
  const line = (p, w, col) => {
    x.beginPath();
    p.forEach((q, i) => (i ? x.lineTo(fmX(q[0]), fmZ(q[1])) : x.moveTo(fmX(q[0]), fmZ(q[1]))));
    x.lineWidth = w * FM.s; x.strokeStyle = col; x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke();
  };
  { const a = Math.max(0, B[0]), b = Math.max(0, B[1]); x.fillStyle = '#a6d189'; x.fillRect(a, b, Math.min(FM.bw, B[2]) - a, Math.min(FM.bh, B[3]) - b); }
  // река — по урезу рельефа, клетками сетки высот (только клетки в рамке)
  x.fillStyle = '#6fb0c9';
  const wx = v => v / FM.s - FM.pad + BOUNDS.x0, wz = v => v / FM.s - FM.pad + BOUNDS.z0;
  const i0 = Math.max(0, Math.floor((wx(B[0]) - TX0) / TG)), i1 = Math.min(TNX - 1, Math.ceil((wx(B[2]) - TX0) / TG) + 1);
  const j0 = Math.max(0, Math.floor((wz(B[1]) - TZ0) / TG)), j1 = Math.min(TNZ - 1, Math.ceil((wz(B[3]) - TZ0) / TG) + 1);
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      if (TH[j * TNX + i] >= 0) continue;
      x.fillRect(fmX(TX0 + i * TG - TG / 2), fmZ(TZ0 + j * TG - TG / 2), TG * FM.s + px, TG * FM.s + px);
    }
  for (const l of CITY.lots) if (vis(l)) poly(l.p, l.k === 'park' ? '#a6abb3' : '#c6c5b8');
  for (const g of CITY.green) if (vis(g)) poly(g.p, FOREST.isForest(g) ? '#5f8a4c' : GREEN_HEX[g.k] || '#95c579');   // лес на карте темнее
  for (const q of CITY.paths) if (vis(q)) line(q, 1.6, '#ddd5c6');
  for (const r of CITY.roads) if (vis(r)) line(r.p, SIDEWALK(r), '#e3ded4');
  for (const r of CITY.roads) if (vis(r)) line(r.p, roadWidth(r), r.b ? '#8c8680' : ROAD_HEX[r.c]);
  x.fillStyle = '#f2efe6';
  for (const zb of ZEBRAS) {
    const zx = fmX(zb.x), zz = fmZ(zb.z), m = 12 * FM.s;
    if (zx < B[0] - m || zx > B[2] + m || zz < B[1] - m || zz > B[3] + m) continue;
    x.save(); x.translate(zx, zz); x.rotate(Math.atan2(zb.uz, zb.ux));
    x.fillRect(-ZW / 2 * FM.s, -zb.w / 2 * FM.s, ZW * FM.s, zb.w * FM.s);
    x.restore();
  }
  for (const b of CITY.buildings) {
    if (!vis(b)) continue;
    poly(b.p, KIND_WALL[b.k] || '#e7b9a6');
    x.lineWidth = px; x.strokeStyle = 'rgba(80, 50, 60, 0.55)'; x.stroke();
  }
  // подписи улиц: на целом городе — в метрах (мелкий город), при зуме — экранного размера,
  // но только когда кварталы уже различимы
  const fs = px === 1 ? 9 * FM.s : FM.s / px >= 0.45 ? 12 * px : 0;
  if (fs >= 5 * px) {
    x.font = 'bold ' + fs + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const n of FM.named) {
      const hw = n.t.length * fs * 0.4;
      if (n.x + hw < B[0] || n.x - hw > B[2] || n.y + hw < B[1] || n.y - hw > B[3]) continue;
      x.save(); x.translate(n.x, n.y); x.rotate(n.ang);
      x.lineWidth = fs / 3; x.strokeStyle = 'rgba(255,255,255,0.8)'; x.strokeText(n.t, 0, 0);
      x.fillStyle = '#3a3345'; x.fillText(n.t, 0, 0);
      x.restore();
    }
  }
  // железная дорога: тёмная линия со шпалами-штрихами
  for (const r of CITY.rails || []) {
    if (!vis(r)) continue;
    x.beginPath(); r.p.forEach(([a, b], i) => (i ? x.lineTo(fmX(a), fmZ(b)) : x.moveTo(fmX(a), fmZ(b))));
    x.lineWidth = Math.max(2 * px, 2.4 * FM.s); x.strokeStyle = '#5e5660'; x.setLineDash([]); x.stroke();
    const dl = Math.max(4 * FM.s, 3 * px);
    x.lineWidth = Math.max(px, 1.2 * FM.s); x.strokeStyle = '#e9e4da'; x.setLineDash([dl, dl]); x.stroke();
    x.setLineDash([]);
  }
  // граница-многоугольник: всё за забором затемняем, забор — линией
  if (BORDER) {
    x.save();
    x.beginPath(); x.rect(0, 0, FM.bw, FM.bh);
    BORDER.forEach(([bx, bz], i) => (i ? x.lineTo(fmX(bx), fmZ(bz)) : x.moveTo(fmX(bx), fmZ(bz))));
    x.closePath();
    x.fillStyle = 'rgba(45, 38, 58, 0.5)'; x.fill('evenodd');
    x.lineWidth = Math.max(2 * px, 2 * FM.s); x.strokeStyle = '#8a8478'; x.stroke();
    x.restore();
    for (const k of CITY.kpp || []) { x.fillStyle = '#1f4f9a'; x.fillRect(fmX(k.p[0]) - 5 * px, fmZ(k.p[1]) - 5 * px, 10 * px, 10 * px); }
  }
  // за рамкой не проехать — затемняем
  const pd = FM.pad * FM.s;
  x.fillStyle = 'rgba(45, 38, 58, 0.45)';
  x.fillRect(0, 0, FM.bw, pd); x.fillRect(0, FM.bh - pd, FM.bw, pd);
  x.fillRect(0, pd, pd, FM.bh - pd * 2); x.fillRect(FM.bw - pd, pd, pd, FM.bh - pd * 2);
}

/* Районы на большой карте: закрытые — затемнены, твой — обведён, границы —
   пунктиром, у каждой пиццерии — название района и сколько смен до следующего.
   «Весь город» (cityopen.js): твои все районы — без жёлтой обводки и притушенных чужих.
   Слой рисуется раз и заново — когда сменил район или открылся новый (FM.dist = null). */
function districtLayer () {
  const c = document.createElement('canvas');
  c.width = FM.base.width; c.height = FM.base.height;
  const whole = DIST.city(), C = 30, cur = whole ? -1 : DIST.cur(), open = DIST.opened();
  { const lm = elFull.querySelector('.lg-mine'); if (lm) lm.parentElement.hidden = whole; }   // легенда «твой район»
  const x0 = BOUNDS.x0, z0 = BOUNDS.z0, nx = Math.ceil((BOUNDS.x1 - x0) / C), nz = Math.ceil((BOUNDS.z1 - z0) / C);
  const g = new Int8Array(nx * nz), city = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) g[j * nx + i] = DIST.at(x0 + (i + 0.5) * C, z0 + (j + 0.5) * C);
  // «город» — клетки с улицами и соседние: границы районов рисуем только там, не через реку и лес
  const mark = (px, pz) => {
    const i = Math.floor((px - x0) / C), j = Math.floor((pz - z0) / C);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < nx && b < nz) city[b * nx + a] = 1;
    }
  };
  for (const q of RSEG) {
    const l = Math.hypot(q.x2 - q.x1, q.z2 - q.z1), n = Math.max(1, Math.ceil(l / C));
    for (let k = 0; k <= n; k++) mark(q.x1 + (q.x2 - q.x1) * k / n, q.z1 + (q.z2 - q.z1) * k / n);
  }
  // затемнение: клетка — пиксель маленькой картинки, растягиваем без сглаживания (без швов между клетками).
  // Закрытые — тёмные и в косую штриховку, открытые чужие — чуть притушены, твой — как есть
  const mask = locked => {
    const m = document.createElement('canvas');
    m.width = nx; m.height = nz;
    const mx = m.getContext('2d'), img = mx.createImageData(nx, nz);
    for (let k = 0; k < nx * nz; k++) {
      const d = g[k];
      if (d === cur || (whole && d < open) || (d >= open) !== locked) continue;
      img.data[k * 4] = 30; img.data[k * 4 + 1] = 24; img.data[k * 4 + 2] = 40;
      img.data[k * 4 + 3] = locked ? 170 : 50;
    }
    mx.putImageData(img, 0, 0);
    return m;
  };
  const mL = mask(true), mO = mask(false);
  // границы: между клетками разных районов, только в городе; у твоего — толще и ярче
  const segs = [[], []];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const d = g[j * nx + i];
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      if (i + di >= nx || j + dj >= nz) continue;
      const k2 = (j + dj) * nx + i + di, e = g[k2];
      if (e === d || (!city[j * nx + i] && !city[k2])) continue;
      const ax = x0 + (i + di) * C, az = z0 + (j + dj) * C;
      segs[d === cur || e === cur ? 1 : 0].push(fmX(ax), fmZ(az), fmX(di ? ax : ax + C), fmZ(di ? az + C : az));
    }
  }
  /* слой районов поверх подложки: x — в координатах подложки, px — пикселей подложки на экранный,
     B — видимая рамка. Штриховка закрытых и линии — в экранных пикселях, на любом зуме одинаковые */
  const paint = (x, px, B) => {
    const cv = x.canvas, t = FM.tmp || (FM.tmp = document.createElement('canvas'));
    if (t.width !== cv.width || t.height !== cv.height) { t.width = cv.width; t.height = cv.height; }
    const tx = t.getContext('2d');
    tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, t.width, t.height);
    tx.setTransform(x.getTransform());
    tx.imageSmoothingEnabled = false;
    tx.drawImage(mL, fmX(x0), fmZ(z0), nx * C * FM.s, nz * C * FM.s);
    tx.globalCompositeOperation = 'source-atop';
    tx.strokeStyle = 'rgba(255, 90, 70, 0.35)'; tx.lineWidth = 2.8 * px;
    const st = 15 * px;
    tx.beginPath();
    for (let k = Math.floor((B[0] + B[1]) / st) * st; k < B[2] + B[3]; k += st) { tx.moveTo(k - B[3], B[3]); tx.lineTo(k - B[1], B[1]); }
    tx.stroke();
    tx.globalCompositeOperation = 'source-over';
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(t, 0, 0); x.restore();
    const sm = x.imageSmoothingEnabled;
    x.imageSmoothingEnabled = false;
    x.drawImage(mO, fmX(x0), fmZ(z0), nx * C * FM.s, nz * C * FM.s);
    x.imageSmoothingEnabled = sm;
    x.lineCap = 'round';
    for (const mine of [0, 1]) {
      const q = segs[mine];
      x.beginPath();
      for (let k = 0; k < q.length; k += 4) {
        if (Math.max(q[k], q[k + 2]) < B[0] || Math.min(q[k], q[k + 2]) > B[2] || Math.max(q[k + 1], q[k + 3]) < B[1] || Math.min(q[k + 1], q[k + 3]) > B[3]) continue;
        x.moveTo(q[k], q[k + 1]); x.lineTo(q[k + 2], q[k + 3]);
      }
      x.strokeStyle = mine ? '#ffd85e' : 'rgba(255, 255, 255, 0.6)';
      x.lineWidth = (mine ? 3 : 1.5) * px;
      x.stroke();
    }
  };
  paint(c.getContext('2d'), 1, [0, 0, c.width, c.height]);
  /* подписи и пиццерии районов — каждый кадр поверх всего, в экранных пикселях (fs — размер шрифта) */
  const labels = (x, fs) => {
  x.textAlign = 'center'; x.textBaseline = 'middle';
  DIST.list().forEach((d, i) => {
    const P = PIZZERIAS[i];
    if (!P) return;
    const px = fmX(P.x), pz = fmZ(P.z), locked = i >= open;
    if (P !== PIZZA) {                              // своя — значком пиццерии; «весь город» — та, откуда едешь
      const r = fs * 0.35;
      x.fillStyle = locked ? '#7a7380' : '#f0522a';
      x.fillRect(px - r, pz - r, r * 2, r * 2);
      x.lineWidth = fs / 8; x.strokeStyle = '#fff'; x.strokeRect(px - r, pz - r, r * 2, r * 2);
    }
    const name = (locked ? '× ' : '') + (i + 1) + '. ' + $t(d.name);
    const sub = locked ? (i === open ? $tn(Math.max(1, DIST.need(i - 1) - DIST.shiftsIn(i - 1)), 'закрыт · ещё {n} смена в районе «{prev}»|закрыт · ещё {n} смены в районе «{prev}»|закрыт · ещё {n} смен в районе «{prev}»', { prev: $t(DIST.list()[i - 1].name) }) : $t('закрыт'))
      : i === cur ? $t('ты работаешь здесь') : '';
    x.font = 'bold ' + fs + 'px sans-serif';
    x.lineWidth = fs / 4; x.strokeStyle = 'rgba(40, 32, 52, 0.85)';
    x.strokeText(name, px, pz - fs * 1.4); x.fillStyle = locked ? '#cfc8d6' : i === cur ? '#ffd85e' : '#ffffff'; x.fillText(name, px, pz - fs * 1.4);
    if (sub) {
      x.font = fs * 0.8 + 'px sans-serif';
      x.strokeText(sub, px, pz + fs * 1.3); x.fillStyle = locked ? '#cfc8d6' : '#ffd85e'; x.fillText(sub, px, pz + fs * 1.3);
    }
  });
  };
  return { img: c, labels, paint };
}

/* Метки на радаре и большой карте. Правило одно: самое яркое и мигающее —
   куда везти заказ (красный пин), всё остальное — тихие точки, чтобы не
   спорили с ним. Часы — performance.now(): полная карта рисуется, пока игра
   стоит. Без массивов и строк на метку: радар рисуется каждый кадр. */
const PIN_HOT = '#ff3b1f', PIN_GLOW = '#ffe14d', PIN_EDGE = '#2a1206', COL_DOT = '#9d5cf0';
const PIN_A = Math.acos(1 / 2.6);                 // голова пина радиуса r, острие — в 2.6r под её центром
const pinOn = () => (performance.now() / 1000 * 2.2) % 1 < 0.55;   // мигание ~2 раза в секунду

/* все адреса, куда сейчас везти: текущий S.target (клиент, магазин поручения
   или «назад в пиццерию») и ещё не врученные остальные адреса заказа.
   Несколько адресов разом: стоп с done === false ждёт, даже если он раньше idx.
   cb(x, z, main, kind) — текущий последним, поверх остальных. kind — значок в головке пина:
   'pizza' — заказ «Птицы Пиццы» (обычный, сборный, срочный), 'home' — назад в пиццерию (зелёный
   с домиком), '' — остальное (поручение, сюжет, развоз смены, магазин по пути) */
function eachTarget (cb) {
  if (!S.target) return;
  const o = S.order;
  const pz = o && S.state === 'drive' && (!o.ord || o.ord.type === 'pizza' || o.ord.type === 'urgent') ? 'pizza' : '';
  if (o && S.state === 'drive') for (let i = 0; i < o.stops.length; i++) {
    const st = o.stops[i];
    if (i === o.idx || st.done || (i < o.idx && st.done !== false)) continue;
    const p = st.at || st.peds[0];
    if (p) cb(p.x, p.z, false, pz);
  }
  if (o && S.state === 'drive') for (const q of HSTORY.pins()) cb(q.x, q.z, false, '');   // герой: «заехать по пути» (herostories.js)
  cb(S.target.x, S.target.z, true, routeHome() ? 'home' : pz);
}

/* значки пинов и пиццерии (радар, большая карта): пицца с пепперони и домик. r — радиус головки */
function pizzaIcon (x, a, c, r) {
  x.fillStyle = '#e0a24a'; x.beginPath(); x.arc(a, c, r, 0, Math.PI * 2); x.fill();          // корочка
  x.fillStyle = '#ffd85e'; x.beginPath(); x.arc(a, c, r * 0.76, 0, Math.PI * 2); x.fill();   // сыр
  x.fillStyle = '#c8322a';                                                                       // пепперони
  for (const [dx, dy] of [[-0.3, -0.26], [0.32, -0.12], [-0.06, 0.34]]) { x.beginPath(); x.arc(a + dx * r, c + dy * r, r * 0.2, 0, Math.PI * 2); x.fill(); }
  x.lineWidth = Math.max(0.5, r * 0.08); x.strokeStyle = PIN_EDGE; x.beginPath(); x.arc(a, c, r, 0, Math.PI * 2); x.stroke();
}
/* домик: s — полуширина; fill — стены и крыша, edge — обводка, door — дверь */
function houseIcon (x, a, c, s, fill, edge, door) {
  x.beginPath();
  x.moveTo(a, c - s * 1.15); x.lineTo(a + s * 1.1, c - s * 0.1); x.lineTo(a + s * 0.8, c - s * 0.1); x.lineTo(a + s * 0.8, c + s * 0.9);
  x.lineTo(a - s * 0.8, c + s * 0.9); x.lineTo(a - s * 0.8, c - s * 0.1); x.lineTo(a - s * 1.1, c - s * 0.1); x.closePath();
  x.fillStyle = fill; x.fill();
  if (edge) { x.lineWidth = Math.max(0.8, s * 0.22); x.lineJoin = 'round'; x.strokeStyle = edge; x.stroke(); }
  if (door) { x.fillStyle = door; x.fillRect(a - s * 0.25, c + s * 0.25, s * 0.5, s * 0.65); }
}

/* куда везти: капля острием в адрес, мигает жёлтым ореолом, от острия
   расходится кольцо. u — масштаб, main — текущий адрес (крупнее) */
function targetPin (x, a, b, u, main, kind) {
  const k = (performance.now() / 1000 * 1.25) % 1;
  const r = (main ? 4.6 : 3.6) * u * (kind === 'pizza' || kind === 'home' ? 1.2 : 1), cy = b - r * 2.6;
  const hot = kind === 'home' ? ROUTE_HEX.home : PIN_HOT;     // в пиццерию — зелёный, как путь
  x.globalAlpha = 1 - k;
  x.lineWidth = 2 * u; x.strokeStyle = hot;
  x.beginPath(); x.arc(a, b, (2 + k * 9) * u, 0, Math.PI * 2); x.stroke();
  if (pinOn()) {
    x.globalAlpha = 0.85; x.fillStyle = PIN_GLOW;
    x.beginPath(); x.arc(a, cy, r * 1.9, 0, Math.PI * 2); x.fill();
  }
  x.globalAlpha = 1;
  x.beginPath(); x.moveTo(a, b);
  x.arc(a, cy, r, Math.PI / 2 + PIN_A, Math.PI / 2 - PIN_A);
  x.closePath();
  x.fillStyle = hot; x.fill();
  x.lineWidth = 1.6 * u; x.lineJoin = 'round'; x.strokeStyle = PIN_EDGE; x.stroke();
  if (kind === 'pizza') pizzaIcon(x, a, cy, r * 0.82);
  else if (kind === 'home') houseIcon(x, a, cy, r * 0.55, '#fff', null, ROUTE_HEX.home);
  else { x.fillStyle = '#fff'; x.beginPath(); x.arc(a, cy, r * 0.42, 0, Math.PI * 2); x.fill(); }
}

/* адрес за краем радара — мигающая стрелка у края, остриём в его сторону */
function targetArrow (x, a, b, R, main, kind) {
  const l = Math.hypot(a, b) || 1, ux = a / l, uy = b / l;
  const w = main ? 6 : 4.6, tip = R - 2, base = tip - w * 1.9, bx = ux * base, by = uy * base;
  if (pinOn()) {
    x.globalAlpha = 0.85; x.fillStyle = PIN_GLOW;
    x.beginPath(); x.arc(ux * (tip - w), uy * (tip - w), w * 1.6, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 1;
  }
  x.beginPath();
  x.moveTo(ux * tip, uy * tip); x.lineTo(bx - uy * w, by + ux * w); x.lineTo(bx + uy * w, by - ux * w);
  x.closePath();
  x.fillStyle = kind === 'home' ? ROUTE_HEX.home : PIN_HOT; x.fill();   // в пиццерию — зелёная
  x.lineWidth = 1.6; x.lineJoin = 'round'; x.strokeStyle = PIN_EDGE; x.stroke();
}

/* находка — просто фиолетовая точка: не мигает, не спорит с адресом */
function colDot (x, a, b, r) {
  x.fillStyle = COL_DOT;
  x.beginPath(); x.arc(a, b, r, 0, Math.PI * 2); x.fill();
}

/* ── окно большой карты: зум и сдвиг ──
   Открывается вокруг тебя (по короткой стороне окна — FM_OPEN_M метров), зум — от «пара кварталов»
   (FM_NEAR_M) до «весь город»; плавно, к точке под курсором или между пальцами. Подложка целиком
   (FM.base) — на мелком зуме; при приближении поверх — чёткие плитки, дорисовываются по нескольку
   за кадр и живут в кэше (FM.tiles), чтобы улицы не расплывались в квадратики. */
const FM_OPEN_M = 1000, FM_NEAR_M = 200, FM_TS = 512, FM_TILES = 48;
function fmSize () {
  const v = fullC.parentElement, w = Math.max(1, v.clientWidth), h = Math.max(1, v.clientHeight);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (w === FM.vw && h === FM.vh && dpr === FM.dpr) return;
  FM.vw = w; FM.vh = h; FM.dpr = dpr;
  fullC.width = Math.round(w * dpr); fullC.height = Math.round(h * dpr);
}
const fmMin = () => Math.min(FM.vw / FM.bw, FM.vh / FM.bh);                                   // весь город в окне
const fmMax = () => Math.max(fmMin() * 2, Math.min(FM.vw, FM.vh) / (FM_NEAR_M * FM.s));      // пара кварталов
const fmClampZ = z => clamp(z, fmMin(), fmMax());
function fmClampC () {
  const hw = FM.vw / 2 / FM.z, hh = FM.vh / 2 / FM.z;
  FM.cx = FM.bw <= hw * 2 ? FM.bw / 2 : clamp(FM.cx, hw, FM.bw - hw);
  FM.cy = FM.bh <= hh * 2 ? FM.bh / 2 : clamp(FM.cy, hh, FM.bh - hh);
}
/* зум в k раз к точке (ax, ay) — css-пиксели от центра окна */
function fmZoom (k, ax = 0, ay = 0) { FM.zt = fmClampZ(FM.zt * k); FM.ax = ax; FM.ay = ay; }
const FM_PAN = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
function fmStep () {
  const now = performance.now(), dt = FM.t ? Math.min(0.05, (now - FM.t) / 1000) : 0;
  FM.t = now;
  // стрелки / WASD и стик — сдвиг, примерно экран в секунду; курки — зум
  let mx = FM.padX, my = FM.padY;
  for (const k in FM.keys) if (FM.keys[k] && FM_PAN[k]) { mx += FM_PAN[k][0]; my += FM_PAN[k][1]; }
  if (mx || my) { const sp = Math.min(FM.vw, FM.vh) * 1.1 * dt / FM.z; FM.cx += mx * sp; FM.cy += my * sp; }
  if (FM.padZ) { FM.zt = fmClampZ(FM.zt * Math.pow(2, FM.padZ * dt * 1.8)); FM.ax = FM.ay = 0; }
  if (Math.abs(FM.zt - FM.z) > FM.z * 1e-3) {
    const wx = FM.cx + FM.ax / FM.z, wy = FM.cy + FM.ay / FM.z;           // точка под курсором остаётся под ним
    FM.z = Math.exp(lerp(Math.log(FM.z), Math.log(FM.zt), 1 - Math.exp(-dt * 14)));
    FM.cx = wx - FM.ax / FM.z; FM.cy = wy - FM.ay / FM.z;
  } else FM.z = FM.zt;
  fmClampC();
}
/* плитки детальной подложки: уровень L — 2^L экранных пикселей на пиксель подложки, плитка всегда
   не мельче экрана (рисуется с ужатием 0.5–1). Новых — не больше трёх за кадр, старые — вон */
function fmTiles (x, K, ox, oy, B) {
  const L = Math.min(8, Math.ceil(Math.log2(K))), k = 2 ** L, span = FM_TS / k, px = FM.dpr / k;
  const i0 = Math.max(0, Math.floor(B[0] / span)), i1 = Math.min(Math.ceil(FM.bw / span) - 1, Math.floor(B[2] / span));
  const j0 = Math.max(0, Math.floor(B[1] / span)), j1 = Math.min(Math.ceil(FM.bh / span) - 1, Math.floor(B[3] / span));
  let budget = 3;
  FM.tick++;
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = true;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const key = L + ':' + i + ':' + j;
    let t = FM.tiles.get(key);
    if (!t && budget > 0) {
      budget--;
      const c = document.createElement('canvas');
      c.width = c.height = FM_TS;
      const tx = c.getContext('2d'), TB = [i * span, j * span, (i + 1) * span, (j + 1) * span];
      tx.setTransform(k, 0, 0, k, -TB[0] * k, -TB[1] * k);
      paintBase(tx, px, TB);
      if (DISTRICTS && FM.dist) FM.dist.paint(tx, px, TB);
      t = { c, u: 0 };
      FM.tiles.set(key, t);
    }
    if (!t) continue;
    t.u = FM.tick;
    // края — по целым пикселям: без щелей между плитками
    const dx0 = Math.round(ox + i * span * K), dy0 = Math.round(oy + j * span * K);
    x.drawImage(t.c, dx0, dy0, Math.round(ox + (i + 1) * span * K) - dx0, Math.round(oy + (j + 1) * span * K) - dy0);
  }
  x.restore();
  if (FM.tiles.size > FM_TILES) {
    const old = [...FM.tiles].filter(([, t]) => t.u !== FM.tick).sort((a, b) => a[1].u - b[1].u);
    for (let n = FM.tiles.size - FM_TILES, q = 0; n > 0 && q < old.length; n--, q++) FM.tiles.delete(old[q][0]);
  }
}

function drawFullMap () {
  if (!FM.base) return;
  fmSize(); fmStep();
  const x = fctx, s = FM.s, K = FM.z * FM.dpr;      // K — пикселей экрана (устройства) на пиксель подложки
  // метки «ты / пиццерия / заказ» — в экранных пикселях (u — пикселей подложки на css-пиксель):
  // на любом зуме одного размера, на целом городе не теряются в точку
  const u = 1 / FM.z;
  if (DISTRICTS && !FM.dist) { FM.dist = districtLayer(); FM.tiles.clear(); }
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.fillStyle = '#2d263a'; x.fillRect(0, 0, fullC.width, fullC.height);
  const ox = fullC.width / 2 - FM.cx * K, oy = fullC.height / 2 - FM.cy * K;
  const B = [FM.cx - FM.vw / 2 * u, FM.cy - FM.vh / 2 * u, FM.cx + FM.vw / 2 * u, FM.cy + FM.vh / 2 * u];
  x.setTransform(K, 0, 0, K, ox, oy);
  x.imageSmoothingEnabled = true;
  x.drawImage(FM.base, 0, 0);
  if (DISTRICTS) x.drawImage(FM.dist.img, 0, 0);
  if (K > 1.05) fmTiles(x, K, ox, oy, B);
  RL.drawMap(x, fmX, fmZ, s);                       // пробки — красным
  WORLD.drawMap(x, fmX, fmZ, s);                    // бандитские районы (world.js)
  if (routePts.length > 1) {
    x.beginPath();
    routePts.forEach((p, i) => (i ? x.lineTo(fmX(p[0]), fmZ(p[1])) : x.moveTo(fmX(p[0]), fmZ(p[1]))));
    x.lineWidth = clamp(4 * s, 3.5 * u, 7 * u); x.strokeStyle = routeHex(); x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke();
  }
  for (const g of SIG_GROUPS) {
    const st = lightOf(0);
    x.fillStyle = st === 'g' ? '#3fd15e' : st === 'y' ? '#ffc63d' : '#e8323c';
    x.beginPath(); x.arc(fmX(g.x), fmZ(g.z), clamp(4 * s, 2.5 * u, 4.5 * u), 0, Math.PI * 2); x.fill();
    x.lineWidth = u; x.strokeStyle = '#33210c'; x.stroke();
  }
  // машины и бонусы — в размер улицы, но на целом городе не пропадают, а вблизи не лезут в глаза
  const nb = clamp(2.5 * s, 1.4 * u, 2.6 * u), cb = clamp(2.5 * s, 0.9 * u, 2.6 * u);
  for (const n of NITRO_CANS) {
    if (n.t > 0) continue;
    x.fillStyle = PICK_HEX[n.kind];
    x.fillRect(fmX(n.x) - nb, fmZ(n.z) - nb, nb * 2, nb * 2);
  }
  for (const t of TRAFFIC) {
    x.fillStyle = t.dot || (t.taxi ? '#ffc400' : '#5b6b80');
    x.fillRect(fmX(t.x) - cb, fmZ(t.z) - cb, cb * 2, cb * 2);
  }
  for (const o of COL_ON_MAP) colDot(x, fmX(o.x), fmZ(o.z), 3 * u);   // находки — просто точки
  if (DISTRICTS) FM.dist.labels(x, 12 * u);         // районы: названия и «сколько смен до открытия»
  if (PIZZA) {
    houseIcon(x, fmX(PIZZA.x), fmZ(PIZZA.z), 6.5 * u, '#f0522a', '#fff', '#fff3d6');   // пиццерия — домиком
  }
  if (CAREER) AUTO.mapMark(x, fmX, fmZ, u);       // гараж Дяди Жени
  if (CAREER) RAID.mapMark(x, fmX, fmZ, u);       // налёт на точку — мигает (raid.js)
  if (MAPW.MAP_DOTS.length) MAPW.drawMapDots(x, fmX, fmZ, s);      // ?mapcheck: проблемы карты
  // ты — крупная стрелка по курсу с пульсирующим кольцом: видно сразу на всей карте
  // (кольцо бледнее, чем у адреса: мигает ярче всех только «куда везти»)
  const px = fmX(V.x), pz = fmZ(V.z), pulse = (performance.now() / 900) % 1;
  x.beginPath(); x.arc(px, pz, (12 + pulse * 12) * u, 0, Math.PI * 2);
  x.globalAlpha = (1 - pulse) * 0.5; x.lineWidth = 2 * u; x.strokeStyle = '#ffd85e'; x.stroke(); x.globalAlpha = 1;
  x.beginPath(); x.arc(px, pz, 11 * u, 0, Math.PI * 2);
  x.fillStyle = 'rgba(51, 33, 12, .55)'; x.fill();
  x.save(); x.translate(px, pz); x.rotate(-V.h + Math.PI);
  x.beginPath(); x.moveTo(0, -13 * u); x.lineTo(9 * u, 10 * u); x.lineTo(0, 4 * u); x.lineTo(-9 * u, 10 * u); x.closePath();
  x.fillStyle = '#ffd85e'; x.fill(); x.lineWidth = 2 * u; x.lineJoin = 'round'; x.strokeStyle = '#33210c'; x.stroke();
  x.restore();
  // куда везти — поверх всего, крупным мигающим пином (все адреса заказа)
  eachTarget((wx, wz, main, kind) => targetPin(x, fmX(wx), fmZ(wz), 1.8 * u, main, kind));
}

/* чем дерутся компании сетей в драках (crews.js): в детской версии — подушками,
   иначе битами. Подушка — белый пухлый брусок, не оружие */
function warStick (hex) {
  if (ADULT) return new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.95), new THREE.MeshLambertMaterial({ color: hex }));
  return new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.62), new THREE.MeshLambertMaterial({ color: 0xf4f1ea }));
}

function setFullMap (on) {
  const toPause = !on && FM.open && FM.fromPause;   // открыли из паузы — «закрыть» возвращает в паузу, а не в езду
  FM.fromPause = false;
  FM.open = on;
  elFull.hidden = !on;
  if (isPlaying() && !S.paused) { if (on) Platform.gameplayStop(); else Platform.gameplayStart(); }
  for (const k in FM.keys) FM.keys[k] = 0;
  FM.padX = FM.padY = FM.padZ = 0; FM.ptr.clear(); FM.moved = 0;
  if (on) {
    for (const k in IN) IN[k] = 0; touches.clear(); Snd.engine(0);
    // подсказка под устройство: геймпад / телефон / мышь и клавиатура
    const hint = elFull.querySelector('.fm-top span');
    if (hint) hint.textContent = document.body.classList.contains('pad') ? $t('L2/R2 — зум · стик — двигать · Y или B — закрыть').replace('L2/R2', /054c|playstation|dualsense|dualshock|sony/i.test(PAD.id || '') ? 'L2/R2' : 'LT/RT')
      : document.body.classList.contains('touch') ? $t('щипок — зум · тяни — двигать · тап — закрыть')
      : $t('колесо или +/− — зум · тяни — двигать · esc — закрыть');
    // открывается вокруг тебя, не целиком: по короткой стороне окна — FM_OPEN_M метров
    fmSize();
    FM.z = FM.zt = fmClampZ(Math.min(FM.vw, FM.vh) / (FM_OPEN_M * FM.s)); FM.ax = FM.ay = 0;
    FM.cx = fmX(V.x); FM.cy = fmZ(V.z); FM.t = 0;
    fmClampC();
    drawFullMap();
  }
  if (toPause) setPause(true);
}
$('radar').addEventListener('click', () => setFullMap(true));
{ const t = document.querySelector('.fm-top b'); if (t) { t.removeAttribute('data-i18n'); t.textContent = $t(MAP.title); } }
// легенда: строки только для того, что в этом режиме вообще бывает на карте
for (const el of elFull.querySelectorAll('[data-fm]')) {
  const m = el.dataset.fm;
  el.hidden = !(m === 'career' ? CAREER : m === 'dist' ? DISTRICTS : m === 'kpp' ? !!(BORDER && CITY.kpp && CITY.kpp.length) : true);
}
$('mapbtn').addEventListener('click', () => setFullMap(!FM.open));
// клик без сдвига закрывает карту, как раньше; после перетаскивания — нет
elFull.addEventListener('click', () => { if (FM.moved > 8) { FM.moved = 0; return; } setFullMap(false); });
/* мышь и пальцы: тянуть — двигать, колесо и щипок — зум к точке под курсором / между пальцами */
{
  const view = fullC.parentElement;
  const rel = (cx, cy) => { const r = view.getBoundingClientRect(); return [cx - r.left - r.width / 2, cy - r.top - r.height / 2]; };
  view.addEventListener('wheel', e => {
    if (!FM.open) return;
    e.preventDefault();
    const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    const [ax, ay] = rel(e.clientX, e.clientY);
    fmZoom(Math.exp(-clamp(d, -240, 240) * (e.ctrlKey ? 0.01 : 0.0025)), ax, ay);   // ctrl — щипок на тачпаде
  }, { passive: false });
  view.addEventListener('pointerdown', e => {
    if (!FM.open) return;
    if (!FM.ptr.size) FM.moved = 0;
    FM.ptr.set(e.pointerId, [e.clientX, e.clientY]);
    try { view.setPointerCapture(e.pointerId); } catch (_) {}
    view.classList.add('drag');
  });
  view.addEventListener('pointermove', e => {
    const p = FM.ptr.get(e.pointerId);
    if (!p || !FM.open) return;
    if (FM.ptr.size === 1) {
      const dx = e.clientX - p[0], dy = e.clientY - p[1];
      FM.cx -= dx / FM.z; FM.cy -= dy / FM.z; FM.moved += Math.abs(dx) + Math.abs(dy);
    } else if (FM.ptr.size === 2) {
      const [a, b] = [...FM.ptr.values()];
      const d0 = Math.hypot(a[0] - b[0], a[1] - b[1]), m0 = rel((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      p[0] = e.clientX; p[1] = e.clientY;
      const d1 = Math.hypot(a[0] - b[0], a[1] - b[1]), m1 = rel((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      const wx = FM.cx + m0[0] / FM.z, wy = FM.cy + m0[1] / FM.z;
      FM.z = FM.zt = fmClampZ(FM.z * (d0 > 4 ? d1 / d0 : 1));
      FM.cx = wx - m1[0] / FM.z; FM.cy = wy - m1[1] / FM.z; FM.moved += 99;
    }
    p[0] = e.clientX; p[1] = e.clientY;
  });
  const up = e => { FM.ptr.delete(e.pointerId); if (!FM.ptr.size) view.classList.remove('drag'); };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
  // клавиатура: + / − — зум, стрелки и WASD — двигать (Esc, пробел и Tab закрывают — в общем обработчике)
  addEventListener('keydown', e => {
    if (!FM.open || CH.pause) return;
    const zin = e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+' || e.key === '=';
    const zout = !zin && (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-' || e.key === '_');
    if (zin || zout) { e.preventDefault(); const k = e.repeat ? 1.15 : 1.6; fmZoom(zin ? k : 1 / k); }
    else if (FM_PAN[e.code]) { e.preventDefault(); FM.keys[e.code] = 1; }
  });
  addEventListener('keyup', e => { if (FM.keys[e.code]) FM.keys[e.code] = 0; });
  addEventListener('blur', () => { for (const k in FM.keys) FM.keys[k] = 0; });
}

/* ─────────────── подсказки новичку ───────────────
   Куда ехать — показывает оранжевая полоса маршрута прямо на асфальте
   (ниже). Гайд по управлению — один раз за сессию, когда впервые поехал,
   по пунктам. */

/* ── маршрут на асфальте ──
   Как навигатор в ГТА: оранжевая полоса с бегущими к цели шевронами лежит
   на самой дороге — от капота по маршруту метров на двести, дальше тает.
   Раньше над машиной висела стрелка, но она смотрела на точку маршрута
   наискосок и путала; по полосе поворот видно сам по себе. Горит всю
   только первые ROUTE_TUT заказов за всё время (опыт — доставленные заказы,
   'dlv-msk-xp'): дальше дорогу показывают радар и карта. Ширина 2,4 м —
   с полосу, а не во всё полотно; цвет приглушённый и полупрозрачный,
   ночью темнеет вместе с городом, но слабее — видно, но не слепит.
   Высота — по настилу, где маршрут идёт по мосту, и по рельефу через пару
   метров, чтобы полоса не уходила в горку. Над полотном и разметкой
   (0,14—0,2 м) — на 26 см: не мерцает, а сверху не видно, что висит.
   Геометрия пересобирается, только когда маршрут пересчитан (раз в 0,35 с),
   в одни и те же буферы — без мусора для сборщика на Деке. Каждый кадр —
   только сдвиг текстуры и «откуда начинать» (машина за 0,35 с уезжает на
   десяток метров — хвост за спиной гасится в шейдере). */
const ROUTE_LEN = 200, ROUTE_STEP = 2.5, ROUTE_W = 2.4, ROUTE_LIFT = 0.26, ROUTE_PER = 3, ROUTE_MAX = 220, ROUTE_TUT = 3;
const ROUTE_LINE = (() => {
  // текстура: приглушённая полоса, тонкая кромка чуть темнее, неяркий шеврон остриём к цели.
  // К клиенту — оранжевая (tex), в пиццерию — зелёная (texHome), как линия на радаре и карте (ROUTE_HEX)
  const stripe = (edge, body, chev) => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = edge; x.fillRect(0, 0, 32, 64);
    x.fillStyle = body; x.fillRect(2, 0, 28, 64);
    x.fillStyle = chev;
    x.beginPath(); x.moveTo(16, 8); x.lineTo(28, 26); x.lineTo(28, 38); x.lineTo(16, 20); x.lineTo(4, 38); x.lineTo(4, 26); x.closePath(); x.fill();
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace; tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4;
    return tx;
  };
  const tex = stripe('#a8673d', '#e0925c', '#f0c29a'), texHome = stripe('#3c8a46', '#62c46e', '#b8ecbc');
  const pos = new Float32Array(ROUTE_MAX * 6), uv = new Float32Array(ROUTE_MAX * 4), col = new Float32Array(ROUTE_MAX * 8).fill(1);
  const dist = new Float32Array(ROUTE_MAX * 2), idx = new Uint16Array((ROUTE_MAX - 1) * 6);
  for (let i = 0; i < ROUTE_MAX - 1; i++) {
    const a = i * 2, o = i * 6;
    idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = a + 2; idx[o + 3] = a + 1; idx[o + 4] = a + 3; idx[o + 5] = a + 2;
  }
  const geo = new THREE.BufferGeometry();
  const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr(pos, 3));
  geo.setAttribute('uv', attr(uv, 2));
  geo.setAttribute('color', attr(col, 4));          // альфа в цвете: дальний хвост тает
  geo.setAttribute('aD', attr(dist, 1));            // метры вдоль маршрута — для «откуда начинать»
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  const uFrom = { value: 0 };
  // прозрачная и без записи глубины: рисуется после асфальта и не спорит с ним,
  // а дома и машины, что ближе, её всё равно закрывают
  const mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  mat.userData.glow = 1;                            // в общий FLAT_MATS не берём: ночью темним сами, слабее города (updateRouteLine)
  mat.onBeforeCompile = sh => {
    sh.uniforms.uFrom = uFrom;
    sh.vertexShader = 'attribute float aD;\nvarying float vD;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvD = aD;');
    sh.fragmentShader = 'uniform float uFrom;\nvarying float vD;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>',
      '#include <alphamap_fragment>\ndiffuseColor.a *= smoothstep(uFrom, uFrom + 3.5, vD);');
  };
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;                          // сфера меняется с маршрутом; cull.js такую не снимает
  m.renderOrder = 3; m.visible = false;
  scene.add(m);
  return { m, geo, pos, uv, col, dist, tex, texHome, uFrom, src: null, n: 0, k: 0,
    SX: new Float32Array(ROUTE_MAX), SZ: new Float32Array(ROUTE_MAX), SD: new Float32Array(ROUTE_MAX) };
})();

/* точки через ROUTE_STEP по маршруту (углы — свои точки), высота — по мосту
   или земле, ширина на изломе — по биссектрисе, чтобы угол не сужался */
function buildRouteLine () {
  const R = ROUTE_LINE, P = routePts, SX = R.SX, SZ = R.SZ, SD = R.SD;
  R.src = P; R.k = 0;
  let total = 0;
  for (let i = 1; i < P.length; i++) total += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  SX[0] = P[0][0]; SZ[0] = P[0][1]; SD[0] = 0;
  let n = 1, acc = 0, cut = false;
  for (let i = 1; i < P.length && !cut; i++) {
    const ax = P[i - 1][0], az = P[i - 1][1], bx = P[i][0], bz = P[i][1], l = Math.hypot(bx - ax, bz - az);
    if (l < 0.01) continue;
    const k = Math.max(1, Math.ceil(l / ROUTE_STEP));
    for (let j = 1; j <= k; j++) {
      let d = l * j / k;
      if (acc + d >= ROUTE_LEN) { d = ROUTE_LEN - acc; cut = true; }
      SX[n] = ax + (bx - ax) * d / l; SZ[n] = az + (bz - az) * d / l; SD[n] = acc + d; n++;
      if (n >= ROUTE_MAX) cut = true;
      if (cut) break;
    }
    acc += l;
  }
  R.n = n;
  const { pos, uv, col, dist } = R, end = SD[n - 1];
  let py = surfaceAt(V.x, V.z, V.y);                // как у колеса: под мостом — земля, на мосту — настил
  for (let i = 0; i < n; i++) {
    const x = SX[i], z = SZ[i];
    py = surfaceAt(x, z, py);
    const y = py + curbAt(x, z) + ROUTE_LIFT;
    const i0 = i > 0 ? i - 1 : i, i1 = i < n - 1 ? i + 1 : i;
    let ax = x - SX[i0], az = z - SZ[i0], bx = SX[i1] - x, bz = SZ[i1] - z;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (lb > 1e-3) { bx /= lb; bz /= lb; } else { bx = ax / (la || 1); bz = az / (la || 1); }
    if (la > 1e-3) { ax /= la; az /= la; } else { ax = bx; az = bz; }
    let tx = ax + bx, tz = az + bz;
    const lt = Math.hypot(tx, tz);
    if (lt > 1e-3) { tx /= lt; tz /= lt; } else { tx = bx; tz = bz; }
    const h = ROUTE_W / 2 / Math.max(0.5, tx * bx + tz * bz), nx = -tz * h, nz = tx * h;
    const p = i * 6;
    pos[p] = x + nx; pos[p + 1] = y; pos[p + 2] = z + nz;
    pos[p + 3] = x - nx; pos[p + 4] = y; pos[p + 5] = z - nz;
    // v — от адреса назад: при пересчёте маршрута шевроны не прыгают
    const v = (SD[i] - total) / ROUTE_PER;
    uv[i * 4] = 0; uv[i * 4 + 1] = v; uv[i * 4 + 2] = 1; uv[i * 4 + 3] = v;
    // обрезали по длине — последние 50 м тают; доехала до адреса — яркая до конца
    const a = cut ? clamp((end - SD[i]) / 50, 0, 1) : 1;
    col[i * 8 + 3] = a; col[i * 8 + 7] = a;
    dist[i * 2] = dist[i * 2 + 1] = SD[i];
  }
  const g = R.geo;
  for (const k of ['position', 'uv', 'color', 'aD']) g.attributes[k].needsUpdate = true;
  g.setDrawRange(0, (n - 1) * 6);
}

function updateRouteLine (dt) {
  const R = ROUTE_LINE;
  // опыт читаем, только когда маршрут пересчитан (раз в 0,35 с), а не каждый кадр
  if (R.xpSrc !== routePts) { R.xpSrc = routePts; R.tut = getXP() < ROUTE_TUT; }
  const on = R.tut && !S.ride && (S.state === 'drive' || S.state === 'back' || S.state === 'side') && routePts.length > 1;
  R.m.visible = on;
  if (!on) return;
  if (R.src !== routePts) buildRouteLine();
  if (R.n < 2) { R.m.visible = false; return; }
  // где машина на полосе: ищем вперёд от прошлого куска, недалеко — дёшево
  const { SX, SZ, SD } = R;
  let best = R.k, bd = Infinity, bt = 0;
  for (let i = R.k, e = Math.min(R.n - 1, R.k + 16); i < e; i++) {
    const ax = SX[i], az = SZ[i], dx = SX[i + 1] - ax, dz = SZ[i + 1] - az;
    const t = clamp(((V.x - ax) * dx + (V.z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const qx = ax + dx * t - V.x, qz = az + dz * t - V.z, d = qx * qx + qz * qz;
    if (d < bd) { bd = d; best = i; bt = t; }
  }
  R.k = best;
  R.uFrom.value = SD[best] + (SD[best + 1] - SD[best]) * bt + 2;   // начинается у капота
  R.tex.offset.y = (R.tex.offset.y - dt * 0.6) % 1;              // шевроны бегут к цели
  R.texHome.offset.y = R.tex.offset.y;
  const map = routeHome() ? R.texHome : R.tex;                    // в пиццерию — зелёная, к клиенту — оранжевая
  if (R.m.material.map !== map) { R.m.material.map = map; R.m.material.needsUpdate = true; }
  R.m.material.color.setScalar(lerp(1, 0.6, ENV.night));        // ночью тише: город темнеет до 0,34, полоса — до 0,6
}

/* бывшая плашка по центру сверху («выбил конкурента!», «час пик»…) — теперь реплика Толика на ходу
   (dialog.js line: лицо, текст печатается, мир не стоит, уходит сама). Текст — как есть, не HTML.
   Что убрано совсем и что ушло в тост — docs/CAREER.md «Реплики на ходу». #bonus остался только
   якорем для чека оплаты (payFxEl) */
const elBonus = $('bonus');
function popBonus (title, sub) {
  title = String(title || ''); sub = String(sub || '');
  const text = title && sub ? title + (/[.!?…:]$/.test(title) ? ' ' : '. ') + sub : title || sub;
  if (!text) return;
  CL.event('line ' + text);
  const p = CAREER && CHAT.person ? CHAT.person() : null;
  DLG.line({ person: p, name: $t('Толик управляющий'), text, color: '#3fae5a' });
  Snd.coin();
}

/* Оплата за адрес — деньгами, а не строкой сверху: под машиной падает
   кучка (купюры — за заказ, монеты — чаевые и за скорость), рядом крупно
   «+N ₽» и чек: «заказ — X», «за скорость — Y», «чаевые — Z», «опоздал — −W»
   (строки в сумме = N). Через полторы секунды кучка улетает в кошелёк, там
   цифра докручивается. Всё вместе — 2,4 с, ввод не перехватывает. Узлы
   создаются один раз (14 штук) и переиспользуются.
   rows — [подпись, сумма, 'tip' | 'neg' | ''], title — строка над суммой,
   face — { person, mood }: лицо клиента рядом с ней (payMood). */
const PAYFX = { el: null, pile: null, sum: null, chk: null, title: null, bits: [], t1: 0, t2: 0 };
const PAYFX_N = 14;
function payFxEl () {
  if (PAYFX.el) return PAYFX;
  const el = document.createElement('div');
  el.id = 'payfx'; el.hidden = true;
  el.innerHTML = '<div class="pf-pile"></div><div class="pf-r"><div class="pf-hd"><div class="pf-face" hidden><img alt=""><i></i><i></i><i></i></div><div class="pf-t"></div></div><div class="pf-sum"></div><div class="pf-chk"></div></div>';
  (elBonus.parentNode || document.body).appendChild(el);
  PAYFX.el = el; PAYFX.pile = el.querySelector('.pf-pile'); PAYFX.sum = el.querySelector('.pf-sum');
  PAYFX.chk = el.querySelector('.pf-chk'); PAYFX.title = el.querySelector('.pf-t'); PAYFX.face = el.querySelector('.pf-face');
  for (let k = 0; k < PAYFX_N; k++) {
    const b = document.createElement('i');
    b.textContent = '₽';
    b.style.setProperty('--r', (Math.random() * 40 - 20).toFixed(0) + 'deg');
    PAYFX.pile.appendChild(b); PAYFX.bits.push(b);
  }
  return PAYFX;
}
function popPay (total, rows, title, face) {
  const P = payFxEl();
  // лицо клиента (то же, что в карточке заказа) с настроением — payMood
  P.face.hidden = !(face && face.person);
  if (!P.face.hidden) { P.face.className = 'pf-face ' + face.mood; P.face.firstChild.src = faceDataURL(face.person, 64, face.mood); }
  // сколько чего падает: купюр — по доле заказа, монет — по доле чаевых и скорости;
  // опоздал — кучка меньше настолько, насколько срезали
  let plus = 0, coin = 0;
  for (const r of rows) if (r[1] > 0) { plus += r[1]; if (r[2] === 'tip') coin += r[1]; }
  const n = clamp(Math.round(PAYFX_N * (plus > 0 ? total / plus : 1)), 3, PAYFX_N);
  const nc = coin > 0 ? clamp(Math.round(n * coin / plus), 1, n - 1) : 0, nb = n - nc;
  P.bits.forEach((b, k) => {
    const kind = k < nb ? 'b' : k < n ? 'c' : 'x';
    if (b.className !== kind) b.className = kind;
    if (kind === 'x') return;
    // купюры — внизу рядами со сдвигом, монеты — сверху россыпью
    const j = kind === 'b' ? k : k - nb, row = kind === 'b' ? Math.floor(j / 3) : 2 + Math.floor(j / 4);
    const col = kind === 'b' ? j % 3 : j % 4;
    b.style.left = (kind === 'b' ? 2 + col * 32 + (row % 2) * 10 : 8 + col * 21) + (Math.random() * 6 - 3) + '%';
    b.style.bottom = (kind === 'b' ? row * 17 : 30 + (row - 2) * 14) + Math.random() * 4 + '%';
    b.style.setProperty('--d', (k * 0.045).toFixed(3) + 's');
    b.style.setProperty('--fd', ((n - 1 - k) * 0.03).toFixed(3) + 's');
  });
  P.title.textContent = title || '';
  P.sum.textContent = (total >= 0 ? '+' : '−') + money(Math.abs(total));
  P.sum.classList.toggle('late', rows.some(r => r[2] === 'neg'));
  P.chk.innerHTML = rows.map(r => '<p class="' + (r[2] || '') + '"><span>' + r[0] + '</span><b>' + (r[1] < 0 ? '−' : '') + money(Math.abs(r[1])) + '</b></p>').join('');
  const el = P.el;
  clearTimeout(P.t1); clearTimeout(P.t2);
  RQ.hold(2500);                                   // чек и деньги в пачку — следующие ждут (ridequeue.js)
  el.hidden = false;
  el.classList.remove('on', 'fly'); void el.offsetWidth; el.classList.add('on');
  // кошелёк в карьере не пускает свою летящую цифру — деньги долетят кучкой
  for (let i = 0; i < Math.min(3, 1 + Math.floor(n / 5)); i++) setTimeout(() => Snd.coin(), i * 170);
  P.t1 = setTimeout(() => {
    // куда лететь: середина кошелька минус где лежит каждая бумажка (один замер на всех)
    const w = elMoney.getBoundingClientRect(), wx = w.left + w.width / 2, wy = w.top + w.height / 2;
    for (let k = 0; k < n; k++) {
      const b = P.bits[k], r = b.getBoundingClientRect();
      b.style.setProperty('--fx', Math.round(wx - r.left - r.width / 2) + 'px');
      b.style.setProperty('--fy', Math.round(wy - r.top - r.height / 2) + 'px');
    }
    el.classList.add('fly');
    setTimeout(() => { elMoney.classList.remove('bump'); void elMoney.offsetWidth; elMoney.classList.add('bump'); }, 600);
  }, 1450);
  P.t2 = setTimeout(() => { el.classList.remove('on', 'fly'); el.hidden = true; }, 2450);
}


/* ─────────────── хад ─────────────── */
const elHearts = $('hearts'), elMoney = $('money'), elTask = $('task'), elAddr = $('addr'),
      elDist = $('dist'), elTimeWrap = $('timewrap'), elDashNow = $('dash-now'), elDashDue = $('dash-due'),
      elBurgers = $('burgers'), elSpeed = $('speed'), elToast = $('toast'),
      elBig = $('big'), elBigT = $('big-t'), elBigS = $('big-s'), elBigK = $('big-k');

/* сердца — половинками: S.hp идёт шагом 0,5 (лёгкий удар — минус половинка, hurtCar) */
function hudHearts () {
  let s = '';
  for (let i = 0; i < S.hpMax; i++) s += '<i' + (S.hp >= i + 1 ? '' : S.hp >= i + 0.5 ? ' class="half"' : ' class="off"') + '></i>';
  elHearts.innerHTML = s;
}

/* Часы заказа — как на приборке машины: тёмное окошко, зелёные цифры — сколько сейчас
   на часах игры, рядом жёлтым «доставить до 14:35» — срок заказа (в сборном — общий
   срок развоза). Срок — это «сейчас» + оставшиеся секунды заказа, переведённые в часы
   игры (в карьере сутки на смене идут медленнее — CAREERM.shiftSlow). Осталось ≤ 40 % —
   срок оранжевый, ≤ 18 % или меньше 10 с — красный и мигает, опоздал — «опоздал» красным. */
const DASH = { due: -1, key: '' };
function dashHour (t) {
  return CAREER && CAREERM.shiftOn() ? ECON.hourOf(t) : (6 + t * 24) % 24;   // те же часы, что «сейчас» в паузе
}
function dashStep () {
  const shift = CAREER && CAREERM.shiftOn();
  const now = dashHour(ENV.t);
  let due = -1;
  if (!S.free && S.timeMax > 0) {
    const tDue = ENV.t + Math.max(0, S.time) / (DAY_LEN * (shift ? CAREERM.shiftSlow() : 1));
    due = shift ? ECON.hourOf(Math.min(tDue, ECON.SHIFT.KEYS[ECON.SHIFT.KEYS.length - 1][0])) : dashHour(tDue % 1);
    if (!shift && due < now - 1e-6) due += 24;
    // срок не дрожит на границе минуты: сдвигаем, только если ушёл больше чем на 2 минуты игры
    if (DASH.due >= 0 && Math.abs(due - DASH.due) < 2 / 60) due = DASH.due;
    DASH.due = due;
  } else DASH.due = -1;
  const k = S.free || !(S.timeMax > 0) ? 1 : S.time / S.timeMax;
  const late = !S.free && S.time <= 0;
  const lvl = S.free ? '' : late ? 'late' : (k <= 0.18 || S.time < 10) ? 'low' : k <= 0.4 ? 'warn' : '';
  const label = late ? $t('опоздал') : S.state === 'back' ? $t('вернуться до') : $t('доставить до');
  const key = ECON.clock(now) + '|' + (due >= 0 ? ECON.clock(due) : '') + '|' + lvl + '|' + label;
  if (key === DASH.key) return;
  DASH.key = key;
  elDashNow.textContent = ECON.clock(now);
  elDashDue.hidden = due < 0;
  elDashDue.firstChild.textContent = label;
  elDashDue.lastChild.textContent = late ? '' : ECON.clock(due);
  elTimeWrap.classList.toggle('warn', lvl === 'warn');
  elTimeWrap.classList.toggle('low', lvl === 'low');
  elTimeWrap.classList.toggle('late', lvl === 'late');
}

const elNitro = $('nitro'), elNitroBar = $('nitrobar'), elFx = $('fxs'), elRadarBox = $('radar');
const TOUCH_NOS = document.querySelector('#touchpad .tp-nos');
let toastT = 0;
function toast (t) { t = String(t || ""); if (!t) return; CL.event('toast ' + t); elToast.textContent = t; elToast.style.opacity = 1; toastT = Math.max(1.6, t.length / 18); }

/* Без карьеры: «+230 ₽» летит в деньги на хаде, списания — красной строкой под ними.
   В карьере деньги на хаде — копилка (piggy.js) и пачка «за смену» (shiftcash.js). */
function walletFly (d) {
  const el = document.createElement('div');
  el.className = 'wl-fly' + (d < 0 ? ' neg' : '');
  el.textContent = (d > 0 ? '+' : '−') + money(Math.abs(d));
  document.body.appendChild(el);
  const r = elMoney.getBoundingClientRect();
  if (d > 0) {
    el.style.left = (innerWidth / 2) + 'px'; el.style.top = (innerHeight * 0.52) + 'px';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('go');
      el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = (r.top + r.height / 2) + 'px';
    }));
    setTimeout(() => { el.remove(); elMoney.classList.remove('bump'); void elMoney.offsetWidth; elMoney.classList.add('bump'); }, 720);
  } else {
    el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = (r.bottom + 4) + 'px';
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('go'); el.style.top = (r.bottom + 64) + 'px'; }));
    setTimeout(() => el.remove(), 1500);
  }
}
/* карьера: копилка-свинья — кошелёк (piggy.js), под ней пачка «за смену» (shiftcash.js) — две плашки */
function walletHud (dt) {
  PG.step(dt);
  SC.step(dt, !S.ride && isPlaying());
  RESPECT.hud(!S.ride && isPlaying());              // третья плашка — респект: прилетает значками с места (respect.js)
}

function hudStep (dt) {
  if (CAREER) walletHud(dt); else elMoney.textContent = money(S.money);
  touchpadStep();
  elBurgers.innerHTML = [S.burgers ? $t('респект {n}', { n: S.burgers }) : '', S.people ? $t('сбито {n}', { n: S.people }) : '',
    S.scoots ? $t('самокатов {n}', { n: S.scoots }) : '', S.wrecks ? $t('всмятку {n}', { n: S.wrecks }) : ''].filter(Boolean).join('<br>');
  elSpeed.textContent = $t('{n} км/ч', { n: Math.round(Math.hypot(V.vx, V.vz) * 3.6) });
  elNitroBar.style.width = (NOS.tank * 100) + '%';
  elNitro.classList.toggle('burn', NOS.burn);
  // нитро — кольцом вокруг радара
  const nv = NOS.tank.toFixed(3);
  if (elRadarBox.style.getPropertyValue('--nos') !== nv) elRadarBox.style.setProperty('--nos', nv);
  elRadarBox.classList.toggle('burn', NOS.burn);
  if (TOUCH_NOS) {                                   // на телефоне бак — кольцом по краю кнопки нитро
    if (TOUCH_NOS.style.getPropertyValue('--nos') !== nv) TOUCH_NOS.style.setProperty('--nos', nv);
    TOUCH_NOS.classList.toggle('burn', NOS.burn);
  }
  const fx = [FXS.shieldT > 0 ? $t('щит {n}', { n: Math.ceil(FXS.shieldT) }) : '', FXS.beastT > 0 ? $t('бист-мод {n}', { n: Math.ceil(FXS.beastT) }) : ''].filter(Boolean).join(' · ');
  if (elFx.textContent !== fx) elFx.textContent = fx;
  if (toastT > 0 && (toastT -= dt) <= 0) elToast.style.opacity = 0;
  if (phoneT > 0 && (phoneT -= dt) <= 0) hidePhone();

  const on = S.state === 'drive' || S.state === 'back' || S.state === 'handover' || S.state === 'side';
  elTimeWrap.style.visibility = on ? 'visible' : 'hidden';
  if (on && S.ride) {
    elTimeWrap.style.visibility = 'hidden';
    elTask.textContent = $t('просто катаюсь');
    elAddr.innerHTML = '<span class="sub">' + $t('без заказов и рекордов · esc — в меню') + '</span>';
    elDist.textContent = '';
  } else if (on && S.target) {
    const d = Math.hypot(S.target.x - V.x, S.target.z - V.z);
    const o = S.order;
    elTask.textContent = S.state === 'back' ? $t('в пиццерию')
      : $t('заказ {n}', { n: S.orders }) + (o && o.stops.length > 1 ? ' · ' + $t('{i} из {n}', { i: o.idx + 1, n: o.stops.length }) : '');
    elAddr.innerHTML = S.state === 'back' ? (PIZZA ? PIZZA.name.toLowerCase() : '')
      : S.addr + (S.addrLine ? '<br><span class="sub">' + S.addrLine + '</span>' : '');
    elDist.textContent = $t('{n} м', { n: Math.round(d) });
    dashStep();
  } else { elTask.textContent = ''; elAddr.textContent = ''; elDist.textContent = ''; }
}


function showBig (title, sub, keys, go) {
  $('over').hidden = true;
  elBig.hidden = false;
  elBigT.textContent = title;
  elBigS.innerHTML = sub;
  elBigK.innerHTML = keys;
  $('lb-wrap').hidden = true;
  elGo.textContent = go || $t('поехали');
  elName.value = S.name;
  syncGo();
  closePanel();
  renderProfile();
  Platform.gameplayStop();
}

/* Профиль на заставке: уровень цифрой в кружке, имя, место в таблице и
   кошелёк, полоска — сколько осталось до следующего уровня */
function renderProfile () {
  const xp = getXP(), l = levelOf(xp);
  $('pf-lvl').textContent = l;
  $('pf-lvl').title = $t('уровень курьера {n}', { n: l });
  $('pf-name').textContent = S.name || Platform.player.name || $t('курьер');
  const mine = (LB.cache || []).find(r => r.me);
  $('pf-rank').textContent = (CAREER ? $t('#{n} в пиццерии', { n: CAREERM.crewPlace() }) + ' · ' : mine ? $t('#{n} в таблице', { n: mine.rank }) + ' · ' : '') + money(wallet()) + (CAREER ? ' · ★ ' + CAREERM.stars() : '') + ' · ' + SEAS.seasonName();
  const lo = LVL_AT[l], hi = LVL_AT[l + 1];
  $('pf-xp').style.width = (l >= 5 ? 100 : Math.round(clamp((xp - lo) / (hi - lo), 0, 1) * 100)) + '%';
  $('pf-xp').parentElement.title = l < 5 ? $tn(hi - xp, 'до следующего {n} заказ|до следующего {n} заказа|до следующего {n} заказов') : $t('максимальный');
}

/* Имя — сразу на заставке: большое поле и «поехали», которая оживает,
   как только имя вписано. Под ним смена сама пишется в таблицу. */
const elName = $('st-name'), elGo = $('st-go'), elNote = $('st-note2');
function syncGo () { elGo.disabled = Platform.features.nameInput && !elName.value.trim(); }
elName.addEventListener('input', () => {
  syncGo();
  S.name = elName.value.trim();
  Store.set('dlv-name', S.name);
  renderProfile();
});
for (const ev of ['keydown', 'keyup', 'keypress']) elName.addEventListener(ev, e => e.stopPropagation());
$('start').addEventListener('submit', e => {
  e.preventDefault();
  if (Platform.features.nameInput && !elName.value.trim()) { elName.focus(); return; }
  S.name = Platform.features.nameInput ? elName.value.trim() : (Platform.player.name || '');
  elName.blur();
  Snd.boot(); Snd.resume();
  goRun();
});
/* «ещё раз» после смены — естественная пауза: здесь реклама (если пора) */
function goRun (picked) {
  LATE.flush();                                   // город ещё достраивался за меню — сначала достроить (latebuild.js)
  // все районы открыты: перед сменой — праздник (один раз) и выбор «весь город / пиццерия» (cityopen.js)
  if (!picked && DISTRICTS && CITYOPEN.beforeShift(() => goRun(true))) return;
  if (S.state === 'over' && Platform.features.ads && (S.delivered || 0) > 0) { S.state = 'title'; $('over').hidden = true; showAd().then(() => startRun()); }
  else startRun();
}
const hideBig = () => { elBig.hidden = true; $('over').hidden = true; };
const hideOver = hideBig;
$('ov-again').addEventListener('click', () => { Snd.boot(); Snd.resume(); goRun(); });
$('ov-menu').addEventListener('click', () => { S.state = 'title'; $('over').hidden = true; showTitle(); });

/* время смены: 12:34 */
const fmtTime = sec => { sec = Math.max(0, Math.floor(sec || 0)); const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); };

/* ── конец смены ──
   Отдельный экран, а не простыня текста: крупно — чем кончилось
   («ты проиграл» или «смена закончена»), строкой — почему, дальше цифры
   смены набегают по очереди. Внизу — «ещё раз» и «в меню». */
const OVER_WHY = {
  'не доставил': victims => $t(GORE_ON ? N_('вместо пиццы ты задавил {who}') : N_('вместо пиццы ты сбил {who}'), { who: victims.map(accName).join(', ') }),
  'машина всё': () => $t('машина разбита — кончились сердца'),
  'утонул': () => $t('машина ушла под воду — вплавь не довезёшь'),
  'не успел': () => $t('заказ протух — клиент не дождался'),
  'смена окончена': () => $t('ты сам закончил смену — результат сохранён'),
};
function countUp (el, to, fmt, ms) {
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - (1 - k) ** 3;
    el.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}
function showOver (why, victims) {
  Platform.store.flush && Platform.store.flush();       // итоги смены — в облако сразу
  Platform.gameplayStop();
  const best = S.money > S.best && !QR.on();      // быстрый заезд — не рекорд смены
  if (best) { S.best = S.money; Store.set('dlv-msk-best', String(S.money)); }
  elBig.hidden = true;
  closePanel();
  // карьера: свой экран итогов — цифры смены, гараж, донаты, слот-машина (career.js)
  if (CAREER) { CAREERM.showEnd(why, (OVER_WHY[why] || (() => $t(OVER_TITLE[why] || why)))(victims || [])); return; }
  const lost = why !== 'смена окончена';
  $('ov-t').textContent = lost ? $t('ты проиграл') : $t('смена закончена');
  $('ov-t').classList.toggle('win', !lost);
  $('ov-why').textContent = (OVER_WHY[why] || (() => $t(OVER_TITLE[why] || why)))(victims || []);
  const place = RIVALS.length ? rivalBoard().findIndex(r => r.me) + 1 : 0, nCour = RIVALS.length + 1;
  const rows = [
    [$t('заработано'), S.money, money, true],
    [$t('доставлено заказов'), S.delivered, n => String(Math.round(n))],
    [$t('время смены'), S.shiftT || 0, fmtTime],
    place ? [$t('место среди курьеров'), place, n => $t('{i} из {n}', { i: Math.max(1, Math.round(n)), n: nCour })] : null,
    [$t('респектов'), S.burgers, n => String(Math.round(n))],
    [$t('прохожих сбито'), S.people, n => String(Math.round(n))],
    [$t('машин всмятку'), S.wrecks, n => String(Math.round(n))],
    S.stops ? [$t('остановок снесено'), S.stops, n => String(Math.round(n))] : null,
  ].filter(Boolean);
  const box = $('ov-stats');
  box.innerHTML = rows.map((r, i) => '<div class="ov-row' + (r[3] ? ' big' : '') + '" data-i="' + i + '"><span>' + r[0] + '</span><b>' + r[2](0) + '</b></div>').join('');
  rows.forEach((r, i) => setTimeout(() => {
    const row = box.children[i];
    if (!row) return;
    row.classList.add('on');
    countUp(row.querySelector('b'), r[1], r[2], 700);
    if (r[1]) Snd.fx('receipt', s => s.blip(700 + i * 90, 0.06, 'square', 0.06));
  }, 250 + i * 320));
  $('ov-best').textContent = best && S.money > 0 ? $t('лучшая смена!') : S.best ? $t('твой рекорд {money}', { money: money(S.best) }) : '';
  $('over').hidden = false;
  overExtras();
  LB.render(S.money);
  // смена сама пишется в таблицу; без времени любой бы собрал миллион —
  // такие не идут. ?nolb — прогоны при проверке: ничего не пишем
  elNote.classList.remove('bad');
  if (new URLSearchParams(location.search).has('nolb')) elNote.textContent = $t('проверочный прогон — в таблицу не пишется');
  else if (S.freeRun) elNote.textContent = $t('просто катались — в таблицу не пишется');
  else if (S.money <= 0) elNote.textContent = '';
  else {
    elNote.textContent = $t('записываю смену в таблицу рекордов…');
    const run = { name: S.name, money: S.money, delivered: S.delivered, people: S.people, ts: Date.now(), lv: levelOf(getXP()) };
    LB.save(run).then(ok => {
      elNote.classList.toggle('bad', !ok);
      elNote.textContent = ok ? $t('смена в таблице рекордов') : $t('не записалось — нет связи с таблицей');
      if (ok && Platform.id === 'yandex' && !Platform.player.authorized) elNote.textContent = $t('войди в Яндекс, чтобы попасть в общую таблицу');
      LB.render(S.money);
    });
  }
}

/* Коробка летает по дуге: из окна пиццерии в машину и из машины
   в руки гостю. Цель может быть функцией — тогда она едет с машиной. */
const FLY = [];

function flyBox (from, to, dur, onDone, mesh) {
  const g = mesh || pizzaBox();                  // mesh — вместо коробки (пакет из магазина, ORD.bagMesh)
  g.position.set(from.x, from.y, from.z);
  scene.add(g);
  FLY.push({ g, from: { x: from.x, y: from.y, z: from.z }, to, t: 0, dur: dur || 0.8, onDone });
  Snd.fx('box', s => s.blip(880, 0.08, 'triangle', 0.1));
}

function updateFly (dt) {
  for (let i = FLY.length - 1; i >= 0; i--) {
    const f = FLY[i];
    f.t += dt / f.dur;
    const t = Math.min(1, f.t);
    const to = typeof f.to === 'function' ? f.to() : f.to;
    f.g.position.set(
      lerp(f.from.x, to.x, t),
      lerp(f.from.y, to.y, t) + Math.sin(t * Math.PI) * 1.9,
      lerp(f.from.z, to.z, t),
    );
    f.g.rotation.x += dt * 7; f.g.rotation.y += dt * 4;
    if (t >= 1) {
      scene.remove(f.g);
      FLY.splice(i, 1);
      if (f.onDone) f.onDone();
    }
  }
}

/* ─────────────── таблица лидеров ───────────────
   Таблица — площадки: в Яндексе это их лидерборд (имя и место из профиля
   игрока), в Стиме — таблица Стима BEST_SHIFT (без Стима — локальная), в web —
   лучшие смены на этом устройстве. Сама игра знает только Platform.leaderboard:
   submit, top и mine. Карьера (Стим) пишет смену через board.js. */

const LB = {
  cache: null,
  async load () {
    try { this.cache = await Platform.leaderboard.top(10); }
    catch (e) { console.warn('[leaderboard] top:', e); if (!this.cache) this.cache = []; }
    return this.cache;
  },
  async save (r) {
    let ok = false;
    try { ok = await Platform.leaderboard.submit(r.money, { name: r.name, delivered: r.delivered, level: r.lv }); }
    catch (e) { console.warn('[leaderboard] submit:', e); }
    await this.load();
    return ok !== false;
  },
  render (myMoney) {
    const list = this.cache || [];
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const html = list.slice(0, 10).map((r, i) =>
      '<li' + (r.me ? ' class="me"' : '') + '>' +
      '<b>' + (r.rank || i + 1) + '</b>' + (r.level ? '<em class="lv" title="' + esc($t('уровень курьера')) + '">' + r.level + '</em>' : '<em class="lv none"></em>') +
      '<span>' + esc(r.name || $t('курьер')) + '</span><i>' + money(r.score) + '</i></li>').join('')
      || '<li class="empty">' + $t('пока пусто — съезди смену, и ты первый') + '</li>';
    $('lb-list').innerHTML = html;
    $('board-list').innerHTML = html;
    const place = list.findIndex(r => r.score <= myMoney);
    const line = myMoney > 0 && place !== -1 ? $t('это {n}-е место в таблице', { n: place + 1 }) : '';
    $('lb-place').textContent = line;
    const mine = list.find(r => r.me);
    $('board-me').textContent = line || (mine ? $t('ты — {n}-й, {money}', { n: mine.rank, money: money(mine.score) }) : '');
  },
};
LB.load().then(() => { LB.render(0); if (!elBig.hidden) renderProfile(); }).catch(() => {});

/* ─────────────── умный трекер: кто, что и почему ───────────────
   Заказы назначает трекер: сам решает, кого объединить в один
   маршрут, и объясняет своё решение прямо в карточке. Везём не
   в дом, а живому коллеге, который в этот момент идёт по улице. */

const PIZZAS = [$t('пепперони'), $t('маргарита'), $t('четыре сыра'), $t('мясная'), $t('гавайская'),
                $t('птичий микс'), $t('ветчина и сыр'), $t('диабло'), $t('карбонара')];
const SOLO_WHY = [
  $t('один адрес, ближе никого не нашлось'),
  $t('срочный: ждёт дольше всех'),
  $t('по пути от пиццерии'),
  $t('повторный заказ, клиент лояльный'),
];

let GATE = null;

function clearGate () {
  if (!GATE) return;
  dropMesh(GATE.grp);
  const i = SOLIDS.indexOf(GATE.solid);
  if (i >= 0) SOLIDS.splice(i, 1);
  GATE = null;
  indexSolids();
}

/* шлагбаум поперёк прямого заезда во двор */
function setGate (fromX, fromZ, toX, toZ) {
  clearGate();
  const dx = toX - fromX, dz = toZ - fromZ;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const gx = fromX + ux * len * 0.5, gz = fromZ + uz * len * 0.5;
  const ang = Math.atan2(ux, uz);

  const grp = new THREE.Group();
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.5), mat('#d8d3c8'));
  post.position.set(-5, 0.9, 0);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.3, 0.3), mat('#e8e2d6'));
  arm.position.set(0, 1.5, 0);
  grp.add(post, arm);
  for (let i = 0; i < 5; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(1, 0.34, 0.34), mat('#d9342c'));
    st.position.set(-4.6 + i * 2.1, 1.5, 0);
    grp.add(st);
  }
  grp.position.set(gx, groundH(gx, gz), gz);
  grp.rotation.y = ang + Math.PI / 2;
  scene.add(grp);

  // стрела лежит поперёк въезда — препятствие поворачиваем так же
  const sol = obb(gx, gz, 5.4, 0.9, -(ang + Math.PI / 2));
  GATE = { grp, solid: sol };
  indexSolids();
}

/* ── адрес и комментарий курьера ──
   И то, и другое — шутка. Адрес созвучен фамилии или просто
   бессмысленный, комментарий — мем на реальные пометки курьеров:
   они ничего не объясняют, но их зачем-то пишут. */

const COURIER_NOTES = [
  $t('встречает в пижаме с динозаврами'),
  $t('у него три пальца'),
  $t('не смотри в глаза собаке'),
  $t('звонить два раза, третий не работает'),
  $t('домофон кусается'),
  $t('лифт едет только вниз'),
  $t('стучать ногой, руками нельзя'),
  $t('говорит шёпотом, не пугайся'),
  $t('на ковёр не смотреть'),
  $t('сосед снизу — это не он'),
  $t('открывает не сразу, а потом сразу'),
  $t('в подъезде живёт кот, он главный'),
  $t('просил приехать молча'),
  $t('дверь синяя, но покрашена'),
  $t('если не открыл — значит открыл'),
  $t('у двери стоит стул, это его стул'),
  $t('не здоровайся, он стесняется'),
  $t('пахнет борщом, это нормально'),
  $t('на звонок не отвечает, он в созвоне'),
  $t('выйдет, когда закончит стендап'),
  $t('кричать «пицца» три раза, потом ещё раз'),
  $t('не спрашивай, как дела на проекте'),
  $t('если спросит про сроки — ты курьер'),
  $t('не наступай на его самокат'),
  $t('оставить у двери, но не у этой'),
  $t('он в наушниках, махать руками'),
  $t('пароль от домофона — «пицца123»'),
  $t('встретит в худи с котиком'),
  $t('может быть на балконе, машет рукой'),
  $t('заказал на всех, но съест сам'),
  $t('сдачу не надо, ему нужен фидбек'),
  $t('разбудить, он после ночной смены'),
  $t('просил без ананасов, но с ананасами'),
  $t('поднимется, только если пицца горячая'),
  $t('передать лично в руки, руки две'),
  $t('стоит на парковке и делает вид, что не ждёт'),
  $t('подтвердит получение смайликом'),
  $t('не произносить слово «дедлайн»'),
  $t('если грустный — это не из-за пиццы'),
  $t('уточнит заказ голосовым на пять минут'),
  $t('подойдёт после серии, серия идёт третий час'),
  $t('у него кот на клавиатуре, пицца не для кота'),
];

const elPhone = $('phone'), elPhWhy = $('ph-why'), elPhList = $('ph-list'), elPhWhat = $('ph-what');
let phoneT = 0;

/* карточка-анкета: аватарка, имя, фамилия, адрес и пометка курьера */
const KIND_LABEL = { group: $t('групповой заказ'), chain: $t('последовательный заказ'), bundle: $t('сборный заказ'), solo: $t('заказ') };

function personRow (p) {
  const full = (p && p.name || $t('Иван Иванов')).split(/\s+/);
  return '<div class="ph-who">' +
    (p ? '<img src="' + faceDataURL(p) + '" alt="">' : '<i></i>') +
    '<span class="ph-n">' + (full[0] || '') + '</span>' +
    '<span class="ph-s">' + (full.slice(1).join(' ') || '') + '</span>' +
    '<span class="ph-p">' + (p && p.pos ? p.pos : $t('коллега')) + '</span>' +
    '</div>';
}

/* Анкета — про людей: крупно аватарка, имя и фамилия, кому везти.
   Адрес, пицца и пометка курьера — мелко и приглушённо, это вторично.
   Внизу — большая «принять». Фон за анкетой размыт, чтобы не отвлекал. */
/* пометка накладной — только по делу: у обычного заказа («клиент ждёт · город») её нет, шлагбаум — остаётся */
function orderWhy (order) {
  if (!order || !order.why) return '';
  return order.ord && order.ord.plain ? order.why.split(' · ').slice(2).join(' · ') : order.why;
}
function showOrderCard (order) {
  // весь попап — накладная: шапка «накладная · заказ  № 0007», таблица, фото на скрепке, кнопка «ГАЗ ГАЗ»
  $('ph-kind').textContent = $t('накладная') + ' · ' + (KIND_LABEL[order.kind] || $t('заказ'));
  const src = elPhone.querySelector('.ph-src');
  if (src) src.textContent = '№ ' + String(S.orders).padStart(4, '0');
  $('ph-accept').innerHTML = keyHTML('ok') + $t('ГАЗ ГАЗ');   // [A] / Enter — по вводу (glyphs.js)
  const many = order.stops.length > 1;
  // аватарки сверху — кому везёшь; имена и всё остальное — таблицей, как накладная
  const face = (p, n) => '<div class="oc-p">' + (n ? '<em>' + n + '</em>' : '') +
    (p ? '<img src="' + faceDataURL(p) + '" alt="">' : '<i></i>') + '</div>';
  const persons = order.stops.flatMap(st => st.persons);
  const people = order.stops.flatMap((st, i) => st.persons.map(p => face(p, many ? i + 1 : 0))).join('');
  const st0 = order.stops[0];
  // сборный (orders.js): у каждого получателя свой адрес, номер — как на фото; порядок развоза выбирает игрок
  const bundle = !!(order.ord && order.ord.bundle);
  const who = bundle ? order.stops.map((st, i) => '<b>' + (i + 1) + '. ' + st.persons.map(p => (p && p.name) || $t('Иван Иванов')).join(', ') + '</b><small>' + st.addr + '</small>').join('')
    : persons.map(p => '<b>' + ((p && p.name) || $t('Иван Иванов')) + '</b>' + (p && p.desc ? '<small>' + p.desc + '</small>' : '')).join('');
  const rows = [
    [$t('получатель'), who],
    bundle ? null : [$t('адрес'), st0.addr + (many ? ' → ' + $t('ещё {n}', { n: order.stops.length - 1 }) : '')],
    [$t('заказ'), order.items],
    ...(order.ord ? ORD.cardRows(order) : []),
    // пометка — только по делу: у обычного заказа («клиент ждёт · город») её нет, шлагбаум — остаётся
    (() => { const w = orderWhy(order); return w ? [$t('пометка'), w] : null; })(),
    st0.note ? [$t('комментарий курьера'), '«' + st0.note + '»'] : null,
  ].filter(Boolean);
  elPhList.innerHTML =
    '<div class="oc-sheet"><table class="oc-inv">' + rows.map(([k, v]) => '<tr><th>' + k + '</th><td>' + v + '</td></tr>').join('') + '</table>' +
    '<div class="oc-photos' + (persons.length > 2 ? ' small' : '') + '"><i class="oc-clip"></i>' + people + '</div></div>' +
    (order.rush ? '<div class="oc-rush">⏱ ' + order.rushText + '<span>' + $t('после загрузки — полный бак кофе · оплата ×1,5') + '</span></div>' : '') +
    (order.surf ? '<div class="oc-rush oc-surf">🏄 ' + $t(MAP.river.surfCard, { name: SURF.person ? SURF.person.first : '' }) + '<span>' + $t('подъедь к набережной и притормози — пицца долетит прямо на доску · оплата ×2') + '</span></div>' : '');
  elPhWhat.textContent = order.items;
  elPhWhy.textContent = order.why;
  if (order.ord) ORD.card(order);                 // карьера: полоса цвета вида (очередь «дальше» не показываем)
  else elPhone.classList.remove('ord-typed', 'ord-urgent');
  elPhone.classList.add('on');
  document.body.classList.add('brief');
  phoneT = 0;                 // висит, пока не нажмут «принять»
}
const hidePhone = () => { elPhone.classList.remove('on'); document.body.classList.remove('brief'); phoneT = 0; };

/* ─────────────── куда везти ───────────────
   Гость ждёт не на тротуаре у проспекта, а в глубине квартала: у подъезда,
   на дворовой дорожке, на парковке во дворе. До такой точки — дворами и
   проездами, маршрут интереснее, и гость не стоит посреди дороги. Точки
   собираются один раз: не на асфальте, не в доме, не в реке и не ближе
   двенадцати метров к улице. */
const SPOTS = [];
function buildSpots () {
  const cand = [];
  for (const [x, z, nx, nz] of CITY.entrances) cand.push([x + nx * 3, z + nz * 3]);
  for (const q of CITY.paths) {
    let acc = 0;
    for (let i = 1; i < q.length; i++) {
      const l = Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
      for (let d = 12 - acc; d < l; d += 25) cand.push([lerp(q[i - 1][0], q[i][0], d / l), lerp(q[i - 1][1], q[i][1], d / l)]);
      acc = (acc + l) % 25;
    }
  }
  for (const lot of CITY.lots) {
    if (lot.k !== 'park') continue;
    let x = 0, z = 0;
    for (const q of lot.p) { x += q[0] / lot.p.length; z += q[1] / lot.p.length; }
    if (inPoly(x, z, lot.p)) cand.push([x, z]);
  }
  for (const [x, z] of cand) {
    if (!inBounds(x, z, 20) || groundH(x, z) < 0.3 || inHouse(x, z, 1.4)) continue;
    const any = nearestRoad(x, z, 7, 1);
    if (any && any.d < any.seg.w / 2 + 1.2) continue;           // на асфальте не стоим
    const street = nearestRoad(x, z, 5, 1);
    if (street && street.d < street.seg.w / 2 + 12) continue;   // у самой улицы — не вглубь
    if (SPOTS.some(s => Math.abs(s.x - x) < 6 && Math.abs(s.z - z) < 6)) continue;
    SPOTS.push({ x, z });
  }
}

/* точка в кольце от центра — случайная из подходящих */
/* Разнообразие: район поделён на восемь секторов вокруг пиццерии, и
   недавние адреса запоминаются. Новую точку берём из сектора, где давно
   не были, и подальше от последних адресов — чтобы заказы водили в
   разные концы района, а не десять раз подряд в один двор. */
const sectorOf = (x, z) => ((Math.floor((Math.atan2(x - PIZZA.x, z - PIZZA.z) + Math.PI) / (Math.PI / 4)) % 8) + 8) % 8;
const RECENT = [];                                   // последние адреса: { x, z, sec }
function spotNear (c, dmin, dmax) {
  const ok = SPOTS.filter(s => { const d = Math.hypot(s.x - c.x, s.z - c.z); return d >= dmin && d <= dmax; });
  if (!ok.length) return null;
  let best = [], bs = Infinity;
  for (let k = 0; k < Math.min(60, ok.length); k++) {
    const s = ok.length > 60 ? pick(ok) : ok[k], sec = sectorOf(s.x, s.z);
    let sc = 0;
    RECENT.forEach((r, i) => {
      const w = 1 - i / (RECENT.length + 1);          // чем свежее адрес, тем сильнее отталкивает
      if (r.sec === sec) sc += 3 * w;
      else if ((r.sec + 1) % 8 === sec || (sec + 1) % 8 === r.sec) sc += 1 * w;
      if (Math.hypot(r.x - s.x, r.z - s.z) < 130) sc += 2 * w;
    });
    sc += Math.random() * 0.6;
    if (sc < bs - 0.01) { bs = sc; best = [s]; } else if (Math.abs(sc - bs) <= 0.01) best.push(s);
  }
  return pick(best);
}
function rememberSpot (x, z) {
  RECENT.unshift({ x, z, sec: sectorOf(x, z) });
  if (RECENT.length > 5) RECENT.pop();
}

/* ─────────────── тусовка ───────────────
   Групповой заказ — это вечеринка: в середине кружка бумбокс, из него
   летят ноты, гости прыгают и танцуют, пока не приехала пицца. */
const PARTIES = [];
function startParty (x, z, peds) {
  const g = new THREE.Group();
  const m = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.34), m('#2b2a30'));
  body.position.y = 0.25;
  g.add(body);
  for (const s of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 14), m('#8e8a92'));
    sp.rotation.x = Math.PI / 2; sp.position.set(0.24 * s, 0.25, 0.18);
    g.add(sp);
  }
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.06), m('#c9c4bb'));
  handle.position.y = 0.58;
  g.add(handle);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0x6fd3ff }));
  led.position.set(0, 0.4, 0.18);
  g.add(led);
  g.position.set(x, groundH(x, z) + curbAt(x, z), z);
  g.rotation.y = Math.atan2(V.x - x, V.z - z);
  scene.add(g);
  for (const p of peds) { p.party = true; p.partyPh = rand(0, 6); }
  PARTIES.push({ g, x, z, peds, noteT: 0, led });
}

function updateParties (dt) {
  for (let i = PARTIES.length - 1; i >= 0; i--) {
    const P = PARTIES[i];
    const on = P.peds.some(p => p.guest && !p.dead && !p.served);
    if (!P.peds.some(p => p.guest && !p.dead)) {        // разошлись — бумбокс уносят
      scene.remove(P.g);
      P.g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      PARTIES.splice(i, 1);
      continue;
    }
    if (!on) continue;
    // бит: бумбокс подпрыгивает, огонёк мигает, ноты летят
    const beat = Math.abs(Math.sin(tG * 7));
    P.g.scale.set(1 + beat * 0.06, 1 + beat * 0.1, 1 + beat * 0.06);
    P.led.material.color.setHSL((tG * 0.4) % 1, 0.8, 0.6);
    if ((P.noteT -= dt) <= 0) { P.noteT = rand(0.25, 0.5); emote(P.x + rand(-0.3, 0.3), 0.9, P.z + rand(-0.3, 0.3), 'note', 1); }
  }
}

/* ─────────────── заказы ─────────────── */

/* где на этой широте река: западнее — тот берег. Ищем по рельефу:
   середина самой длинной полосы воды на строке сетки */
const RIVER_X = (() => {
  const out = new Float32Array(TNZ).fill(-1e9);
  for (let j = 0; j < TNZ; j++) {
    let best = 0, bi = -1, run = 0;
    for (let i = 0; i < TNX; i++) {
      if (TH[j * TNX + i] < 0) { run++; if (run > best) { best = run; bi = i; } } else run = 0;
    }
    if (best > 3) out[j] = TX0 + (bi - best / 2) * TG;
  }
  return out;
})();
const riverX = z => RIVER_X[clamp(Math.round((z - TZ0) / TG), 0, TNZ - 1)];

const alive = () => PEOPLE.filter(p => !p.dead && !p.guest && p.person);

/* Трекер собирает два вида заказов.

   Групповой — несколько коллег рядом заказали на всех: один адрес,
   одна остановка, коробки разлетаются по рукам разом.
   Последовательный — два-три отдельных заказа, которые курьер
   везёт один за другим, каждый со своим адресом. */
/* ── уровень курьера ──
   Опыт — доставленные заказы за всё время, копится между сменами в
   браузере. Кто уже развёз первых лёгких клиентов, начинает следующую
   смену с заказов посложнее. */
const LVL_AT = [0, 0, 3, 8, 15, 25];              // сколько опыта нужно на уровень 1…5
const getXP = () => +Store.get('dlv-msk-xp', 0) || 0;
const levelOf = xp => { let l = 1; while (l < 5 && xp >= LVL_AT[l + 1]) l++; return l; };
/* ступень сложности в смене: уровень, с которого начал, плюс по одной за
   каждые три заказа, но не выше шестой */
const difficulty = () => Math.min(6, S.lvl0 + Math.floor(Math.max(0, S.orders - 1) / 3));
/* новый уровень молча: надпись «курьер растёт — заказы сложнее» убрана,
   заказы и так усложняются сами */
function addXP (n = 1) {
  if (S.ride) return;
  Store.set('dlv-msk-xp', getXP() + n);
}

/* учебный заказ был — больше не показываем (полоса маршрута на асфальте горит и дальше) */
const tutDone = () => String(Store.get('dlv-msk-tut', '')) === '1';
/* Самое начало игры — спокойное: пока не отвезён учебный заказ, соперники
   стоят колонной у пиццерии, нет ни аварий, ни похитителя, ни кофейной
   войны. Только ты, прямая улица и клиент на углу. */
const calmStart = () => !S.ride && !tutDone();

/* Точка учебного заказа: от курьера прямо по своей улице до первого
   перекрёстка, там направо — и тридцать метров по правому тротуару. */
/* Учебный клиент не должен стоять на парковке курьеров, где начинается смена:
   до него — не ближе TUT_MIN_D метров от машины. Длина ребра ниже считается от
   его начала, а машина может стоять почти у конца — поэтому меряем от самой машины. */
const TUT_MIN_D = 45;
const tutFar = (x, z) => Math.hypot(x - V.x, z - V.z) >= TUT_MIN_D &&
  !(COURIER_SLOTS && COURIER_SLOTS.some(s => Math.hypot(x - s.x, z - s.z) < 20));
function tutorialSpot () {
  const road = nearestRoad(V.x, V.z, DRIVE_MAX, 1);
  if (!road || road.seg.na === undefined) return null;
  let e = edgeOf(road.seg.na, road.seg.nb);
  if (!e) return null;
  if (e.ux * Math.sin(V.h) + e.uz * Math.cos(V.h) < 0) e = edgeOf(e.b, e.a);
  // с парковки машина смотрит поперёк улицы: не нашлось по ходу — пробуем в другую сторону
  return tutorialWalk(e) || tutorialWalk(edgeOf(e.b, e.a));
}
function tutorialWalk (e) {
  if (!e) return null;
  let dist = 0;
  for (let k = 0; k < 40 && dist < 360; k++) {
    const n = e.b;
    /* Учебный клиент стоит прямо на углу первого перекрёстка, на правом
       тротуаре, за несколько метров до стоп-линии: едешь прямо — и видишь
       его справа. Поворачивать никуда не надо. */
    if (nodeDeg(n) >= 3 && dist + e.len > 35) {
      const B = NODES[n], back = (e.tB || 6) + 4, o = e.w / 2 + 1.8;
      const x = B.x - e.ux * back + e.rx * o, z = B.z - e.uz * back + e.rz * o;
      if (!inHouse(x, z, 1) && tutFar(x, z)) return { x, z };
    }
    if (nodeDeg(n) >= 3 && dist > 15) {
      let best = null, ba = 0.7;
      for (const c of NODES[n].nb) {
        if (c === e.a) continue;
        const f = edgeOf(n, c);
        if (!f.ok || f.c > 5) continue;
        const ang = Math.atan2(e.ux * f.uz - e.uz * f.ux, e.ux * f.ux + e.uz * f.uz);   // плюс — направо
        if (ang > ba && ang < 2.3 && f.len > 18) { ba = ang; best = f; }
      }
      if (best) {
        const A = NODES[best.a], d = Math.min(32, best.len * 0.6), o = best.w / 2 + 1.6;
        const x = A.x + best.ux * d + best.rx * o, z = A.z + best.uz * d + best.rz * o;
        if (!inHouse(x, z, 1) && tutFar(x, z)) return { x, z };
      }
    }
    // дальше прямо — по ребру, которое продолжает улицу
    let nx = null, bd = 0.75;
    for (const c of NODES[n].nb) {
      if (c === e.a) continue;
      const f = edgeOf(n, c);
      if (!f || f.c > 5) continue;
      const dot = e.ux * f.ux + e.uz * f.uz;
      if (dot > bd) { bd = dot; nx = f; }
    }
    if (!nx) return null;
    dist += e.len;
    e = nx;
  }
  return null;
}

/* Первый заказ за всё время — Степан Тугарев, заядлый кальянщик и бизнесмен (бизнес вот-вот будет)
   (в детской — любитель самовара). Перед его накладной в первый раз — вступление (intro.js).
   Только он один раз: дальше, и в карьере тоже, первым приходит обычный заказ смены.
   Сидит на лавочке в соседнем дворе (45—420 м от машины, ближе к 130) с кальяном
   и выдувает огромные облака — по ним его и находишь. В детской версии — самовар и пар. */
let STEPAN = null;
function stepanPerson () {
  if (!STEPAN) {
    STEPAN = makePerson({ seed: 0x5e7a11, first: $t('Степан'), last: $t('Тугарев'), fem: false });
    STEPAN.desc = ADULT ? $t('заядлый кальянщик и бизнесмен — бизнес вот-вот будет') : $t('любитель самовара и бизнесмен — бизнес вот-вот будет');
    STEPAN.pos = STEPAN.desc;
    STEPAN.stepan = true;                       // вступление (intro.js) узнаёт его по этому флагу
    Object.assign(STEPAN.look, HEROES.look('stepa'));   // тот же Стёпа Тугарев, что ходит по городу (heroes.js)
  }
  return STEPAN;
}
function stepanOrder (all) {
  if (!all || !all.length) return null;
  let best = null, bs = Infinity;
  for (const b of BENCHES) {
    if (b.taken || (b.prop && b.prop.down)) continue;
    const d = Math.hypot(b.x - V.x, b.z - V.z);
    if (d < 45 || d > 420 || (COURIER_SLOTS && COURIER_SLOTS.some(q => Math.hypot(q.x - b.x, q.z - b.z) < 25))) continue;
    if (DISTRICTS && DIST.at(b.x, b.z) !== DIST.cur()) continue;           // в районе, где работаешь
    const r = nearestRoad(b.x, b.z, 7, 4);
    if (!r || r.d > 30) continue;                   // к лавочке можно подъехать
    const sc = Math.abs(d - 130);
    if (sc < bs) { bs = sc; best = b; }
  }
  if (!best) return null;
  const p = all.find(q => !q.guest) || all[0];
  if (p.idle) releaseIdle(p);
  p.path = null; p.w = null;
  dropMesh(p.grp); p.person = stepanPerson(); p.grp = makeHuman(p.person); p.speed = p.base * p.grp.userData.pace; scene.add(p.grp);
  p.x = best.x; p.z = best.z;
  p.idle = { b: best, phase: 'sit', t: 1e9, give: 0 }; best.taken = 1;        // сразу сидит: makeGuest оставит его на лавочке
  p.grp.rotation.y = best.ry;
  HK.guest(p, best);
  const why = ADULT ? $t('первый заказ: Степан на лавочке во дворе — ищи облака дыма') : $t('первый заказ: Степан на лавочке во дворе — ищи пар от самовара');
  return { kind: 'solo', tut: true, stops: [{ peds: [p] }], why };
}

function planOrder () {
  const all = alive();
  if (!all.length) return null;
  const n = S.orders;
  const d2 = (p, c) => Math.hypot(p.x - c.x, p.z - c.z);
  const taken = [];
  // коллега на нужном расстоянии от точки; если такого нет — зовём кого-нибудь туда
  // коллега в точку в глубине квартала на нужном расстоянии; нет такой
  // точки — зовём его на тротуар в том же кольце
  const pickNear = (c, dmin, dmax) => {
    const free = all.filter(q => !taken.includes(q));
    if (!free.length) return null;
    const sp = spotNear(c, dmin, dmax);
    const p = sp ? free.sort((a, b) => d2(a, sp) - d2(b, sp))[(Math.random() * Math.min(4, free.length)) | 0] : pick(free);
    if (p.idle) releaseIdle(p);
    p.path = null; p.w = null;
    if (sp) { p.x = sp.x; p.z = sp.z; }
    else { p.yard = false; walkSpawn(p, dmin, dmax, c); }
    taken.push(p);
    return p;
  };
  const group = (anchor, size) => {
    // остальные подтягиваются к первому: встают рядом и ждут вместе
    const take = [anchor];
    for (let i = 1; i < size; i++) {
      const rest = all.filter(p => !taken.includes(p)).sort((p, q) => d2(p, anchor) - d2(q, anchor));
      const b = rest[0];
      if (!b) break;
      // остальные — рядом с первым: в глубине двора, а не на дороге
      if (b.idle) releaseIdle(b);
      b.path = null; b.w = null;
      for (let k = 0; k < 8; k++) {
        b.x = anchor.x + rand(-2.5, 2.5); b.z = anchor.z + rand(-2.5, 2.5);
        const r = nearestRoad(b.x, b.z, 7, 1);
        if (!r || r.d > r.seg.w / 2 + 1) break;         // на асфальт не встаём
      }
      pushOut(b, 0.5);
      taken.push(b); take.push(b);
    }
    return take;
  };
  const why = (take) => {
    const pos = take[0].person.pos, same = pos && take.every(p => p.person.pos === pos);
    return same ? $t('групповой: {who}, заказали на всех', { who: $t(pos) }) : $t('групповой: заказали на всех сразу');
  };

  /* Самый первый заказ за всё время — учебный: гость стоит так, что до
     него прямо и один раз направо. Дальше — случайные заказы, и чем
     дальше смена, тем дальше адреса. */
  if (!tutDone()) {
    const st = stepanOrder(all);                  // Степан Тугарев на лавочке с кальяном
    if (st) return st;
    const sp = tutorialSpot();
    if (sp && (!DISTRICTS || DIST.at(sp.x, sp.z) === DIST.cur())) {
      const p = pick(all);
      if (p.idle) releaseIdle(p);
      p.path = null; p.w = null;
      p.x = sp.x; p.z = sp.z;
      return { kind: 'solo', tut: true, stops: [{ peds: [p] }], why: $t('первый заказ: прямо до перекрёстка, клиент справа') };
    }
  }
  // карьера: учебный не вышел — обычный заказ смены (orders.js: только открытый район, где работаешь),
  // а не старый московский выбор по всему городу (тот мог увести в закрытый район)
  if (CAREER) return ORD.nextPlan();
  /* Сложность — от уровня курьера и от того, сколько заказов уже в этой
     смене: каждые три заказа — ступенька выше. На первой ступени — один
     гость рядом, дальше подключаются групповые, последовательные, за
     реку, и адреса всё дальше. */
  // бонус: сёрфер на реке — изредка, после третьего заказа
  if (MAP.river && MAP.river.surf && S.orders > 3 && !S.ride && chance(0.1)) { const f = surfPlan(); if (f) return f; }
  const d = difficulty();
  const far = [0, 200, 280, 360, 430, 480, 520][d];
  const r = Math.random();
  // за реку, через Омега-мост — с четвёртой ступени
  if (MAP.farOrder && d >= 4 && r < 0.18 && V.x > riverX(V.z)) {
    // тот берег — тоже в глубине двора
    const sp = pick(SPOTS.filter(q => q.x < riverX(q.z)) || []);
    const p = pick(all);
    if (sp && p) {
      if (p.idle) releaseIdle(p);
      p.path = null; p.w = null; p.x = sp.x; p.z = sp.z;
      return { kind: 'solo', far: true, stops: [{ peds: [p] }], why: $t(MAP.farOrder) };
    }
  }
  if (d >= 2 && r < (d >= 3 ? 0.4 : 0.5)) {
    const take = group(pickNear(V, far * 0.55, far), d >= 3 && chance(0.5) ? 3 : 2);
    return { kind: 'group', stops: [{ peds: take }], why: why(take) };
  }
  if (d >= 3 && r < 0.8) {
    const k = d >= 5 && chance(0.5) ? 4 : d >= 4 ? 3 : 2;
    const list = [pickNear(V, far * 0.5, far)];
    for (let i = 1; i < k; i++) list.push(pickNear(list[i - 1], 120, far * 0.8));
    const ok = list.filter(Boolean);
    return { kind: 'chain', stops: ok.map(p => ({ peds: [p] })), why: $tn(ok.length, 'последовательный: {n} адрес, везём по очереди|последовательный: {n} адреса подряд, везём по очереди|последовательный: {n} адресов подряд, везём по очереди') };
  }
  return { kind: 'solo', stops: [{ peds: [pickNear(V, d <= 1 ? 70 : far * 0.6, far)] }], why: pick(SOLO_WHY) };
}

/* длина пути по дорогам: до ближайшего узла, по узлам, от узла до цели */
function routeLen (x0, z0, x1, z1) {
  const n = routeNodes(x0, z0, x1, z1);
  if (!n.length) return Math.hypot(x1 - x0, z1 - z0) * 1.4;
  let L = Math.hypot(n[0].x - x0, n[0].z - z0);
  for (let i = 1; i < n.length; i++) L += Math.hypot(n[i].x - n[i - 1].x, n[i].z - n[i - 1].z);
  return L + Math.hypot(x1 - n[n.length - 1].x, z1 - n[n.length - 1].z);
}

/* ── ритм срока ──
   Срок считается от длины пути по дорогам и средней скорости курьера в
   городе (с поворотами, светофорами и дворами), умноженной на запас.
   Запас идёт волнами по три заказа: первый — спокойно, второй —
   плотнее, третий — срочный; следующая волна снова легче, но уже не
   так, как в начале. Даже самый срочный оставляет запас — доехать
   реально, если не плутать. */
const RUN_V = 19;
function slackFor (n) {
  const c = Math.floor((n - 1) / 3), k = (n - 1) % 3;
  const calm = Math.max(1.3, 2.0 - 0.18 * c), tight = Math.max(1.12, 1.32 - 0.05 * c);
  return lerp(calm, tight, k / 2) - (S.lvl0 - 1) * 0.03;
}
const orderTime = (L, stops, n) => Math.max(16, L / RUN_V * slackFor(n) + 5 + stops * 4) + (S.mealTime || 0);

function newOrder () {
  S.orders++;
  clearGate();
  // карьера: очередь, план смены, без повторов (orders.js); учебный — по-старому
  // Степан Тугарев — только самый первый заказ за всё время (учебный, planOrder), не каждую смену
  const plan = CAREER && tutDone() ? ORD.nextPlan() : planOrder();
  if (!plan) { backToBase(); return; }
  if (plan.story) { ORD.startStory(plan); return; }   // сюжетный: у двери человек из story.js

  for (const st of plan.stops) {
    if (st.beach) BEACH.dress(st.peds[0]);       // пляж: клиент — в купальнике (beach.js)
    st.persons = st.peds.map(p => p.person);
    st.addr = st.fixAddr || (st.surf ? $t(MAP.river.at) : realAddress(st.peds[0].x, st.peds[0].z));
    st.note = pick(COURIER_NOTES);
    // групповой: остальные подходят к первому и ждут вместе
    if (st.peds.length > 1) {
      // групповой: встают кружком вокруг общей точки, лицом друг к другу
      const gx = st.peds.reduce((a, p) => a + p.x, 0) / st.peds.length;
      const gz = st.peds.reduce((a, p) => a + p.z, 0) / st.peds.length;
      const rad = 1.5 + st.peds.length * 0.35;
      const turn = Math.random() * 6.28;
      st.peds.forEach((p, i) => {
        const ang = turn + i * (Math.PI * 2 / st.peds.length);
        makeGuest(p, { x: gx + Math.sin(ang) * rad, z: gz + Math.cos(ang) * rad });
      });
      startParty(gx, gz, st.peds);
    } else makeGuest(st.peds[0], st.fest || st.beach ? { x: st.peds[0].x, z: st.peds[0].z } : undefined);   // фестиваль: ждёт в проходе, не на лавке (festivals.js); пляж — на своём полотенце
    if (st.beach) BEACH.lieDown(st.peds[0]);     // лежит на полотенце, подъехал — садится и машет (beach.js)
    pinStop(st);                                  // где ждёт — решено сейчас, пин больше не двигается
  }

  for (const st of plan.stops) rememberSpot(st.peds[0].x, st.peds[0].z);
  const total = plan.stops.reduce((n, st) => n + st.peds.length, 0);
  S.order = {
    kind: plan.kind,
    tut: !!plan.tut,
    surf: !!plan.surf,
    stops: plan.stops,
    idx: 0,
    why: plan.why,
    items: total + ' × ' + pick(PIZZAS),
  };
  S.state = 'brief';                            // езда заблокирована до «принять»
  syncTarget();

  // Шлагбаум вешаем на въезд ближайшей дворовой парковки, а не в
  // случайную точку: раньше стрела торчала посреди газона.
  const first = S.order.stops[0].peds[0];
  if (S.orders > 1 && chance(0.4) && !S.order.stops[0].fest && !S.order.stops[0].beach) {   // к проходу фестиваля и на пляж — без шлагбаума
    let best = null, bd = 34;
    for (const pk of PARKINGS) {
      const d = Math.hypot(pk.cx - first.x, pk.cz - first.z);
      if (d < bd) { bd = d; best = pk; }
    }
    if (best) {
      setGate(best.ex + (best.ex - best.cx) * 0.8, best.ez + (best.ez - best.cz) * 0.8, best.cx, best.cz);
      S.order.why += ' · ' + $t('на парковку шлагбаум, объезжай');
    }
  }

  if (plan.ord) ORD.setup(plan);                  // карьера: ECON.orderPay, срок, срочный — ×PAY.URGENT_TIME
  else {
    const d = Math.hypot(S.target.x - V.x, S.target.z - V.z);
    S.fee = CASH(120 * total + Math.round(d * 1.7));
    if (plan.surf) S.fee *= 2;
    // срок — по длине пути по дорогам и по ритму волны (см. slackFor)
    S.timeMax = orderTime(routeLen(V.x, V.z, S.target.x, S.target.z), 1, S.orders);
    if (plan.tut) S.timeMax += 20;
    S.time = S.timeMax;
    if ((S.orders - 1) % 3 === 2 && !plan.tut && !S.order.why.startsWith($t('срочный'))) S.order.why = $t('срочный') + ' · ' + S.order.why;
    /* Гарантия скорости: иногда срок режут почти до предела — без нитро не
       успеть, с нитро реально. Зато после загрузки дают полный бак кофе,
       а за заказ платят в полтора раза больше. */
    if (!plan.tut && !S.ride && S.orders > 2 && plan.stops.length === 1 && chance(0.18)) {
      const L = routeLen(V.x, V.z, S.target.x, S.target.z);
      S.timeMax = clamp(L / RUN_V * 0.88 + 4, 22, 95);
      S.time = S.timeMax;
      S.fee = Math.round(S.fee * 1.5);
      S.order.rush = true;
      const tm = S.timeMax;
      const when = tm < 50 ? $t('за {n} секунд', { n: Math.round(tm / 5) * 5 }) : tm < 75 ? $t('за 1 минуту') : $t('за полторы минуты');
      S.order.rushText = $t('гарантия скорости посчитала, что доставить надо {when}. Поторопись!', { when });
      S.order.why = S.order.rushText;
    }
  }
  if (plan.ord && plan.ord.bundle) syncTarget();  // сборный: первая цель — ближайший по дорогам (o.ord есть только после ORD.setup)
  rebuildRoutePath();
  // первый запуск за всё время: сначала вступление (intro.js), накладная — после него
  if (FIRST.wants(S.order)) { const o = S.order; FIRST.play(o, () => { if (S.state === 'brief' && S.order === o) { showOrderCard(o); Snd.order(); } }); }
  else { showOrderCard(S.order); Snd.order(); }
  Platform.gameplayStop();                        // анкета — это меню: геймплей стоит до «принять»
}

/* Багажник курьера: открывается, когда в машину грузят или из неё
   отдают пиццу, и закрывается, как только коробка влетела или вылетела. */
const TRUNK_P = new THREE.Vector3();
function trunkPoint () {
  const tr = car.userData.trunk;
  if (!tr) return { x: V.x, y: V.y + 1.2, z: V.z };
  TRUNK_P.set(0, tr.py, tr.pz);
  car.localToWorld(TRUNK_P);
  return { x: TRUNK_P.x, y: TRUNK_P.y, z: TRUNK_P.z };
}
/* сколько коробок сейчас в машине: неотданные адреса заказа (в багажнике их видно — carrear.js) */
function pizzasInCar () {
  const o = S.order;
  if (!o || !o.stops || S.state === 'brief' || S.state === 'loading' || S.state === 'back') return 0;
  let n = 0;
  for (let i = o.idx || 0; i < o.stops.length; i++) {
    const st = o.stops[i], peds = st.peds || [];
    n += peds.length ? peds.filter(p => !p.served).length : 1;
  }
  return n;
}
function setTrunk (open) { const tr = car.userData.trunk; if (tr) tr.want = open ? 1.2 : 0; }
function updateTrunk (dt) {
  const tr = car.userData.trunk;
  if (!tr || (tr.a < 0.005 && tr.want === 0)) return;     // закрыт — вмятины на крышке не трогаем
  tr.a = damp(tr.a, tr.want, 9, dt);
  if (tr.want === 0 && tr.a < 0.01) { tr.a = 0; Snd.fx('trunk', s => s.blip(150, 0.06, 'square', 0.08)); }
  tr.m.rotation.x = tr.a;
  tr.m.position.set(tr.m.position.x, tr.hy + Math.sin(tr.a) * tr.len / 2, tr.hz - Math.cos(tr.a) * tr.len / 2);
}

/* «принять» — багажник открывается, из окна пиццерии в него влетает
   коробка, крышка хлопает, и только тогда отпускается руль и тикает срок */
function acceptOrder () {
  if (S.state !== 'brief') return;
  hidePhone();
  S.state = 'loading';
  // Полноэкранная реклама — раз в несколько доставок и только сразу после
  // нажатия «принять»: это пауза между заказами, а не посреди езды
  if (adDue()) { S.adDone = S.done; showAd().then(loadPizza); return; }
  loadPizza();
}
function loadPizza () {
  V.vx = V.vz = 0;
  setTrunk(true);
  // точку разгромили налётом — кухня разгребает стекло, коробка вылетает позже (raid.js loadWait)
  const wait = CAREER ? RAID.loadWait(PIZZA) : 0;
  if (wait > 0 && !loadPizza.waited) {
    loadPizza.waited = true;
    toast($t('кухня разгребает погром — пицца через {n} с', { n: wait }));
    setTimeout(() => { if (S.state === 'loading') loadPizza(); else loadPizza.waited = false; }, wait * 1000);
    return;
  }
  loadPizza.waited = false;
  flyBox(
    { x: PIZZA.wx, y: PIZZA.wy, z: PIZZA.wz },
    trunkPoint,
    1.0,
    () => {
      setTrunk(false);
      if (S.state !== 'loading') {                // пока летела коробка, машина взорвалась
        if (DEATH.keep) { DEATH.keep.prev = 'drive'; S.time = S.timeMax; }   // воскреснет — уже с пиццей
        return;
      }
      S.state = 'drive';
      S.time = S.timeMax;                       // срок пошёл с момента загрузки
      if (S.order && S.order.rush) {
        NOS.tank = 1;
        popBonus($t('поторопись!'), $t('полный бак кофе — жми {key}', { key: nitroKey() }));
      } else toast($t('пицца в машине — поехали'));
      if (S.coffeeNext) { S.coffeeNext = false; tossCoffee(); }
      Platform.gameplayStart();
      Snd.fx('go', s => s.blip(760, 0.1, 'square', 0.13));
    },
  );
}

/* стаканчик кофе из окна пиццерии — вслед за пиццей, в багажник; долетел — +кофе-нитро
   и мелко снизу «держи бонус: полный бак кофе» */
function tossCoffee () {
  const cup = pickupModel('nos');
  cup.scale.setScalar(0.7);
  flyBox({ x: PIZZA.wx, y: PIZZA.wy, z: PIZZA.wz }, trunkPoint, 0.8, () => {
    cup.traverse(o => { if (o.geometry) o.geometry.dispose(); });   // материалы общие, геометрии — свои
    NOS.tank = Math.min(1, NOS.tank + 0.4);
    toast($t('держи бонус: полный бак кофе'));
    Snd.fx('coffee', s => s.blip(980, 0.08, 'triangle', 0.12));
  }, cup);
}

/* цель — неподвижная точка адреса (st.at, pinStop): не ездит за гостем. Зовётся при заказе, после
   вручения и при смене цели сборного; repick === false — без выбора «ближайший по дорогам» */
function syncTarget (repick) {
  const o = S.order;
  if (!o || o.idx >= o.stops.length) { S.target = null; return; }
  if (repick !== false && o.ord && o.ord.bundle) ORD.pickStop(o);   // сборный: цель — ближайший по дорогам неотданный адрес, порядок выбирает игрок (orders.js)
  const st = o.stops[o.idx];
  const ped = st.peds[0], at = st.at || ped;       // at — точка без ждущего прохожего (развоз смены, сюжет)
  S.target = { x: at.x, z: at.z, name: st.persons[0] ? st.persons[0].name : $t('клиент'), ped };
  S.addr = st.persons.map(p => p ? p.name : $t('клиент')).join(', ');
  S.addrLine = st.addr;
}

function backToBase () {
  S.state = 'back';
  if (DISTRICTS && DIST.city()) usePizzeria(CITYOPEN.nearest(V.x, V.z));   // «весь город»: назад — в ближайшую пиццерию
  if (S.order) for (const st of S.order.stops) for (const p of st.peds) if (!p.served) clearGuest(p);
  // штраф «опоздал обратно» (backLate): от цены одного адреса этого заказа; после учебного и развоза смены — без штрафа
  const o = S.order;
  S.backFee = o ? Math.round((S.fee || 0) / Math.max(1, o.stops.length)) : 0;
  S.backNoFine = !!(o && (o.tut || (o.ord && o.ord.type === 'staff')));
  S.order = null;
  S.target = { x: PIZZA.x, z: PIZZA.z, name: PIZZA.name };
  S.addrLine = '';
  S.timeMax = routeLen(V.x, V.z, PIZZA.x, PIZZA.z) / RUN_V * 1.8 + 8 + (S.mealTime || 0);
  S.time = S.timeMax;
  rebuildRoutePath();
  // тоста «возвращайся в пиццерию» нет (UI-REVIEW № 41): куда ехать — зелёная стрелка и точка на радаре
}

/* вручение: багажник открывается, коробка вылетает каждому в руки,
   после последней крышка закрывается */
function handOver (st, onTime) {
  setTrunk(true);
  setTimeout(() => setTrunk(false), 380 + st.peds.length * 220 + 450);
  st.peds.forEach((ped, i) => {
    setTimeout(() => {
      if (ped.dead || S.state === 'over' || S.state === 'dying') return;
      flyBox(trunkPoint(), { x: ped.x, y: (ped.surf ? 0.2 : groundH(ped.x, ped.z)) + 1.15, z: ped.z }, ped.surf ? 1.1 : 0.6, () => {
        if (ped.dead) return;
        const box = pizzaBox();
        box.scale.setScalar(0.75);
        box.position.set(0, ped.sitting ? 1.0 : 1.12, 0.32);
        ped.grp.add(box);
        ped.hold = box;
        ped.served = 1;
        ped.freeT = 16;
        // что делать с пиццей дальше (afterStart); сюжетного клиента ведёт story.js — его не трогаем
        ped.afterMood = st.pay && st.pay.story ? '' : !onTime || st.bumped ? 'angry' : 'happy';
        // смену/заказ уже свернули (backToBase снимает гостя до того, как долетела коробка) — постоит с ней, потом afterStart
        if (ped.afterMood && !ped.guest && !ped.surf && ped.base !== undefined) { if (ped.after) afterDrop(ped, true); ped.guest = true; ped.sitting = 0; ped.sitAt = null; ped.waitAt = null; if (ped.idle) { ped.idle.b.taken = 0; ped.idle = null; } }
        if (ped.afterMood && afterCount() < AFTER.MAX) ped.freeT = onTime && !st.bumped ? AFTER.HOLD : AFTER.HOLD_ANGRY;
        if (onTime) { ped.holdT = 7; emote(ped.x, 2.1, ped.z, 'heart', 5); }
        else emote(ped.x, 2.1, ped.z, 'angry', 3);
      });
    }, 380 + i * 220);
  });
}

function checkArrival (dt) {
  if (!S.target) return;
  const d = Math.hypot(S.target.x - V.x, S.target.z - V.z);
  const speed = Math.hypot(V.vx, V.vz);

  if (S.state === 'drive') {
    // к гостю надо подъехать и притормозить, а не влететь
    if (d > (S.order.stops[S.order.idx].reach || 6) || speed > 6) return;
    const o = S.order;
    const st = o.stops[o.idx];
    const onTime = S.free || S.time > 0;
    if (o.ord && ORD.arrive(o, st, onTime)) return;   // карьера: развоз смены, ORD.onArrive (бандиты и т. п.) — ждём
    const share = Math.round(S.fee / o.stops.length);
    // бонус за скорость: осталось больше шестидесяти процентов срока —
    // «молния», больше тридцати пяти — «быстро»
    const left = clamp(S.time / S.timeMax, 0, 1);
    const tier = S.free ? 0 : left >= 0.5 ? 2 : left >= 0.25 ? 1 : 0;
    let part;
    if (o.ord) part = ORD.payStop(o, st, onTime, tier);   // карьера: ECON.orderPay, PAY.SPEED_BONUS, ECON.tipFor; из чего сложилось — в st.pay
    if (o.ord && CAREER && !o.tut && !S.freeRun && o.ord.type !== 'staff') GROW.delivered(V.x, V.z);   // пиццерия района растёт (growth.js)
    else {
      const bonus = tier ? Math.round(share * (tier === 2 ? 0.6 : 0.3) * (S.tipMul || 1)) : 0;
      // клиент-богач (рядом гуляет богач или дом солидный) — изредка крупные чаевые, см. LIFE.richTip
      const rich = onTime && !st.bumped ? LIFE.richTip(st.peds, share) : 0;   // задел клиента (clientBump) — без чаевых
      part = onTime ? share + bonus + rich : Math.round(share * 0.45);
      st.pay = { fee: share, bonus, tip: rich, rich: !!rich, late: !onTime };
    }
    S.money += part;
    // оплата — сразу в кошелёк: умер или закрыл вкладку — деньги уже твои
    if (!S.freeRun) addWallet(part);
    S.delivered += st.peds.length;
    ACH.deliver({ n: st.peds.length, onTime, left, free: !!S.free, last: o.idx >= o.stops.length - 1, stops: o.stops.length,   // достижения (achievements.js)
      bundle: !!(o.ord && o.ord.bundle), allOnTime: o.stops.every(q => q.pay && !q.pay.late), urgent: !!(o.ord && o.ord.type === 'urgent') });

    handOver(st, onTime);
    if (ADULT && !o.tut) FLIRT.onHand(st, onTime, { car: () => car, person: st.persons[0], speed: () => Math.hypot(V.vx, V.vz),   // клиентка изредка зовёт зайти — диалог, курьер отказывает (flirt.js)
      hold: on => { if (S.state === 'handover') S.handT = on ? 1e9 : 0.3; } });
    DIRECTOR.delivered();                           // доставка сессии: режиссёр открывает события по нарастающей (director.js)
    // оплата — кучкой денег и чеком (popPay); в сюжетном заказе награду покажет катсцена
    const pp = st.pay;
    if (pp && !pp.story) {
      const rows = [[$t('заказ'), pp.fee, '']];
      if (pp.late) rows.push([$t('опоздал'), part - pp.fee, 'neg']);
      if (pp.bonus) rows.push([$t('за скорость'), pp.bonus, 'tip']);
      if (pp.tip) rows.push([pp.rich ? $t('чаевые от богача') : $t('чаевые'), pp.tip, 'tip']);
      if (pp.doorAdd) rows.push([pp.doorMode === 'broken' ? $t('достучался быстро') : $t('домофон с первого раза'), pp.doorAdd, 'tip']);   // мини-игра у подъезда (doorstep.js payAdjust)
      if (pp.doorCut) rows.push([$t('спускался сам'), -pp.doorCut, 'neg']);
      popPay(part, rows, pp.late ? (CAREER ? $t('клиент недоволен') : '') : tier === 2 && pp.bonus ? $t('А ты харош!') : tier && pp.bonus ? $t('Шустро!') : pp.rich ? $t('сдачи не надо!') : pp.tip ? $t('чаевые!') : '',
        st.persons[0] ? { person: st.persons[0], mood: payMood(st, onTime, tier) } : null);
      bossOnDeliver(o, st, onTime, tier);
    } else {
      toast((onTime ? '+' : $t('опоздал') + ' · +') + money(part) + ' · ' + S.addr);
      Snd.coin();
    }

    o.idx++;
    if (o.idx < o.stops.length) {
      syncTarget();
      if (o.ord && o.ord.bundle) {
        // сборный (orders.js): срок один на весь развоз — не добавляем; куда дальше — решает игрок
        toast($tn(o.stops.length - o.idx, 'остался {n} адрес — выбирай, куда дальше|осталось {n} адреса — выбирай, куда дальше|осталось {n} адресов — выбирай, куда дальше'));
      } else {
        // на следующий адрес — срок по его пути, по той же волне
        S.time = Math.max(S.time, 0) + orderTime(routeLen(V.x, V.z, S.target.x, S.target.z), 1, S.orders) * 0.9;
        S.timeMax = Math.max(S.timeMax, S.time);
        toast($t('следующий: {who}', { who: S.addr }));
      }
      Snd.order();
    } else {
      S.state = 'handover'; S.handT = 0.9;
      addXP(o.ord && o.ord.bundle ? o.stops.length : 1);   // сборный: каждая пицца — заказ (рост курьера, econ.js BUNDLE)
      S.done = (S.done || 0) + 1;
      if (o.tut) { Store.set('dlv-msk-tut', '1'); HINTS.stepan(st.peds[0]); }   // Степан зовёт в бизнес и дует облаком на машину (hints.js)
      else if (o.ord) ORD.delivered(o, st, onTime);   // карьера: поручение по SIDE_ORDERS, STORY.onDeliver
      else if (!S.ride && onTime && st.persons[0] && chance(0.45)) offerSide(st.peds[0], st.persons[0]);
    }
  } else if (S.state === 'side') {
    sideArrival(d, speed);
  } else if (S.state === 'back') {
    if (d > 7) return;
    S.state = 'handover'; S.handT = 0.8;
    clearGate();
    // иногда к следующей пицце в багажник кидают и стаканчик кофе — плюс к нитро (loadPizza);
    // без попапа «молодец!»: похвалу и так видно по деньгам
    S.coffeeNext = chance(0.45) && NOS.tank < 0.95;
    Snd.fx('back', s => s.blip(600, 0.12, 'square', 0.13));
  }
}

/* ── карточка выбора: обед и просьбы клиентов ──
   Одна карточка на всё: лицо (если есть), заголовок, реплика и кнопки.
   Кнопки жмутся и цифрами 1–3. Обед ставит игру на паузу, просьба
   клиента — нет: ответишь или уедешь, через десять секунд она гаснет. */
const CH = { opts: [], t: 0, t0: 0, onTimeout: null, pause: false, full: false };
function showChoice (o) {
  const el = $('choice');
  $('ch-face').innerHTML = o.face ? '<img src="' + faceDataURL(o.face) + '" alt="">' : '';
  $('ch-t').textContent = o.title;
  $('ch-s').innerHTML = o.sub || '';
  CH.opts = o.opts; CH.t = CH.t0 = o.timeout || 0; CH.onTimeout = o.onTimeout || null; CH.pause = !!o.pause;
  // full — окно на весь экран (воскреснуть или нет): игра идёт, но выбирают как в меню — стиком/крестовиной и A
  CH.full = !!o.full;
  // на весь экран — значки кнопок по вводу (glyphs.js): первая — [A] / Enter, последняя — [B] / Esc; курсор сразу на первой
  // (UI-REVIEW № 27). Карточка на паузе (обед): геймпад — [A] [X] [Y], каждая своей кнопкой; на ходу (просьба клиента) —
  // крестовина ◀ ▲ ▶ (двух вариантов — ◀ ▶); клавиатура в обоих — цифры 1–3; пальцем — без значков (IDEAS И1, 09.10.2026)
  const DPAD = o.opts.length === 2 ? ['◀', '▶'] : ['◀', '▲', '▶'];
  const em = i => CH.full ? (i === 0 ? keyHTML('ok') : i === o.opts.length - 1 ? keyHTML('back') : '')
    : '<em class="ch-n">' + (i + 1) + '</em>' + (CH.pause ? keyHTML(['ok', 'x', 'y'][i] || '') : '<kbd class="pp-key ch-dpad">' + (DPAD[i] || '') + '</kbd>');
  $('ch-opts').innerHTML = o.opts.map((q, i) => '<button type="button" data-i="' + i + '"' + (CH.full && i === 0 ? ' data-pad-main' : '') + '>' + em(i) + '<b>' + q.label + '</b>' +
    (q.sub ? '<span>' + q.sub + '</span>' : '') + '</button>').join('');
  const sec = $('choice').querySelector('.ch-sec');
  if (sec) sec.textContent = CH.full && CH.t0 ? String(Math.ceil(CH.t0)) : '';
  el.classList.toggle('big', CH.pause || CH.full);
  el.classList.toggle('full', CH.full);
  el.dataset.kind = o.kind || '';                 // свой вид карточки (nos — «первый кофе»), стиль в delivery.css
  el.style.setProperty('--ch-left', '1');
  el.hidden = false;
  // arm — первые миллисекунды кнопки не жмутся: кто жал газ/ручник/A, не закроет окно не глядя
  CH.armAt = performance.now() + (o.arm || 0);
  if (CH.full && !o.arm) { const b0 = $('ch-opts').querySelector('button'); if (b0) { b0.classList.add('ch-main'); try { b0.focus({ preventScroll: true }); } catch (e) { /* — */ } } }
  if (o.arm) {
    const bs = $('ch-opts').querySelectorAll('button');
    for (const b of bs) b.disabled = true;
    setTimeout(() => { for (const b of bs) b.disabled = false; if (!el.hidden && bs[0]) { try { bs[0].focus({ preventScroll: true }); } catch (e) { /* — */ } } }, o.arm);
  }
  if (CH.pause) { S.paused = true; S.meal = true; Snd.engine(0); for (const k in IN) IN[k] = 0; joyReset(); }
}
function hideChoice () {
  const el = $('choice');
  if (el) el.hidden = true;
  CH.opts = []; CH.t = 0; CH.onTimeout = null; CH.full = false;
  if (CH.pause) { CH.pause = false; S.meal = false; S.paused = false; }
}
function pickChoice (i) {
  const q = CH.opts[i];
  if (!q || performance.now() < (CH.armAt || 0)) return;
  hideChoice();
  q.fn();
}
$('ch-opts').addEventListener('click', e => { const b = e.target.closest('button'); if (b) pickChoice(+b.dataset.i); });
function choiceStep (dt) {
  if (!CH.opts.length || CH.pause || !CH.t) return;
  if ((CH.t -= dt) <= 0) { const f = CH.onTimeout; hideChoice(); if (f) f(); return; }
  if (CH.full) {                                   // полоска и секунды «сколько осталось думать»
    $('choice').style.setProperty('--ch-left', String(CH.t / CH.t0));
    const sec = $('choice').querySelector('.ch-sec'), txt = String(Math.max(1, Math.ceil(CH.t)));
    if (sec && sec.textContent !== txt) sec.textContent = txt;
  }
}

/* ── обед ──
   Каждые четыре выполненных заказа — перерыв в пиццерии: выбираешь, что
   съесть, и это буст до конца смены. Бусты складываются. */
const MEAL_EVERY = 4;
const MEALS = [
  { t: $t('шаурма у метро'), s: $t('+1 сердце сверху'), fn () { S.hpMax++; S.hp++; hudHearts(); } },
  { t: $t('бизнес-ланч'), s: $t('чаевые ×2 до конца смены'), fn () { S.tipMul = (S.tipMul || 1) * 2; } },
  { t: $t('двойной раф'), s: $t('кофе жжётся вдвое медленнее, бак полный'), fn () { S.nosEff *= 0.5; NOS.tank = 1; } },
  { t: $t('пицца с работы'), s: $t('все сердца обратно'), ok: () => S.hp < S.hpMax, fn () { S.hp = S.hpMax; hudHearts(); } },
  { t: $t('лапша в подсобке'), s: $t('+8 секунд на каждый заказ'), fn () { S.mealTime = (S.mealTime || 0) + 8; } },
];
const mealDue = () => !CAREER && !S.ride && (S.done || 0) - (S.mealDone || 0) >= MEAL_EVERY;
function showMeal () {
  S.mealDone = S.done;
  const name = [$t('обед'), $t('полдник'), $t('ужин'), $t('ночной дожор')][Math.min(S.meals || 0, 3)];
  S.meals = (S.meals || 0) + 1;
  const pool = MEALS.filter(m => !m.ok || m.ok());
  for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  showChoice({
    title: name, sub: $t('{n} заказа позади — перерыв. что берёшь? это буст до конца смены', { n: MEAL_EVERY }),
    pause: true,
    opts: pool.slice(0, 3).map(m => ({ label: m.t, sub: m.s, fn: () => { m.fn(); popBonus(name + ': ' + m.t, m.s); newOrder(); } })),
  });
  Snd.order();
}

/* ── «сгоняй за пивом» ──
   Иногда гость, которому только что привёз, просит сгонять за пивом в
   ближайший продуктовый — «даю косарь». Взял — едешь в магазин, потом
   обратно к нему, гость ждёт с пиццей в руках. Успел — тысяча сверху;
   не успел — просто передумал, смена идёт дальше. */
/* за чем гоняют: что просят, где взять и как это назвать по дороге.
   prefer — какие вывески подходят лучше всего; нет такой рядом — любая
   из kinds (латешка — в любом кафе, лучше в кофейне по названию: COFFEE_RE) */
const COFFEE_RE = /coffee|кофе|cofix|даблби|wakecup|surf|stars|baggins|кофешефф|coffee point|brun/i;
/* ask — «сгоняй …», what — что везём, gotIt — тост, когда купил.
   Алкоголь и табак убраны: площадки такое не пропускают */
const ERRANDS = [
  { ask: $t('за лимонадом'), what: $t('лимонад'), kinds: ['grocery'], prefer: /пят|дикси|вкусвилл|магнит|перекр|продукт/i, gotIt: $t('лимонад взял') },
  { ask: $t('за шаурмой'), what: $t('шаурма'), kinds: ['food'], prefer: /шаур|кебаб|донер|шашлык/i, gotIt: $t('шаурму взял') },
  { ask: $t('за латешкой'), what: $t('латешка'), kinds: ['cafe'], prefer: COFFEE_RE, gotIt: $t('латешку взял') },
  { ask: $t('за сухариками'), what: $t('сухарики'), kinds: ['grocery'], prefer: /пят|дикси|вкусвилл|магнит|перекр|продукт/i, gotIt: $t('сухарики взял') },
  { ask: $t('за пластырем'), what: $t('пластырь'), kinds: ['pharm'], prefer: /аптек|36,6|столич|ригла/i, gotIt: $t('пластырь взял') },
  { ask: $t('за зарядкой для телефона'), what: $t('зарядка'), kinds: ['shop'], prefer: /мтс|билайн|мегафон|dns|связ|t2|samsung|store|видео/i, anyKind: true, gotIt: $t('зарядку взял') },
  // взрослая версия: то, за чем на самом деле гоняют курьера
  ...(ADULT ? [
    { ask: $t('за пивом'), what: $t('пиво'), kinds: ['grocery'], prefer: /пив|beer|разлив|пят|дикси|магнит|продукт/i, gotIt: $t('пиво взял') },
    { ask: $t('за снюсиком'), what: $t('снюс'), kinds: ['grocery', 'shop'], prefer: /табак|tobac|smoke|vape|вейп|кальян|красное|бристоль|продукт/i, anyKind: true, gotIt: $t('снюсик взял') },
    { ask: $t('за водочкой'), what: $t('водочка'), kinds: ['grocery'], prefer: /вин|алко|wine|красное|бристоль|пят|продукт/i, gotIt: $t('водочку взял') },
  ] : []),
];
function errandShop (it, ped) {
  let shop = null, bd = 1e9, pref = null, pd = 1e9;
  for (const q of SIGNS) {
    // anyKind — табачная лавка годится, даже если в карте она «магазин»
    const fit = it.kinds.includes(q.k) && (!it.anyKind || it.prefer.test(q.n0));
    if (!fit || (it.coffee && !COFFEE_RE.test(q.n0))) continue;
    const d = Math.hypot(q.x - ped.x, q.z - ped.z);
    if (d < 45 || d > 380) continue;
    if (DISTRICTS && !DIST.isOpen(DIST.at(q.x, q.z))) continue;     // магазин за перекрытием закрытого района — не зовём
    if (d < bd) { bd = d; shop = q; }
    if (it.prefer.test(q.n0) && d < pd) { pd = d; pref = q; }
  }
  return pref || shop;
}
function offerSide (ped, person) {
  // берём случайное поручение, для которого рядом есть магазин
  const opts = ERRANDS.map(it => ({ it, shop: errandShop(it, ped) })).filter(o => o.shop);
  if (!opts.length) return;
  const { it, shop } = pick(opts);
  S.handT = 1e9;                                // пока думаешь — дальше не едем
  ped.freeT = 1e9;
  const first = person.first || person.name.split(/\s+/)[0];
  showChoice({
    face: person, title: first + ':', sub: $t('«сгоняй {what}, даю косарь»', { what: it.ask }),
    timeout: 10, onTimeout: () => declineSide(ped),
    opts: [{ label: $t('сгоняю'), sub: shop.n, fn: () => startSide(ped, person, shop, it) },
           { label: $t('не, работаю'), fn: () => declineSide(ped) }],
  });
}
function declineSide (ped) {
  if (!ped.dead) { ped.freeT = 8; emote(ped.x, 2.1, ped.z, 'angry', 1); }
  if (S.state === 'handover') S.handT = 0.2;
}
function startSide (ped, person, shop, it) {
  if (S.state !== 'handover' || ped.dead) { declineSide(ped); return; }
  S.side = { ped, person, shop, it, stage: 'shop' };
  S.order = null;
  S.state = 'side';
  S.target = { x: shop.x + shop.nx * 2, z: shop.z + shop.nz * 2, name: shop.n };
  S.addr = $t('{what} для {who}', { what: it.what, who: person.first || person.name.split(/\s+/)[0] });
  S.addrLine = shop.n;
  S.timeMax = orderTime(routeLen(V.x, V.z, S.target.x, S.target.z), 1, 1);
  S.time = S.timeMax;
  rebuildRoutePath();
  toast($t('{what} — в «{shop}», потом обратно', { what: it.ask, shop: shop.n }));
  Snd.order();
}
function sideArrival (d, speed) {
  const Sd = S.side;
  if (!Sd) return;
  if (Sd.ped.dead) { sideEnd(false, $t('клиенту уже не до этого')); return; }
  if (d > (Sd.stage === 'shop' ? 7 : 5) || speed > 6) return;
  if (Sd.stage === 'shop') {
    Sd.stage = 'back';
    setTrunk(true);
    flyBox({ x: Sd.shop.x + Sd.shop.nx, y: groundH(Sd.shop.x, Sd.shop.z) + 1.2, z: Sd.shop.z + Sd.shop.nz }, trunkPoint, 0.8, () => setTrunk(false), Sd.it.bag && ORD.bagMesh(Sd.it.bag));
    S.target = { x: Sd.ped.x, z: Sd.ped.z, name: Sd.person.name, ped: Sd.ped };
    S.addr = Sd.it.what + ' → ' + Sd.person.name;
    S.addrLine = realAddress(Sd.ped.x, Sd.ped.z);
    S.time = Math.max(S.time, 0) + routeLen(V.x, V.z, Sd.ped.x, Sd.ped.z) / RUN_V * 1.5 + 6;
    S.timeMax = Math.max(S.timeMax, S.time);
    rebuildRoutePath();
    toast($t('{got} — обратно к {who}', { got: Sd.it.gotIt, who: Sd.person.first || Sd.person.name.split(/\s+/)[0] }));
    Snd.fx('go', s => s.blip(760, 0.1, 'square', 0.13));
  } else {
    const ped = Sd.ped;
    setTrunk(true);
    flyBox(trunkPoint(), { x: ped.x, y: groundH(ped.x, ped.z) + 1.15, z: ped.z }, 0.6, () => {
      setTrunk(false);
      if (!ped.dead) emote(ped.x, 2.1, ped.z, 'heart', 6);
    }, Sd.it.bag && ORD.bagMesh(Sd.it.bag));
    const pay = Sd.it.pay || 1000;                // карьера: pay из SIDE_ORDERS
    S.money += pay;
    if (!S.freeRun) addWallet(pay);
    toast((Sd.it.pay ? $t('поручение выполнено!') : $t('косарь!')) + ' ' + Sd.it.ask + ' · +' + money(pay));
    ACH.add('errands');
    sideEnd(true);
  }
}
function sideEnd (ok, msg) {
  const Sd = S.side;
  S.side = null;
  if (Sd && !Sd.ped.dead) Sd.ped.freeT = ok ? 8 : 4;
  if (msg) toast(msg);
  S.order = null;
  backToBase();
}

/* Настроение клиента на экране оплаты (лицо рядом с суммой, docs/ORDERS.md «Лицо клиента»):
     злое      — опоздал или задел его машиной (st.bumped);
     сердечки  — вовремя и быстро (осталось ≥ 25 % срока — tier ≥ 1) или дал чаевые; без таймера — тоже;
     покерфейс — вовремя, но впритык (меньше 25 % срока) и без чаевых. */
function payMood (st, onTime, tier) {
  const pp = st.pay || {};
  if (!onTime || st.bumped) return 'angry';
  return tier || pp.tip || S.free ? 'happy' : 'ok';
}

/* Толик управляющий (chat.js) — после оплаты адреса, когда кучка денег долетела (1,6 с); пишет только на
   плохое и на очень хорошее, обычные доставки — молча:
     опоздал             — ругается и вычитает пиццу на замену (ECON.lateFine) — каждый опоздавший адрес;
     вовремя, tier 2     — «молодец» (осталось ≥ 50 % срока, «А ты харош!»); tier 0—1 — молчит;
     сборный             — промежуточные адреса молча, последний: всё вовремя — хвалит за развоз;
     задел этого клиента — молчит (уже наругал в clientBump); без таймера и сюжетный — молчит. */
function bossOnDeliver (o, st, onTime, tier) {
  const pp = st.pay || {};
  if (pp.story || S.ride) return;
  const last = o.idx >= o.stops.length - 1, bundle = !!(o.ord && o.ord.bundle);
  let kind = '';
  if (!onTime) kind = 'late';
  else if (st.bumped || S.free) kind = '';
  else if (bundle) kind = last && o.stops.every(q => q.pay && !q.pay.late) ? 'bundle' : '';
  else kind = tier >= 2 ? 'fast' : '';
  if (!kind) return;
  const fee = pp.fee || 0;
  CHAT.later(2500, () => {                         // после чека и денег в пачку (ridequeue.js); конец смены ждёт это сообщение (career.js showEnd → CHAT.idle)
    if (kind !== 'late' && !isPlaying() && !CHAT.waiting()) return;
    RQ.hold(1500);                                 // Толик сказал — подсказка и достижение после
    CHAT.react(kind, kind === 'late' ? () => lateFine(fee) : null);
  });
}
/* вычет за опоздание — в момент, когда сообщение Толика появилось: из кошелька (сколько есть) и из «за смену» */
function lateFine (fee) {
  const fine = ECON.lateFine(fee, CAREER ? 1 : ECON.MONEY_K);
  if (CAREER) { const got = Math.max(0, Math.min(fine, wallet())); if (got && !S.freeRun) addWallet(-got); }
  else walletFly(-fine);
  S.money = Math.max(0, S.money - fine);
  if (Snd.fail) Snd.fail();
}

/* опоздал обратно в пиццерию (econ.js BACK_FINE, docs/ORDERS.md «Опоздал обратно», IDEAS К1): срок «вернуться до»
   вышел — Толик пишет в чат и в этот момент вычитает штраф (10 % цены последнего адреса, не меньше 150 ₽) из кошелька
   (сколько есть) и из «за смену»; в чеке смены — строкой «опоздал обратно» (career.js backLate). Один раз за обратный
   путь; после учебного заказа и развоза смены, в «просто катаемся» — без штрафа. Первый раз — подсказка (hints.js) */
function backLate () {
  if (S.backNoFine || S.ride || S.freeRun || !CAREERM.shiftOn() || CAREERM.phase() === 'late') return;
  const fine = ECON.backFine(S.backFee);
  RQ.hold(1500);                                   // Толик сказал — подсказка после
  CHAT.react('back', () => {
    const got = Math.max(0, Math.min(fine, wallet()));
    if (got) addWallet(-got);
    const was = S.money || 0;
    S.money = Math.max(0, was - fine);
    CAREERM.backLate(was - S.money);
    if (Snd.fail) Snd.fail();
  });
  HINTS.backLate(fine);
}

/* срочный не успел (econ.js URGENT, docs/ORDERS.md «Срочный заказ»): опоздания у срочного нет — срок вышел,
   и заказ сорван: 0 ₽, штраф ECON.urgentFine (30 % цены, не меньше 400 ₽) из кошелька (сколько есть)
   и из «за смену», Толик пишет; дальше — в пиццерию за следующим (как после сбитого клиента) */
function urgentFail () {
  const fine = ECON.urgentFine(S.fee || 0, CAREER ? 1 : ECON.MONEY_K);
  const got = Math.max(0, Math.min(fine, wallet()));
  if (got && !S.freeRun) addWallet(-got);
  S.money = Math.max(0, S.money - fine);
  // плашки «срочный заказ сорван» нет: Толик пишет об этом в чат (CHAT.react('urgent')), штраф — красной купюрой
  if (Snd.fail) Snd.fail();
  setTimeout(() => { if (isPlaying()) CHAT.react('urgent'); }, 1200);
  backToBase();
}

/* Задел своего клиента несильно (econ.js CLIENT_HIT: от SOFT до HARD м/с): цел, отшатнулся
   из-под машины, злится — а чаевых по этому адресу уже не будет (st.bumped → orders.js payStop).
   Плашка — один раз на адрес. Не свой клиент — false: дальше как со всеми (runOver). */
function clientBump (p, fx, fz, sx, sz) {
  const o = S.order;
  const st = o && o.stops.slice(o.idx).find(q => q.peds.includes(p));
  if (!st) return false;
  if (p.bumpT > tG) return true;                  // только что толкнули — ещё не отошёл
  p.bumpT = tG + 1.2;
  if (!p.sitting) {
    // в сторону от кузова: туда, где он и стоял относительно машины
    const dx = p.x - V.x, dz = p.z - V.z, across = dx * sx + dz * sz, k = (across >= 0 ? 1 : -1) * (CAR_W + 0.7) - across;
    p.x += sx * k; p.z += sz * k;
    pushOut(p, 0.45);
  }
  p.shock = rand(1.4, 2);
  emote(p.x, 2.1, p.z, 'angry', 3);
  S.shake = Math.max(S.shake, 0.2);
  Snd.fx('bump', s => s.noise(0.12, 0.2));
  if (!st.bumped) {
    st.bumped = true;
    // плашки «задел клиента» нет: Толик пишет в чат (CHAT.react('bump')), клиент злится
    setTimeout(() => { if (isPlaying()) CHAT.react('bump'); }, 900);
    if (CAREER) HINTS.bump();                      // один раз за всё время: «задел — без чаевых; быстрее 43 км/ч — сорван» (hints.js)
  }
  return true;
}

/* цена заказа этого клиента — сколько заплатили бы за его адрес без чаевых и «за скорость»
   (orders.js st.fee; сборный — доля этого адреса) */
function clientFee (ped) {
  const o = S.order;
  const st = o && o.stops.slice(o.idx).find(q => q.peds.includes(ped));
  if (!st) return 0;
  return st.fee || (o.ord && o.ord.fees && o.ord.fees[o.stops.indexOf(st)]) || Math.round((S.fee || 0) / o.stops.length);
}

/* задавил того, кому вёз — смена закончена */
function checkVictim (ped) {
  const o = S.order;
  if (!o) return false;
  return o.stops.slice(o.idx).some(st => st.peds.includes(ped));
}

const ease = t => t * t * (3 - 2 * t);
const DEATH = { t: 0, x: 0, z: 0, h: 0, why: '', victims: [], burn: 0, fireT: 0 };
/* why — ключ причины (не переводится), дальше — что писать */
const DEATH_WORD = {
  'не доставил': GORE_ON ? $t('задавил') : $t('сбил'),
  'машина всё': GORE_ON ? $t('помер') : N_('машина всё'),
  'утонул': N_('утонул'),
  'не успел': N_('не успел'),
};
const OVER_TITLE = { 'машина всё': GORE_ON ? $t('помер') : N_('машина всё'), 'не доставил': $t('клиент потерян'), 'утонул': N_('утонул'), 'не успел': N_('не успел'), 'смена окончена': N_('смена окончена') };

/* заказ и поручение снимаем; при взрыве в карьере — только если не воскрес (revive) */
function dropRun () {
  if (S.side) { S.side.ped.freeT = 3; S.side = null; }
  S.target = null;
  if (S.order) for (const st of S.order.stops) for (const p of st.peds) clearGuest(p);
  S.order = null;
  routePts = [];
  marker.visible = false;
  clearGate();
}

function gameOver (why, victims, focus) {
  if (S.state === 'over' || S.state === 'dying') return;
  CHAT.clear(); DLG.lineClear();
  // карьера, машина взорвалась — можно воскреснуть за деньги из кошелька: заказ пока держим
  ACH.over(why);                                   // взорвал / утопил — достижения (achievements.js)
  // провалился под лёд (ice.js) — тоже как авария: можно воскреснуть, но пицца утонула — заказ сорван
  const iceBroke = why === 'утонул' && ICEM.broke();
  DEATH.keep = CAREER && !S.ride && !S.free && (why === 'машина всё' || iceBroke) ? { prev: S.state, ice: iceBroke } : null;
  DEATH.asked = false; DEATH.rev = null;
  S.state = 'dying';
  hideChoice();
  if (!DEATH.keep) dropRun();
  hidePhone();

  DEATH.t = 0;
  DEATH.x = focus ? focus.x : V.x;
  DEATH.z = focus ? focus.z : V.z;
  DEATH.h = V.camH;
  DEATH.why = why;
  DEATH.victims = victims || [];
  DEATH.burn = why === 'машина всё' ? 1 : 0;
  DEATH.fireT = 0;
  DEATH.sink = why === 'утонул' ? 1 : 0;

  if (DEATH.burn) {
    // машина выгорает: краска чернеет, из-под капота остаётся огонь
    car.traverse(o => { if (o.isMesh && o.material && o.material.color) o.material.color.setHex(0x241f26); });
  }

  // Имя жертвы — крупно и в лоб: не «под колёсами такая-то», а прямая
  // формулировка, за что смена закончилась.
  const el = $('w-word');
  if (DEATH.victims.length) {
    const who = DEATH.victims.map(accName).join(', ');
    el.textContent = $t(GORE_ON ? $t('задавил {who}') : $t('сбил {who}'), { who }).toUpperCase();
    $('w-sub').textContent = why === 'сбил клиента' ? $t('СНЯЛИ СО СМЕНЫ') : $t('КЛИЕНТ ПОТЕРЯН');
  } else {
    el.textContent = $t(DEATH_WORD[why] || 'смена окончена').toUpperCase();
    $('w-sub').textContent = why === 'машина всё' ? '' : why === 'утонул' ? (iceBroke ? $t('ЛЁД НЕ ВЫДЕРЖАЛ') : $t('ВПЛАВЬ НЕ ДОВЕЗЁШЬ')) : $t('ЗАКАЗ ПРОТУХ');
  }
  Platform.gameplayStop();
  el.classList.toggle('long', el.textContent.length > 20);
  $('wasted').hidden = false;
  document.body.classList.remove('w-show');
  Snd.fail();
}

function deathTick (dt) {
  DEATH.t += dt;
  const t = DEATH.t;

  // горящая машина дымит всё кино
  if (DEATH.burn) {
    DEATH.fireT -= dt;
    if (DEATH.fireT <= 0) {
      DEATH.fireT = 0.09;
      fire(V.x + rand(-1, 1), rand(0.9, 2), V.z + rand(-1.6, 1.6));
      puff(V.x + rand(-1, 1), rand(1.6, 3), V.z + rand(-1.6, 1.6), true, rand(0.7, 1.3));
    }
    DEATH.x = V.x; DEATH.z = V.z;                // камера держит машину в кадре
  }
  if (DEATH.sink) { DEATH.x = V.x; DEATH.z = V.z; }

  // камера отъезжает и уходит в небо
  const k = ease(clamp((t - 0.35) / 3.4, 0, 1));
  let back = lerp(11, 5.5, k);
  const y = lerp(4.5, 34, k);
  if (y < 22) while (back > 3 && camInWall(DEATH.x - Math.sin(DEATH.h) * back, DEATH.z - Math.cos(DEATH.h) * back)) back -= 1.5;
  const cx = DEATH.x - Math.sin(DEATH.h) * back, cz = DEATH.z - Math.cos(DEATH.h) * back;
  // тонущую машину снимаем от воды, а не со дна
  const fy = DEATH.sink ? (V.sinkL || 0) : DEATH.x === V.x && DEATH.z === V.z ? V.y : floorAt(DEATH.x, DEATH.z);
  cam.position.set(cx, Math.max(fy + y, groundH(cx, cz) + 2), cz);
  cam.lookAt(DEATH.x, fy + lerp(1.4, 0, k), DEATH.z);

  if (t > 1.2) document.body.classList.add('w-show');
  if (DEATH.keep && !DEATH.asked && t > 1.8) askRevive();
  if (DEATH.keep && t > 4.9) DEATH.t = 4.9;       // ждём ответа: воскреснуть или нет
  if (t > 5) {
    S.state = 'over';
    setTimeout(clearRivals, 0);
    elNote.textContent = '';
    $('wasted').hidden = true;
    document.body.classList.remove('w-show');
    showOver(DEATH.why, DEATH.victims);
  }
}

/* ── воскрешение (карьера): машина взорвалась — за деньги из кошелька с неба
   в луче света спускается новая, на крыльях, и смена идёт дальше с тем же
   заказом. Цена — ECON.REVIVE: 3 000 ₽, по скидке 1 000 ₽ — раз в SALE_EVERY смен
   (когда была скидка — dlv-rev-sale, номер смены по dlv-shifts). ── */
const revivePrice = () => ECON.revivePrice(+Store.get('dlv-shifts', 0) || 0, Store.get('dlv-rev-sale', null));
function askRevive () {
  DEATH.asked = true;
  const R = revivePrice(), price = R.price, have = wallet();
  const money = n => moneyOf(n).replace(/\s/g, '\u00a0');   // цена не переносится посередине (UI-REVIEW № 27)
  const no = () => { DEATH.keep = null; dropRun(); };
  // скидка: «1 000 ₽ вместо 3 000 ₽ · раз в 3 смены»; нет скидки — когда будет
  const every = ECON.REVIVE.SALE_EVERY;
  const saleLine = R.sale ? $t('скидка: {sale} вместо {full}', { sale: money(R.price), full: money(R.full) }) + ' · ' + $tn(every, 'раз в {n} смену|раз в {n} смены|раз в {n} смен')
    : $tn(R.wait, 'скидка {sale} — через {n} смену|скидка {sale} — через {n} смены|скидка {sale} — через {n} смен', { sale: money(ECON.REVIVE.SALE) });
  if (have < price) {
    showChoice({ title: $t('воскреснуть — {money}', { money: money(price) }),
      sub: $t('в копилке {money} — не хватает', { money: money(have) }) + ' · ' + saleLine,
      opts: [{ label: $t('ну что ж'), fn: no }], timeout: 4, onTimeout: no, full: true });
    return;
  }
  showChoice({ title: R.sale ? $t('воскреснуть со скидкой?') : $t('воскреснуть?'),
    sub: $t('новая машина спустится с неба · из копилки {money} (там {have})', { money: money(price), have: money(have) }),
    opts: [{ label: $t('воскреснуть · {money}', { money: money(price) }) + (R.sale ? ' <s>' + money(R.full) + '</s>' : ''),
      sub: (DEATH.keep && DEATH.keep.ice ? $t('пицца утонула — заказ сорван, смена — дальше') : $t('заказ и смена — дальше')) + ' · ' + saleLine, fn: () => { paidSeal(); revive(price, R.sale); } },
      { label: $t('нет, закончить смену'), fn: no }],
    timeout: 9, onTimeout: no, full: true });
  Snd.order();
}

/* воскрешение оплачено: зелёная печать ОПЛАЧЕНО хлопает посреди экрана на 1,1 с (paper.css .pp-seal) */
function paidSeal () {
  const e = document.createElement('div');
  e.className = 'pp-seal pp-seal-green paid-seal';
  e.textContent = $t('оплачено');
  ($('game') || document.body).appendChild(e);
  setTimeout(() => e.remove(), 1100);
}
let REV_FX = null;
function reviveFx () {
  if (REV_FX) return REV_FX;
  const add = (hex, op) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const feather = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const tip = new THREE.MeshBasicMaterial({ color: 0xffc94a });
  const wing = s => {
    const w = new THREE.Group();
    // крыло плоское, как у птицы: перья веером назад — переднее длинное, золотое по краю
    [[3.8, 0.7, 0.35], [3.3, 0.7, -0.25], [2.7, 0.65, -0.8], [2.0, 0.6, -1.3]].forEach(([L, W, z], i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(L, 0.12, W), i === 0 ? tip : feather);
      m.position.set(s * L / 2, i * 0.03, z);
      m.rotation.y = s * i * 0.12;
      w.add(m);
    });
    w.position.set(s * 0.8, 1.7, -0.2);
    return w;
  };
  const fx = new THREE.Group();
  fx.userData.noBox = true;                          // шарф бабы Зины (story.js) меряет машину без крыльев
  const wl = wing(-1), wr = wing(1);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.1, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
  halo.rotation.x = Math.PI / 2; halo.position.y = 2.9;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 10), add(0xffe9a0, 0.2));
  glow.scale.set(1, 0.75, 1.4); glow.position.y = 1;
  fx.add(wl, wr, halo, glow);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.4, 90, 18, 1, true), add(0xfff0a8, 0.09));
  return (REV_FX = { fx, wl, wr, halo, glow, beam });
}

function revive (price, sale) {
  addWallet(-price);
  // под лёд провалился — новая машина спускается на берег, где стоял последний раз, носом от воды (ice.js)
  if (DEATH.keep && DEATH.keep.ice) { const p = ICEM.shore(); if (p) { V.x = p.x; V.z = p.z; V.h = p.h; } }
  S.revives = (S.revives || 0) + 1;
  if (sale) { Store.set('dlv-rev-sale', +Store.get('dlv-shifts', 0) || 0); Store.flush && Store.flush(); }   // скидка снова — через ECON.REVIVE.SALE_EVERY смен
  DEATH.rev = { t: 0, price, y0: floorAt(V.x, V.z), cx: cam.position.x, cy: cam.position.y, cz: cam.position.z };
  DEATH.burn = 0;
  $('wasted').hidden = true;
  document.body.classList.remove('w-show');
  // от сгоревшей — дым и искры, на её месте ничего; новая — в небе
  puff(V.x, 1.5, V.z, true, 1.6); sparks(V.x, 1, V.z, 14);
  V.vx = V.vz = 0; V.y = DEATH.rev.y0; V.air = false; V.vy = 0;
  resetCar();
  const F = reviveFx();
  car.add(F.fx);
  F.fx.scale.set(1, 1, 1); F.beam.material.opacity = 0.09;
  F.beam.position.set(V.x, DEATH.rev.y0 + 45, V.z);
  scene.add(F.beam);
  Snd.fx('revive', s => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => s.blip(f, 0.35, 'triangle', 0.08), i * 140)));
}

const REV_T = 3.6;                                   // сколько летит сверху, с
function reviveTick (dt) {
  const R = DEATH.rev, F = REV_FX;
  R.t += dt;
  const t = R.t, k = clamp(t / REV_T, 0, 1);
  const y = R.y0 + 38 * (1 - k) ** 1.5;            // плавно, у земли — медленнее
  car.position.set(V.x, y, V.z);
  car.rotation.set(0, V.h + (1 - k) ** 2 * 1.6, Math.sin(t * 2.2) * 0.06 * (1 - k));
  // крылья машут, у земли — реже и складываются
  const flap = Math.sin(t * lerp(11, 5, k)) * lerp(0.55, 0.2, k);
  F.wl.rotation.z = -flap; F.wr.rotation.z = flap;
  F.halo.rotation.z += dt * 2;
  if (Math.random() < 0.5) sparks(V.x + rand(-2, 2), y + rand(0, 2), V.z + rand(-2, 2), 1);
  // камера сбоку и чуть снизу — видно, как спускается в луче
  if (!R.cam) {                                     // точка съёмки: первая, где не в стене
    const fx = Math.sin(V.h), fz = Math.cos(V.h), sx = Math.cos(V.h), sz = -Math.sin(V.h);
    R.cam = [V.x - fx * 14 + sx * 7, V.z - fz * 14 + sz * 7];
    for (const [b, sd] of [[14, 7], [14, -7], [-14, 7], [-14, -7], [9, 5], [9, -5], [-9, 5], [-9, -5], [6, 0], [-6, 0]]) {
      const x = V.x - fx * b + sx * sd, z = V.z - fz * b + sz * sd;
      if (camClear(x, z) && camClear((x + V.x) / 2, (z + V.z) / 2)) { R.cam = [x, z]; break; }
    }
  }
  const [cx, cz] = R.cam, cy = Math.max(R.y0 + 2.6 + (y - R.y0) * 0.3, groundH(cx, cz) + 2);
  const m = clamp(t / 1.1, 0, 1);
  cam.position.set(lerp(R.cx, cx, m), lerp(R.cy, cy, m), lerp(R.cz, cz, m));
  cam.lookAt(V.x, lerp(y + 1, R.y0 + 1.2, 0.25), V.z);
  if (k >= 1 && !R.landed) {
    R.landed = true;
    puff(V.x, R.y0 + 0.4, V.z, false, 1.8);
    for (let i = 0; i < 3; i++) sparks(V.x, R.y0 + 1, V.z, 10);
    rumble(0.5, 200);
    Snd.coin();
  }
  // приземлился — крылья и свет гаснут за секунду
  const f = clamp((t - REV_T) / 1, 0, 1);
  F.fx.scale.setScalar(1 - f * 0.999);
  F.beam.material.opacity = 0.09 * (1 - f);
  if (f < 1) return;
  car.remove(F.fx);
  scene.remove(F.beam);
  car.rotation.set(0, V.h, 0);
  DEATH.rev = null;
  const prev = DEATH.keep ? DEATH.keep.prev : 'drive';
  const iceLost = !!(DEATH.keep && DEATH.keep.ice);
  DEATH.keep = null;
  S.hp = S.hpMax; hudHearts();
  FXS.shieldT = 3;                                  // три секунды не бьёт: только что с неба
  S.hurt = 0;
  S.state = ['drive', 'back', 'handover', 'side', 'loading', 'brief'].includes(prev) ? prev : 'drive';
  if (S.state === 'brief' && S.order) showOrderCard(S.order);   // взорвался, пока висела карточка — она снова
  // под лёд: пицца утонула — заказ (и поручение) сорваны, без штрафа; дальше — в пиццерию за следующим
  if (iceLost && ['drive', 'handover', 'side'].includes(S.state)) {
    if (S.side) { S.side.ped.freeT = 3; S.side = null; }
    backToBase();
    S.backNoFine = true;
  }
  V.camX = cam.position.x; V.camZ = cam.position.z; V.camY = cam.position.y; V.camH = V.h;
  Platform.gameplayStart();
  // плашки «воскрес!» нет: цену видел на карточке, списание — красной купюрой из пачки
}

function startRun (ride) {
  LATE.flush();                                   // город ещё достраивался за меню — сначала достроить (latebuild.js)
  S.ride = !!ride;
  if (!S.ride && !QR.on()) SEAS.advanceSeason();   // каждая смена — шаг к следующему времени года (быстрый заезд — свой сезон)
  DIRECTOR.shiftStart(S.ride);                   // режиссёр событий: смена сессии (director.js) — до погоды и фестиваля
  WTH.shiftStart(S.ride);                         // вариант погоды на смену: жара, гроза, снегопад… (weather.js)
  S.free = S.ride;                               // катаемся без срока и не в зачёт
  $('wasted').hidden = true;
  document.body.classList.remove('w-show');
  if (DISTRICTS) { usePizzeria(DIST.cur()); districtLocks(); FM.dist = null; DW.ok = null; }   // смена — у пиццерии района, где работаешь
  resetCar();
  DIRT.wash(SEAS.snowAmt());                      // новая смена — машина чистая, зимой — снег на крыше (cardirt.js)
  S.hpMax = curCar().hp;
  carStats();
  Snd.starter();                                  // стартер: «вжжж-вжжж» и мотор схватывает (motor.js)
  RECENT.length = 0;
  S.done = 0; S.mealDone = 0; S.meals = 0; S.tipMul = 1; S.nosEff = 1; S.mealTime = 0; S.side = null;
  hideChoice();
  THIEF.cd = rand(35, 60);
  S.state = 'drive'; S.hp = S.hpMax; S.money = 0; S.orders = 0; S.burgers = 0; S.shiftT = 0;
  S.people = 0; S.wrecks = 0; S.delivered = 0; S.scoots = 0; S.revives = 0;
  JUNK.reset();                                    // снесённые остановки и контейнеры — на место, S.stops = 0 (junk.js)
  LAWNP.reset();                                   // сбитая мелочь на газоне — на место (lawnprops.js)
  CONSTR.reset();                                  // стройки — как новые: забор, кучи, бытовки и техника (construction.js)
  RIVS.reset();                                    // точки конкурентов — как новые, маскоты на местах (rivals.js)
  S.hurt = 0; S.shake = 0;
  S.freeRun = S.free;
  S.lvl0 = levelOf(getXP());
  if (CAREER) RAID.shiftStart({ ride: S.ride, quick: QR.on() });   // налёт на точку в эту смену? (raid.js)
  if (CAREER) { FEST.shiftStart({ ride: S.ride, quick: QR.on() }); if (!S.ride) FEST.announce(); }   // фестиваль в эту смену? (festivals.js)
  if (CAREER && !S.ride) CAREERM.startShift();   // часы — на 9:00, обед, звёзды за смену; волна щедрости (districts.js)
  NOS.tank = DISTRICTS && !S.ride ? DIST.pace().tank : 0.5; NOS.burn = false;
  for (const n of NITRO_CANS) { n.t = 0; }
  scatterPickups();                              // кофе и аптечки — по району и по волне
  lootReset();                                   // деньги на улице и лишнее сердце — заново на смену
  FXS.shieldT = 0; FXS.beastT = 0;
  startPose();
  V.vx = V.vz = 0; V.camX = V.x + 12; V.camZ = V.z; V.camH = V.h; V.camY = V.y + 6;
  hudHearts();
  hideOver();
  $('menu').hidden = !S.ride;
  if (S.ride) { clearRivals(); S.order = null; S.target = null; routePts = []; toast($t('просто катаемся: без заказов и рекордов · esc — пауза и выход')); Platform.gameplayStart(); }
  else { initRivals(); newOrder(); }
}

/* из «просто покататься» — обратно в меню */
function toMenu () {
  if (!S.ride || S.state === 'dying') return;
  S.state = 'title'; S.ride = false; S.free = false;
  $('menu').hidden = true;
  showTitle();
}
/* карьера: после итогов смены — катаемся дальше с того же места (сгорела или утонула — заново у пиццерии) */
function rideOn () {
  if (S.hp <= 0 || V.sink !== undefined) { startRun(true); return; }
  hideOver();
  S.ride = true; S.free = true; S.freeRun = true; S.money = 0;
  S.order = null; S.target = null; S.side = null; routePts = [];
  S.state = 'drive';
  $('menu').hidden = false;
  clearRivals();
  Platform.gameplayStart();
  toast($t('просто катаемся: без заказов и рекордов · esc — пауза и выход'));
}
$('menu').addEventListener('click', toMenu);
$('st-ride').addEventListener('click', () => { Snd.boot(); Snd.resume(); elName.blur(); startRun(true); });


/* звук и пауза кнопками: не все догадаются про M и P */
$('sfx').textContent = Snd.on ? $t('звук вкл') : $t('звук выкл');
$('sfx').addEventListener('click', e => { Snd.set(!Snd.on); e.currentTarget.blur(); });
$('pause').addEventListener('click', e => { setPause(!S.paused); e.currentTarget.blur(); });
/* пауза — значком «две полосочки» (на паузе — треугольник «дальше»); слово — в подсказке и для читалки */
function pauseBtn (on) { const b = $('pause'), l = on ? $t('продолжить') : $t('пауза'); b.classList.toggle('on', !!on); b.title = l; b.setAttribute('aria-label', l); }
pauseBtn(false);

/* ── меню паузы ──
   На экране во время езды только сердца, деньги, время и радар с кольцом
   нитро. Всё остальное — куда едем, сколько сбито, звук, карта района и
   выход — здесь. */
const elPause = $('pausem');
/* текущий заказ — накладной, как на карточке заказа: шапка с номером, таблица, фото на скрепке.
   Только кому, куда, что, оплата и пометка по делу (О4, 09.10.2026: убраны «до точки» и «сейчас» — время и сезон) */
function orderInfo () {
  const rows = [];
  let persons = [], head = $t('накладная');
  if (S.ride) rows.push([$t('заказ'), '<b>' + $t('просто катаешься') + '</b><small>' + $t('без заказов и рекордов') + '</small>']);
  else if (S.state === 'side' && S.side) {
    persons = [S.side.person];
    rows.push([$t('поручение'), '<b>' + S.addr + '</b>'], [$t('куда'), S.addrLine]);
  } else if (S.state === 'back') {
    rows.push([$t('куда'), '<b>' + $t('в пиццерию') + '</b>' + (PIZZA ? '<small>' + PIZZA.name + '</small>' : '')]);
  } else if (S.target && S.order && S.order.ord && S.order.ord.bundle) {
    // сборный (orders.js): все получатели со своими адресами, отданные (st.done) — с галочкой и зачёркнуты
    const o = S.order;
    head = $t('накладная') + ' · ' + KIND_LABEL.bundle;
    persons = o.stops.filter(st => !st.done).flatMap(st => st.persons);
    rows.push([$t('получатель'), o.stops.map(st => {
      const nm = st.persons.map(p => (p && p.name) || $t('клиент')).join(', ');
      return st.done ? '<b><s>✓ ' + nm + '</s></b>' : '<b>' + nm + '</b><small>' + st.addr + '</small>';
    }).join('')], [$t('заказ'), o.items]);
    if (S.fee > 0) rows.push([$t('оплата'), money(S.fee)]);
  } else if (S.target && S.order) {
    const o = S.order, st = o.stops[Math.min(o.idx, o.stops.length - 1)];
    head = $t('накладная') + ' · ' + (KIND_LABEL[o.kind] || $t('заказ'));
    persons = st.persons;
    rows.push([$t('получатель'), persons.map(p => '<b>' + ((p && p.name) || $t('клиент')) + '</b>').join('')],
      [$t('адрес'), S.addrLine + (o.stops.length > 1 ? '<small>' + $t('{i} из {n}', { i: o.idx + 1, n: o.stops.length }) + '</small>' : '')],
      [$t('заказ'), o.items]);
    if (S.fee > 0) rows.push([$t('оплата'), money(S.fee)]);
  } else rows.push([$t('заказ'), '<b>' + $t('заказа пока нет') + '</b>']);
  const why = orderWhy(S.order);
  if (why && S.target && S.order && !S.ride && S.state !== 'side' && S.state !== 'back') rows.push([$t('пометка'), why]);
  const faces = persons.filter(Boolean).slice(0, 2).map(p => '<div class="oc-p"><img src="' + faceDataURL(p) + '" alt=""></div>').join('');
  return '<div class="pm-inv-top"><span>' + head + '</span><span>№ ' + String(S.orders).padStart(4, '0') + '</span></div>' +
    '<div class="oc-sheet"><table class="oc-inv">' + rows.map(([k, v]) => '<tr><th>' + k + '</th><td>' + v + '</td></tr>').join('') + '</table>' +
    (faces ? '<div class="oc-photos' + (persons.length > 1 ? ' small' : '') + '"><i class="oc-clip"></i>' + faces + '</div>' : '') + '</div>';
}
/* какие кнопки за что — тем, чем сейчас играют: геймпад, палец или клавиатура */
function keysInfo () {
  const pad = document.body.classList.contains('pad'), touch = !pad && document.body.classList.contains('touch');
  const k = (...ks) => ks.map(x => '<kbd>' + x + '</kbd>').join('');
  const rows = pad ? [
    [k('RT'), $t('газ')], [k('LT'), $t('тормоз, назад')], [k($t('левый стик')), $t('руль')],
    [k('B'), $t('ручник')], [k('A', 'RB'), $t('кофе — зажал и полетел')], [k('A'), $t('принять заказ')],
    [k('Y'), $t('карта района')], [k('←', '↑', '→'), $t('ответ клиенту')], [k('R3'), $t('звук')], [k('☰'), $t('пауза')],
    [k('LB'), $t('повтор последних 10 с')],
  ] : touch ? [
    [k($t('палец')), $t('тянешь вверх — газ, вниз — тормоз, в стороны — руль')], [k($t('второй палец')), $t('ручник')],
    [k($t('кофе')), $t('держать — ускорение')], [k($t('радар')), $t('карта района')],
  ] : [
    [k('W', '↑'), $t('газ')], [k('S', '↓'), $t('тормоз, назад')], [k('A', 'D'), $t('руль')],
    [k($t('пробел')), $t('ручник')], [k('Shift', 'N'), $t('кофе')], [k('Tab'), $t('карта района')],
    [k('1', '2', '3'), $t('ответ клиенту')], [k('M'), $t('звук')], [k('Esc', 'P'), $t('пауза')],
    [k('R'), $t('повтор последних 10 с')],
  ];
  return '<div class="pm-keys-t">' + (pad ? $t('геймпад') : touch ? $t('управление') : $t('клавиатура')) + '</div>' +
    '<div class="pm-keys-g">' + rows.map(([a, b]) => '<span>' + a + '</span><em>' + b + '</em>').join('') + '</div>';
}
function renderPause () {
  $('pm-order').innerHTML = orderInfo();
  $('pm-keys').innerHTML = keysInfo();
  // респект — одной строкой за смену и званием отдельно (UI-REVIEW № 24): «респект за смену +0», «звание: Тень с коробкой ★0»
  const rows = [[$t('доставлено'), S.delivered], [$t('заработано'), money(S.money)], CAREER ? [$t('респект за смену'), (RESPECT.shift() < 0 ? '−' : '+') + Math.abs(RESPECT.shift())] : [$t('респектов'), S.burgers],
    [$t('прохожих сбито'), S.people], [$t('самокатчиков'), S.scoots], [$t('машин всмятку'), S.wrecks]];
  if (S.stops) rows.push([$t('остановок снесено'), S.stops]);
  // все курьеры смены — здесь; в езде на хаде только твоё место (UI-REVIEW № 31, rivalsStep)
  if (RIVALS.length) rows.push(...rivalBoard().map((r, i) => [(i + 1) + '. ' + (r.me ? $t('ты') : r.n), money(r.m)]));
  // перенесено с хада (04.10.2026): часы смены и респект с званием — только здесь
  if (CAREER && !S.ride && CAREERM.shiftOn()) {
    const sl = Math.max(0, Math.ceil(CAREERM.shiftLeft()));
    rows.unshift([$t('до конца смены'), Math.floor(sl / 60) + ':' + String(sl % 60).padStart(2, '0')]);
    rows.push([$t('звание'), RESPECT.level().name + ' ★' + RESPECT.get()]);
  }
  // когда откроется следующий район: «новый район · «Кольцо» через 2 смены», «смена в зачёт · от 3 заказов · сейчас 1»
  if (CAREER && !S.ride && CAREERM.districtNext) rows.push(...CAREERM.districtNext(S.delivered || 0));
  // чек смены: строка — «что ........ сколько»
  $('pm-stats').innerHTML = '<div class="pm-rc-t">' + $t('за смену') + '</div>' +
    rows.map(([k, v]) => '<div class="pm-rc-r"><span>' + k + '</span><i></i><b>' + v + '</b></div>').join('');
  $('pm-sfx').textContent = Snd.on ? $t('звук: вкл') : $t('звук: выкл');
  $('pm-menu').textContent = S.ride ? $t('в главное меню') : $t('закончить смену');
  PAUSE.label();
}
function setPause (on) {
  // обед — обязательный выбор (CAREER.md «Обед»): пока карточка на экране, пауза ни ставится, ни снимается —
  // Start / Esc / кнопка паузы раньше снимали паузу, и мир ехал под висящей карточкой обеда
  if (S.meal) return;
  if (on && !['drive', 'back', 'handover', 'brief', 'loading', 'side'].includes(S.state)) return;
  S.paused = on;
  pauseBtn(on);
  if (on) Platform.gameplayStop(); else if (isPlaying()) Platform.gameplayStart();
  if (elPause) elPause.hidden = !on;
  if (on) { Snd.engine(0); PAUSE.reset(); renderPause(); for (const k in IN) IN[k] = 0; joyReset(); CL.refreshButton(true); }
}
/* выйти в меню посреди смены: заработанное уже в кошельке, итоги — как в конце */
function endShift (why) {
  setPause(false);
  if (S.side) { S.side.ped.freeT = 3; S.side = null; }
  hideChoice();
  if (S.order) for (const st of S.order.stops) for (const p of st.peds) clearGuest(p);
  S.order = null; S.target = null; routePts = [];
  marker.visible = false;
  hidePhone(); clearGate();
  if (S.ride) { S.state = 'title'; S.ride = false; S.free = false; $('menu').hidden = true; showTitle(); }
  else { S.state = 'over'; showOver(typeof why === 'string' ? why : 'смена окончена', []); }   // why — «время» из career.js (полночь)
  Platform.gameplayStop();
  clearRivals();
}
if (elPause) {
  $('pm-go').addEventListener('click', () => setPause(false));
  $('pm-map').addEventListener('click', () => { setPause(false); setFullMap(true); FM.fromPause = true; });
  $('pm-sfx').addEventListener('click', () => { Snd.set(!Snd.on); renderPause(); });
  $('pm-menu').addEventListener('click', endShift);
  // пауза — карусель (pausecz.js); «настройки» — те же, что в главном меню, поверх паузы
  PAUSE.init(elPause, { replay: () => REPLAY.open('pause'), settings: tab => { elPanel.hidden = false; SET.render(undefined, tab); }, navReset: () => { padMenu.clear(); if (CAREER) CAREERM.kbClear(); } });
}

/* нитро кнопкой — пока держишь палец */
for (const ev of ['pointerdown']) $('nos').addEventListener(ev, e => { e.preventDefault(); IN.nitro = 1; });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
  $('nos').addEventListener(ev, () => { IN.nitro = 0; });

/* «принять»: до него руль заблокирован */
$('ph-accept').addEventListener('click', acceptOrder);

/* ─────────────── ввод ─────────────── */
const KEY = {
  ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  ShiftLeft: 'nitro', ShiftRight: 'nitro', KeyN: 'nitro',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'hand',
};

addEventListener('keydown', e => {
  if (!elPanel.hidden) {
    if (e.code === 'Escape') panelBack();
    else if (!CAREER && (e.code === 'ArrowLeft' || e.code === 'ArrowRight') && SET.flip(e.code === 'ArrowLeft' ? -1 : 1)) e.preventDefault();   // в карьере листает career.js onKey
    return;
  }
  if (CH.opts.length && /^Digit[1-3]$/.test(e.code)) { pickChoice(+e.code.slice(5) - 1); return; }
  if (CH.full && CH.opts.length && !e.repeat) {      // воскрешение: Enter — первая (воскреснуть), Esc — последняя (нет)
    if (matchKey('ok', e)) { e.preventDefault(); pickChoice(0); return; }
    if (matchKey('back', e)) { e.preventDefault(); pickChoice(CH.opts.length - 1); return; }
  }
  // окно на паузе с одной кнопкой («понял»): Enter и пробел жмут её; зажатый ручник (повтор) — нет
  if (CH.pause && CH.opts.length === 1 && /^(Enter|NumpadEnter|Space)$/.test(e.code)) { e.preventDefault(); if (!e.repeat) pickChoice(0); return; }
  if (CH.pause) return;
  // накладная: Enter — «ГАЗ ГАЗ», как A на геймпаде (значок [Enter] на штампе; раньше с клавиатуры — только мышью)
  if (S.state === 'brief' && (e.code === 'Enter' || e.code === 'NumpadEnter') && !S.paused && !FM.open && !DLG.isOpen() && !(CAREER && CAREERM.padRoot())) {
    e.preventDefault();
    if (!e.repeat && elPhone.classList.contains('on')) acceptOrder();
    return;
  }
  if (matchKey('x', e) && !e.repeat && !S.paused && !FM.open && isPlaying() && GFX.offerYes()) { e.preventDefault(); return; }   // X — «включить „среднюю“» (gfx.js)
  if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) setFullMap(!FM.open); return; }
  if (FM.open) { if (e.code === 'Escape' || e.code === 'Space') setFullMap(false); return; }
  if (KEY[e.code]) { IN[KEY[e.code]] = 1; e.preventDefault(); }
  Snd.boot(); Snd.resume();
  if (e.code === 'Space' && (S.state === 'title' || (S.state === 'over' && !CAREER))) {   // в карьере на итогах пробел жмёт кнопку, а не «ещё раз»
    if (S.name || !Platform.features.nameInput) goRun(); else elName.focus();
  }
  if (phoneT > 0 && e.code !== 'KeyM') hidePhone();
  if (e.code === 'KeyM' && !e.repeat) { Snd.set(!Snd.on); toast(Snd.on ? $t('звук вкл') : $t('звук выкл')); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !FM.open && !e.repeat) setPause(!S.paused);
});
addEventListener('keyup', e => { if (KEY[e.code]) { IN[KEY[e.code]] = 0; e.preventDefault(); } });
addEventListener('blur', () => { for (const k in IN) IN[k] = 0; });

/* ── джойстик: палец (или мышь) на картинке ──
   Где положил палец — там центр. Тянешь вверх — газ, вниз — тормоз, а на
   месте — назад, в стороны — руль, и чем дальше отвёл, тем круче. Второй
   палец — ручник. Это те же WASD, только пальцем; кружок с ручкой
   нарисован прямо под пальцем. */
const JOY = { id: null, ox: 0, oy: 0, x: 0, y: 0, hand: null };
const JOY_R = 58;
const elJoy = $('joy'), elKnob = $('joy-k');
const touches = { clear: () => joyReset() };      // старое имя: сбросить всё, что держит палец
function joyReset () {
  JOY.id = null; JOY.hand = null; JOY.x = JOY.y = 0;
  IN.joy = 0; IN.jx = 0;
  elJoy.hidden = true;
}
function joyApply () {
  const on = JOY.id !== null;
  IN.joy = on ? 1 : 0;
  IN.jx = on ? JOY.x : 0;
  IN.gas = on && JOY.y < -0.22 ? 1 : 0;
  IN.brake = on && JOY.y > 0.28 ? 1 : 0;
  IN.left = on && JOY.x < -0.2 ? 1 : 0;
  IN.right = on && JOY.x > 0.2 ? 1 : 0;
  IN.hand = JOY.hand !== null ? 1 : 0;
  elKnob.style.transform = 'translate(' + (JOY.x * JOY_R) + 'px, ' + (JOY.y * JOY_R) + 'px)';
}
/* ── телефон: кнопки вместо джойстика ──
   Как в казуальных гонках: руль ◀ ▶ под левым большим пальцем, газ,
   тормоз, нитро и ручник — под правым. Каждая кнопка держит свой палец
   (pointer capture), поэтому газ с рулём жмутся одновременно. */
const TOUCH = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && 'ontouchstart' in window);
document.body.classList.toggle('touch', TOUCH);
const elTouch = $('touchpad');
for (const b of elTouch.querySelectorAll('button[data-k]')) {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); Snd.boot(); Snd.resume(); try { b.setPointerCapture(e.pointerId); } catch (_) {} IN[k] = 1; IN.joy = 0; b.classList.add('on'); };
  const off = () => { IN[k] = 0; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, off);
  b.addEventListener('contextmenu', e => e.preventDefault());
}
function touchpadStep () {
  const show = TOUCH && isPlaying() && !S.paused && !FM.open && S.state !== 'brief' && S.state !== 'loading';
  if (elTouch.hidden === show) {
    elTouch.hidden = !show;
    if (!show) for (const b of elTouch.querySelectorAll('.on')) { b.classList.remove('on'); IN[b.dataset.k] = 0; }
  }
}

/* Палец считаем только если он лёг на саму картинку: кнопки хада и
   «принять» в джойстик не уходят. На телефоне джойстика нет — там кнопки. */
addEventListener('pointerdown', e => {
  Snd.boot(); Snd.resume();
  if (e.target !== canvas) return;              // поля и кнопки хада не трогаем
  if (TOUCH && e.pointerType !== 'mouse') return;
  if (S.state === 'title' || S.state === 'over') return;       // стартуем кнопкой «поехали»
  if (JOY.id === null) {
    JOY.id = e.pointerId; JOY.ox = e.clientX; JOY.oy = e.clientY; JOY.x = JOY.y = 0;
    elJoy.style.left = e.clientX + 'px'; elJoy.style.top = e.clientY + 'px';
    elJoy.hidden = false;
  } else if (JOY.hand === null) JOY.hand = e.pointerId;       // второй палец — ручник
  joyApply();
});
addEventListener('pointermove', e => {
  if (e.pointerId !== JOY.id) return;
  let dx = (e.clientX - JOY.ox) / JOY_R, dy = (e.clientY - JOY.oy) / JOY_R;
  const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  JOY.x = dx; JOY.y = dy;
  joyApply();
});
for (const ev of ['pointerup', 'pointercancel'])
  addEventListener(ev, e => {
    if (e.pointerId === JOY.id) { joyReset(); IN.gas = IN.brake = IN.left = IN.right = 0; IN.hand = JOY.hand !== null ? 1 : 0; }
    else if (e.pointerId === JOY.hand) { JOY.hand = null; IN.hand = 0; }
  });
// и страховка: ушёл фокус или курсор с окна — руль отпущен
for (const ev of ['blur', 'contextmenu'])
  addEventListener(ev, () => { joyReset(); for (const k in IN) IN[k] = 0; });

/* смена начинается у пиццерии, на ближайшей проезжей части */
function startPose () {
  // смена начинается на своём месте на парковке курьеров, носом к улице
  if (COURIER_SLOTS) {
    const s = COURIER_SLOTS[0];
    V.x = s.x; V.z = s.z; V.h = s.h; V.vx = V.vz = 0; V.y = surfaceAt(V.x, V.z);
    V.hero = 1;                                     // пока стоишь — вид спереди на машину и пиццерию
    return;
  }
  const road = nearestRoad(PIZZA.x, PIZZA.z, DRIVE_MAX, 4);
  if (!road) { V.x = PIZZA.x; V.z = PIZZA.z; V.h = 0; V.vx = V.vz = 0; V.y = groundH(V.x, V.z); return; }
  const sg = road.seg;
  const len = Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1) || 1;
  const ux = (sg.x2 - sg.x1) / len, uz = (sg.z2 - sg.z1) / len;
  // разворачиваемся так, чтобы сзади была улица, а не стена: камера
  // висит в тринадцати метрах позади, и упираться ей в дом незачем
  let h = Math.atan2(ux, uz);
  const free = a => !camInWall(road.x - Math.sin(a) * 15, road.z - Math.cos(a) * 15);
  if (!free(h) && free(h + Math.PI)) h += Math.PI;
  V.x = road.x - Math.cos(h) * LANE; V.z = road.z + Math.sin(h) * LANE;
  V.h = h;
  V.vx = 0; V.vz = 0;
  V.y = surfaceAt(V.x, V.z);
}

/* ─────────────── сборка мира ─────────────── */
/* времена года: что им нужно от игры (ENV, дождь и небо заводятся ниже — геттерами) */
SEAS.initSeasons({ THREE, scene, cam, renderer, Store, MAP, CITY, V, S, groundH, curbAt, nearestRoad, roadWidth, drivable, inHouse, inPoly, inBounds,
  put, smashAdd, SMASH, SMASH_MAT, LAMP_SPOTS, ZEBRAS, NODE_IDX, nodeDeg, makeHuman, dropMesh, gibHuman, toast, Snd, CAR_L, CAR_W, isPlaying, sayBubble,
  obb, SOLIDS, PARKED, get COURIER_SLOTS () { return COURIER_SLOTS; },
  get PIZZA () { return PIZZA; }, get ENV () { return ENV; }, get rainLines () { return rainLines; }, get hemi () { return hemi; } });
/* поздняя сборка (latebuild.js): то, что в меню не главное, — очередью после первого кадра меню.
   ?nolate — всё разом, как раньше; ?mapcheck — тоже разом (проверка карты смотрит готовый город) */
LATE.enable(!INTRO && !MAPCHECK && !/[?&]nolate(&|$)/.test(location.search));
const T0 = performance.now();
buildCity();
EDL.buildEnd();
ZN.init({ CITY, MAP, donated });
DLG.init({ pause: on => { for (const k in IN) IN[k] = 0; if (on) Snd.engine(0); }, face: (p, size) => faceDataURL(p, size) });
HITS.init({ THREE, scene, box, mergeGeos, HUMAN_VC, groundH, surfaceAt, curbAt, nearestRoad, driftTop: SEAS.driftTop, pavedLift: TRK.pavedLift, groundNormal, emote, puff, pushOut, Snd,
  burst: burstHuman, scare, callAmbulance, adult: GORE_ON, shred: shredHit });
CHAT.init({ adult: ADULT, person: makePerson({ seed: 0x2E4A17, fem: false }), face: (p, size) => faceDataURL(p, size), blip: (f, d, ty, v) => Snd.blip(f, d, ty, v), fx: (n, synth) => Snd.fx(n, synth) });
/* заказы карьеры (orders.js): очередь, поручения, развоз смены — через это */
if (CAREER) ORD.init({ S, V, CITY, MAP, THREE, Store, ADULT, SPOTS, LIFE, Snd, get PIZZA () { return PIZZA; }, get ENV () { return ENV; }, get DAY_LEN () { return DAY_LEN; }, lang: curLang,
  alive, releaseIdle, pushOut, walkSpawn, nearestRoad, makeGuest, clearGuest, realAddress, routeLen, orderTime, rebuildRoutePath, syncTarget, pinFront,
  errandShop, startSide, declineSide, popBonus, toast, money, sayBubble, addWallet, donated, hidePhone, clearGate, showOrderCard, backToBase,
  newOrder, marker, level: () => levelOf(getXP()), gameplayStop: () => Platform.gameplayStop(),
  rehuman: (p, person) => { dropMesh(p.grp); p.person = person || nextPerson(); p.grp = makeHuman(p.person); p.speed = p.base * p.grp.userData.pace; scene.add(p.grp); } });
/* мини-игры у клиента (doorstep.js): домофон у подъезда многоэтажки — до вручения, руль стоит, срок идёт */
if (CAREER) DOOR.init({ ORD, S, Store, ADULT, Snd, root: () => $('game') || document.body, paused: () => !!(S.paused || EXT.paused || FM.open),
  entranceLv, shiftsDone: () => +Store.get('dlv-shifts', 0) || 0, onShiftStart: CAREERM.onShiftStart });
if (CAREER) { PG.init({ el: elMoney, S, money, wallet, shiftOn: CAREERM.shiftOn, playing: isPlaying }); SC.init({ S, money }); }
/* респект (respect.js): сохранение в профиле, хад — чип под кошельком; за смену — с нуля */
RESPECT.init({ Store, toast: s => toast(s), from: () => {   // откуда летят значки респекта: машина на экране
  const v = new THREE.Vector3(V.x, (V.y || 0) + 1.2, V.z).project(cam);
  return v.z < 1 ? [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight] : null;
} });
if (CAREER) CAREERM.onShiftStart(RESPECT.shiftReset);
/* достижения (achievements.js): счётчики, Стим; смена — через onShiftStart/End карьеры */
ACH.init({ career: CAREER, adult: ADULT, S, hour: () => (CAREER ? CAREERM.hour() : NaN) });
if (CAREER) { CAREERM.onShiftStart(ACH.shiftStart); CAREERM.onShiftEnd(ACH.shiftEnd); }
/* таблица рекордов Стима (board.js): смена карьеры — в таблицу; ?nolb — проверочный прогон, не пишем */
BOARD.init({ nolb: new URLSearchParams(location.search).has('nolb'), level: () => levelOf(getXP()), money });
if (CAREER) CAREERM.onShiftEnd(BOARD.shiftEnd);
if (CAREER) CAREERM.init({ S, NOS, Snd, ADULT, get DAY_LEN () { return DAY_LEN; }, env: () => ENV, donated, money, wallet, addWallet, toast, popBonus, showChoice, hideChoice, hudHearts, isPlaying, countUp,
  Store: { get: Store.get, set: Store.set, flush: () => Platform.store.flush && Platform.store.flush() },
  choiceOpen: () => CH.opts.length > 0, endShift, rideOn, dropOrder: () => backToBase(), carChanged: () => { resetCar(); carStats(); },
  openShop: cb => { openPanel('shop'); const iv = setInterval(() => { if (elPanel.hidden) { clearInterval(iv); if (cb) cb(); } }, 300); },
  // главное меню карьеры (menu.js) и рейтинг пиццерии
  menuGo: () => { Snd.boot(); Snd.resume(); goRun(); }, menuRide: () => { Snd.boot(); Snd.resume(); startRun(true); },
  reprofile: () => reprofile(),                     // профиль сменили в меню — без перезагрузки (profiles.js)
  openCollect: () => openPanel('collect'), openSettings: () => { elPanel.hidden = false; elPanel.dataset.kind = 'settings'; renderSettings(); },
  panelOpen: () => !elPanel.hidden, quit: () => Platform.quit(), canQuit: !!Platform.features.quit, playerName: () => Platform.player.name || '',
  padClear: () => padMenu.clear(), cardFlip: (root, d) => (root === elPanel ? SET : PAUSE).flip(d),                 // меню-карусель (menu.js): после листания подсветка геймпада — на карточку в центре
  setName: n => { S.name = n; Store.set('dlv-name', n); elName.value = n; renderProfile(); },
  rivalSpec: () => RIVAL_SPEC.map(q => ({ hex: q.hex, fem: !!q.fem })), rivals: () => RIVALS.map(R => ({ i: R.slot, money: R.money || 0 })),
  person: o => makePerson(o), face: (p, size) => faceDataURL(p, size) });
/* быстрый заезд (quickrun.js): сохранение — в песочнице, в конце машина, пиццерия и сюжет — снова как в карьере */
if (CAREER) QR.init({ Platform, Store, S, Snd, money, cars: () => AUTO,
  seasons: { value: SEAS.seasonValue, forced: SEAS.seasonForced, set: SEAS.setSeason, name: SEAS.seasonName }, weather: WTH,
  startRun: () => { Snd.boot(); Snd.resume(); startRun(); },
  toMenu: () => { S.state = 'title'; $('over').hidden = true; showTitle(); },
  afterQuick: () => {
    STORY.reload(); ORD.reloadUsed();
    resetCar(); carStats(); S.hpMax = curCar().hp;
    if (DISTRICTS) { usePizzeria(DIST.cur()); scatterPickups(); FM.dist = null; districtLocks(); }
  } });
/* все районы открыты (cityopen.js): праздник, выбор перед сменой, «весь город» */
if (DISTRICTS) CITYOPEN.init({ Store: { get: Store.get, set: Store.set, flush: () => Platform.store.flush && Platform.store.flush() }, Snd, money,
  debug: testTools(), refocus: () => { padMenu.clear(); CAREERM.refocus(); },
  pizzerias: () => PIZZERIAS, routeLen });
/* сюжетные заказы (story.js): люди, кот, камера катсцены — через это */
STORY.init({ THREE, scene, cam, V, S, IN, ADULT, CITY, MAP, Store, SPOTS, groundH, surfaceAt, inHouse, nearestRoad, makeHuman, dropMesh, emote, sayBubble, pizzaBox, realAddress, popBonus, money, Snd,
  get car () { return car; }, addMoney: n => { S.money += n; if (!S.freeRun) addWallet(n); }, addStars: CAREER ? CAREERM.addStars : null, shift: () => (+Store.get('dlv-shifts', 0) || 0) + 1,
  // гость, который ждал бабушку у точки, после катсцены уходит в другой квартал другим человеком
  retirePed: p => { if (!p || p.dead || p.base === undefined) return; clearGuest(p); dropMesh(p.grp); p.person = nextPerson(); p.grp = makeHuman(p.person); p.speed = p.base * p.grp.userData.pace; p.hold = null; scene.add(p.grp); walkSpawn(p, 120, 380); } });
/* истории героев города по главам (herostories.js): встречи, условие главы в пути, бонусы */
HSTORY.init({ S, V, ADULT, CAREER, Snd, toast, shops: () => SIGNS, pizza: () => PIZZA, shiftN: () => (+Store.get('dlv-shifts', 0) || 0) + 1,
  openAt: (x, z) => !DISTRICTS || DIST.isOpen(DIST.at(x, z)), heal: n => { S.hp = Math.min(S.hpMax, S.hp + n); hudHearts(); } });
/* Стёпа на лавочке (stepabench.js): лавочка у Ленинградской, 8 и его заказ — через story.js */
LATE.add('stepa', () => STEPAB.init({ CITY, ADULT, CAREER, bench, realAddress }));
const NO_E = /[?&]noE(&|$)/.test(location.search);   // ?noE — без леса у Ленина, змеев и качалок (сравнить кадр)
/* змеи и дроны (kites.js): места в парках и на Ленина, люди — только рядом с камерой */
if (!NO_E) LATE.add('kites', () => KITES.init({ THREE, scene, CITY, V, get ENV () { return ENV; }, groundH, inHouse, nearestRoad, solidAt, onPave: PAVE.onPave, makeHuman, dropMesh,
  CAR_L, CAR_W, gibHuman, runOver: () => { S.people++; Snd.squish(); } }));   // сбиваются, как прохожие
/* площадки-качалки (workout.js): люди на турниках и брусьях, курьер подтягивается сам */
if (!NO_E) WORK.init({ scene, V, S, get ENV () { return ENV; }, makeHuman, dropMesh, sayBubble, toast, Snd, CAR_L, CAR_W, gibHuman, runOver: () => { S.people++; Snd.squish(); }, shiftN: () => (+Store.get('dlv-shifts', 0) || 0) + 1,
  heal: n => { S.hp = Math.min(S.hpMax, S.hp + n); hudHearts(); }, cutOn: () => STORY.active(), courier: () => STORY.PERSON.courier() });

/* вступление первого запуска (intro.js): камера, машина, Степан, дым — через это */
/* камера вступления не в кроне: ствола (дерева) ближе r по земле нет — клетки SOLID_GRID по 30 м, смотрим и соседние */
const camTree = (x, z, r = 3.4) => {
  for (const ox of [-r, 0, r]) for (const oz of [-r, 0, r])
    for (const s of solidsNear(x + ox, z + oz)) if (s.tree && !s.edGone && (x - s.cx) * (x - s.cx) + (z - s.cz) * (z - s.cz) < r * r) return false;
  return true;
};
FIRST.init({ THREE, cam, V, S, Store, Snd, ADULT, car: () => car, pizza: () => PIZZA, brand: () => OWN.pizza(), carName: () => curCar().name,
  puff, camClear, camTree, groundH, guestStep, hud: () => { drawRadar(); hudStep(0); }, hearts: () => hudHearts() });
HINTS.init({ S, V, NOS: () => NOS, Store, Snd, ADULT, CAREER, sayBubble, puff, toast, money });
if (CAREER) RESPECT.onChange((v, d) => { if (d > 0 && isPlaying()) HINTS.respect(); });   // первый респект — подсказка про звезду (hints.js)
/* подписи под копилкой, пачкой и звездой — первые 3 смены (UI-REVIEW № 20, docs/CAREER.md «Хад»): body.hud-caps,
   текст — data-cap, рисует shiftcash.css */
const HUD_CAPS_SHIFTS = 3;
function hudCaps () {
  const on = CAREER && (+Store.get('dlv-shifts', 0) || 0) < HUD_CAPS_SHIFTS;
  document.body.classList.toggle('hud-caps', !!on);
  if (!on) return;
  for (const [id, cap] of [['money', $t('копилка')], ['shiftcash', $t('за смену')], ['respect', $t('респект')]]) { const e = $(id); if (e) e.dataset.cap = cap; }
}
if (CAREER) CAREERM.onShiftStart(() => setTimeout(hudCaps, 0));
const BUILD_MS = performance.now() - T0;          // сколько собирался город — для отладки
/* реквизит склейки — тоже по клеткам: иначе снова один меш на весь город */
function* mergeChunked (list, mat) {                // шагами (yield) по 12 клеток — поздняя сборка, latebuild.js
  const buckets = new Map();
  for (const g of list) {
    // середина коробки куска — как boundingBox.getCenter, без лишних объектов
    const a = g.attributes.position.array;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < a.length; i += 3) { const x = a[i], z = a[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const k = a.length ? Math.floor((x0 + x1) * 0.5 / CHUNK) + ',' + Math.floor((z0 + z1) * 0.5 / CHUNK) : '0,0';
    let b = buckets.get(k);
    if (!b) buckets.set(k, b = []);
    b.push(g);
  }
  let nb = 0;
  for (const b of buckets.values()) {
    if (++nb % 12 === 0) yield 'chunk';
    // track — кто хочет знать, где в склейке его вершины (плафон фонаря гаснет, когда столб сбит)
    const trk = [];
    let v = 0;
    for (const g of b) { if (g.userData.track) trk.push([g.userData.track, v, g.attributes.position.count]); v += g.attributes.position.count; }
    const g = mergeGeos(b);
    boundSphere(g);
    const m = new THREE.Mesh(g, mat);
    scene.add(m);
    for (const [f, v0, nv] of trk) f(m, v0, nv);
  }
}
/* дальше до кадра — то, что идёт после всего города: с поздней сборкой — тоже очередью, в том же порядке (latebuild.js) */
LATE.add('props', function* () {                  // шагами (latebuild.js): на Деке ~0,35 с одним куском
  yield* mergeChunked(LIT, HUR.holeMat(SEAS.seasonMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 0.4)));
  yield 'lit';
  yield* mergeChunked(FLAT, HUR.holeMat(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  { const m = HUR.holeMat(new THREE.MeshBasicMaterial({ vertexColors: true })); m.userData.glow = 1; if (LAMPH.length) yield* mergeChunked(LAMPH, m); }
  yield 'flat';
  indexSolids();
});
/* ельник (forest.js): клетки собираются на ходу вокруг камеры — уже после всего города */
let FOREST_API = null;
LATE.add('forest', () => { FOREST_API = FOREST.init({ THREE, scene, cam, CITY, groundH, inHouse, inBounds, nearestRoad, solidAt,
  onAlley: (x, z, m) => WORLD.onAlley(x, z, m), yardBlocks: (x, z, r) => YARDS.blocks(x, z, r), pzBlocks: PZD.blocks }); });
/* лес вдоль Ленина (leninwood.js): полосы ельника в forest.js, тропы — один меш */
if (!INTRO && !NO_E) LATE.add('lwood', () => LWOOD.init({ THREE, scene, CITY, groundH, inHouse, inBounds, solidAt, onPave: PAVE.onPave }));
/* мелочь на газоне (lawnprops.js): тоже клетками вокруг камеры */
LATE.add('lawnp', () => LAWNP.init({ THREE, scene, cam, CITY, ADULT, forests: LWOOD.polys, groundH, inHouse, inBounds, nearestRoad, roadWidth, car: V, Snd,
  onAlley: (x, z, m) => WORLD.onAlley(x, z, m), yardBlocks: (x, z, r) => YARDS.blocks(x, z, r), pzBlocks: PZD.blocks, isForest: FOREST.isForest,
  claims: () => [...CONSTR.claimed(), ...CONSTR.DEBUG.SITES.map(s => ({ x: s.x, z: s.z, r: Math.hypot(s.W, s.D) / 2 + 2 }))],
  benches: BENCHES, stops: JUNK.DEBUG.STOPS, cans: JUNK.DEBUG.CANS_ALL, low: () => GFX.preset() === 'low',
  pins: () => {                                    // пины и клиенты текущего заказа: рядом с ними мелочь прячется
    const o = S.order;
    if (!o || !o.stops) return null;
    const out = [];
    for (const st of o.stops) { if (st.done) continue; if (st.at) out.push(st.at.x, st.at.z); for (const p of st.peds || []) if (!p.served) out.push(p.x, p.z); }
    return out;
  },
  debris: (x, z, nx, nz, force, hex, n, kind) => {
    const gy = groundH(x, z), bar = kind === 'rail' || kind === 'beater' || kind === 'line';
    for (let i = 0; i < n; i++) {
      const sz = rand(0.12, 0.35), m = new THREE.Mesh(new THREE.BoxGeometry(sz * (bar ? 3 : 1), sz * 0.5, sz), propMat(hex));
      m.position.set(x + rand(-0.4, 0.4), gy + rand(0.3, 0.9), z + rand(-0.4, 0.4));
      scene.add(m);
      GORE.push({ m, vx: nx * rand(2, 5) * (0.4 + force / 30) + rand(-2.5, 2.5), vy: rand(2.5, 6), vz: nz * rand(2, 5) * (0.4 + force / 30) + rand(-2.5, 2.5),
        spin: rand(-10, 10), life: rand(8, 14), bleed: 1e9, rest: 0 });
    }
  } }));
// Курьера ставим раньше всех: припаркованные, трафик и прохожие заводятся
// вокруг него, а не вокруг центра карты — иначе первый заказ уезжает за
// полтора километра, а у бордюра можно проснуться внутри чужой машины.
startPose();                                      // с поздней сборкой — ещё раз в очереди (как раньше: после всего города)
LATE.add('cars', () => {
  if (LATE.busy()) startPose();
  // припаркованные живут в общем списке машин: их так же мнёт, кидает и взрывает
  for (const [px, pz, ry] of PARKED) {
    if (Math.hypot(px - V.x, pz - V.z) < 11) continue;
    const t = {
      ...newCar(true), x: px, z: pz, h: ry,
    };
    poseOnSlope(t);
    scene.add(t.mesh);
    TRAFFIC.push(t);
  }
});
// машин в потоке вокруг курьера (40–330 м): было 36 — на улицах Северска толпа, и на Деке
// каждая машина — это ещё и расчёт её езды в каждом кадре. Припаркованные, мопеды и сервисные — сверху
// 02.10.2026: 24 — это теперь обычный день; по часам — econ.js TRAFFIC (пик 28, ночь 4–8), добирается trafficDensity
const TRAFFIC_N = 24;
LATE.add('traffic', () => spawnTraffic(INTRO ? 22 : Math.min(TRAFFIC_N, trafficWant())));
if (!INTRO) LATE.add('spots', () => { buildSpots(); buildCollect(); });
/* погода смены (weather.js): сугробы снежной зимы — после адресов, чтобы их не завалить */
LATE.add('weather', () => WTH.init({ THREE, scene, cam, renderer, Store, MAP, CITY, V, S, SPOTS, ZEBRAS, Snd, toast, groundH, curbAt, nearestRoad, roadWidth, drivable, inHouse, inPoly, inBounds,
  makeHuman, dropMesh, gibHuman, CAR_L, CAR_W, isPlaying, intro: INTRO, PIZZERIAS, get PIZZA () { return PIZZA; },
  ARCHES, realAddress, puff, quick: () => QR.on(),   // ураган (hurricane.js): дома с аркой не уносит, адрес в подписи, пыль, быстрый заезд не сохраняет
  get ENV () { return ENV; }, get sun () { return sun; }, get hemi () { return hemi; }, get amb () { return amb; } }));
LATE.add('nitro', buildNitro);
LATE.add('locks', districtLocks);                 // закрытые районы: перекрытия на въездах
if (!INTRO) LATE.add('hookah', () => HK.init({ THREE, scene, BENCHES, V, S, ADULT, makeHuman, makePerson, dropMesh, gibHuman, groundH, curbAt, fxAdd, puffGeo, steam, toast, Snd, CAR_L, CAR_W, t: $t }));
if (!INTRO && CAREER) FEST.init({ THREE, scene, V, S, CITY, ADULT, Store, obb, SOLIDS, indexSolids, NODES, TRAFFIC, put, mergeGeos, groundH, inHouse, inPoly, nearestRoad, solidAt,
  makeHuman, makePerson, dropMesh, sayBubble, fxAdd, puffGeo, steam, gibBurger, popBonus, toast, chat: s => CHAT.say(s), addWallet, money, CASH, Snd, CAR_L, CAR_W, HEROES, DIST,
  season: () => SEAS.seasonValue() });   // фестивали на парковках ТЦ (festivals.js)
/* налёт на точку и ёлка-турель (raid.js) */
DIRECTOR.init({ Store, S });                     // сессия: новая или продолжение (director.js)
if (!INTRO && CAREER) RAID.init({ V, S, scene, CAREER, ADULT, CAR_L, CAR_W, Store, wallet, addWallet, makeHuman, dropMesh, gibHuman, sayBubble, groundH, curbAt, pushOut, sparks, puff, popBonus, money, Snd,
  get PIZZA () { return PIZZA; }, isPlaying, chat: s => CHAT.say(s),
  hurt: n => { S.hurt = 0; hurtCar(n, 0, V.x + rand(-1, 1), V.z + rand(-1, 1)); },   // удар битой — полсердца, без мятин
  bump: () => { V.vx *= 0.25; V.vz *= 0.25; S.shake = Math.max(S.shake, 0.35); Snd.crash(8); },
  onRunOver: () => { S.people++; Snd.squish(); },
  reward: n => { S.money += n; if (!S.freeRun) addWallet(n); },
  fine: n => { const got = Math.max(0, Math.min(n, wallet())); if (got && !S.freeRun) addWallet(-got); S.money = Math.max(0, S.money - n); },
  smashTables: (x, z, r) => smashNear(x, z, it => { if (it.kind === 'table' && Math.hypot(it.x - x, it.z - z) < r) smashHit(it, it.x - x, it.z - z, 8); }),
  // ёлка-турель бьёт и по нападающим чужих сетей в драках у точки (crews.js): попала — убегают
  foes: () => CREWS.WALKERS.filter(m => m.role === 'att' && m.brand !== 'pizza' && !m.dead && !m.flee).map(m => ({ x: m.x, z: m.z, hit () { m.flee = 1; m.down = 0; m.grp.rotation.x = 0; } })),
});
/* ─────────────── сутки, погода, облака и птицы ───────────────
   Время идёт: утро → день → вечер → ночь → утро, полный круг за восемь
   минут. Небо, туман и свет плавно перетекают между ключевыми точками.
   Ночью стены и асфальт темнеют (у склеек без света — вручную, через
   цвет материала), в части окон зажигается свет, под фонарями — пятна
   света, перед курьером — фары. Иногда идёт дождь: небо сереет, туман
   ближе, по экрану косые струи, а сцепление падает — машину носит. */
const DAY_LEN = 480;
const SKY_KEYS = [
  // доля суток (0 — шесть утра), небо, туман, солнце: цвет и сила, полусфера: небо, земля, сила, эмбиент, ночь
  [0.00, '#f2c7a6', '#f3d6bf', '#ffcf9a', 0.85, '#ffe6d0', '#b6a896', 1.25, 0.42, 0.3],
  // солнечный день — больше половины круга, ночь — около шестой части.
  // 09.10.2026 (автор: «небо в тумане»): небо голубее и насыщеннее (было #a8daf4), дымка у горизонта голубая
  // (было #d8edfa), солнце ярче (1,5 → 1,75), рассеянный свет слабее (1,75 → 1,55, эмбиент 0,5 → 0,4) — грани
  // к солнцу и от солнца контрастнее, «тени чётче»
  [0.07, '#86c6f2', '#c6e3f6', '#fff4de', 1.75, '#e4f3ff', '#b2c79a', 1.55, 0.4, 0],
  [0.62, '#86c6f2', '#c6e3f6', '#fff4de', 1.75, '#e4f3ff', '#b2c79a', 1.55, 0.4, 0],
  [0.70, '#f0a070', '#eab48e', '#ffac6a', 0.9, '#ffd2b0', '#a89480', 1.1, 0.4, 0.35],
  [0.77, '#1b2344', '#1e2746', '#8fa8ff', 0.3, '#5a6a9a', '#1e2630', 0.55, 0.22, 1],
  [0.93, '#1b2344', '#1e2746', '#8fa8ff', 0.3, '#5a6a9a', '#1e2630', 0.55, 0.22, 1],
  [1.00, '#f2c7a6', '#f3d6bf', '#ffcf9a', 0.85, '#ffe6d0', '#b6a896', 1.25, 0.42, 0.3],
];
const RAIN_SKY = new THREE.Color('#8d97a3');
const ENV = { t: 0.02, night: 0, rain: 0, rainWant: 0, rainT: 150, rainLeft: 0, phase: '' };
AMBI.init({ Snd, V, S, ENV, CITY, TRAFFIC, nearestRoad, inPoly, isPlaying, musicK: () => 1 - MUS.MUS.AMB * MUS.level() });
// музыка: напряжённо — налёт, восстание, мафиози, погоня, ураган; тише — катсцена, диалог, Толик пишет, пауза (music.js)
MUS.init({ Snd, S, ENV, isPlaying, tense: () => DIRECTOR.going(['raid', 'riot', 'mafia']) || WTH.id() === 'hurricane' || TRAFFIC.some(t => t.chase),
  cut: () => FIRST.on() || STORY.active(), dialog: () => DLG.isOpen(), chat: () => CHAT.talking() });
const SKY_C = new THREE.Color(), FOG_C = new THREE.Color(), CA = new THREE.Color(), CB = new THREE.Color();
const hemi = scene.children.find(o => o.isHemisphereLight), amb = scene.children.find(o => o.isAmbientLight);
const FLAT_MATS = [];                                // склейки без света: их темним вручную
const flatMats = () => scene.traverse(o => { if (o.isMesh && o.material && o.material.isMeshBasicMaterial && o.material.vertexColors && !o.material.userData.glow && !FLAT_MATS.includes(o.material)) FLAT_MATS.push(o.material); });
flatMats();
if (LATE.busy()) LATE.add('flatmats', flatMats);   // поздние склейки — тоже

/* пятна света под фонарями и окна, в которых вечером зажигается свет */
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,220,150,1)'); g.addColorStop(0.5, 'rgba(255,200,120,.45)'); g.addColorStop(1, 'rgba(255,190,110,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const POOL_MAT = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
  polygonOffset: true, polygonOffsetFactor: -4 });
const WIN_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
/* Окна живые: у каждого своё зерно (aSeed), по нему шейдер раз в 40—120 с решает,
   горит ли свет сейчас (~7 из 10), и какого он цвета: тёплый, холодный белый, а
   в каждом двадцатом — фиолетовый, как от фитоламп для рассады. Меш — тот же, вызовов
   не прибавляется; время — WIN_U.uT, крутится в updateEnv. */
const WIN_U = { uT: { value: 0 } };
WIN_MAT.onBeforeCompile = sh => {
  sh.uniforms.uT = WIN_U.uT;
  sh.vertexShader = 'attribute float aSeed;\nuniform float uT;\nvarying float vOn;\nvarying vec3 vWc;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float per = 40.0 + aSeed * 80.0;
    float slot = floor(uT / per + aSeed * 13.0);
    float h = fract(sin((slot + aSeed * 91.7) * 12.9898) * 43758.5453);
    vOn = step(0.3, h);
    vWc = aSeed < 0.05 ? vec3(0.72, 0.32, 1.0) : aSeed < 0.14 ? vec3(0.86, 0.93, 1.0) : mix(vec3(1.0, 0.86, 0.58), vec3(1.0, 0.93, 0.72), fract(aSeed * 7.0));`);
  sh.fragmentShader = 'varying float vOn;\nvarying vec3 vWc;\n' + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vWc, opacity * vOn );');
};
HUR.holeMat(WIN_MAT);                              // ночные окна унесённого ураганом дома — тоже под землю
const NIGHT_OBJ = [];
function buildNight () {
  const pools = [];
  const spots = LAMP_SPOTS.concat(PROPS.filter(p => p.kind === 'lamp').map(p => [p.x + 1.3, p.z]));
  for (const sp of spots) {
    const [x, z] = sp;
    const g = new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2);
    g.translate(x, groundH(x, z) + curbAt(x, z) + 0.3, z);
    g.userData.track = sp.track;                   // сбитый фонарь гасит своё пятно (streetlamps.js)
    pools.push(g);
  }
  // склейка по клеткам — что не в кадре, не рисуется
  const byChunk = new Map();
  for (const g of pools) {
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3()), k = Math.floor(c.x / CHUNK) + ',' + Math.floor(c.z / CHUNK);
    if (!byChunk.has(k)) byChunk.set(k, []);
    byChunk.get(k).push(g);
  }
  for (const list of byChunk.values()) {
    const trk = [];
    let v = 0;
    for (const g of list) { if (g.userData.track) trk.push([g.userData.track, v, g.attributes.position.count]); v += g.attributes.position.count; }
    const m = new THREE.Mesh(mergeUV(list), POOL_MAT);
    m.visible = false; m.renderOrder = 2;
    scene.add(m); NIGHT_OBJ.push(m);
    for (const [f, v0, nv] of trk) f(m, v0, nv);
  }
  // окна — тоже по клеткам: одним мешем на весь город они рисовались
  // целиком, даже за спиной, — сто с лишним тысяч треугольников ночью
  const winBy = new Map();
  for (let i = 0; i < WINQ.length; i += 18) {
    const k = Math.floor(WINQ[i] / CHUNK) + ',' + Math.floor(WINQ[i + 2] / CHUNK);
    if (!winBy.has(k)) winBy.set(k, []);
    const arr = winBy.get(k);
    for (let j = 0; j < 18; j++) arr.push(WINQ[i + j]);
  }
  for (const arr of winBy.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
    // зерно окна — от его середины: одно и то же при каждой загрузке
    const seed = new Float32Array(arr.length / 3);
    for (let w = 0; w < arr.length; w += 18) {
      const cx = (arr[w] + arr[w + 3]) / 2, cy = (arr[w + 1] + arr[w + 7]) / 2, cz = (arr[w + 2] + arr[w + 5]) / 2;
      const v = Math.abs(Math.sin(cx * 12.9898 + cy * 78.233 + cz * 37.719) * 43758.5453) % 1;
      seed.fill(v, w / 3, w / 3 + 6);
    }
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    boundSphere(g);
    const m = new THREE.Mesh(g, WIN_MAT);
    m.visible = false;
    scene.add(m); NIGHT_OBJ.push(m);
  }
  WINQ.length = 0;
}
/* склейка с текстурными координатами (mergeGeos берёт цвета, а тут нужны uv) */
function mergeUV (list) {
  let vn = 0, iN = 0;
  for (const g of list) { vn += g.attributes.position.count; iN += g.index.count; }
  const pos = new Float32Array(vn * 3), uv = new Float32Array(vn * 2), idx = new Uint32Array(iN);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3); uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  boundSphere(out);
  return out;
}

/* фары курьера: светлое пятно на асфальте перед машиной */
const HEAD_MAT = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
const headGlow = new THREE.Mesh(new THREE.PlaneGeometry(7, 14).rotateX(-Math.PI / 2), HEAD_MAT);
headGlow.renderOrder = 3;
scene.add(headGlow);

/* дождь: косые струи вокруг камеры */
const RAIN_N = 1400;
const rainPos = new Float32Array(RAIN_N * 6);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xe4ecf7, transparent: true, opacity: 0, depthWrite: false });
const rainLines = new THREE.LineSegments(rainGeo, rainMat);
rainLines.frustumCulled = false; rainLines.visible = false;
scene.add(rainLines);
for (let i = 0; i < RAIN_N; i++) { rainPos[i * 6] = rand(-35, 35); rainPos[i * 6 + 1] = rand(-5, 30); rainPos[i * 6 + 2] = rand(-35, 35); }

/* облака: плоские снизу кучки, плывут по ветру, держатся вокруг курьера */
const CLOUD_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, fog: false });
const CLOUDS = [];
function initClouds () {
  for (let i = 0; i < 12; i++) {
    const parts = [];
    const n = 4 + ((Math.random() * 4) | 0);
    for (let k = 0; k < n; k++) {
      const r = rand(6, 12);
      const g = new THREE.IcosahedronGeometry(r, 0);
      g.scale(1, 0.55, 1);
      put(parts, g, '#ffffff', rand(-14, 14), rand(0, 3), rand(-8, 8));
    }
    const m = new THREE.Mesh(mergeGeos(parts), CLOUD_MAT);
    m.position.set(V.x + rand(-320, 320), rand(95, 130), V.z + rand(-320, 320));
    scene.add(m);
    CLOUDS.push(m);
  }
}

/* птицы: стайки высоко в небе и голуби на тротуарах, которые взлетают из-под колёс */
const BIRD_BODY = new THREE.BoxGeometry(0.16, 0.14, 0.42);
const BIRD_WING = (() => { const g = []; for (const s of [-1, 1]) { const w = new THREE.BoxGeometry(0.46, 0.03, 0.2); w.rotateZ(s * 0.35); w.translate(s * 0.26, 0.06, 0); put(g, w, '#ffffff', 0, 0, 0); } return mergeGeos(g); })();
const BIRD_MAT = new THREE.MeshLambertMaterial({ color: 0x5b5e66, flatShading: true });
const PIGEON_MAT = new THREE.MeshLambertMaterial({ color: 0x8a8f9c, flatShading: true });
function makeBird (mat, s) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(BIRD_BODY, mat));
  const w = new THREE.Mesh(BIRD_WING, mat);
  g.add(w);
  g.scale.setScalar(s);
  g.userData.wing = w;
  scene.add(g);
  return g;
}
const FLOCKS = [], PIGEONS = [];
/* крыша под точкой: высота верха дома (рельеф + 3,15 м на этаж + 1,1), m — запас от стены; нет дома — -Infinity.
   Птицы в дома не влетают (04.10.2026): стая идёт над крышами, голуби у стены взмывают и садятся на крышу */
function roofTop (x, z, m = 0) {
  const a = HOUSE_GRID.get(Math.floor(x / 40) + ',' + Math.floor(z / 40));
  let top = -Infinity;
  if (!a) return top;
  for (let i = 0; i < a.length; i++) {
    const b = a[i], p = b.p;
    if (FOOT_SOFT.has(b.k)) continue;                 // участки строек и пустырей — не дома
    if (!(inPoly(x, z, p) || (m && (inPoly(x + m, z, p) || inPoly(x - m, z, p) || inPoly(x, z + m, p) || inPoly(x, z - m, p))))) continue;
    if (b.birdTop === undefined) {
      let gy = -Infinity, s2 = 0;
      for (let k = 0; k < p.length; k++) { const q = p[k], r = p[(k + 1) % p.length]; gy = Math.max(gy, groundH(q[0], q[1])); s2 += q[0] * r[1] - r[0] * q[1]; }
      const area = Math.abs(s2) / 2, lv = b.lv || (area > 1200 ? 5 : area > 600 ? 4 : area > 220 ? 2 : 1);
      b.birdTop = gy + (b.k === 'gar' ? 2.7 : 3.15 * lv + 1.1);
    }
    top = Math.max(top, b.birdTop);
  }
  return top;
}
function initBirds () {
  for (let f = 0; f < 2; f++) {
    const fl = { cx: V.x + rand(-80, 80), cz: V.z + rand(-80, 80), y: rand(42, 60), gy: groundH(V.x, V.z), a: rand(0, 6), r: rand(30, 50), w: rand(0.25, 0.4) * (chance(0.5) ? 1 : -1), birds: [] };   // y — над землёй, а не над нулём карты
    for (let i = 0; i < 6; i++) fl.birds.push({ g: makeBird(BIRD_MAT, 2.2), o: i, ph: rand(0, 6), lift: 0 });
    FLOCKS.push(fl);
  }
  for (let k = 0; k < 3; k++) {
    const grp = { birds: [], x: 0, z: 0, fly: 0, t: 0 };
    for (let i = 0; i < 5; i++) grp.birds.push({ g: makeBird(PIGEON_MAT, 0.9), dx: 0, dz: 0, vy: 0, vx: 0, vz: 0, ph: rand(0, 6) });
    placePigeons(grp);
    PIGEONS.push(grp);
  }
}
/* голуби садятся на тротуар у скамейки или на дворовую дорожку рядом с курьером */
function placePigeons (grp) {
  let x = V.x, z = V.z;
  const near = BENCHES.filter(b => { const d = Math.hypot(b.x - V.x, b.z - V.z); return d > 50 && d < 170; });
  if (near.length) { const b = pick(near); x = b.x + rand(-3, 3); z = b.z + rand(-3, 3); }
  else { const p = { yard: true }; walkSpawn(p, 50, 170); if (p.x !== undefined) { x = p.x; z = p.z; } }
  grp.x = x; grp.z = z; grp.fly = 0; grp.t = 0;
  for (const b of grp.birds) {
    b.dx = rand(-1.6, 1.6); b.dz = rand(-1.6, 1.6); b.vy = 0;
    b.g.position.set(x + b.dx, groundH(x + b.dx, z + b.dz) + curbAt(x + b.dx, z + b.dz) + 0.07, z + b.dz);
    b.g.rotation.set(0, rand(0, 6.28), 0);
    b.g.userData.wing.scale.y = 0.2;
    b.g.visible = true;
    b.perch = 0;
  }
}

/* фаза — ключ (по-русски, не переводится) */
function envPhase (t) { return t < 0.06 ? 'утро' : t < 0.66 ? 'день' : t < 0.75 ? 'вечер' : t < 0.96 ? 'ночь' : 'утро'; }
const envClock = () => { const h = (6 + ENV.t * 24) % 24; return String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60 / 10) * 10).padStart(2, '0'); };

function updateEnv (dt) {
  if (INTRO) return;
  // в карьере смена идёт медленнее (короткая / средняя / длинная — ECON.SHIFT.LENGTHS): небо и фазы те же
  ENV.t = (ENV.t + dt / (DAY_LEN * (CAREER && CAREERM.shiftOn() ? CAREERM.shiftSlow() : 1))) % 1;
  // ключевые точки суток
  let i = 0;
  while (i < SKY_KEYS.length - 2 && ENV.t >= SKY_KEYS[i + 1][0]) i++;
  const A = SKY_KEYS[i], B = SKY_KEYS[i + 1], k = ease(clamp((ENV.t - A[0]) / (B[0] - A[0]), 0, 1));
  const mix = (a, b) => CA.set(a).lerp(CB.set(b), k);
  // погода: изредка дождь на минуту-полторы
  if (S.state !== 'title' && S.state !== 'over' && !WTH.rainControl(ENV, dt)) {   // в дождь и грозу смены дождём правит weather.js
    ENV.rainT -= dt;
    if (ENV.rainT <= 0) {
      // дождь редко и ненадолго: чаще светит солнце
      // без подписи снизу: погоду игроку не называем (04.10.2026)
      if (ENV.rainWant) { ENV.rainWant = 0; ENV.rainT = rand(150, 260); }
      else if (chance(WTH.drizzle())) { ENV.rainWant = 1; ENV.rainT = rand(40, 70); }   // шанс — по сезону, новичку — 0 (weather.js DRIZZLE)
      else ENV.rainT = rand(90, 160);
    }
  }
  ENV.rain = damp(ENV.rain, ENV.rainWant, 0.6, dt);
  const R = ENV.rain;
  SKY_C.copy(mix(A[1], B[1])).lerp(RAIN_SKY, R * 0.6 * (1 - ENV.night * 0.6));
  FOG_C.copy(mix(A[2], B[2])).lerp(RAIN_SKY, R * 0.6 * (1 - ENV.night * 0.6));
  scene.background.copy(SKY_C);
  scene.fog.color.copy(FOG_C);
  const gk = GFX.rangeK();                          // дальность по настройке графики: 250 / 370 / 490 м (gfx.js)
  scene.fog.far = (470 - R * 170) * CULL.Q.k * gk;  // CULL.Q — страховка дальности на слабом железе
  // туман начинается дальше (09.10.2026: 150 → 230 м на «высокой»): ближний город чистый, дымка — только к краю дальности;
  // в дождь — ближе, как раньше (дальность кадра та же — время кадра не растёт)
  scene.fog.near = (230 - R * 110) * (0.4 + 0.6 * gk);
  sun.color.copy(mix(A[3], B[3]));
  sun.intensity = lerp(A[4], B[4], k) * (1 - R * 0.55);
  if (hemi) { hemi.color.copy(mix(A[5], B[5])); hemi.groundColor.copy(mix(A[6], B[6])); hemi.intensity = lerp(A[7], B[7], k) * (1 - R * 0.25); }
  if (amb) amb.intensity = lerp(A[8], B[8], k);
  ENV.night = lerp(A[9], B[9], k);
  // солнце ходит по небу: днём высоко, вечером низко
  const sa = ENV.t * Math.PI * 2;
  sun.position.set(V.x + Math.cos(sa) * 160, 60 + Math.max(0, Math.sin(sa * 0.5 + 0.3)) * 140, V.z + 90);
  sun.target.position.set(V.x, 0, V.z); sun.target.updateMatrixWorld();   // цель — под машиной, иначе вдали от центра карты свет почти горизонтальный
  // склейки без света: темнеют вместе с вечером
  const dk = lerp(1, 0.34, ENV.night) * (1 - R * 0.18);
  for (const m of FLAT_MATS) m.color.setRGB(dk, dk, dk * (1 + ENV.night * 0.12));
  WINS.update(ENV.night, dk, dk * (1 + ENV.night * 0.12), SKY_C, performance.now() / 1000);
  const nOn = ENV.night > 0.05;
  POOL_MAT.opacity = ENV.night * 0.75; WIN_MAT.opacity = clamp(ENV.night * 1.1, 0, 0.95);
  WIN_U.uT.value = performance.now() / 1000;
  for (const m of NIGHT_OBJ) m.visible = nOn;
  // фары
  HEAD_MAT.opacity = clamp((ENV.night - 0.15) * 0.9 + R * 0.25, 0, 0.7) * CG.headK(car.userData);   // разбитые фары — пятно тусклее (carglass.js)
  headGlow.visible = HEAD_MAT.opacity > 0.02 && S.state !== 'title' && S.state !== 'over';
  if (headGlow.visible) {
    const fx = Math.sin(V.h), fz = Math.cos(V.h), hx = V.x + fx * 8.5, hz = V.z + fz * 8.5;
    headGlow.position.set(hx, surfaceAt(hx, hz, V.y) + 0.3, hz);
    headGlow.rotation.y = V.h;
  }
  // смена фазы: утро, день, вечер, ночь — видно по небу, без надписи
  const ph = envPhase(ENV.t);
  if (ph !== ENV.phase) {
    ENV.phase = ph;
  }
  // дождь
  rainLines.visible = R > 0.03;
  rainMat.opacity = R * 0.85;
  if (rainLines.visible) {
    rainLines.position.set(cam.position.x, cam.position.y - 8, cam.position.z);
    const fall = 34 * dt;
    for (let j = 0; j < RAIN_N; j++) {
      const o = j * 6;
      let y = rainPos[o + 1] - fall;
      if (y < -8) { y = 30; rainPos[o] = rand(-35, 35); rainPos[o + 2] = rand(-35, 35); }
      rainPos[o + 1] = y;
      rainPos[o + 3] = rainPos[o] + 0.5; rainPos[o + 4] = y + 1.8; rainPos[o + 5] = rainPos[o + 2] + 0.3;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  // облака: ветер, дождь сереет, ночью темнеют сами от света
  CLOUD_MAT.color.setRGB(1 - R * 0.4, 1 - R * 0.38, 1 - R * 0.33);
  for (const c of CLOUDS) {
    c.position.x += 2.2 * dt;
    if (c.position.x - V.x > 330) c.position.x -= 660; else if (c.position.x - V.x < -330) c.position.x += 660;
    if (c.position.z - V.z > 330) c.position.z -= 660; else if (c.position.z - V.z < -330) c.position.z += 660;
  }
  updateBirds(dt);
}

function updateBirds (dt) {
  for (const fl of FLOCKS) {
    fl.a += fl.w * dt;
    // стая держится недалеко от курьера
    fl.cx = damp(fl.cx, V.x, 0.08, dt); fl.cz = damp(fl.cz, V.z, 0.08, dt);
    fl.gy = damp(fl.gy === undefined ? groundH(fl.cx, fl.cz) : fl.gy, groundH(fl.cx, fl.cz), 0.3, dt);
    for (const b of fl.birds) {
      const a = fl.a - b.o * 0.09 * Math.sign(fl.w), r = fl.r + (b.o % 2 ? 2 : -2) * Math.ceil(b.o / 2);
      const x = fl.cx + Math.cos(a) * r, z = fl.cz + Math.sin(a) * r;
      // над высоткой — выше её крыши на 8 м (плавно), иначе на своей высоте над землёй
      const y0 = fl.gy + fl.y, top = roofTop(x, z, 6);
      b.lift = damp(b.lift || 0, Math.max(0, top + 8 - y0), 1.5, dt);
      b.g.position.set(x, y0 + b.lift + Math.sin(tG * 1.3 + b.o) * 1.2, z);
      b.g.rotation.y = Math.atan2(-Math.sin(a) * Math.sign(fl.w), Math.cos(a) * Math.sign(fl.w));
      b.ph += dt * 9;
      b.g.userData.wing.scale.y = Math.sin(b.ph) * 1.2;
      b.g.visible = !ENV.night || ENV.night < 0.8;
    }
  }
  const sp = Math.hypot(V.vx, V.vz);
  for (const grp of PIGEONS) {
    const d = Math.hypot(grp.x - V.x, grp.z - V.z);
    if (!grp.fly) {
      if (d > 260) { placePigeons(grp); continue; }
      // машина близко — вспархивают все разом
      if (d < 13 && sp > 2 || d < 5) {
        grp.fly = 1; grp.t = 0;
        for (const b of grp.birds) {
          const dx = b.g.position.x - V.x, dz = b.g.position.z - V.z, l = Math.hypot(dx, dz) || 1;
          b.vx = dx / l * rand(4, 7) + rand(-2, 2); b.vz = dz / l * rand(4, 7) + rand(-2, 2); b.vy = rand(4, 7);
          b.g.rotation.y = Math.atan2(b.vx, b.vz);
        }
        if (d < 40) Snd.fx('birds', s => s.blip(900, 0.05, 'square', 0.03), { x: grp.x, z: grp.z, far: 40 });
        continue;
      }
      for (const b of grp.birds) {
        // клюют: голова вниз-вверх, изредка переступают
        b.ph += dt * rand(2, 5);
        b.g.rotation.x = Math.max(0, Math.sin(b.ph)) * 0.5;
      }
    } else {
      grp.t += dt;
      for (const b of grp.birds) {
        if (b.perch) {                                // сел на крышу: клюёт, крылья сложены
          b.ph += dt * 3;
          b.g.rotation.x = Math.max(0, Math.sin(b.ph)) * 0.4;
          b.g.userData.wing.scale.y = 0.2;
          continue;
        }
        const P = b.g.position, nx = P.x + b.vx * dt, nz = P.z + b.vz * dt, ny = P.y + b.vy * dt;
        const top = roofTop(nx, nz, 0.5);
        if (ny < top + 0.3) {
          // впереди стена: вперёд не летит — взмывает вдоль неё; долетел до края крыши — садится
          if (top - ny < 1.5) { P.set(nx, top + 0.07, nz); b.perch = 1; b.g.rotation.set(0, b.g.rotation.y, 0); continue; }
          P.y += Math.max(b.vy, 6) * dt; b.vy = Math.max(b.vy, 6);
        } else {
          P.x = nx; P.y = ny; P.z = nz;
          b.vy = Math.max(1.5, b.vy - dt * 1.5);
        }
        b.g.rotation.x = -0.3;
        b.ph += dt * 22;
        b.g.userData.wing.scale.y = Math.sin(b.ph) * 1.3;
      }
      if (grp.t > 9 && (d > 70 || grp.t > 40)) placePigeons(grp);   // улетели — сядут где-то ещё (сели на крышу рядом — посидят, пока не отъедешь)
    }
  }
}

/* ─────────────── ночные компании ───────────────
   Как стемнеет, у кафе и ресторанов, у подъездов и на детских площадках
   собираются компании: стоят кружком с газировкой, пританцовывают и поют
   на весь двор. Алкоголя нет — площадки такое не пропускают. Утром и днём
   их нет — к рассвету расходятся. Заводим только компании рядом с курьером (не
   больше пяти сразу), остальные «ждут» в списке мест. */
const PUB_SPOTS = [];
const CROWDS = [];
/* детская версия — поют с газировкой, взрослая — пьют и рыгают, как было */
const BURPS = ADULT
  ? [$t('*рыг*'), $t('БУЭЭЭ'), $t('ЫЫЫК'), $t('за здоровье!'), $t('ещё по одной'), $t('ну ты это…'), $t('уважаю!'), $t('*ик*')]
  : ['♪ ' + $t('ла-ла-ла') + ' ♪', '♪ ' + $t('о-о-о') + ' ♪', $t('ещё песню!'), $t('давай хором!'), $t('ну ты это…'), $t('уважаю!'), $t('красиво поёшь!'), '♪ ♫ ♪'];
function buildPubSpots () {
  const pubName = /бар|bar|паб|pub|пив|beer|вин|wine|разлив|двор|друзья|егерь|мясо|хинкал|швили|авлабар/i;
  const coffee = /coffee|кофе|cofix|шоколад|crepe|bakery|круассан|cinnabon|чай|морс|healthy|даблби|wakecup/i;
  for (const poi of CITY.pois) {
    if (!poi.w) continue;
    const ok = (ADULT && poi.k === 'grocery' && /пив|beer|вин|разлив/i.test(poi.n0)) || ((poi.k === 'food' || poi.k === 'cafe') && pubName.test(poi.n0)) || (poi.k === 'food' && !coffee.test(poi.n0) && chance(0.5));
    if (!ok) continue;
    const [wx, wz, nx, nz] = poi.w;
    const x = wx + nx * 4.2, z = wz + nz * 4.2;
    if (!inBounds(x, z, 20) || inHouse(x, z, 1.5)) continue;
    const r = nearestRoad(x, z, DRIVE_MAX, 1);
    if (r && r.d < r.seg.w / 2 + 1) continue;
    PUB_SPOTS.push({ x, z, kind: 'bar', name: poi.n });
  }
  // и у подъездов — у каждого четвёртого
  for (const [ex, ez, nx, nz] of CITY.entrances) {
    if (!chance(0.25)) continue;
    const x = ex + nx * 4, z = ez + nz * 4;
    if (!inBounds(x, z, 20) || inHouse(x, z, 1.5)) continue;
    const r = nearestRoad(x, z, DRIVE_MAX, 1);
    if (r && r.d < r.seg.w / 2 + 1) continue;
    PUB_SPOTS.push({ x, z, kind: 'yard' });
  }
  for (const g of CITY.green) {
    if (g.k !== 'play') continue;
    let x = 0, z = 0;
    for (const q of g.p) { x += q[0] / g.p.length; z += q[1] / g.p.length; }
    x += 3; z += 3;                                   // рядом с песочницей, а не в ней
    if (!inBounds(x, z, 20) || !inPoly(x, z, g.p) || inHouse(x, z, 2)) continue;
    PUB_SPOTS.push({ x, z, kind: 'play' });
  }
}

function spawnCrowd (sp) {
  const n = (sp.kind === 'bar' ? 6 : 4) + ((Math.random() * 4) | 0), rad = 1.5 + n * 0.14, turn = rand(0, 6.28);
  const people = [];
  for (let i = 0; i < n; i++) {
    const a = turn + i / n * Math.PI * 2 + rand(-0.2, 0.2);
    const x = sp.x + Math.sin(a) * rad, z = sp.z + Math.cos(a) * rad;
    if (inHouse(x, z, 0.4)) continue;
    const person = chance(0.35) ? nextPerson() : null;          // иногда среди них — коллега
    const grp = makeHuman(person, { fat: chance(0.35) });
    // во взрослой — бутылка тёмного стекла, в детской — яркая баночка газировки
    const bottle = ADULT
      ? new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.28, 6), new THREE.MeshLambertMaterial({ color: chance(0.5) ? 0x5a3a16 : 0x2f5a2a }))
      : new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8), new THREE.MeshLambertMaterial({ color: pick([0xe04836, 0x4f7fd6, 0x59b06a, 0xffd23f, 0xff8ad0]) }));
    bottle.position.set(0, -0.55, 0.1);
    grp.userData.armR.add(bottle);
    grp.rotation.y = Math.atan2(sp.x - x, sp.z - z);
    grp.position.set(x, groundH(x, z) + curbAt(x, z), z);
    scene.add(grp);
    people.push({ grp, person, x, z, ph: rand(0, 6), drink: rand(1, 6), sway: rand(0.6, 1.4), dead: 0, shock: 0 });
  }
  CROWDS.push({ sp, people, burpT: rand(1, 3), say: null, sayT: 0 });
  sp.on = 1;
}
function dropCrowd (c) {
  for (const q of c.people) if (!q.dead) dropMesh(q.grp);
  if (c.say && c.say.parent) { c.say.parent.remove(c.say); c.say.material.dispose(); }
  c.sp.on = 0;
}

let crowdScanT = 0;
function updateCrowds (dt) {
  if (INTRO || !PUB_SPOTS.length) return;
  const on = ENV.night > 0.55;
  if (!on) {
    // рассвет: расходятся
    if (CROWDS.length) { for (const c of CROWDS) dropCrowd(c); CROWDS.length = 0; }
    return;
  }
  if ((crowdScanT -= dt) <= 0) {
    crowdScanT = 1;
    for (let i = CROWDS.length - 1; i >= 0; i--)
      if (Math.hypot(CROWDS[i].sp.x - V.x, CROWDS[i].sp.z - V.z) > 230) { dropCrowd(CROWDS[i]); CROWDS.splice(i, 1); }
    const near = PUB_SPOTS.filter(p => !p.on && Math.hypot(p.x - V.x, p.z - V.z) < 190 && !nearClient(p.x, p.z, 12))
      .sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z));
    for (const sp of near) { if (CROWDS.length >= 6) break; spawnCrowd(sp); }
  }
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (const c of CROWDS) {
    const dC = Math.hypot(c.sp.x - V.x, c.sp.z - V.z);
    for (const q of c.people) {
      if (q.dead) continue;
      const u = q.grp.userData;
      q.ph += dt;
      q.grp.visible = dC < 130;
      // под колёса — как все; и до испуга: рядом сбили одного — остальные не бессмертные (04.10.2026)
      if (vsp > 3) {
        const dx = q.x - V.x, dz = q.z - V.z;
        if (Math.abs(dx * fx + dz * fz) < CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < CAR_W + 0.35) {
          q.dead = 1; dropMesh(q.grp);
          gibHuman(q, V.vx, V.vz);
          S.people++;
          Snd.squish();
          continue;
        }
      }
      if (q.shock > 0) { q.shock -= dt; handsUp(u, dt); continue; }
      u.armL.rotation.z = 0; u.armR.rotation.z = 0;
      // пританцовывают и отпивают газировку
      q.grp.rotation.z = Math.sin(q.ph * q.sway) * 0.07;
      q.drink -= dt;
      const sip = q.drink < 0 ? Math.min(1, -q.drink * 3) * (q.drink > -1.2 ? 1 : 0) : 0;
      if (q.drink < -1.4) q.drink = rand(3, 8);
      u.armR.rotation.x = damp(u.armR.rotation.x, sip ? -2.3 : -0.5, 8, dt);
      u.head.rotation.x = damp(u.head.rotation.x, sip ? -0.45 : 0.05, 8, dt);
      u.armL.rotation.x = Math.sin(q.ph * 1.7) * 0.25;             // размахивают руками — разговор
    }
    // поют по очереди: реплика над головой и пара нот, если рядом
    if (c.sayT > 0 && (c.sayT -= dt) <= 0 && c.say) { c.say.parent && c.say.parent.remove(c.say); c.say.material.dispose(); c.say = null; }
    if ((c.burpT -= dt) <= 0) {
      c.burpT = rand(2, 5);
      const alive = c.people.filter(q => !q.dead);
      if (alive.length && dC < 140) {
        const q = pick(alive), txt = pick(BURPS);
        if (c.say) { c.say.parent && c.say.parent.remove(c.say); c.say.material.dispose(); }
        c.say = sayBubble(q.grp, txt, ADULT ? '#5a7a2a' : '#5a4a9a', 2.6);
        c.sayT = 1.6;
        if (dC < 70 && ADULT && [0, 1, 2, 7].includes(BURPS.indexOf(txt))) Snd.fx('burp', s => { s.blip(rand(70, 110), 0.35, 'sawtooth', 0.1); s.noise(0.2, 0.08); }, { x: c.sp.x, z: c.sp.z, far: 70 });
        else if (dC < 70 && txt.includes('♪')) { const f0 = rand(330, 520); Snd.fx('sing', s => [0, 1, 2].forEach(i => setTimeout(() => s.blip(f0 * [1, 1.25, 1.5][i], 0.18, 'triangle', 0.06), i * 180)), { x: c.sp.x, z: c.sp.z, far: 70 }); }
      }
    }
  }
}

LATE.add('pubs', buildPubSpots);
LATE.add('peds', initPeds);
LATE.add('people', initPeople);
LATE.add('scoots', initScoots);
if (!INTRO) {
  LATE.add('night', () => { buildNight(); initClouds(); initBirds(); });
  // прогрев шейдеров: дождь, ночной свет и фары впервые появляются посреди
  // смены — компиляция программ на лету давала заметный рывок
  LATE.add('compile', () => {
    const hid = [...NIGHT_OBJ, rainLines, headGlow];
    for (const o of hid) o.visible = true;
    renderer.compile(scene, cam);
    for (const o of hid) o.visible = false;
  });
}
if (!INTRO) LATE.add('smokers', initSmokers);      // во вступлении курилка — это кружок из кино

LATE.add('cam', () => { V.camX = V.x + 14; V.camZ = V.z + 14; V.camY = V.y + 6; });
buildFullMap();
hudHearts();
resize();
function showTitle () {
  if (INTRO) return;
  CHAT.clear(); DLG.lineClear();
  showBig(OWN.pizza(),
    $t(GORE_ON ? MAP.tagline.adult : MAP.tagline.kids), '');
  if (CAREER) CAREERM.menu();                     // карьера: своё главное меню (menu.js)
}
showTitle();

/* Прохожие дальше ста семидесяти метров и машины дальше двухсот
   восьмидесяти — точки в тумане: рисовать их незачем. Считаются они
   по-прежнему, прячем только меш. */
/* у края дальности не выскакивают и не пропадают разом: последние FAR_BAND м уходят в землю —
   сжимаются к основанию (на 100—200 м это несколько точек экрана: глазом — как растворились) */
const FAR_BAND = { people: 20, cars: 35 };
function farShrink (o, d, r, band) {
  const k = clamp((r - d) / band, 0, 1), u = o.userData;
  if (k >= 1) { if (u.fs0 !== undefined) { o.scale.setScalar(u.fs0); u.fs0 = undefined; } return; }
  if (u.fs0 === undefined) u.fs0 = o.scale.x;
  o.scale.setScalar(u.fs0 * Math.max(0.02, k * k * (3 - 2 * k)));
}
/* и вне кадра (сзади, по бокам) — тоже прячем (09.10.2026, хвост кадров на Деке): three.js не перебирает
   их меши (у машины — до 20, у человека — 6—10), а CULL.step не считает их матрицы. Шар с запасом:
   человек 2,5 м, машина 7 м — край кадра не мигает. Пирамида — этого кадра (камера уже встала, CULL.view) */
const CULL_FAR_LISTS = [PEOPLE, PEDS, SCOOTS];
let VIEWED = false;                               // последний кадр игры прятал по кадру (cullFar, подбираемое)
function cullFar () {
  const R = GFX.hideR();                          // 130 / 220 м; на Низкой — 100 / 200 (gfx.js «меньше декора»)
  CULL.view();
  VIEWED = true;
  for (let li = 0; li < CULL_FAR_LISTS.length; li++)
    for (const p of CULL_FAR_LISTS[li]) {
      if (p.dead) continue;
      const dx = p.x - V.x, dz = p.z - V.z, d = Math.sqrt(dx * dx + dz * dz), g = p.grp;
      g.visible = d <= R.people && CULL.inView(p.x, g.position.y + 0.9, p.z, 2.5);
      if (g.visible) farShrink(g, d, R.people, FAR_BAND.people);
    }
  for (let i = 0; i < TRAFFIC.length; i++) {
    const t = TRAFFIC[i], dx = t.x - V.x, dz = t.z - V.z, d = Math.sqrt(dx * dx + dz * dz), m = t.mesh;
    m.visible = d <= R.cars && CULL.inView(t.x, m.position.y + 1, t.z, 7);
    if (m.visible && !t.knock) farShrink(m, d, R.cars, FAR_BAND.cars);
  }
}
/* катсцена и вступление: камера своя, а cullFar и updateNitro не идут — спрятанное «вне кадра»
   игры вернуть, как было раньше (по одной дальности) */
function unview () {
  if (!VIEWED) return;
  VIEWED = false;
  const R = GFX.hideR();
  for (const list of CULL_FAR_LISTS) for (const p of list) if (!p.dead) p.grp.visible = Math.hypot(p.x - V.x, p.z - V.z) <= R.people;
  for (const t of TRAFFIC) t.mesh.visible = Math.hypot(t.x - V.x, t.z - V.z) <= R.cars;
  for (const n of NITRO_CANS) n.g.visible = n.t <= 0 && Math.abs(n.x - V.x) < 460 && Math.abs(n.z - V.z) < 460 && !(n.life < 5 && Math.floor(n.life * 6) % 2);
}

/* ── геймпад: езда, карточки, меню (раскладка — в input/gamepad.js) ──
   Меню листаются крестовиной или стиком: какое сейчас открыто — то и
   листаем, остальное игнорируем. */
const padMenu = makePadMenu({
  onBack: () => { if (CAREER && CAREERM.back()) return; if (CH.full && CH.opts.length && !$('choice').hidden) { pickChoice(CH.opts.length - 1); return; } if (!elPanel.hidden) panelBack(); else if (S.paused) setPause(false); else if (FM.open) setFullMap(false); },
  // A на поле: фокус в поле (печатать с клавиатуры) и экранная клавиатура Steam (Deck): что ввёл — обратно в поле
  onText: el => { try { el.focus({ preventScroll: true }); } catch (e) { /* — */ } steamKeyboard(el, true); },
});
/* экранная клавиатура Стима для любого поля ввода текста (имя, профиль): поднять, не поднимать
   второй раз, гасить автоповтор букв, пока висит, и не отдавать игре геймпад (osk.js) */
const steamKeyboard = (el, force) => OSKM.keyboard(el, force);
OSKM.init();
/* трогает экран, мышь, клавиши — город за меню полные к/с, пока листаешь (gfx.js poke) */
for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) addEventListener(ev, () => GFX.poke(), { passive: true, capture: true });
function padScreen () {
  const cr = CAREER && CAREERM.padRoot();         // карьера: окно имени, гараж, «потратить» — поверх всего
  if (cr) return cr;
  if (!elPanel.hidden) return elPanel;
  if (FM.open) return null;
  if (!$('choice').hidden && (CH.pause || CH.full)) return $('choice');
  if (S.paused && elPause && !elPause.hidden) return elPause;
  if (elPhone.classList.contains('on')) return elPhone;
  if (!$('over').hidden) return $('over');
  if (!elBig.hidden) return elBig;
  return null;
}
const PAD_GLYPH = { use: 0 };
function padStep () {
  if (EDL.ED.on) return;                          // редактор города: геймпад водит его камеру, меню не трогаем
  const p = pollPad();
  // значки кнопок (glyphs.js) — на геймпад с первого же нажатия, а не когда body.pad погаснет и зажжётся заново
  if (p.connected && p.lastUse > PAD_GLYPH.use) { PAD_GLYPH.use = p.lastUse; glyphInput('pad'); }
  // body.pad — «играют геймпадом» ровно тогда, когда значки геймпада (glyphs.js): включается первым нажатием
  // геймпада, гаснет первой клавишей или мышью (не через 8 с простоя) — подсказки, «управление», карта района — в лад
  document.body.classList.toggle('pad', !!p.connected && inputKind().kind === 'pad');
  if (!p.connected) return;
  if (EXT.paused) return;
  if (OSKM.padGate(p)) return;                    // над полем висит клавиатура Стима — кнопки её, не игры (osk.js)
  if (p.any) { Snd.boot(); Snd.resume(); GFX.poke(); }
  if (REPLAY.pad(p)) return;                      // повтор: LB в езде — открыть; открыт — все кнопки его (replay.js)
  if (FIRST.on()) { if (p.accept) FIRST.next(); else if (p.menuBack || p.pause) FIRST.skip(); return; }   // вступление: A — следующий план, B / Start — пропустить; до игры не доходит
  const screen = padScreen();
  if (p.pause && !elPanel.hidden) closePanel();
  else if (p.pause && (S.paused || isPlaying())) setPause(!S.paused);
  if (DOOR.on() && !S.paused && !screen) { DOOR.pad(p); return; }   // домофон (doorstep.js): крестовина, A, B, Y — его; Start — пауза (выше)
  if (p.map && !S.paused && isPlaying()) setFullMap(!FM.open);
  else if (FM.open) {                             // карта: стик — двигать, R2 / L2 — зум ближе / дальше, B — закрыть
    FM.padX = p.steer + p.rx; FM.padY = p.ly + p.ry; FM.padZ = p.gas - p.brake;
    if (p.menuBack) setFullMap(false);
  }
  if (p.accept && S.state === 'brief' && !S.paused && !FM.open && !DLG.isOpen() && !(CAREER && CAREERM.padRoot())) acceptOrder();   // A — принять заказ
  if (p.btnX && !screen && !S.paused && !FM.open && isPlaying() && GFX.offerYes()) p.btnX = false;   // X — «включить „среднюю“» на плашке «кадр не успевает» (gfx.js)
  if (p.sound) Snd.set(!Snd.on);
  // на ходу — крестовина ◀ ▲ ▶ (двух вариантов: ▶ — второй); на паузе (обед) — A, X, Y: первый, второй, третий (ниже)
  if (CH.opts.length && !CH.pause && !CH.full) { if (p.choice1) pickChoice(0); else if (p.choice2) pickChoice(1); else if (p.choice3) pickChoice(CH.opts.length === 2 ? 1 : 2); }
  // обед (карточка на паузе, до трёх вариантов): каждая своей кнопкой — [A] первый, [X] второй, [Y] третий, значки стоят
  // на вариантах намертво; курсора нет (раньше курсор уводили на второй, а [A] оставался на первом и жал второй)
  const meal = screen === $('choice') && CH.pause && !CH.full && CH.opts.length <= 3;
  if (meal) {
    if (p.menuOk) pickChoice(0);
    else if (p.btnX && CH.opts.length > 1) pickChoice(1);
    else if (p.btnY && CH.opts.length > 2) pickChoice(2);
  }
  if (screen && CAREER && screen === QR.root()) QR.pad(p);   // быстрый заезд: ←→ / LB RB — значение строки, A — поехали, X — условия (quickrun.js)
  if (screen && CAREER) CAREERM.padPre(p);      // гараж: ←→ и LB/RB листают машины
  // настройки — табы (settings.js): LB/RB и LT/RT — всегда, ←→ — со строки табов (иначе — по списку)
  if (screen === elPanel && elPanel.dataset.kind === 'collect') COLM.pad(p, padMenu, elPanel);   // «мои находки»: ↑↓ — по рядам сетки
  if (screen === elPanel && SET.on()) {
    const pg = (p.pageR || p.trigR ? 1 : 0) - (p.pageL || p.trigL ? 1 : 0), d = (p.menuRight ? 1 : 0) - (p.menuLeft ? 1 : 0);
    if (pg) { SET.flip(pg, true); p.menuLeft = p.menuRight = false; } else if (d && SET.flip(d)) p.menuLeft = p.menuRight = false;
  } else if (screen === elPause && PAUSE.on()) {   // пауза — полоса кнопок внизу (pausecz.js): ←→, LB/RB — листать
    const d = (p.menuRight || p.pageR ? 1 : 0) - (p.menuLeft || p.pageL ? 1 : 0);
    if (d) PAUSE.flip(d);
    p.menuLeft = p.menuRight = false;
  }
  if (screen && !meal) { padMenu(p, screen); if (screen === elPanel && elPanel.dataset.kind === 'collect') COLM.sync(padMenu.selected()); }
  else if (meal) padMenu(p, null);              // обед: подсветки курсора нет
  else if (!S.paused && !FM.open) applyToIN(IN, p);
}

/* что нужно life.js (парочки, богачи, графитисты, змеи и дроны): сам он
   переменных этого модуля не видит */
/* что нужно buses.js: граф улиц, поток, удар, люди */
const busApi = () => ({
  THREE, scene, V, S, CITY, NODES, EDGES, TRAFFIC, DRIVE_MAX, CAR_L, CAR_W, IMPACT, Snd, home: MAP.home && MAP.home.point,
  edgeOf, edgeRun, laneOff, flowOk: e => NAR.flowOk(e, nodeDeg), inBounds, nearestRoad, groundH, curbAt, put, mergeGeos,
  carObj, poseTraffic, makeHuman, dropMesh, gibHuman, sayBubble, sparks, hurtCar, carDmg,
  inView: CULL.inView, hideR: () => GFX.hideR(), night: () => ENV.night || 0, isNight: trafficNight,
  onKill: () => { S.people++; Snd.squish(); },
});
// автобусы: маршруты по главным улицам и сами автобусы (buses.js), по шагам; во вступлении — нет. Здесь, а не у
// потока: с ?nolate кусок строится сразу, а busApi объявлен только тут
if (!INTRO) LATE.add('buses', () => BUSES.build(busApi()));
const LIFE_API = {
  THREE, scene, cam, V, S, ENV, CITY, ADULT, HUMAN_VC, CAR_L, CAR_W, TRAFFIC, Snd,
  groundH, curbAt, inHouse, inPoly, inBounds, nearestRoad, pushOut, walkerStep, walkSpawn, walkBack, dodgeCar,
  ARCHES, makeHuman, dropMesh, makeCar, newCar, poseOnSlope, gibHuman, handsUp, emote, puff, sayBubble, toast, put, mergeGeos,
  onKill: () => { S.people++; Snd.squish(); },
};
// следы колёс (tracks.js): меш — сейчас, до renderer.compile, чтобы шейдер собрался под экраном загрузки
TRK.init({ THREE, scene, V, IN, CITY, groundH, surfaceAt, iceY: ICEM.iceY, curbAt, inPoly, nearestRoad, car: () => car, pizzerias: () => (PIZZERIAS.length ? PIZZERIAS : [PIZZA]) });

/* ─────────────── цикл ─────────────── */
let last = performance.now(), tG = 0;

/* журнал ошибок (docs/CRASHES.md): что было в игре в момент первой такой ошибки; зовётся только
   на новую запись — не каждый кадр. Каждое поле — отдельно: сломанное не роняет остальные */
CL.setToast(toast);
CL.setSnapshot(() => {
  const g = f => { try { return f(); } catch (e) { return '?'; } };
  return {
    map: MAP.id, adult: !!ADULT, gore: !!GORE_ON, career: !!CAREER, state: S.state, ride: !!S.ride, paused: !!S.paused,
    fullMap: !!FM.open, dialog: g(() => DLG.isOpen()), shiftT: +(S.shiftT || 0).toFixed(1),
    clock: g(() => (CAREER && CAREERM.shiftOn() ? CAREERM.clockText() : envClock())), envT: +(+ENV.t || 0).toFixed(4),
    season: g(() => SEAS.seasonName()), rain: !!ENV.rainWant,
    district: g(() => (DISTRICTS ? DIST.list()[DIST.at(V.x, V.z)].name : '')), pizzeria: g(() => PIZZA && PIZZA.name),
    order: g(() => (S.order ? (S.order.kind || '') + (S.order.ord && S.order.ord.urgent ? ' urgent' : '') + ' ' + (S.order.idx + 1) + '/' + S.order.stops.length : null)),
    target: g(() => (S.target ? Math.round(Math.hypot(S.target.x - V.x, S.target.z - V.z)) + ' m' : null)), time: +(+S.time || 0).toFixed(1),
    car: g(() => ({ x: +V.x.toFixed(1), z: +V.z.toFixed(1), y: +V.y.toFixed(2), h: +V.h.toFixed(2), kmh: Math.round(Math.hypot(V.vx, V.vz) * 3.6) })),
    hp: S.hp, hpMax: S.hpMax, delivered: S.delivered, money: S.money,
    n: g(() => ({ traffic: TRAFFIC.length, people: PEOPLE.length, peds: PEDS.length, scoots: SCOOTS.length })),
    stalled: g(() => CAREER && AUTO.stalled()), story: g(() => !!(STORY.active && STORY.active())),
  };
});

/* предохранитель (src/platform/crashlog.js, docs/CRASHES.md): исключение в кадре не морозит мир
   навсегда — пишется в журнал, кадр дорисовывается; шаг мира, что падает 3 кадра подряд, —
   выключается до конца сессии (CL.step). CL.want/done — сторож «мир стоит, а кадры идут» */
/* кадр меню, пока город достраивается (latebuild.js): мир и камера стоят, город рисуется не чаще раза в 0,2 с —
   время кадров уходит на стройку (на Деке кадр города ~35 мс). Ушли из меню (смена, гараж, катсцена) —
   достроить сразу и дальше обычным кадром */
let LATE_F = 0, LATE_R = -1e9;
function lateFrame (now) {
  if (S.state !== 'title' || S.paused || (CAREER && CAREERM.covered())) { LATE.flush(); return false; }
  last = now;
  padStep();
  if (LATE_F >= 3 && now - LATE_R < 200) return true;
  LATE_R = now;
  if (EDL.ED.cam) EDL.ED.cam(cam, 0);             // редактор города: своя камера (editlayer.js)
  else if (CAREER) CAREERM.menuCam(cam, PIZZA, tG);
  else { const a = tG * 0.16; cam.position.set(PIZZA.bx + Math.sin(a) * 64, PIZZA.by + 42 + Math.sin(a * 0.7) * 4, PIZZA.bz + Math.cos(a) * 64); cam.lookAt(PIZZA.bx, PIZZA.by + 3, PIZZA.bz); }
  car.position.set(V.x, V.y, V.z);
  car.rotation.y = V.h;
  try { updateEnv(0); } catch (e) { /* небо и свет (время суток стоит); что не собрано — потом */ }
  renderer.render(scene, cam);
  if (++LATE_F === 3) LATE.start();               // меню уже на экране — строим дальше
  return true;
}
function frame (now) {
  requestAnimationFrame(frame);
  CL.beat(now);
  try { frameStep(now); }
  catch (e) {
    CL.report('frame:' + (CL.at.ph || '?'), e, 'frame');
    try { renderer.render(scene, cam); } catch (e2) { /* — */ }
  }
}
function frameStep (now) {
  CL.at.ph = 'pre';
  if (LATE.busy() && lateFrame(now)) return;      // город ещё достраивается за меню (latebuild.js)
  // настройки графики (gfx.js): 30 / 60 к/с, город за меню застывший или 30 к/с — лишний кадр пропускаем
  // целиком, время копится (last не трогаем): следующий кадр шагнёт мир на всё прошедшее
  const menu = (S.state === 'title' || S.state === 'over') && !EDL.ED.on;   // редактор города: кадр как в езде, не «город за меню»
  const cover = menu && CAREER && CAREERM.covered();
  if (GFX.hold(now, menu, menu ? S.state + (cover ? '+' : '') + canvas.width + 'x' + canvas.height + (PIZZA && PIZZA.name) : '', cover)) { if (menu) padStep(); return; }
  const tWork = performance.now();                // сколько занял сам кадр — для страховки дальности (cull.js)
  const raw = Math.max(0, (now - last) / 1000);
  let dt = clamp(raw, 0, 1 / 20);       // назад время не идёт
  last = now;
  CULL.govern(raw, isPlaying() && !S.paused && !EXT.paused && !FM.open && !document.hidden);
  padStep();
  CL.track(S.state);
  if (CAREER && CAREERM.covered()) return;         // гараж и «потратить» закрывают весь экран — город не рисуем
  // повтор (replay.js): мир стоит, позы — из записи, камера своя
  if (REPLAY.on()) { if (!EXT.paused) { REPLAY.frame(raw); humanLod(); CULL.step(); renderer.render(scene, cam); } return; }
  if (SBX.nitro) NOS.tank = 1;                     // песочница: бесконечное нитро
  // катсцена сюжетного заказа: мир стоит, ходят только актёры, камера — своя (story.js)
  if (!S.paused && !EXT.paused && STORY.frame(dt, car)) { unview(); updateFX(dt); updateFly(dt); updateTrunk(dt); SEAS.updateSeasons(dt); humanLod(); CULL.step(); renderer.render(scene, cam); return; }
  // вступление первого запуска (intro.js): мир стоит, дымят только кальян Степана и капот
  if (!S.paused && !EXT.paused && FIRST.frame(dt)) { unview(); HK.step(dt); updateFX(dt); SEAS.updateSeasons(dt); humanLod(); CULL.step(); renderer.render(scene, cam); return; }
  if (S.paused || EXT.paused || DLG.isOpen()) return;     // диалог — мир стоит
  if (FM.open) { drawFullMap(); return; }        // на карте игра стоит
  CL.want(now, isPlaying());
  CL.at.ph = 'drive';
  dt *= REPLAY.slowK(raw);                         // после сильного удара мир ~0,4 с идёт ×0,3 (replay.js)
  tG += dt;
  if (isPlaying() && !S.ride && S.state !== 'brief' && S.state !== 'loading') S.shiftT = (S.shiftT || 0) + dt;

  let vf = 0;
  if (S.state === 'dying' && DEATH.rev) {
    for (const k in IN) IN[k] = 0;
    reviveTick(dt);                              // новая машина спускается с неба
  } else if (S.state === 'dying') {
    for (const k in IN) IN[k] = 0;              // руль из рук выпал, машина катится сама
    vf = driveStep(dt);
    deathTick(dt);
  } else if (S.state === 'brief' || S.state === 'loading') {
    touches.clear();
    for (const k in IN) IN[k] = 0;              // руль заблокирован до загрузки
    vf = driveStep(dt);
    camStep(dt, vf);
  } else if (S.state === 'title' || S.state === 'over') {
    // На заставке камера облетает пиццерию поверх крыш: в настоящем городе
    // дома вокруг выше, и на прежней высоте кадр уезжал внутрь стены.
    const a = tG * 0.16;
    if (EDL.ED.cam) EDL.ED.cam(cam, dt);             // редактор города: свободная камера (editlayer.js, src/editor)
    else if (CAREER && S.state === 'title') CAREERM.menuCam(cam, PIZZA, tG);   // меню карьеры: медленный облёт, пиццерия справа
    else {
      cam.position.set(PIZZA.bx + Math.sin(a) * 64, PIZZA.by + 42 + Math.sin(a * 0.7) * 4, PIZZA.bz + Math.cos(a) * 64);
      cam.lookAt(PIZZA.bx, PIZZA.by + 3, PIZZA.bz);
    }
    car.position.set(V.x, V.y, V.z);
    car.rotation.y = V.h;
  } else {
    if (DOOR.on()) {                               // домофон (doorstep.js): руль из рук, машина тормозит и стоит
      touches.clear();
      for (const k in IN) IN[k] = 0;
      const k = Math.exp(-5 * dt); V.vx *= k; V.vz *= k;
    }
    vf = driveSub(dt);
    camStep(dt, vf);
  }

  CL.at.ph = 'world';
  CULL.view();                                     // пирамида кадра — камера уже встала (что в кадре: подбираемое, машины, люди)
  CL.step('lights', updateLights, dt);
  CL.step('props', updateProps, dt);
  CL.step('lamps', SL.step, dt);                                     // сбитые фонари падают и лежат (streetlamps.js)
  CL.step('traffic', updateTraffic, dt);
  CL.step('buses', BUSES.step, dt);                // автобусы: сколько возле курьера, люди на остановках (buses.js)
  CL.step('construction', CONSTR.step, dt);       // краны, упавший забор, толкнутая техника, самосвалы (construction.js) — до коневозок
  CL.step('rivalshops', RIVS.step, dt);           // маскоты у точек конкурентов, зима/лето террас, их курьеры (rivals.js)
  CL.step('horsebox', HB.step, dt, HB_API || (HB_API = hbApi()));   // коневозки: прицеп за машиной (horsebox.js)
  CL.step('peds', updatePeds, dt);
  CL.step('people', updatePeople, dt);
  CL.step('scoots', updateScoots, dt);
  if (MAPFIX || MAPCHECK) CL.step('mapworks', MAPW.step, dt, MAPW_API || (MAPW_API = mapApi()));     // дорожники, каток, ?mapcheck
  CL.step('drivers', updateDrivers, dt);
  CL.step('ambulance', updateAmb, dt);
  CL.step('thief', updateThief, dt);
  CL.step('accidents', updateAccidents, dt);
  CL.step('roadlife', RL.step, dt, RL_API || (RL_API = roadApi()));    // пробки, ремонт, знаки, фары потока (roadlife.js)
  CL.step('billboards', BB.step, dt, BB_API || (BB_API = bbApi()));   // смена рекламы на щитах (billboards.js)
  CL.step('pizzadome', PZD.step, dt, ENV_API);    // пиццерия-шар: логотип крутится, ночью светится (pizzadome.js)
  CL.step('forest', FOREST.step, dt, FOREST_API);
  CL.step('lwood', LWOOD.step, dt);                // тропы леса у Ленина зимой светлее (leninwood.js)
  CL.step('lawn', LAWNP.step, dt);                 // мелочь на газоне: какие клетки рядом и в кадре (lawnprops.js)  // ельник: какие ели рядом и в кадре (forest.js)
  CL.step('rivals', updateRivals, dt);
  CL.step('verandas', updateVerandas, dt);
  CL.at.ph = 'orders';
  choiceStep(dt);
  if (CAREER) ORD.step(dt);                       // очередь на HUD, посадка работников (orders.js)
  if (CAREER) CL.step('doorstep', DOOR.step, dt);  // домофон у подъезда: таймер мини-игры (doorstep.js)
  CL.at.ph = 'world';
  CL.step('smokers', updateSmokers, dt);
  CL.step('hookah', HK.step, dt);                                    // кальянщики на лавочках
  if (CAREER) CL.step('festivals', FEST.step, dt);                    // фестиваль на парковке ТЦ (festivals.js)
  CL.step('parties', updateParties, dt);
  CL.step('collect', updateCollect, dt);
  CL.step('trunk', updateTrunk, dt);
  CL.step('carrear', REARM.step, dt, car, pizzasInCar());               // коробки в открытом багажнике (carrear.js)
  CL.step('routeline', updateRouteLine, dt);                            // оранжевый маршрут на асфальте
  CL.step('tracks', TRK.step, dt);                                   // следы колёс на газоне и снегу (tracks.js)
  CL.step('hints', HINTS.step, dt);                                 // подсказки первой смены строкой внизу (hints.js)
  CL.step('walkers', separateWalkers, dt);
  CL.step('gibs', updateGibs, dt);
  CL.step('gore', updateGore, dt);
  CL.step('junk', JUNK.step, dt);                                   // контейнеры катятся, обломки остановок падают (junk.js)
  CL.step('hits', HITS.update, dt);
  CL.step('fly', updateFly, dt);
  CL.at.ph = 'nitro';
  updateNitro(dt);
  CL.at.ph = 'districts';
  if (DISTRICTS) districtWatch(dt);
  CL.at.ph = 'world';
  CL.step('fx', updateFX, dt);
  CL.step('pixfx', PIX.step, dt);                 // дымок из-под колёс и осколки стёкол (pixfx.js)
  CL.step('env', updateEnv, dt);
  CL.step('streams', STREAMS.step, dt);                              // вброд: брызги, плеск, подсказка Толика (streams.js)
  CL.step('ice', ICEM.step, dt);                                     // лёд: трещины бегут, льдины качаются, торосы (ice.js)
  CL.step('water', WATER.step, dt);                                  // вода: время, небо, солнце, дождь, лёд (water.js)
  CL.at.ph = 'career';
  if (CAREER) CAREERM.step(dt);                   // часы смены, обед в 14:00, полночь
  CL.at.ph = 'world';
  CL.step('seasons', SEAS.updateSeasons, dt);                         // снег, небо, снежки
  CL.step('weather', WTH.update, dt);                                // жара, гроза с молниями, сугробы и ледянки (weather.js)
  CL.step('impact', IMPACT.step, dt);                                 // скрежет бортом — петля, пока трёшься (impact.js)
  CL.step('ambience', AMBI.step, dt);                                 // город шумит: птицы, сверчки, дождь по крыше, толпа, стройка (ambience.js)
  CL.step('crowds', updateCrowds, dt);
  if (!INTRO) CL.step('wastelands', WASTE.step, dt);             // лужи по сезону и дождю, собаки и люди на пустырях (wastelands.js)
  if (!INTRO) CL.step('beach', BEACH.step, dt);                   // пляж: летнее по сезону, люди, сбитое встаёт, песок из-под колёс (beach.js)
  if (!INTRO) CL.step('darknight', DARKN.step, dt);              // тёмная ночь: костры, ведьмы, привидения (darknight.js)
  if (ADULT && !INTRO) CL.step('nightlife', NIGHT.step, dt);            // ночная жизнь, только взрослая (nightlife.js)
  CL.step('life', LIFE.step, dt, LIFE_API);
  CL.step('world', WORLD.step, dt, WORLD_API || (WORLD_API = worldApi()));   // мусор, бандиты, шашлыки (world.js)
  CL.step('mafia', MAFIA.step, dt, MAFIA_API || (MAFIA_API = mafiaApi()));   // мафиози у адреса (mafia.js)
  CL.step('thugs', THUGS.step, dt, THUGS_API || (THUGS_API = thugsApi()));   // гопники прессуют прохожего (thugs.js)
  CL.step('protests', PROT.step, dt, PROT_API || (PROT_API = protApi()));   // протест по ступеням, концерты во дворах (protests.js)
  CL.step('growth', GROW.step, dt, GROW_API || (GROW_API = growApi()));      // пиццерия растёт: вид у шара (growth.js)
  CL.step('director', DIRECTOR.step, dt);                           // режиссёр событий: пауза после крупного (director.js)
  if (CAREER) CL.step('raid', RAID.step, dt);                          // налёт на точку, ёлка-турель (raid.js)
  CL.step('heroes', HEROES.step, dt, HEROES_API || (HEROES_API = heroesApi()));   // герои города (heroes.js)
  CL.step('fauna', FAUNA.step, dt, FAUNA_API || (FAUNA_API = faunaApi()));   // лоси и звери в лесах (fauna.js)
  CL.step('cats', CATS.step, dt, CATS_API || (CATS_API = catsApi()));      // коты на крышах и у подвалов (cats.js)
  CL.step('ach', ACH.step, dt);                                              // достижения: опрос счётчиков (achievements.js)
  CL.step('rink', LM.stepRink, RINK, dt, V.x, V.z);
  CL.step('crew', CREWS.step, dt, CREWS_API || (CREWS_API = crewsApi()));   // компании в форме сетей (crews.js)
  CL.step('surf', updateSurf, dt);
  CL.step('football', updateFootball, dt);
  CL.step('workout', WORK.step, dt);              // площадки-качалки: люди качаются, курьер подтягивается (workout.js)
  CL.step('kites', KITES.step, dt);                // змеи и дроны (kites.js)
  CL.step('talk', TALK.step, dt, cam, V);                            // реплики над головами: ближние, крупнее вблизи (talk.js)
  CL.at.ph = 'car';
  if (CAREER) AUTO.step(dt, vf);                  // заглохла, ямы, гараж Дяди Жени
  CL.step('exhaust', EXH.step, dt, vf, EXH_API || (EXH_API = exhApi()));   // дым из выхлопа по мотору (exhaust.js)
  CL.step('motor', MOTOR.step, dt, MOTOR_API || (MOTOR_API = motorApi()));   // мотор из записей, визг шин, нитро, гул потока (motor.js)
  CL.step('wipers', WIPE.step, dt, car, Math.max(SEAS.snowy() ? 0 : ENV.rain, SEAS.snowFall()));   // дворники в дождь и снегопад (wipers.js)
  CL.step('cardent', DENTM.step, dt, car);           // отлетевшие бампер, крышка, зеркала, колпаки на дороге (cardent.js)
  CL.step('cardirt', DIRT.step, dt, car, LIVE_DIRT.has(S.state) ? vf : 0, DIRT_W(DIRT_ENV));   // грязь и снег на машине (cardirt.js)
  S.hurt = Math.max(0, S.hurt - dt);
  CL.at.ph = 'orders';

  // цель стоит на месте (pinStop); сборный: подъехал к другому неотданному адресу — он и цель (orders.js reachStop)
  if (S.state === 'drive' && S.order && ORD.reachStop(S.order)) { syncTarget(false); rebuildRoutePath(); }
  if (S.state === 'side') {
    S.time -= dt;
    if (S.time < 6) { S.tickT += dt; if (S.tickT > 0.4) { S.tickT = 0; Snd.tick(); } }
    if (S.time < 0) sideEnd(false, $t('не успел — клиент передумал'));
    else checkArrival(dt);
    S.routeT += dt;
    if (S.routeT > 0.35) { S.routeT = 0; rebuildRoutePath(); }
  }
  if (S.state === 'drive' || S.state === 'back') {
    if (!S.free) {                                // без времени срок стоит
      S.time -= dt;
      if (S.time < 6) { S.tickT += dt; if (S.tickT > 0.4) { S.tickT = 0; Snd.tick(); } }
      // карьера: протух — не конец смены (docs/ORDERS.md «Опоздал»): везёшь дальше, клиент злой, платят ECON.PAY.LATE;
      // опоздал обратно в пиццерию — штраф (backLate, econ.js BACK_FINE). Развоз смены после полуночи закрывает сам orders.js. Яндекс — по-старому
      if (CAREER) { if (S.time >= 0) S.lateTold = false; else if (!S.lateTold && S.state === 'drive' && S.order && !(S.order.ord && S.order.ord.type === 'staff')) { S.lateTold = true; if (S.order.ord && S.order.ord.urgent) urgentFail(); else popBonus($t('опаздываешь'), $t('клиент недоволен: заплатит {p} % и без чаевых', { p: Math.round(ECON.PAY.LATE * 100) })); }
        else if (!S.lateTold && S.state === 'back') { S.lateTold = true; backLate(); } }
      else if (S.time < -GRACE) gameOver('не успел', [], { x: V.x, z: V.z });
    }
    checkArrival(dt);
    S.routeT += dt;
    if (S.routeT > 0.35) { S.routeT = 0; rebuildRoutePath(); }
  } else if (S.state === 'handover') {
    S.handT -= dt;
    if (S.handT <= 0) {
      // вернулся в пиццерию: карьера — обед с 14:00 (Толик «на, похавай») или развоз смены после полуночи (career.js atBase)
      if (!S.order) { if (mealDue()) showMeal(); else if (!(CAREER && CAREERM.atBase(newOrder))) newOrder(); }
      else backToBase();
    }
  }

  // маркер адреса: пульсирует и крутится, его видно издалека
  if (S.target && S.state !== 'title' && S.state !== 'over') {
    marker.visible = true;
    if (CAREER) ORD.tintMarker(marker);            // цвет вида заказа: пицца, срочно, поручение, развоз, сюжет
    marker.position.set(S.target.x, groundH(S.target.x, S.target.z), S.target.z);
    marker.rotation.y = tG * 1.2;
    marker.userData.ball.position.y = 6.6 + Math.sin(tG * 3) * 0.45;
    const p = 1 + Math.sin(tG * 3.4) * 0.12;
    marker.userData.ring.scale.set(p, p, p);
  } else marker.visible = false;

  CL.at.ph = 'hud';
  CL.step('cull', cullFar);
  CL.step('lod', humanLod);
  CL.step('radar', drawRadar);
  hudStep(dt);
  CL.step('rivalhud', rivalsStep, dt);

  // машину потряхивает после удара
  if (S.state !== 'intro' && !DEATH.rev) car.position.y = V.y + (V.kerb || 0) + (S.hurt > 0 ? Math.sin(tG * 60) * 0.06 : 0);
  if (S.hp <= 2 && S.state !== 'title' && S.state !== 'over') {
    S.smokeT = (S.smokeT || 0) - dt;
    if (S.smokeT <= 0) {
      S.smokeT = S.hp <= 1 ? 0.12 : 0.3;
      puff(V.x + Math.sin(V.h) * 1.9, 1.2, V.z + Math.cos(V.h) * 1.9, S.hp <= 1, rand(0.5, 0.9));
      if (S.hp <= 1 && chance(0.35)) fire(V.x + Math.sin(V.h) * 1.9, 1.1, V.z + Math.cos(V.h) * 1.9);
    }
  }

  CL.done(tG);
  CL.step('carshadow', carShadow);                 // пятно-тень под машиной игрока (carshadow.js)
  if (S.state !== 'title' && S.state !== 'over') CL.step('replay', REPLAY.rec, dt); else REPLAY.idle();   // запись последних 10 с для повтора (replay.js)
  CL.at.ph = 'render';
  CULL.step();
  renderer.render(scene, cam);
  const wk = performance.now() - tWork;
  CULL.work(wk / 1000);
  GFX.work(wk);
  GFX.watch(isPlaying() && !S.paused && !FM.open && !REPLAY.on() && !(DLG.isOpen && DLG.isOpen()));             // кадр не успевает на Высокой — один раз предложить Среднюю
}
// шейдеры всех материалов города — сейчас, под экраном загрузки, а не рывком
// в первый раз, когда кусок попадёт в кадр (зимой на Деке это было 150 мс)
// (с поздней сборкой — после неё: первый кадр меню сам скомпилирует то, что видно)
LATE.add('shaders', () => { try { renderer.compile(scene, cam); } catch (e) { /* — */ } });
LATE.add('freeze', () => CULL.freeze(scene, cam, PROPS));   // город собран: неподвижное — в заморозку и отсечение
GFX.init({ resize });                             // настройки графики: дальность, окна, чёткость (gfx.js)
/* повтор последних 10 с (replay.js, docs/CAREER.md «Повтор»): что ему нужно от игры */
REPLAY.init({
  scene, cam, canvas, Snd, GFX, inHouse, groundH, unview, toast,
  car: () => car,
  speed: () => Math.sqrt(V.vx * V.vx + V.vz * V.vz),
  shake: k => { S.shake = Math.max(S.shake, k); },
  pause: on => setPause(on),
  // можно ли открыть: смена или машина «умирает»; не катсцена, не диалог, не карта, не лист поверх (накладная, обед, итоги)
  canOpen: fromPause => {
    if (!(isPlaying() || S.state === 'dying') || S.state === 'loading' || EXT.paused || FM.open || DLG.isOpen() || FIRST.on() || S.meal) return false;
    if ((STORY.active && STORY.active()) || document.body.classList.contains('story-cut')) return false;
    if (fromPause ? !S.paused : S.paused) return false;
    return fromPause || !padScreen();
  },
  // машины потока и люди рядом: игра прячет их вне своего кадра — в повторе они видны всегда, если записаны
  always: (set, x, z, r2) => {
    for (let i = 0; i < TRAFFIC.length; i++) { const t = TRAFFIC[i], dx = t.x - x, dz = t.z - z; if (dx * dx + dz * dz < r2) set.add(t.mesh); }
    for (let li = 0; li < CULL_FAR_LISTS.length; li++) {
      const L = CULL_FAR_LISTS[li];
      for (let i = 0; i < L.length; i++) { const p = L[i]; if (p.dead || !p.grp) continue; const dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz < r2) set.add(p.grp); }
    }
  },
  // мир встал / пошёл: мотор молчит, руль отпущен, площадке — «не играет»
  freeze: on => {
    for (const k in IN) IN[k] = 0;
    if (on) { Snd.engine(0); joyReset(); Platform.gameplayStop(); } else if (isPlaying()) Platform.gameplayStart();
  },
});
if (LATE.busy()) { try { renderer.compileAsync(scene, cam).catch(() => {}); } catch (e) { /* — */ } }   // остальное, что уже в сцене, — тоже заранее
requestAnimationFrame(frame);
/* поздняя сборка (latebuild.js): очередь — после первых кадров меню (или через 1,5 с, если кадров нет — окно скрыто).
   Выбрал карточку меню (на смену, быстрый заезд, гараж, покататься, находки…) или «сменить профиль», а город ещё
   строится — снова экран загрузки (птица и полоска), остаток — разом, и тогда нажать (клик, Enter, A геймпада —
   всё это click). Имя, настройки, листание — без ожидания. Смена, заезд и профиль и сами достраивают до начала */
if (LATE.busy()) {
  setTimeout(() => LATE.start(), 1500);
  let replay = false;
  const hold = e => {
    if (!LATE.busy() || replay) return;
    const tgt = e.target;
    if (!(tgt && tgt.closest && tgt.closest('.crm-card, .crm-swap'))) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (document.querySelector('.late-wait')) return;   // уже ждём
    const boot = document.createElement('div');
    boot.id = 'boot'; boot.className = 'late-wait';   // тот же экран загрузки (стили #boot — index.html)
    boot.innerHTML = '<img src="./icon.png" alt=""><div class="boot-bar"><i></i></div>';
    document.body.appendChild(boot);
    // кадр — чтобы экран загрузки успел появиться (птица и полоска крутятся и без главного потока)
    requestAnimationFrame(() => setTimeout(() => {
      LATE.flush();
      boot.remove();
      if (tgt.isConnected && typeof tgt.click === 'function') { replay = true; try { tgt.click(); } finally { replay = false; } }
    }, 0));
  };
  addEventListener('click', hold, { capture: true });
  LATE.onDone(() => removeEventListener('click', hold, { capture: true }));
}
LATE.onDone(() => { const B = window.__boot; if (B) { B.full = Math.round(performance.now()); B.late = LATE.T; } });
/* город за меню, пока достраивается, — не в фокусе (delivery.css body.late-haze): что строится, появляется
   за дымкой, а не разом на глазах. Достроился за меню — резкость наводится за 1,4 с; ушли из меню
   (смена, гараж, ждали на экране загрузки) — сразу */
if (LATE.busy()) {
  document.body.classList.add('late-haze');
  LATE.onDone(() => {
    const B = document.body, soft = S.state === 'title' && !S.paused && !document.querySelector('.late-wait');
    if (soft) { B.classList.add('late-clear'); setTimeout(() => B.classList.remove('late-clear'), 1500); }
    B.classList.remove('late-haze');
  });
}

/* отладочная ручка */
/* отладочная ручка — только в dev и с ?debug: в релизе через неё можно было бы накрутить таблицу */
/* песочница (sandbox.html): бесконечное здоровье, нитро, «не глохнет» (noStall читает cars.js) */
const SBX = { god: false, nitro: false, noStall: false };
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) window.__dlv = { inWall, OSK: OSKM, REPLAY: REPLAY.DEBUG, ACH: ACH.DEBUG, YARDS: YARDS.DEBUG, CITYOPEN: CITYOPEN.DEBUG, SC: SC.DEBUG, PG: PG.DEBUG, RL: RL.DEBUG, CHASE, chaseStart, TDEN, trafficWant, ENV, LOCKS, districtLocks, S, V, DEATH, revive, TRAFFIC, DEADENDS: { ...DEADENDS.DEBUG, blocks: e => DEADENDS.blocksExit(DE_API, e) }, PEDS, PEOPLE, PIZZA, PIZZERIAS, PICK_INFO, DIST: DIST.DEBUG, scatterPickups, NITRO_CANS, get PZ_CUR () { return PIZZA; }, NODES, BENCHES, PROPS, SOLIDS, RINGS, YARD_RINGS, PARKINGS, LB, get car () { return car; }, get route () { return routePts; }, CAREER, AUTO, DLG, ZN, ECON, donated, get RINK () { return RINK; }, FUEL_LOG: LM.FUEL_LOG, CULL: CULL.STATS, RW: RW.DEBUG, CULLQ: CULL.Q, GFX: GFX.DEBUG, WIN: WINS.STATS, WINQ: WINS.quality, RAISED, SOLID_GRID, HOUSE_GRID, SMASH, setFullMap, setPause, newOrder, acceptOrder, gameOver, dentCar, boom, sparks, blood, runOver, runOverScoot, SCOOTS, HITS, wreckCar, knockCar, setGate, clearGate,
  // отладка города: посмотреть на карту сверху и проверить геометрию
  CITY, HOUSES, RSEG, scene, renderer, cam, nearestRoad, startPose, THREE,
  // рельеф и шаг цикла: прогнать смену без экрана, когда вкладка скрыта
  groundH, surfaceAt, inBorder, BRIDGES, frame,
  // оплата адреса: лицо клиента и чат Толика
  popPay, CHAT, bossOnDeliver, payMood,
  // Москва: граф, светофоры, зебры, самокатчики, ввод
  EDGES, SIG_GROUPS, ZEBRAS, SCOOTS, TL, IN, touches, lightOf, edgeOf, NAR: NAR.DEBUG, TALK: TALK.DEBUG,
  // песочница: сюжет, карта, сохранения, старт смены, кошелёк, читы
  STORY, STORY_DBG: STORY.DEBUG, MAP, Store, SBX, CARSM: AUTO, startRun, goRun, endShift, wallet, addWallet, hudHearts, marker, updateEnv, humanLod, get SPOTS_N () { return SPOTS.length; },
  DRIVERS, SMOKERS, NITRO_CANS, NOS, RESPECT: RESPECT.DEBUG, RESPECT_API: RESPECT, SURF, surfPlan, PITCHES, ACCIDENTS, spawnAccident, CROWDS, PUB_SPOTS, RECENT, sectorOf, SMASH, VERANDAS, ARCHES, GEN_ENTR, ENV, CLOUDS, PIGEONS, FLOCKS, AMB, INCIDENTS, scare, RIVALS, FOES, THIEF, spawnThief, showMeal, offerSide, CH, pickChoice, slackFor, routeLen, roadPath, FXS, SIGNS, stallCar, Snd, RAMPS, BUILD_MS, BUILD_T, SPOTS, PARTIES, COL_ON_MAP, COLLECT, LOOT, XLIFE, askRevive, addWallet, RQ: RQ.DEBUG, HINTS_API: HINTS };
if (window.__dlv) { window.__dlv.BOARD = BOARD; window.__dlv.Platform = Platform; }   // таблица рекордов Стима (board.js)
if (window.__dlv) window.__dlv.TREES = TREES.DEBUG;   // деревья и кусты: породы, группы во дворах (trees.js)
if (window.__dlv) Object.assign(window.__dlv, { showTitle, CAREERM, renderSettings, closePanel, backToBase });   // меню, настройки — проверки интерфейса в probe; backToBase — «опоздал обратно» (К1)
if (window.__dlv) window.__dlv.CSH = CSH.DEBUG;
if (window.__dlv) window.__dlv.DOOR = DOOR.DEBUG;   // домофон у подъезда: force(mode), solve(), last (doorstep.js)   // тень под машиной (carshadow.js)
if (window.__dlv) window.__dlv.STREAMS = STREAMS.DEBUG;   // речки и пруды: где вода, глубина, сколько чего (streams.js)
if (window.__dlv) window.__dlv.ICE = ICEM.DEBUG;   // лёд: треск, где лёд, сколько секунд до пролома (ice.js)
if (window.__dlv) window.__dlv.WATER = WATER.DEBUG;   // вода: юниформы, уровень, лёд вручную (water.js)
if (window.__dlv) window.__dlv.BEACH = BEACH.DEBUG;   // пляж: место, песок, люди, места под полотенце (beach.js)
if (window.__dlv) Object.assign(window.__dlv, { cam, renderer, scene });   // камера и отрисовка — кадры земли сверху в probe (мерцание стыков, пятна газона)
if (window.__dlv) window.__dlv.crashlog = CL;        // журнал ошибок: entries(), text(), disabled() (docs/CRASHES.md)
if (window.__dlv) window.__dlv.CULLV = CULL.VIEW;      // отсечение по кадру: CULLV.on = false — без него (замеры до/после, cull.js)
if (window.__dlv) Object.assign(window.__dlv, { pinFront, nearClient, PIN });   // пин перед клиентом, кто у клиента лишний (docs/ORDERS.md)
if (window.__dlv) Object.assign(window.__dlv, { PIX: PIX.STATS, CG: CG.STATS, cgState: () => CG.state(car.userData.cg), hurtCar,
  cgLamps: () => CG.lampState(car), EXH: EXH.DEBUG, WIPE: WIPE.STATS, DENT: DENTM.DEBUG, DIRT: DIRT.DEBUG, REAR: REARM.STATS, pizzasInCar, setTrunk });   // фары и фонари (carglass.js), выхлоп (exhaust.js), дворники (wipers.js)   // дымок, стёкла (pixfx.js, carglass.js)
if (window.__dlv) Object.assign(window.__dlv, { BB: BB.DEBUG, PAINT: PAINT.DEBUG, CONS: CONSTR.DEBUG, DARK: DARKN.DEBUG, WASTE: WASTE.DEBUG });   // щиты с рекламой, дома в цвет и муралы (billboards.js, citypaint.js)
if (window.__dlv) Object.defineProperties(window.__dlv, { reprofile: { value: reprofile }, REPROFILE_MS: { get: () => REPROFILE_MS } });   // смена профиля без перезагрузки
if (window.__dlv) Object.assign(window.__dlv, { DIRECTOR: DIRECTOR.DEBUG, HB: HB.DEBUG, FLIRT: ADULT ? FLIRT.DEBUG : null, popBonus, CHAT_PERSON: () => CHAT.person() });   // коневозки, заигрывание (только взрослая)
if (window.__dlv) { window.__dlv.FOREST = FOREST.DEBUG; window.__dlv.LAWN = LAWNP.DEBUG; window.__dlv.PAVE = PAVE.DEBUG; window.__dlv.PZD = PZD.DEBUG; window.__dlv.cam = cam; window.__dlv.RIV = RIVS.DEBUG; }   // ельник и пиццерия-шар (forest.js, pizzadome.js)
if (window.__dlv) window.__dlv.RELIEF = { STATS: RELIEF.STATS, at: RELIEF.reliefAt };   // неровный газон (relief.js)
if (window.__dlv) Object.assign(window.__dlv, { CROWDS, PUB_SPOTS, spawnCrowd, ACCIDENTS, PITCHES });   // компании у подъездов, драки на авариях, футбол — проверка наезда в probe
if (window.__dlv) window.__dlv.RW = RW.DEBUG;   // вид асфальта улиц (roadwear.js)
if (window.__dlv) window.__dlv.LATE = LATE;
if (window.__dlv) window.__dlv.BUS = BUSES.DEBUG;   // автобусы: routes(), buses(), people(), nextStop(i), ST (buses.js)   // поздняя сборка города: busy(), left(), T — мс по кускам (latebuild.js)
if (window.__dlv) window.__dlv.EDL = EDL.DEBUG;   // правки из редактора и его камера (editlayer.js)
if (window.__dlv) { window.__dlv.SL = SL.DEBUG; window.__dlv.LAMP_SPOTS = LAMP_SPOTS; window.__dlv.smashHit = smashHit; window.__dlv.CARL = CARL.DEBUG; }   // фонари и огни машины
// ?mapcheck: сводка проблем карты, столбики над ними, «]» — к следующей (mapworks.js)
if (MAPCHECK) MAPW.debug(MAPFIX, MAPW_API || (MAPW_API = mapApi()));
