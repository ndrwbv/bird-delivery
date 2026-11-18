import {readFile,writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import city from '../../src/maps/seversk/city-data.js';

const assets=new URL('../assets/',import.meta.url);
const source=await readFile(new URL('../../src/game/pzevents.js',import.meta.url),'utf8');
const econ=await readFile(new URL('../../src/game/econ.js',import.meta.url),'utf8');
const dictionary=JSON.parse(await readFile(new URL('../../src/i18n/en.json',import.meta.url),'utf8'));
const region=JSON.parse(await readFile(new URL('south-region.json',assets),'utf8'));
const events=runInNewContext(source.slice(source.indexOf('export const EVENTS'),source.indexOf('const KEY')).replace('export const','const')+'\nEVENTS',{N_:s=>s});
const constants=runInNewContext(econ.match(/export const PZEV = (\{[\s\S]*?\n\});/)[1].replace(/^\{/,'({')+')');
const settings=runInNewContext(econ.match(/export const DISTRICT = (\{[\s\S]*?\n\});/)[1].replace(/^\{/,'({')+')');
const restaurant=city.pois.find(p=>p.n==='Венеция'&&p.k==='food');
const venue=[restaurant.p[0]-region.origin[0],restaurant.p[1]-region.origin[1]];
const en={};
function add(s){if(typeof s==='string'&&dictionary[s])en[s]=dictionary[s];}
for(const e of Object.values(events)){
  add(e.name);add(e.label);
  for(const t of e.twists){[t.say,t.go,t.done,t.why,...t.lines].forEach(add);}
}
// The original wedding district is outside the single-district port. Identify its local hall in the manager's directions.
const wedding=events[1];
wedding.name='свадьба в «Венеции»';
wedding.twists[0].say='в «Венеции» на Победы свадьба. кортеж с лентами гудит с трёх, гости закажут пиццу';
wedding.twists[1].say='в «Венеции» на Победы свадьба, жених потерялся. гости нервничают и заказывают — платят хорошо';
en[wedding.name]='wedding at Venezia';
en[wedding.twists[0].say]='there’s a wedding at Venezia on Pobedy. the motorcade starts honking at three and the guests will order pizza';
en[wedding.twists[1].say]='there’s a wedding at Venezia on Pobedy. the groom is missing. the guests are ordering pizza to calm their nerves and they pay well';
await writeFile(new URL('south-pizzeria-events.json',assets),JSON.stringify({
  events:Object.values(events),rules:constants,unlock:[0,settings.OPEN[0],settings.OPEN[0]+settings.OPEN[1]],wedding:venue,en})+'\n');
