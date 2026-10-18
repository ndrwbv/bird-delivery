#!/usr/bin/env bash
# Новая версия приёмника статистики (Cloud Function bird-ingest) из tools/telemetry/function.
# Только личный профиль Яндекс Облака: yc --profile personal. docs/ANALYTICS.md, tools/telemetry/README.md
set -euo pipefail
cd "$(dirname "$0")"
FOLDER=$(node -p "require('./cloud.json').folderId")
DB=$(node -p "require('./cloud.json').database")
SA=$(yc --profile personal iam service-account get bird-ingest --folder-id "$FOLDER" --format json | node -p "JSON.parse(require('fs').readFileSync(0)).id")
yc --profile personal serverless function version create \
  --folder-id "$FOLDER" \
  --function-name bird-ingest \
  --runtime nodejs22 \
  --entrypoint index.handler \
  --memory 128m \
  --execution-timeout 5s \
  --concurrency 4 \
  --service-account-id "$SA" \
  --environment "YDB_DATABASE=$DB,YDB_TABLE=events,GAME_KEYS=bp1" \
  --no-logging \
  --source-path ./function
yc --profile personal serverless function allow-unauthenticated-invoke bird-ingest --folder-id "$FOLDER"
echo "адрес: $(yc --profile personal serverless function get bird-ingest --folder-id "$FOLDER" --format json | node -p "JSON.parse(require('fs').readFileSync(0)).http_invoke_url")"
