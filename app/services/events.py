"""Bus de eventos en memoria por job para streaming SSE.

`process_job` corre en un hilo del threadpool (función síncrona), mientras que el
endpoint SSE vive en el event loop. La publicación cruza ese límite con
`loop.call_soon_threadsafe`, así que es seguro llamar `publish()` desde el hilo de
trabajo. Es un bus de proceso único: válido para un worker (el caso de este
proyecto, que evita Redis/Celery). Con varios workers haría falta un broker.
"""

import asyncio
from collections import defaultdict
from typing import Any


class JobEventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self, job_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers[job_id].add(queue)
        return queue

    def unsubscribe(self, job_id: str, queue: asyncio.Queue) -> None:
        subscribers = self._subscribers.get(job_id)
        if not subscribers:
            return
        subscribers.discard(queue)
        if not subscribers:
            self._subscribers.pop(job_id, None)

    def publish(self, job_id: str, event: dict[str, Any]) -> None:
        """Encola un evento para todos los suscriptores del job.

        Seguro de llamar desde cualquier hilo. Si no hay loop vinculado o no hay
        suscriptores, es un no-op (los eventos sin oyentes se descartan).
        """
        loop = self._loop
        if loop is None:
            return
        for queue in list(self._subscribers.get(job_id, ())):
            try:
                loop.call_soon_threadsafe(queue.put_nowait, event)
            except RuntimeError:
                # el loop puede estar cerrándose; ignoramos
                pass


bus = JobEventBus()
