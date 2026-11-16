/* Наклонный вид квартала по реальным контурам домов и дорожному графу. */
const WIDTH = 272, HEIGHT = 148, DRIVER_Y = 102;
const FOCAL = 235, CAMERA_DISTANCE = 165, PITCH = Math.PI / 4;
const SIN_PITCH = Math.sin(PITCH), COS_PITCH = Math.cos(PITCH);
const RANGE = 150, FRAME_MS = 40;

function buildingShape ({ p, lv, k }) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, area = 0;
  for (let i = 0; i < p.length; i++) {
    const [x, z] = p[i], [nx, nz] = p[(i + 1) % p.length];
    x0 = Math.min(x0, x); z0 = Math.min(z0, z);
    x1 = Math.max(x1, x); z1 = Math.max(z1, z);
    area += x * nz - nx * z;
  }
  const size = Math.abs(area) / 2;
  const levels = lv || (size > 1200 ? 5 : size > 600 ? 4 : size > 220 ? 2 : 1);
  const height = k === 'gar' ? 2.7 : Math.min(27, levels * 3.15 + 1.1);
  return { p, x0, z0, x1, z1, winding: Math.sign(area), height };
}

function polygon (ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function createMinimap (canvas, buildings, segments, driveMax) {
  canvas.width = WIDTH * 2;
  canvas.height = HEIGHT * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const houses = buildings.filter(b => b.p.length >= 3).map(buildingShape);
  let lastFrame = -Infinity, lastX, lastZ, lastHeading, lastRoute, lastTarget, visible = false;

  function draw (car, target, route) {
    const sin = Math.sin(car.h), cos = Math.cos(car.h);
    const forward = (x, z) => (x - car.x) * sin + (z - car.z) * cos;
    const project = (x, z, height = 0) => {
      const depth = forward(x, z);
      // Как у игрового радара: +Z — вперёд при курсе 0, −X — вправо.
      const right = (z - car.z) * sin - (x - car.x) * cos;
      const scale = FOCAL / Math.max(40, CAMERA_DISTANCE + depth * COS_PITCH - height * SIN_PITCH);
      return { x: WIDTH / 2 + right * scale, y: DRIVER_Y - (depth * SIN_PITCH + height * COS_PITCH) * scale };
    };
    const nearby = (x0, z0, x1, z1) => x0 <= car.x + RANGE && x1 >= car.x - RANGE && z0 <= car.z + RANGE && z1 >= car.z - RANGE;
    const visibleRoads = segments.filter(r => r.c <= driveMax
      && nearby(Math.min(r.x1, r.x2), Math.min(r.z1, r.z2), Math.max(r.x1, r.x2), Math.max(r.z1, r.z2)));
    const visibleHouses = houses.filter(b => nearby(b.x0, b.z0, b.x1, b.z1));
    visibleHouses.sort((a, b) => forward((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)
      - forward((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2));

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const major of [true, false]) {
      ctx.beginPath();
      for (const r of visibleRoads) {
        if ((r.w >= 10) !== major) continue;
        const a = project(r.x1, r.z1), b = project(r.x2, r.z2);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.lineWidth = major ? 8 : 4;
      ctx.strokeStyle = '#182738c7';
      ctx.stroke();
      ctx.lineWidth -= 2;
      ctx.strokeStyle = major ? '#b0bbbdc9' : '#909fa5bb';
      ctx.stroke();
    }
    if (target) {
      for (const [points, dashed] of [[route, false], [route.offroadStart, true], [route.offroad, true]]) {
        if (!points || points.length < 2) continue;
        ctx.setLineDash(dashed ? [5, 4] : []);
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
          const pt = project(points[i][0], points[i][1]);
          if (i) ctx.lineTo(pt.x, pt.y); else ctx.moveTo(pt.x, pt.y);
        }
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#123449';
        ctx.stroke();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#83ebff';
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    const eyeX = car.x - sin * CAMERA_DISTANCE * COS_PITCH;
    const eyeZ = car.z - cos * CAMERA_DISTANCE * COS_PITCH;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#192d3dda';
    for (const house of visibleHouses) {
      const ground = house.p.map(([x, z]) => project(x, z));
      const roof = house.p.map(([x, z]) => project(x, z, house.height));
      for (let i = 0; i < house.p.length; i++) {
        const j = (i + 1) % house.p.length;
        const [x, z] = house.p[i], [nx, nz] = house.p[j];
        if (house.winding * ((eyeX - x) * (nz - z) - (eyeZ - z) * (nx - x)) <= 0) continue;
        ctx.fillStyle = (nx - x) * cos - (nz - z) * sin > 0 ? '#475b69eb' : '#627885eb';
        polygon(ctx, [ground[i], ground[j], roof[j], roof[i]]);
      }
      ctx.fillStyle = '#9cabb3eb';
      polygon(ctx, roof);
    }

    if (target) {
      const pin = project(target.x, target.z);
      const dx = pin.x - WIDTH / 2, dy = pin.y - DRIVER_Y;
      const fit = Math.min(1, (WIDTH / 2 - 17) / Math.max(1, Math.abs(dx)),
        dy > 0 ? (HEIGHT - DRIVER_Y - 16) / dy : (DRIVER_Y - 16) / Math.max(1, -dy));
      const x = WIDTH / 2 + dx * fit, y = DRIVER_Y + dy * fit;
      ctx.fillStyle = '#ffda81';
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2d2b38';
      polygon(ctx, [{ x, y: y - 6 }, { x: x + 5, y }, { x, y: y + 6 }, { x: x - 5, y }]);
    }
    const x = WIDTH / 2, y = DRIVER_Y;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#193447';
    ctx.lineWidth = 2;
    polygon(ctx, [{ x, y: y - 8 }, { x: x + 5, y: y + 5 }, { x, y: y + 2 }, { x: x - 5, y: y + 5 }]);
  }

  return (show, car, target, route) => {
    const now = performance.now();
    const changed = !visible || target !== lastTarget || route !== lastRoute;
    visible = show;
    canvas.hidden = !show;
    if (!show || (!changed && now - lastFrame < FRAME_MS)) return;
    if (!changed && Math.hypot(car.x - lastX, car.z - lastZ) < 0.3 && Math.abs(car.h - lastHeading) < 0.01) return;
    draw(car, target, route);
    lastX = car.x; lastZ = car.z; lastHeading = car.h;
    lastFrame = now; lastRoute = route; lastTarget = target;
  };
}
