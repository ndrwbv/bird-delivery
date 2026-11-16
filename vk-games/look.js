export function pizzaRoofSign (THREE, add, y, z) {
  const shell = new THREE.Shape();
  shell.moveTo(-0.51, 0);
  shell.lineTo(0.51, 0);
  shell.lineTo(0.25, 0.42);
  shell.lineTo(-0.25, 0.42);
  shell.closePath();
  const depth = 0.38;
  const housing = new THREE.ExtrudeGeometry(shell, {
    depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1,
  });
  add(new THREE.BoxGeometry(1.04, 0.06, 0.47), '#36282a', 0, y - 0.02, z);
  add(housing, '#d64221', 0, y + 0.015, z - depth / 2);

  const slice = new THREE.Shape();
  slice.moveTo(-0.19, 0.08);
  slice.lineTo(0.19, 0.08);
  slice.lineTo(0.018, 0.355);
  slice.lineTo(-0.025, 0.355);
  slice.closePath();
  for (const side of [-1, 1]) {
    const angle = side < 0 ? Math.PI : 0;
    const face = z + side * (depth / 2 + 0.016);
    add(new THREE.ShapeGeometry(slice).rotateY(angle), '#ffd353', 0, y + 0.015, face);
    for (const [x, cy, r] of [[-0.081, 0.132, 0.031], [0.065, 0.148, 0.033], [0.004, 0.231, 0.038]]) {
      const dot = new THREE.CircleGeometry(r, 8).rotateY(angle);
      add(dot, '#c43c27', side * x, y + cy + 0.015, face + side * 0.002);
    }
  }
}
