import ipaddress
from urllib.parse import urlparse


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
