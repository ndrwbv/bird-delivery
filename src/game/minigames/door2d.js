/* Портретная сцена поверх существующего 3D-подъезда. Реплики и выбор ведёт dialog.js;
   здесь только слои кадра и анимация спрайта из манифеста персонажа. */
import './door2d.css';

const CACHE = new Map();
const between = (a, b) => a + Math.random() * (b - a);

function load (path) {
  const url = new URL(path, document.baseURI).href;
  if (CACHE.has(url)) return CACHE.get(url);
  const promise = fetch(url).then(r => {
    if (!r.ok) throw new Error('Манифест диалога: ' + r.status);
    return r.json();
  }).then(async manifest => {
    const sprites = {};
    await Promise.all(Object.entries(manifest.sprites || {}).map(async ([state, file]) => {
      const image = new Image();
      image.src = new URL(file, url).href;
      await image.decode();
      sprites[state] = image.src;
    }));
    if (!sprites.idle || !sprites.talk || !sprites.blink) throw new Error('Не хватает спрайтов диалога');
    return { manifest, sprites };
  });
  CACHE.set(url, promise);
  promise.catch(() => CACHE.delete(url));
  return promise;
}

export const prepare = path => load(path);
export const enabled = (scenario, v3) => !!(v3 && scenario && scenario.portrait && scenario.portrait.manifest &&
  !(typeof location !== 'undefined' && new URLSearchParams(location.search).has('door3d')));

export async function open (path, paused = () => false) {
  const { manifest, sprites } = await load(path);
  const root = document.createElement('div');
  root.id = 'door2d';
  root.innerHTML = '<div class="door2d-shade"></div><div class="door2d-frame"><img alt=""></div>';
  const sprite = root.querySelector('img');
  sprite.src = sprites.idle;
  sprite.width = manifest.spriteSize?.[0] || 500;
  sprite.height = manifest.spriteSize?.[1] || 555;
  (document.getElementById('game') || document.body).appendChild(root);
  document.body.classList.add('door-dialogue');
  const enterRaf = requestAnimationFrame(() => root.classList.add('on'));

  let closed = false, raf = 0, last = performance.now(), elapsed = 0;
  let emotion = 'idle', speaking = false, mouth = false, blinkLeft = 0;
  let blinkAt = between(...(manifest.animation?.blink?.intervalSeconds || [3.5, 7]));
  let mouthAt = between(...(manifest.animation?.talk?.stateSwitchSeconds || [0.15, 0.3]));
  const show = state => { const src = sprites[state] || sprites.idle; if (sprite.src !== src) sprite.src = src; };
  const tick = now => {
    if (closed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused()) { root.classList.add('paused'); return; }
    root.classList.remove('paused');
    elapsed += dt;
    const breath = manifest.animation?.idleBreath || {};
    const period = breath.periodSeconds || 3.5, wave = Math.sin(elapsed * Math.PI * 2 / period);
    const sx = breath.scaleX || [0.998, 1.002], sy = breath.scaleY || [0.998, 1.004];
    sprite.style.transform = `scale(${1 + wave * (sx[1] - sx[0]) / 2}, ${1 + wave * (sy[1] - sy[0]) / 2})`;
    if (speaking) {
      mouthAt -= dt;
      if (mouthAt <= 0) { mouth = !mouth; mouthAt = between(...(manifest.animation?.talk?.stateSwitchSeconds || [0.15, 0.3])); }
      show(mouth ? 'talk' : 'idle');
    } else {
      if (blinkLeft > 0) blinkLeft -= dt;
      else if ((blinkAt -= dt) <= 0) {
        blinkLeft = manifest.animation?.blink?.durationSeconds || 0.12;
        blinkAt = between(...(manifest.animation?.blink?.intervalSeconds || [3.5, 7]));
      }
      show(blinkLeft > 0 ? 'blink' : emotion);
    }
  };
  raf = requestAnimationFrame(tick);
  return {
    line (state) { emotion = sprites[state] ? state : 'idle'; blinkLeft = 0; mouth = false; show(emotion); },
    talk (on) { speaking = !!on; mouth = false; mouthAt = between(...(manifest.animation?.talk?.stateSwitchSeconds || [0.15, 0.3])); if (!on) show(emotion); },
    close () {
      if (closed) return;
      closed = true; cancelAnimationFrame(raf); cancelAnimationFrame(enterRaf);
      root.classList.remove('on'); document.body.classList.remove('door-dialogue');
      setTimeout(() => root.remove(), 260);
    },
  };
}
