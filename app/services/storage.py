from pathlib import Path
from uuid import uuid4
import shutil

from app.services.media import validate_supported_audio_file

INPUT_DIR = Path("/code/data/input")
INPUT_DIR.mkdir(parents=True, exist_ok=True)

def save_upload(upload_file):
    job_id = str(uuid4())
    safe_name = Path(upload_file.filename or "audio.bin").name
    validate_supported_audio_file(safe_name)

    target_path = INPUT_DIR / f"{job_id}__{safe_name}"

    with target_path.open("wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)

    return {
        "job_id": job_id,
        "original_filename": safe_name,
        "stored_path": str(target_path),
        "size_bytes": target_path.stat().st_size,
    }
