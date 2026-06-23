#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"
LOCAL_FILE="${1:-}"

if [[ -z "$LOCAL_FILE" ]]; then
  LOCAL_FILE="$(
    find audio_test -maxdepth 1 -type f \
      \( -iname '*.mp3' -o -iname '*.ogg' -o -iname '*.wav' \) \
      2>/dev/null | sort | head -n 1 || true
  )"
fi

if [[ -z "$LOCAL_FILE" || ! -f "$LOCAL_FILE" ]]; then
  echo "No se encontró audio local soportado en audio_test/." >&2
  exit 1
fi

filename="$(basename "$LOCAL_FILE")"

response="$(
  curl -sS -X POST "$API_URL/api/jobs/from-local" \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"$filename\"}"
)"

job_id="$(
  python -c 'import json, sys; print(json.load(sys.stdin)["job_id"])' <<< "$response"
)"

echo "Archivo local: $filename"
echo "Job: $job_id"

for _ in $(seq 1 180); do
  job="$(
    curl -sS "$API_URL/api/jobs/$job_id"
  )"
  status="$(
    python -c 'import json, sys; print(json.load(sys.stdin)["status"])' <<< "$job"
  )"
  progress="$(
    python -c 'import json, sys; print(json.load(sys.stdin)["progress"])' <<< "$job"
  )"

  echo "Estado: $status · $progress%"

  if [[ "$status" == "completed" ]]; then
    echo "$job" | python -m json.tool
    exit 0
  fi

  if [[ "$status" == "failed" ]]; then
    echo "$job" | python -m json.tool
    exit 1
  fi

  sleep 5
done

echo "Timeout esperando el job $job_id" >&2
exit 1
