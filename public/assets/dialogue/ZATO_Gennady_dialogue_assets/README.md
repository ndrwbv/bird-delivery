# Геннадий — игровой набор 2D-диалога

Геннадий встречает курьера на пороге своей квартиры. Он остаётся 2D-персонажем, а прихожую и лестничную площадку рисует существующая 3D-сцена игры. У диалога мягкая виньетка и отдельный интерфейс.

## Файлы

- `character/gennady/fullbody/{idle,talk,blink,smile,angry}.png` — используемые прозрачные полнофигурные состояния 1070×1470: ноги и тапки видны целиком, обе руки опущены и сложены перед животом.
- `character/gennady/{idle,talk,blink,smile,angry}.png` — прежние кадры до удлинения фигуры, сохранены как исходники.
- `character/gennady/silhouette_mask.png` — маска силуэта.
- `character/gennady/cutline.png` — прозрачный контрастный контур реза.
- `character/gennady/cutting_guide.png` — визуальная проверка маски и контура.
- `family-room.webp` — небольшая фотография на тумбе слева, лицом к курьеру; `family-dacha.webp` — неиспользуемый вариант. Подготовлены из сгенерированных иллюстраций и уменьшены до 640×480. Промпты: «aged Soviet family snapshot in a modest apartment, man resembling Gennady with woman and child, warm faded print»; «aged family dacha snapshot, same man with older relatives and child, faded 1980s photo paper». Персонажи на снимках не получают новых имён или сюжетных ролей.
- `gennady-chairman.webp` — портрет Геннадия в пиджаке для этажа; надписи добавляет игра. Создан встроенным imagegen по `fullbody/idle.png` с сохранением лица и живописной манеры, затем оптимизирован в WebP.
- `manifest.json` — пути, размеры и параметры микроанимации.

Текущие состояния собраны из одного базового полнофигурного кадра: одежда, сложенные руки, ноги, силуэт и альфа-канал совпадают пиксель в пиксель. В `talk`, `blink`, `smile` и `angry` меняются только небольшие участки лица. Новые кадры получены редактированием прежнего изображения через imagegen: сначала дорисованы ноги и домашние тапки, затем обе кисти опущены и сложены перед животом; отдельные выражения лица мягко наложены на общую основу. Промпты: «extend to a full-body transparent sprite, preserving identity, shirt and shorts, add natural bare legs and indoor slippers»; «lower the raised hand completely; both hands loosely clasped in front of the lower abdomen; preserve the full figure and transparent background».

`PROMPT_FOR_AGENT.md` хранит архив исходного задания. Актуальные реплики, выбор пиццы и оформление находятся в `src/game/story.js`, `src/game/minigames/door2d.css` и общем `src/game/dialog.js`.

Для следующего персонажа использовать [общую памятку](../../../../docs/CHARACTER-2D.md): стиль, промпт, размеры, соединение 2D с 3D и найденные ошибки.

Для немедленного просмотра в игре: `?mute&doorpreview` (дверь и диалог) или `?mute&stairspreview` (подъём с первого этажа). Кнопка повтора появляется после завершения сцены. Просмотр не сохраняет заказ.
