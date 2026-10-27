/* Просмотр сюжетных доставок в обычной игре без поездки. Включается только ?storytest. */
import './storytest.css';
import { t } from '../i18n/index.js';
import * as STORY from './story.js';
import * as ORD from './orders.js';
import * as DOOR from './doorstep.js';
import * as FPD from './fpdeliver.js';
import * as DLG from './dialog.js';

let A = null, root = null, list = null, status = null, nextButton = null, listKey = '';
const enabled = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('storytest');
const gameReady = () => A && ['brief', 'loading', 'drive', 'back', 'handover', 'side'].includes(A.S.state);

function phase () {
  if (!A || A.S.state === 'title') return t('Начни смену, затем выбери главу');
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
  status.textContent = phase();
  nextButton.disabled = !gameReady() || FPD.busy() || !(DLG.isOpen() || DOOR.on()
    || A.S.state === 'brief' || (A.S.state === 'drive' && A.S.target && A.S.order?.ord?.story));
  nextButton.textContent = DLG.isOpen() ? t('Следующая реплика') : DOOR.on() ? t('Пройти этот этап')
    : A.S.state === 'brief' ? t('Загрузить пиццу') : t('К дому без поездки');
  const locked = !gameReady() || DOOR.on() || FPD.busy() || DLG.isOpen();
  const key = STORY.STORIES.map(s => s.id + ':' + s.chapters.length).join('|') + ':' + locked;
  if (key === listKey) return;
  listKey = key;
  list.replaceChildren();
  for (const story of STORY.STORIES) story.chapters.forEach((chapter, i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'storytest-chapter';
    button.textContent = t(story.name) + ' · ' + t(chapter.name || String(i + 1));
    button.disabled = locked;
    button.addEventListener('click', () => start(story.id, i));
    list.appendChild(button);
  });
}

function start (id, chapter) {
  if (!gameReady()) return;
  const spec = STORY.orderFor(id, chapter);
  if (!spec) { status.textContent = t('Адрес этой главы пока недоступен'); return; }
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

export function init (api) {
  if (!enabled() || root) return;
  A = api;
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
  toggle.addEventListener('click', () => { root.classList.toggle('open'); render(); });
  body.append(title, note, list, status, nextButton); root.append(toggle, body);
  (document.getElementById('game') || document.body).appendChild(root);
  render();
  setInterval(render, 350);
}

export const DEBUG = { start, advance, phase, enabled };
