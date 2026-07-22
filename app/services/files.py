"""Gestor de archivos de entrada cargados en el servidor.

Cubre dos orígenes: `audio_test/` (modo local) y `data/input/` (uploads del
navegador, almacenados como `{job_id}__{original}`). Cada archivo se referencia
por `(source, ref)` y toda resolución valida contención dentro del root permitido
(anti path-traversal).
"""

import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

INPUT_DIR = Path("/code/data/input")
LOCAL_MEDIA_DIR = Path(os.getenv("LOCAL_MEDIA_DIR", "/code/audio_test"))

_AUDIO_EXT = {".mp3", ".ogg", ".wav", ".m4a", ".flac", ".aac"}
_VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi"}

_ROOTS = {"local": LOCAL_MEDIA_DIR, "upload": INPUT_DIR}


def _media_kind(ext: str) -> str:
    if ext in _AUDIO_EXT:
        return "audio"
    if ext in _VIDEO_EXT:
        return "video"
    return "other"


def _display_name(source: str, filename: str) -> str:
    # Los uploads se guardan como "{job_id}__{original}"; mostramos el original.
    if source == "upload" and "__" in filename:
        return filename.split("__", 1)[1]
    return filename


def _entry(source: str, path: Path) -> dict[str, Any]:
    stat = path.stat()
    ext = path.suffix.lower()
    media_type, _ = mimetypes.guess_type(path.name)
    return {
        "source": source,
        "ref": path.name,
        "name": _display_name(source, path.name),
        "ext": ext.lstrip("."),
        "media_type": media_type or "application/octet-stream",
        "kind": _media_kind(ext),
        "size_bytes": stat.st_size,
        "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
    }


def list_input_files() -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    for source, root in _ROOTS.items():
        if not root.exists():
            continue
        for path in root.iterdir():
            if not path.is_file() or path.name == ".gitkeep":
                continue
            files.append(_entry(source, path))
    files.sort(key=lambda item: item["modified_at"], reverse=True)
    return files


def resolve_input_file(source: str, ref: str) -> Path:
    root = _ROOTS.get(source)
    if root is None:
        raise ValueError("Origen inválido")

    requested = Path(ref)
    if requested.is_absolute() or requested.name != ref or ".." in requested.parts:
        raise ValueError("Referencia inválida")

    path = (root / requested.name).resolve()
    safe_root = root.resolve()
    if safe_root != path and safe_root not in path.parents:
        raise ValueError("Ruta fuera del directorio permitido")

    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Archivo no encontrado: {ref}")

    return path


def delete_input_file(source: str, ref: str) -> dict[str, Any]:
    path = resolve_input_file(source, ref)
    path.unlink()
    return {"source": source, "ref": ref, "deleted": True}
