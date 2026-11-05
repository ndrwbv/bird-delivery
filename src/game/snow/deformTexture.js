/* A contact updates one texture layer, never vertex or index buffers. Both
   detail levels sample the same packed snow height in the contact frame. */
import * as THREE from '../../vendor/three.module.min.js';
import { SNOW } from './config.js';

const WINDOW = 5, TILE = SNOW.TILE, SIDE = SNOW.CELLS + 2;
const LAYERS = WINDOW * WINDOW * 2, STRIDE = SIDE * SIDE * 2;

export const DEFORM_GLSL = `
uniform highp sampler2DArray uSnowDeform;
uniform highp sampler2D uSnowDeformSlots;
uniform vec2 uSnowDeformOrigin;
uniform float uSnowDeformSurface;
vec3 snowDeformCoords(vec2 p, float id) {
  vec2 local = p - uSnowDeformOrigin;
  vec2 tile = floor(local / ${TILE.toFixed(1)});
  if (min(tile.x, tile.y) < 0.0 || max(tile.x, tile.y) >= ${WINDOW.toFixed(1)}) return vec3(0.0, 0.0, -1.0);
  if (id != uSnowDeformSurface && id != 0.0) return vec3(0.0, 0.0, -1.0);
  float layer = tile.y * ${WINDOW.toFixed(1)} + tile.x + (id == uSnowDeformSurface ? 0.0 : ${(WINDOW * WINDOW).toFixed(1)});
  if (texelFetch(uSnowDeformSlots, ivec2(int(layer), 0), 0).r < 0.5) return vec3(0.0, 0.0, -1.0);
  return vec3(((local - tile * ${TILE.toFixed(1)}) / ${SNOW.CELL} + 1.0) / ${SIDE.toFixed(1)}, layer);
}
`;
export const DEFORM_TEXEL = 1 / SIDE;

export function createSnowDeformTexture(field) {
  const bytes = new Uint16Array(STRIDE * LAYERS);
  const texture = new THREE.DataArrayTexture(bytes, SIDE, SIDE, LAYERS);
  texture.format = THREE.RGFormat;
  texture.type = THREE.HalfFloatType;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const active = new Uint8Array(LAYERS);
  const slots = new THREE.DataTexture(active, LAYERS, 1, THREE.RedFormat);
  slots.unpackAlignment = 1;
  slots.needsUpdate = true;
  const uniforms = {
    uSnowDeform: { value: texture }, uSnowDeformSlots: { value: slots },
    uSnowDeformOrigin: { value: new THREE.Vector2() }, uSnowDeformSurface: { value: 0 },
  };
  const cache = Array.from({ length: LAYERS }, () => ({ id: -1, x: 0, z: 0, revision: 0 }));
  let offset = 0;
  let lastX, lastZ, lastId, lastEpoch;
  const put = (i, depth, compact) => {
    bytes[offset + i * 2] = THREE.DataUtils.toHalfFloat(depth);
    bytes[offset + i * 2 + 1] = THREE.DataUtils.toHalfFloat(compact);
  };
  const stats = { bytes: bytes.byteLength + active.byteLength, uploadBytes: 0, changed: 0 };
  return { uniforms, stats,
    update(x, z, id) {
      const tx0 = Math.floor(x / TILE) - 2, tz0 = Math.floor(z / TILE) - 2;
      stats.uploadBytes = 0;
      const epoch = field.deformationEpoch;
      if (lastX === tx0 && lastZ === tz0 && lastId === id && lastEpoch === epoch) return;
      lastX = tx0; lastZ = tz0; lastId = id; lastEpoch = epoch;
      uniforms.uSnowDeformOrigin.value.set(tx0 * TILE, tz0 * TILE);
      uniforms.uSnowDeformSurface.value = id;
      let uploads = 0, slotChanged = false;
      for (let i = 0; i < LAYERS; i++) {
        const secondary = i >= WINDOW * WINDOW;
        const layer = secondary ? 0 : id;
        const x = tx0 + i % WINDOW, z = tz0 + Math.floor(i / WINDOW) % WINDOW;
        const r = secondary && id === 0 ? 0 : field.deformationRevision(layer, x, z);
        const prev = cache[i];
        if (r === prev.revision && (!r || prev.x === x && prev.z === z && prev.id === layer)) continue;
        prev.id = layer; prev.x = x; prev.z = z; prev.revision = r;
        const enabled = r ? 255 : 0;
        if (active[i] !== enabled) { active[i] = enabled; slotChanged = true; }
        if (!r) continue;
        offset = i * STRIDE;
        bytes.fill(0, offset, offset + STRIDE);
        field.writeDeformation(layer, x, z, put);
        texture.addLayerUpdate(i); uploads++;
      }
      if (uploads) texture.needsUpdate = true;
      if (slotChanged) slots.needsUpdate = true;
      stats.changed += uploads;
      stats.uploadBytes = uploads * STRIDE * bytes.BYTES_PER_ELEMENT + (slotChanged ? active.byteLength : 0);
    },
    dispose() { texture.dispose(); slots.dispose(); },
  };
}
