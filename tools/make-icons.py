"""Иконка-заглушка: красная плашка, жёлтая птичка и кусок пиццы, пиксельно.
   Для витрины Яндекса и Стима всё равно нужна нарисованная — это временная.
   python3 tools/make-icons.py  →  public/icon.png (512), build/icon.png (512), build/icon.ico"""
from PIL import Image, ImageDraw
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
S = 64                                   # рисуем 64×64 и растягиваем без сглаживания — крупный пиксель
im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle([0, 0, S - 1, S - 1], 12, fill='#f0522a', outline='#33210c', width=2)
# кусок пиццы
d.polygon([(14, 50), (50, 50), (32, 14)], fill='#e8b563')
d.polygon([(18, 47), (46, 47), (32, 20)], fill='#ffd34d')
for x, y in [(30, 30), (26, 40), (37, 41)]: d.ellipse([x - 3, y - 3, x + 3, y + 3], fill='#e04836')
# птичка сверху на корке
d.ellipse([34, 6, 54, 22], fill='#ffd23f', outline='#33210c')
d.ellipse([46, 2, 58, 14], fill='#ffd23f', outline='#33210c')
d.polygon([(57, 7), (63, 9), (57, 11)], fill='#ff8a2b')
d.rectangle([51, 6, 52, 7], fill='#1b1a1f')
d.polygon([(40, 12), (32, 6), (37, 17)], fill='#f2b43a')
big = im.resize((512, 512), Image.NEAREST)
(ROOT / 'public').mkdir(exist_ok=True); (ROOT / 'build').mkdir(exist_ok=True)
big.save(ROOT / 'public' / 'icon.png')
big.save(ROOT / 'build' / 'icon.png')
big.save(ROOT / 'build' / 'icon.ico', sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print('ok')
