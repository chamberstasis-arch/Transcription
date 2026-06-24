import json
import logging
import os
from pathlib import Path

from app.services.cancellation import JobCancelled, clear_cancel, is_cancel_requested
from app.services.events import bus
from app.services.housekeeping import delete_job_artifacts
from app.services.jobs import get_job, update_job
from app.services.media import get_configured_chunk_seconds, inspect_media_file
from app.services.transcriber import generate_srt, segments_to_payload, transcribe_file

OUTPUT_DIR = Path("/code/data/output")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR = Path("/code/data/temp")
TEMP_DIR.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger("uvicorn.error")

def process_job(job_id: str, stored_path: str):
    logger.info("iniciando job=%s path=%s", job_id, stored_path)

    partial_segments: list[dict] = []

    def emit_progress(stage: str, message: str, progress: int) -> None:
        bus.publish(job_id, {"type": "progress", "stage": stage, "message": message, "progress": progress})

    def ensure_active() -> None:
        if is_cancel_requested(job_id):
            raise JobCancelled()

    try:
        update_job(
            job_id,
            status="processing",
            stage="preparing",
            message="Preparando archivo",
            progress=10,
            result=None,
            error=None,
        )
        emit_progress("preparing", "Preparando archivo", 10)
        ensure_active()

        chunk_seconds = get_configured_chunk_seconds()
        media_info = inspect_media_file(stored_path, chunk_seconds)
        current_job = get_job(job_id) or {}
        metadata = {
            **(current_job.get("metadata") or {}),
            "format": media_info.format,
            "size_bytes": media_info.size_bytes,
            "duration_seconds": media_info.duration_seconds,
            "chunk_seconds": media_info.chunk_seconds,
            "estimated_chunk_count": media_info.estimated_chunk_count,
            "will_chunk": media_info.will_chunk,
            "temp_path": str(TEMP_DIR / job_id),
        }
        update_job(
            job_id,
            progress=20,
            metadata=metadata,
        )
        emit_progress("preparing", "Analizando audio", 20)

        def on_segment(index: int, segment) -> None:
            entry = {"index": index, "start": segment.start, "end": segment.end, "text": segment.text}
            partial_segments.append(entry)
            bus.publish(job_id, {"type": "segment", **entry})
            ensure_active()  # cancela entre segmentos del chunk

        def update_chunk_progress(done: int, total: int) -> None:
            progress = 30 + round((done / total) * 55)
            # Persistimos los parciales al cerrar cada chunk (acota la E/S) para que
            # un cliente que se conecte tarde pueda recuperar el estado.
            update_job(
                job_id,
                stage="transcribing",
                message=f"Transcribiendo fragmento {done}/{total}",
                progress=progress,
                partial_segments=list(partial_segments),
            )
            emit_progress("transcribing", f"Transcribiendo fragmento {done}/{total}", progress)
            logger.info("job=%s chunk=%s/%s progreso=%s", job_id, done, total, progress)
            ensure_active()  # cancela entre chunks

        result = transcribe_file(
            stored_path,
            work_dir=TEMP_DIR / job_id,
            on_unit_completed=update_chunk_progress,
            on_segment=on_segment,
        )

        update_job(job_id, stage="writing", message="Guardando resultados", progress=90)
        emit_progress("writing", "Guardando resultados", 90)
        logger.info("job=%s progreso=90", job_id)

        txt_path = OUTPUT_DIR / f"{job_id}.txt"
        srt_path = OUTPUT_DIR / f"{job_id}.srt"
        segments_path = OUTPUT_DIR / f"{job_id}.segments.json"
        segments = segments_to_payload(result.segments)

        txt_path.write_text(result.text + ("\n" if result.text else ""), encoding="utf-8")
        srt_path.write_text(generate_srt(result.segments), encoding="utf-8")
        segments_path.write_text(
            json.dumps(segments, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        update_job(
            job_id,
            status="completed",
            progress=100,
            result={
                "txt_path": str(txt_path),
                "srt_path": str(srt_path),
                "segments_path": str(segments_path),
                "language": result.language,
                "source_format": result.source_format,
                "duration_seconds": result.duration_seconds,
                "chunk_count": result.chunk_count,
                "segment_count": len(segments),
                "segments": segments,
            },
            stage="completed",
            message="Transcripción completada",
            error=None,
            partial_segments=None,
        )
        bus.publish(job_id, {"type": "done", "status": "completed", "segment_count": len(segments)})
        _cleanup_after_job(job_id)
        logger.info("job=%s completado", job_id)
    except JobCancelled:
        logger.info("job=%s cancelado", job_id)
        update_job(
            job_id,
            status="cancelled",
            stage="cancelled",
            message="Proceso cancelado",
            error=None,
        )
        bus.publish(job_id, {"type": "cancelled", "status": "cancelled", "message": "Proceso cancelado"})
        _cleanup_after_job(job_id)
    except Exception as e:
        logger.exception("error job=%s", job_id)
        update_job(
            job_id,
            status="failed",
            stage="failed",
            message="No se pudo completar la transcripción",
            error=str(e),
        )
        bus.publish(job_id, {"type": "failed", "status": "failed", "message": "No se pudo completar la transcripción"})
        _cleanup_after_job(job_id)
    finally:
        clear_cancel(job_id)


def _cleanup_after_job(job_id: str) -> None:
    job = get_job(job_id)
    if job is None:
        return

    metadata = job.get("metadata") or {}
    keep_temp_files = os.getenv("KEEP_TEMP_FILES", "false").lower() == "true"
    input_persisted = metadata.get("input_persisted", True)

    try:
        cleanup = delete_job_artifacts(
            job_id,
            delete_input=not input_persisted,
            delete_output=False,
            delete_temp=not keep_temp_files,
            delete_job=False,
        )
    except Exception as error:
        logger.warning("no se pudo limpiar job=%s: %s", job_id, error)
        cleanup = {"deleted": [], "errors": [str(error)]}

    latest = get_job(job_id)
    if latest is None:
        return

    update_job(
        job_id,
        metadata={
            **(latest.get("metadata") or {}),
            "cleanup_state": {
                "temp_cleaned": not keep_temp_files,
                "input_persisted": input_persisted,
                "deleted": cleanup.get("deleted", []),
                "errors": cleanup.get("errors", []),
            },
        },
    )
