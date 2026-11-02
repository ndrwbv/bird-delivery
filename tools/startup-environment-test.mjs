/* Pure host configuration; no Electron launch, UA mutation, scene or build. */
import assert from 'node:assert/strict';
import environment from './startup-environment.cjs';
const {startupEnvironment,startupQueryPrefix,startupUserAgent}=environment;
const steam={benchmark:true,mode:'steam',phone:false};
let checks=0;const test=(name,fn)=>{fn();checks++;};
test('legacy invocation is unchanged in all existing modes',()=>{
 for(const options of [steam,{benchmark:false,mode:'web',phone:false},{benchmark:false,mode:'yandex',phone:true}]){
  const e=startupEnvironment([],options);assert.deepEqual(e,{noLanguage:false,deck:false,productionQuery:false});assert.equal(Object.isFrozen(e),true);assert.deepEqual(startupQueryPrefix({environment:e,language:'ru',benchmark:options.benchmark}),options.benchmark?['debug','mute','nolb','lang=ru','startuptrace']:['debug','mute','nolb','lang=ru']);assert.equal(startupUserAgent('original-UA',e),'original-UA');
 }
});
for(let mask=0;mask<8;mask++)test('explicit flag combination '+mask,()=>{
 const names=['startup-no-lang','startup-deck','startup-production-query'],argv=names.filter((_,i)=>mask&(1<<i)).map(k=>'--'+k),e=startupEnvironment(argv,steam);
 assert.deepEqual(e,{noLanguage:!!(mask&1)||!!(mask&4),deck:!!(mask&2),productionQuery:!!(mask&4)});
 const q=startupQueryPrefix({environment:e,language:'en',benchmark:true});assert.equal(q.includes('mute'),true);assert.equal(q.includes('lang=en'),!e.noLanguage);assert.equal(q.includes('debug'),!e.productionQuery);assert.equal(q.includes('nolb'),!e.productionQuery);assert.equal(q.at(-1),'startuptrace');
 assert.equal(startupUserAgent('native-UA',e),'native-UA'+(e.deck?' Steam Deck':''));assert.equal(Object.isFrozen(e),true);
});
for(const name of ['startup-no-lang','startup-deck','startup-production-query'])test('ambiguous or assigned '+name+' is refused',()=>{
 for(const argv of [['--'+name,'--'+name],['--'+name+'=1'],['--'+name+'=false'],['--'+name+'='],['--'+name,'--'+name+'=1']])assert.throws(()=>startupEnvironment(argv,steam),new RegExp('FLAG_'+name));
});
for(const options of [{benchmark:false,mode:'steam',phone:false},{benchmark:true,mode:'web',phone:false},{benchmark:true,mode:'yandex',phone:false},{benchmark:true,mode:'steam',phone:true}])test('opt-ins cannot leak to unsupported context '+JSON.stringify(options),()=>{
 for(const flag of ['startup-no-lang','startup-deck','startup-production-query'])assert.throws(()=>startupEnvironment(['--'+flag],options),/ORDINARY_STEAM_ONLY/);
});
test('unrelated options do not activate similar-named flags',()=>{
 assert.deepEqual(startupEnvironment(['--startup-decked','--startup-no-language','--q=debug','--ordinary'],steam),{noLanguage:false,deck:false,productionQuery:false});
});
test('production query always stays muted and removes only configured automatic flags',()=>{
 const e=startupEnvironment(['--startup-production-query'],steam);assert.deepEqual(startupQueryPrefix({environment:e,language:'ru',benchmark:true}),['mute','startuptrace']);assert.deepEqual(startupQueryPrefix({environment:e,language:'ru',benchmark:false}),['mute']);
});
test('explicit Deck UA carries original native identity and matches the actual game detector',()=>{
 const ua='Mozilla/5.0 (native platform) Chrome/130',e=startupEnvironment(['--startup-deck'],steam),actual=startupUserAgent(ua,e);assert.equal(actual,ua+' Steam Deck');assert.match(actual,/steamos|steam deck/i);assert.equal(ua,'Mozilla/5.0 (native platform) Chrome/130');
});
console.log(JSON.stringify({ok:true,checks,scope:'pure startup CLI/query/UA configuration; no Electron'}));
