from celery import Celery
from celery.signals import worker_process_init, worker_process_shutdown

from app.config import get_settings

settings = get_settings()
celery_app = Celery(
    "aivora",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.update(
    task_default_queue="aivora",
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_acks_on_failure_or_timeout=False,
    task_time_limit=180,
    task_soft_time_limit=150,
    worker_prefetch_multiplier=1,
    imports=("app.workers.ai_tasks",),
)


@worker_process_init.connect
def initialize_worker_process(**_kwargs) -> None:
    from app.workers.ai_tasks import reset_worker_process

    reset_worker_process()


@worker_process_shutdown.connect
def shutdown_worker_process(**_kwargs) -> None:
    from app.workers import ai_tasks

    if ai_tasks._runner is not None:
        ai_tasks._runner.close()
        ai_tasks._runner = None
    ai_tasks._runner_pid = None
