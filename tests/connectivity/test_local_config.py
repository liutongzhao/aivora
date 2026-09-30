import json
from pathlib import Path
from urllib.parse import urlparse


def test_desktop_config_points_to_shared_external_service():
    config = json.loads((Path(__file__).resolve().parents[2] / "apps/desktop/config.json").read_text())
    service_urls = {
        config["api"]["baseUrl"],
        config["web"]["baseUrl"],
        config["websocket"]["url"],
    }

    assert len(service_urls) == 1
    service_url = urlparse(service_urls.pop())
    assert service_url.scheme in {"http", "https"}
    assert service_url.hostname not in {None, "localhost", "127.0.0.1", "::1"}
