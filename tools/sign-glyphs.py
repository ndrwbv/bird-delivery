#!/usr/bin/env python3
"""Контуры букв для объёмной вывески пиццерии-купола (src/game/pizzadome.js → signLetters).

Разбирает TrueType-шрифт меню (public/fonts/RubikMonoOne-Regular.ttf) без сторонних библиотек и пишет
src/game/signfont.json: для каждой буквы — ширина шага и контуры (x, y, на кривой ли точка; квадратичные
кривые TrueType). Набор — заглавные латиница и кириллица (с буквами всех языков игры, что есть в шрифте),
цифры и немного знаков. Запуск (один раз, после смены шрифта или набора):

    python3 tools/sign-glyphs.py
"""
import json, os, struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, 'public', 'fonts', 'RubikMonoOne-Regular.ttf')
OUT = os.path.join(ROOT, 'src', 'game', 'signfont.json')
CHARS = ('ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'ÁÀÂÃÄÇÉÈÊËÍÎÏÑÓÔÕÖÚÛÜŞĞİŁŚŻŹĆŃĘĄ'
         'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' 'ІЇЄЎҐ' 'ӘҒҚҢӨҰҮҺ'
         '0123456789' " -.!'&№«»")

d = open(FONT, 'rb').read()
T = {}
for i in range(struct.unpack('>H', d[4:6])[0]):
    tag, _, off, ln = struct.unpack('>4sIII', d[12 + 16 * i:28 + 16 * i])
    T[tag.decode()] = (off, ln)
u16 = lambda o: struct.unpack('>H', d[o:o + 2])[0]
i16 = lambda o: struct.unpack('>h', d[o:o + 2])[0]
u32 = lambda o: struct.unpack('>I', d[o:o + 4])[0]

head = T['head'][0]
upem, locfmt = u16(head + 18), i16(head + 50)
nglyph = u16(T['maxp'][0] + 4)
loca = [(u16(T['loca'][0] + 2 * i) * 2 if locfmt == 0 else u32(T['loca'][0] + 4 * i)) for i in range(nglyph + 1)]
nhm = u16(T['hhea'][0] + 34)
adv = lambda g: u16(T['hmtx'][0] + 4 * min(g, nhm - 1))

# cmap: формат 4 (Юникод BMP)
cmap = {}
cm = T['cmap'][0]
for k in range(u16(cm + 2)):
    pid, eid, so = u16(cm + 4 + 8 * k), u16(cm + 6 + 8 * k), u32(cm + 8 + 8 * k)
    st = cm + so
    if u16(st) != 4 or pid not in (0, 3):
        continue
    seg = u16(st + 6) // 2
    ends, starts = st + 14, st + 16 + seg * 2
    deltas, ros = starts + seg * 2, starts + seg * 4
    for s in range(seg):
        e, b, dl, ro = u16(ends + 2 * s), u16(starts + 2 * s), i16(deltas + 2 * s), u16(ros + 2 * s)
        for c in range(b, e + 1):
            if c == 0xFFFF:
                continue
            if ro == 0:
                g = (c + dl) & 0xFFFF
            else:
                g = u16(ros + 2 * s + ro + 2 * (c - b))
                if g:
                    g = (g + dl) & 0xFFFF
            if g:
                cmap.setdefault(c, g)


def glyph(g, dx=0, dy=0):
    """контуры глифа g: [[(x, y, on), …], …] (составные — с их сдвигами)"""
    o, e = T['glyf'][0] + loca[g], T['glyf'][0] + loca[g + 1]
    if e <= o:
        return []
    nc = i16(o)
    p = o + 10
    if nc >= 0:
        endp = [u16(p + 2 * i) for i in range(nc)]
        p += 2 * nc
        p += 2 + u16(p)                     # инструкции
        n = endp[-1] + 1 if endp else 0
        fl = []
        while len(fl) < n:
            f = d[p]; p += 1; fl.append(f)
            if f & 8:
                r = d[p]; p += 1; fl += [f] * r
        xs, ys, v = [], [], 0
        for f in fl:
            if f & 2:
                b = d[p]; p += 1; v += b if f & 16 else -b
            elif not f & 16:
                v += i16(p); p += 2
            xs.append(v)
        v = 0
        for f in fl:
            if f & 4:
                b = d[p]; p += 1; v += b if f & 32 else -b
            elif not f & 32:
                v += i16(p); p += 2
            ys.append(v)
        out, s = [], 0
        for en in endp:
            out.append([(xs[i] + dx, ys[i] + dy, fl[i] & 1) for i in range(s, en + 1)])
            s = en + 1
        return out
    out = []
    while True:                             # составной глиф: части со сдвигом (масштаб в этом шрифте не нужен)
        fl, gi = u16(p), u16(p + 2); p += 4
        if fl & 1:
            a1, a2 = i16(p), i16(p + 2); p += 4
        else:
            a1, a2 = struct.unpack('bb', d[p:p + 2]); p += 2
        if fl & 8: p += 2
        elif fl & 64: p += 4
        elif fl & 128: p += 8
        out += glyph(gi, dx + (a1 if fl & 2 else 0), dy + (a2 if fl & 2 else 0))
        if not fl & 32:
            break
    return out


res = {'em': upem, 'g': {}}
miss = []
for ch in CHARS:
    g = cmap.get(ord(ch))
    if g is None:
        miss.append(ch); continue
    res['g'][ch] = [adv(g), [sum(([x, y, on] for x, y, on in c), []) for c in glyph(g)]]
json.dump(res, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('букв', len(res['g']), 'нет в шрифте:', ''.join(miss) or '—', 'файл', os.path.getsize(OUT), 'байт')
