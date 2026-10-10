from redis.asyncio import Redis


class RateLimitError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class IdentityRateLimiter:
    def __init__(self, redis: Redis):
        self.redis = redis

    async def _limit(self, key: str, limit: int, ttl: int, code: str, message: str) -> None:
        count = await self.redis.incr(key)
        if count == 1:
            await self.redis.expire(key, ttl)
        if count > limit:
            raise RateLimitError(code, message)

    async def check_send(self, email: str, ip: str) -> None:
        await self._limit(f"identity:email-cooldown:{email}", 1, 60, "CODE_COOLDOWN", "请稍后再试")
        await self._limit(f"identity:email-daily:{email}", 10, 86400, "CODE_RATE_LIMITED", "验证码发送过于频繁")
        await self._limit(f"identity:ip-hourly:{ip}", 20, 3600, "CODE_RATE_LIMITED", "请求过于频繁")

    async def check_verify(self, email: str, ip: str) -> None:
        await self._limit(f"identity:verify-ip:{ip}", 30, 3600, "VERIFY_RATE_LIMITED", "验证请求过于频繁")

    async def check_password_reset(self, email: str, ip: str) -> None:
        await self._limit(
            f"identity:password-reset-email:{email}",
            5,
            3600,
            "RESET_RATE_LIMITED",
            "密码重置请求过于频繁",
        )
        await self._limit(
            f"identity:password-reset-ip:{ip}",
            20,
            3600,
            "RESET_RATE_LIMITED",
            "请求过于频繁",
        )
