import {createLandCover} from './landcover.js';
import {landCleanTileRegion} from './landclean.js';

let cover=null,green=null;
self.onmessage=({data})=>{
  try{
    if(data.type==='init'){
      cover=createLandCover(data.cover.cell,data.cover);
      green=createLandCover(data.green.cell,data.green);
      self.postMessage({type:'ready'});
    }else if(data.type==='batch'){
      if(!cover||!green)throw Error('Поле земли ещё не передано');
      const result=data.cores.map(core=>landCleanTileRegion(cover,green,core));
      self.postMessage({type:'batch',id:data.id,result});
    }
  }catch(error){self.postMessage({type:'error',message:String(error?.message||error)});}
};
