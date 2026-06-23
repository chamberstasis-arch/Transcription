param(
  [switch]$Pull
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker no está instalado o no está disponible en PATH."
}

try {
  docker compose version | Out-Null
} catch {
  Write-Error "Docker Compose no está disponible. Instala Docker Desktop."
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Error "pnpm no está instalado. Instala Node.js y ejecuta: corepack enable"
}

if ($Pull) {
  $insideGit = $false
  try {
    git rev-parse --is-inside-work-tree | Out-Null
    git remote get-url origin | Out-Null
    $insideGit = $true
  } catch {
    $insideGit = $false
  }

  if ($insideGit) {
    Write-Host "Actualizando repo remoto con git pull --ff-only ..."
    git pull --ff-only
  } else {
    Write-Host "No hay remoto Git configurado; se omite git pull."
  }
}

New-Item -ItemType Directory -Force -Path "audio_test", "data/input", "data/output", "data/temp", "data/jobs" | Out-Null

if ((-not (Test-Path ".env")) -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Creado .env desde .env.example"
}

if ((-not (Test-Path "frontend/.env")) -and (Test-Path "frontend/.env.example")) {
  Copy-Item "frontend/.env.example" "frontend/.env"
  Write-Host "Creado frontend/.env desde frontend/.env.example"
}

Write-Host "Instalando dependencias frontend desde pnpm-lock.yaml ..."
pnpm --dir frontend install --frozen-lockfile

Write-Host "Generando build de frontend ..."
pnpm --dir frontend build

Write-Host "Reconstruyendo backend Docker ..."
docker compose build --pull

Write-Host "Levantando backend actualizado ..."
docker compose up -d

Write-Host "Entorno actualizado."
Write-Host "Backend:  http://localhost:8000"
Write-Host "Frontend: ejecuta 'cd frontend; pnpm dev --host 0.0.0.0'"
