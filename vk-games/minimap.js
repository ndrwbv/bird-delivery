/* Проекция ближайшего пути с низкой камеры. Контуры домов служат ориентирами. */
const WIDTH = 144, HEIGHT = 64;
const FOCAL = 82, CAMERA_BACK = 16, CAMERA_HEIGHT = 5.5, PITCH = 7 * Math.PI / 180;
const SIN_PITCH = Math.sin(PITCH), COS_PITCH = Math.cos(PITCH);
const NEAR = -7, RANGE = 92, FRAME_MS = 40;

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
  const height = k === 'gar' ? 2.7 : Math.min(17, levels * 3.15 + 1.1);
  return { p, x0, z0, x1, z1, winding: Math.sign(area), height };
}

function pointOnNearPlane (a, b) {
  const t = (NEAR - a.depth) / (b.depth - a.depth);
  return { side: a.side + (b.side - a.side) * t, depth: NEAR, height: a.height + (b.height - a.height) * t };
}

function drawFace (ctx, points, project) {
  const clipped = [];
  let prev = points[points.length - 1];
  for (const point of points) {
    if ((prev.depth >= NEAR) !== (point.depth >= NEAR)) clipped.push(pointOnNearPlane(prev, point));
    if (point.depth >= NEAR) clipped.push(point);
    prev = point;
  }
  if (clipped.length < 3) return;
  ctx.beginPath();
  for (let i = 0; i < clipped.length; i++) {
    const { x, y } = project(clipped[i]);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function createMinimap (canvas, buildings) {
  canvas.width = WIDTH * 2;
  canvas.height = HEIGHT * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const houses = buildings.filter(b => b.p.length >= 3).map(buildingShape);
  let lastFrame = -Infinity, lastX, lastZ, lastHeading, lastRoute, lastTarget, visible = false;

  function draw (car, target, route) {
    const sin = Math.sin(car.h), cos = Math.cos(car.h);
    const forward = (x, z) => (x - car.x) * sin + (z - car.z) * cos;
    const orient = (x, z, height = 0) => ({
      // Как у штатного радара: при нулевом курсе +Z — вперёд, −X — вправо.
      side: (z - car.z) * sin - (x - car.x) * cos,
      depth: forward(x, z),
      height,
    });
    const project = ({ side, depth, height }) => {
      const away = depth + CAMERA_BACK, up = height - CAMERA_HEIGHT;
      const scale = FOCAL / (away * COS_PITCH - up * SIN_PITCH);
      return { x: WIDTH / 2 + side * scale, y: 34 - (up * COS_PITCH + away * SIN_PITCH) * scale };
    };

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const visibleHouses = houses.filter(b => b.x0 <= car.x + RANGE && b.x1 >= car.x - RANGE &&
      b.z0 <= car.z + RANGE && b.z1 >= car.z - RANGE);
    visibleHouses.sort((a, b) => forward((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)
      - forward((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2));
    const eyeX = car.x - sin * CAMERA_BACK, eyeZ = car.z - cos * CAMERA_BACK;
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#d1edf335';
    for (const house of visibleHouses) {
      const ground = house.p.map(([x, z]) => orient(x, z));
      if (ground.every(p => p.depth < NEAR) || ground.every(p => p.depth > RANGE)) continue;
      const roof = ground.map(p => ({ ...p, height: house.height }));
      ctx.fillStyle = '#a3bdca12';
      for (let i = 0; i < house.p.length; i++) {
        const j = (i + 1) % house.p.length;
        const [x, z] = house.p[i], [nx, nz] = house.p[j];
        if (house.winding * ((eyeX - x) * (nz - z) - (eyeZ - z) * (nx - x)) <= 0) continue;
        drawFace(ctx, [ground[i], ground[j], roof[j], roof[i]], project);
      }
      ctx.fillStyle = '#c1dbe421';
      drawFace(ctx, roof, project);
    }

    if (target) {
      for (const [points, dashed] of [[route, false], [route.offroadStart, true], [route.offroad, true]]) {
        if (!points || points.length < 2 || Math.hypot(points[0][0] - car.x, points[0][1] - car.z) >= RANGE) continue;
        ctx.setLineDash(dashed ? [3, 3] : []);
        ctx.beginPath();
        let remaining = RANGE, penDown = false;
        let a = orient(points[0][0], points[0][1]);
        for (let i = 1; i < points.length && remaining > 0; i++) {
          let b = orient(points[i][0], points[i][1]);
          const length = Math.hypot(b.side - a.side, b.depth - a.depth);
          if (length > remaining) {
            const fraction = remaining / length;
            b = { side: a.side + (b.side - a.side) * fraction, depth: a.depth + (b.depth - a.depth) * fraction, height: 0 };
          }
          remaining -= length;
          if (a.depth >= NEAR || b.depth >= NEAR) {
            const start = project(a.depth < NEAR ? pointOnNearPlane(a, b) : a);
            const end = project(b.depth < NEAR ? pointOnNearPlane(b, a) : b);
            if (!penDown) ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
          }
          penDown = b.depth >= NEAR;
          a = b;
        }
        ctx.lineWidth = 4.8;
        ctx.strokeStyle = '#103449';
        ctx.stroke();
        ctx.lineWidth = 2.8;
        ctx.strokeStyle = '#8bf1ff';
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    const { x, y } = project({ side: 0, depth: 0, height: 0 });
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x + 4, y + 3);
    ctx.lineTo(x, y + 1);
    ctx.lineTo(x - 4, y + 3);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#193447';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
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
