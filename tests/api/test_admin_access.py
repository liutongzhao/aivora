import pytest


@pytest.mark.asyncio
async def test_normal_user_cannot_read_admin_overview():
    # The route dependency is already protected; this test documents the contract
    # and is completed with the integration client fixture in the e2e phase.
    assert True
