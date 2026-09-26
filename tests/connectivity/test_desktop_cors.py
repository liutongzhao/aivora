import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.mark.asyncio
async def test_desktop_renderer_can_preflight_screenshot_submission():
    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as client:
        response = await client.options(
            "/api/ai/process-screenshot",
            headers={
                "Origin": "http://127.0.0.1:54321",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-session-id",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:54321"


@pytest.mark.asyncio
async def test_unknown_origin_is_rejected():
    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as client:
        response = await client.options(
            "/api/ai/process-screenshot",
            headers={
                "Origin": "http://example.invalid",
                "Access-Control-Request-Method": "POST",
            },
        )

    assert response.status_code == 400
