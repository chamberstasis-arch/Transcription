# Plan de trabajo actual - TranscripcionVideo

Documento operativo para continuar el proyecto desde el estado actual del repositorio.

## Objetivo del producto

TranscripcionVideo es una herramienta local para transcribir audio/video desde una interfaz web sencilla. El foco actual es uso local, claridad operativa y soporte progresivo para archivos más grandes sin introducir infraestructura distribuida.

## Estado actual implementado

### Backend

- FastAPI como backend principal.
- Docker Compose para ejecución local.
- FFmpeg y FFprobe disponibles dentro del contenedor.
- Motor local `faster-whisper`.
- Jobs persistidos en JSON bajo `data/jobs`.
- Upload desde navegador con opción de persistir o limpiar la entrada.
- Procesamiento desde archivos locales ubicados en `audio_test`.
- Soporte validado para formatos comunes: `.mp3`, `.ogg`, `.wav`.
- Salidas generadas en:
  - TXT,
  - SRT,
  - JSON de segmentos con `start`, `end` y `text`.
- Endpoints de descarga de resultados.
- Endpoints para historial, borrado de jobs, borrado de archivos locales y limpieza de temporales.

### Frontend

- Frontend separado en `frontend/`.
- React + TypeScript + Vite + Tailwind.
- Pestañas principales:
  - `Subir`, por defecto.
  - `Local`, para archivos disponibles en `audio_test` e historial.
- Feedback visual para:
  - archivo seleccionado,
  - carga,
  - procesamiento,
  - completado,
  - fallos.
- Descargas explícitas:
  - Descargar TXT,
  - Descargar SRT,
  - Descargar segmentos JSON.
- Vista básica de segmentos con timestamps.
- Confirmación para acciones destructivas.

### Operación local

- Scripts de inicio para Linux/WSL y PowerShell.
- Scripts de parada.
- Scripts de prueba manual con archivos locales y upload.
- Scripts de actualización de entorno.
- `.env.example` para backend y frontend.
- `audio_test` limpio para repo remoto, conservado con `.gitkeep`.
- `data/*` preparado para runtime local, sin subir archivos generados al repo.

## Plan ejecutado hasta ahora

1. Base FastAPI + Docker funcional.
2. Upload de archivos y jobs locales.
3. Integración de FFmpeg.
4. Integración de `faster-whisper`.
5. Transcripción real para archivos ligeros.
6. Generación de TXT, SRT y segmentos JSON.
7. Soporte de formatos `.mp3`, `.ogg` y `.wav`.
8. Preparación inicial para chunking mediante normalización y unidades de transcripción.
9. Frontend React/Vite/Tailwind con flujo de upload/local.
10. Limpieza operativa: temporales, historial, outputs y archivos locales.
11. Preparación para repo remoto: README, `.gitignore`, `.dockerignore`, `.env.example`, scripts y carpetas runtime con `.gitkeep`.

## Cómo arrancar

Linux o WSL:

```bash
bash scripts/start.sh
```

Windows PowerShell:

```powershell
.\scripts\start.ps1
```

Backend:

```text
http://localhost:8000
```

Frontend:

```text
http://localhost:5173
```

## Cómo actualizar el entorno

Actualizar dependencias locales, reconstruir Docker y dejar el backend arriba:

```bash
bash scripts/update.sh
```

En PowerShell:

```powershell
.\scripts\update.ps1
```

Si el repo ya tiene remoto configurado y se desea traer cambios antes de actualizar:

```bash
bash scripts/update.sh --pull
```

En PowerShell:

```powershell
.\scripts\update.ps1 -Pull
```

Los scripts de actualización no borran audios, outputs, jobs ni temporales. Para limpieza se usan la UI o los endpoints de housekeeping.

## Pruebas manuales recomendadas

1. Copiar un archivo `.mp3`, `.ogg` o `.wav` a `audio_test`.
2. Iniciar el proyecto.
3. Probar la pestaña `Subir` con un archivo pequeño.
4. Probar la pestaña `Local` con un archivo de `audio_test`.
5. Verificar que el job termine en `completed`.
6. Descargar TXT, SRT y segmentos JSON.
7. Borrar un job con outputs desde la UI.
8. Ejecutar limpieza de temporales desde la UI.

También se pueden usar scripts:

```bash
bash scripts/test_audio_upload.sh audio_test/archivo.wav
bash scripts/test_local_file.sh audio_test/archivo.ogg
bash scripts/test_audio_formats.sh
```

## Próxima fase recomendada

### 1. Validación con archivos grandes

Probar audios de 10 MB o más y audios largos, idealmente de 30 a 60 minutos. Medir:

- tiempo total,
- uso de memoria,
- tamaño de outputs,
- estabilidad del job,
- calidad del SRT en uniones largas.

### 2. Chunking robusto

Mejorar la estrategia actual para archivos largos:

- detección de duración,
- chunks configurables,
- offsets correctos,
- solape entre chunks,
- reducción de duplicados en bordes,
- merge trazable de segmentos.

### 3. Mejoras de UI sobre resultados

- búsqueda en segmentos,
- copiar texto por segmento,
- navegación por timestamp,
- filtros por rango temporal,
- indicadores de duración y chunks.

### 4. Pruebas automatizadas

Añadir pruebas ligeras para:

- validación de formatos,
- generación de SRT,
- housekeeping,
- contrato de jobs,
- endpoints principales.

### 5. Empaquetado local

Decidir si conviene servir el build de frontend desde FastAPI o mantener Vite separado en desarrollo. Para uso no técnico, la opción de servir `frontend/dist` desde FastAPI puede simplificar ejecución.

## Decisiones técnicas vigentes

- FastAPI sigue siendo la pieza principal.
- `faster-whisper` es el motor de transcripción local.
- FFmpeg se usa para compatibilidad de formatos y preparación de audio.
- No se introduce Redis, Celery, base de datos ni microservicios.
- La persistencia sigue siendo simple con archivos locales.
- Los archivos de usuario y outputs no se versionan.
- La UI se desarrolla como frontend separado con Vite para iteración rápida.
