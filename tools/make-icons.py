"""Иконки из логотипа (пиксельная оранжевая птица с куском пиццы на бордовом, public/brand/logo-1024.jpg).

   Логотип нарисован крупным пикселем: сетка 100×100 клеток. Скрипт снимает её из JPEG (середина каждой
   клетки, без мыла сжатия), чистит фон до ровного бордового #3d0d01 и собирает:
     public/brand/logo-px.png — сама сетка 100×100 (≈ 5 КБ): загрузка и главное меню растягивают её
                                без сглаживания (image-rendering: pixelated) — чётко на любом экране;
     build/icon.png  (1024)   — Электрон/Стим: из неё electron-builder делает иконки Mac и Linux;
     build/icon.ico           — Windows: 256, 128, 64, 48, 32, 24, 16;
     public/icon.png (512)    — вкладка браузера, значок окна Электрона, иконка Яндекса и обложки (make-cover.py);
     public/icon-32.png, public/icon-16.png — маленькие для вкладки: птица крупнее, рамка теснее.
   Иконка — скруглённый квадрат (углы прозрачные, скругление ступеньками той же клетки).
   Крупные размеры — целым числом пикселей на клетку (85 клеток × 12 / 6 / 3); 128 и меньше —
   сглаженным уменьшением с чуть поднятым контрастом, а 32, 24 и 16 — от плотной рамки вокруг птицы.

   python3 tools/make-icons.py"""
from PIL import Image, ImageDraw, ImageEnhance
import pathlib, statistics

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'public' / 'brand' / 'logo-1024.jpg'
BG = (0x3d, 0x0d, 0x01)                  # --brand-bg (src/styles/paper.css)
N = 100                                  # клеток в логотипе по стороне


def grid ():
    im = Image.open(SRC).convert('RGB')
    px, c = im.load(), im.width / N
    g = Image.new('RGB', (N, N))
    gp = g.load()
    for j in range(N):
        for i in range(N):
            x0, x1 = int(i * c + c * .3), int(i * c + c * .7) + 1
            y0, y1 = int(j * c + c * .3), int(j * c + c * .7) + 1
            rs = [px[x, y] for x in range(x0, x1) for y in range(y0, y1)]
            gp[i, j] = tuple(int(statistics.median(r[k] for r in rs)) for k in range(3))
    # фон — ровный бордовый; остальное — в 40 цветов (шум JPEG давал сотни оттенков)
    for j in range(N):
        for i in range(N):
            if sum(abs(a - b) for a, b in zip(gp[i, j], BG)) < 36: gp[i, j] = BG
    q = g.quantize(colors=40, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    qp = q.load()
    for j in range(N):
        for i in range(N):
            if gp[i, j] == BG: qp[i, j] = BG
    return q


def content_box (g):
    xs, ys = [], []
    gp = g.load()
    for j in range(N):
        for i in range(N):
            if gp[i, j] != BG: xs.append(i); ys.append(j)
    return min(xs), min(ys), max(xs), max(ys)


def square (g, box, pad):
    """квадратная рамка вокруг рисунка с полями pad клеток (за краем логотипа — фон)"""
    x0, y0, x1, y1 = box
    side = max(x1 - x0, y1 - y0) + 1 + pad * 2
    cx, cy = (x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2
    lx, ly = round(cx - side / 2), round(cy - side / 2)
    out = Image.new('RGB', (side, side), BG)
    out.paste(g.crop((max(0, lx), max(0, ly), min(N, lx + side), min(N, ly + side))), (max(0, -lx), max(0, -ly)))
    return out


def rounded (img, r):
    """скругление ступеньками клетки: маска на сетке, потом растягивается вместе с картинкой"""
    s = img.width
    m = Image.new('L', (s, s), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, s - 1, s - 1], r, fill=255)
    m = m.point(lambda v: 255 if v >= 128 else 0)
    out = img.convert('RGBA')
    out.putalpha(m)
    return out


def scaled (cells, size):
    """клетки → size px: целое число пикселей на клетку, остаток — прозрачные поля (по 1—2 px)"""
    k = size // cells.width
    big = cells.resize((cells.width * k, cells.width * k), Image.NEAREST)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    o = (size - big.width) // 2
    out.paste(big, (o, o))
    return out


def small (cells, size, pop):
    """меньше клетки на пиксель: Ланцош (чётче усреднения), потом чуть контраста и цвета — чтобы
       птица не тонула в бордовом мылом; углы — по той же маске"""
    big = cells.resize((cells.width * 12, cells.width * 12), Image.NEAREST)
    rgb = big.convert('RGB').resize((size, size), Image.LANCZOS)
    if pop: rgb = ImageEnhance.Color(ImageEnhance.Contrast(rgb).enhance(1 + pop)).enhance(1 + pop)
    a = big.getchannel('A').resize((size, size), Image.BOX)
    out = rgb.convert('RGBA')
    out.putalpha(a)
    return out

g = grid()
(ROOT / 'public' / 'brand').mkdir(exist_ok=True)
(ROOT / 'build').mkdir(exist_ok=True)
g.save(ROOT / 'public' / 'brand' / 'logo-px.png', optimize=True)
box = content_box(g)
icon = rounded(square(g, box, 5), 16)                  # 85 клеток: 1024 = 85×12+4, 512 = ×6+2, 256 = ×3+1
tight = rounded(square(g, box, 2), 12)                 # для 32 и 16: птица крупнее

big = scaled(icon, 1024)
big.save(ROOT / 'build' / 'icon.png', optimize=True)
scaled(icon, 512).save(ROOT / 'public' / 'icon.png', optimize=True)
i32, i16 = small(tight, 32, .15), small(tight, 16, .15)
i32.save(ROOT / 'public' / 'icon-32.png', optimize=True)
i16.save(ROOT / 'public' / 'icon-16.png', optimize=True)
ico = {256: scaled(icon, 256), 128: small(icon, 128, 0), 64: small(icon, 64, .08), 48: small(icon, 48, .1),
       32: i32, 24: small(tight, 24, .15), 16: i16}
ico[256].save(ROOT / 'build' / 'icon.ico', sizes=[(s, s) for s in ico], append_images=[ico[s] for s in ico if s != 256])
print('ok: рисунок', box, '→ logo-px.png, build/icon.png 1024, build/icon.ico, public/icon.png 512, icon-32/16.png')
