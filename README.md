# TranscripcionVideo

Herramienta local para transcribir audio con FastAPI, FFmpeg y `faster-whisper`.

El proyecto incluye:

- Backend local con FastAPI.
- Frontend con React + TypeScript + Vite + Tailwind.
- Transcripción local para `.mp3`, `.ogg` y `.wav`.
- Resultados en TXT, SRT y JSON de segmentos con timestamps.
- Procesamiento desde upload del navegador o desde archivos locales en `audio_test/`.
- Limpieza de temporales, historial y resultados.

## Requisitos

### Linux o WSL recomendado

- Docker Engine o Docker Desktop con integración WSL.
- Docker Compose v2 (`docker compose`).
- Node.js 20 o superior.
- `pnpm`.

Instalar/activar `pnpm`:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

### Windows

Opción recomendada: usar WSL 2 con Docker Desktop.

También se puede ejecutar con PowerShell si Docker Desktop, Node.js y `pnpm` están disponibles en Windows.

## Configuración inicial

Clona el repo y entra al directorio:

```bash
git clone <url-del-repo>
cd TranscripcionVideo
```

Crea configuración local:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

En PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env
```

Los valores por defecto funcionan en CPU:

```env
WHISPER_MODEL_SIZE=base
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
TRANSCRIPTION_CHUNK_SECONDS=600
```

Para audios en español, puedes fijar:

```env
WHISPER_LANGUAGE=es
```

## Inicio rápido

### Linux / WSL

```bash
bash scripts/start.sh
```

Esto levanta:

- Backend: <http://localhost:8000>
- Frontend: <http://localhost:5173>

### Windows PowerShell

```powershell
.\scripts\start.ps1
```

Si PowerShell bloquea scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Actualizar entorno

Para reinstalar dependencias del frontend, generar build y reconstruir el backend:

```bash
bash scripts/update.sh
```

En PowerShell:

```powershell
.\scripts\update.ps1
```

Si el proyecto ya tiene un remoto configurado y quieres traer cambios antes de actualizar:

```bash
bash scripts/update.sh --pull
```

En PowerShell:

```powershell
.\scripts\update.ps1 -Pull
```

Estos scripts no borran audios ni resultados. La limpieza se hace desde la UI o con los endpoints de limpieza.

## Inicio manual

Backend:

```bash
docker compose up -d --build
```

Frontend:

```bash
cd frontend
pnpm install
pnpm dev --host 0.0.0.0
```

Abrir:

```text
http://localhost:5173
```

## Uso

### Subir archivo

1. Abre `http://localhost:5173`.
2. Entra a la pestaña `Subir`.
3. Selecciona un archivo `.mp3`, `.ogg` o `.wav`.
4. Elige si quieres persistir la entrada.
5. Pulsa `Subir y procesar`.
6. Descarga TXT, SRT o segmentos JSON al terminar.

### Procesar archivo local

1. Copia tu audio a `audio_test/`.
2. Abre la pestaña `Local`.
3. Pulsa `Procesar local`.

Este modo evita subir/copiar el archivo desde el navegador y es más cómodo para archivos grandes.

## Limpieza

Desde la UI puedes:

- Borrar jobs del historial.
- Borrar resultados asociados.
- Borrar archivos locales en `audio_test/`.
- Limpiar temporales en `data/temp`.

También puedes usar API:

```bash
curl -X POST http://localhost:8000/api/temp/cleanup
```

Limpiar historial completado/fallido:

```bash
curl -X POST http://localhost:8000/api/jobs/cleanup \
  -H "Content-Type: application/json" \
  -d '{"statuses":["completed","failed"],"delete_input":true,"delete_output":true,"delete_temp":true}'
```

## Pruebas manuales

Coloca un audio en `audio_test/` y ejecuta:

```bash
bash scripts/test_local_file.sh audio_test/tu-audio.ogg
```

Probar upload:

```bash
bash scripts/test_audio_upload.sh audio_test/tu-audio.wav
```

Probar todos los audios soportados en `audio_test/`:

```bash
bash scripts/test_audio_formats.sh
```

## Estructura

```text
app/                Backend FastAPI
app/services/       Servicios de jobs, storage, media, transcripción y limpieza
frontend/           React + TypeScript + Vite + Tailwind
audio_test/         Audios locales de prueba o trabajo (ignorado por Git)
data/input/         Entradas subidas (ignorado por Git)
data/output/        TXT/SRT/JSON generados (ignorado por Git)
data/temp/          Artefactos temporales (ignorado por Git)
data/jobs/          Jobs JSON locales (ignorado por Git)
scripts/            Scripts de inicio, parada y prueba
```

## Notas para repos remotos

El repo está preparado para no subir:

- Audios locales.
- Entradas subidas.
- Outputs generados.
- Jobs JSON.
- Temporales.
- `node_modules`.
- Builds de frontend.

Las carpetas necesarias se conservan con `.gitkeep`.

El plan de trabajo actual queda documentado en:

```text
docs/plan-trabajo.md
```

## Troubleshooting

### Docker no responde en WSL

Verifica que Docker Desktop tenga habilitada la integración con tu distro WSL.

```bash
docker version
docker compose version
```

### El frontend no conecta al backend

Confirma que el backend esté arriba:

```bash
curl http://localhost:8000/api/config
```

Y que `.env` tenga:

```env
FRONTEND_ORIGIN=http://localhost:5173
```

Y que `frontend/.env` tenga:

```env
VITE_API_URL=http://localhost:8000
```

### La primera transcripción tarda

La primera ejecución puede descargar el modelo de `faster-whisper`.

### Archivos grandes

Usa la pestaña `Local` copiando el archivo a `audio_test/`. Ajusta:

```env
TRANSCRIPTION_CHUNK_SECONDS=600
```

La siguiente mejora recomendada es añadir solape entre chunks para audios largos.
