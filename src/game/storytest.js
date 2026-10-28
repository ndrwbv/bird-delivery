/* Просмотр сюжетных доставок без поездки: ?storytest или переключатель в главном меню. */
import './storytest.css';
import { t } from '../i18n/index.js';
import * as STORY from './story.js';
import * as ORD from './orders.js';
import * as DOOR from './doorstep.js';
import * as FPD from './fpdeliver.js';
import * as DLG from './dialog.js';
import * as DOOR2D from './minigames/door2d.js';
import * as S3 from './minigames/stairs3d.js';
import STAIRS from './minigames/stairs.js';
import { pad as PAD } from '../input/gamepad.js';

let A = null, root = null, list = null, status = null, nextButton = null, listKey = '';
let menuShift = null, pendingStart = null, panelChanged = null;
const enabled = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('storytest');
const doorPreviewEnabled = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('doorpreview');
const stairsPreviewEnabled = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('stairspreview');
const gameReady = () => A && ['brief', 'loading', 'drive', 'back', 'handover', 'side'].includes(A.S.state);
export const panelRoot = () => root && root.id === 'storytest' && !root.hidden && root.classList.contains('open') ? root : null;
export const panelOpen = () => !!panelRoot();
export function onPanelChange (fn) { panelChanged = fn; }
export function setMenuShift (fn) { menuShift = fn; }
const signalPanel = () => { if (panelChanged) panelChanged(panelOpen()); };

