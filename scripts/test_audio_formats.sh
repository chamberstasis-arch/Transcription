#!/usr/bin/env bash
set -euo pipefail

found=0

while IFS= read -r audio_file; do
  found=1
  echo "== Probando $audio_file =="
  bash scripts/test_audio_upload.sh "$audio_file"
done < <(
  find audio_test -maxdepth 1 -type f \
    \( -iname '*.mp3' -o -iname '*.ogg' -o -iname '*.wav' \) \
    2>/dev/null | sort
)

if [[ "$found" -eq 0 ]]; then
  echo "No se encontraron archivos .mp3, .ogg o .wav en audio_test/." >&2
  exit 1
fi
