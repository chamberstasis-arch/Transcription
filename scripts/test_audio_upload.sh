#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"
AUDIO_FILE="${1:-}"

if [[ -z "$AUDIO_FILE" ]]; then
  AUDIO_FILE="$(
    find audio_test -maxdepth 1 -type f \
      \( -iname '*.mp3' -o -iname '*.ogg' -o -iname '*.wav' \) \
      2>/dev/null | sort | head -n 1 || true
  )"
fi

if [[ -z "$AUDIO_FILE" || ! -f "$AUDIO_FILE" ]]; then
  echo "No se encontró audio soportado. Coloca un .mp3, .ogg o .wav en audio_test/ o pasa la ruta como argumento." >&2
  exit 1
fi

response="$(
  curl -sS -X POST "$API_URL/api/upload" \
    -H "accept: application/json" \
    -F "file=@$AUDIO_FILE"
)"

job_id="$(
  python -c 'import json, sys; print(json.load(sys.stdin)["job_id"])' <<< "$response"
)"

echo "Archivo: $AUDIO_FILE"
echo "Job: $job_id"

for _ in $(seq 1 120); do
  job="$(
    curl -sS "$API_URL/api/jobs/$job_id"
  )"
  status="$(
    python -c 'import json, sys; print(json.load(sys.stdin)["status"])' <<< "$job"
  )"

  echo "Estado: $status"

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
