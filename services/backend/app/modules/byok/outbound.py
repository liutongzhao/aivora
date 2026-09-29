import ipaddress
from urllib.parse import urlparse

import httpx

class InvalidEndpoint(ValueError):
    pass


def validate_endpoint(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname:
        raise InvalidEndpoint("API 地址必须使用 HTTPS")
    if parsed.username or parsed.password:
        raise InvalidEndpoint("API 地址不能包含账号信息")
    host = parsed.hostname
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address and (address.is_private or address.is_loopback or address.is_link_local or address.is_reserved):
        raise InvalidEndpoint("API 地址不能指向本机或内网")
    if parsed.port not in (None, 443):
        raise InvalidEndpoint("API 地址端口必须是 443")
    return value.rstrip("/")


async def probe_connection(base_url: str, api_key: str) -> list[str]:
    endpoint = validate_endpoint(base_url)
    models_endpoint = (
        f"{endpoint}/models"
        if endpoint.endswith("/v1")
        else f"{endpoint}/v1/models"
    )
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
            response = await client.get(models_endpoint, headers=headers)
            response.raise_for_status()
    except httpx.HTTPStatusError as error:
        raise ValueError(f"供应商返回 HTTP {error.response.status_code}") from error
    except httpx.RequestError as error:
        raise ValueError("无法连接供应商，请检查地址和网络") from error

    try:
        payload = response.json()
        models = payload.get("data", [])
        return [str(item["id"]) for item in models if item.get("id")]
    except (TypeError, ValueError, KeyError) as error:
        raise ValueError("供应商返回的数据格式无法识别") from error


async def probe_model(base_url: str, api_key: str, model_name: str) -> None:
    endpoint = validate_endpoint(base_url)
    completions_endpoint = (
        f"{endpoint}/chat/completions"
        if endpoint.endswith("/v1")
        else f"{endpoint}/v1/chat/completions"
    )
    payload = {
        "model": model_name,
        "stream": False,
        "max_tokens": 8,
        "messages": [{"role": "user", "content": "Reply with OK."}],
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0)) as client:
            response = await client.post(
                completions_endpoint,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            result = response.json()
    except httpx.HTTPStatusError as error:
        raise ValueError(f"模型调用返回 HTTP {error.response.status_code}") from error
    except httpx.RequestError as error:
        raise ValueError("无法连接供应商，请检查地址和网络") from error
    except ValueError as error:
        raise ValueError("供应商返回的数据格式无法识别") from error
    if not isinstance(result, dict) or not result.get("choices"):
        raise ValueError("模型调用成功但未返回有效结果")
