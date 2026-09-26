from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_local_startup_separates_worker_beat_and_maintenance_processes():
    script = (ROOT / "scripts" / "start-aivora.sh").read_text()

    assert "aivora-worker" in script
    assert "--pool=prefork" in script
    assert "--concurrency=4" in script
    assert "--queues=aivora --hostname=aivora-worker@%h" in script
    assert "aivora-beat" in script
    assert "celery -A app.workers.celery_app.celery_app beat --loglevel=INFO" in script
    assert "aivora-maintenance" in script
    assert "--queues=aivora-maintenance" in script
    assert "--concurrency=1" in script


def test_compose_separates_worker_beat_and_maintenance_services():
    compose = (ROOT / "docker-compose.yml").read_text()

    assert "  worker:" in compose
    assert "  beat:" in compose
    assert "  maintenance:" in compose
    assert "--queues=aivora --hostname=aivora-worker@%h" in compose
    assert "--concurrency=4" in compose
    assert "celery -A app.workers.celery_app.celery_app beat --loglevel=INFO" in compose
    assert "--queues=aivora-maintenance" in compose
    assert "--concurrency=1" in compose
