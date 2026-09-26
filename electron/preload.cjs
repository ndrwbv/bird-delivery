/* Мост в рендерер: window.birdSteam. Без него (обычный браузер, `vite --mode steam`)
   src/platform/steam.js работает на заглушках. */
const { contextBridge, ipcRenderer } = require('electron');

let boot = { available: false, deck: false, launched: false, lang: '', name: '' };
try { boot = ipcRenderer.sendSync('steam:boot') || boot; } catch (e) { /* — */ }
const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('birdSteam', {
  info: () => call('app:info'),                    // { tag, sha, version, updatable, steamLaunched, steam, userData, … }
  checkUpdate: manual => call('update:check', !!manual),   // { state: off|fresh|available|declined|updating|error, current, latest }
  applyUpdate: () => call('update:apply'),
  quit: () => call('app:quit'),
  setFullscreen: on => call('win:fullscreen', !!on),
  isFullscreen: () => call('win:isFullscreen'),
  steam: {
    available: !!boot.available,                   // steamworks.js поднялся и Steam запущен
    deck: !!boot.deck,                             // Steam Deck (по Steamworks или env SteamDeck=1)
    launched: !!boot.launched,                     // запущены из библиотеки Steam
    lang: boot.lang || '',                         // язык игры в Steam: 'russian', 'english', …
    name: boot.name || '',                         // ник в Steam
    achievement: id => call('steam:achievement', id),
    achieved: id => call('steam:achieved', id),
    clearAchievement: id => call('steam:clearAchievement', id),
    getStat: name => call('steam:getStat', name),
    setStat: (name, value) => call('steam:setStat', name, value),
    richPresence: (key, value) => call('steam:richPresence', key, value),
    textInput: (desc, max, text) => call('steam:textInput', desc, max, text),   // → строка | null
  },
});
