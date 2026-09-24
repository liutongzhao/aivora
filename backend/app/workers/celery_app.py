from celery import Celery

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
    task_time_limit=180,
    task_soft_time_limit=150,
)

