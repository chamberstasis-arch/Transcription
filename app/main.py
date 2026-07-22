import asyncio
import json
import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.core.security import (
    API_KEY_HEADER,
    SESSION_COOKIE,
    auth_enabled,
    cookie_samesite,
    cookie_secure,
    cors_allow_origins,
    create_session_token,
    is_authenticated,
    is_valid_api_key,
    max_upload_bytes,
    requires_auth,
    session_ttl_seconds,
)
from app.services.storage import save_upload
from app.services.jobs import create_job, get_job, list_jobs, update_job
from app.services.housekeeping import cleanup_jobs, cleanup_temp, delete_job_artifacts, delete_local_file
from app.services.cancellation import request_cancel
from app.services.events import bus
from app.services.files import delete_input_file, list_input_files, resolve_input_file
from app.services.local_files import list_local_audio_files, resolve_local_audio_file
from app.services.media import SUPPORTED_MEDIA_EXTENSIONS, get_configured_chunk_seconds
from app.services.processor import process_job
from app.ui import APP_HTML


@asynccontextmanager
async def lifespan(_app: "FastAPI"):
    # Vincula el event loop al bus para poder publicar eventos desde el threadpool.
    bus.bind_loop(asyncio.get_running_loop())
    yield


app = FastAPI(title="Transcriptor", lifespan=lifespan)
OUTPUT_DIR = Path("/code/data/output")


@app.middleware("http")
async def auth_guard(request: Request, call_next):
    """Exige sesión válida (cookie) o X-API-Key en /api/* cuando hay claves."""
    if requires_auth(request.url.path, request.method):
        authed = is_authenticated(
            request.cookies.get(SESSION_COOKIE),
            request.headers.get(API_KEY_HEADER),
        )
        if not authed:
            return JSONResponse(
                {"detail": "Autenticación requerida"},
                status_code=401,
                headers={"WWW-Authenticate": "ApiKey"},
            )
    return await call_next(request)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Cabeceras de endurecimiento en toda respuesta."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


# CORS se añade de último para quedar como middleware más externo y resolver el
# preflight antes de la autenticación. Sin credenciales (usamos header, no cookies).
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", API_KEY_HEADER],
    max_age=600,
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


@app.get("/api/health")
def health():
    """Health-check público. Indica si la API exige autenticación."""
    return {"status": "ok", "auth_required": auth_enabled()}


class LoginRequest(BaseModel):
    api_key: str


@app.post("/api/auth/login")
def login(payload: LoginRequest):
    """Canjea una API key válida por una cookie de sesión httpOnly."""
    if not auth_enabled():
        return {"ok": True, "authenticated": True, "auth_required": False}
    if not is_valid_api_key(payload.api_key):
        raise HTTPException(status_code=401, detail="API key inválida")
    response = JSONResponse({"ok": True, "authenticated": True, "auth_required": True})
    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(),
        max_age=session_ttl_seconds(),
        httponly=True,
        samesite=cookie_samesite(),
        secure=cookie_secure(),
        path="/",
    )
    return response


@app.post("/api/auth/logout")
def logout():
    response = JSONResponse({"ok": True, "authenticated": False})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@app.get("/api/auth/status")
def auth_status(request: Request):
    """Estado de autenticación de la sesión actual (público)."""
    authed = is_authenticated(
        request.cookies.get(SESSION_COOKIE),
        request.headers.get(API_KEY_HEADER),
    )
    return {"auth_required": auth_enabled(), "authenticated": authed}

@app.get("/api/config")
def read_config():
    return {
        "supported_extensions": sorted(SUPPORTED_MEDIA_EXTENSIONS),
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
        saved = save_upload(file, max_bytes=max_upload_bytes())
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


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _job_snapshot(job: dict) -> dict:
    result = job.get("result") or {}
    raw = result.get("segments")
    if raw:
        segments = [{"index": index, **segment} for index, segment in enumerate(raw)]
    else:
        segments = job.get("partial_segments") or []
    return {
        "status": job.get("status"),
        "progress": job.get("progress", 0),
        "stage": job.get("stage"),
        "message": job.get("message"),
        "segments": segments,
    }


@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Solicita la cancelación cooperativa de un job en proceso."""
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    if job.get("status") not in ("uploaded", "processing"):
        raise HTTPException(status_code=409, detail="El job no está en proceso")

    request_cancel(job_id)
    update_job(job_id, message="Cancelando…")
    bus.publish(
        job_id,
        {"type": "progress", "stage": job.get("stage"), "message": "Cancelando…", "progress": job.get("progress", 0)},
    )
    return {"job_id": job_id, "cancel_requested": True}


@app.get("/api/jobs/{job_id}/stream")
async def stream_job(job_id: str, request: Request):
    """Stream SSE del progreso y los segmentos de un job en tiempo real."""
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    queue = bus.subscribe(job_id)

    async def event_stream():
        try:
            # Snapshot inicial: estado + segmentos ya disponibles (catch-up). El
            # cliente deduplica por índice, así que un solape con eventos en vivo
            # es inofensivo.
            snapshot = _job_snapshot(get_job(job_id) or job)
            yield _sse("state", snapshot)
            if snapshot["status"] in ("completed", "failed"):
                yield _sse("done", {"status": snapshot["status"]})
                return

            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                event_type = event.get("type", "message")
                yield _sse(event_type, event)
                if event_type in ("done", "failed", "cancelled"):
                    break
        finally:
            bus.unsubscribe(job_id, queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# --- Gestor de archivos de entrada ---------------------------------------------

@app.get("/api/files")
async def read_files():
    return list_input_files()


@app.get("/api/files/content")
async def read_file_content(source: str, ref: str, disposition: str = Query("inline")):
    try:
        path = resolve_input_file(source, ref)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    media_type, _ = mimetypes.guess_type(path.name)
    download_name = ref.split("__", 1)[1] if source == "upload" and "__" in ref else ref
    return FileResponse(
        path,
        media_type=media_type or "application/octet-stream",
        filename=download_name,
        content_disposition_type="attachment" if disposition == "attachment" else "inline",
    )


@app.delete("/api/files")
async def remove_file(source: str, ref: str):
    try:
        return delete_input_file(source, ref)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


# --- Frontend SPA (servido same-origin desde el backend) -----------------------

DIST_DIR = Path("/code/frontend/dist")

if (DIST_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    """Sirve el build del frontend; rutas desconocidas caen a index.html (SPA)."""
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="No encontrado")

    if full_path:
        candidate = (DIST_DIR / full_path).resolve()
        dist_root = DIST_DIR.resolve()
        if (dist_root == candidate or dist_root in candidate.parents) and candidate.is_file():
            return FileResponse(candidate)

    index = DIST_DIR / "index.html"
    if index.exists():
        return FileResponse(index, media_type="text/html")

    raise HTTPException(status_code=404, detail="Frontend no construido. Ejecuta: pnpm --dir frontend build")
