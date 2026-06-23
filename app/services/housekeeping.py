import shutil
from pathlib import Path
from typing import Any

from app.services.jobs import delete_job_file, get_job, list_jobs
from app.services.local_files import resolve_local_audio_file


DATA_DIR = Path("/code/data")
INPUT_DIR = DATA_DIR / "input"
OUTPUT_DIR = DATA_DIR / "output"
TEMP_DIR = DATA_DIR / "temp"


def delete_job_artifacts(
    job_id: str,
    delete_input: bool = False,
    delete_output: bool = True,
    delete_temp: bool = True,
    delete_job: bool = True,
) -> dict[str, Any]:
    job = get_job(job_id)
    if job is None:
        raise FileNotFoundError(f"Job no encontrado: {job_id}")

    deleted: list[str] = []
    errors: list[str] = []

    if delete_input:
        _delete_job_input(job, deleted, errors)

    if delete_output:
        _delete_job_outputs(job, deleted, errors)

    if delete_temp:
        _delete_path_if_safe(TEMP_DIR / job_id, TEMP_DIR, deleted, errors)

    if delete_job:
        try:
            delete_job_file(job_id)
            deleted.append(str(Path("/code/data/jobs") / f"{job_id}.json"))
        except OSError as error:
            errors.append(str(error))

    return {
        "job_id": job_id,
        "deleted": deleted,
        "errors": errors,
    }


def cleanup_jobs(
    statuses: list[str] | None = None,
    delete_input: bool = False,
    delete_output: bool = True,
    delete_temp: bool = True,
) -> dict[str, Any]:
    allowed_statuses = set(statuses or ["completed", "failed"])
    results = []

    for job in list_jobs():
        if job.get("status") not in allowed_statuses:
            continue

        results.append(
            delete_job_artifacts(
                job["job_id"],
                delete_input=delete_input,
                delete_output=delete_output,
                delete_temp=delete_temp,
                delete_job=True,
            )
        )

    return _summarize(results)


def cleanup_temp() -> dict[str, Any]:
    deleted: list[str] = []
    errors: list[str] = []

    if TEMP_DIR.exists():
        for path in TEMP_DIR.iterdir():
            _delete_path_if_safe(path, TEMP_DIR, deleted, errors)

    return {
        "deleted_count": len(deleted),
        "deleted": deleted,
        "errors": errors,
    }


def delete_local_file(relative_path: str) -> dict[str, Any]:
    path = resolve_local_audio_file(relative_path)
    deleted: list[str] = []
    errors: list[str] = []

    try:
        path.unlink()
        deleted.append(str(path))
    except OSError as error:
        errors.append(str(error))

    return {
        "path": relative_path,
        "deleted": deleted,
        "errors": errors,
    }


def _delete_job_input(job: dict[str, Any], deleted: list[str], errors: list[str]) -> None:
    source = job.get("source")
    stored_path = job.get("stored_path")

    if source != "upload" or not stored_path:
        return

    _delete_path_if_safe(Path(stored_path), INPUT_DIR, deleted, errors)


def _delete_job_outputs(job: dict[str, Any], deleted: list[str], errors: list[str]) -> None:
    result = job.get("result") or {}
    for key in ("txt_path", "srt_path", "segments_path"):
        path = result.get(key)
        if path:
            _delete_path_if_safe(Path(path), OUTPUT_DIR, deleted, errors)


def _delete_path_if_safe(path: Path, root: Path, deleted: list[str], errors: list[str]) -> None:
    try:
        target = path.resolve()
        safe_root = root.resolve()

        if safe_root != target and safe_root not in target.parents:
            errors.append(f"Ruta fuera de directorio permitido: {path}")
            return

        if not target.exists():
            return

        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()

        deleted.append(str(target))
    except OSError as error:
        errors.append(str(error))


def _summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    deleted = []
    errors = []

    for result in results:
        deleted.extend(result.get("deleted", []))
        errors.extend(result.get("errors", []))

    return {
        "jobs_deleted": len(results),
        "deleted_count": len(deleted),
        "deleted": deleted,
        "errors": errors,
    }
