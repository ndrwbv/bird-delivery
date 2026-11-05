/* Ближний снег — одна поверхность вместо накладных полос.
   Плитки по 8 м объединены по четыре в страницу: до девяти draw calls.
   Маска владельца публикуется только после готовности геометрии и учитывает
   высоту опоры, поэтому снег моста не стирает снег земли под ним. */
import * as THREE from '../../vendor/three.module.min.js';
import { createSnowBaseline } from './baseline.js';
import { createSnowDeformTexture, DEFORM_GLSL, DEFORM_TEXEL } from './deformTexture.js';

const TILE = 8, NEAR_GRID = 32, WINDOW = 5, MASK_N = WINDOW * NEAR_GRID;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tileKey = (id, x, z) => `${id}:${x}:${z}`;
// The RG channels contain base elevation (1/32 m); B is the legacy envelope
// above that base (1/16 m), A says this exact quad has a replacement.
const MASK_WIDTH = MASK_N * 2;
const NEAR_BYTES = new Uint8Array(MASK_WIDTH * MASK_N * 4);
const NEAR_TEXTURE = new THREE.DataTexture(NEAR_BYTES, MASK_WIDTH, MASK_N,
  THREE.RGBAFormat, THREE.UnsignedByteType);
NEAR_TEXTURE.magFilter = NEAR_TEXTURE.minFilter = THREE.NearestFilter;
NEAR_TEXTURE.generateMipmaps = false;
NEAR_TEXTURE.needsUpdate = true;
const FAR_N = 17 * 16;
const FAR_BYTES = new Uint8Array(FAR_N * FAR_N * 4);
const FAR_TEXTURE = new THREE.DataTexture(FAR_BYTES, FAR_N, FAR_N, THREE.RGBAFormat, THREE.UnsignedByteType);
FAR_TEXTURE.magFilter = FAR_TEXTURE.minFilter = THREE.NearestFilter;
FAR_TEXTURE.generateMipmaps = false;
FAR_TEXTURE.needsUpdate = true;
// One sample per metre, linearly filtered. Tracks on completed tiles stay
// detailed when an unrelated tile further up the road is still streaming.
const READY_SIDE = 41;
const readyBytes = new Uint8Array(READY_SIDE * READY_SIDE);
const readyMap = new THREE.DataTexture(readyBytes, READY_SIDE, READY_SIDE, THREE.RedFormat);
readyMap.magFilter = readyMap.minFilter = THREE.LinearFilter;
readyMap.unpackAlignment = 1;
readyMap.needsUpdate = true;
export const SNOW_UNIFORMS = {
  uSnowLocalReady: { value: readyMap },
  uSnowFocus: { value: new THREE.Vector2() },
  uSnowNearRadius: { value: 0 },
  uSnowFarRadius: { value: 0 },
  uSnowOwnerMap: { value: NEAR_TEXTURE },
  uSnowOwnerOrigin: { value: new THREE.Vector2(0, 0) },
  uSnowOwnerOn: { value: 0 },
  uSnowFarMap: { value: FAR_TEXTURE },
  uSnowFarOrigin: { value: new THREE.Vector2(0, 0) },
  uSnowFarOn: { value: 0 },
};

