#!/usr/bin/env bash
set -euo pipefail

# Precarga el modelo faster-whisper directamente desde el CDN de HuggingFace.
#
# Motivo: el cliente hf_hub descarga sin token con rate-limit agresivo, lo que
# deja la PRIMERA transcripción atascada varios minutos en "preparing". El CDN
# de blobs (resolve/main) no está limitado y baja el modelo en segundos.
#
# Uso:
#   bash scripts/fetch_model.sh           # modelo "base" (por defecto)
#   WHISPER_MODEL=small bash scripts/fetch_model.sh
#
# Deja el modelo en ./models y genera docker-compose.override.yml para montarlo.
# Luego: docker compose up -d --build

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODEL="${WHISPER_MODEL:-base}"
REPO="Systran/faster-whisper-${MODEL}"
DEST="models/faster-whisper-${MODEL}"
BASE_URL="https://huggingface.co/${REPO}/resolve/main"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl no está disponible." >&2
  exit 1
fi

mkdir -p "$DEST"
echo "Descargando ${REPO} -> ${DEST} ..."

got_model=false
for f in config.json model.bin tokenizer.json vocabulary.txt vocabulary.json preprocessor_config.json; do
  code="$(curl -fsSL -o "$DEST/$f" -w '%{http_code}' "$BASE_URL/$f" 2>/dev/null || echo 000)"
  if [ "$code" = "200" ]; then
    echo "  OK   $f"
    [ "$f" = "model.bin" ] && got_model=true
  else
    echo "  skip $f (HTTP $code)"
    rm -f "$DEST/$f"
  fi
done

if [ "$got_model" != "true" ]; then
  echo "No se pudo descargar model.bin de ${REPO}." >&2
  exit 1
fi

cat > docker-compose.override.yml <<YML
# Generado por scripts/fetch_model.sh — no versionar.
# Monta el modelo faster-whisper precargado en ./models y apunta el backend a él
# para evitar la descarga throttled desde HuggingFace Hub.
services:
  api:
    environment:
      WHISPER_MODEL_SIZE: /models/faster-whisper-${MODEL}
    volumes:
      - ./models:/models:ro
YML

echo
echo "Listo. Modelo en ${DEST} y docker-compose.override.yml generado."
echo "Recrea el backend con:  docker compose up -d --build"
