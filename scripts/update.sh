#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PULL_REPO=false

if [[ "${1:-}" == "--pull" ]]; then
  PULL_REPO=true
fi

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

if "$PULL_REPO"; then
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
    echo "Actualizando repo remoto con git pull --ff-only ..."
    git pull --ff-only
  else
    echo "No hay remoto Git configurado; se omite git pull."
  fi
fi

mkdir -p audio_test data/input data/output data/temp data/jobs

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  echo "Creado .env desde .env.example"
fi

if [[ ! -f frontend/.env && -f frontend/.env.example ]]; then
  cp frontend/.env.example frontend/.env
  echo "Creado frontend/.env desde frontend/.env.example"
fi

echo "Instalando dependencias frontend desde pnpm-lock.yaml ..."
pnpm --dir frontend install --frozen-lockfile

echo "Generando build de frontend ..."
pnpm --dir frontend build

echo "Reconstruyendo backend Docker ..."
docker compose build --pull

echo "Levantando backend actualizado ..."
docker compose up -d

echo "Entorno actualizado."
echo "Backend:  http://localhost:8000"
echo "Frontend: ejecuta 'cd frontend && pnpm dev --host 0.0.0.0'"
