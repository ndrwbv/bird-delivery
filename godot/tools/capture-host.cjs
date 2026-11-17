// Run with Electron after building with original-vite.mjs. The web game is the art baker.
const { app, BrowserWindow, net, protocol } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve, sep } = require('node:path');
const { pathToFileURL } = require('node:url');

const output = resolve(__dirname, '../../release/godot');
const build = join(output, 'original-build');
const assets = new Set(['south-original.glb', 'south-original.json', 'south-height.bin', 'capture-status.json', 'south-physics-source.json','south-breakables.json','south-breakables.bin','south-traffic-models.glb','south-parking.json']);
const physicsOnly = process.argv.includes('--physics-only');
const sleep = ms => new Promise(done => setTimeout(done, ms));
mkdirSync(output, { recursive: true });
app.setPath('userData', join(output, 'original-profile'));
app.commandLine.appendSwitch('mute-audio');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

async function run() {
  await app.whenReady();
  app.dock?.hide();
  protocol.handle('app', async request => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path === '/__blank') return new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } });
    if (request.method === 'POST' && path.startsWith('/__write/')) {
      const name = path.slice('/__write/'.length);
      if (!assets.has(name)) return new Response('Unknown output', { status: 400 });
      writeFileSync(join(output, name), Buffer.from(await request.arrayBuffer()));
      return new Response('ok');
    }
    const module = { '/__capture.mjs': 'capture-original.mjs', '/glb.mjs': 'glb.mjs', '/__physics.mjs':'capture-physics.mjs','/capture-breakables.mjs':'capture-breakables.mjs','/capture-traffic.mjs':'capture-traffic.mjs' }[path];
    if (module) {
      return net.fetch(pathToFileURL(join(__dirname, module)).href);
    }
    const file = resolve(build, '.' + path);
    if (!file.startsWith(build + sep)) return new Response('Unknown input', { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
  const window = new BrowserWindow({ width: 1280, height: 800, show: false, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  window.webContents.setAudioMuted(true);
  const evaluate = script => window.webContents.executeJavaScript(script, true);
  await window.loadURL('app://birdpizza/__blank');
  await evaluate(`for (const [key, value] of Object.entries({
    'dlv-lang':'ru', 'dlv-msk-guide':1, 'dlv-msk-tut':'1', 'dlv-msk-nostut':1, 'dlv-shift-tut':1,
  })) localStorage.setItem(key, JSON.stringify(value));`);
  await window.loadURL('app://birdpizza/index.html?debug&mute&nolb&lang=ru&season=1.1&weather=clear&gfx=high&nolate');
  const deadline = Date.now() + 300000;
  while (!(await evaluate('!!window.__dlv?.PZ_CUR'))) {
    if (Date.now() > deadline) throw new Error('The original city did not initialize.');
    await sleep(250);
  }
  await evaluate('window.__dlv.goRun(true)');
  await sleep(1600);
  if (!physicsOnly) {
    writeFileSync(join(output, 'original-start.png'), (await window.webContents.capturePage()).toPNG());
    if (!(await evaluate("import('/__capture.mjs').then(module => module.run(window.__dlv))"))) {
      throw new Error('See capture-status.json for the bake error.');
    }
  }
  if (!(await evaluate("import('/__physics.mjs').then(module => module.run(window.__dlv))"))) {
    throw new Error('Could not save the original physics data.');
  }
  console.log('Original city exported to', output);
}

run().then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
