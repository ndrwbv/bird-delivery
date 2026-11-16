export function pizzaRoofSign (THREE, add, y, z) {
  const scale = 0.64;
  const part = (geometry, color, x, height, offset) =>
    add(geometry.scale(scale, scale, scale), color, x * scale, y + height * scale, z + offset * scale);
  const shell = new THREE.Shape();
  shell.moveTo(-0.51, 0);
  shell.lineTo(0.51, 0);
  shell.lineTo(0.17, 0.42);
  shell.lineTo(-0.17, 0.42);
  shell.closePath();
  const depth = 0.38;
  const housing = new THREE.ExtrudeGeometry(shell, {
    depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1,
  });
  part(new THREE.BoxGeometry(1.04, 0.06, 0.47), '#36282a', 0, -0.02, 0);
  part(housing, '#d64221', 0, 0.015, -depth / 2);

  const slice = new THREE.Shape();
  slice.moveTo(-0.19, 0.08);
  slice.lineTo(0.19, 0.08);
  slice.lineTo(0.018, 0.355);
  slice.lineTo(-0.025, 0.355);
  slice.closePath();
  for (const side of [-1, 1]) {
    const angle = side < 0 ? Math.PI : 0;
    const face = side * (depth / 2 + 0.016);
    part(new THREE.ShapeGeometry(slice).rotateY(angle), '#ffd353', 0, 0.015, face);
    for (const [x, cy, r] of [[-0.081, 0.132, 0.031], [0.065, 0.148, 0.033], [0.004, 0.231, 0.038]]) {
      const dot = new THREE.CircleGeometry(r, 8).rotateY(angle);
      part(dot, '#c43c27', side * x, cy + 0.015, face + side * 0.002);
    }
  }
}
