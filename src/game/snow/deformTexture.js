/* A contact updates one texture layer, never vertex or index buffers. Both
   detail levels sample the same packed snow height in the contact frame. */
import * as THREE from '../../vendor/three.module.min.js';
import { SNOW } from './config.js';

const WINDOW = 5, TILE = SNOW.TILE, SIDE = SNOW.CELLS + 2;
const SLOTS = WINDOW * WINDOW, LAYERS = SLOTS * 2, STRIDE = SIDE * SIDE * 2;
const wrap = n => (n % WINDOW + WINDOW) % WINDOW;

export const DEFORM_GLSL = `
uniform highp sampler2DArray uSnowDeform;
uniform highp sampler2D uSnowDeformSlots;
uniform vec2 uSnowDeformOrigin;
uniform vec2 uSnowDeformOffset;
uniform float uSnowDeformSurface;
vec3 snowDeformCoords(vec2 p, float id) {
  vec2 local = p - uSnowDeformOrigin;
  vec2 tile = floor(local / ${TILE.toFixed(1)});
  if (min(tile.x, tile.y) < 0.0 || max(tile.x, tile.y) >= ${WINDOW.toFixed(1)}) return vec3(0.0, 0.0, -1.0);
  if (id != uSnowDeformSurface && id != 0.0) return vec3(0.0, 0.0, -1.0);
  vec2 slot = mod(tile + uSnowDeformOffset, ${WINDOW.toFixed(1)});
  float layer = slot.y * ${WINDOW.toFixed(1)} + slot.x + (id == uSnowDeformSurface ? 0.0 : ${SLOTS.toFixed(1)});
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
    uSnowDeformOrigin: { value: new THREE.Vector2() },
    uSnowDeformOffset: { value: new THREE.Vector2() }, uSnowDeformSurface: { value: 0 },
  };
  const cache = Array.from({ length: LAYERS }, () => ({ id: -1, x: 0, z: 0, revision: 0, weather: -1 }));
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
      // Overlapping world tiles keep their layer when the camera crosses
      // an edge. Only the incoming row or column can reuse those slots.
      const ox = wrap(tx0), oz = wrap(tz0);
      uniforms.uSnowDeformOffset.value.set(ox, oz);
      uniforms.uSnowDeformSurface.value = id;
      let uploads = 0, slotChanged = false;
      const weather = field.deformationWeather;
      for (let i = 0; i < LAYERS; i++) {
        const secondary = i >= SLOTS;
        const layer = secondary ? 0 : id;
        const x = tx0 + wrap(i % WINDOW - ox);
        const z = tz0 + wrap(Math.floor(i / WINDOW) % WINDOW - oz);
        const r = secondary && id === 0 ? 0 : field.deformationRevision(layer, x, z);
        const prev = cache[i];
        const sameTile = prev.x === x && prev.z === z && prev.id === layer;
        if (r === prev.revision && (!r || sameTile)) continue;
        const patch = r && sameTile && prev.revision ? field.deformationPatch(layer, x, z, prev.revision, prev.weather) : null;
        prev.id = layer; prev.x = x; prev.z = z; prev.revision = r; prev.weather = weather;
        const enabled = r ? 255 : 0;
        if (active[i] !== enabled) { active[i] = enabled; slotChanged = true; }
        if (!r) continue;
        offset = i * STRIDE;
        if (!patch) bytes.fill(0, offset, offset + STRIDE);
        field.writeDeformation(layer, x, z, put, patch);
        prev.revision = field.deformationRevision(layer, x, z);
        field.clearDirty(layer, x, z, field.getRevision(layer, x, z), 'near');
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