// Readiness selects a complete replacement. It never scales snow height.
// In particular, a missing outer tile cannot retract the whole middle layer.
const transitionGLSL = `
uniform sampler2D uSnowLocalReady;
uniform vec2 uSnowOwnerOrigin;
uniform vec2 uSnowFocus;
uniform float uSnowNearRadius;
uniform float uSnowFarRadius;
float snowBlend(vec2 p, float radius, float feather) {
  return smoothstep(0.0, feather, radius - distance(p, uSnowFocus));
}
float snowNearBlend(vec2 p) {
  vec2 uv = (p - uSnowOwnerOrigin + 0.5) / 41.0;
  return snowBlend(p, uSnowNearRadius, 4.0) * texture2D(uSnowLocalReady, uv).r;
}

`;
export const LEGACY_SNOW_GLSL = `
#ifndef LIVING_SNOW_OWNER
#define LIVING_SNOW_OWNER
${transitionGLSL}
uniform sampler2D uSnowOwnerMap;
uniform float uSnowOwnerOn;
uniform sampler2D uSnowFarMap;
uniform vec2 uSnowFarOrigin;
uniform float uSnowFarOn;
float snowOwnerLayer(vec3 worldP, vec2 uv) {
  vec4 a = texture2D(uSnowOwnerMap, uv);
  if (a.a < 0.5) return 0.0;
  float base = (floor(a.r * 255.0 + 0.5) * 256.0 + floor(a.g * 255.0 + 0.5)) / 32.0 - 512.0;
  float top = base + floor(a.b * 255.0 + 0.5) / 16.0;
  return step(base - 0.14, worldP.y) * step(worldP.y, top + 0.08);
}
float snowOwnedNear(vec3 worldP) {
  if (uSnowOwnerOn < 0.5 || snowNearBlend(worldP.xz) < 0.5) return 0.0;
  vec2 uv = (worldP.xz - uSnowOwnerOrigin) / 40.0;
  if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) >= 1.0) return 0.0;
  uv.x *= 0.5;
  return max(snowOwnerLayer(worldP, uv), snowOwnerLayer(worldP, uv + vec2(0.5, 0.0)));
}
float snowOwned(vec3 worldP) {
  float nearOwner = snowOwnedNear(worldP);
  if (nearOwner > 0.5 || uSnowFarOn < 0.5 || distance(worldP.xz, uSnowFocus) >= uSnowFarRadius) return nearOwner;
  vec2 uv = (worldP.xz - uSnowFarOrigin) / 136.0;
  if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) >= 1.0) return 0.0;
  vec4 a = texture2D(uSnowFarMap, uv);
  if (a.a < 0.5) return 0.0;
  float base = (floor(a.r * 255.0 + 0.5) * 256.0 + floor(a.g * 255.0 + 0.5)) / 32.0 - 512.0;
  float top = base + floor(a.b * 255.0 + 0.5) / 16.0;
  return step(base - 0.14, worldP.y) * step(worldP.y, top + 0.08);
}
#endif
`;

export function bindSnowUniforms (shader) {
  Object.assign(shader.uniforms, SNOW_UNIFORMS);
}

/** Snow-only materials, or a snow branch of a mixed material (predicate).
 * For seasonal tint use LEGACY_SNOW_GLSL and cov *= 1.0-snowOwned(vSW),
 * not discard: the underlying asphalt/grass must remain visible. */
export function patchLegacySnow (material, { predicate = 'true' } = {}) {
  if (!material || material.userData.livingSnowOwner) return material;
  material.userData.livingSnowOwner = true;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const key = previousKey ? previousKey.call(material) : '';
  material.onBeforeCompile = function (shader, renderer) {
    if (previous) previous.call(this, shader, renderer);
    bindSnowUniforms(shader);
    shader.vertexShader = 'varying vec3 vSnowLegacyWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      vec4 snowLegacyP = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      snowLegacyP = instanceMatrix * snowLegacyP;
      #endif
      vSnowLegacyWorld = (modelMatrix * snowLegacyP).xyz;`);
    shader.fragmentShader = 'varying vec3 vSnowLegacyWorld;\n' + LEGACY_SNOW_GLSL + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
      #include <clipping_planes_fragment>
      if (${predicate}) { if (snowOwned(vSnowLegacyWorld) > 0.5) discard; }`);
  };
  material.customProgramCacheKey = () => key + '|living-snow-owner-1:' + predicate;
  material.needsUpdate = true;
  return material;
}

function snowMaterial (coarse, deform) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true,
    side: THREE.DoubleSide, transparent: false, depthWrite: true });
  m.name = 'living-snow';
  m.userData.snowSurface = true;
  m.userData.snowSeason = { value: 1 };
  m.onBeforeCompile = shader => {
    bindSnowUniforms(shader);
    Object.assign(shader.uniforms, deform.uniforms);
    shader.uniforms.uSnowSeason = m.userData.snowSeason;
    shader.vertexShader = DEFORM_GLSL + `
attribute float snowCover;
attribute float snowDepth;
attribute vec2 snowSupport;
uniform float uSnowSeason;
varying float vSnowCover, vSnowDepth, vSnowCompacted;
varying vec3 vSnowWorld;
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
      #include <beginnormal_vertex>
      vec3 snowCoords = snowDeformCoords(position.xz, snowSupport.y);
      vec2 snowChange = vec2(0.0);
      if (snowCoords.z >= 0.0 && snowCover > 0.01) {
        snowChange = texture(uSnowDeform, snowCoords).rg;
        vec3 dx = vec3(${DEFORM_TEXEL.toFixed(9)}, 0.0, 0.0), dz = dx.yxz;
        float east = texture(uSnowDeform, snowCoords + dx).r, west = texture(uSnowDeform, snowCoords - dx).r;
        float north = texture(uSnowDeform, snowCoords + dz).r, south = texture(uSnowDeform, snowCoords - dz).r;
        // A narrow tyre can pass between mesh vertices. Reuse the normal
        // taps so the wheel's groove is visible on the stationary grid.
        float dent = min(min(east, west), min(north, south));
        snowChange.r += 0.45 * min(0.0, min(dent, 0.0) - snowChange.r) * step(dent, -0.01);
        objectNormal.xz -= vec2(east - west, north - south) * (4.0 * uSnowSeason * objectNormal.y);
        objectNormal = normalize(objectNormal);
      }`);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float localDepth = max(0.0, snowDepth + snowChange.r) * uSnowSeason;
      transformed.y = snowSupport.x + localDepth + 0.002;`);
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      vSnowDepth = localDepth;
      vSnowCover = snowCover;
      vSnowCompacted = max(snowChange.g, -snowChange.r) * uSnowSeason;
      vSnowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = LEGACY_SNOW_GLSL + `varying float vSnowCover;
