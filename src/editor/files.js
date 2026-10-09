/* Файлы редактора в репозитории: src/maps/<карта>/notes.json (пометки) и edits.json (правки предметов).
   Читает и пишет dev-сервер Vite (vite.config.js, editorFiles: GET/POST /__editor/file). Без него
   (сборка для probe) — только чтение: то, что было в файлах при сборке. */
const NOTES = import.meta.glob('../maps/*/notes.json', { eager: true, import: 'default' });
const EDITS = import.meta.glob('../maps/*/edits.json', { eager: true, import: 'default' });
const DEV = import.meta.env.DEV;
export const path = (map, f) => `src/maps/${map}/${f}.json`;
export const canSave = () => DEV;

export async function load (map, f) {
  if (DEV) {
    try {
      const r = await fetch(`/__editor/file?map=${encodeURIComponent(map)}&f=${f}`, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch (e) { /* — */ }
  }
  const B = f === 'notes' ? NOTES : EDITS;
  return JSON.parse(JSON.stringify(B[`../maps/${map}/${f}.json`] || {}));
}

/** → { ok, path } или { ok: false, error } */
export async function save (map, f, obj) {
  if (!DEV) return { ok: false, error: 'сохранять можно только из npm run editor (dev-сервер)' };
  try {
    const r = await fetch(`/__editor/file?map=${encodeURIComponent(map)}&f=${f}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, path: j.path || path(map, f) } : { ok: false, error: j.error || ('код ' + r.status) };
  } catch (e) { return { ok: false, error: 'dev-сервер не отвечает: ' + e.message }; }
}
