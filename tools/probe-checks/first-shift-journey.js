/* Полная первая смена №0п124: чистый запуск, настоящая кнопка меню, езда физикой,
   домофон/обучение/лестница/диалог через игровой ввод. Без tp, ORD.force, DOOR.solve и записи прогресса.
   Долгая приёмка вручную, не общий check:
   npm run probe -- --fresh --mode=steam --size=deck --seed=7 --q='gfx=high&gfxdev=deck' --timeout=1200 --eval=tools/probe-checks/first-shift-journey.js */
const require = (yes, message) => { if (!yes) throw new Error(message); };
const visible = el => !!el && !el.hidden && !el.closest('[hidden]') && el.getBoundingClientRect().width > 0;
const click = selector => { const el = [...document.querySelectorAll(selector)].find(visible); if (el) { el.click(); return true; } return false; };
const key = (code, type = 'keydown') => dispatchEvent(new KeyboardEvent(type, { code, key: code.startsWith('Digit') ? code.slice(5) : code, bubbles: true, cancelable: true }));
const tap = code => { key(code); key(code, 'keyup'); };
require((+d.Store.get('dlv-shifts', 0) || 0) === 0 && (+d.Store.get('dlv-msk-xp', 0) || 0) === 0, 'Проверка требует чистую карьеру');
if (visible(document.querySelector('#crm-name'))) {
  const inp = document.querySelector('#crm-nin'); inp.value = 'Женя'; inp.dispatchEvent(new Event('input', { bubbles: true }));
  click('#crm-name .crm-nok');
}
require(await until(() => visible(document.querySelector('#cr-menu [data-a="go"]')), 15000), 'Нет кнопки начала смены');
click('#cr-menu [data-a="go"]');
require(await until(() => d.CAREERM.shiftOn() && d.S.order, 15000), 'Кнопка меню не начала первую смену');
require(!d.S.order.ord?.story, 'Первым выдан сюжетный финал');
const start = { x: d.V.x, z: d.V.z, order: d.S.orders, tut: !!d.S.order.tut, addr: d.S.order.stops[0]?.addr };
// Виртуальный стик используется только для управляемого подъёма по настоящим ступеням.
const oldPads = navigator.getGamepads, gp = { id: 'probe first-shift input', index: 0, connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
navigator.getGamepads = () => [gp];
const oldSolve = d.DOOR.solve;
let forbidden = 0;
d.DOOR.solve = () => { forbidden++; return false; };
const orders = [], seen = new Set(), stages = new Set(), coach = new Set();
let stairBox = null, route = [], routeAt = 0, finalSeen = false, finalPaid = false, lastLog = Date.now(), pendingDial = null;
const point = (x, z, height) => ({ x, z, height });
const steerTo = (st, p) => {
  const dx = p.x - st.fp.x, dz = p.z - st.fp.z, len = Math.hypot(dx, dz), yaw = st.fp.heading;
  if (len < 0.12 && Math.abs(p.height - st.fp.height) < 0.24) { gp.axes[0] = gp.axes[1] = 0; return true; }
  const ux = dx / (len || 1), uz = dz / (len || 1), speed = Math.min(1, Math.max(0.35, len * 1.5));
  gp.axes[0] = (-Math.cos(yaw) * ux + Math.sin(yaw) * uz) * speed;
  gp.axes[1] = -(Math.sin(yaw) * ux + Math.cos(yaw) * uz) * speed;
  return false;
};
const born = Date.now();
try {
  while (Date.now() - born < 1100000 && d.S.state !== 'over') {
    const order = d.S.order, story = order?.ord?.story;
    if (order && !seen.has(order)) {
      seen.add(order); orders.push({ n: d.S.orders, story: story?.storyId || '', stops: order.stops.length, type: order.ord?.type, at: +((Date.now() - born) / 1000).toFixed(1) });
      require(!finalSeen || story?.storyId === 'gennady', 'После Геннадия появился новый обычный заказ');
      require(!order.ord?.bundle, 'Первая смена перешла к нескольким адресам');
      if (story?.storyId === 'gennady') { require(!finalSeen, 'Финальный Геннадий выдан дважды'); finalSeen = true; }
    }
    if (d.STORY.progress().gennady?.ch) finalPaid = true;
    require((+d.Store.get('dlv-boss', 0) || 0) === 0, 'Первая смена записала рост нагрузки');
    const doorOn = d.DOOR.on();
    if (doorOn) autopilot(false); else autopilot(true);
    gp.axes[0] = gp.axes[1] = 0;
    const dc = [...document.querySelectorAll('.dc')].find(visible);
    if (dc) {
      coach.add(dc.querySelector('.dc-txt')?.textContent || '');
      click('.dc .dc-next, .dc .dc-go');
    } else if (visible(document.querySelector('.gt-next'))) click('.gt-next');
    else if (doorOn) {
      const sx = document.querySelector('.sx'), st = sx?.__st?.();
      if (st) {
        stages.add('stairs:' + st.phase + ':' + (st.scene?.stage || ''));
        if (st.phase === 'play' && story?.storyId === 'gennady' && st.fp) {
          if (stairBox !== sx) {
            stairBox = sx; route = []; routeAt = 0;
            for (let f = 0; f < st.floor - 1; f++) route.push(point(-0.32, 0.78, f * 2.8), point(3.4, 0.78, f * 2.8 + 1.4),
              point(3.4, -0.86, f * 2.8 + 1.4), point(-0.32, -0.86, (f + 1) * 2.8), point(-0.32, -0.05, (f + 1) * 2.8));
            const x = sx.__v3.doorAt(st.want), y = (st.floor - 1) * 2.8;
            route.push(point(x, -0.05, y), point(x, -0.8, y));
          }
          if (routeAt < route.length) { if (steerTo(st, route[routeAt])) routeAt++; }
          else tap('Enter');
        } else if (st.phase === 'play' && !story) click('.sx .mk-self');
        else if (st.phase === 'gop') tap('KeyY');
        else if (st.phase === 'end' && !d.DLG.isOpen()) tap('Enter');
      } else if (d.DOOR.doorState()) {
        const ds = d.DOOR.doorState();
        if (ds?.phase === 'play') {
          if (ds.mode === 'broken') tap('Space');
          else if (pendingDial !== document.querySelector('.dg')) {
            pendingDial = document.querySelector('.dg'); tap('Backspace');
            for (const n of String(ds.flat)) tap('Digit' + n);
            tap('Enter');
          }
        }
      } else if (d.DOOR.mode === 'talk') click('.tk button:not([disabled])');
      // Реплики у двери и выбор пиццы — настоящие кнопки общего диалога.
      if (d.DLG.isOpen()) {
        if (!click('#dlg .dlg-btns.on .dlg-no, #dlg .dlg-btns.on .dlg-yes')) click('#dlg .dlg-bubble');
      }
    }
    if (Date.now() - lastLog > 30000) {
      lastLog = Date.now(); console.info('journey: ' + JSON.stringify({ stage: 'journey', secs: Math.round((Date.now() - born) / 1000), state: d.S.state, orders,
        pos: [Math.round(d.V.x), Math.round(d.V.z)], hp: d.S.hp, finalSeen, finalPaid, door: d.DOOR.mode, stairs: d.DOOR.stairsState()?.fp, routeAt }));
    }
    await wait(100);
  }
} finally {
  autopilot(false); gp.axes.fill(0); navigator.getGamepads = oldPads; d.DOOR.solve = oldSolve;
}
require(d.S.state === 'over' && finalSeen && finalPaid, 'Полный маршрут не завершился: ' + JSON.stringify({ state: d.S.state, finalSeen, finalPaid, orders, pos: [d.V.x, d.V.z], door: d.DOOR.mode, stairs: d.DOOR.stairsState(), routeAt }));
require(forbidden === 0, 'Автопилот пытался использовать отладочное решение мини-игры');
require(orders.at(-1)?.story === 'gennady' && orders.filter(o => o.story === 'gennady').length === 1, 'Геннадий не единственный последний заказ');
require((+d.Store.get('dlv-shifts', 0) || 0) === 1, 'Не сохранён конец первой смены');
return { ok: true, start, orders, finalSeen, finalPaid, delivered: d.S.delivered, money: d.S.money,
  secs: Math.round((Date.now() - born) / 1000), coachSteps: coach.size, stages: [...stages], forbidden };
