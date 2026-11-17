// This configuration is only for baking the Godot prototype's art.
import original from '../../vite.config.js';

export default options => {
  const config = original(options);
  config.plugins.push({
    name: 'keep-preview-mesh-data',
    enforce: 'pre',
    transform(source, id) {
      if (id.endsWith('/src/game/game.js')) {
        return source.replace('let packed=LAND_POS&&landRGB', 'let packed=false&&LAND_POS&&landRGB');
      }
      if (!id.endsWith('/src/main.js')) return;
      return `import { BufferAttribute, InterleavedBuffer } from './vendor/three.module.min.js';
BufferAttribute.prototype.onUpload = InterleavedBuffer.prototype.onUpload = function () { return this; };
` + source;
    },
  });
  return config;
};
