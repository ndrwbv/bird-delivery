/* No DOM library/build needed: verify the real boot gate never releases the game on failure,
   retry text in both languages, one permitted action, focus, controller retry, and cleanup. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireSingleProgress } from '../src/game/progressboot.js';
class El {
  constructor (tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.parent = null; this.attrs = new Map(); this.dataset = {}; this.listeners = {}; this.classes = new Set();
    this.classList = { add: k => this.classes.add(k), remove: k => this.classes.delete(k), contains: k => this.classes.has(k), toggle: (k, on) => on ? this.classes.add(k) : this.classes.delete(k) }; }
  appendChild (el) { this.children.push(el); el.parent = this; return el; }
  remove () { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  setAttribute (k, v) { this.attrs.set(k, v); } getAttribute (k) { return this.attrs.get(k) ?? null; } removeAttribute (k) { this.attrs.delete(k); }
  addEventListener (k, fn) { this.listeners[k] = fn; } click () { if (!this.disabled) this.listeners.click?.(); } focus () { this.ownerDocument.activeElement = this; }
}
const english = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
for (const lang of ['ru', 'en']) {
  const doc = { createElement: tag => new El(tag, doc) }; doc.body = new El('body', doc);
  const host = doc.body.appendChild(new El('div', doc)); host.setAttribute('aria-hidden', 'true');
  const frames = new Map(); let seq = 0, calls = 0, gameImports = 0, ok = false, pad = { active: false, menuOk: false };
  const migrate = () => { calls++; if (!ok) throw Object.assign(Error('native quota'), { code: 'write-failed' }); return { saveId: 'stable-id' }; };
  const promise = requireSingleProgress({ migrate, host, t: key => lang === 'en' ? english[key] : key,
    raf: fn => { frames.set(++seq, fn); return seq; }, cancelRaf: id => frames.delete(id),
    pollPad: () => pad, makePadMenu: () => (p, panel) => { if (p.menuOk) panel.children.find(el => el.tagName === 'button').click(); },
  }).then(result => { gameImports++; return result; });
  await flush();
  assert.equal(calls, 1); assert.equal(gameImports, 0); assert.equal(host.getAttribute('aria-hidden'), null);
  let panel = host.children[0], button = panel.children[1];
  assert.equal(panel.getAttribute('role'), 'alert'); assert.equal(panel.children[0].textContent, lang === 'en' ? 'Unable to open your save. Please try again.' : 'Не удалось открыть сохранение. Повторите попытку.');
  assert.equal(button.textContent, lang === 'en' ? 'Retry' : 'Повторить'); assert.equal(doc.activeElement, button);
  assert.equal(panel.children.filter(el => el.tagName === 'button').length, 1, 'no continue/reset action');
  button.click(); await flush(); assert.equal(calls, 2); assert.equal(gameImports, 0, 'retry failure does not import game');
  assert(host.classList.contains('save-error'));
  ok = true; pad = { active: true, menuOk: true };
  const latest = [...frames.values()].at(-1); latest(); await flush();
  assert.equal((await promise).saveId, 'stable-id'); assert.equal(calls, 3); assert.equal(gameImports, 1);
  assert.equal(host.children.length, 0); assert.equal(host.classList.contains('save-error'), false); assert.equal(host.getAttribute('aria-hidden'), 'true');
}
console.log(JSON.stringify({ ok: true, languages: ['ru', 'en'], attemptsEach: 3, gameImportsEach: 1, actions: ['retry'] }));
