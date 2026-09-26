from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]


def _compose_service_block(compose: str, service: str) -> str:
    match = re.search(
        rf"(?ms)^  {re.escape(service)}:\n(?P<block>.*?)(?=^  \w[\w-]*:|^volumes:)",
        compose,
    )
    assert match, f"Compose service not found: {service}"
    return match.group("block")


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


def test_local_api_worker_beat_and_maintenance_enable_task_dispatch():
    script = (ROOT / "scripts" / "start-aivora.sh").read_text()

    for process in ("aivora-backend", "aivora-worker", "aivora-beat", "aivora-maintenance"):
        process_line = next(line for line in script.splitlines() if f"start_screen {process} " in line)
        assert "export TASK_DISPATCH_ENABLED=true;" in process_line


def test_local_workers_consume_only_their_assigned_queues():
    script = (ROOT / "scripts" / "start-aivora.sh").read_text()

    worker_line = next(line for line in script.splitlines() if "start_screen aivora-worker " in line)
    maintenance_line = next(
        line for line in script.splitlines() if "start_screen aivora-maintenance " in line
    )
    assert "--queues=aivora --hostname=aivora-worker@%h" in worker_line
    assert "aivora-maintenance" not in worker_line
    assert "--queues=aivora-maintenance" in maintenance_line
    assert "--queues=aivora --" not in maintenance_line


def test_local_startup_does_not_silently_reuse_old_screen_configuration():
    script = (ROOT / "scripts" / "start-aivora.sh").read_text()

    assert "复用 screen" not in script
    assert "检测到已有 screen" in script
    assert "screen -S \"$name\" -X quit" in script
    assert "按当前工作树配置重启" in script


def test_local_stop_and_check_cover_beat_and_maintenance():
    stop_script = (ROOT / "scripts" / "stop-aivora.sh").read_text()
    check_script = (ROOT / "scripts" / "check-aivora.sh").read_text()

    for process in ("aivora-beat", "aivora-maintenance"):
        assert process in stop_script
        assert process in check_script


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


def test_compose_api_worker_beat_and_maintenance_enable_task_dispatch():
    compose = (ROOT / "docker-compose.yml").read_text()

    for service in ("api", "worker", "beat", "maintenance"):
        block = _compose_service_block(compose, service)
        assert "TASK_DISPATCH_ENABLED: \"true\"" in block


def test_compose_workers_consume_only_their_assigned_queues():
    compose = (ROOT / "docker-compose.yml").read_text()

    worker = _compose_service_block(compose, "worker")
    maintenance = _compose_service_block(compose, "maintenance")
    assert "--queues=aivora --hostname=aivora-worker@%h" in worker
    assert "aivora-maintenance" not in worker
    assert "--queues=aivora-maintenance" in maintenance
    assert "--queues=aivora --" not in maintenance
