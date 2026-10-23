# Модели машин — кандидаты (трек «Модели машин», задача 0)

[← план машин](cars.md) · как готовить модель — [CARS3D.md](../CARS3D.md) «Как добавить машину»

Собрано 23.10.2026 со страниц Sketchfab (данные — из открытого API Sketchfab: лицензия, треугольники, число картинок).
**Ничего не скачано** — скачиваем после выбора автора. Все ниже — **CC BY 4.0** («CC Attribution» на Sketchfab): можно
продавать в Стиме, автора — в титры (`credits.js`). CC-BY-NC, «Free Standard» и «только для личного» — отброшены.
«Тр.» — треугольники модели целиком (у Sketchfab faceCount — это треугольники). Для сравнения: исходная «Семёрка»
(Arkady Gribachev) — 19,9 тыс., после `tools/realcar.mjs` — ~8 тыс.

**Колёса.** Со страницы не видно, отдельные ли они: Sketchfab показывает это только в инспекторе модели после открытия.
Где автор написал сам — отмечено. Если колёса склеены с кузовом — `realcar.mjs` вырезает их по месту (как у «Копейки»:
«колёса — свои части»), это +полдня на модель.

## Лучшие (★)

1. ★ **Серия Yo.Ri** — ПАЗ (3 тыс.), «Газель» ГАЗ-3221 (7,6 тыс.), ВАЗ-21099 (1,7 тыс.): один автор, чистая
   картинка без ржавчины, лоу-поли — ближе всего к «Семёрке» по виду и легче её; у того же автора ещё УАЗ-469, ГАЗ-66,
   РАФ, РоАЗ (городской автобус).
2. ★ **Серия ImperialBlue3D** — иномарки 2000-х: VW Golf IV (5,4 тыс.), Peugeot 206 (5,2 тыс.), Toyota Corolla E100
   (5,2 тыс.): одна картинка на машину, одна манера — три разные иномарки одним заходом.
3. ★ **Sergey Egelsky** — «Волга» ГАЗ-24 (5,5 тыс.) и «Буханка» УАЗ-452 (8 тыс.): один автор, потёртые, как «Семёрка»;
   картинки 4K PBR — ужать до 512—1024, ржавчину на краске придётся закрывать маской краски.

Плюс «Нива» RitiWox (5,8 тыс., чистая картинка) — лучшая «Нива».

## Лист

