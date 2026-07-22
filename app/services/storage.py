from pathlib import Path
from uuid import uuid4

from app.services.media import validate_supported_media_file

INPUT_DIR = Path("/code/data/input")
INPUT_DIR.mkdir(parents=True, exist_ok=True)

_CHUNK = 1024 * 1024


def save_upload(upload_file, max_bytes: int | None = None):
    job_id = str(uuid4())
    # Path(...).name descarta cualquier componente de ruta -> evita path traversal
    # en el nombre original; el destino lleva además el job_id como prefijo.
    safe_name = Path(upload_file.filename or "audio.bin").name
    validate_supported_media_file(safe_name)

    target_path = INPUT_DIR / f"{job_id}__{safe_name}"

    size = 0
    try:
        with target_path.open("wb") as buffer:
            while True:
                chunk = upload_file.file.read(_CHUNK)
                if not chunk:
                    break
                size += len(chunk)
                if max_bytes is not None and size > max_bytes:
                    raise ValueError(
                        f"El archivo supera el límite permitido ({max_bytes // (1024 * 1024)} MB)"
                    )
                buffer.write(chunk)
    except ValueError:
        target_path.unlink(missing_ok=True)
        raise

    return {
        "job_id": job_id,
        "original_filename": safe_name,
        "stored_path": str(target_path),
        "size_bytes": size,
    }
