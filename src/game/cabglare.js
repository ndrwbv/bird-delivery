/* ──────────────────────────────────────────────────────────────────────────
   Блик на стёклах из-за руля (11бу, автор 24.10: «внутри есть блик от стёкол, чтобы было ощущение, что стёкла есть
   в машине»). Правило словами — docs/CAREER.md «Камера: три вида» (из-за руля).

   В салоне (camview.js) лобовое и боковые стёкла были пустыми — дыра в раме. Теперь на них едва заметный блик:
   мягкий светлый градиент сверху и две косые полосы, светом поверх (складывается с картинкой, дорогу не закрывает).
     • днём — слабый, против солнца (смотришь в его сторону) — заметно сильнее, низкое солнце — ещё сильнее;
     • ночью — тёплый, слабый, и «пробегает», когда едешь мимо фонарей (раз в ~30 м);
     • боковые — вдвое слабее лобового; у кабриолета — только лобовое.
   ?noglare — без блика. Поверх крови и дворников (glassblood.js) — блик на стекле ближе к глазу. Две отрисовки (лобовое и бока одной склейкой
   нельзя — разная сила), только в виде из-за руля.
     build(root, THREE, g) — camview.js build: g { W, gb, gt, cf, rw, open } — размеры салона (оси машины)
     step(h, cam, sunDir, sunI) — camview.js overlay каждый кадр: sunDir — к солнцу (мир), sunI — сила солнца
   ────────────────────────────────────────────────────────────────────────── */

/* BASE — всегда; DAY — днём; SUN — сколько добавляет взгляд против солнца; LOW — добавка низкому солнцу;
   NIGHT — ночью; LAMP — пульс фонарей ночью (доля NIGHT), LAMP_M — шаг фонарей, м; SIDE — боковые от лобового */
export const GL = { BASE: 0.04, DAY: 0.07, SUN: 0.13, LOW: 0.05, NIGHT: 0.07, LAMP: 0.8, LAMP_M: 30, SIDE: 0.5,
  DAY_C: '#eaf4ff', NIGHT_C: '#ffc48a' };
export const STATS = { front: 0, side: 0 };

let TEX = null;
function tex (THREE) {
  if (TEX) return TEX;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 128, 64);
  // светлее к верху стекла (отражение потолка и неба), к низу — на нет
  let g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.45, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 64);
  // две косые полосы — блик
  x.filter = 'blur(5px)';
  x.fillStyle = 'rgba(255,255,255,0.75)';
  for (const [x0, w] of [[30, 16], [58, 7]]) {
    x.beginPath(); x.moveTo(x0, -4); x.lineTo(x0 + w, -4); x.lineTo(x0 + w - 34, 68); x.lineTo(x0 - 34, 68); x.closePath(); x.fill();
  }
  // к бокам стекла — мягко на нет (рамка)
  x.filter = 'none';
  x.globalCompositeOperation = 'destination-in';
  g = x.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.2)'); g.addColorStop(0.15, '#000'); g.addColorStop(0.85, '#000'); g.addColorStop(1, 'rgba(0,0,0,0.2)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 64);
  TEX = new THREE.CanvasTexture(c);
  TEX.colorSpace = THREE.SRGBColorSpace;
  return TEX;
}

function mat (THREE) {
  const m = new THREE.MeshBasicMaterial({ map: tex(THREE), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  m.userData.shared = false;
  return m;
}

export function build (root, THREE, g) {
  if (typeof location !== 'undefined' && /[?&]noglare\b/.test(location.search || '')) return null;   // ?noglare — без блика (сравнить)
  const { W, gb, gt, cf, rw, open } = g;
  // лобовое — в той же раме, что кровь (glassblood.js cab), на 1 см ближе к глазу
  const B = new THREE.Vector3(0, gb - 0.005, cf + 0.015), T = new THREE.Vector3(0, gt + 0.02, cf - 0.26);
  const Hg = Math.hypot(T.y - B.y, T.z - B.z);
  const fr = new THREE.Group();
  fr.position.copy(B);
  fr.rotation.x = Math.atan2(T.z - B.z, T.y - B.y);
  root.add(fr);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, Hg).translate(0, Hg / 2, -0.012), mat(THREE));
  front.renderOrder = 3;
  fr.add(front);
  let side = null;
  if (!open) {
    // боковые: от средней стойки до лобового, по высоте окна; одна сетка на оба борта, текстура зеркально не нужна
    const z0 = rw + 0.35, z1 = cf - 0.2, L = Math.max(0.3, z1 - z0), h = gt - gb;
    const geo = [];
    for (const s of [1, -1]) {
      const p = new THREE.PlaneGeometry(L, h).rotateY(s * Math.PI / 2).translate(s * (W / 2 - 0.13), (gb + gt) / 2, (z0 + z1) / 2);
      geo.push(p);
    }
    const P = [], U = [];
    for (const p of geo) {
      const q = p.toNonIndexed();
      P.push(...q.attributes.position.array); U.push(...q.attributes.uv.array);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    side = new THREE.Mesh(sg, mat(THREE));
    side.renderOrder = 3;
    root.add(side);
  }
  return { front, side, cA: new THREE.Color(GL.DAY_C), cB: new THREE.Color(GL.NIGHT_C), f: new THREE.Vector3() };
}

export function step (h, cam, sunDir, sunI) {
  if (!h) return;
  // пройденный путь — по камере (для «фонарей» ночью); прыжок камеры больше 20 м — не езда
  const mv = h.px === undefined ? 0 : Math.hypot(cam.position.x - h.px, cam.position.z - h.pz);
  h.px = cam.position.x; h.pz = cam.position.z;
  if (mv < 20) h.dist = (h.dist || 0) + mv;
  const dist = h.dist || 0;
  const day = Math.max(0, Math.min(1, (sunI - 0.3) / 1.45)), night = 1 - day;
  cam.getWorldDirection(h.f);
  const fl = Math.hypot(h.f.x, h.f.z) || 1, sl = Math.hypot(sunDir.x, sunDir.z) || 1;
  const facing = Math.max(0, (h.f.x * sunDir.x + h.f.z * sunDir.z) / (fl * sl));
  const low = 1 - Math.min(1, Math.max(0, sunDir.y / (Math.hypot(sunDir.x, sunDir.y, sunDir.z) || 1)) * 1.6);   // солнце у горизонта
  const lamp = 1 - GL.LAMP + GL.LAMP * (0.5 + 0.5 * Math.cos(dist / GL.LAMP_M * Math.PI * 2));
  const a = GL.BASE + day * (GL.DAY + facing * facing * (GL.SUN + GL.LOW * low)) + night * GL.NIGHT * lamp;
  h.front.material.opacity = a;
  h.front.material.color.copy(h.cA).lerp(h.cB, night);
  STATS.front = +a.toFixed(3);
  if (h.side) {
    h.side.material.opacity = a * GL.SIDE;
    h.side.material.color.copy(h.front.material.color);
    STATS.side = +(a * GL.SIDE).toFixed(3);
  }
}
