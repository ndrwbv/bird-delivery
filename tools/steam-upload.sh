#!/usr/bin/env bash
# Залить сборку в Steam одной командой.
#
#   STEAM_USER=логин tools/steam-upload.sh [тег] [--live beta] [--preview]
#
# Берёт bird-pizza-win.zip и bird-pizza-deck.tar.gz из гит-релиза (тег или latest)
# в github.com/ndrwbv/bird-delivery — их собирает Actions → «Релиз». Можно и свои:
# LOCAL=1 — из release/ этой папки (npm run dist:win на Windows, npm run dist:deck).
# Раскладывает по tools/steam/content/{win,linux}, пишет vdf из шаблонов и зовёт steamcmd.
# App ID — STEAM_APP_ID или steam_appid.txt; депоты — App ID +1 (Windows) и +2 (Linux),
# как в docs/STEAM-UPLOAD.md. --live beta — сразу выкатить на ветку beta (default нельзя:
# его включают руками в Steamworks). --preview — прогон без заливки.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=ndrwbv/bird-delivery
ROOT="$PWD/tools/steam"
TAG=""; LIVE=""; PREVIEW=0
while [ $# -gt 0 ]; do
  case "$1" in
    --live) LIVE="$2"; shift 2 ;;
    --preview) PREVIEW=1; shift ;;
    *) TAG="$1"; shift ;;
  esac
done
[ "$LIVE" = "default" ] && { echo "на default выкатывают руками в Steamworks → Builds"; exit 1; }
APPID="${STEAM_APP_ID:-$( [ -f steam_appid.txt ] && tr -dc 0-9 < steam_appid.txt || true )}"
[ -n "$APPID" ] || { echo "нет App ID: STEAM_APP_ID=… или файл steam_appid.txt"; exit 1; }
[ -n "${STEAM_USER:-}" ] || { echo "нужен STEAM_USER — логин аккаунта Steamworks с правом заливки"; exit 1; }
command -v steamcmd >/dev/null || { echo "нет steamcmd — см. docs/STEAM-UPLOAD.md, шаг 5"; exit 1; }

rm -rf "$ROOT/content" "$ROOT/dl"; mkdir -p "$ROOT/content/win" "$ROOT/content/linux" "$ROOT/dl" "$ROOT/output"
if [ "${LOCAL:-}" = "1" ]; then
  cp release/bird-pizza-win.zip release/bird-pizza-deck.tar.gz "$ROOT/dl/"
  TAG="${TAG:-local-$(git rev-parse --short HEAD)}"
else
  URL="https://github.com/$REPO/releases/${TAG:+download/$TAG}"; [ -z "$TAG" ] && URL="https://github.com/$REPO/releases/latest/download"
  for f in bird-pizza-win.zip bird-pizza-deck.tar.gz; do
    echo "качаем $f"; curl -fL --progress-bar -o "$ROOT/dl/$f" "$URL/$f"
  done
  TAG="${TAG:-latest}"
fi
unzip -q "$ROOT/dl/bird-pizza-win.zip" -d "$ROOT/content/win"
tar -xzf "$ROOT/dl/bird-pizza-deck.tar.gz" -C "$ROOT/content/linux" --strip-components=1
# zip бывает с одной папкой внутри — поднимаем её содержимое
if [ ! -f "$ROOT/content/win/BirdPizza.exe" ]; then
  d=$(find "$ROOT/content/win" -name BirdPizza.exe -maxdepth 3 | head -1); [ -n "$d" ] && { src=$(dirname "$d"); (shopt -s dotglob; mv "$src"/* "$ROOT/content/win/"); }
fi
[ -f "$ROOT/content/win/BirdPizza.exe" ] || { echo "в zip нет BirdPizza.exe"; exit 1; }
[ -x "$ROOT/content/linux/bird-pizza.sh" ] || { echo "в tar.gz нет bird-pizza.sh"; exit 1; }

sub () { sed -e "s#@APPID@#$APPID#g" -e "s#@TAG@#$TAG#g" -e "s#@ROOT@#$ROOT#g" -e "s#@LIVE@#$LIVE#g" \
  -e "s#@PREVIEW@#$PREVIEW#g" -e "s#@DEPOT_WIN@#$((APPID + 1))#g" -e "s#@DEPOT_LINUX@#$((APPID + 2))#g" "$@"; }
sub "$ROOT/app_build.vdf.tmpl" > "$ROOT/app_build.vdf"
sub -e "s#@DEPOT@#$((APPID + 1))#g" -e "s#@OS@#win#g" "$ROOT/depot.vdf.tmpl" > "$ROOT/depot_win.vdf"
sub -e "s#@DEPOT@#$((APPID + 2))#g" -e "s#@OS@#linux#g" "$ROOT/depot.vdf.tmpl" > "$ROOT/depot_linux.vdf"
echo "App $APPID, тег $TAG, депоты $((APPID + 1)) (win) и $((APPID + 2)) (linux)${LIVE:+, сразу на ветку $LIVE}"
steamcmd +login "$STEAM_USER" +run_app_build "$ROOT/app_build.vdf" +quit
echo "готово: Steamworks → SteamPipe → Builds"
