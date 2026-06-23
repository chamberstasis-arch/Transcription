# Ruta de trabajo detallada para TranscripcionVideo

## Propósito del plan

Este documento define una ruta de ejecución detallada para convertir la base actual de TranscripcionVideo en una herramienta local capaz de recibir archivos de audio o video, procesarlos localmente y producir transcripción completa en texto y subtítulos SRT con timestamps. La ruta está organizada por fases pequeñas, acumulativas y verificables, siguiendo un enfoque consistente con el patrón de trabajos largos en FastAPI y con la integración progresiva de FFmpeg y motores Whisper locales.[cite:98][cite:149][cite:150][cite:190]

El criterio central del plan es evitar saltos grandes de complejidad. Cada fase debe dejar un resultado comprobable antes de pasar a la siguiente, de modo que cualquier regresión quede localizada y sea fácil de depurar.[cite:149][cite:154][cite:159]

## Principios de trabajo

La ejecución del proyecto debe regirse por cinco principios:

- Una sola capacidad nueva por fase.
- Un criterio de aceptación claro por fase.
- Una prueba manual reproducible por fase.
- Cambios pequeños de código, preferiblemente sobre archivos ya existentes.
- Cierre técnico de cada paso antes de pedir cambios amplios a un asistente de código.

Este enfoque reduce mucho el riesgo de confundir errores de Docker, FastAPI, FFmpeg y Whisper al mismo tiempo. También hace que el uso de Codex sea más seguro y eficiente, porque cada petición puede ser delimitada contra una fase concreta.[cite:98][cite:149][cite:176]

## Mapa general de fases

| Fase | Nombre | Objetivo principal | Resultado esperado |
|---|---|---|---|
| 0 | Base validada | Confirmar API, uploads y jobs | Plataforma mínima estable |
| 1 | FFmpeg operativo | Habilitar manipulación real de audio/video | Contenedor preparado para audio [cite:176] |
| 2 | Motor ASR local | Instalar y validar faster-whisper o Whisper | Backend de transcripción disponible [cite:180][cite:190] |
| 3 | Transcripción corta | Transcribir un archivo corto real a TXT | Primera prueba E2E real [cite:190] |
| 4 | SRT básico | Generar subtítulos con timestamps | Salida utilizable por tiempo [cite:180] |
| 5 | Chunking | Soportar archivos largos por fragmentos | Pipeline tolerante a duración/tamaño [cite:149][cite:159] |
| 6 | Merge final | Unir texto y tiempos de todos los fragmentos | Resultado único completo |
| 7 | Robustez operativa | Mejorar errores, limpieza, permisos y descargas | MVP técnico estable |
| 8 | Interfaz web local | Facilitar uso desde navegador | Herramienta lista para uso diario |

## Fase 0: Cierre formal de la base

### Objetivo

Cerrar la etapa ya recorrida y convertirla en un punto de partida estable. Esta fase ya está prácticamente completada y sirve como línea base para el resto del plan.

### Alcance

- API local en Docker.
- Endpoint raíz funcional.
- Endpoint de subida de archivos funcional.[cite:94][cite:125]
- Persistencia del archivo subido.
- Persistencia del job en JSON.
- Endpoint de consulta de job.

### Criterio de aceptación

- `curl http://localhost:8000/` responde correctamente.
- `POST /api/upload` devuelve `job_id` y metadatos válidos.
- `GET /api/jobs/{job_id}` devuelve el estado persistido.

### Comandos de verificación

```bash
curl http://localhost:8000/
curl -X POST "http://localhost:8000/api/upload" -H "accept: application/json" -F "file=@/ruta/archivo.txt"
curl "http://localhost:8000/api/jobs/JOB_ID"
```

## Fase 1: Integración de FFmpeg

### Objetivo

Instalar FFmpeg dentro del contenedor y comprobar que el proyecto puede inspeccionar, convertir y preparar archivos de audio/video. FFmpeg es una pieza base para decodificar múltiples formatos y para la futura segmentación de audios largos.[cite:176][cite:180]

### Cambios esperados

- Actualizar `Dockerfile` para instalar FFmpeg con `apt-get`.[cite:176]
- Reconstruir el contenedor.
- Verificar ejecución de `ffmpeg -version` y, opcionalmente, `ffprobe`.

### Comandos

```bash
docker compose down
docker compose up --build
docker compose exec api sh
ffmpeg -version
exit
```

### Resultado esperado

El contenedor debe responder con la versión de FFmpeg sin errores. Si esto falla, todavía no es momento de integrar Whisper, porque el pipeline de audio no está preparado.[cite:176]

