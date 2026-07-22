"""Cancelación cooperativa de jobs.

`process_job` corre en un hilo del threadpool y no se puede matar de forma segura,
así que la cancelación es cooperativa: el endpoint marca el job y el procesador
comprueba el flag en los puntos de control (entre segmentos y entre chunks) y
aborta lanzando `JobCancelled`. Registro en memoria (un worker).
"""

_cancel_requested: set[str] = set()


class JobCancelled(Exception):
    pass


def request_cancel(job_id: str) -> None:
    _cancel_requested.add(job_id)


def is_cancel_requested(job_id: str) -> bool:
    return job_id in _cancel_requested


def clear_cancel(job_id: str) -> None:
    _cancel_requested.discard(job_id)
