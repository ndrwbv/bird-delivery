/* Strict experiment asset binding. Full content preflight is once per immutable series, never per start. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function verifyManifest({manifestFile,dist,repo,full=false}){
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')),copy={...manifest};delete copy.manifestHash;
  if(manifest.version!==1||manifest.mode!=='steam'||digest(JSON.stringify(copy))!==manifest.manifestHash||fs.realpathSync(manifest.buildDir)!==fs.realpathSync(dist))throw Error('land-cache17a:HOST_MANIFEST');
  if(!Array.isArray(manifest.sourceFiles)||!Array.isArray(manifest.buildFiles)||digest(JSON.stringify(manifest.sourceFiles))!==manifest.sourceHash||digest(JSON.stringify(manifest.buildFiles))!==manifest.buildHash)throw Error('land-cache17a:HOST_MANIFEST_LISTS');
  const map=manifest.sourceFiles.filter(row=>row.path.startsWith('src/maps/'+manifest.mapId+'/')&&!row.path.endsWith('/edits.json'));
  const edits=manifest.sourceFiles.find(row=>row.path==='src/maps/'+manifest.mapId+'/edits.json');
  if(digest(JSON.stringify(map))!==manifest.mapHash||edits?.sha256!==manifest.editsHash)throw Error('land-cache17a:HOST_MAP_INPUT');
  if(full)for(const[base,list]of [[repo,manifest.sourceFiles],[dist,manifest.buildFiles]])for(const row of list){
    const file=path.resolve(base,row.path),relative=path.relative(path.resolve(base),file);
    if(relative.startsWith('..')||path.isAbsolute(relative)||digest(fs.readFileSync(file))!==row.sha256)throw Error('land-cache17a:HOST_CONTENT_CHANGED');
  }
  return manifest;
}
function bindCacheAsset({file,sha256,manifestFile,dist,repo}){
  // This reads only the small manifest and file metadata; no eager cache read/hash or full source walk.
  const manifest=verifyManifest({manifestFile,dist,repo});
  if(typeof sha256!=='string'||!/^[a-f0-9]{64}$/i.test(sha256))throw Error('land-cache17a:HOST_EXPECTED_SHA');
  const maxBytes=(manifest.limits?.maxPayloadBytes||128*1024*1024)+(manifest.limits?.maxHeaderBytes||4*1024*1024)+20;
  if(!file||!path.isAbsolute(file))throw Error('land-cache17a:HOST_EXPLICIT_FILE');
  const target=fs.realpathSync(file),stat=fs.statSync(target);
  if(!stat.isFile()||stat.size<=0||stat.size>maxBytes)throw Error('land-cache17a:HOST_FILE_LIMIT');
  return {url:pathToFileURL(target).toString(),bytes:stat.size,sha256:sha256.toLowerCase(),manifestHash:manifest.manifestHash,sourceHash:manifest.sourceHash,buildHash:manifest.buildHash,manifest};
}
function parseFailure(message){
  const prefix='__landcache17a:failed:';
  if(typeof message!=='string'||!message.startsWith(prefix))return null;
  try{const value=JSON.parse(message.slice(prefix.length));
    if(value?.phase!=='failed'||value.cleanCalls!==0||typeof value.reason!=='string')throw Error('shape');
    if(value.cleaned!==true||value.bufferHeld!==false)return null;
    return value;
  }catch{return {phase:'failed',cleanCalls:0,reason:'land-cache17a:HOST_BAD_FAILURE_SIGNAL'};}
}
exports.verifyManifest=verifyManifest;exports.bindCacheAsset=bindCacheAsset;exports.parseFailure=parseFailure;
if(require.main===module){
  const arg=key=>process.argv.slice(2).find(value=>value.startsWith('--'+key+'='))?.slice(key.length+3);
  try{const manifest=verifyManifest({manifestFile:arg('manifest'),dist:arg('dir'),repo:arg('root')||process.cwd(),full:true});
    console.log(JSON.stringify({ok:true,fullPreflight:true,sourceHash:manifest.sourceHash,buildHash:manifest.buildHash,manifestHash:manifest.manifestHash,dir:fs.realpathSync(manifest.buildDir),cacheFileRead:false}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
