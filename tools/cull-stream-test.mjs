import assert from 'node:assert/strict';
import * as THREE from '../src/vendor/three.module.min.js';
import * as CULL from '../src/game/cull.js';

const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, .1, 180);
camera.position.set(0, 10, 0); camera.lookAt(0, 10, -100); camera.updateMatrixWorld();
function mesh(x, z, size=4) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x-size,0,z, x+size,0,z, x,20,z-size],3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial());
}
function group(...meshes) {
  const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrixWorldAutoUpdate = false;
  g.add(...meshes); scene.add(g); return g;
}
const existing = mesh(0,-50), initial = group(existing);
assert.equal(CULL.register(initial),0,'before freeze registration is deferred');
CULL.freeze(scene,camera,[]); CULL.step();
assert.equal(existing.parent,initial);
const baseline = CULL.STATS.frozen;
assert.equal(CULL.register(initial),0,'freeze already registered the initial mesh');
assert.equal(CULL.STATS.frozen,baseline);

const near = mesh(10,-60), far = mesh(1800,-60), streamed = group(near,far);
assert.equal(CULL.register(streamed),2);
assert.equal(near.parent,streamed,'near tile is attached immediately');
assert.equal(far.parent,null,'distant tile is culled immediately');
assert.equal(near.matrixAutoUpdate,false);
assert.equal(streamed.matrixWorldAutoUpdate,false);
const cells = CULL.STATS.cells, frozen = CULL.STATS.frozen;
assert.equal(CULL.register(streamed),0,'repeated registration cannot duplicate entries');
assert.equal(CULL.STATS.frozen,frozen);
assert.equal(CULL.STATS.cells,cells);

// A new mesh in an already invisible cell inherits that cell's mask.
const behind = mesh(4,70), rear = group(behind);
CULL.register(rear); CULL.step();
assert.equal(behind.layers.mask,0);
const behind2 = mesh(8,80); rear.add(behind2);
assert.equal(CULL.register(rear),1);
assert.equal(behind2.layers.mask,0,'same hidden cell must not leak its new mesh');
camera.lookAt(0,10,100); camera.updateMatrixWorld(); CULL.step();
assert.equal(behind2.layers.mask,1,'new mesh follows cell visibility after turning');

camera.position.set(1800,10,0); camera.lookAt(1800,10,-100); camera.updateMatrixWorld();
CULL.step();
assert.equal(far.parent,streamed,'camera travel restores streamed distant geometry');
assert.equal(near.parent,null,'camera travel culls streamed near geometry');
assert.equal(existing.parent,null,'existing geometry keeps its culling registration');
assert.equal(far.layers.mask,1);
assert.equal(CULL.register(streamed),0);

// Registering into a new cell while the camera stays put must include it
// in the nearby list without waiting for the 12-frame periodic refresh.
const side = mesh(1850,-130), sideGroup = group(side);
assert.equal(CULL.register(sideGroup),1); CULL.step();
assert.equal(side.parent,sideGroup);
assert.equal(side.layers.mask,1);
const moving = group(mesh(0,-80)); moving.position.x=30;
assert.equal(CULL.register(moving),0,'moving groups are not static world geometry');

console.log('cull stream: initial/deferred, duplicate, near/far, hidden-cell and camera-travel checks passed');
