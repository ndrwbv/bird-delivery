"""Обложка 800×470 и витрина 1560×520 из чистого кадра (без хада) и логотип
   поверх — по правилам Яндекса обложка не должна быть голым скриншотом.
   python3 tools/make-cover.py media/ru ru"""
import sys, json, pathlib
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT = pathlib.Path(__file__).resolve().parent.parent
d, lang = pathlib.Path(sys.argv[1]), sys.argv[2]
title = 'Птица Пицца'
dic = ROOT / 'src' / 'i18n' / f'{lang}.json'
if lang != 'ru' and dic.exists(): title = json.loads(dic.read_text()).get('Птица Пицца', title)
src = d / 'clean-drive.png'
if not src.exists(): sys.exit(f'{d}: нет clean-drive.png — сначала tools/capture.cjs')
font = ROOT / 'public' / 'fonts' / 'PressStart2P-Regular.ttf'
icon = Image.open(ROOT / 'public' / 'icon.png').convert('RGBA')

def make (W, H, name):
    im = Image.open(src).convert('RGB')
    k = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    im = im.crop(((im.width - W) // 2, (im.height - H) // 2, (im.width - W) // 2 + W, (im.height - H) // 2 + H))
    band = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(band).rectangle([0, int(H * .58), W, H], fill=(20, 16, 30, 170))
    im = Image.alpha_composite(im.convert('RGBA'), band)
    dr = ImageDraw.Draw(im)
    size = int(H * .11)
    f = ImageFont.truetype(str(font), size) if lang not in ('ja', 'zh') else ImageFont.load_default(size)
    ic = icon.resize((int(H * .3), int(H * .3)), Image.NEAREST)
    tw = dr.textlength(title, font=f)
    x = (W - tw - ic.width - H * .05) / 2
    y = int(H * .79 - size / 2)
    im.alpha_composite(ic, (int(x), int(H * .79 - ic.height / 2)))
    tx = x + ic.width + H * .05
    for ox, oy in [(-4, -4), (4, -4), (-4, 4), (4, 4), (0, 6)]:
        dr.text((tx + ox, y + oy), title, font=f, fill=(51, 33, 12))
    dr.text((tx, y), title, font=f, fill=(255, 216, 94))
    im.convert('RGB').save(d / name, optimize=True)
    print(d / name)

make(800, 470, 'cover-800x470.png')
make(1560, 520, 'showcase-1560x520.png')
icon.save(d / 'icon-512.png')
