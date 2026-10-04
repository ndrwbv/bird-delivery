/* Песочница интерфейса: все диалоги игры — выбрать любой и прогнать с ответами (dialog.js, большая
   голова и печатающийся текст). Язык — переключатель панели (рамка перезагружается).

   Откуда реплики:
     сюжет бабы Зины   — story.js STORIES (сценарий главы: только 'say', с условиями if / adult / when)
     главы героев      — herostories.js HERO_STORIES, лица — heroes.js person(id)
     герои при встрече — heroes.js DEFS: intro, lines, adult / kids (в игре — облачко над головой)
     директор          — orders.config.js BOSS (два, три… заказа сразу)
     поручения, развоз — orders.config.js SIDE_ORDERS, STAFF_RIDE
   Копии текста из кода (поменял там — поправь тут):
     бандиты           — world.js gangTalk
     мафиози           — mafia.js (в игре — облачко, не диалог)
     Дядя Женя         — cars.js offer (внешность — buildZhenya)
   Ответ на каждую реплику (принял / отказался / не успел) — в журнал панели. */
import { STORIES, PERSON, COLOR as STORY_COLOR } from '../../game/story.js';
import { HERO_STORIES } from '../../game/herostories.js';
import * as HEROES from '../../game/heroes.js';
import { BOSS, SIDE_ORDERS, STAFF_RIDE, ORDER_TYPES } from '../../game/orders.config.js';
import { GANG, BREAK, repairQuote } from '../../game/econ.js';

const isOpt = a => a && typeof a === 'object' && !Array.isArray(a);
const safe = (f, d) => { try { return f(); } catch (e) { return d; } };

