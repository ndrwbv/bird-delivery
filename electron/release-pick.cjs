/* Какую версию предлагать при обновлении с GitHub (docs/STEAM.md «Обновление из игры»).
   Без Электрона и сети — чистые функции: их гоняет tools/update-pick-test.cjs (npm run check).

   Раньше игра брала /releases/latest и сравнивала теги строкой «равно / не равно», а ответ
   держала в памяти с запуска — и «обновить» ставило ту версию, что была последней, когда игру
   открыли (обновлялись по одной). Теперь:
     • список релизов (/releases), из него — самый новый по номеру vX.Y.Z (числами: 0.10.6 > 0.9.1);
     • только готовые: не черновик, не предрелиз, и в нём уже лежит файл под эту систему
       (Windows — bird-pizza-setup.exe, Linux/Дека — bird-pizza-deck.tar.gz); релиз ещё
       собирается — предлагаем предыдущий готовый;
     • «есть новее» — только если номер больше того, что стоит (не просто «другой»). */

const ASSET = { win32: 'bird-pizza-setup.exe', linux: 'bird-pizza-deck.tar.gz' };

/** 'v0.10.6' → [0, 10, 6]; не номер — null */
function parseVer (s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(s || '').trim());
  return m ? [+m[1], +m[2], +m[3]] : null;
}
/** >0 — a новее b, <0 — старее, 0 — та же; не номер считается старее любого номера */
function cmpVer (a, b) {
  const x = parseVer(a), y = parseVer(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
/** вышла новее, чем стоит. Стоит не номер (местная сборка) — новее, если тег другой */
function isNewer (latest, cur) {
  if (!latest) return false;
  if (!cur) return false;
  if (!parseVer(cur)) return latest !== cur;
  return cmpVer(latest, cur) > 0;
}
/** файл релиза, нужный этой системе, — если он уже выложен целиком */
function assetFor (rel, platform) {
  const name = ASSET[platform];
  if (!name) return null;
  const a = (rel.assets || []).find(x => x && x.name === name);
  if (!a || (a.state && a.state !== 'uploaded') || !(a.size > 0) || !a.browser_download_url) return null;
  return a;
}
/** из ответа /releases — самый новый готовый релиз для platform ('win32' | 'linux' | другое — без требования к файлу).
    → { tag, notes, setup, asset } | null. setup — адрес установщика Windows (как раньше), asset — адрес файла этой системы */
function pickLatest (list, platform) {
  if (!Array.isArray(list)) return null;
  const ready = list.filter(r => r && !r.draft && !r.prerelease && parseVer(r.tag_name)
    && (!ASSET[platform] || assetFor(r, platform)));
  if (!ready.length) return null;
  ready.sort((a, b) => cmpVer(b.tag_name, a.tag_name));
  const r = ready[0];
  const setup = assetFor(r, 'win32'), own = assetFor(r, platform);
  return {
    tag: r.tag_name,
    notes: (r.body || '').slice(0, 400),
    setup: setup ? setup.browser_download_url : '',
    asset: own ? own.browser_download_url : '',
  };
}

module.exports = { ASSET, parseVer, cmpVer, isNewer, pickLatest };