varying float vSnowDepth;
varying float vSnowCompacted;
varying vec3 vSnowWorld;
float snGrain(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      // Continuous opaque snow; no stochastic holes in coverage or LODs.
      ${coarse ? 'if (snowOwnedNear(vSnowWorld) > 0.5 || distance(vSnowWorld.xz, uSnowFocus) >= uSnowFarRadius) discard;'
        : 'if (snowNearBlend(vSnowWorld.xz) < 0.5) discard;'}
      if (vSnowDepth <= 0.004 || vSnowCover < 0.05) discard;
      float snowNear = 1.0 - smoothstep(12.0, 35.0, length(vSnowWorld.xz - cameraPosition.xz));
      float snowGrain = snGrain(floor(vSnowWorld.xz * 35.0));
      diffuseColor.rgb *= (0.985 + (snowGrain - 0.5) * 0.018 * snowNear) * (1.0 - min(0.18, vSnowCompacted * 0.72));`);
  };
  m.customProgramCacheKey = () => 'living-snow-displacement-1-' + coarse;
  return m;
}

function createSnowLayer ({ scene, field, surfaces, baseline, deform, coarse = false }) {
  const N = coarse ? 16 : NEAR_GRID, STEP = TILE / N, SIDE = N + 1, VERTS = SIDE * SIDE;
  const QUADS = N * N, INDICES = QUADS * 6, RADIUS = coarse ? 8 : 2;
  const WINDOW = RADIUS * 2 + 1, MASK_N = WINDOW * N, LAYERS = coarse ? 1 : 2, MASK_WIDTH = MASK_N * LAYERS;
  const PAGE = coarse ? 4 : 2, SLOTS = PAGE * PAGE;
  const OWNER_BYTES = coarse ? FAR_BYTES : NEAR_BYTES, OWNER_TEXTURE = coarse ? FAR_TEXTURE : NEAR_TEXTURE;
  const ownerOrigin = coarse ? SNOW_UNIFORMS.uSnowFarOrigin : SNOW_UNIFORMS.uSnowOwnerOrigin;
  const ownerOn = coarse ? SNOW_UNIFORMS.uSnowFarOn : SNOW_UNIFORMS.uSnowOwnerOn;
  let revealRadius = 0;
  const ages = new Int16Array(25).fill(-1);
  const tiles = new Map(), pages = new Map();
  const material = snowMaterial(coarse, deform);
  const baselineNormal = {x:0,z:0};
  const sample = {}, wanted = new Map();
  let cx = Infinity, cz = Infinity, activeId = null, on = false;
  let ownerDirty = true, disposed = false, pending = null;
  const stats = { tiles: 0, pages: 0, triangles: 0, cpuBytes: 0, gpuBytes: 0,
    uploadBytes: 0, built: 0, rebuilt: 0, buildMs: 0, updateMs: 0, pending: 0 };

  function pageFor (id, tx, tz) {
    const px = Math.floor(tx / PAGE), pz = Math.floor(tz / PAGE), k = tileKey(id, px, pz);
    let page = pages.get(k);
    if (page) return page;
    const g = new THREE.BufferGeometry();
    const p = new THREE.BufferAttribute(new Float32Array(VERTS * SLOTS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const n = new THREE.BufferAttribute(new Float32Array(VERTS * SLOTS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.BufferAttribute(new Uint8Array(VERTS * SLOTS * 3), 3, true).setUsage(THREE.DynamicDrawUsage);
    const h = new THREE.BufferAttribute(new Float32Array(VERTS * SLOTS), 1).setUsage(THREE.DynamicDrawUsage);
    const support = new THREE.BufferAttribute(new Float32Array(VERTS * SLOTS * 2), 2).setUsage(THREE.DynamicDrawUsage);
    const index = new THREE.BufferAttribute(new Uint16Array(INDICES * SLOTS), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', p); g.setAttribute('normal', n); g.setAttribute('color', c);
    g.setAttribute('snowCover', new THREE.BufferAttribute(new Uint8Array(VERTS * SLOTS), 1, true).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('snowDepth', h); g.setAttribute('snowSupport', support); g.setIndex(index);
    g.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(g, material);
    mesh.name = `snow-page:${k}`;
    mesh.userData.snowDynamic = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    // Conservative fixed bounds include all accepted snow depth and slopes;
    // updateBounds narrows them after each completed tile.
    g.boundingBox = new THREE.Box3(new THREE.Vector3(px * TILE * PAGE, -512, pz * TILE * PAGE),
      new THREE.Vector3((px + 1) * TILE * PAGE, 1536, (pz + 1) * TILE * PAGE));
    g.boundingSphere = new THREE.Sphere(); g.boundingBox.getBoundingSphere(g.boundingSphere);
    scene.add(mesh);
    page = { key: k, px, pz, mesh, g, p, n, c, h, support, index, tiles: new Set(), min: Infinity, max: -Infinity };
    pages.set(k, page);
    return page;
  }

  function changed (attr, start, count) {
    attr.addUpdateRange(start, count); attr.needsUpdate = true;
    stats.uploadBytes += count * attr.array.BYTES_PER_ELEMENT;
  }

  function updateBounds (page) {
    let lo = Infinity, hi = -Infinity;
    for (const tile of page.tiles) { lo = Math.min(lo, tile.min); hi = Math.max(hi, tile.max); }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    page.g.boundingBox.min.set(page.px * TILE * PAGE, lo - 0.2, page.pz * TILE * PAGE);
    page.g.boundingBox.max.set((page.px + 1) * TILE * PAGE, hi + 0.2, (page.pz + 1) * TILE * PAGE);
    page.g.boundingBox.getBoundingSphere(page.g.boundingSphere);
  }

  // Empty slots and compacted pavement must not submit thousands of
  // degenerate triangles. Only residency changes repack this buffer.
  function updateIndices (page) {
    let count = 0;
    for (const tile of page.tiles) {
      page.index.array.set(tile.elements, count);
      count += tile.elements.length;
    }
    page.g.setDrawRange(0, count);
    if (count) changed(page.index, 0, count);
  }

  function makeTile (id, tx, tz, original = null) {
    const page = pageFor(id, tx, tz), slot = (tz - page.pz * PAGE) * PAGE + tx - page.px * PAGE;
    const tile = { id, tx, tz, key: tileKey(id, tx, tz), page, slot, stale: false, min: Infinity, max: -Infinity,
      restNormal: new Float32Array(VERTS * 2), base: new Float32Array(VERTS), envelope: new Float32Array(VERTS),
      depth: new Float32Array(VERTS), cover: new Uint8Array(VERTS), colours: new Uint8Array(VERTS * 3),
      valid: new Uint8Array(VERTS), material: new Uint8Array(VERTS), fence: new Uint8Array(VERTS), owner: new Uint8Array(QUADS * 4), triangles: 0 };
    pending = { tile, original, row: 0, workMs: 0 };
  }

  function fillRow (tile, j) {
    const { tx, tz, id } = tile;
    for (let i = 0; i <= N; i++) {
      const k = j * SIDE + i, x = tx * TILE + i * STEP, z = tz * TILE + j * STEP;
      surfaces.initial(id, x, z, sample);
      const valid = sample.valid && Number.isFinite(sample.baseY);
      const depth = valid && sample.deformable ? sample.thickness : 0;
      tile.valid[k] = valid ? 1 : 0;
      tile.base[k] = valid ? sample.baseY : 0;
      tile.material[k] = sample.materialId;
      tile.fence[k] = Math.round(255 * sample.fenceCover);
      if (depth > 0) baseline.height(id, x, z, 1, sample.baseY + depth, baselineNormal);
      tile.restNormal[k * 2] = depth > 0 ? baselineNormal.x : 0;
      tile.restNormal[k * 2 + 1] = depth > 0 ? baselineNormal.z : 0;
      const rest = Number.isFinite(baselineNormal.depth) ? baselineNormal.depth : depth;
      tile.depth[k] = depth > 0 ? Math.min(rest, depth + 0.03) : 0;
      tile.cover[k] = depth > 0 ? Math.round(255 * sample.visualCoverage) : 0;
      tile.envelope[k] = valid ? Math.max(sample.legacyTopY || sample.baseY + 0.12, sample.baseY + 0.4) : 0;
      const compact = clamp(sample.compaction || 0, 0, 1), wet = clamp(sample.wetness || 0, 0, 1);
      const dirt = clamp((sample.dirt || 0) * 0.6 + (sample.sand || 0) * 0.16, 0, 0.6);
      const dark = 1 - 0.11 * compact - 0.1 * wet;
      const c = k * 3;
      tile.colours[c] = Math.round(255 * (0.86 * dark * (1 - dirt) + 0.26 * dirt));
      tile.colours[c + 1] = Math.round(255 * (0.9 * dark * (1 - dirt) + 0.22 * dirt));
      tile.colours[c + 2] = Math.round(255 * (0.93 * dark * (1 - dirt) + 0.18 * dirt));
    }
  }

  function progressPending () {
    if (!pending) return;
    const started = performance.now(), job = pending, { tile, original } = job;
    let rows = 0;
    do { fillRow(tile, job.row++); rows++; }
    while (job.row <= N && rows < 16 && performance.now() - started < (coarse ? 0.65 : 1.1));
    if (job.row <= N) { job.workMs += performance.now() - started; return; }
    if (original) { tile.page.tiles.delete(original); stats.rebuilt++; }
    else stats.built++;
    tile.page.tiles.add(tile); tiles.set(tile.key, tile);
    publishMesh(tile);
    tile.page.mesh.visible = on;
    ownerDirty = true;
    stats.buildMs = job.workMs + performance.now() - started;
    pending = null;
  }

  function cancelPending () {
    if (!pending) return;
    const { page } = pending.tile;
    if (!page.tiles.size) { page.mesh.removeFromParent(); page.g.dispose(); pages.delete(page.key); }
    pending = null;
  }

  function publishMesh (tile) {
    const { tx, tz, id, page, slot } = tile, offset = slot * VERTS;
    const p = page.p.array, n = page.n.array;
    const coverage = page.g.attributes.snowCover;
    page.c.array.set(tile.colours, offset * 3); coverage.array.set(tile.cover, offset);
    page.h.array.set(tile.depth, offset);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * SIDE + i, v = offset + k, y = tile.base[k];
      p[v * 3] = tx * TILE + i * STEP; p[v * 3 + 1] = y + tile.depth[k]; p[v * 3 + 2] = tz * TILE + j * STEP;
      page.support.array[v * 2] = y; page.support.array[v * 2 + 1] = id;
      const nx = tile.restNormal[k * 2], nz = tile.restNormal[k * 2 + 1], norm = Math.hypot(nx, 1, nz);
      n[v * 3] = nx / norm; n[v * 3 + 1] = 1 / norm; n[v * 3 + 2] = nz / norm;
      if (tile.valid[k]) { tile.min = Math.min(tile.min, y); tile.max = Math.max(tile.max, y + tile.depth[k] + 0.4, tile.envelope[k]); }
    }
    const elements = new Uint16Array(INDICES);
    let count = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * SIDE + i, q = j * N + i, kb = k + 1, kc = k + SIDE, kd = kc + 1;
      if (!(tile.cover[k] || tile.cover[kb] || tile.cover[kc] || tile.cover[kd])) continue;
      if (!(tile.valid[k] && tile.valid[kb] && tile.valid[kc] && tile.valid[kd])) continue;
      // Both diagonals must stay on one receiver. Crossing a curb can
      // otherwise leave a wedge of snow suspended above the lower side.
      const base = Math.min(tile.base[k], tile.base[kb], tile.base[kc], tile.base[kd]);
      const high = Math.max(tile.base[k], tile.base[kb], tile.base[kc], tile.base[kd]);
      const material = tile.material[k];
      const mixed = material !== tile.material[kb] || material !== tile.material[kc] || material !== tile.material[kd];
      if (high - base > (mixed ? 0.065 : 0.20)) continue;
      if (!tile.fence[k] || !tile.fence[kb] || !tile.fence[kc] || !tile.fence[kd]) continue;
      const a = offset + k, b = offset + kb, c = offset + kc, d = offset + kd;
      elements[count++] = a; elements[count++] = c; elements[count++] = b;
      elements[count++] = b; elements[count++] = c; elements[count++] = d;
      if (Math.min(tile.cover[k], tile.cover[kb], tile.cover[kc], tile.cover[kd]) <= 13
        || Math.min(tile.depth[k], tile.depth[kb], tile.depth[kc], tile.depth[kd]) <= 0.004) continue;
      const top = Math.max(tile.envelope[k], tile.envelope[kb], tile.envelope[kc], tile.envelope[kd]);
      const packed = clamp(Math.round((base + 512) * 32), 0, 65535), at = q * 4;
      tile.owner[at] = packed >> 8; tile.owner[at + 1] = packed & 255;
      tile.owner[at + 2] = clamp(Math.ceil((top - base) * 16), 0, 255); tile.owner[at + 3] = 255;
    }
    tile.elements = elements.subarray(0, count);
    tile.triangles = count / 3;
    tile.restNormal = tile.base = tile.envelope = tile.depth = tile.cover = tile.colours = tile.valid = tile.material = tile.fence = null;
    changed(page.p, offset * 3, VERTS * 3); changed(page.n, offset * 3, VERTS * 3);
    changed(page.c, offset * 3, VERTS * 3); changed(coverage, offset, VERTS);
    changed(page.h, offset, VERTS); changed(page.support, offset * 2, VERTS * 2);
    updateIndices(page);
    updateBounds(page);
  }

  function drop (tile) {
    tiles.delete(tile.key); tile.page.tiles.delete(tile);
    if (!tile.page.tiles.size && pending?.tile.page !== tile.page) {
      tile.page.mesh.removeFromParent(); tile.page.g.dispose(); pages.delete(tile.page.key);
    } else {
      updateIndices(tile.page);
      updateBounds(tile.page);
    }
    ownerDirty = true;
  }

  function publishOwner () {
    if (!ownerDirty) return;
    OWNER_BYTES.fill(0);
    for (const tile of tiles.values()) {
      const layer = tile.id === activeId ? 0 : !coarse && activeId !== 0 && tile.id === 0 ? 1 : -1;
      if (layer < 0) continue;
      const ox = (tile.tx - (cx - RADIUS)) * N, oz = (tile.tz - (cz - RADIUS)) * N;
      if (ox < 0 || oz < 0 || ox + N > MASK_N || oz + N > MASK_N) continue;
      for (let j = 0; j < N; j++) {
        const at = ((oz + j) * MASK_WIDTH + layer * MASK_N + ox) * 4;
        OWNER_BYTES.set(tile.owner.subarray(j * N * 4, (j + 1) * N * 4), at);
      }
    }
    ownerOrigin.value.set((cx - RADIUS) * TILE, (cz - RADIUS) * TILE);
    OWNER_TEXTURE.needsUpdate = true; ownerDirty = false;
    stats.uploadBytes += OWNER_BYTES.byteLength;
  }

  function updateLocalReadiness(moved) {
    let changed = moved;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
      const tx = cx + i - 2, tz = cz + j - 2;
      const age = tile => tile ? 255 : 0;
      let value = age(tiles.get(tileKey(activeId, tx, tz)));
      if (activeId !== 0 && wanted.has(tileKey(0, tx, tz)))
        value = Math.min(value, age(tiles.get(tileKey(0, tx, tz))));
      const index = j * 5 + i;
      if (ages[index] !== value) changed = true;
      ages[index] = value;
    }
    if (!changed) return;
    readyBytes.fill(255);
    // Feather only around unprepared areas. Neighbouring completed tracks
    // are unaffected. The new snow and its fallback use this same mask.
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
      const age = ages[j * 5 + i];
      if (age === 255) continue;
      const x0 = i * TILE, z0 = j * TILE;
      for (let z = Math.max(0, z0 - 3); z <= Math.min(40, z0 + TILE + 3); z++)
        for (let x = Math.max(0, x0 - 3); x <= Math.min(40, x0 + TILE + 3); x++) {
          const dx = Math.max(0, x0 - x, x - x0 - TILE), dz = Math.max(0, z0 - z, z - z0 - TILE);
          const t = Math.min(1, Math.hypot(dx, dz) / 3);
          const v = age + (255 - age) * t * t * (3 - 2 * t);
          const index = z * READY_SIDE + x;
          readyBytes[index] = Math.min(readyBytes[index], Math.round(v));
        }
    }
    readyMap.needsUpdate = true;
    stats.uploadBytes += readyBytes.byteLength;
  }

  function contains (x, z, y) {
    if (!on) return false;
    const ix = Math.floor((x - (cx - RADIUS) * TILE) / STEP), iz = Math.floor((z - (cz - RADIUS) * TILE) / STEP);
    if (ix < 0 || iz < 0 || ix >= MASK_N || iz >= MASK_N) return false;
    for (let layer = 0; layer < LAYERS; layer++) {
      const at = (iz * MASK_WIDTH + layer * MASK_N + ix) * 4;
      if (!OWNER_BYTES[at + 3]) continue;
      if (!Number.isFinite(y)) return true;
      const base = (OWNER_BYTES[at] * 256 + OWNER_BYTES[at + 1]) / 32 - 512;
      if (y >= base - 0.14 && y <= base + OWNER_BYTES[at + 2] / 16 + 0.08) return true;
    }
    return false;
  }

  function update ({ x, z, surfaceId = 0, snowAmount = 0, dt = 0, vx = 0, vz = 0, preparing = false }) {
    if (disposed) return;
    const start = performance.now(); stats.uploadBytes = 0;
    material.userData.snowSeason.value = field.stats.season;
    on = snowAmount > 0.015;
    ownerOn.value = on ? 1 : 0;
    for (const page of pages.values()) page.mesh.visible = on && page.tiles.size > 0;
    if (!on) { stats.updateMs = performance.now() - start; return; }
    const nx = Math.floor(x / TILE), nz = Math.floor(z / TILE);
    if (surfaceId !== activeId) { revealRadius = 0; activeId = surfaceId; ownerDirty = true; }
    const moved = cx !== nx || cz !== nz;
    cx = nx; cz = nz;
    if (moved) ownerDirty = true;
    wanted.clear();
    let readyRadius = coarse ? 39 : 15;
    SNOW_UNIFORMS.uSnowFocus.value.set(x, z);
    const speed = Math.hypot(vx, vz), lead = Math.min(coarse ? 30 : 15, speed * 1.15);
    const aheadX = x + (speed > 0.1 ? vx / speed * lead : 0);
    const aheadZ = z + (speed > 0.1 ? vz / speed * lead : 0);
    let nextId = activeId, nextX = 0, nextZ = 0, nextDistance = Infinity, missing = 0;
    for (let j = -RADIUS; j <= RADIUS; j++) for (let i = -RADIUS; i <= RADIUS; i++) {
      // Keep the coarse centre resident while detailed tiles stream in.
      if (coarse && i * i + j * j > 38) continue;
      const key = tileKey(activeId, cx + i, cz + j);
      const tx = cx+i, tz = cz+j;
      const dx = Math.max(tx*TILE-x, 0, x-(tx+1)*TILE), dz = Math.max(tz*TILE-z, 0, z-(tz+1)*TILE);
      const distance = dx*dx+dz*dz;
      const d = distance < 16 ? -20000+distance : (distance < 36 ? -10000 : 0)
        + ((tx+0.5)*TILE-aheadX)**2 + ((tz+0.5)*TILE-aheadZ)**2;
      wanted.set(key, true);
      if (!tiles.has(key) && pending?.tile.key !== key) {
        missing++;
        if (d < nextDistance) { nextDistance = d; nextX = cx + i; nextZ = cz + j; }
      }
    }
    // Seven ground tiles remain underneath a bridge/roof. Their owner heights
    // occupy a separate atlas half; no bridge/ground state is mixed by XZ.
    if (!coarse && activeId !== 0) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      if (Math.abs(i) + Math.abs(j) === 2 && i !== j) continue;
      const key = tileKey(0, cx + i, cz + j), d = i * i + j * j + 10;
      wanted.set(key, true);
      if (!tiles.has(key) && pending?.tile.key !== key) {
        missing++;
        if (d < nextDistance) { nextDistance = d; nextId = 0; nextX = cx + i; nextZ = cz + j; }
      }
    }
    if (pending && !wanted.has(pending.tile.key)) cancelPending();
    if (!coarse && pending && nextDistance < -19984) {
      const t=pending.tile;
      const dx=Math.max(t.tx*TILE-x,0,x-(t.tx+1)*TILE), dz=Math.max(t.tz*TILE-z,0,z-(t.tz+1)*TILE);
      if (dx*dx+dz*dz>=16) cancelPending();
    }
    for (const tile of tiles.values()) if (!wanted.has(tile.key)) drop(tile);
    stats.pending = missing + (pending ? 1 : 0);
    if (!pending && missing) makeTile(nextId, nextX, nextZ);
    if (!pending) for (const tile of tiles.values()) if (tile.stale) {
      makeTile(tile.id, tile.tx, tile.tz, tile);
      break;
    }
    progressPending();
    if (!coarse) updateLocalReadiness(moved);
    // New work at the edge cannot retract already visible snow elsewhere.
    revealRadius = readyRadius;
    (coarse ? SNOW_UNIFORMS.uSnowFarRadius : SNOW_UNIFORMS.uSnowNearRadius).value = revealRadius;
    publishOwner();
    stats.revealRadius = revealRadius;
    stats.tiles = tiles.size; stats.pages = pages.size; stats.triangles = 0;
    let geometryBytes = 0, cacheBytes = 0;
    for (const tile of tiles.values()) {
      stats.triangles += tile.triangles;
      cacheBytes += tile.owner.byteLength + tile.elements.buffer.byteLength;
    }
    if (pending) cacheBytes += VERTS * 25 + QUADS * 4;
    for (const page of pages.values()) geometryBytes += page.p.array.byteLength + page.n.array.byteLength + page.c.array.byteLength
      + page.g.attributes.snowCover.array.byteLength + page.h.array.byteLength + page.support.array.byteLength + page.index.array.byteLength;
    stats.cpuBytes = geometryBytes + cacheBytes + OWNER_BYTES.byteLength + (coarse ? 0 : readyBytes.byteLength);
    stats.gpuBytes = geometryBytes + OWNER_BYTES.byteLength + (coarse ? 0 : readyBytes.byteLength);
    stats.updateMs = performance.now() - start;
  }

  function dispose () {
    disposed = true; on = false; ownerOn.value = 0;
    pending = null;
    for (const page of pages.values()) { page.mesh.removeFromParent(); page.g.dispose(); }
    pages.clear(); tiles.clear(); material.dispose(); OWNER_BYTES.fill(0); OWNER_TEXTURE.needsUpdate = true;
  }

  function invalidate () { cancelPending(); for (const tile of tiles.values()) tile.stale = true; ownerDirty = true; }

  return { update, contains, dispose, invalidate, stats, material,
    hasTile: (id, tx, tz) => tiles.has(tileKey(id, tx, tz)),
    get surfaceId () { return activeId; },
    get meshes () { return [...pages.values()].map(p => p.mesh); } };
}

/** Near interactive surface plus a bounded middle-distance continuation.
 * Both subdivide the same resting surface and apply only field deltas.
 * Replacement masks select complete geometry without moving its height. */
export function createSnowRenderer ({ scene, field, surfaces }) {
  const baseline = createSnowBaseline(surfaces);
  const deform = createSnowDeformTexture(field);
  const near = createSnowLayer({ scene, field, surfaces, baseline, deform });
  const middle = createSnowLayer({ scene, field, surfaces, baseline, deform, coarse: true });

  const stats = { tiles: 0, mediumTiles: 0, pages: 0, triangles: 0, cpuBytes: 0, gpuBytes: 0,
    uploadBytes: 0, built: 0, rebuilt: 0, buildMs: 0, updateMs: 0, pending: 0 };
  function update (state) {
    if (state.snowAmount > 0.015) deform.update(state.x, state.z, state.surfaceId);
    near.update(state); middle.update(state);
    stats.nearRadius = near.stats.revealRadius; stats.middleRadius = middle.stats.revealRadius;
    stats.tiles = near.stats.tiles; stats.mediumTiles = middle.stats.tiles;
    for (const key of ['pages', 'triangles', 'cpuBytes', 'gpuBytes', 'uploadBytes', 'built', 'rebuilt', 'updateMs', 'pending'])
      stats[key] = near.stats[key] + middle.stats[key];
    stats.cpuBytes += baseline.bytes + deform.stats.bytes;
    stats.gpuBytes += deform.stats.bytes;
    stats.uploadBytes += deform.stats.uploadBytes;
    stats.changedLayers = deform.stats.changed;
    stats.buildMs = Math.max(near.stats.buildMs, middle.stats.buildMs);
  }
  return { update, stats, materials: [near.material, middle.material],
    hasNearTile: (id, tx, tz) => near.hasTile(id, tx, tz),
    contains: (x, z, y) => near.contains(x, z, y) || middle.contains(x, z, y),
    invalidate() { baseline.clear(); near.invalidate(); middle.invalidate(); },
    dispose() { baseline.clear(); middle.dispose(); near.dispose(); deform.dispose(); },
    get surfaceId() { return near.surfaceId; },
    get meshes() { return near.meshes.concat(middle.meshes); } };
}
