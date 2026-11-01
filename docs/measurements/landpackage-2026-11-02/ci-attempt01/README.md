# Первый выпускной запуск №17б — 41359487777

Commit bec86a9, кандидат v0.33.10; [Actions](https://github.com/ndrwbv/bird-delivery/actions/runs/41359487777). Выпуск/Pages пропущены: Windows проверка архива остановила run, опубликованной версией остаётся v0.33.9.

Linux prepare4/4 и сборка/ASAR/runtime PASS. Source0fd44d87 совпал между macOS, Linux и Windows build; preclean c7ac523c совпал. Linux gzip34 231 591байт, SHA965ebbc0…, отличается от локального wireSHA; подставлять локальный digest в CI нельзя, везде проверяется свой явный ожидаемый SHA. Linux high CPU1 runtime136,308с/exit0/signalnull/cache restored/clean0. Это CI VM и packaged-dist probe, не production executable/main/Steam Cloud/физическая Deck, не сравнительный замер скорости.

Windows build/pack успешно создали payload/catalog; verifier упал на первом statFile(catalog): ASAR Filesystem делит dirname по native path.sep, а передан POSIX URL. Во всех5 вызовах stat/extract теперь преобразуется только внутренний путь ASAR; каталог, browser URL и inventory остаются POSIX. Win32 regression исполняет настоящий installed ASAR Filesystem/asar.js в VM с win32path и tiny fake disk: старый lookup воспроизводит отказ; новый valid проходит, corrupt/missing/orphan по-прежнему отвергаются. Всего13 tiny PASS, адресный npm run check -- --serial --only=land-package-asar PASS. Игровые исходники и package format этим исправлением не менялись.

Исходные JSON/log artifacts и Windows joblog сохранены byte-exact; index содержит SHA. Полные игровые payload и release binaries здесь не хранятся. Следующая попытка — отдельный run на исправленном verifier, без изменения failed результата этой.
