import { groundFn } from './mapcheck.js';
import { ixCell, IXS } from './citymeshindex.js';
import { drawStreetSheets } from './winterroads.js';
import { roadCells } from './winter-road-cells.js';

self.onmessage = ({ data: { segments, terrain, heights, chunk } }) => {
  const start = performance.now();
  const height = groundFn(terrain, heights), sink = roadCells(chunk);
  drawStreetSheets(segments, (x, z) => height(x, z) + 0, sink);
  const cells = sink.take(ixCell);
  const buffers = [];
  for (const cell of cells) {
    buffers.push(cell.positions.buffer, cell.colours.buffer);
    if (cell.index) buffers.push(cell.index.buffer);
  }
  self.postMessage({ cells, indexStats: IXS, ms: performance.now() - start }, buffers);
};

self.postMessage({ ready: true });
