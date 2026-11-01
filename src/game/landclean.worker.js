import {createLandCover} from './landcover.js';
import {landCleanTileRegion} from './landclean.js';

let cover=null,green=null,trace=false;
self.onmessage=({data})=>{
  try{
    if(data.type==='init'){
      trace=!!data.trace;const t=trace?performance.now():0;
      cover=createLandCover(data.cover.cell,data.cover);
      green=createLandCover(data.green.cell,data.green);
      self.postMessage({type:'ready',...(trace?{workMs:performance.now()-t}:{})});
    }else if(data.type==='batch'){
      if(!cover||!green)throw Error('Поле земли ещё не передано');
      const t=trace?performance.now():0;
      const result=data.cores.map(core=>landCleanTileRegion(cover,green,core));
      self.postMessage({type:'batch',id:data.id,result,...(trace?{workMs:performance.now()-t}:{})});
    }
  }catch(error){self.postMessage({type:'error',message:String(error?.message||error)});}
};
