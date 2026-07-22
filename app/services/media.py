import json
import math
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


SUPPORTED_MEDIA_EXTENSIONS = {
    # audio
    ".mp3", ".ogg", ".wav", ".m4a", ".flac", ".aac",
    # vídeo (se extrae la pista de audio con ffmpeg -vn)
    ".mp4", ".mov", ".mkv", ".webm", ".avi",
}
DEFAULT_CHUNK_SECONDS = 600


@dataclass(frozen=True)
class PreparedAudio:
    path: Path
    source_format: str
    duration_seconds: Optional[float]


@dataclass(frozen=True)
class AudioChunk:
    path: Path
    offset_seconds: float
    duration_seconds: Optional[float]


@dataclass(frozen=True)
class MediaInfo:
    filename: str
    format: str
    size_bytes: int
    duration_seconds: Optional[float]
    chunk_seconds: int
    estimated_chunk_count: int
    will_chunk: bool


def validate_supported_media_file(filename: str | Path) -> None:
    extension = Path(filename).suffix.lower()

    if extension not in SUPPORTED_MEDIA_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_MEDIA_EXTENSIONS))
        raise ValueError(f"Formato no soportado: {extension or 'sin extensión'}. Usa: {supported}")


def get_configured_chunk_seconds() -> int:
    raw_value = os.getenv("TRANSCRIPTION_CHUNK_SECONDS", str(DEFAULT_CHUNK_SECONDS))

    try:
        chunk_seconds = int(raw_value)
    except ValueError as error:
        raise ValueError("TRANSCRIPTION_CHUNK_SECONDS debe ser un número entero") from error

    if chunk_seconds <= 0:
        raise ValueError("TRANSCRIPTION_CHUNK_SECONDS debe ser mayor a 0")

    return chunk_seconds


def inspect_media_file(source_path: str | Path, chunk_seconds: int) -> MediaInfo:
    if chunk_seconds <= 0:
        raise ValueError("chunk_seconds debe ser mayor a 0")

    source = Path(source_path)

    if not source.exists():
        raise FileNotFoundError(f"Archivo no encontrado: {source}")

    validate_supported_media_file(source)

    duration = probe_duration_seconds(source)
    estimated_chunks = 1

    if duration is not None:
        estimated_chunks = max(1, math.ceil(duration / chunk_seconds))

    return MediaInfo(
        filename=source.name,
        format=source.suffix.lower().lstrip("."),
        size_bytes=source.stat().st_size,
        duration_seconds=duration,
        chunk_seconds=chunk_seconds,
        estimated_chunk_count=estimated_chunks,
        will_chunk=estimated_chunks > 1,
    )


def prepare_audio_for_transcription(source_path: str | Path, work_dir: str | Path) -> PreparedAudio:
    source = Path(source_path)

    if not source.exists():
        raise FileNotFoundError(f"Archivo no encontrado: {source}")

    validate_supported_media_file(source)

    if not has_audio_stream(source):
        raise ValueError("El archivo no contiene pista de audio")

    target_dir = Path(work_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    target = target_dir / "audio.wav"
    _run_ffmpeg_audio_normalization(source, target)

    return PreparedAudio(
        path=target,
        source_format=source.suffix.lower().lstrip("."),
        duration_seconds=probe_duration_seconds(source),
    )


def create_audio_chunks(
    prepared_audio: PreparedAudio,
    work_dir: str | Path,
    chunk_seconds: int,
) -> list[AudioChunk]:
    if chunk_seconds <= 0:
        raise ValueError("chunk_seconds debe ser mayor a 0")

    duration = prepared_audio.duration_seconds

    if duration is None or duration <= chunk_seconds:
        return [
            AudioChunk(
                path=prepared_audio.path,
                offset_seconds=0.0,
                duration_seconds=duration,
            )
        ]

    chunks_dir = Path(work_dir) / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)

    chunks = []
    offset = 0.0
    index = 1

    while offset < duration:
        chunk_duration = min(float(chunk_seconds), duration - offset)
        target = chunks_dir / f"chunk_{index:04}.wav"
        _run_ffmpeg_audio_slice(prepared_audio.path, target, offset, chunk_duration)

        chunks.append(
            AudioChunk(
                path=target,
                offset_seconds=offset,
                duration_seconds=chunk_duration,
            )
        )

        offset += float(chunk_seconds)
        index += 1

    return chunks


def probe_duration_seconds(source_path: str | Path) -> Optional[float]:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(source_path),
    ]

    completed = _run_command(command, "No se pudo leer duración del archivo")

    payload = json.loads(completed.stdout or "{}")
    duration = payload.get("format", {}).get("duration")

    if duration is None:
        return None

    return float(duration)


def has_audio_stream(source_path: str | Path) -> bool:
    """True si el archivo tiene al menos una pista de audio (vía ffprobe).

    Útil para vídeos sin audio: evita producir un WAV vacío y permite fallar con
    un mensaje claro.
    """
    command = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "csv=p=0",
        str(source_path),
    ]

    try:
        completed = _run_command(command, "No se pudo inspeccionar el archivo")
    except RuntimeError:
        return False

    return "audio" in (completed.stdout or "")


def _run_ffmpeg_audio_normalization(source: Path, target: Path) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        str(target),
    ]

    _run_command(command, "No se pudo preparar el audio para transcripción")


def _run_ffmpeg_audio_slice(source: Path, target: Path, start_seconds: float, duration_seconds: float) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start_seconds:.3f}",
        "-t",
        f"{duration_seconds:.3f}",
        "-i",
        str(source),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        str(target),
    ]

    _run_command(command, "No se pudo crear un fragmento de audio")


def _run_command(command: list[str], error_message: str) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or "").strip()
        if detail:
            raise RuntimeError(f"{error_message}: {detail}") from error
        raise RuntimeError(error_message) from error
