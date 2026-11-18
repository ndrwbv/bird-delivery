// Pull the released protest cycles, dialogue and authored benches into the native scene.
import { readFile, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const assets = new URL('../assets/', import.meta.url);
const source = await readFile(new URL('../../src/game/protests.js', import.meta.url), 'utf8');
const english = JSON.parse(await readFile(new URL('../../src/i18n/en.json', import.meta.url)));
const props = JSON.parse(await readFile(new URL('south-breakables.json', assets)));
const benches = props.filter(item => item.kind === 'bench').map(item => [item.at[0], item.at[2]]);
const translations = {};
function phrase(ru) {
  if (english[ru]) translations[ru] = english[ru];
  return ru;
}
function releasedValue(name, source, open, close) {
  const start = source.indexOf('const ' + name + ' = ' + open);
  if (start < 0) throw new Error('Missing release table ' + name);
  const i = source.indexOf(open, start), j = source.indexOf(close + ';', i);
  return runInNewContext('(' + source.slice(i, j + 1) + ')', {N_: phrase}, {timeout: 1000});
}
const releasedArray = name => releasedValue(name, source, '[', ']');
const data = {benches, bands: releasedArray('BANDS'), gig: releasedArray('GIG_L'),
  meet: releasedArray('MEET_L'), announce: releasedArray('ANNOUNCE'), riot: releasedArray('RIOT_L'),
  riot_adult: releasedArray('RIOT_ADULT'), graffiti: releasedArray('GRAFF'), flyers: releasedArray('OWN'),
  flyers_adult: releasedArray('OWN_ADULT'), march_adult: releasedArray('MARCH_ADULT'), topics: releasedArray('PROBLEMS')};
const crews = await readFile(new URL('../../src/game/crews.js', import.meta.url), 'utf8');
data.crews = {
  chat: releasedValue('CHAT', crews, '{', '}'), cry: releasedValue('CRY', crews, '{', '}'),
  adult: releasedValue('CRY_ADULT', crews, '[', ']'), help: releasedValue('HELP', crews, '[', ']'),
};
// Register released English strings used by the native street encounters.
for (const module of ['south_garage_zone', 'south_bribe_ring', 'south_street_robbery', 'south_pizza_thief',
  'south_angry_drivers', 'south_rival_deliveries', 'south_brand_crews', 'south_roadworks', 'south_depot_raid']) {
  const native = await readFile(new URL('../' + module + '.gd', import.meta.url), 'utf8');
  for (const [, line] of native.matchAll(/"([^"\n]*[А-Яа-яЁё][^"\n]*)"/gu)) phrase(line);
}
phrase('Мы — группа «{band}»!');
await writeFile(new URL('south-event-sites.json', assets), JSON.stringify({...data, en: translations})+'\n');
