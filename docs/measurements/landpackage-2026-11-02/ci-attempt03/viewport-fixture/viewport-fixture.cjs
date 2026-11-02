const {app,BrowserWindow,protocol}=require('electron');
const fs=require('node:fs'),assert=require('node:assert/strict');
const {admissionViewportMetrics,checkedAdmissionViewport}=require('/Users/andrewboev/Desktop/not-work/delivery/tools/startup-admission.cjs');
const out='/tmp/bird-settled-viewport-1102/report.json';
const report={ok:false,electron:process.versions.electron,platform:process.platform,commands:[],viewport:null};
app.commandLine.appendSwitch('mute-audio');
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let win,ended=false;
function finish(code,error){if(ended)return;ended=true;if(error)report.error=String(error.stack||error);fs.writeFileSync(out,JSON.stringify(report,null,2));if(win&&!win.isDestroyed())win.destroy();app.exit(code);}
process.on('uncaughtException',e=>finish(1,e));process.on('unhandledRejection',e=>finish(1,e));
setTimeout(()=>finish(1,Error('Fixture deadline 30s')),30000);
app.whenReady().then(async()=>{
 if(app.dock)app.dock.hide();
 protocol.handle('app',req=>new Response('<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%}canvas{display:block;width:100vw;height:100vh}</style></head><body>'+ (new URL(req.url).pathname==='/test'?'<canvas></canvas>':'')+'</body></html>',{headers:{'content-type':'text/html'}}));
 win=new BrowserWindow({width:1024,height:720,useContentSize:true,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true}});
 win.webContents.setFrameRate(60);
 await win.loadURL('app://viewport/__blank');
 report.before=await win.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,devicePixelRatio})');
 report.beforeNative=win.getContentSize();
 assert.equal(report.before.width,1024);assert.equal(report.before.height,720);
 const dbg=win.webContents.debugger;dbg.attach('1.3');
 const metrics=admissionViewportMetrics('settled',1280,800);
 report.commands.push({method:'Emulation.setDeviceMetricsOverride',params:metrics});
 await dbg.sendCommand('Emulation.setDeviceMetricsOverride',metrics);
 const actual=await win.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,devicePixelRatio})');
 report.viewport=checkedAdmissionViewport(metrics,actual,win.getContentSize());
 await win.loadURL('app://viewport/test');
 report.after=await win.webContents.executeJavaScript(`(()=>{
 const c=document.querySelector('canvas');c.width=innerWidth;c.height=innerHeight;
 const gl=c.getContext('webgl',{antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('No actual WebGL context');
 gl.clearColor(.25,.5,.75,1);gl.clear(gl.COLOR_BUFFER_BIT);const pixel=new Uint8Array(4);gl.readPixels(gl.drawingBufferWidth-1,gl.drawingBufferHeight-1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
 const box=c.getBoundingClientRect();return {origin:location.origin,width:innerWidth,height:innerHeight,devicePixelRatio,screen:{width:screen.width,height:screen.height},layout:{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight},canvas:{width:c.width,height:c.height,cssWidth:box.width,cssHeight:box.height},webgl:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,pixel:[...pixel],error:gl.getError()},media:matchMedia('(width: 1280px) and (height: 800px)').matches};
 })()`);
 const a=report.after;assert.equal(a.origin,'app://viewport');assert.equal(a.width,1280);assert.equal(a.height,800);assert.equal(a.devicePixelRatio,1);
 assert.deepEqual(a.screen,{width:1280,height:800});assert.deepEqual(a.layout,{width:1280,height:800});
 assert.deepEqual(a.canvas,{width:1280,height:800,cssWidth:1280,cssHeight:800});
 assert.equal(a.webgl.width,1280);assert.equal(a.webgl.height,800);assert.equal(a.webgl.error,0);assert.deepEqual(a.webgl.pixel,[64,128,191,255]);assert.equal(a.media,true);
 report.ok=true;console.log(JSON.stringify(report));finish(0);
}).catch(e=>finish(1,e));
