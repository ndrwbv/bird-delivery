function toExact(value){
 if(value===null)return['null'];
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Nonfinite exact scalar');const bytes=new Uint8Array(8),view=new DataView(bytes.buffer);view.setFloat64(0,value,true);return['number',[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('')];}
 if(typeof value==='undefined')return['undefined'];
 if(typeof value==='string'||typeof value==='boolean')return[typeof value,value];
 if(Array.isArray(value))return['array',value.map(toExact)];
 if(value&&Object.getPrototypeOf(value)===Object.prototype)return['object',Object.keys(value).map(key=>[key,toExact(value[key])])];
 throw Error('Unsupported exact value');
}
function fromExact(value){
 const [type,data]=value;if(type==='null')return null;if(type==='undefined')return undefined;
 if(type==='number'){if(!/^[a-f0-9]{16}$/.test(data))throw Error('Bad exact number');const bytes=Uint8Array.from(data.match(/../g),s=>parseInt(s,16));return new DataView(bytes.buffer).getFloat64(0,true);}
 if(type==='string'||type==='boolean')return data;
 if(type==='array')return data.map(fromExact);if(type==='object')return Object.fromEntries(data.map(([key,row])=>[key,fromExact(row)]));throw Error('Bad exact type');
}

export {toExact,fromExact};
