from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]


def test_local_startup_uses_one_celery_worker():
    script = (ROOT / "scripts/start-aivora.sh").read_text()
    assert "start_screen aivora-worker " in script
    assert "--pool=threads --concurrency=4 --queues=aivora" in script
    assert "start_screen aivora-beat" not in script
    assert "start_screen aivora-maintenance" not in script
    assert "TASK_DISPATCH_ENABLED" not in script


def test_stop_and_check_do_not_require_removed_services():
    for name in ("stop-aivora.sh", "check-aivora.sh"):
        script = (ROOT / "scripts" / name).read_text()
        assert "aivora-beat" not in script
        assert "aivora-maintenance" not in script


def test_compose_uses_one_celery_worker_after_migration():
    services = yaml.safe_load((ROOT / "docker-compose.yml").read_text())["services"]
    assert "beat" not in services
    assert "maintenance" not in services
    assert "worker" in services
    assert "--pool=threads --concurrency=4 --queues=aivora" in services["worker"]["command"]
    for name in ("api", "worker"):
        assert "TASK_DISPATCH_ENABLED" not in services[name]["environment"]
        assert services[name]["depends_on"]["flyway"]["condition"] == "service_completed_successfully"
