import os
from pathlib import Path
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

from app.services.storage import save_upload
from app.services.jobs import create_job, get_job, list_jobs
from app.services.housekeeping import cleanup_jobs, cleanup_temp, delete_job_artifacts, delete_local_file
from app.services.local_files import list_local_audio_files, resolve_local_audio_file
from app.services.media import SUPPORTED_AUDIO_EXTENSIONS, get_configured_chunk_seconds
from app.services.processor import process_job
from app.ui import APP_HTML

app = FastAPI(title="TranscripcionVideo")
OUTPUT_DIR = Path("/code/data/output")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RESULT_FILES = {
    "txt": ("txt_path", "text/plain"),
    "srt": ("srt_path", "application/x-subrip"),
    "segments": ("segments_path", "application/json"),
}

class LocalFileRequest(BaseModel):
    path: str


class CleanupJobsRequest(BaseModel):
    statuses: list[str] | None = None
    delete_input: bool = False
    delete_output: bool = True
    delete_temp: bool = True


@app.get("/")
def root():
    return {"status": "ok", "message": "Proyecto base funcionando"}

@app.get("/api/config")
def read_config():
    return {
        "supported_extensions": sorted(SUPPORTED_AUDIO_EXTENSIONS),
        "chunk_seconds": get_configured_chunk_seconds(),
    }

@app.get("/app", response_class=HTMLResponse)
def web_app():
    return APP_HTML

@app.post("/api/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    persist_input: bool = Form(True),
):
    try:
        saved = save_upload(file)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    job = create_job(
        job_id=saved["job_id"],
        original_filename=saved["original_filename"],
        stored_path=saved["stored_path"],
        source="upload",
        metadata={
            "input_persisted": persist_input,
            "input_path": saved["stored_path"],
            "size_bytes": saved["size_bytes"],
        },
    )

    background_tasks.add_task(process_job, job["job_id"], job["stored_path"])

    return job

@app.get("/api/local-files")
async def read_local_files():
    return list_local_audio_files()

@app.post("/api/local-files/delete")
async def delete_local_audio_file(payload: LocalFileRequest):
    try:
        return delete_local_file(payload.path)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

@app.post("/api/jobs/from-local")
async def create_job_from_local(background_tasks: BackgroundTasks, payload: LocalFileRequest):
    try:
        path = resolve_local_audio_file(payload.path)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    job = create_job(
        job_id=str(uuid4()),
        original_filename=path.name,
        stored_path=str(path),
        source="local",
        metadata={
            "input_persisted": True,
            "input_path": str(path),
            "size_bytes": path.stat().st_size,
            "local_path": path.name,
        },
    )

    background_tasks.add_task(process_job, job["job_id"], job["stored_path"])

    return job

@app.get("/api/jobs")
async def read_jobs():
    return list_jobs()

@app.post("/api/jobs/cleanup")
async def cleanup_job_history(payload: CleanupJobsRequest):
    return cleanup_jobs(
        statuses=payload.statuses,
        delete_input=payload.delete_input,
        delete_output=payload.delete_output,
        delete_temp=payload.delete_temp,
    )

@app.post("/api/temp/cleanup")
async def cleanup_temporary_files():
    return cleanup_temp()

@app.get("/api/jobs/{job_id}")
async def read_job(job_id: str):
    job = get_job(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    return job

@app.delete("/api/jobs/{job_id}")
async def delete_job(
    job_id: str,
    delete_input: bool = Query(False),
    delete_output: bool = Query(True),
    delete_temp: bool = Query(True),
):
    try:
        return delete_job_artifacts(
            job_id,
            delete_input=delete_input,
            delete_output=delete_output,
            delete_temp=delete_temp,
            delete_job=True,
        )
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

@app.get("/api/jobs/{job_id}/segments")
async def read_job_segments(job_id: str):
    job = get_job(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    result = job.get("result") or {}

    return {
        "job_id": job_id,
        "status": job.get("status"),
        "segments": result.get("segments") or [],
    }

@app.get("/api/jobs/{job_id}/result/{kind}")
async def download_job_result(job_id: str, kind: str):
    job = get_job(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    if kind not in RESULT_FILES:
        raise HTTPException(status_code=404, detail="Resultado no soportado")

    result = job.get("result") or {}
    path_key, media_type = RESULT_FILES[kind]
    result_path = result.get(path_key)

    if result_path is None:
        raise HTTPException(status_code=404, detail="Resultado no disponible")

    path = Path(result_path).resolve()
    output_root = OUTPUT_DIR.resolve()

    if output_root != path and output_root not in path.parents:
        raise HTTPException(status_code=404, detail="Ruta de resultado no permitida")

    if not path.exists():
        raise HTTPException(status_code=404, detail="Archivo de resultado no encontrado")

    return FileResponse(
        path,
        media_type=media_type,
        filename=path.name,
    )
