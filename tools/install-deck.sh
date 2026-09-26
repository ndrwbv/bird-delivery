#!/usr/bin/env bash
# Установка «Птицы Пиццы» на Steam Deck (и любой Linux x86_64) одной командой.
#
#   curl -fsSL https://raw.githubusercontent.com/ndrwbv/bird-pizza/main/tools/install-deck.sh | bash
#
# Качает свежий релиз с GitHub, распаковывает игру в папку bird-pizza рядом с собой,
# ставит права на запуск и делает ярлык «Птица Пицца», который видит Steam.
# Такая установка сама предлагает обновления (метка .github-install в папке игры).
#
# Флаги (через `| bash -s -- --run`):
#   --run          сразу запустить игру после установки
#   --dir ПАПКА    поставить не в ./bird-pizza, а куда сказано
#   --tag v0.1.0   конкретная версия вместо последней
#   --no-desktop   не создавать ярлык
#   --url АДРЕС    взять архив по своему адресу (или локальный file:///path)
set -euo pipefail

REPO="ndrwbv/bird-pizza"
BIN="bird-pizza"
ASSET="bird-pizza-deck.tar.gz"
DIR="$PWD/bird-pizza"
TAG=""
URL=""
RUN=0
DESKTOP=1

while [ $# -gt 0 ]; do
  case "$1" in
    --run) RUN=1 ;;
    --dir) DIR="${2:?--dir без пути}"; shift ;;
    --tag) TAG="${2:?--tag без версии}"; shift ;;
    --no-desktop) DESKTOP=0 ;;
    --url) URL="${2:?--url без адреса}"; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "неизвестный флаг: $1" >&2; exit 1 ;;
  esac
  shift
done

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Linux" ] || die "Это сборка под Linux (Steam Deck). Здесь: $(uname -s)."
[ "$(uname -m)" = "x86_64" ] || die "Нужен x86_64, а тут $(uname -m)."
command -v curl >/dev/null || die "нет curl"
command -v tar  >/dev/null || die "нет tar"

case "$DIR" in /*) ;; *) DIR="$PWD/${DIR#./}" ;; esac
if [ -z "$URL" ]; then
  if [ -n "$TAG" ]; then URL="https://github.com/$REPO/releases/download/$TAG/$ASSET"
  else URL="https://github.com/$REPO/releases/latest/download/$ASSET"; fi
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "Качаю ${TAG:-последний релиз}…"
curl -fL --progress-bar -o "$TMP/$ASSET" "$URL" \
  || die "Не скачалось. Проверь, что релиз выложен: https://github.com/$REPO/releases"

# Свежая установка или обновление поверх старой: сносим только то, что сами и ставили.
# Сохранения лежат не здесь, а в ~/.config/BirdPizza — их обновление не трогает.
if [ -e "$DIR" ]; then
  if [ -f "$DIR/$BIN" ] && [ -f "$DIR/resources/app.asar" ]; then
    say "Обновляю установку в $DIR"
    rm -rf "$DIR"
  elif [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
    die "Папка $DIR занята чем-то чужим — удали её или укажи другую через --dir."
  fi
fi

mkdir -p "$DIR"
say "Распаковываю в $DIR…"
tar -xzf "$TMP/$ASSET" -C "$DIR" --strip-components=1
[ -f "$DIR/$BIN" ] || die "В архиве нет бинарника $BIN — битая сборка."

chmod +x "$DIR/$BIN" "$DIR/$BIN.sh" 2>/dev/null || true
chmod +x "$DIR/chrome_crashpad_handler" 2>/dev/null || true
find "$DIR" -name '*.so' -exec chmod +x {} + 2>/dev/null || true
# метка «поставлено с GitHub»: по ней игра включает проверку обновлений
printf '%s\n' "$URL" > "$DIR/.github-install"

if [ "$DESKTOP" = "1" ]; then
  ICON=""
  [ -f "$DIR/resources/icon.png" ] && ICON="Icon=$DIR/resources/icon.png"
  ENTRY="[Desktop Entry]
Type=Application
Name=Птица Пицца
Name[en]=Bird Pizza
GenericName=Bird Pizza
Comment=Аркадная доставка пиццы по Москве
Comment[en]=Arcade pizza delivery across Moscow
Exec=\"$DIR/$BIN.sh\"
Path=$DIR
$ICON
Terminal=false
Categories=Game;ArcadeGame;
"
  mkdir -p "$HOME/.local/share/applications"
  printf '%s' "$ENTRY" > "$HOME/.local/share/applications/$BIN.desktop"
  chmod +x "$HOME/.local/share/applications/$BIN.desktop"
  if [ -d "$HOME/Desktop" ]; then
    printf '%s' "$ENTRY" > "$HOME/Desktop/$BIN.desktop"
    chmod +x "$HOME/Desktop/$BIN.desktop"
  fi
  command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
fi

say ""
say "Готово. Игра: $DIR/$BIN.sh"
cat <<TXT

  запустить сейчас:          $DIR/$BIN.sh
  окном, не на весь экран:   $DIR/$BIN.sh --windowed
  проверить геймпад:         $DIR/$BIN.sh --page=pad.html

  добавить в Steam (чтобы играть из игрового режима):
  Steam → Games → Add a Non-Steam Game → Browse → фильтр All Files →
  $DIR/$BIN.sh → в свойствах ярлыка НЕ включать Proton.
TXT

if [ "$RUN" = "1" ]; then
  say "Запускаю…"
  exec "$DIR/$BIN.sh"
fi
