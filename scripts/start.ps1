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

New-Item -ItemType Directory -Force -Path "audio_test", "data/input", "data/output", "data/temp", "data/jobs" | Out-Null

if ((-not (Test-Path ".env")) -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Creado .env desde .env.example"
}

Write-Host "Levantando backend en http://localhost:8000 ..."
docker compose up -d --build

Write-Host "Preparando frontend ..."
Set-Location (Join-Path $RootDir "frontend")
if ((-not (Test-Path ".env")) -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Creado frontend/.env desde frontend/.env.example"
}

if (-not (Test-Path "node_modules")) {
  pnpm install
}

Write-Host "Frontend en http://localhost:5173"
pnpm dev --host 0.0.0.0
