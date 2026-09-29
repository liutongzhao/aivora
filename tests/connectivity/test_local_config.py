import json
from pathlib import Path


def test_local_config_points_to_local_services():
    config = json.loads((Path(__file__).resolve().parents[2] / "apps/desktop/config.json").read_text())
    assert config["api"]["baseUrl"] == "http://127.0.0.1:18000"
    assert config["web"]["baseUrl"] == "http://127.0.0.1:3000"
    assert config["websocket"]["url"] == "http://127.0.0.1:18000"
