const componentType = new Map([
  [Float32Array, 5126], [Uint8Array, 5121], [Uint16Array, 5123], [Uint32Array, 5125],
]);
const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export class Glb {
  data = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [],
    meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
  chunks = [];
  bytes = 0;

  view(array, target) {
    const buffer = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const i = this.data.bufferViews.length;
    this.data.bufferViews.push({ buffer: 0, byteOffset: this.bytes, byteLength: buffer.length, target });
    const padding = (4 - buffer.length % 4) % 4;
    this.chunks.push(buffer, new Uint8Array(padding));
    this.bytes += buffer.length + padding;
    return i;
  }

  accessor(array, type, target, { bounds = false, normalized = false } = {}) {
    const n = width[type];
    const accessor = { bufferView: this.view(array, target), componentType: componentType.get(array.constructor),
      count: array.length / n, type };
    if (bounds) {
      accessor.min = Array(n).fill(Infinity);
      accessor.max = Array(n).fill(-Infinity);
      for (let i = 0; i < array.length; i++) {
        const axis = i % n;
        accessor.min[axis] = Math.min(accessor.min[axis], array[i]);
        accessor.max[axis] = Math.max(accessor.max[axis], array[i]);
      }
    }
    if (normalized) accessor.normalized = true;
    return this.data.accessors.push(accessor) - 1;
  }

  mesh(name, positions, indices, material, { colors, normals, uv, uv2, translation } = {}) {
    const attributes = { POSITION: this.accessor(positions, 'VEC3', 34962, { bounds: true }) };
    if (colors) attributes.COLOR_0 = this.accessor(colors, 'VEC4', 34962, { normalized: true });
    if (normals) attributes.NORMAL = this.accessor(normals, 'VEC3', 34962);
    if (uv) attributes.TEXCOORD_0 = this.accessor(uv, 'VEC2', 34962);
    if (uv2) attributes.TEXCOORD_1 = this.accessor(uv2, 'VEC2', 34962);
    const indexType = positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
    const primitive = { attributes, indices: this.accessor(new indexType(indices), 'SCALAR', 34963), material };
    const mesh = this.data.meshes.push({ name, primitives: [primitive] }) - 1;
    const node = this.data.nodes.push({ name, mesh, translation }) - 1;
    this.data.scenes[0].nodes.push(node);
  }

  encode() {
    this.data.buffers = [{ byteLength: this.bytes }];
    const json = new TextEncoder().encode(JSON.stringify(this.data));
    const jsonEnd = 20 + Math.ceil(json.length / 4) * 4;
    const output = new Uint8Array(jsonEnd + 8 + this.bytes);
    const header = new DataView(output.buffer);
    header.setUint32(0, 0x46546c67, true); // glTF
    header.setUint32(4, 2, true);
    header.setUint32(8, output.length, true);
    header.setUint32(12, jsonEnd - 20, true);
    header.setUint32(16, 0x4e4f534a, true); // JSON
    output.fill(32, 20, jsonEnd);
    output.set(json, 20);
    header.setUint32(jsonEnd, this.bytes, true);
    header.setUint32(jsonEnd + 4, 0x004e4942, true); // BIN
    let offset = jsonEnd + 8;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }
}
