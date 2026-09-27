from app.infrastructure import database
from app.infrastructure.events import event_bus
from app.workers import ai_tasks


def test_worker_process_reset_recreates_async_resources():
    previous_engine = database.engine
    event_bus.redis = object()

    class Runner:
        def close(self):
            pass

    ai_tasks._runner = Runner()

    ai_tasks.reset_worker_process()

    assert database.engine is not previous_engine
    assert event_bus.redis is None
    assert ai_tasks._runner is None
