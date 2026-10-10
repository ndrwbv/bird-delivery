/* Прогрев шейдеров (docs/AGENTS.md → «Шейдеры на ходу», 10.10.2026).

   Программа шейдера (материал × вид объекта × туман и свет) собирается при первой отрисовке —
   посреди смены это рывок кадра: на «Деке» 5—40 мс за программу. При загрузке всё, что есть на сцене,
   собирает `renderer.compile` (game.js, кусок поздней сборки 'shaders'). Тут — три добавки:

   1. **Образцы** (sample): то, чего на сцене при загрузке ещё нет, — материалы заводятся на ходу
      (молния, воздушные змеи и их нитки, поводок собаки, пиксельное подбираемое и искра, огни автобуса,
      таблички протеста, осколки витрины, дворники) и машина игрока с грязью (cardirt.js — в первом кадре смены). Образец — крошечный объект с материалом тех же настроек: программа зависит
      только от настроек (карта, цвета вершин, две стороны, прозрачность, туман, инстансы, линия или меш),
      не от цвета и текстуры. Собираем их при загрузке вместе со светом и туманом сцены.
   2. **Программы не выгружаются** (keep): three.js выгружает программу, когда освобождён последний
      материал с ней (dropMesh), — и в следующий раз собирает заново. Так было с машиной игрока: вторая
      смена за заход — новая машина, 5 программ заново (~37 мс кадр). Теперь каждая собранная программа
      держится до конца игры (их ~85, все разные; больше LIMIT — не держим).
   3. **Первое использование — при загрузке** (ready): даже собранная заранее программа при первой
      отрисовке ждёт видеокарту (проверка сборки — getProgramInfoLog, на «Деке» до 20—30 мс). Делаем это
      сами, когда сборка уже готова (KHR_parallel_shader_compile), по нескольку программ за шаг поздней
      сборки — меню не замирает.

   Проверка: npm run probe -- --eval=tools/probe-checks/shaders.js --cpu=3 --size=deck --max=0 --timeout=600
   (links — какие программы собрались посреди смены, waits — где ждали видеокарту). */

let C = null, KEEP = null, SAMPLES = null, TICK = 0;
const PINNED = new WeakSet(), USED = new WeakSet();
const LIMIT = 600;                           // больше программ не держим: где-то ключ программы стал уникальным — пусть выгружаются
export const STATS = { samples: 0, pinned: 0, ready: 0, ms: 0, readyMs: 0 };

export function init (ctx) { C = ctx; }

/* образцы: [что, объект]; материалы — тех же настроек, что заводятся на ходу (ищи по подписи) */
function samples () {
  const T = C.THREE, D = T.DoubleSide;
  const geo = new T.BoxGeometry(0.1, 0.1, 0.1);
  const n = geo.attributes.position.count;
  geo.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const lg = new T.BufferGeometry();
  lg.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
  const map = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const mesh = m => new T.Mesh(geo, m), inst = m => new T.InstancedMesh(geo, m, 1);
  return [
    ['нитка змея, поводок, хвосты (life.js kiteMats, LEASH_MAT)', new T.Line(lg, new T.LineBasicMaterial())],
    ['змей (life.js KMAT.kite)', mesh(new T.MeshBasicMaterial({ vertexColors: true, side: D }))],
    ['змей на пляже (kites.js mat, side)', mesh(new T.MeshLambertMaterial({ flatShading: true, side: D }))],
    ['змей на пляже полупрозрачный (kites.js mat, op)', mesh(new T.MeshLambertMaterial({ flatShading: true, side: D, transparent: true, opacity: 0.5 }))],
    ['змей на пляже полупрозрачный (kites.js mat, op)', mesh(new T.MeshLambertMaterial({ flatShading: true, transparent: true, opacity: 0.5 }))],
    ['молния (weather.js boltMesh)', mesh(new T.MeshBasicMaterial({ transparent: true, opacity: 0, fog: false, depthWrite: false, side: D }))],
    ['пиксельное подбираемое (game.js pxMat)', mesh(new T.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.5, side: D }))],
    ['искра (game.js pxMat spark)', new T.Sprite(new T.SpriteMaterial({ map, transparent: true, depthWrite: false }))],
    ['огни автобуса (buses.js GLOW_MAT)', mesh(new T.MeshBasicMaterial({ vertexColors: true, map }))],
    ['таблички протеста (protests.js MAT)', inst(new T.MeshLambertMaterial({ map, alphaTest: 0.45, side: D }))],
    ['осколки стекла (raid.js SHARD_MAT)', inst(new T.MeshLambertMaterial({ transparent: true, opacity: 0.8 }))],
    ['дворники (wipers.js mat)', mesh(new T.MeshBasicMaterial({ side: D }))],
  ];
}

