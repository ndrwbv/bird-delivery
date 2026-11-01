/* Запас нитро по настоящему периметру миникарты и раскрытой карты. */
import './nitroframe.css';

const NS = 'http://www.w3.org/2000/svg';
const frames = [];
export function init (targets) {
  for (const target of targets.filter(Boolean)) {
    const svg = document.createElementNS(NS, 'svg');
    svg.classList.add('nitro-frame');
    svg.setAttribute('role', 'progressbar');
    svg.setAttribute('aria-valuemin', '0'); svg.setAttribute('aria-valuemax', '100');
    const rect = cls => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('class', cls); r.setAttribute('pathLength', '100');
      r.setAttribute('x', '4'); r.setAttribute('y', '4');
      svg.appendChild(r); return r;
    };
    const track = rect('nf-track'), fill = rect('nf-fill');
    target.appendChild(svg);
    const resize = () => {
      const w = target.clientWidth, h = target.clientHeight;
      if (w < 9 || h < 9) return;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const radius = target.id === 'radar' ? 11 : 2;
      for (const r of [track, fill]) {
        r.setAttribute('width', w - 8); r.setAttribute('height', h - 8);
        r.setAttribute('rx', radius);
      }
    };
    const observer = new ResizeObserver(resize); observer.observe(target); resize();
    frames.push({ svg, fill, observer });
  }
}
export function update (tank, burning, label) {
  const amount = Math.max(0, Math.min(1, Number.isFinite(tank) ? tank : 0));
  for (const { svg, fill } of frames) {
    fill.setAttribute('stroke-dasharray', `${amount * 100} 100`);
    svg.setAttribute('aria-label', label);
    svg.setAttribute('aria-valuenow', Math.round(amount * 100));
    svg.classList.toggle('nf-burn', !!burning);
  }
}
