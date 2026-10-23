# Люди Quaternius — как собрать (ветка test/people)

Модели — Quaternius, CC0 (quaternius.com, файлы с poly.pizza). Зимняя одежда — Blender без окна.

1. Одежда (пуховик, сапоги, вязаная шапка, ушанка) из модели с длинным рукавом:
   `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P clothes.py -- hoodie.glb winterM.glb winterM.png`
   (женщины — из qJ2gsTUBHL.glb → winterF.glb). PNG — проверочная картинка.
2. Всё в игру: `python3 glb2q2.py ../../src/game/qpeople.data.js "M:Walk,Run:worker=…,…,winter=winterM.glb" "F:…" "A:Female_Walk,Female_Run:…"`
   — кости, ходьба и бег, части (голова, тело, ноги, ступни, шапки); одежда из Blender перекладывается в позу покоя семейства.
2а. Легче (обязательно после п. 2, 23.10.2026): `node slim.mjs ../../src/game/qpeople.data.js` — сварка одинаковых вершин и
   упрощение meshoptimizer (ошибка 4 мм, шапки 2,5 мм; края частей и краски не двигаются). Один раз на свежий выход glb2q2.py —
   второй раз скрипт откажется (пометка «slim» в шапке файла); `--dry` — только числа. Зачем — docs/AGENTS.md «Память на телефоне».
3. Проверка: `npm run probe -- --eval=tools/probe-checks/qlook.js --max=0 --q=season=2.4` — лист 16 человек.
4. Добавочные клипы (наклон «Interact» — поднять с земли, carried.js), без пересборки qpeople.data.js:
   `python3 clipadd.py ../../src/game/qpeople.clips.js "M:Interact:worker.glb" "F:Interact:qJ2gsTUBHL.glb"` — модель та же,
   что первой шла в семейство (скрипт сверяет кости). У семейства A клипа нет — наклон своими костями.
   С 23.10.2026 (12аф, уворот от машины — peddodge.js) там же бег вбок и кувырок — скрипт пишет файл целиком, перечислять все:
   `python3 clipadd.py ../../src/game/qpeople.clips.js "M:Interact,Run_Left,Run_Right,Roll,Kick_Right:worker.glb" "F:Interact,Run_Left,Run_Right,Roll,Kick_Right:qJ2gsTUBHL.glb"`
   (23.10.2026, 12ар: + пинок «Kick_Right» — водитель пинает твою машину и лобовое, foewreck.js; ключ клипа — 'kick', +~64 / 80 КБ)
   (шаг бега вбок меряется по земле — x и z; печатает, куда едет ступня на земле: у Run_Left — к −x, тело — к +x, влево).
   Каждый клип — ~40—90 КБ на семейство; память телефона — `npm run check -- --only=build-web,memory-phone`.
