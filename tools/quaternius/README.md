# Люди Quaternius — как собрать (ветка test/people)

Модели — Quaternius, CC0 (quaternius.com, файлы с poly.pizza). Зимняя одежда — Blender без окна.

1. Одежда (пуховик, сапоги, вязаная шапка, ушанка) из модели с длинным рукавом:
   `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P clothes.py -- hoodie.glb winterM.glb winterM.png`
   (женщины — из qJ2gsTUBHL.glb → winterF.glb). PNG — проверочная картинка.
2. Всё в игру: `python3 glb2q2.py ../../src/game/qpeople.data.js "M:Walk,Run:worker=…,…,winter=winterM.glb" "F:…" "A:Female_Walk,Female_Run:…"`
   — кости, ходьба и бег, части (голова, тело, ноги, ступни, шапки); одежда из Blender перекладывается в позу покоя семейства.
3. Проверка: `npm run probe -- --eval=tools/probe-checks/qlook.js --max=0 --q=season=2.4` — лист 16 человек.
