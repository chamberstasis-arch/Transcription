#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker no está instalado o no está disponible en PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose no está disponible. Instala Docker Desktop o el plugin docker compose." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm no está instalado. Instala Node.js y ejecuta: corepack enable" >&2
  exit 1
fi

mkdir -p audio_test data/input data/output data/temp data/jobs

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  echo "Creado .env desde .env.example"
fi

# Prepara y construye el frontend ANTES de levantar el backend: el contenedor
# monta frontend/dist y sirve la app same-origin en el mismo puerto que la API.
echo "Preparando frontend ..."
cd "$ROOT_DIR/frontend"
if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  echo "Creado frontend/.env desde frontend/.env.example"
fi
if [[ ! -d node_modules ]]; then
  pnpm install
fi
echo "Construyendo frontend (servido por el backend) ..."
pnpm build

cd "$ROOT_DIR"
echo "Levantando backend ..."
docker compose up -d --build

PORT="${API_PORT:-8000}"
echo
echo "Aplicación (front + API) en:   http://localhost:${PORT}"
echo "Servidor de desarrollo (HMR):  http://localhost:5173"
echo

cd "$ROOT_DIR/frontend"
pnpm dev --host 0.0.0.0
