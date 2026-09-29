from dataclasses import dataclass
from io import BytesIO

from minio import Minio
from minio.error import S3Error

from app.config import get_settings


@dataclass(frozen=True)
class StoredObject:
    bucket: str
    object_key: str
    content_type: str
    size_bytes: int


class MinioStorage:
    def __init__(self) -> None:
        settings = get_settings()
        self.bucket = settings.minio_bucket
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )

    def ensure_bucket(self) -> None:
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    def put_bytes(self, object_key: str, data: bytes, content_type: str) -> StoredObject:
        self.client.put_object(
            self.bucket,
            object_key,
            BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
        return StoredObject(self.bucket, object_key, content_type, len(data))

    def delete(self, object_key: str) -> None:
        self.client.remove_object(self.bucket, object_key)

    def get_bytes(self, object_key: str) -> bytes:
        response = self.client.get_object(self.bucket, object_key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def presigned_get(self, object_key: str, expires_seconds: int = 600) -> str:
        from datetime import timedelta

        return self.client.presigned_get_object(
            self.bucket,
            object_key,
            expires=timedelta(seconds=expires_seconds),
        )

    def exists(self, object_key: str) -> bool:
        try:
            self.client.stat_object(self.bucket, object_key)
            return True
        except S3Error as error:
            if error.code in {"NoSuchKey", "NoSuchObject", "NotFound"}:
                return False
            raise


storage = MinioStorage()
