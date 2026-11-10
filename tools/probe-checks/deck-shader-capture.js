/* Run before the game module in the offline shader export only. */
(() => {
  const gl = WebGL2RenderingContext.prototype;
  const shaderSources = new WeakMap(), programParts = new WeakMap();
  const sources = [], indices = new Map(), programs = [], linked = new Set();
  const get = program => {
    let row = programParts.get(program);
    if (!row) {
      row = { vertex: -1, fragment: -1, bindings: [] };
      programParts.set(program, row);
    }
    return row;
  };
  const create = gl.createShader, source = gl.shaderSource, attach = gl.attachShader;
  const bind = gl.bindAttribLocation, link = gl.linkProgram;
  gl.createShader = function (type) {
    const shader = create.call(this, type);
    if (shader) shaderSources.set(shader, { type, index: -1 });
    return shader;
  };
  gl.shaderSource = function (shader, text) {
    const row = shaderSources.get(shader);
    if (row) {
      let index = indices.get(text);
      if (index === undefined) { index = sources.length; indices.set(text, index); sources.push(text); }
      row.index = index;
    }
    return source.call(this, shader, text);
  };
  gl.attachShader = function (program, shader) {
    const row = shaderSources.get(shader);
    if (row) get(program)[row.type === this.VERTEX_SHADER ? 'vertex' : 'fragment'] = row.index;
    return attach.call(this, program, shader);
  };
  gl.bindAttribLocation = function (program, index, name) {
    get(program).bindings.push([index, name]);
    return bind.call(this, program, index, name);
  };
  gl.linkProgram = function (program) {
    const row = get(program);
    if (row.vertex >= 0 && row.fragment >= 0) {
      const key = JSON.stringify(row);
      if (!linked.has(key)) { linked.add(key); programs.push({ ...row, bindings: row.bindings.slice() }); }
    }
    return link.call(this, program);
  };
  let archive;
  window.__deckShaderCapture = {
    count: () => programs.length,
    async prepare (context) {
      if (!archive) {
        const lines = [], lineIndices = new Map();
        const packed = sources.map(text => text.split('\n').map(line => {
          let index = lineIndices.get(line);
          if (index === undefined) {
            index = lines.length;
            lineIndices.set(line, index);
            lines.push(line);
          }
          return index;
        }));
        const payload = JSON.stringify({ version: 1, context, lines, sources: packed, programs });
        const stream = new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'));
        archive = new Uint8Array(await new Response(stream).arrayBuffer());
      }
      return archive.byteLength;
    },
    chunk (at, count) {
      if (!archive || !Number.isSafeInteger(at) || !Number.isSafeInteger(count) ||
          at < 0 || count <= 0 || count > 65536 || at + count > archive.byteLength) throw Error('shader archive range');
      let text = '';
      for (let i = at; i < at + count; i += 4096) text += String.fromCharCode(...archive.subarray(i, Math.min(at + count, i + 4096)));
      return btoa(text);
    },
  };
  const select = () => {
    const button = document.querySelector('[data-launch-menu] .crm-card.k-go button[data-main]');
    if (!button || button.disabled || document.body.classList.contains('booting')) {
      requestAnimationFrame(select);
      return;
    }
    requestAnimationFrame(() => button.click());
  };
  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(select), { once: true });
})();
