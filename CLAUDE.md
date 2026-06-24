# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Herramienta local de transcripción de audio y vídeo. Backend FastAPI (Docker) + frontend React/Vite. Motor `faster-whisper`, preparación con FFmpeg. Soporta audio (`.mp3/.ogg/.wav/.m4a/.flac/.aac`) y vídeo (`.mp4/.mov/.mkv/.webm/.avi`, del que **extrae la pista de audio**). Genera TXT, SRT y JSON de segmentos con timestamps.

## Comandos

```bash
bash scripts/start.sh          # Levanta backend (docker compose up -d --build) y frontend (vite). Crea .env y data/* si faltan.
bash scripts/stop.sh           # docker compose down
bash scripts/update.sh         # pnpm install --frozen-lockfile + build + docker compose build --pull + up
bash scripts/update.sh --pull  # Igual, pero git pull --ff-only antes (si hay remoto)

docker compose up -d --build   # Solo backend → http://localhost:8000
docker compose logs -f api     # Logs del backend (logger usa "uvicorn.error")

cd frontend && pnpm dev --host 0.0.0.0   # Solo frontend → http://localhost:5173
cd frontend && pnpm build                # tsc -b && vite build (también valida tipos)
```

No hay framework de tests; las pruebas son scripts manuales contra el backend ya levantado:

```bash
bash scripts/test_local_file.sh audio_test/archivo.ogg   # Crea job desde audio_test/ y hace polling hasta completar
bash scripts/test_audio_upload.sh audio_test/archivo.wav # Prueba el flujo de upload
bash scripts/test_audio_formats.sh                       # Prueba todos los audios de audio_test/
```

## Arquitectura

### El backend solo corre dentro de Docker — rutas absolutas hardcodeadas

Los servicios usan rutas absolutas del contenedor (`/code/data/input`, `/code/data/output`, `/code/data/temp`, `/code/data/jobs`, `/code/audio_test`) definidas como constantes a nivel de módulo en `storage.py`, `jobs.py`, `processor.py`, `housekeeping.py` y `local_files.py`. `docker-compose.yml` monta `./data`, `./app` y `./audio_test` en `/code`. Ejecutar `uvicorn` directamente en el host **no** funciona: escribiría en `/code/...`. Para cambiar dónde se guardan los datos, edita el contenedor/montaje, no esperes que una variable de entorno lo haga (salvo `LOCAL_MEDIA_DIR`, que sí es configurable).

### Ciclo de vida de un job

1. `POST /api/upload` (con `save_upload` → `data/input`) o `POST /api/jobs/from-local` (valida ruta dentro de `audio_test`).
2. `create_job` escribe un JSON en `data/jobs/{id}.json`. **Esa es toda la persistencia: un archivo JSON por job, sin base de datos.**
3. La ruta encola `process_job` con `BackgroundTasks` de FastAPI (corre en el mismo proceso, sin cola externa ni workers).
4. `process_job` (`processor.py`) orquesta: `inspect_media_file` → `transcribe_file` → escribe `{id}.txt`, `{id}.srt`, `{id}.segments.json` en `data/output` → `_cleanup_after_job`.
5. El frontend hace **polling cada 2 s** a `GET /api/jobs/{id}` mientras el estado sea `uploaded`/`processing`. El backend reporta avance vía el campo `progress` (0–100) y `stage`.

Estados: `uploaded` → `processing` → `completed` | `failed` | `cancelled`.

**Cancelación cooperativa** (`app/services/cancellation.py`): no se puede matar el hilo del threadpool, así que `POST /api/jobs/{id}/cancel` marca el job en un set en memoria y `process_job` comprueba el flag en los puntos de control (`ensure_active()` entre segmentos y entre chunks), abortando con `JobCancelled` → estado `cancelled` + limpieza de temporales. El corte ocurre al terminar el segmento en curso. El front lo recibe por el evento SSE `cancelled`. Solo cancelable mientras `uploaded`/`processing` (si no, 409).

### Pipeline de transcripción (`media.py` + `transcriber.py`)

- `prepare_audio_for_transcription`: valida que el archivo tenga pista de audio (`has_audio_stream` vía ffprobe; un vídeo sin audio falla con mensaje claro) y FFmpeg normaliza a WAV mono 16 kHz en `data/temp/{id}/audio.wav`. El flag `-vn` descarta el vídeo, así que para `.mp4` y demás contenedores **se extrae solo el audio**. La whitelist es `SUPPORTED_MEDIA_EXTENSIONS` (audio + vídeo) en `media.py`; el front la consume vía `/api/config`.
- `create_audio_chunks`: si la duración (vía `ffprobe`) supera `TRANSCRIPTION_CHUNK_SECONDS`, corta en chunks WAV con FFmpeg; cada chunk lleva su `offset_seconds`. Si no, usa el archivo completo como un único chunk. **No hay solape entre chunks** (mejora pendiente, ver `docs/plan-trabajo.md`).
- `transcribe_file`: transcribe cada chunk con `faster-whisper` y **suma `offset_seconds` a cada timestamp** para reconstruir la línea de tiempo global. El `WhisperModel` es un **singleton cacheado en memoria del proceso** (`_model`), reconstruido solo si cambia la config de modelo/device/compute.

