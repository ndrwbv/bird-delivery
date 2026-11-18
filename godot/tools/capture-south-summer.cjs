// Usage: node capture-south-summer.cjs <v0.36.0 Steam www dir> <chrome-headless-shell> <playwright-core> <output.json>
// Reads the downloaded reference game after its late world generators have all run.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const [www, executablePath, playwrightModule, output] = process.argv.slice(2);
if (!output || !/headless[_-]shell/i.test(path.basename(executablePath))) {
  throw Error('Expected the original Steam www directory, chrome-headless-shell, playwright-core and an output file.');
}
const { chromium } = require(playwrightModule);
const root = path.resolve(www);
const mime = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.mp3':'audio/mpeg', '.wav':'audio/wav'};
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep) || !fs.statSync(file, {throwIfNoEntry:false})?.isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  const size = fs.statSync(file).size;
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (end < start || start >= size) {
      response.writeHead(416).end();
      return;
    }
    response.writeHead(206, {'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': end - start + 1});
    fs.createReadStream(file, {start, end}).pipe(response);
    return;
  }
  response.setHeader('Content-Length', size);
  fs.createReadStream(file).pipe(response);
});

async function capture() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath, headless:true, args:[
      '--mute-audio', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-background-networking',
    ]});
    const page = await browser.newPage({viewport:{width:640,height:400}});
    const url = 'http://127.0.0.1:' + server.address().port + '/index.html?debug&mute';
    await page.goto(url, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => typeof window.__dlv?.startRun === 'function', null, {timeout:90000});
    await page.evaluate(() => {
      window.__dlv.GFX.set('px', 2);
      window.__dlv.startRun(false, true);
    });
    await page.waitForFunction(() => window.__dlv.WORK?.SITES?.length && window.__dlv.COURTS?.LIST?.length, null, {timeout:90000});
    const result = await page.evaluate(async () => {
      const d = window.__dlv;
      if (d.LATE.left()) await new Promise(resolve => d.LATE.flushAsync(resolve));
      const fields = value => Object.fromEntries(Object.entries(value).filter(([,v]) => ['number','boolean','string'].includes(typeof v)));
      const rows = entries => entries.map(fields);
      const benches = rows(d.BENCHES).filter(b => b.x>1950 && b.x<5950 && b.z>1200 && b.z<4500);
      const balc = [];
      for (let i=0; i<d.BALC.open; i++) {
        const b = d.BALC.spot(i);
        if (b.x>1950 && b.x<5950 && b.z>1200 && b.z<4500) balc.push(fields(b));
      }
      const [cx,cz] = d.BEACH.at(0,0);
      const step = 4;
      const x = Math.floor((cx-112)/step)*step;
      const z = Math.floor((cz-112)/step)*step;
      const width = 57, depth = 57, heights = [];
      for (let row=0; row<depth; row++) {
        for (let col=0; col<width; col++) heights.push(Math.round(d.groundH(x+col*step,z+row*step)*100)/100);
      }
      const shoreHeight = {x,z,step,width,depth,heights};
      return {version:'v0.36.0', origin:'original global x/z', late:d.LATE.left(), benches, balc, shoreHeight,
        pitches:rows(d.PITCHES), gym:rows(d.WORK.SITES), kites:rows(d.KITES.SPOTS), courts:rows(d.COURTS.LIST),
        hookah:d.HOOKAH.SPOTS.map(s => ({b:fields(s.b),n:s.n})), ramps:rows(d.RAMPS), jumps:rows(d.JUMPS.LIST)};
    });
    if (result.late || !result.benches.length || !result.pitches.length) throw Error('Original world did not finish.');
    fs.writeFileSync(output, JSON.stringify(result) + '\n');
  } finally {
    await browser?.close();
    server.close();
  }
}
capture().catch(error => {console.error(error); process.exitCode=1;});
