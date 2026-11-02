/* Diagnostic cold-barrier proof. Ordinary starts never create this extra snapshot. */
import {encodeStreetGraph,decodeStreetGraph} from './streetgraph-codec.js';
const need=(ok,code)=>{if(!ok)throw Error('streetgraph-export:'+code);};
export function createStreetGraphExport({graph,roads,identity,work=(_name,fn)=>fn()}){
  let bytes=work('roads.graphExport.encode',()=>encodeStreetGraph({graph,roads,identity}));
  const restored=work('roads.graphExport.decode',()=>decodeStreetGraph(bytes,{roads,identity}));
  work('roads.graphExport.exact',()=>{
    const again=encodeStreetGraph({graph:restored,roads,identity});
    need(again.length===bytes.length&&again.every((b,i)=>b===bytes[i]),'ROUNDTRIP_BYTES');
    const originalEdges=[...graph.edges],decodedEdges=[...restored.edges];
    const decodedIndex=[...restored.nodeIndex];
    need(originalEdges.length===decodedEdges.length&&originalEdges.every(([key,e],i)=>key===decodedEdges[i][0]&&e.road===decodedEdges[i][1].road),'ROAD_ALIASES');
    need(graph.nodeIndex.size===restored.nodeIndex.size&&[...graph.nodeIndex].every(([key,id],i)=>decodedIndex[i]?.[0]===key&&decodedIndex[i][1]===id),'NODE_INDEX');
  });
  const meta={version:1,identity:{...identity},bytes:bytes.length,nodes:restored.nodes.length,edges:restored.edges.size,
    roads:roads.length,byteExact:true,roadAliases:true,nodeIndexExact:true,liveRestored:true};
  return {graph:restored,meta:()=>({...meta,identity:{...meta.identity},bufferHeld:!!bytes}),get bytes(){return bytes;},release(){bytes=null;}};
}