### Gestor de archivos

El front tiene dos vistas (nav horizontal en el header, deep-link por hash `#archivos`): **Transcriptor** y **Archivos**. El gestor (`app/services/files.py` + endpoints `GET /api/files`, `GET /api/files/content`, `DELETE /api/files`) lista las **entradas cargadas** (`data/input` uploads + `audio_test`) con nombre/tipo/tamaño/fecha, descarga (`disposition=attachment`), visualización inline (reproductor en un modal; `FileResponse` soporta Range → 206, así que audio/vídeo se reproduce con seek) y borrado. Referencia segura `(source, ref)` validada anti path-traversal. Los uploads se muestran con su nombre original (se descarta el prefijo `{job_id}__`).

### Streaming en vivo (SSE)

El front pinta los segmentos conforme se generan, vía `GET /api/jobs/{id}/stream` (`text/event-stream`). Piezas:
- `model.transcribe()` devuelve un **generador perezoso**; `transcribe_file` acepta `on_segment(index, seg)` y lo invoca dentro del bucle, así que cada segmento se emite en cuanto está listo.
- `process_job` publica eventos (`segment`, `progress`, `done`, `failed`) al **bus en memoria** (`app/services/events.py`). Como `process_job` corre en el threadpool y el bus entrega en el event loop, la publicación cruza el límite con `loop.call_soon_threadsafe` (el loop se vincula en el `lifespan` de `main.py`). **Bus de proceso único: válido con un worker** (sin Redis, alineado con el plan); con varios workers haría falta un broker.
- El endpoint emite un `state` inicial (snapshot con `partial_segments` persistidos → catch-up si te conectas tarde) y luego eventos en vivo; el cliente **deduplica por `index`**. `EventSource` (front, `api.ts` → `streamJob`) envía la cookie same-origin sola — por eso el modelo de cookie hace SSE trivial de autenticar. Los `@app.middleware` `BaseHTTPMiddleware` **no** bufferean el stream (verificado).

### Actualización de estado de jobs

`update_job` (`jobs.py`) hace read-modify-write del JSON completo y escribe de forma atómica (`.tmp` + `replace`). No hay locking; los jobs corren de forma secuencial dentro del proceso, así que las escrituras concurrentes al mismo job no son un problema en la práctica, pero tenlo presente si introduces concurrencia real.

### Limpieza (`housekeeping.py`)

Todo borrado pasa por `_delete_path_if_safe`, que verifica que el path resuelto esté contenido dentro del root permitido antes de borrar. Tras cada job, `_cleanup_after_job` borra temporales (salvo `KEEP_TEMP_FILES=true`) y la entrada si `input_persisted` era `false`; nunca borra outputs ni el JSON del job automáticamente.

### Seguridad de rutas (mantener al editar)

Hay validación anti path-traversal en tres puntos que debe preservarse: `resolve_local_audio_file` (rechaza rutas absolutas y `..`, exige estar dentro de `LOCAL_MEDIA_DIR`), el endpoint de descarga `download_job_result` (exige que el resultado esté bajo `data/output`) y `_delete_path_if_safe`.

### Frontend (servido same-origin desde el backend)

El front se sirve **same-origin** y usa **rutas relativas** (`/api/...`), no una URL configurable:
- **Producción**: FastAPI sirve `frontend/dist` (montado como volumen) en el mismo puerto que la API — un catch-all `@app.get("/{full_path:path}")` (al final de `main.py`, tras todas las rutas `/api`) devuelve `index.html` para el routing del SPA, y `/assets` se monta con `StaticFiles`.
- **Desarrollo**: `vite.config.ts` proxya `/api` y `/app` a `VITE_PROXY_TARGET` (default `http://localhost:8000`), manteniendo same-origin para que la cookie de sesión funcione con HMR.

Como es same-origin, **CORS deja de intervenir** en el flujo normal. Toda la app está en `src/App.tsx` (un archivo con todos los componentes); `src/api.ts` es la capa HTTP (rutas relativas, `credentials: same-origin`, login/logout/status); `src/types.ts` el contrato de datos. Existe una UI HTML legacy embebida en `app/ui.py`, servida en `GET /app`.

## Configuración (`.env`)

