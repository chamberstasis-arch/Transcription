import os
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

from faster_whisper import WhisperModel

from app.services.media import create_audio_chunks, get_configured_chunk_seconds, prepare_audio_for_transcription


DEFAULT_MODEL_SIZE = "base"
DEFAULT_DEVICE = "cpu"
DEFAULT_COMPUTE_TYPE = "int8"
DEFAULT_WORK_DIR = Path("/code/data/temp/transcription")

_model: Optional[WhisperModel] = None
_model_config: Optional[tuple[str, str, str]] = None


@dataclass(frozen=True)
class TranscriptionSegment:
    start: float
    end: float
    text: str


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    segments: list[TranscriptionSegment]
    language: Optional[str]
    source_format: str
    duration_seconds: Optional[float]
    chunk_count: int


@dataclass(frozen=True)
class TranscriptionUnit:
    path: Path
    offset_seconds: float = 0.0
    duration_seconds: Optional[float] = None
    source_format: str = ""


def _get_model() -> WhisperModel:
    global _model, _model_config

    model_size = os.getenv("WHISPER_MODEL_SIZE", DEFAULT_MODEL_SIZE)
    device = os.getenv("WHISPER_DEVICE", DEFAULT_DEVICE)
    compute_type = os.getenv("WHISPER_COMPUTE_TYPE", DEFAULT_COMPUTE_TYPE)
    config = (model_size, device, compute_type)

    if _model is None or _model_config != config:
        _model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
        )
        _model_config = config

    return _model


def plan_transcription_units(
    source_path: str | Path,
    work_dir: str | Path = DEFAULT_WORK_DIR,
) -> list[TranscriptionUnit]:
    prepared = prepare_audio_for_transcription(source_path, work_dir)
    chunk_seconds = get_configured_chunk_seconds()
    chunks = create_audio_chunks(prepared, work_dir, chunk_seconds)

    return [
        TranscriptionUnit(
            path=chunk.path,
            offset_seconds=chunk.offset_seconds,
            duration_seconds=chunk.duration_seconds,
            source_format=prepared.source_format,
        )
        for chunk in chunks
    ]


def transcribe_file(
    source_path: str | Path,
    work_dir: str | Path = DEFAULT_WORK_DIR,
    on_unit_completed: Optional[Callable[[int, int], None]] = None,
    on_segment: Optional[Callable[[int, "TranscriptionSegment"], None]] = None,
) -> TranscriptionResult:
    units = plan_transcription_units(source_path, work_dir)
    all_segments: list[TranscriptionSegment] = []
    detected_language: Optional[str] = None
    source_format = units[0].source_format if units else ""
    duration_seconds = _sum_known_durations(units)

    model = _get_model()
    language = os.getenv("WHISPER_LANGUAGE") or None
    seg_index = 0

    for index, unit in enumerate(units, start=1):
        segments, info = model.transcribe(str(unit.path), language=language)

        if detected_language is None:
            detected_language = getattr(info, "language", None)
            if language is None:
                language = detected_language

        # `segments` es un generador perezoso: cada iteración transcribe el
        # siguiente tramo, así que emitimos el segmento en cuanto está listo.
        for segment in segments:
            transcription_segment = TranscriptionSegment(
                start=float(segment.start) + unit.offset_seconds,
                end=float(segment.end) + unit.offset_seconds,
                text=segment.text.strip(),
            )
            all_segments.append(transcription_segment)
            if on_segment is not None:
                on_segment(seg_index, transcription_segment)
            seg_index += 1

        if on_unit_completed is not None:
            on_unit_completed(index, len(units))

    text = "\n".join(segment.text for segment in all_segments if segment.text)

    return TranscriptionResult(
        text=text,
        segments=all_segments,
        language=detected_language,
        source_format=source_format,
        duration_seconds=duration_seconds,
        chunk_count=len(units),
    )


def generate_srt(segments: list[TranscriptionSegment]) -> str:
    blocks = []

    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue

        index = len(blocks) + 1
        blocks.append(
            "\n".join(
                [
                    str(index),
                    f"{_format_srt_time(segment.start)} --> {_format_srt_time(segment.end)}",
                    text,
                ]
            )
        )

    return "\n\n".join(blocks) + ("\n" if blocks else "")


def segments_to_payload(segments: list[TranscriptionSegment]) -> list[dict]:
    return [
        {
            "start": segment.start,
            "end": segment.end,
            "text": segment.text,
        }
        for segment in segments
    ]


def _format_srt_time(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1_000)

    return f"{hours:02}:{minutes:02}:{whole_seconds:02},{milliseconds:03}"


def _sum_known_durations(units: list[TranscriptionUnit]) -> Optional[float]:
    durations = [unit.duration_seconds for unit in units]

    if any(duration is None for duration in durations):
        return None

    return sum(float(duration) for duration in durations if duration is not None)
