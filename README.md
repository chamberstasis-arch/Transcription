# Transcriptor

Herramienta local para transcribir audio con FastAPI, FFmpeg y `faster-whisper`.

El proyecto incluye:

- Backend local con FastAPI.
- Frontend con React + TypeScript + Vite + Tailwind (tema oscuro **Blueprint Terminal**).
- Transcripción local de audio (`.mp3/.ogg/.wav/.m4a/.flac/.aac`) y vídeo (`.mp4/.mov/.mkv/.webm/.avi`, del que se extrae la pista de audio).
- Resultados en TXT, SRT y JSON de segmentos con timestamps.
- Procesamiento desde upload del navegador o desde archivos locales en `audio_test/`.
- Frontend servido por el backend (same-origin, **un solo puerto**): sin configurar URL ni CORS.
- Menú con dos vistas: **Transcriptor** y **Archivos** (gestor que lista, reproduce, descarga y elimina los audios/vídeos cargados en el servidor).
- Autenticación opcional por API key con **login y cookie de sesión httpOnly**, pensada para acceso remoto vía túnel SSH o Tailscale.
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
cd transcriptor
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

Los valores por defecto funcionan en CPU y en modo local abierto (sin autenticación):

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

Esto construye el front, lo sirve desde el backend y deja además el dev server:

- Aplicación (front + API): <http://localhost:8000>
- Servidor de desarrollo (HMR): <http://localhost:5173>

### Windows PowerShell

```powershell
.\scripts\start.ps1
```

Si PowerShell bloquea scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Arranque rápido del modelo (recomendado)

La **primera transcripción** descarga el modelo de `faster-whisper` desde HuggingFace.
Sin `HF_TOKEN` esa descarga está fuertemente limitada y puede dejar el primer job
atascado varios minutos en `Preparando archivo`.

Para evitarlo, precarga el modelo desde el CDN (segundos) antes de levantar:

```bash
bash scripts/fetch_model.sh           # modelo "base" (por defecto)
WHISPER_MODEL=small bash scripts/fetch_model.sh
```

El script descarga el modelo a `./models/` y genera `docker-compose.override.yml`
para montarlo. Luego:

```bash
docker compose up -d --build
```

`models/` y `docker-compose.override.yml` no se versionan.

## Acceso remoto y seguridad

El frontend se sirve **desde el propio backend** (same-origin), así que solo hay
**un puerto** que reenviar. El escenario soportado es exponer la API **tras un túnel
SSH o Tailscale, nunca de forma pública**: el túnel (SSH) o WireGuard (Tailscale)
cifra el transporte, por lo que HTTP plano es suficiente, y el login con cookie de
sesión actúa como defensa en profundidad sobre la red privada.

### Activar autenticación (backend)

En `.env`:

```env
# Vacío = modo local abierto. Con valores, se exige login (o header X-API-Key).
API_KEYS=una-clave-larga-y-aleatoria
# Secreto para firmar la sesión (opcional; si se omite se deriva de API_KEYS).
SESSION_SECRET=
# Vigencia de la sesión en horas y atributos de la cookie.
SESSION_TTL_HOURS=168
COOKIE_SECURE=false   # ponlo true solo si sirves por HTTPS
COOKIE_SAMESITE=lax
# Publica el contenedor solo en la interfaz del túnel:
#   127.0.0.1  -> solo túnel SSH local (ssh -L 8000:localhost:8000 host)
#   100.x.y.z  -> IP de Tailscale del host
API_BIND_HOST=127.0.0.1
MAX_UPLOAD_MB=200
```

Genera una clave robusta y recrea el backend:

```bash
openssl rand -hex 32
docker compose up -d
```

Endpoints públicos: `/api/health`, `/api/auth/login`, `/api/auth/status`. El resto de
`/api/*` exige sesión válida (cookie) **o** header `X-API-Key` (para `curl`/scripts).

### Iniciar sesión desde la UI