Variables relevantes (defaults pensados para CPU): `WHISPER_MODEL_SIZE=base`, `WHISPER_DEVICE=cpu`, `WHISPER_COMPUTE_TYPE=int8`, `WHISPER_LANGUAGE` (vacío = autodetección; `es` para español), `TRANSCRIPTION_CHUNK_SECONDS=600`, `LOCAL_MEDIA_DIR=/code/audio_test`, `KEEP_TEMP_FILES=false`, `FRONTEND_ORIGIN`. El frontend usa su propio `frontend/.env` con `VITE_API_URL`.

### Primera transcripción lenta: descarga del modelo

La primera transcripción se queda en `progress=20 / stage=preparing` mientras `faster-whisper` descarga el modelo desde HuggingFace Hub. **Sin `HF_TOKEN` la descarga del cliente `hf_hub` está fuertemente throttled** (deja el job atascado varios minutos, sin error en el log salvo el warning de "unauthenticated requests"). El CDN de blobs (`huggingface.co/<repo>/resolve/main`) **no** está limitado.

Para evitarlo, `scripts/fetch_model.sh` precarga el modelo vía `curl` (segundos) en `./models/` y genera `docker-compose.override.yml`, que monta el modelo y apunta `WHISPER_MODEL_SIZE` al path local (`/models/faster-whisper-<size>`). `faster-whisper` acepta un directorio local como `model_size`, así que no toca código. Tras correr el script: `docker compose up -d --build`. Tanto `models/` como `docker-compose.override.yml` están en `.gitignore`.

## Seguridad y acceso remoto

Pensado para consumirse **tras un túnel SSH o Tailscale, nunca expuesto públicamente** — la capa de red cifra el transporte (por eso HTTP plano es aceptable) y es la primera barrera; la autenticación es defensa en profundidad sobre la red privada. Con el front servido same-origin, basta reenviar **un puerto**.

**Autenticación** (`app/core/security.py`): si `API_KEYS` (CSV) está vacío → modo local abierto. Con valores, los `/api/*` exigen credencial válida en una de dos formas:
- **Cookie de sesión** httpOnly (la usa el front tras hacer login). El token es **stateless**: `base64(payload).hmac_sha256`, con `exp`, firmado con `SESSION_SECRET` (o derivado de `API_KEYS` si no se define — rotar las claves invalida sesiones). No hay store que mantener ni que se pierda al reiniciar. Verificación timing-safe.
- **Header `X-API-Key`** (clientes programáticos: curl, `scripts/test_*.sh`).

Rutas públicas (sin auth): `/api/health`, `/api/auth/login`, `/api/auth/status`. Endpoints de sesión: `POST /api/auth/login` (canjea key→cookie), `POST /api/auth/logout`, `GET /api/auth/status` (`{auth_required, authenticated}`).

**Middlewares en `main.py`** — el orden se logra con el orden de registro (los `@app.middleware` se apilan; `add_middleware` queda más externo): CORS (más externo) → security headers → auth (más interno), así las 401 llevan headers de seguridad. La cookie se emite con `httponly=True`, `samesite=COOKIE_SAMESITE` (default `lax`), `secure=COOKIE_SECURE` (default `false` porque el túnel ya cifra HTTP; ponlo `true` con HTTPS), `max_age=SESSION_TTL_HOURS`.

- **Security headers** en toda respuesta: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` mínima, `Cache-Control: no-store`.
- **CORS** configurable (`CORS_ALLOW_ORIGINS`), nunca `*`; irrelevante en el flujo same-origin, solo aplica si sirves el front desde otro origen.
- **Límite de subida** `MAX_UPLOAD_MB` (default 200): `save_upload` escribe en streaming y aborta+borra si se excede.
- **Path traversal**: cubierto en `resolve_local_audio_file`, `download_job_result`, `_delete_path_if_safe` y el catch-all del SPA (contención dentro de `dist`) — mantener al editar.
- **Binding**: `API_BIND_HOST`/`API_PORT` publican solo en `127.0.0.1` (túnel SSH) o la IP de Tailscale, en vez de `0.0.0.0`.

**Front** (`api.ts`): rutas relativas con `credentials: "same-origin"` → la cookie viaja sola, también en las descargas (`<a href>` relativo). La credencial **ya no vive en `localStorage`**: la cookie httpOnly no es accesible por JS, lo que mitiga su robo por XSS. El login (`App.tsx` → `LoginDialog`) pide la key una vez (campo `password`); 401 reabre el login. React escapa toda salida; sin `dangerouslySetInnerHTML`.

## Datos no versionados

`data/*`, `audio_test/*` y los builds/`node_modules` del frontend están en `.gitignore`; las carpetas se conservan con `.gitkeep`. No asumas que existen audios o jobs en un clon limpio.
