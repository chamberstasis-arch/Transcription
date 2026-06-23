import os
from pathlib import Path

from app.services.media import SUPPORTED_AUDIO_EXTENSIONS, get_configured_chunk_seconds, inspect_media_file


LOCAL_MEDIA_DIR = Path(os.getenv("LOCAL_MEDIA_DIR", "/code/audio_test"))


def list_local_audio_files() -> list[dict]:
    if not LOCAL_MEDIA_DIR.exists():
        return []

    files = []
    chunk_seconds = get_configured_chunk_seconds()

    for path in sorted(LOCAL_MEDIA_DIR.iterdir()):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_AUDIO_EXTENSIONS:
            continue

        media_info = _safe_media_info(path, chunk_seconds)

        files.append(
            {
                "path": path.name,
                "filename": path.name,
                "format": media_info["format"],
                "size_bytes": media_info["size_bytes"],
                "duration_seconds": media_info["duration_seconds"],
                "estimated_chunk_count": media_info["estimated_chunk_count"],
                "will_chunk": media_info["will_chunk"],
            }
        )

    return files


def resolve_local_audio_file(relative_path: str) -> Path:
    requested = Path(relative_path)

    if requested.is_absolute() or ".." in requested.parts:
        raise ValueError("Ruta local inválida")

    path = (LOCAL_MEDIA_DIR / requested).resolve()
    root = LOCAL_MEDIA_DIR.resolve()

    if root != path and root not in path.parents:
        raise ValueError("Ruta local fuera del directorio permitido")

    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Archivo local no encontrado: {relative_path}")

    if path.suffix.lower() not in SUPPORTED_AUDIO_EXTENSIONS:
        raise ValueError("Formato local no soportado")

    return path


def _safe_media_info(path: Path, chunk_seconds: int) -> dict:
    try:
        info = inspect_media_file(path, chunk_seconds)
        return {
            "format": info.format,
            "size_bytes": info.size_bytes,
            "duration_seconds": info.duration_seconds,
            "estimated_chunk_count": info.estimated_chunk_count,
            "will_chunk": info.will_chunk,
        }
    except Exception:
        return {
            "format": path.suffix.lower().lstrip("."),
            "size_bytes": path.stat().st_size,
            "duration_seconds": None,
            "estimated_chunk_count": 1,
            "will_chunk": False,
        }
