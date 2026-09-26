/* Упаковка распакованного linux-билда для Steam Deck и linux-депота Steam.

   Запуск: node tools/pack-deck.mjs       (обычно через npm run dist:deck)

   Кладёт в release/linux-unpacked скрипт запуска bird-pizza.sh и сворачивает папку
   в release/bird-pizza-deck.tar.gz. Скрипт нужен потому, что Steam запускает игру из своей
   рабочей папки, а Electron ищет ресурсы рядом с бинарником; плюс --no-sandbox для SteamOS.
   Метку автообновления (.github-install) сюда не кладём — её ставит только install-deck.sh,
   чтобы тот же архив можно было залить в депот Steam. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'release', 'linux-unpacked');
const BIN = 'bird-pizza';                     // = build.linux.executableName в package.json
if (!fs.existsSync(path.join(dir, BIN))) {
  console.error(`нет release/linux-unpacked/${BIN} — сначала: npx electron-builder --linux dir --x64`);
  process.exit(1);
}

const sh = `#!/bin/bash
# Запуск «Птицы Пиццы» на Steam Deck / любом Linux.
# Аргументы пробрасываются в игру: --windowed, --log, --page=pad.html, --no-update
cd "$(dirname "$(readlink -f "$0")")" || exit 1
exec ./${BIN} --no-sandbox "$@"
`;
fs.writeFileSync(path.join(dir, `${BIN}.sh`), sh);
fs.chmodSync(path.join(dir, `${BIN}.sh`), 0o755);
fs.rmSync(path.join(dir, '.github-install'), { force: true });

const out = path.join(root, 'release', `${BIN}-deck.tar.gz`);
fs.rmSync(out, { force: true });
execFileSync('tar', ['-czf', out, '-C', path.join(root, 'release'), 'linux-unpacked'], { stdio: 'inherit' });
const mb = (fs.statSync(out).size / 1048576).toFixed(0);
console.log(`готово: release/${BIN}-deck.tar.gz (${mb} МБ)`);
console.log(`на Deck: tools/install-deck.sh --url file://$PWD/release/${BIN}-deck.tar.gz, или распаковать и добавить ${BIN}.sh как стороннюю игру`);