let previewRunning = false;
async function openDoorPreview () {
  if (previewRunning || DLG.isOpen()) return;
  const story = STORY.STORIES.find(s => s.id === 'gennady');
  if (!story?.portrait?.manifest) return;
  previewRunning = true;
  if (root) root.hidden = true;
  document.body.classList.add('door-preview-active');
  let actor = null, world = null, worldBox = null, raf = 0;
  try {
    worldBox = document.createElement('div');
    worldBox.className = 'door-preview-world';
    (document.getElementById('game') || document.body).appendChild(worldBox);
    const plan = { lv: 5, per: 4, first: 1, floor: 5, door: 1 };
    world = S3.create(worldBox, { forceOwn: true, firstPerson: true, plan, look: 'shabby', seed: 2710, t,
      ADULT: !!A.ADULT, boxes: 1 });
    const st = { y: 4, v: 0, walk: world.standOff(1), door: 1, phase: 'end', bounce: 0, puff: 0, sideT: 0 };
    const doors = new Map([[18, { open: 0 }]]);
    world.scene.start({ portrait: true });
    actor = await DOOR2D.open(story.portrait.manifest, () => false, world.scene);
    let last = performance.now(), elapsed = 0, closingAt = -1;
    const blackout = document.createElement('div'); blackout.className = 'door-preview-black'; worldBox.appendChild(blackout);
    let reveal = null;
    const revealed = new Promise(resolve => { reveal = resolve; });
    const frame = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now; elapsed += dt;
      doors.get(18).open = closingAt < 0 ? S3.cinematicDoor(elapsed) : Math.max(0, 1 - Math.pow(Math.min(1, (elapsed - closingAt) / 0.8), 3));
      if (closingAt >= 0) blackout.style.opacity = String(Math.max(0, Math.min(1, ((elapsed - closingAt) / 0.8 - 0.78) / 0.22)));
      world.scene.light(S3.cinematicLight(elapsed));
      world.frame(st, dt, { doors, gop: false, t: elapsed }); world.render();
      if (elapsed >= 5.0 && reveal) { reveal(); reveal = null; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    await revealed;
    const lineText = line => line.amountLine ? t(line.text).replace('{amount}', '1 000 ₽') : t(!A.ADULT && line.childText ? line.childText : line.text);
    const nextText = from => {
      const next = story.chapters[0].dialogue.slice(from + 1).find(line => !line.omit2d);
      return next ? lineText(next) : t('Закончить разговор');
    };
    for (const [lineIndex, line] of story.chapters[0].dialogue.entries()) {
      if (line.omit2d) continue;
      let retry;
      do {
        retry = false;
        const choices = line.choices2d || line.choices;
        actor.line(line.emotion || 'idle');
        const answer = await DLG.say({ compact: true, door2d: true, canonicalName: true, fillers: false,
          courierLine: line.speaker === 'courier', name: line.speaker === 'courier' ? t('Женя') : t(story.name),
          person: null,
          text: lineText(line),
          accept: choices ? t(choices[0].text) : nextText(lineIndex),
          decline: choices?.[1] ? t(choices[1].text) : undefined, stack: false,
          onShow: () => actor.talk(line.speaker === 'gennady'), onTyped: () => actor.talk(false) });
        actor.talk(false);
        if (answer === null) return;
        if (line.retryOnFirst && answer === true) {
          actor.line('angry');
          const correction = await DLG.say({ compact: true, door2d: true, canonicalName: true, fillers: false,
            name: t(story.name), person: null, text: t(line.wrongReply), accept: lineText(line),
            onShow: () => actor.talk(true), onTyped: () => actor.talk(false) });
          actor.talk(false);
          if (correction === null) return;
          retry = true;
        }
      } while (retry);
    }
    closingAt = elapsed;
    await new Promise(resolve => setTimeout(resolve, 900));
  } catch (e) {
    console.warn('[doorpreview] scene', e);
    if (status) status.textContent = t('Не удалось открыть сцену у двери');
  } finally {
    if (actor) actor.close();
    if (raf) cancelAnimationFrame(raf);
    if (world) world.dispose();
    if (worldBox) worldBox.remove();
    previewRunning = false;
    document.body.classList.remove('door-preview-active');
    if (root) root.hidden = false;
  }
}

function openStairsPreview () {
  if (previewRunning || DLG.isOpen()) return;
  const story = STORY.STORIES.find(s => s.id === 'gennady');
  if (!story?.portrait?.manifest) return;
  previewRunning = true;
  if (root) root.hidden = true;
  document.body.classList.add('door-preview-active');
  const worldBox = document.createElement('div');
  worldBox.className = 'door-preview-world';
  (document.getElementById('game') || document.body).appendChild(worldBox);
  const person = STORY.PERSON.host('gennady');
  const scenario = {
    name: t(story.name), portrait: story.portrait, person, courier: STORY.PERSON.courier(),
    lines: story.chapters[0].dialogue.map(line => ({
      speaker: line.speaker === 'courier' ? t('Евгений') : t(story.name),
      text: t(!A.ADULT && line.childText ? line.childText : line.text),
      amountLine: !!line.amountLine,
      emotion: line.emotion || 'idle', retryOnFirst: !!line.retryOnFirst,
      wrongReply: line.wrongReply ? t(line.wrongReply) : null,
      choices: line.choices ? line.choices.map(choice => ({ text: t(choice.text) })) : null,
    })),
  };
  let stop = null, padCallback = null, padRaf = 0;
  const padFrame = () => { if (!previewRunning) return; if (padCallback) padCallback(PAD); padRaf = requestAnimationFrame(padFrame); };
  const finish = () => {
    if (!previewRunning) return;
    previewRunning = false;
    if (padRaf) cancelAnimationFrame(padRaf);
    if (stop) { stop(); stop = null; }
    worldBox.remove();
    document.body.classList.remove('door-preview-active');
    if (root) root.hidden = false;
  };
  try {
    stop = STAIRS.mount(worldBox, { forceOwn: true, lv: 5, floor: 5, per: 4, entr: 1, door: 1,
      look: 'shabby', seed: 2710, addr: 'Ленинградская, 21', who: t(story.name), person, scenario,
      clockS: 120, payment: '1 000 ₽', boxes: 1 }, { t, ADULT: !!A.ADULT, sfx: () => {}, hold: () => {},
      paused: () => false, setPad: fn => { padCallback = fn; }, done: () => requestAnimationFrame(finish) });
    padRaf = requestAnimationFrame(padFrame);
    const exit = document.createElement('button');
    exit.type = 'button'; exit.className = 'door-preview-exit'; exit.textContent = t('К выбору');
    exit.addEventListener('click', finish); worldBox.appendChild(exit);
  } catch (e) {
    console.warn('[stairspreview] scene', e);
    finish();
    if (status) status.textContent = t('Не удалось открыть подъём');
  }
}

function initDoorPreview () {
  root = document.createElement('aside'); root.id = 'doorpreview';
  const doorButton = document.createElement('button'); doorButton.type = 'button';
  doorButton.textContent = t('Сцена у двери');
  doorButton.addEventListener('click', openDoorPreview);
  const stairsButton = document.createElement('button'); stairsButton.type = 'button';
  stairsButton.textContent = t('Подъём с первого этажа');
  stairsButton.addEventListener('click', openStairsPreview);
  status = document.createElement('p');
  status.textContent = t('Выбери этап. Просмотр не сохраняет заказ.');
  root.append(doorButton, stairsButton, status);
  (document.getElementById('game') || document.body).appendChild(root);
  requestAnimationFrame(stairsPreviewEnabled() ? openStairsPreview : openDoorPreview);
}

function phase () {
  if (pendingStart) return t('Запускаем сюжетную смену');
  if (!A || A.S.state === 'title') return t('Выбери главу — смена начнётся сама');
  if (DLG.isOpen()) return t('Реплика у двери');
  if (DOOR.on()) return DOOR.DEBUG.mode === 'dial' ? t('Домофон') : t('Подъезд и квартира');
  if (FPD.busy()) return t('Курьер выходит из машины и идёт к домофону');
  if (A.S.state === 'loading') return t('Пицца загружается в машину');
  if (A.S.state === 'brief') return t('Заказ готов');
  if (A.S.state === 'drive' && A.S.target) return t('Путь к дому');
  if (A.S.state === 'back') return t('Доставка завершена');
  return t('Выбери сюжетную главу');
}

function render () {
  if (!root) return;
  if (pendingStart && gameReady() && A.S.state !== 'loading') {
    const { id, chapter } = pendingStart;
    pendingStart = null;
    start(id, chapter);
    return;
  }
  status.textContent = phase();
  nextButton.disabled = !!pendingStart || !gameReady() || FPD.busy() || !(DLG.isOpen() || DOOR.on()
    || A.S.state === 'brief' || (A.S.state === 'drive' && A.S.target && A.S.order?.ord?.story));
  nextButton.textContent = DLG.isOpen() ? t('Следующая реплика') : DOOR.on() ? t('Пройти этот этап')
    : A.S.state === 'brief' ? t('Загрузить пиццу') : t('К дому без поездки');
  const locked = !!pendingStart || !(gameReady() || (A?.S.state === 'title' && menuShift)) || DOOR.on() || FPD.busy() || DLG.isOpen();
  const key = STORY.STORIES.map(s => s.id + ':' + s.chapters.length).join('|') + ':' + locked;
  if (key === listKey) return;
  listKey = key;
  list.replaceChildren();
  for (const story of STORY.STORIES) story.chapters.forEach((chapter, i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'storytest-chapter';
    if (i === 0 && story === STORY.STORIES[0]) button.setAttribute('data-pad-main', '');
    button.textContent = t(story.name) + ' · ' + t(chapter.name || String(i + 1));
    button.disabled = locked;
    button.addEventListener('click', () => start(story.id, i));
    list.appendChild(button);
  });
}

function start (id, chapter) {
  const spec = STORY.orderFor(id, chapter);
  if (!spec) { if (status) status.textContent = t('Адрес этой главы пока недоступен'); return; }
  if (A?.S.state === 'title' && menuShift) {
    if (pendingStart) return;
    pendingStart = { id, chapter };
    try { menuShift(); } catch (e) { pendingStart = null; console.warn('[storytest] start shift', e); }
    render();
    return;
  }
  if (!gameReady()) return;
  A.setPause(false);
  const order = ORD.force(spec);
  if (order) A.acceptOrder();
  render();
}

function advance () {
  if (!gameReady()) return;
  A.setPause(false);
  if (DLG.isOpen()) { document.querySelector('#dlg .dlg-yes')?.click(); render(); return; }
  if (DOOR.on()) { DOOR.DEBUG.solve(); render(); return; }
  if (FPD.busy()) return;
  if (A.S.state === 'brief') { A.acceptOrder(); render(); return; }
  if (A.S.state !== 'drive' || !A.S.target || !A.S.order?.ord?.story) return;
  const x = A.S.target.x, z = A.S.target.z, car = A.car();
  const stop = A.S.order.stops[A.S.order.idx], e = stop.entry;
  const road = A.parkingNear(x, z);
  let px = road ? road.x : x, pz = road ? road.z : z;
  let heading = road?.seg ? Math.atan2(road.seg.x2 - road.seg.x1, road.seg.z2 - road.seg.z1) : A.V.h;
  if ((!road || road.d >= 18) && e) {
    const sideX = -e.nz, sideZ = e.nx;
    for (const [forward, side] of [[12, 8], [12, -8], [15, 8], [15, -8], [12, 0], [18, 0]]) {
      const cx = e.x + e.nx * forward + sideX * side;
      const cz = e.z + e.nz * forward + sideZ * side;
      if (A.parkingClear(cx, cz)) { px = cx; pz = cz; break; }
    }
    heading = Math.atan2(e.nz, -e.nx);
  }
  stop.reach = Math.max(stop.reach || 6, Math.hypot(px - x, pz - z) + 2);
  A.V.x = px; A.V.z = pz; A.V.y = A.surfaceAt(px, pz); A.V.h = heading;
  A.V.vx = 0; A.V.vz = 0; A.V.hero = 0;
  A.V.camX = px - Math.sin(heading) * 11; A.V.camZ = pz - Math.cos(heading) * 11;
  A.V.camH = heading; A.V.camY = A.V.y + 6;
  if (car) {
    car.position.set(px, A.V.y, pz); car.rotation.y = heading;
    car.updateMatrixWorld();
  }
  status.textContent = t('У дома · начинается выход из машины');
}

function initPanel () {
  if (root) return;
  if (doorPreviewEnabled() || stairsPreviewEnabled()) { initDoorPreview(); return; }
  root = document.createElement('aside'); root.id = 'storytest';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'storytest-toggle';
  toggle.textContent = t('Сюжет · тест');
  const body = document.createElement('div'); body.className = 'storytest-body';
  const title = document.createElement('strong'); title.textContent = t('Сюжетные задания');
  const note = document.createElement('small'); note.textContent = t('Выбери главу и проходи этапы без поездки. Доставка засчитывается в этом профиле.');
  list = document.createElement('div'); list.className = 'storytest-list';
  status = document.createElement('p'); status.className = 'storytest-status';
  nextButton = document.createElement('button'); nextButton.type = 'button'; nextButton.className = 'storytest-next';
  nextButton.addEventListener('click', advance);
  toggle.addEventListener('click', () => { root.classList.toggle('open'); render(); signalPanel(); });
  body.append(title, note, list, status, nextButton); root.append(toggle, body);
  (document.getElementById('game') || document.body).appendChild(root);
  render();
  setInterval(render, 350);
}

export function init (api) {
  A = api;
  if (root) return;
  if (doorPreviewEnabled() || stairsPreviewEnabled()) { initDoorPreview(); return; }
  if (enabled()) initPanel();
}

export function togglePanel (force) {
  if (!A || doorPreviewEnabled() || stairsPreviewEnabled()) return false;
  initPanel();
  const open = force == null ? !panelOpen() : !!force;
  root.hidden = !open;
  root.classList.toggle('open', open);
  render();
  signalPanel();
  return open;
}

export const DEBUG = { start, advance, phase, enabled, openDoorPreview, openStairsPreview, doorPreviewEnabled, stairsPreviewEnabled, panelOpen, togglePanel };
