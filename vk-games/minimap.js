/* Карта сверху с поворотом по курсу машины. */
const WIDTH = 144, HEIGHT = 54, DRIVER_Y = 34;
const SCALE = 0.44, RANGE = 180, FRAME_MS = 40;

function buildingShape ({ p }) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of p) {
    x0 = Math.min(x0, x); z0 = Math.min(z0, z);
    x1 = Math.max(x1, x); z1 = Math.max(z1, z);
  }
  return { p, x0, z0, x1, z1 };
}

export function createMinimap (canvas, outerCanvas, buildings) {
  canvas.width = WIDTH * 2;
  canvas.height = HEIGHT * 2;
  outerCanvas.width = canvas.width;
  outerCanvas.height = canvas.height;
  const outer = outerCanvas.getContext('2d');
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const houses = buildings.filter(b => b.p.length >= 3).map(buildingShape);
  let lastFrame = -Infinity, lastX, lastZ, lastHeading, lastRoute, lastTarget, visible = false;

  function draw (car, target, route) {
    const sin = Math.sin(car.h), cos = Math.cos(car.h);
    const project = (x, z) => {
      const dx = x - car.x, dz = z - car.z;
      // Совпадает со штатным радаром: при нулевом курсе +Z — вперёд, −X — вправо.
      return [WIDTH / 2 + (dz * sin - dx * cos) * SCALE, DRIVER_Y - (dx * sin + dz * cos) * SCALE];
    };

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.85;
    ctx.fillStyle = '#49332348';
    ctx.strokeStyle = '#f0c19f70';
    for (const house of houses) {
      if (house.x0 > car.x + RANGE || house.x1 < car.x - RANGE ||
          house.z0 > car.z + RANGE || house.z1 < car.z - RANGE) continue;
      ctx.beginPath();
      for (let i = 0; i < house.p.length; i++) {
        const [x, y] = project(house.p[i][0], house.p[i][1]);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const x = WIDTH / 2, y = DRIVER_Y;
    if (target) {
      const path = ctx.createRadialGradient(x, y, 10, x, y, 91);
      path.addColorStop(0, '#ffb272ef');
      path.addColorStop(0.65, '#ffa45bd9');
      path.addColorStop(1, '#f0803b76');
      for (const [points, dashed] of [[route, false], [route.offroadStart, true], [route.offroad, true]]) {
        if (!points || points.length < 2 || Math.hypot(points[0][0] - car.x, points[0][1] - car.z) > RANGE) continue;
        ctx.setLineDash(dashed ? [3, 3] : []);
        ctx.beginPath();
        ctx.moveTo(...project(points[0][0], points[0][1]));
        let remaining = RANGE;
        for (let i = 1; i < points.length && remaining > 0; i++) {
          const [ax, az] = points[i - 1], [bx, bz] = points[i];
          const length = Math.hypot(bx - ax, bz - az);
          const fraction = length > remaining ? remaining / length : 1;
          ctx.lineTo(...project(ax + (bx - ax) * fraction, az + (bz - az) * fraction));
          remaining -= length;
        }
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = '#412417bd';
        ctx.stroke();
        ctx.lineWidth = 2.8;
        ctx.strokeStyle = path;
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x + 4.5, y + 4);
    ctx.lineTo(x, y + 2);
    ctx.lineTo(x - 4.5, y + 4);
    ctx.closePath();
    ctx.fillStyle = '#fff0df';
    ctx.strokeStyle = '#4c2d1e';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  }

  return (show, car, target, route) => {
    const now = performance.now();
    const changed = !visible || target !== lastTarget || route !== lastRoute;
    visible = show;
    if (!show || (!changed && now - lastFrame < FRAME_MS)) return;
    if (!changed && Math.hypot(car.x - lastX, car.z - lastZ) < 0.3 && Math.abs(car.h - lastHeading) < 0.01) return;
    draw(car, target, route);
    outer.clearRect(0, 0, outerCanvas.width, outerCanvas.height);
    outer.drawImage(canvas, 0, 0);
    lastX = car.x; lastZ = car.z; lastHeading = car.h;
    lastFrame = now; lastRoute = route; lastTarget = target;
  };
}
