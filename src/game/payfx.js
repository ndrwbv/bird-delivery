/* CSS draws the pile and receipt; the flight transform advances with game dt.
   No timeout can finish a payment under pause, a map, a scene, or a later shift. */
let active = null;
export function show (o) {
  hide(); active = { ...o, t: 0, flying: false };
  for (const b of o.bits) { b.style.removeProperty('transform'); b.style.removeProperty('opacity'); }
  o.el.hidden = false; o.el.classList.remove('on', 'fly');
  void o.el.offsetWidth; o.el.classList.add('on');
  sync(active);
}
function sync (p) {
  for (const an of p.el.getAnimations({ subtree: true })) {
    an.pause();
    an.currentTime = Math.max(0, p.t - (an.animationName === 'pf-fly' ? 1.45 : 0)) * 1000;
  }
}
export function step (dt) {
  const p = active;
  if (!p) return;
  if (p.touch) p.touch();                         // a common payment also owns a manual queue slot
  if (p.ready && !p.ready()) return;
  p.t += dt;
  if (!p.flying && p.t >= 1.45) {
    p.flying = true;
    const w = p.target()?.getBoundingClientRect();
    if (w && w.width > 0) for (const b of p.bits) {
      if (b.className === 'x') continue;
      const r = b.getBoundingClientRect();
      b.style.setProperty('--fx', Math.round(w.left + w.width / 2 - r.left - r.width / 2) + 'px');
      b.style.setProperty('--fy', Math.round(w.top + w.height / 2 - r.top - r.height / 2) + 'px');
    }
    p.el.classList.add('fly');
  }
  sync(p);
  if (p.flying) for (const b of p.bits) {
    if (b.className === 'x') continue;
    const delay = parseFloat(b.style.getPropertyValue('--fd')) || 0;
    const q = Math.max(0, Math.min(1, (p.t - 1.45 - delay) / .65));
    const ease = q * q * (3 - 2 * q);
    const x = (parseFloat(b.style.getPropertyValue('--fx')) || 0) * ease;
    const y = (parseFloat(b.style.getPropertyValue('--fy')) || 0) * ease;
    const r = parseFloat(b.style.getPropertyValue('--r')) || 0;
    b.style.setProperty('transform', `translate(${x}px, ${y}px) rotate(${r + (90 - r) * ease}deg) scale(${1 - .65 * ease})`, 'important');
    b.style.setProperty('opacity', String(1 - .8 * ease), 'important');
  }
  if (p.t >= 2.4) { const done = p.done; hide(); if (done) done(); }
}
export function hide () {
  if (!active) return;
  const p = active; active = null;
  for (const an of p.el.getAnimations({ subtree: true })) an.cancel();
  p.el.hidden = true; p.el.classList.remove('on', 'fly');
}
export const DEBUG = { get active () { return active ? { t: active.t, flying: active.flying } : null; } };
