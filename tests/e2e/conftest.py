import base64
from pathlib import Path
import pytest

@pytest.fixture
def sample_png() -> str:
    return "data:image/png;base64," + base64.b64encode((Path(__file__).parent / "fixtures" / "sample-single-choice.png").read_bytes()).decode()