Al abrir la app, si la API exige autenticación aparece la pantalla de **Iniciar sesión**:
pega la **API key** una vez y pulsa **Entrar**. Se canjea por una cookie de sesión
httpOnly (no accesible por JavaScript) válida según `SESSION_TTL_HOURS`. El botón
**Cerrar sesión** en la cabecera la revoca.

### Ejemplo: túnel SSH

```bash
# En tu máquina: reenvía el único puerto (front + API) a tu localhost
ssh -L 8000:localhost:8000 usuario@host-remoto
```

Abre `http://localhost:8000` y haz login con tu API key.

### Ejemplo: Tailscale

Con la app publicada en la IP de Tailscale del host (`API_BIND_HOST=100.x.y.z`),
abre `http://100.x.y.z:8000` desde cualquier equipo de la tailnet y haz login.

### Clientes programáticos (curl / scripts)

Los scripts y `curl` se autentican con el header `X-API-Key`:

```bash
curl -H "X-API-Key: $API_KEYS" http://localhost:8000/api/jobs
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

Estos scripts no borran audios ni resultados. La limpieza se hace desde la UI o con los endpoints de limpieza.

## Inicio manual

Modo servido (un solo puerto; el backend sirve el front):

```bash
pnpm --dir frontend install
pnpm --dir frontend build
docker compose up -d --build
# Abrir http://localhost:8000
```

Modo desarrollo (HMR en un segundo puerto, proxy a la API):

```bash
docker compose up -d --build
cd frontend
pnpm install
pnpm dev --host 0.0.0.0
# Abrir http://localhost:5173
```

## Uso

### Subir archivo

1. Abre la app (`http://localhost:8000`).
2. Entra a la pestaña `Subir`.
3. Selecciona un archivo de audio o vídeo soportado.
4. Elige si quieres persistir la entrada.
5. Pulsa `Subir y procesar`.
6. Descarga TXT, SRT o segmentos JSON al terminar.

> Los vídeos pesan más; si superas `MAX_UPLOAD_MB` (200 por defecto), súbelo en `.env`
> o usa el modo **Local** copiando el archivo a `audio_test/` (evita el upload).

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

También puedes usar API (añade `-H "X-API-Key: <tu-clave>"` si la auth está activa):

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
app/core/           Seguridad (API key, CORS, límites)
app/services/       Servicios de jobs, storage, media, transcripción y limpieza
frontend/           React + TypeScript + Vite + Tailwind (tema Blueprint Terminal)
audio_test/         Audios locales de prueba o trabajo (ignorado por Git)
models/             Modelo faster-whisper precargado (ignorado por Git)
data/input/         Entradas subidas (ignorado por Git)
data/output/        TXT/SRT/JSON generados (ignorado por Git)
data/temp/          Artefactos temporales (ignorado por Git)
data/jobs/          Jobs JSON locales (ignorado por Git)
scripts/            Scripts de inicio, parada, prueba y precarga de modelo
```

## Notas para repos remotos

El repo está preparado para no subir:

- Audios locales.
- Entradas subidas.
- Outputs generados.
- Jobs JSON.
- Temporales.
- Modelo precargado (`models/`) y `docker-compose.override.yml`.
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

### La app no carga o devuelve 401

Confirma que el backend esté arriba:

```bash
curl http://localhost:8000/api/health
```

Como el front se sirve same-origin, no hay URL ni CORS que configurar. Si ves la
pantalla de **Iniciar sesión** o recibes `401`, la API exige autenticación: haz login
con tu API key. Si `GET /` devuelve "Frontend no construido", genera el build con
`pnpm --dir frontend build` (o `bash scripts/update.sh`).

### La primera transcripción tarda

La primera ejecución descarga el modelo de `faster-whisper` (lenta sin `HF_TOKEN`).
Precarga el modelo con `bash scripts/fetch_model.sh` para arrancar en segundos.

### Archivos grandes

Usa la pestaña `Local` copiando el archivo a `audio_test/`. Ajusta:

```env
TRANSCRIPTION_CHUNK_SECONDS=600
```

Si subes por el navegador, sube también `MAX_UPLOAD_MB` si superas el límite por defecto (200 MB).

La siguiente mejora recomendada es añadir solape entre chunks para audios largos.
