/* Подбираемое одним махом (10.10.2026, вызовы отрисовки на Деке).
   Стаканчики кофе, аптечки, быки и кольца под всем подбираемым — под сотню на карте, в кадре
   15—25 штук, и каждое было два меша (склейка модельки + кольцо) — 30—45 вызовов из ~380.
   Теперь: модельки — по InstancedMesh на вид (кофе, аптечка, бык), кольца всех видов — один
   InstancedMesh с цветом на кольцо. 4 вызова на все.

   Логика подбираемого (game.js addPickup / updateNitro) не меняется: у каждого — та же группа n.g
   на сцене (положение, видимость, повтор пишет её позу), n.body и n.ring — пустые узлы
   (вращение, подпрыгивание, пульс кольца). Каждый кадр перед отрисовкой step() собирает
   видимые группы в инстансы: матрица = группа × узел.

   Повтор (replay.js) возвращает на сцену и подобранное, что было в записи: такие группы живут
   в «кладбище» (последние GRAVE штук) — step() видит и их, если они снова на сцене.

     create(THREE, scene, { geos: {kind: [[geo, mat], …]}, ringGeo, ringHex: {kind: '#hex'} })
       → { add(g, kind, body, ring), drop(g), step(), STATS }
   У вида — один или несколько инстансов (щит: прозрачный шар и звезда). Вид, которого нет в geos
   (деньги, сердце), рисуется как раньше — своими мешами; его кольцо всё равно здесь. */

const CAP = 256, GRAVE = 64;

export function create (THREE, scene, { geos, ringGeo, ringHex }) {
  const inst = (geo, m) => {
    const im = new THREE.InstancedMesh(geo, m, CAP);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false;                    // что вне кадра — game.js и так прячет группу (CULL.inView)
    im.matrixAutoUpdate = false; im.matrixWorldAutoUpdate = false;
    im.visible = false;
    im.name = 'pickups';
    scene.add(im);
    return im;
  };
  const BODY = {};
  for (const k in geos) BODY[k] = geos[k].map(([geo, mat]) => inst(geo, mat));
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const RING = inst(ringGeo, ringMat);
  RING.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
  RING.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const COL = {};
  for (const k in ringHex) COL[k] = new THREE.Color(ringHex[k]);

  const LIVE = new Map();                        // группа → { kind, body, ring }
  const GR = [];                                 // подобранное — для повтора
  const M = new THREE.Matrix4(), B = new THREE.Matrix4();
  const STATS = { live: 0, drawn: 0, rings: 0 };
  const N = {};

  function add (g, kind, body, ring) { LIVE.set(g, { kind, body, ring, inst: !!BODY[kind] }); }
  function drop (g) {
    const e = LIVE.get(g);
    if (!e) return;
    LIVE.delete(g);
    GR.push([g, e]);
    if (GR.length > GRAVE) GR.shift();
  }
  function one (g, e) {
    if (!g.visible || g.parent !== scene) return;
    g.updateMatrix();
    if (e.inst) {
      const L = BODY[e.kind], i = N[e.kind]++;
      if (i < CAP) {
        e.body.updateMatrix();
        B.multiplyMatrices(g.matrix, e.body.matrix);
        for (let k = 0; k < L.length; k++) L[k].setMatrixAt(i, B);
      }
    }
    const j = N._ring++;
    if (j < CAP) {
      e.ring.updateMatrix();
      RING.setMatrixAt(j, M.multiplyMatrices(g.matrix, e.ring.matrix));
      RING.setColorAt(j, COL[e.kind] || COL.nos);
    }
  }
  const oneV = (e, g) => one(g, e);              // Map.forEach — без массива [g, e] на каждое (for…of по Map — мусор в каждом кадре)
  // в видеокарту — только занятая часть буфера, не все CAP
  const dirty = (a, n) => { a.clearUpdateRanges(); a.addUpdateRange(0, n); a.needsUpdate = true; };
  /* перед каждой отрисовкой кадра игры (и повтора) */
  function step () {
    for (const k in BODY) N[k] = 0;
    N._ring = 0;
    LIVE.forEach(oneV);
    for (let i = 0; i < GR.length; i++) { const g = GR[i][0]; if (g.parent === scene) one(g, GR[i][1]); }   // в повторе — снова на сцене
    let drawn = 0;
    for (const k in BODY) {
      const n = Math.min(CAP, N[k]);
      drawn += n;
      for (const im of BODY[k]) { im.count = n; im.visible = n > 0; if (n) dirty(im.instanceMatrix, n * 16); }
    }
    RING.count = Math.min(CAP, N._ring); RING.visible = RING.count > 0;
    if (RING.count) { dirty(RING.instanceMatrix, RING.count * 16); dirty(RING.instanceColor, RING.count * 3); }
    STATS.live = LIVE.size; STATS.drawn = drawn; STATS.rings = RING.count;
  }
  return { add, drop, step, STATS };
}
