/* Explicit opt-in host environment; existing probe invocations retain their exact query. */
const need=(yes,code)=>{if(!yes)throw Error('startup-environment:'+code);};
exports.startupEnvironment=(argv,{benchmark,mode,phone})=>{
  const read=name=>{const forms=argv.filter(v=>v==='--'+name||v.startsWith('--'+name+'='));need(forms.length<=1&&(!forms.length||forms[0]==='--'+name),'FLAG_'+name);return forms.length===1;};
  const noLanguage=read('startup-no-lang'),deck=read('startup-deck'),productionQuery=read('startup-production-query');
  if(noLanguage||deck||productionQuery)need(benchmark&&mode==='steam'&&!phone,'ORDINARY_STEAM_ONLY');
  return Object.freeze({noLanguage:noLanguage||productionQuery,deck,productionQuery});
};
exports.startupQueryPrefix=({environment,language,benchmark})=>{
  const q=environment.productionQuery?['mute']:['debug','mute','nolb'];
  if(!environment.noLanguage)q.push('lang='+language);
  if(benchmark)q.push('startuptrace');
  return q;
};
exports.startupUserAgent=(original,environment)=>environment.deck?original+' Steam Deck':original;
