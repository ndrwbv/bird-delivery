/* ──────────────────────────────────────────────────────────────────────────
   Футбольные коробки в зелёной сетке (М8; автор 24.10.2026: «футбольные коробки должны быть в зелёную металлическую
   сетку, сделанную из блоков сетки; не все, но некоторые такие»). Правила словами — docs/CAREER.md
   «Футбольные коробки в зелёной сетке».

   У ~35 % коробок (жребий по месту коробки, не Math.random: город строится на зерне — docs/AGENTS.md) вместо низких
   бортиков game.js pitchAt ставит забор ~3 м из секций по ~2,6 м — столько же секций, сколько было бортиков, с теми же
   проходами посередине длинных сторон. Секция — рама из уголка (столбы 3 м, верхняя, средняя и нижняя перекладины) и
   полотно зелёной сварной сетки между ними; у половины таких коробок снизу ещё бетонный борт 0,5 м, сетка — поверх него.
   Краска — тёмно- или светло-зелёная, у части выцветшая.

   Рама — вершины в общей склейке мелочи (smashAdd, как бортики: ноль новых вызовов отрисовки), полотно — один меш на
   весь город (текстура с прозрачностью, альфа-тест; +1 вызов отрисовки): сетка не геометрией, а картинкой. Сносишь
   секцию машиной — рама разлетается как обычный забор (обломки зелёные), а четыре вершины её полотна схлопываются в
   точку (onDown рамы) — полотно не остаётся висеть. Мяч от сетки отскакивает так же, как от прежних невидимых краёв
   коробки (game.js: за краем поля игра сама разворачивает мяч).

     PNET.is(cx, cz)                         — эта коробка в сетке?
     PNET.look(cx, cz)                       — { hex, hexB, board } — краска рамы, борта и есть ли борт
     PNET.section(look, l, X, Y, Z, ry, slope, p0, p1, ga, gb) — одна секция: { geo — рама (в smashAdd), net — полотно }
     PNET.attach(it, net)                    — привязать полотно к сбиваемой раме
     PNET.finish(api)                        — LATE-шаг: собрать меш полотна всех секций (после дворов, до smashBuild)
   ?nopnet — без сеток (как было до 24.10.2026). Отладка — __dlv.PNET.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { quiet } from './propvar.js';

export const OFF = typeof location !== 'undefined' && /[?&](nopnet|nofvar)(&|$)/.test(location.search);

export const NP = {
  RATE: 0.35,              // доля коробок в сетке
  BOARD: 0.5,              // из них — с бетонным бортом снизу
  H: 3.0,                  // высота забора, м
  BOARD_H: 0.5,            // борт, м
  TILE: 0.4,               // клетка текстуры, м (4 ячейки по 10 см)
  FADE: 0.3,               // доля выцветших
  HEX: ['#2f6a3a', '#3a7d44', '#2b5e35', '#4a8a4c'],
  FADE_HEX: '#7ea07a',
  BOARDS: ['#9a978c', '#8c8f86', '#7d8a7a', '#a3a094'],
};
export const ST = { pitches: 0, sections: 0, board: 0, faded: 0, quads: 0, verts: 0, built: false };
const NET = { P: [], N: [], U: [], C: [], I: [], items: [] };
let MESH = null;

function hsh (x, z, k) {
  let h = Math.imul(Math.round(x * 4) ^ 0x3c6ef372, 0x9E3779B1) ^ Math.imul(Math.round(z * 4) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const mix = (hex, to, k) => {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16), c = s => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
};
const COL = new Map();
const col = hex => { let c = COL.get(hex); if (!c) { const k = new THREE.Color(hex); c = [k.r, k.g, k.b]; COL.set(hex, c); } return c; };

export const is = (cx, cz) => !OFF && hsh(cx, cz, 711) < NP.RATE;

export function look (cx, cz) {
  const fade = hsh(cx, cz, 714) < NP.FADE;
  let hex = NP.HEX[Math.floor(hsh(cx, cz, 713) * NP.HEX.length)];
  if (fade) hex = mix(hex, NP.FADE_HEX, 0.55);
  const board = hsh(cx, cz, 712) < NP.BOARD;
  ST.pitches++; if (board) ST.board++; if (fade) ST.faded++;
  return { hex, board, hexB: NP.BOARDS[Math.floor(hsh(cx, cz, 715) * NP.BOARDS.length)], frame: mix(hex, '#101810', 0.25) };
}

/* коробка (8 вершин) в осях секции: x — вдоль, y — вверх, z — вглубь; в мир — как у three.js rotateY (propvar.js geo) */
function boxIn (S, w, h, d, hex, x, y, z) {
  const c = col(hex), o = S.pos.length / 3;
  for (const q of [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]) {
    const lx = x + q[0] * w / 2, ly = y + q[1] * h / 2, lz = z + q[2] * d / 2;
    S.pos.push(S.X + lx * S.CY + lz * S.SY, S.Y + ly + S.slope * lx, S.Z - lx * S.SY + lz * S.CY);
    S.cl.push(c[0], c[1], c[2]);
  }
  for (const f of [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]) S.idx.push(f + o);
}

