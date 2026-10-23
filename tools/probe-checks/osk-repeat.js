/* Экранная клавиатура Стима: «одно нажатие — одна буква» (osk.js, CAREER.md «Экранная клавиатура Стима»).
   npm run probe -- --mode=steam --q=mock-steam=deck --eval=tools/probe-checks/osk-repeat.js --max=0
   Нажатия — из скрипта (не доверенные: браузер сам букву не вставит), поэтому «браузер» здесь — модель: keydown не отменён →
   beforeinput insertText; не отменён → буква в поле. Сценарии — при нашей плавающей клавиатуре (open) и при клавиатуре,
   которую поднял сам Стим (steam, OSK.open пусто): автоповтор с флагом repeat, повтор парой «отпустил — нажал» без флага
   (как под gamescope), вставка той же буквы без нажатий, зажатая без отпускания; обычный набор «Анна» (двойная н — пальцем
   через 120 мс) и Backspace с повтором. Ответ: { open: {сценарий: [что в поле, ждали]}, steam: {...}, bad: [...] } */
const O = d.OSK.OSK, sleep = ms => new Promise(r => setTimeout(r, ms));
const inp = document.createElement('input');
inp.type = 'text'; inp.maxLength = 24;
inp.style.cssText = 'position:fixed;left:20px;top:20px;z-index:99999';
document.body.appendChild(inp);
const CODE = { а: 'KeyF', н: 'KeyY', б: 'Comma', x: 'KeyX' };
const cd = k => CODE[k.toLowerCase()] || (k.length === 1 ? 'Key' + k.toUpperCase() : k);
const down = (k, o = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, code: cd(k), repeat: !!o.repeat, bubbles: true, cancelable: true });
  if (!inp.dispatchEvent(e)) return;
  if (k === 'Backspace') { inp.value = inp.value.slice(0, -1); return; }
  if (k.length !== 1) return;
  ins(k);
};
const ins = ch => {
  const b = new InputEvent('beforeinput', { inputType: 'insertText', data: ch, bubbles: true, cancelable: true });
  if (!inp.dispatchEvent(b)) return;
  inp.value += ch;
};
const up = k => inp.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: cd(k), bubbles: true }));
const type = async (s, gap = 120) => { for (const ch of s) { down(ch); await sleep(40); up(ch); await sleep(gap); } };
const S = {
  // зажал «а», Chromium шлёт повтор с флагом repeat каждые 33 мс, отпустил через ~0,8 с
  repeatFlag: [async () => { down('а'); await sleep(500); for (let i = 0; i < 10; i++) { down('а', { repeat: true }); await sleep(33); } up('а'); }, 'а'],
  // повтор парой: keyup и тут же keydown, без флага (автоповтор X без «распознаваемого» повтора)
  repeatPairs: [async () => { down('а'); await sleep(500); for (let i = 0; i < 10; i++) { up('а'); down('а'); await sleep(33); } up('а'); }, 'а'],
  // клавиша нажата 10 раз подряд без отпускания (Стим отпускает с опозданием), без флага
  heldNoUp: [async () => { for (let i = 0; i < 10; i++) { down('а'); await sleep(40); } up('а'); }, 'а'],
  // буква вставкой 10 раз за ~50 мс, без нажатий клавиш
  insertBurst: [async () => { for (let i = 0; i < 10; i++) { ins('а'); await sleep(5); } }, 'а'],
  // обычный набор: двойная «н» пальцем — через 120 мс
  word: [async () => { await type('Анна'); }, 'Анна'],
  // быстрый набор: 60 мс на клавишу, разные буквы
  fast: [async () => { await type('бабах', 25); }, 'бабах'],
  // Backspace с повтором — стирает
  backspace: [async () => { inp.value = 'абабаб'; down('Backspace'); await sleep(400); for (let i = 0; i < 3; i++) { down('Backspace', { repeat: true }); await sleep(33); } up('Backspace'); }, null],
};
const res = { open: {}, steam: {}, bad: [] };
for (const mode of ['open', 'steam']) {
  for (const [name, [fn, want]] of Object.entries(S)) {
    inp.value = ''; inp.blur(); await sleep(mode === 'open' ? 900 : 60);   // тот же фокус чаще 0,8 с — клавиатуру не поднимаем
    inp.focus(); if (mode === 'open') d.OSK.keyboard(inp, true);   // окно probe без фокуса: focusin не приходит — как A геймпада на поле
    await sleep(mode === 'open' ? 1800 : 60);             // наша: большая молчит → плавающая (мок отвечает сразу)
    if (mode === 'steam') { O.open = null; O.held.clear(); }           // клавиатуру поднял сам Стим — игра о ней не знает
    else if (O.open !== inp) res.bad.push(mode + ' ' + name + ': плавающая не открылась');
    await fn(); await sleep(80);
    res[mode][name] = [inp.value, want];
    if (want !== null && inp.value !== want) res.bad.push(`${mode} ${name}: «${inp.value}» вместо «${want}»`);
    // Backspace: при нашей клавиатуре повтор гасим (стёр одну), при чужой — как обычная клавиатура (стёр четыре)
    if (want === null && inp.value !== (mode === 'open' ? 'абаба' : 'аб')) res.bad.push(`${mode} ${name}: Backspace — «${inp.value}»`);
  }
}
inp.remove();
return res;