/* собрать образцы со светом и туманом сцены (кусок поздней сборки, два шага: образцы, машина); потом — держать все программы */
export function* compile () {
  if (!C || !C.renderer || !C.renderer.compile) return;
  let t0 = performance.now();
  const g = new C.THREE.Group();
  try {
    SAMPLES = samples();
    for (const [, o] of SAMPLES) { o.frustumCulled = false; g.add(o); }
    C.renderer.compile(g, C.cam, C.scene);
    KEEP = g;                                  // не освобождаем: материалы образцов держат свои программы
  } catch (e) { console.error('[warmup] образцы', e); }
  keep();
  STATS.ms = performance.now() - t0;
  yield 'samples';
  t0 = performance.now();
  try {
    const big = C.extra ? C.extra() : [];      // настоящие объекты из game.js (машина игрока) — собрали и освободили
    const g2 = new C.THREE.Group();
    for (const [, o] of big) g2.add(o);
    C.renderer.compile(g2, C.cam, C.scene);
    keep();                                    // до освобождения: программы остаются
    for (const [k, o] of big) { g2.remove(o); if (C.drop) C.drop(o); SAMPLES.push([k, null]); }
  } catch (e) { console.error('[warmup] машина', e); }
  keep();
  STATS.samples = SAMPLES ? SAMPLES.length : 0;
  STATS.ms = Math.round(STATS.ms + performance.now() - t0);
}

/* все собранные программы — до конца игры (usedTimes + 1: three.js не выгрузит при dispose) */
export function keep () {
  if (!C || !C.renderer) return;
  const P = C.renderer.info.programs;
  if (!P || P.length > LIMIT) return;
  for (const p of P) if (!PINNED.has(p)) { PINNED.add(p); p.usedTimes++; STATS.pinned++; }
}

/* первое использование программ — сейчас: шагами поздней сборки, по готовым (без ожидания);
   неготовую ждём до 20 шагов, потом — как есть */
export function* ready () {
  if (!C || !C.renderer) return;
  const P = C.renderer.info.programs.slice();
  let i = 0, tries = 0;
  while (i < P.length) {
    const t0 = performance.now();
    while (i < P.length && performance.now() - t0 < 6) {
      const p = P[i];
      if (USED.has(p)) { i++; continue; }
      if (!(p.isReady && p.isReady()) && tries < 20) break;
      try { p.getUniforms(); p.getAttributes(); } catch (e) { /* — */ }
      USED.add(p); STATS.ready++; i++; tries = 0;
    }
    STATS.readyMs += performance.now() - t0;
    if (i < P.length) { tries++; yield 'ready'; }
  }
  STATS.readyMs = Math.round(STATS.readyMs);
}

/* в кадре: раз в 2 с — новые программы (собранные на ходу) тоже держим */
export function step (dt) {
  if ((TICK += dt) < 2) return;
  TICK = 0;
  keep();
}

export const DEBUG = { STATS, get samples () { return SAMPLES ? SAMPLES.map(s => s[0]) : []; }, get kept () { return !!KEEP; } };
