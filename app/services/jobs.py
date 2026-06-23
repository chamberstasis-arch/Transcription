from pathlib import Path
import json
from datetime import datetime
from typing import Any, Optional

JOBS_DIR = Path("/code/data/jobs")
JOBS_DIR.mkdir(parents=True, exist_ok=True)

def _job_path(job_id: str) -> Path:
    return JOBS_DIR / f"{job_id}.json"

def _now() -> str:
    return datetime.utcnow().isoformat()

def _write_job(job_id: str, payload: dict[str, Any]) -> None:
    path = _job_path(job_id)
    temp_path = path.with_suffix(".json.tmp")

    temp_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )
    temp_path.replace(path)

def create_job(
    job_id: str,
    original_filename: str,
    stored_path: str,
    source: str = "upload",
    metadata: Optional[dict[str, Any]] = None,
):
    now = _now()

    payload = {
        "job_id": job_id,
        "original_filename": original_filename,
        "stored_path": stored_path,
        "source": source,
        "status": "uploaded",
        "stage": "queued",
        "message": "Listo para procesar",
        "progress": 0,
        "created_at": now,
        "updated_at": now,
        "metadata": metadata or {},
        "result": None,
        "error": None
    }

    _write_job(job_id, payload)

    return payload

def list_jobs():
    jobs = []

    for path in JOBS_DIR.glob("*.json"):
        try:
            jobs.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue

    return sorted(jobs, key=lambda job: job.get("updated_at", ""), reverse=True)

def get_job(job_id: str):
    path = _job_path(job_id)
    if not path.exists():
        return None

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None

def delete_job_file(job_id: str) -> bool:
    path = _job_path(job_id)
    if not path.exists():
        return False

    path.unlink()
    return True

def update_job(job_id: str, **changes):
    payload = get_job(job_id)
    if payload is None:
        return None

    if "progress" in changes:
        changes["progress"] = max(0, min(100, int(changes["progress"])))

    payload.update(changes)
    payload["updated_at"] = _now()

    _write_job(job_id, payload)

    return payload
