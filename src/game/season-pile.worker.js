import * as THREE from '../vendor/three.module.min.js';
import { createSeasonPileStore } from './season-pile-store.js';
import { applyPileCommands } from './season-pile-codec.js';
import { indexPile } from './pileindex.js';

let pile, apply, ms = 0;
const packed = new Map();

function packCell ({ k, n, p, c, a }) {
  const row = indexPile(p.subarray(0, n * 3), c.subarray(0, n * 3), a.subarray(0, n * 4), 0) ||
    { p: p.slice(0, n * 3), c: c.slice(0, n * 3), a: a.slice(0, n * 4), index: null };
  return { k, n, ...row };
}
self.onmessage = ({ data }) => {
  const start = performance.now();
  if (data.kind === 'init') {
    pile = createSeasonPileStore({ THREE, CH: data.cell, WOOD_ON: data.wood, raisedLand: data.raised, landBuilt: () => false });
    apply = applyPileCommands(pile);
  } else if (data.kind === 'prepack') {
    for (const cell of pile.cells().values()) packed.set(cell.k, packCell(cell));
  } else if (data.kind === 'finish') {
    const cells = [], transfer = [];
    let reused = 0;
    for (const cell of pile.cells().values()) {
      const saved = packed.get(cell.k);
      const same = saved?.n === cell.n;
      const row = same ? saved : packCell(cell);
      reused += Number(same);
      cells.push(row);
      transfer.push(row.p.buffer, row.c.buffer, row.a.buffer);
      if (row.index) transfer.push(row.index.buffer);
      pile.drop(cell.k);
    }
    packed.clear();
    pile = apply = null;
    self.postMessage({ cells, reused, ms: ms + performance.now() - start }, transfer);
    return;
  } else {
    if (data.kind === 'raise') packed.clear();
    apply(data);
  }
  ms += performance.now() - start;
};
