import base64
from cryptography.fernet import Fernet, InvalidToken
from app.config import get_settings


def _key() -> bytes:
    raw = get_settings().aivora_master_key
    if not raw:
        raise RuntimeError("AIVORA_MASTER_KEY is required for user API keys")
    try:
        base64.urlsafe_b64decode(raw.encode())
    except Exception as error:
        raise RuntimeError("AIVORA_MASTER_KEY must be a Fernet key") from error
    return raw.encode()


def encrypt_secret(value: str) -> str:
    if not value or len(value) < 8:
        raise ValueError("API 密钥不能为空或过短")
    return Fernet(_key()).encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    try:
        return Fernet(_key()).decrypt(value.encode()).decode()
    except InvalidToken as error:
        raise RuntimeError("API 密钥无法解密") from error
