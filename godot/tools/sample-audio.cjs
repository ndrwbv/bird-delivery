// Source asset authoring. Feed the release's Web Audio instruments into an
// OfflineAudioContext. No game, visible window, realtime audio device or server.
const {app, BrowserWindow, protocol} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const dir = path.resolve(__dirname, '..', 'assets', 'audio');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pizza-audio-'));
const read = name => fs.readFileSync(path.resolve(__dirname, '../../src/game', name + '.js'), 'utf8');
const moduleSource = name => read(name).replace(/^import .*$/gm, '').replace(/^export /gm, '');
const wrap = (src, expression) => '(()=>{' + src + '\nreturn ' + expression + '})()';
app.setPath('userData', profile);
app.commandLine.appendSwitch('mute-audio');
app.commandLine.appendSwitch('disable-audio-output');
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{scheme:'sample', privileges:{standard:true, secure:true, supportFetchAPI:true}}]);

async function go() {
  await app.whenReady();
  app.dock?.hide();
  fs.mkdirSync(dir, {recursive:true});
  protocol.handle('sample', async req => {
    const id = new URL(req.url).pathname.slice(1);
    if (req.method !== 'POST') return new Response('<!doctype html>', {headers:{'content-type':'text/html'}});
    if (!/^[a-z0-9-]+$/.test(id)) throw Error('Invalid asset');
    const raw = Buffer.from(await req.arrayBuffer());
    const res = spawnSync('ffmpeg', ['-loglevel','error','-y','-f','f32le','-ar','32000','-ac','1','-i','pipe:0','-c:a','libvorbis','-q:a','3',path.join(dir,id+'.ogg')], {input:raw});
    if (res.status !== 0) throw Error(String(res.stderr));
    return new Response('ok');
  });
  const win = new BrowserWindow({show:false,skipTaskbar:true,webPreferences:{offscreen:true,backgroundThrottling:false}});
  win.webContents.setAudioMuted(true);
  await win.loadURL('sample://bank/');
  const evalJS = async code => {
    if (!code.startsWith('globalThis.')) console.log(code);
    const input = code.startsWith('globalThis.') ? code + ';void 0' : code;
    const error = await win.webContents.executeJavaScript('Promise.resolve().then(()=>eval(' + JSON.stringify(input) + ')).then(()=>null, e=>String(e.stack || e))');
    if(error) throw Error(input.slice(0,80)+' — '+error);
  };
  await evalJS(`globalThis.emitSong = async (id,b) => {
    const response = await fetch('sample://bank/'+id, {method:'POST',body:b.getChannelData(0).buffer});
    if(!response.ok) throw Error(response.status);
  };`);
  const chip = 'const t=x=>x,N_=t;' + moduleSource('chiptunes');
  await evalJS('globalThis.chip=' + wrap(chip,`async (i)=>{
    const track=TRACKS[i], duration=prep(track).bars*240/track.bpm+CHIP.TAIL;
    const ctx=new OfflineAudioContext(1,Math.ceil(32000*duration),32000);
    const p=make(ctx,ctx.destination,i,false,713+i);
    p.offline=true; startP(p,0,.05);
    for(let step=0;step<p.total;step++) stepAt(p,step,step*p.dt);
    finish(p); await emitSong(track.id,await ctx.startRendering()); stopP(p);
  }`));
  const ambience = 'const WTH={id:()=>"rain"};' + moduleSource('ambience');
  await evalJS('globalThis.amb=' + wrap(ambience, `async (id)=>{
    const ctx=new OfflineAudioContext(1,32000*12,32000);
    const src=DEF[id].mk(ctx,ctx.destination,noise(ctx));
    if(src.set) src.set(.7);
    if(src.tick) for(let t=.05;t<11.94;t+=.05)ctx.suspend(t).then(()=>{src.tick(.05,1);ctx.resume()});
    const buf=await ctx.startRendering(),data=buf.getChannelData(0),len=data.length;
    // Crossfade the seam before the trimmed loop point.
    const n=1600, cropped=ctx.createBuffer(1,len-n,32000), out=cropped.getChannelData(0);
    out.set(data.subarray(n));
    for (let j=0;j<n;j++) out[out.length-n+j]=data[len-n+j]*(1-j/n)+data[j]*(j/n);
    await emitSong(id,cropped);
  }`));
  const sfx = moduleSource('sfxsynth');
  const doorstep = read('doorstep');
  const tables = [...doorstep.matchAll(/const SY = (\{[\s\S]*?\n  \});/g)].map(m=>m[1]);
  const recipeBook = ['step:', 'key:'].map(k => tables.find(table => table.includes(k)));
  const game = read('game');
  const methods = game.slice(game.indexOf('  squish (at)'),game.indexOf('\n};',game.indexOf('  squish (at)')));
  const fx = `async (id)=>{
    const c=new OfflineAudioContext(1,32000*2,32000), s=kit(c,c.destination,id);
    const setTimeout=(cb,ms)=>{const before=CLOCK.off;CLOCK.off+=ms/1000;cb();CLOCK.off=before};
    const acts={${methods}
fx:(name,cb)=>cb(s)};
    const main={coin:'coin',order:'order',tick:'tick',boom:'boom',fail:'fail','nitro-pick':'nosPick',nitro:'nosFire',thud:'thud','ui-click':'click','ui-deny':'deny',squish:'squish'};
    const tones={'door-open':[180,.12,.06],'door-close':[120,.08,.07],box:[880,.08,.10],trunk:[150,.06,.08],go:[760,.1,.13],back:[600,.12,.13],coffee:[980,.08,.12],receipt:[790,.06,.06],bet:[220,.12,.08],'reel-tick':[900,.02,.03],'reel-stop':[420,.09,.1],honk:[420,.14,.07],hurt:[110,.1,.12]};
    const noiseFX={glass:[.35,.4],smash:[.18,.22],bump:[.12,.2],splash:[.35,.3],drown:[.6,.45],whoosh:[.15,.22]};
    if(main[id]) acts[main[id]]();
    else if(id.startsWith('stairs-')) (${recipeBook[0]})[id.slice(7)](s);
    else if(id.startsWith('intercom-')) (${recipeBook[1]})[id.slice(9)](s);
    else if(id in tones){const [f,d,v]=tones[id];s.blip(f,d,'square',v);if(id==='honk')setTimeout(()=>s.blip(420,.2,'square',.07),170)}
    else if(id in noiseFX){s.noise(...noiseFX[id])}
    else if(id==='repair') [0,140,300,420].forEach((d,i)=>setTimeout(()=>s.blip(900+i*140,.06,'square',.08),d));
    else if(id==='engine-stall'){s.blip(70,.35,'sawtooth',.2);setTimeout(()=>s.blip(52,.4,'square',.14),160);s.noise(.3,.2)}
    else if(id==='engine-crank'){s.noise(.12,.22);s.blip(120,.14,'sawtooth',.16)}
    else throw Error(id);
    await emitSong(id,await c.startRendering());
  }`;
  await evalJS('globalThis.fx=' + wrap(sfx,fx));
  const impact=moduleSource('impact');
  await evalJS('globalThis.hit=' + wrap(impact,`async (id,tier)=>{
    const c=new OfflineAudioContext(1,32000*2,32000), k=[.1,.42,.82][tier], v=[.57,.82,.96][tier], m=MAT[id];
    SYN[id](c,c.destination,.003,v*(m.vol||1),k,tier,1);
    if(tier && m.metal)synMetal(c,c.destination,.003,m.metal*(tier===2?.85:.5),k,tier,1);
    if(tier===2 && m.boom)synBoom(c,c.destination,.003,m.boom*.85,k,1);
    await emitSong('hit-'+id+'-'+T_NAME[tier],await c.startRendering());
  }`));
  for(const [i,id] of ['asphalt','rain','lanterns','snow','beach','mandarins'].entries()) if (!fs.existsSync(path.join(dir,id+'.ogg'))) await evalJS('chip('+i+')');
  for(const id of ['city','wind','birds','crickets','stairwell','storm-wind','rain-roof','crowd','construction']) if (!fs.existsSync(path.join(dir,'amb-'+id+'.ogg'))) await evalJS('amb('+JSON.stringify('amb-'+id)+')');
  const cues='coin order tick boom fail nitro-pick nitro thud ui-click ui-deny squish door-open door-close box trunk go back coffee receipt bet reel-tick reel-stop honk hurt glass smash bump splash drown whoosh repair engine-stall engine-crank'.split(' ');
  for(const [idx,prefix] of ['stairs-','intercom-'].entries()) for(const m of recipeBook[idx].matchAll(/^    (\w+):/gm)) cues.push(prefix+m[1]);
  for (const id of cues) if (!fs.existsSync(path.join(dir,id+'.ogg'))) await evalJS('fx('+JSON.stringify(id)+')');
  for (const id of ['wall','car','pole','fence','person','bin','tree','curb','rail']) for(let i=0;i<3;i++) if(!fs.existsSync(path.join(dir,'hit-'+id+'-'+['light','mid','heavy'][i]+'.ogg'))) await evalJS('hit('+JSON.stringify(id)+','+i+')');
  win.destroy();
}
go().then(()=>app.quit()).catch(e=>{console.error(e);app.exit(1)}).finally(()=>fs.rmSync(profile,{recursive:true,force:true}));
