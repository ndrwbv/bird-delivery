/* Грубый лексер JS: находит строковые и шаблонные литералы, пропуская
   комментарии и регулярки. Нужен сканеру переводов — полноценный парсер
   тянуть ради этого незачем. Регулярку от деления отличаем по тому, что
   стоит перед слешем. */
const RE_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const KW_BEFORE = /(?:^|[^\w$])(return|typeof|case|do|else|in|of|void|yield|await)\s*$/;

export function lex (src) {
  const out = [];               // { kind: 'str' | 'tpl', start, end, quote, value (сырое содержимое) }
  let i = 0, line = 1;
  const n = src.length;
  let prevSig = '';             // последний значимый символ
  const lineAt = [];
  const push = (o) => { o.line = line; out.push(o); };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); for (let k = i; k < e; k++) if (src[k] === '\n') line++; i = e + 2; continue; }
    if (c === "'" || c === '"') {
      const s = i; i++;
      while (i < n && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++;
      push({ kind: 'str', start: s, end: i, quote: c, value: src.slice(s + 1, i - 1) });
      prevSig = 'x'; continue;
    }
    if (c === '`') {
      const s = i; i++;
      let depth = 0;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '\n') line++;
        if (depth === 0 && src[i] === '`') break;
        if (src[i] === '$' && src[i + 1] === '{') { depth++; i += 2; continue; }
        if (depth > 0 && src[i] === '}') { depth--; i++; continue; }
        i++;
      }
      i++;
      push({ kind: 'tpl', start: s, end: i, quote: '`', value: src.slice(s + 1, i - 1) });
      prevSig = 'x'; continue;
    }
    if (c === '/') {
      const before = src.slice(Math.max(0, i - 12), i);
      if (RE_BEFORE.has(prevSig) || prevSig === '' || KW_BEFORE.test(before)) {
        // регулярка
        i++;
        let cls = false;
        while (i < n) {
          const d = src[i];
          if (d === '\\') { i += 2; continue; }
          if (d === '[') cls = true; else if (d === ']') cls = false;
          else if (d === '/' && !cls) break;
          else if (d === '\n') break;
          i++;
        }
        i++;
        while (/[a-z]/.test(src[i])) i++;
        prevSig = 'x'; continue;
      }
    }
    if (!/\s/.test(c)) prevSig = /[\w$)\]]/.test(c) ? 'x' : c;
    i++;
  }
  return out;
}