### Criterio de aceptación

- FFmpeg está presente en el contenedor.
- El servicio sigue arrancando correctamente.
- Un archivo multimedia puede ser leído por FFmpeg sin error crítico.

## Fase 2: Integración del motor de transcripción local

### Objetivo

Instalar el backend de transcripción local y verificar que puede importarse y crear un modelo. Para este proyecto, faster-whisper es una opción recomendable por rendimiento y por su adopción práctica en despliegues locales sobre Python.[cite:180][cite:190]

### Cambios esperados

- Añadir `faster-whisper` a `requirements.txt`.[cite:190]
- Reconstruir la imagen.
- Crear una prueba mínima de importación.

### Comandos

```bash
docker compose down
docker compose up --build
docker compose exec api sh
python -c "from faster_whisper import WhisperModel; print('faster-whisper ok')"
exit
```

### Resultado esperado

El contenedor debe importar correctamente el paquete y quedar listo para crear un modelo. Si esta verificación no pasa, la fase no debe considerarse cerrada.[cite:190]

### Criterio de aceptación

- `faster-whisper` importa sin error.
- La aplicación sigue viva tras el rebuild.
- No aparecen conflictos de dependencias críticos con FastAPI o el runtime Python.

## Fase 3: Primera transcripción real de archivo corto

### Objetivo

Validar el primer flujo completo real con un audio corto, sin chunking todavía. Esta es la primera prueba del núcleo funcional del producto.[cite:180][cite:190]

### Cambios esperados

- Crear `app/services/transcriber.py`.
- Implementar una función `transcribe_file(path, model_name='base')`.
- Cambiar `processor.py` para usar el transcriptor real en lugar del texto dummy.
- Guardar un `.txt` de salida.

### Pseudoflujo esperado

1. El usuario sube un archivo corto.
2. El sistema crea el job.
3. `BackgroundTasks` lanza el procesamiento.[cite:98][cite:107]
4. `processor.py` llama al transcriptor.
5. Se escribe el texto en `data/output/{job_id}.txt`.
6. El job termina en `completed`.

### Criterio de aceptación

- Un archivo corto real genera un TXT real.
- El texto es legible y corresponde al audio.
- El job termina en `completed`.

## Fase 4: Generación básica de SRT

### Objetivo

Agregar salida de subtítulos con tiempos, usando los segmentos devueltos por el motor de transcripción local. El formato SRT es parte del objetivo central del proyecto.[cite:180]

### Cambios esperados

- Implementar un generador `generate_srt(segments)`.
- Formatear tiempos como `HH:MM:SS,mmm --> HH:MM:SS,mmm`.
- Guardar `data/output/{job_id}.srt`.
- Añadir referencia a `srt_path` en el resultado del job.

### Criterio de aceptación

- El archivo `.srt` abre correctamente en un reproductor o editor.
- Los timestamps son crecientes y válidos.
- El contenido coincide razonablemente con el texto del `.txt`.

## Fase 5: Detección de duración y chunking

### Objetivo

Dar soporte a archivos largos mediante segmentación en partes procesables. Esta fase es la base para que el proyecto soporte audios de 1–2 horas sin depender de una sola inferencia enorme.[cite:149][cite:159][cite:180]

### Cambios esperados

- Crear un módulo `audio_chunker.py`.
- Usar FFmpeg o ffprobe para medir duración y decidir estrategia.[cite:176]
- Definir tamaño máximo de fragmento por configuración.
- Generar fragmentos temporales numerados.

### Decisiones de diseño que deben cerrarse aquí

- Duración máxima por chunk.
- Si habrá solapamiento entre chunks.
- Si el corte será fijo o guiado por silencios.
- Dónde se guardarán los fragmentos temporales.

### Criterio de aceptación

- Un archivo largo se divide sin fallar.
- Cada fragmento queda trazable al job original.
- Existe una lista ordenada de chunks lista para transcribir.

## Fase 6: Merge de resultados y ensamblado final

### Objetivo

Unir correctamente el resultado de todos los fragmentos y producir una transcripción completa única, tanto en texto como en SRT.

### Cambios esperados

- Implementar cálculo de offsets temporales por chunk.
- Reindexar segmentos del SRT global.
- Concatenar el texto en orden correcto.
- Guardar resultado final único por job.

### Riesgos principales

- Saltos de tiempo incorrectos.
- Duplicados o cortes de palabras entre chunks.
- Desalineación entre texto y subtítulos.

### Criterio de aceptación

