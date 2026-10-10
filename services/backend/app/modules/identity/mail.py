import asyncio
import smtplib
from email.message import EmailMessage
from typing import Protocol

from app.config import Settings


class MailSender(Protocol):
    async def send_verification_code(
        self, recipient: str, code: str, expires_minutes: int
    ) -> None: ...

    async def send_password_reset(self, recipient: str, reset_url: str) -> None: ...


class SmtpMailSender:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def send_verification_code(
        self, recipient: str, code: str, expires_minutes: int
    ) -> None:
        if not self.settings.mail_host or not self.settings.mail_username or not self.settings.mail_password:
            raise RuntimeError("邮件服务尚未配置")

        message = EmailMessage()
        message["Subject"] = "Aivora 注册验证码"
        message["From"] = f"{self.settings.mail_from_name} <{self.settings.mail_from or self.settings.mail_username}>"
        message["To"] = recipient
        message.set_content(
            f"你的 Aivora 注册验证码是：{code}\n\n"
            f"验证码 {expires_minutes} 分钟内有效，验证成功后立即失效。\n"
            "如果这不是你的操作，请忽略此邮件。"
        )

        await asyncio.to_thread(self._send, message)

    async def send_password_reset(self, recipient: str, reset_url: str) -> None:
        if not self.settings.mail_host or not self.settings.mail_username or not self.settings.mail_password:
            raise RuntimeError("邮件服务尚未配置")
        message = EmailMessage()
        message["Subject"] = "Aivora 重置密码"
        message["From"] = f"{self.settings.mail_from_name} <{self.settings.mail_from or self.settings.mail_username}>"
        message["To"] = recipient
        message.set_content(
            f"请使用以下链接重置 Aivora 密码：\n\n{reset_url}\n\n"
            f"链接 {self.settings.password_reset_ttl_minutes} 分钟内有效，使用一次后失效。\n"
            "如果这不是你的操作，请忽略此邮件。"
        )
        await asyncio.to_thread(self._send, message)

    def _send(self, message: EmailMessage) -> None:
        if self.settings.mail_port == 465 and self.settings.mail_use_tls:
            with smtplib.SMTP_SSL(self.settings.mail_host, self.settings.mail_port, timeout=15) as client:
                client.login(self.settings.mail_username, self.settings.mail_password)
                client.send_message(message)
            return
        with smtplib.SMTP(self.settings.mail_host, self.settings.mail_port, timeout=15) as client:
            if self.settings.mail_use_tls:
                client.starttls()
            client.login(self.settings.mail_username, self.settings.mail_password)
            client.send_message(message)