export default function dialogScreens (ctx) {
  const { A, ADULT, t, money, makePerson, DLG, log } = ctx;
  const courier = () => PERSON.courier();
  const E = [];                                   // { id, group, name, title?, lines(o) → [реплика] }

  /* сценарий главы → реплики: только 'say', по условию главы, версии и машине — как story.js run */
  const scriptLines = (c, host, color, o) => {
    const out = [];
    for (const step of c.script || []) {
      if (step[0] !== 'say') continue;
      const opt = step.slice(1).find(isOpt) || {};
      if (opt.if && opt.if !== o.cond) continue;
      if (opt.adult === true && !ADULT) continue;
      if (opt.adult === false && ADULT) continue;
      if (typeof opt.when === 'function' && !safe(opt.when, false)) continue;
      const who = step[1] === 'courier' ? courier() : host;
      const vars = typeof opt.vars === 'function' ? safe(opt.vars, {}) : opt.vars;
      out.push({ person: who, name: who.name, text: t(step[2], vars), color, fillers: false, mood: opt.mood || 'calm', cps: 42 });
    }
    return out;
  };
  const kidsName = c => (!ADULT && c.kids && c.kids.name) || c.name;

  // ── сюжет: баба Зина (и любые истории story.js, кроме героев) ──
  for (const s of STORIES) {
    s.chapters.forEach((c, i) => E.push({
      id: 'story:' + s.id + ':' + i, group: 'Сюжет: ' + (s.id === 'zina' ? 'баба Зина' : s.id),
      name: 'глава ' + (i + 1) + ' «' + c.name + '»',
      title: () => t('{who} · глава {n} из {m}', { who: PERSON.host(s.id).name, n: i + 1, m: s.chapters.length }) + ' · «' + t(kidsName(c)) + '»',
      lines: o => scriptLines(c, PERSON.host(s.id), STORY_COLOR, o),
    }));
  }
  // ── главы героев ──
  for (const H of HERO_STORIES) {
    const def = HEROES.DEFS.find(d => d.id === H.hero);
    if (!def) continue;
    H.chapters.forEach((c, i) => E.push({
      id: 'hero:' + H.hero + ':' + i, group: 'Главы героев: ' + def.name,
      name: 'глава ' + (i + 1) + ' «' + c.name + '»' + (c.cond ? ' · ' + c.cond : ''),
      title: () => t('{who} · глава {n} из {m}', { who: t(def.name), n: i + 1, m: H.chapters.length }) + ' · «' + t(kidsName(c)) + '»' +
        (c.cond ? ' · ' + c.cond : ''),
      lines: o => scriptLines(c, HEROES.person(H.hero), STORY_COLOR, o),
    }));
  }
  // ── герои при встрече: знакомство и фразы (в игре — облачко) ──
  for (const def of HEROES.DEFS) {
    E.push({
      id: 'meet:' + def.id, group: 'Герои при встрече', name: def.name + ': знакомство и все фразы',
      lines: () => {
        const p = HEROES.person(def.id), one = s => ({ person: p, name: t(def.name), text: t(s), color: def.color, fillers: false });
        const intro = !ADULT && def.introKids ? def.introKids : def.intro;
        return [intro, ...(def.lines || []), ...((ADULT ? def.adult : def.kids) || [])].filter(Boolean).map(one);
      },
    });
  }
  // ── директор ──
  const bossP = () => makePerson({ seed: BOSS.seed, first: t(BOSS.first), last: t(BOSS.last), fem: !!BOSS.fem });
  for (const k of Object.keys(BOSS.lines)) {
    E.push({
      id: 'boss:' + k, group: 'Директор Палыч', name: 'сборный: ' + k + ' заказа сразу',
      lines: () => { const p = bossP(); return [{ person: p, name: p.name + ' · ' + t(BOSS.role), text: t(BOSS.lines[k]), accept: t(BOSS.ok), mood: 'calm', fillers: false, color: ORDER_TYPES.pizza.color }]; },
    });
  }
  // ── поручения ──
  SIDE_ORDERS.forEach((s, i) => E.push({
    id: 'side:' + s.id, group: 'Поручения клиентов', name: s.id + (s.adult ? ' (взрослая)' : s.kids ? ' (детская)' : ''),
    lines: () => {
      const p = makePerson({ seed: 9100 + i * 13 }), pay = Math.round(((s.pay ? (s.pay[0] + s.pay[1]) / 2 : 1500)) / 10) * 10;
      return [{ person: p, name: p.first || p.name.split(/\s+/)[0], text: t(s.ask) + ' (+' + money(pay) + ')', accept: t(s.accept), decline: t(s.decline),
        mood: s.mood || 'calm', color: ORDER_TYPES.side.color, timer: s.timer || 8, timeoutText: t(s.timeout || 'ну лан ((') }];
    },
  }));
  // ── развоз смены ──
  E.push({
    id: 'staff', group: 'Поручения клиентов', name: 'развоз смены (работники пиццерии)',
    lines: () => {
      const crew = [makePerson({ seed: 7001 }), makePerson({ seed: 7002 }), makePerson({ seed: 7003 })];
      return [{ person: crew[0], name: crew[0].first + ' · ' + t('пиццерия'), text: t(STAFF_RIDE.ask), accept: t(STAFF_RIDE.accept), decline: t(STAFF_RIDE.decline), mood: 'shy', color: ORDER_TYPES.staff.color,
        after: r => (r === true ? (STAFF_RIDE.lines || []).map((l, j) => ({ person: crew[j % 3], name: crew[j % 3].first, text: t(l), fillers: false, color: ORDER_TYPES.staff.color })) : []) }];
    },
  });
  // ── бандиты: копия world.js gangTalk ──
  E.push({
    id: 'gang', group: 'Бандиты и мафиози', name: 'гопники у адреса: мзда',
    lines: o => {
      const p = makePerson({ seed: 6660 }), sum = money(Math.round((GANG.BRIBE_BASE + GANG.BRIBE_SHARE * (+o.shiftMoney || 0)) / 10) * 10);
      const text = ADULT ? t('Слышь, курьер. Это наш район. Хочешь тут ездить — плати. {money}, и катайся спокойно.', { money: sum })
        : t('Эй, курьер! Это наш двор. Проезд платный — {money}. Заплатишь — катайся.', { money: sum });
      const say = s => [{ person: p, name: ADULT ? t('Гопник') : t('Пацан со двора'), text: s, fillers: false, color: '#d9342c' }];
      return [{ person: p, name: ADULT ? t('Гопник') : t('Пацан со двора'), text, mood: 'calm', color: '#d9342c',
        accept: t('заплатить {money}', { money: sum }), decline: t('не буду'), timer: 9,
        timeoutText: ADULT ? t('Молчишь? Ну, сам виноват') : t('Молчишь? Ну держись!'),
        after: r => (r === true ? say(ADULT ? t('Другое дело. Катайся.') : t('Во, нормально. Езжай.')) : say(ADULT ? t('Сам напросился!') : t('Ща покачаем!'))) }];
    },
  });
  // ── мафиози: копия mafia.js (в игре — облачко над ним) ──
  E.push({
    id: 'mafia', group: 'Бандиты и мафиози', name: 'мафиози у адреса (облачка по очереди)',
    lines: () => {
      const p = makePerson({ seed: 0x3af1a, fem: false }), one = s => ({ person: p, name: '', text: s, fillers: false, color: '#1b1b20' });
      return [ADULT ? t('пиздуй отсюда, а то порешу') : t('вали отсюда, а то пожалеешь'), ADULT ? t('я предупреждал') : t('ну, держи!'),
        t('и не возвращайся'), ADULT ? t('ты чё, бессмертный?') : t('ах ты так?!')].map(one);
    },
  });
  // ── Дядя Женя: копия cars.js offer ──
  const zhenya = () => {
    const p = makePerson({ seed: 0x2E1A, fem: false, fat: true });
    Object.assign(p.look, { age: 'adult', beard: 'mustache', hair: 'receding', head: 'cap', headC: '#3b4a5a', capBack: false,
      glasses: 'none', shape: 'chubby', hairC: '#5a3c26', browC: '#4a3020', mouth: 'smile', bg: '#c6d8a0', pack: null, top: 'tee',
      skin: '#eab993', stubble: true, nose: 'big', brows: 'thick', shirt: '#34507a', pants: '#2f4870', blush: true, freckles: false, mole: -1 });
    p.name = t('Дядя Женя');
    return p;
  };
  const ceilWord = r => (r >= 80 ? '' : r >= 60 ? ' ' + t('ресурс уже подсел — с каждым ремонтом держит хуже.')
    : r >= 40 ? ' ' + t('ресурс уже не тот, сынок, скоро на металлолом.') : ' ' + t('я её чиню, а она сыпется. продавай, пока берут, и бери другую.'));
  const meters = e => [
    { name: t('мотор'), v: Math.round(e.c) + ' %', p: e.c / 100, color: e.c >= 70 ? '#7fc36a' : e.c >= 40 ? '#ff9a3c' : '#e5484d' },
    { name: t('ресурс'), v: Math.round(e.r) + ' %', p: e.r / 100, color: '#6fd3ff' },
  ];
  const zj = (o, extra) => ({ person: zhenya(), name: t('Дядя Женя'), color: '#6f8a3a', ...extra });
  const eng = o => ({ c: Math.max(0, Math.min(100, +o.motor || 0)), r: Math.max(0, Math.min(100, +o.res || 0)) });
  E.push({ id: 'zhenya:hello', group: 'Дядя Женя (гараж)', name: 'первая встреча',
    lines: o => [zj(o, { text: t('о, новенький! я Дядя Женя. тут я чиню: заехал, встал — подшаманю. а тачки купить и прокачать — это в гараже в меню, там всё покажу'), accept: t('понял') })] });
  E.push({ id: 'zhenya:offer', group: 'Дядя Женя (гараж)', name: 'ремонт: по мотору, ресурсу и кошельку',
    lines: o => {
      const e = eng(o), q = repairQuote(e.c, e.r), pc = n => String(Math.round(n));
      if (q.pct < BREAK.REPAIR_MIN_PCT) {
        return [zj(o, { meters: meters(e), accept: t('ну ок'), text: e.r >= 80 ? t('о, здорово. машина как часы — нечего тут крутить. езжай давай')
          : t('мотор {c} % — больше из него не выжму, ресурс {r} %.', { c: pc(e.c), r: pc(e.r) }) + ceilWord(e.r) })];
      }
      if ((+o.wallet || 0) < q.price) {
        return [zj(o, { meters: meters(e), accept: t('ладно'), text: t('ну чё, опять стучит? мотор {c} %, подтяну до {r} % за {money}, но у тебя столько нет. заезжай, как заработаешь', { c: pc(e.c), r: pc(e.r), money: money(q.price) }) })];
      }
      const now = { c: e.r, r: Math.max(0, e.r - q.drop) };
      return [zj(o, { mood: 'calm', meters: meters(e), accept: t('давай, Дядь Жень'), decline: t('не, потом'),
        text: t('ну чё, опять стучит? мотор {c} %, подтяну до {r} % за {money}.', { c: pc(e.c), r: pc(e.r), money: money(q.price) }) + ceilWord(e.r),
        after: r => (r !== true ? [] : [zj(o, { meters: meters(now), accept: t('спасибо!'),
          text: (now.r >= 90 ? t('во, другое дело. мотор {c} %, езжай аккуратней', { c: pc(now.c) })
            : t('ну вот, мотор {c} %. а ресурс теперь {r} % — как новая уже не будет', { c: pc(now.c), r: pc(now.r) })) + (now.r < 60 ? ceilWord(now.r) : '') })]) })];
    } });
  // ── проверка вёрстки: длинная реплика, длинное имя, мычание и запинки ──
  E.push({
    id: 'test:long', group: 'Проверка вёрстки', name: 'длинная реплика и длинное имя',
    lines: () => {
      const p = makePerson({ seed: 4242 }), d = HEROES.DEFS;
      const long = [d[0].lines[0], d[1].lines[0], d[2].lines[0], d[3].lines[0], d[4].lines[0]].filter(Boolean).map(s => t(s)).join(' ');
      return [{ person: p, name: p.name + ' ' + p.name + ' · ' + t(BOSS.role), text: long, accept: t('принять'), decline: t('не буду'), timer: 12, fillers: false }];
    },
  });
  for (const mood of ['nervous', 'drunk', 'shy']) {
    E.push({
      id: 'test:mood:' + mood, group: 'Проверка вёрстки', name: 'мычит и запинается: ' + mood,
      lines: () => { const p = makePerson({ seed: 4300 + mood.length }); return [{ person: p, name: p.first, text: t(SIDE_ORDERS[1].ask), mood, accept: t(SIDE_ORDERS[1].accept), decline: t(SIDE_ORDERS[1].decline) }]; },
    });
  }

  const byId = new Map(E.map(e => [e.id, e]));
  const screen = {
    id: 'dialogs', group: 'Диалоги', name: 'все диалоги игры', auto: false,
    note: 'Выбери диалог и «показать»: реплики идут по очереди, отвечай кнопками, пробелом, Esc — ответы в журнале. Повторить — «показать» ещё раз.',
    knobs: [
      { k: 'dialog', label: 'диалог', type: 'sel', def: E[0] ? E[0].id : '', opts: E.map(e => [e.id, e.name, e.group]) },
      { k: 'cond', label: 'условие главы героя (успел, не разбил, заехал)', type: 'sel', def: 'ok', opts: [['ok', 'выполнено'], ['bad', 'провалено']] },
      { k: 'car', label: 'на чём приехал (главы Жеки)', type: 'sel', def: 'home', opts: [['home', 'Семёрка — родная'], ['china', 'Белджик — китайская'], ['both', 'Чери-Мери — китайская и жёлтая'], ['yellow', 'жёлтая Семёрка'], ['other', 'Шеви Круиз — другая']] },
      { k: 'shiftMoney', label: 'бандиты: заработано за смену, ₽', type: 'num', def: 20000, min: 0, max: 300000, step: 1000 },
      { k: 'motor', label: 'Дядя Женя: мотор, %', type: 'num', def: 55, min: 0, max: 100, step: 5 },
      { k: 'res', label: 'Дядя Женя: ресурс, %', type: 'num', def: 85, min: 0, max: 100, step: 5 },
      { k: 'wallet', label: 'Дядя Женя: в кошельке, ₽', type: 'num', def: 20000, min: 0, max: 500000, step: 1000 },
      { k: 'killed', label: 'директор: сбито за карьеру', type: 'num', def: 3, min: 0, max: 500, step: 1 },
      { k: 'fast', label: 'печатать быстро', type: 'bool', def: false },
    ],
    async show (o, tok) {
      const e = byId.get(o.dialog);
      if (!e) { log('нет диалога ' + o.dialog, 'err'); return; }
      ctx.setCar(o.car);
      const lines = e.lines(o);
      log('▶ ' + e.group + ' · ' + e.name + (e.title ? ' — ' + e.title() : '') + ' · реплик: ' + lines.length);
      run(lines, o, tok);
    },
  };

  async function run (lines, o, tok) {
    for (let i = 0; i < lines.length; i++) {
      if (tok.dead) return;
      const L = lines[i];
      const r = await DLG.say(o.fast ? { ...L, cps: 400 } : L);
      if (tok.dead) return;
      const two = !!L.decline;
      log((i + 1) + '. ' + (L.name || '—') + ': ' + (r === true ? (two ? 'принял' : 'дальше') : r === false ? 'отказался' : 'не ответил / пропустил'));
      if (L.after) { const more = L.after(r) || []; if (more.length) lines.splice(i + 1, 0, ...more); }
    }
    log('■ диалог кончился');
  }

  return [screen];
}
