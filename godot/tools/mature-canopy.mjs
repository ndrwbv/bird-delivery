// The same canopy profiles form the trees on the pizzeria ring and on outer streets.
export function compactCrownRadius(height, style, limit = Infinity) {
  return Math.min(limit, Math.min(5.0, Math.max(0.76, height * 0.30)) * style.width);
}

export function canopyLobe(radius, height, rotation, index, random) {
  const theta = rotation + index * 2.39996;
  const top = index === 0;
  const skirt = top ? 0.14 : 0.43 + random() * 0.59;
  const level = top ? 0.86 : 0.49 + random() * 0.25;
  const width = radius * (top ? 0.81 : 0.49 + random() * 0.27);
  const tall = Math.max(0.55, height * (top ? 0.16 : 0.11 + random() * 0.047));
  return { theta, top, skirt, level, width, tall };
}