- El `.txt` final contiene la conversación completa en orden.
- El `.srt` final mantiene continuidad temporal válida.
- El usuario recibe un solo resultado final por job.

## Fase 7: Robustez operativa

### Objetivo

Endurecer el sistema para uso real local prolongado. Aquí se resuelven detalles no glamorosos pero muy importantes para que la herramienta sea utilizable todos los días.

### Cambios esperados

- Mejor manejo de errores en jobs.
- Limpieza de temporales al terminar.
- Validación de tipos y tamaños de archivo.[cite:94][cite:125]
- Mejora del logging.
- Corrección de permisos de archivos generados por el contenedor.[cite:134][cite:136][cite:139]
- Considerar apagar `--reload` al pasar de depuración a uso estable.[cite:163][cite:164]

### Criterio de aceptación

- Errores visibles y trazables.
- Archivos temporales no se acumulan indefinidamente.
- El host puede administrar los archivos de salida sin fricción.
- El servicio se comporta de forma consistente tras múltiples ejecuciones.

## Fase 8: Interfaz web local

### Objetivo

Facilitar el uso diario desde navegador, sin depender de `curl`. Esta fase puede quedarse minimalista mientras el backend ya resuelva bien el procesamiento.[cite:94][cite:149]

### Alcance mínimo sugerido

- Pantalla para subir archivo.
- Lista de jobs recientes.
- Estado visual del job (`uploaded`, `processing`, `completed`, `failed`).
- Enlace de descarga para `.txt` y `.srt`.

### Opciones técnicas

- HTML simple servido desde FastAPI para moverse rápido.
- React + Vite más adelante si se quiere una UX más rica.

### Criterio de aceptación

- Un usuario puede operar el flujo completo sin usar terminal.
- El estado del job se actualiza por polling.
- Los resultados pueden descargarse desde navegador.

## Estrategia recomendada para trabajar con Codex

La base ya es suficientemente estable para que Codex acelere el desarrollo, pero debe usarse como acelerador de fases, no como diseñador absoluto del sistema. La recomendación operativa es pedirle tareas pequeñas, delimitadas y comprobables sobre la estructura actual del repo.[cite:94][cite:98]

### Tareas adecuadas para delegar

- “Añade FFmpeg al Dockerfile y actualiza requirements.”
- “Crea `transcriber.py` usando faster-whisper.”
- “Implementa `generate_srt` a partir de una lista de segmentos.”
- “Agrega endpoint para descargar archivos resultantes.”
- “Añade tests de `jobs.py` y `processor.py`.”

### Tareas que conviene no delegar de golpe

- “Haz toda la aplicación completa.”
- “Crea frontend, chunking, Whisper, SRT, DB y UI en un solo cambio.”
- “Refactoriza toda la arquitectura sin límites.”

### Regla de control

Cada entrega generada por Codex debe cerrar exactamente una fase o una subfase, y debe ir acompañada de una prueba manual corta. Ese control evita el clásico problema de avanzar rápido pero perder trazabilidad técnica.

## Definition of Done del MVP técnico

El MVP técnico puede considerarse completado cuando se cumplan todas estas condiciones:

- El usuario sube audio o video local desde una interfaz o API.[cite:94][cite:125]
- El sistema procesa el archivo en segundo plano mediante jobs consultables.[cite:98][cite:149][cite:159]
- El backend usa FFmpeg para preparar y segmentar multimedia cuando sea necesario.[cite:176]
- El motor Whisper o faster-whisper transcribe localmente sin depender de servicios externos.[cite:180][cite:190]
- Se generan `.txt` y `.srt` por job.[cite:180]
- Los archivos largos pueden resolverse mediante chunking y merge final.[cite:149][cite:159]
- El resultado es estable, trazable y reutilizable en un flujo local diario.

## Orden exacto recomendado desde el estado actual

1. Cerrar Fase 1: FFmpeg en contenedor.[cite:176]
2. Cerrar Fase 2: faster-whisper instalado.[cite:190]
3. Cerrar Fase 3: transcripción corta real.[cite:180][cite:190]
4. Cerrar Fase 4: generación de SRT.[cite:180]
5. Cerrar Fase 5: chunking.[cite:149][cite:159]
6. Cerrar Fase 6: merge final.
7. Cerrar Fase 7: robustez operativa.[cite:134][cite:163]
8. Cerrar Fase 8: interfaz web local.[cite:94]

Ese orden mantiene la progresión correcta: primero capacidad técnica real, luego precisión funcional, después robustez y finalmente comodidad de uso.[cite:149][cite:176][cite:190]