| # | машина игры | модель · автор | тр. | картинка | колёса | превью | оценка |
|---|---|---|---|---|---|---|---|
| 1 | Копейка (ВАЗ-2101) | [VAZ 2101](https://sketchfab.com/3d-models/95d34f63b5b14e2197fd41383776e031) · Javkal | 5,5 тыс. | да, ржавая | отдельные («Wheel rigged») | [jpg](https://media.sketchfab.com/models/95d34f63b5b14e2197fd41383776e031/thumbnails/b4bd5d1f79fe49baad00a863ac054ed0/daa79cca58de4deba7d5de2eb4a07d5e.jpeg) | с правками — уже в игре, выключена (автор 13.10: «оч плохо вышла») |
| 2 | Копейка | [VAZ 2101](https://sketchfab.com/3d-models/f465bdf8b97140d2ae02499a12b4471a) · krilov.aleksandr | 9 тыс. | да, 15 картинок, граффити и ржавчина | ? | [jpg](https://media.sketchfab.com/models/f465bdf8b97140d2ae02499a12b4471a/thumbnails/e3ae7565d3534f629b5533194f2d9b1d/861088f2ee4449cda6f30785d8bdb8a1.jpeg) | с правками — «битая» копейка, стоит на куске асфальта |
| 3 | Копейка | [VAZ 2101](https://sketchfab.com/3d-models/140b7a3b112c40698a3a9521631516a7) · eightismore | 3,3 тыс. | одна, мультяшная | ? | [jpg](https://media.sketchfab.com/models/140b7a3b112c40698a3a9521631516a7/thumbnails/3043ae11d9054463aa0e081426118016/7cae1992152b4048b102dd8ff3096c37.jpeg) | с правками — стиль другой (игрушечный: крупные колёса, яркие плоские цвета) |
| 4 | Москвич-412 | [Moskvich 412](https://sketchfab.com/3d-models/8904994c39d24529b8581b181198b687) · DANYA23K | 4,1 тыс. | да (2), потёртая | ? | [jpg](https://media.sketchfab.com/models/8904994c39d24529b8581b181198b687/thumbnails/7a65253d17f74aea9fae91d985a15019/20cfd12602e64338b9fe67353a6f8021.jpeg) | подойдёт — лёгкая, по виду как «Семёрка» |
| 5 | Москвич-412 | [Moskvich 412](https://sketchfab.com/3d-models/b6eb96e28f184cf5a8098f68570f2314) · Alexander Bakhtin | 10,3 тыс. | да (3), очень ржавая | ? | [jpg](https://media.sketchfab.com/models/b6eb96e28f184cf5a8098f68570f2314/thumbnails/28077ec04ded4ce3b5769b16b75700dd/34a433f7c1fa48cfa7359b5a7cd24713.jpeg) | с правками — ржавчина впечатана, краска маской не ляжет ровно |
| 6 | Волжанка (ГАЗ-24) | [Gaz 24](https://sketchfab.com/3d-models/8492f930a3b64b52a24b7c4dff9f7b4f) · Sergey Egelsky ★ | 5,5 тыс. | да, 4K PBR (9 картинок) | ? | [jpg](https://media.sketchfab.com/models/8492f930a3b64b52a24b7c4dff9f7b4f/thumbnails/f426c26fb9c246f981daba56dc328585/25a3a8f6cae148e5b7844967c34929b8.jpeg) | подойдёт — потёртая, как «Семёрка» |
| 7 | Волжанка | [GAZ-24 Volga Black](https://sketchfab.com/3d-models/ac19841adca7495586838a0f8d52e209) · eightismore | 4 тыс. | одна, мультяшная | ? | [jpg](https://media.sketchfab.com/models/ac19841adca7495586838a0f8d52e209/thumbnails/d858431616e7400eb796cf8bcdc1981a/884e03cd524d4af8bced3405a734eb34.jpeg) | с правками — стиль игрушечный; у автора ещё ГАИ, скорая, универсал — та же серия |
| 8 | Нивка | [Low poly lada niva](https://sketchfab.com/3d-models/b67df18b55ab497ba30cdbd6be7dee19) · RitiWox ★ | 5,8 тыс. | одна, чистая | ? | [jpg](https://media.sketchfab.com/models/b67df18b55ab497ba30cdbd6be7dee19/thumbnails/4a0147f29a62422b94ae33550596442d/a42dc4a4a84f4e83a74e69d4a49cf160.jpeg) | подойдёт |
| 9 | Нивка | [Lada niva car LOW POLY](https://sketchfab.com/3d-models/1f5cb837c68d4e81958e399ff6ae00c5) · randomcarguy | 4,6 тыс. | нет (14 цветов) | отдельные («rigged wheels») | [jpg](https://media.sketchfab.com/models/1f5cb837c68d4e81958e399ff6ae00c5/thumbnails/535c28cee4f242f290cd75e8bcf2a63b/702b1702e38e4208ab7485752deb256a.jpeg) | нет — без картинки, сделана в Tinkercad |
| 10 | Буханка (УАЗ-452) | [Uaz 452](https://sketchfab.com/3d-models/4f45aa2e9180437b9687b3d567069ca9) · Sergey Egelsky ★ | 8 тыс. | да, PBR (11 картинок) | ? | [jpg](https://media.sketchfab.com/models/4f45aa2e9180437b9687b3d567069ca9/thumbnails/c7f27213e2574c098dfdcb3ba75fa2fa/fb6699a08f3d4d6fab131176cf0cc06b.jpeg) | подойдёт — фургон без окон сзади |
| 11 | Буханка | [UAZ 452 Buhanka](https://sketchfab.com/3d-models/8b37ef5dde0d45bc8d0420ccbfeccfc3) · YouRun | 8,8 тыс. | да (6), ржавая | ? | [jpg](https://media.sketchfab.com/models/8b37ef5dde0d45bc8d0420ccbfeccfc3/thumbnails/ce897931487242a49dc20f9a68ce6576/8bf0b56e31034866b5300905ec0228d7.jpeg) | с правками — экспедиционная (багажник на крыше, кенгурятник) |
| 12 | ПАЗ (автобус) | [Paz Bus](https://sketchfab.com/3d-models/f895bb31d5d244f6828608f438189993) · Yo.Ri ★ | 3 тыс. | цветами (7), чистая | ? | [jpg](https://media.sketchfab.com/models/f895bb31d5d244f6828608f438189993/thumbnails/8b4401e9da1142ac860c25e69aafce66/ebbc095932e04bc2b36b1265558fd423.jpeg) | подойдёт — белый с синей полосой, видно салон |
| 13 | ПАЗ | [PAZ bus Low Poly](https://sketchfab.com/3d-models/4825afa584c74401898fb4ea83459e38) · kuwalol93 | 12,7 тыс. | нет (15 цветов) | ? | [jpg](https://media.sketchfab.com/models/4825afa584c74401898fb4ea83459e38/thumbnails/82c95db64a35496299b34a1fbb22024c/ff763e4de9d4441382080b5db6352cca.jpeg) | с правками — тяжелее и без картинки |
| 14 | Газель | [ГАЗ-3221 Скорая помощь](https://sketchfab.com/3d-models/f3daf79ea4e843c8a159e8ead7af6e74) · Yo.Ri ★ | 7,6 тыс. | да (3) | ? | [jpg](https://media.sketchfab.com/models/f3daf79ea4e843c8a159e8ead7af6e74/thumbnails/a64ef6098dd04694bfc205162133ba5b/7ca56b6977b44e5d9e57b9268437483c.jpeg) | подойдёт — как есть скорая; для маршрутки и фургона — закрасить красный крест и полосу |
| 15 | Газель | [Gazel Next](https://sketchfab.com/3d-models/8ecca607f992452f8f06702295bbad4f) · SCADL & Co | 13,3 тыс. | нет (15 цветов), есть салон | ? | [jpg](https://media.sketchfab.com/models/8ecca607f992452f8f06702295bbad4f/thumbnails/3a9d5a120f6b4580a6f40897156ba2d9/a54f5cd38efd49f18672d1fefe47da51.jpeg) | с правками — новая «Газель Некст» (2013+), бортовая с будкой |
| 16 | иномарка 2000-х, хэтчбек | [1998 Volkswagen Golf Mk4](https://sketchfab.com/3d-models/ec7b2f2fd567419a965db5b07b777c0c) · ImperialBlue3D ★ | 5,4 тыс. | одна | ? | [jpg](https://media.sketchfab.com/models/ec7b2f2fd567419a965db5b07b777c0c/thumbnails/c0e27a61c3d440f2b70537084960de0c/9c9ef44dbb984395ab6440d40b220ddc.jpeg) | подойдёт — автор просит указать его |
| 17 | иномарка 2000-х, хэтчбек | [2003 Peugeot 206](https://sketchfab.com/3d-models/289b123c3be8432aa1dabc97dfafc026) · ImperialBlue3D ★ | 5,2 тыс. | одна | ? | [jpg](https://media.sketchfab.com/models/289b123c3be8432aa1dabc97dfafc026/thumbnails/868a74fda4da4965979293519e3bff1e/67fb6ddc9ac94067968b9940a8c57c39.jpeg) | подойдёт |
| 18 | иномарка 2000-х, седан | [1995 Toyota Corolla DX (E100)](https://sketchfab.com/3d-models/6ed25676dd3e460d849dfce9beb73972) · ImperialBlue3D ★ | 5,2 тыс. | одна | ? | [jpg](https://media.sketchfab.com/models/6ed25676dd3e460d849dfce9beb73972/thumbnails/ea46b849387d4ee8b2ea0cf1586395e4/e8871f2520384bd39e2126fa76f655b1.jpeg) | подойдёт — «праворульная японка» тех лет |
| 19 | наша 2000-х, седан | [Vaz 2199](https://sketchfab.com/3d-models/a205332373bc4610a3d3487f731c0e13) · Yo.Ri ★ | 1,7 тыс. | да (3), чистая | ? | [jpg](https://media.sketchfab.com/models/a205332373bc4610a3d3487f731c0e13/thumbnails/0ef432c94e494880b17831be125e5ce0/78638bf527454b528c77c6c1c0f3a85a.jpeg) | подойдёт — «Девяносто девятая», самая лёгкая; хороша для потока |
| 20 | иномарка, седан | [Daewoo Nexia](https://sketchfab.com/3d-models/2db6fdf548694ae484f362b5a2e8ad26) · Mr Humster | 4,1 тыс. | нет (3 цвета) | ? | [jpg](https://media.sketchfab.com/models/2db6fdf548694ae484f362b5a2e8ad26/thumbnails/790adf51ac414123990069674192eb75/390197df44e1444a86dfa25b8ae63405.jpeg) | нет — болванка без фар и деталей |
| 21 | грузовик | [Zil 130](https://sketchfab.com/3d-models/f0eb399e57a249a7b7dd4058c64cf7b5) · javanilga | 7,3 тыс. | да (2) | ? | [jpg](https://media.sketchfab.com/models/f0eb399e57a249a7b7dd4058c64cf7b5/thumbnails/e63151aaab024999ab284c5f6aa8eb30/63d570e0679b47158033655e46e97e8f.jpeg) | подойдёт — бортовой; самосвала нет: кузов — поднять своим кодом или взять МАЗ ниже |
| 22 | грузовик | [Kamaz 5350](https://sketchfab.com/3d-models/f709825c67364b2b9d8d70ab76e6ed1b) · max.tynchenko | 6 тыс. | одна | ? | [jpg](https://media.sketchfab.com/models/f709825c67364b2b9d8d70ab76e6ed1b/thumbnails/dfb730349c0649bf9dcc216bc585ecb4/9f8115c3c39c4e5bafa1c4301469f5be.jpeg) | с правками — армейский 6×6 хаки; для города перекрасить кабину |
| 23 | самосвал | [MAZ-500 Dumptruck](https://sketchfab.com/3d-models/31acdafb2180436e924eaeaeab00f920) · eightismore | 4,4 тыс. | одна, мультяшная | ? | [jpg](https://media.sketchfab.com/models/31acdafb2180436e924eaeaeab00f920/thumbnails/fba0c0d50df54e6aa324794325e18ced/0f9eb8ed995b43adb9288bbcf9f9e555.jpeg) | с правками — единственный самосвал; стиль игрушечный, надпись на кабине |
| 24 | грузовик | [Zil 130 3D Model](https://sketchfab.com/3d-models/d71e38e4077f420781b5927d78d1e373) · Dzikus | 6,5 тыс. | одна | ? | — | **нет** — автор пишет, что модель взята из игры S.T.A.L.K.E.R.: чужая, лицензия CC-BY ничего не стоит |

## Что править (по строке)

1. Javkal 2101 — уже подготовлена (`kopeyka_off`); заново — свет и краска маской по ржавчине, либо взять другую.
2. krilov 2101 — стереть граффити и пятна с картинки (или маской краски накрыть весь кузов), убрать кусок асфальта под ней.
3. eightismore 2101 — свести яркость, колёса уменьшить; иначе выбивается из «Семёрки». Подходит, если брать всю серию
   eightismore разом (2101, ГАЗ-24, УАЗ, МАЗ, ЗАЗ — один стиль, все по 3—5 тыс.).
4. DANYA23K Москвич — картинку 2 штуки свести в одну, маска краски; обычная подготовка.
5. Bakhtin Москвич — ужать до ~6 тыс.; ржавчину на кузове закрыть маской краски или оставить как «старый» в потоке.
6. Egelsky ГАЗ-24 — PBR (цвет, металл, шероховатость, нормали) → оставить только цвет, 4K → 1K; маска краски по ржавчине.
7. eightismore ГАЗ-24 — как п. 3.
8. RitiWox «Нива» — обычная подготовка (`realcar.mjs`): маска краски, колёса, фары. Салона, скорее всего, нет — свой, как у всех.
9. randomcarguy «Нива» — не брать.
10. Egelsky «Буханка» — как п. 6; окна сзади глухие — для пассажирской версии дорисовать окна на картинке.
11. YouRun «Буханка» — срезать багажник на крыше и кенгурятник (отдельные части — по имени).
12. Yo.Ri ПАЗ — цвета (не картинка): маска краски — по материалу кузова, проще; салон видно — сиденья есть ли, смотреть.
13. kuwalol93 ПАЗ — ужать вдвое, свести 15 материалов.
14. Yo.Ri ГАЗ-3221 — как есть для скорой; для маршрутки — закрасить кресты и полосу на картинке (или маска).
15. Gazel Next — без картинки, 15 материалов; модель другого времени (новая «Газель»).
16—18. ImperialBlue3D — одна картинка на машину, подготовка обычная; салон, скорее всего, тёмный — свой, как у всех.
19. Yo.Ri 2199 — лёгкая (1,7 тыс.): годится и для потока, и для своей; салон — свой.
20. Nexia — не брать.
21. ЗИЛ-130 — бортовой; для самосвала — кузов отдельной частью и наклон кодом (как прицеп).
22. КамАЗ — перекрасить хаки (маска), убрать армейский тент/дуги, если есть.
23. МАЗ-500 — как п. 3, стереть надпись «Совтрансавто».
24. Dzikus ЗИЛ — не брать (и не брать другие модели Dzikus без проверки: у него «Москвич 2140» — возможно, тоже из S.T.A.L.K.E.R.).

## Не подошли

- **Quaternius** (Low Poly Cars, Public Transport — CC0) и **Kenney** Car Kit (CC0): лицензия отличная, но машины —
  плоскими цветами без картинки, игрушечные: рядом с «Семёркой» другой стиль. Годятся разве что для дальних машин.
- **УАЗ-452** у 42manako, Mona x Supercars, Pro_modeler — ровно 7 970 треугольников, как у Sergey Egelsky: похоже на
  перезаливы чужой модели — не брать, брать оригинал.
- **«Gazel»** i_zedder — это не «Газель», а старый ржавый грузовичок.
- Москвич-412 Renafox, Lada Zhiguli (Riva), VAZ-2105 Taxi 42manako, ZIL-131 и Kamaz-4310 42manako — **CC-BY-NC**
  (некоммерческая) — нельзя.
- Пачки Mason (Voyage 3, Traffic Racer NPC) — CC-BY-NC.
