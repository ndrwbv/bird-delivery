export const SHADER_ARCHIVE_LIMIT = 8 * 1024 * 1024;
export const SHADER_TEXT_LIMIT = 32 * 1024 * 1024;
export const SHADER_PROGRAM_LIMIT = 512;
const hex = /^[a-f0-9]{64}$/;

export function shaderManifest (entry, sourceHash) {
  return entry?.version === 1 && entry.graphics === 'high' && entry.sourceHash === sourceHash &&
    hex.test(entry.sourceHash) && hex.test(entry.sha256) &&
    entry.path === 'city-data/' + entry.sha256 + '.deck-shaders.gz' &&
    Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= SHADER_ARCHIVE_LIMIT &&
    Number.isSafeInteger(entry.programs) && entry.programs > 0 && entry.programs <= SHADER_PROGRAM_LIMIT;
}

export function shaderArchive (data, programCount) {
  const { version, context, lines, sources, programs } = data || {};
  if (version !== 1 || context?.antialias !== true || context.depth !== true || context.stencil !== true ||
      !Array.isArray(lines) || !lines.length || lines.length > 65536 ||
      !lines.every(line => typeof line === 'string' && line.length < 16384) ||
      !Array.isArray(sources) || !sources.length || sources.length > SHADER_PROGRAM_LIMIT * 2) return false;
  let total = 0;
  for (const source of sources) {
    if (!Array.isArray(source) || !source.length || source.length > 16384) return false;
    for (const index of source) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= lines.length) return false;
      total += lines[index].length + 1;
      if (total > SHADER_TEXT_LIMIT) return false;
    }
  }
  const index = i => Number.isSafeInteger(i) && i >= 0 && i < sources.length;
  return Array.isArray(programs) && programs.length === programCount && programs.every(row =>
      index(row?.vertex) && index(row.fragment) && Array.isArray(row.bindings) && row.bindings.length <= 16 &&
      row.bindings.every(pair => Array.isArray(pair) && pair.length === 2 &&
        Number.isSafeInteger(pair[0]) && pair[0] >= 0 && pair[0] < 64 &&
        typeof pair[1] === 'string' && pair[1].length > 0 && pair[1].length <= 128));
}
