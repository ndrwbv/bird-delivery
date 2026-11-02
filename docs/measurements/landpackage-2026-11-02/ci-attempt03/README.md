# Третья попытка выпуска №17б — 41363861435

[Actions](https://github.com/ndrwbv/bird-delivery/actions/runs/41363861435), commit33be110. Подготовка/упаковка/ASAR обеихOS PASS, Linux runtime PASS. Windows runtime Electron тоже exit0/errors0: cache restored, clean0, precleanC7/wire965e/raw13b совпали, activate/align1, настоящийGo/guard2/W0,163м. ОбщийrunFAILED: Node admission строго отверг размер1024×720 вместо1280×800 (SMOKE_GRAPHICS). Release/Pages пропущены, версияv0.33.10 ещё не опубликована. Этот failed результат не переписан вPASS.

Windows BrowserWindow(useContentSize) ограничился workarea сервера. Исправление только в test harness: explicit settled-mode доnavigation выполняет настоящийCDP Emulation.setDeviceMetricsOverride(1280×800,DSF1,mobilefalse), читает реальныйinnerWidth/Height/DPR и падает при несовпадении. Host сохраняет requested/actual/nativeContentSize. Default early-режим не получает override; графика игры/прогрев/строгий size/cache/physics gate не меняются.

Один minimalElectron33.4.11 fixture наmacOS: native1024×720/DPR2 → CSS1280×800/DPR1, затем same-origin navigation. Проверены настоящийdocument layout, canvas и WebGLdrawingBuffer1280×800, реальныйupper-rightpixel[64,128,191,255], GLerror0. Nativewindow остался1024×720. Это runtime API proof наmacOS, **не actualWindows/физическаяDeck**; JSgetters не подменялись.

Отдельныйlocal synthetic-ASAR highCPU1 pilotPASS: viewport1280×800/DPR1, cache/clean0, настоящийW0,07784м, exit0/signalnull. Это старый source0fd dist, test-data container, не production executable/main/SteamCloud. Tiny admission + probe syntax + адресный npmcheck (admission/terminal/ordinary33) PASS. Следующийrun обязан подтвердить реальныеWindowsпакет/viewport, без понижения графики или отключения sizecheck.

JSON/log иисходникиfixture/fixedharness сохранены byte-exact, индекс содержитSHA. Игровыеpayload/releasebinaries здесь не хранятся.
