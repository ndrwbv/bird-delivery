import { shaderArchive, SHADER_TEXT_LIMIT } from './deck-shader-format.js';

async function readArchive (entry, url) {
  const response = await fetch(url);
  if (!response.ok) throw Error('read');
  const raw = await response.arrayBuffer();
  if (raw.byteLength !== entry.bytes) throw Error('length');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
  const hash = Array.from(digest, v => v.toString(16).padStart(2, '0')).join('');
  if (hash !== entry.sha256) throw Error('hash');
  const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const text = new TextDecoder(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SHADER_TEXT_LIMIT) throw Error('text budget');
      chunks.push(text.decode(value, { stream: true }));
    }
  } finally { await reader.cancel(); }
  chunks.push(text.decode());
  const data = JSON.parse(chunks.join(''));
  if (!shaderArchive(data, entry.programs)) throw Error('archive');
  return data;
}

self.onmessage = async ({ data: { entry, url } }) => {
  const start = performance.now();
  try {
    const { context, lines, sources, programs } = await readArchive(entry, url);
    const shaderTexts = sources.map(source => source.map(index => lines[index]).join('\n'));
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2', context);
    if (!gl) throw Error('WebGL2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
    if (!gpu || !/AMD|radeonsi/i.test(gpu) || /llvmpipe|swiftshader|software/i.test(gpu)) throw Error('renderer');
    const pending = [];
    for (const row of programs) {
      const program = gl.createProgram();
      for (const [type, index] of [[gl.VERTEX_SHADER, row.vertex], [gl.FRAGMENT_SHADER, row.fragment]]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, shaderTexts[index]);
        gl.compileShader(shader);
        gl.attachShader(program, shader);
        gl.deleteShader(shader);
      }
      for (const [slot, name] of row.bindings) gl.bindAttribLocation(program, slot, name);
      gl.linkProgram(program);
      pending.push(program);
    }
    gl.flush();
    self.postMessage({ stage: 'dispatched', count: pending.length });
    let errors = 0;
    for (const program of pending) {
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) errors++;
      gl.deleteProgram(program);
    }
    self.postMessage({ stage: 'done', count: pending.length, errors, ms: performance.now() - start });
  } catch {
    self.postMessage({ stage: 'failed' });
  }
};
