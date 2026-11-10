#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

repo=ndrwbv/bird-delivery
tag=city-data-cache
mode=${1:-prepare}

read_draft() {
  local response
  if response=$(gh release view "$tag" -R "$repo" --json isDraft,assets 2>&1); then
    if ! jq -e '.isDraft' <<< "$response" > /dev/null; then
      echo "Служебный выпуск $tag должен быть черновиком" >&2
      return 1
    fi
    printf '%s\n' "$response"
  elif [ "$response" != 'release not found' ]; then
    printf '%s\n' "$response" >&2
    return 1
  fi
}

has_package() {
  jq -e --arg name "$1" 'any(.assets[]; .name == $name and .state == "uploaded")' <<< "$draft" > /dev/null
}

if [ "$mode" = download ]; then
  kind=$2
  key=$3
  destination=$4
  draft=$(read_draft)
  archive="city-$kind-$key.tar.gz"
  if [ -n "$draft" ] && has_package "$archive"; then
    staging=$(mktemp -d "${RUNNER_TEMP:-/tmp}/bird-city-download.XXXXXX")
    trap 'rm -rf -- "$staging"' EXIT
    gh release download "$tag" -R "$repo" --pattern "$archive" --dir "$staging"
    tar -xzf "$staging/$archive" -C "$staging"
    mkdir -p "$(dirname "$destination")"
    mv "$staging/package" "$destination"
    echo "found=true" >> "$GITHUB_OUTPUT"
    echo "Готовые данные с Mac: $kind" >> "$GITHUB_STEP_SUMMARY"
  fi
  exit
fi

if [ "$mode" != prepare ] && [ "$mode" != upload ]; then
  echo 'Режимы: prepare, upload <папка подготовки>' >&2
  exit 2
fi

if [ "$(gh api user --jq .login)" != ndrwbv ]; then
  echo 'Для загрузки данных переключите GitHub CLI на личный аккаунт ndrwbv.' >&2
  exit 1
fi
key=$(node --input-type=module -e "import { captureSource } from './tools/land-package-files.mjs'; console.log(captureSource('.').base.sourceHash)")
draft=$(read_draft)
if [ "$mode" = upload ]; then
  output=$2
else
  if [ -n "$draft" ] && has_package "city-land-$key.tar.gz" && has_package "city-address-$key.tar.gz"; then
    echo 'На GitHub уже есть оба совместимых пакета города.'
    exit 0
  fi
  output=$(mktemp -d "${TMPDIR:-/tmp}/bird-city-local.XXXXXX")
  printf 'Подготовка города на этом компьютере. Файлы и журналы: %s\n' "$output"
  export BUILD_VERSION=0.0.0
  land_pid= address_pid=
  if [ -z "$draft" ] || ! has_package "city-land-$key.tar.gz"; then
    (
      node tools/land-package-prepare.mjs --single-export "--out=$output/land" &&
      node tools/land-surface-prepare.mjs "--package=$output/land/package" "--out=$output/surface" &&
      node tools/deck-shader-prepare.mjs "--package=$output/land/package" "--out=$output/deck-shaders"
    ) &
    land_pid=$!
  fi
  if [ -z "$draft" ] || ! has_package "city-address-$key.tar.gz"; then
    node tools/address-package-prepare.mjs --ordinary --single-export "--out=$output/address" &
    address_pid=$!
  fi
  failed=0
  for pid in "$land_pid" "$address_pid"; do
    if [ -n "$pid" ]; then wait "$pid" || failed=1; fi
  done
  if [ "$failed" -ne 0 ]; then exit "$failed"; fi
fi

if [ -z "$draft" ]; then
  gh release create "$tag" -R "$repo" --draft --target main --title 'Солнечный · готовые данные' \
    --notes 'Служебное хранилище пакетов земли и адресов для сборки игры.'
  draft=$(read_draft)
fi

for kind in land address; do
  archive="city-$kind-$key.tar.gz"
  if has_package "$archive"; then
    printf 'Готовый пакет уже на GitHub: %s\n' "$kind"
    continue
  fi
  catalog="$output/$kind/package/catalog.json"
  jq -e --arg key "$key" '(.manifest.sourceHash // .slots[0].identity.sourceHash) == $key' "$catalog" > /dev/null
  COPYFILE_DISABLE=1 tar -czf "$output/$archive" -C "$output/$kind" package
  gh release upload "$tag" -R "$repo" "$output/$archive"
  printf 'Пакет загружен: %s\n' "$kind"
done

if [ "$mode" = prepare ]; then rm -rf -- "$output"; fi