/* секция: l — длина, X, Y, Z — середина на земле (Y — средняя высота земли), ry — поворот, slope — подъём земли на метр
   вдоль секции, p0 / p1 — столб в начале / в конце. Рама — BufferGeometry (в quiet: uuid не из жребия куска), полотно —
   четырёхугольник в общем меше (его вершины — ST.verts) */
export function section (lk, l, X, Y, Z, ry, slope, p0, p1) {
  const S = { pos: [], cl: [], idx: [], X, Y, Z, CY: Math.cos(ry), SY: Math.sin(ry), slope };
  const H = NP.H, yb = lk.board ? NP.BOARD_H : 0.12, fr = lk.frame;
  if (p0) boxIn(S, 0.1, H, 0.1, fr, -l / 2, H / 2, 0);
  if (p1) boxIn(S, 0.1, H, 0.1, fr, l / 2, H / 2, 0);
  boxIn(S, l, 0.07, 0.07, fr, 0, H - 0.05, 0);                     // верхняя
  boxIn(S, l, 0.05, 0.05, fr, 0, (yb + H) / 2, 0);                 // средняя
  boxIn(S, l, 0.05, 0.05, fr, 0, yb + 0.03, 0);                    // нижняя
  if (lk.board) boxIn(S, l, NP.BOARD_H, 0.1, lk.hexB, 0, NP.BOARD_H / 2, 0);   // бетонный борт
  const geo = quiet(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(S.pos), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(S.cl), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(S.idx), 1));
    return g;
  });
  // полотно: между столбами, от низа до верхней перекладины; uv — по метрам (текстура повторяется)
  const hl = l / 2 - 0.05, y0 = yb + 0.05, y1 = H - 0.08, v1 = (y1 - y0) / NP.TILE, u1 = 2 * hl / NP.TILE;
  const P = NET.P, vi = P.length / 3, c = col(lk.hex), nx = S.SY, nz = S.CY;
  for (const [lx, ly] of [[-hl, y0], [hl, y0], [hl, y1], [-hl, y1]]) P.push(X + lx * S.CY, Y + ly + slope * lx, Z - lx * S.SY);
  for (let k = 0; k < 4; k++) { NET.N.push(nx, 0, nz); NET.C.push(c[0], c[1], c[2]); }
  NET.U.push(0, 0, u1, 0, u1, v1, 0, v1);
  NET.I.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
  ST.sections++; ST.quads++; ST.verts += 4;
  return { geo, net: { vi, x: X, z: Z } };
}

/* полотно ← рама: рама сбита (smashHit → onDown) — вершины полотна в точку под землёй, как у любой сбиваемой вещи */
export function attach (it, net) {
  it.onDown = (q) => {
    if (!MESH) return;
    const pos = MESH.geometry.attributes.position, a = pos.array, y = a[net.vi * 3 + 1] - 40;
    for (let i = net.vi; i < net.vi + 4; i++) { a[i * 3] = net.x; a[i * 3 + 1] = y; a[i * 3 + 2] = net.z; }
    pos.needsUpdate = true;
  };
  return it;
}

/* картинка сварной сетки: ячейка 10 см (четыре на клетку), проволока 2,5 см; белая — цвет задают вершины; фон прозрачный */
function netTex () {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 64);
  x.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) { x.fillRect(i * 16 - 1, 0, 4, 64); x.fillRect(0, i * 16 - 1, 64, 4); }
  x.fillRect(63, 0, 1, 64); x.fillRect(0, 63, 64, 1);              // половинки линий на шве — клетка повторяется без щели
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}

/* меш полотна — один на город; материал, текстура и геометрия — в quiet (жребий города не трогаем) */
export function finish (A) {
  if (OFF || !NET.P.length || MESH) return;
  quiet(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(NET.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(NET.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(NET.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(NET.C, 3));
    g.setIndex(NET.I);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: netTex(), vertexColors: true, alphaTest: 0.35, side: THREE.DoubleSide }));
    m.name = 'pitch-net';
    A.scene.add(m);
    MESH = m;
  });
  NET.P = []; NET.N = []; NET.U = []; NET.C = []; NET.I = [];      // копии теперь в видеокарте и меше
  ST.built = true;
}

export const DEBUG = { NP, ST, get mesh () { return MESH; }, is, OFF };
