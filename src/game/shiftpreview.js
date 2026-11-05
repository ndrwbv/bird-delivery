// Карточка района берёт карту и два ракурса из текущего игрового мира.
export function drawMap (canvas, { base, x, y, scale, paint }) {
  if (!base || !scale) return;
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  const ratio = Math.min(620 * scale / w, base.width / w, base.height / h);
  const sw = w * ratio, sh = h * ratio;
  const left = Math.max(0, Math.min(base.width - sw, x - sw / 2));
  const top = Math.max(0, Math.min(base.height - sh, y - sh / 2));
  ctx.save();
  ctx.setTransform(1 / ratio, 0, 0, 1 / ratio, -left / ratio, -top / ratio);
  paint(ctx, ratio, [left, top, left + sw, top + sh]);
  ctx.restore();
  const px = (x - left) / ratio, py = (y - top) / ratio;
  ctx.beginPath(); ctx.arc(px, py - 5, 12, 0, Math.PI * 2);
  ctx.moveTo(px - 9, py); ctx.lineTo(px, py + 12); ctx.lineTo(px + 9, py);
  ctx.fillStyle = '#d85c43'; ctx.fill(); ctx.strokeStyle = '#fff8e8'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(px, py - 5, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff8e8'; ctx.fill();
}

export function drawPhotos ({ THREE, renderer, scene, place }, canvases) {
  const [first] = canvases;
  if (!first || !place) return;
  const { width: w, height: h } = first;
  const camera = new THREE.PerspectiveCamera(43, w / h, 0.5, 600);
  const target = new THREE.WebGLRenderTarget(w, h);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate;
  const pixels = new Uint8Array(w * h * 4);
  const { bx, by, bz, x, z } = place;
  const facing = Math.atan2(x - bx, z - bz);
  try {
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target);
    canvases.forEach((canvas, i) => {
      const angle = facing + (i ? 0.8 : -0.3);
      const radius = i ? 74 : 34;
      camera.position.set(bx + Math.sin(angle) * radius, by + (i ? 45 : 9), bz + Math.cos(angle) * radius);
      camera.lookAt(bx, by + 5, bz);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
      const ctx = canvas.getContext('2d'), image = ctx.createImageData(w, h);
      for (let row = 0; row < h; row++) {
        const start = (h - row - 1) * w * 4;
        image.data.set(pixels.subarray(start, start + w * 4), row * w * 4);
      }
      ctx.putImageData(image, 0, 0);
    });
  } finally {
    renderer.setRenderTarget(previous);
    renderer.shadowMap.autoUpdate = shadows;
    target.dispose();
  }
}
