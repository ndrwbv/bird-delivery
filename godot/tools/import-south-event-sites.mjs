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
function releasedArray(name) {
  const start = source.indexOf('const ' + name + ' = [');
  if (start < 0) throw new Error('Missing release table ' + name);
  const i = source.indexOf('[', start), j = source.indexOf('];', i);
  return runInNewContext(source.slice(i, j + 1), {N_: phrase}, {timeout: 1000});
}
const data = {benches, bands: releasedArray('BANDS'), gig: releasedArray('GIG_L'),
  meet: releasedArray('MEET_L'), march_adult: releasedArray('MARCH_ADULT'), topics: releasedArray('PROBLEMS')};
phrase('Мы — группа «{band}»!');
await writeFile(new URL('south-event-sites.json', assets), JSON.stringify({...data, en: translations})+'\n');
