# 注册与授权上线操作

## QQ 邮箱

1. 使用专门的 QQ 邮箱作为系统发信地址。
2. 在 QQ 邮箱设置中开启 SMTP，并生成邮箱授权码。
3. 将邮箱地址和授权码写入服务器 `.env`，不要提交到 Git 或发送到聊天工具。
4. 至少测试 QQ、163、Gmail、Outlook 和一个企业邮箱的验证码收件。

示例：

```env
MAIL_PROVIDER=smtp
MAIL_HOST=smtp.qq.com
MAIL_PORT=465
MAIL_USERNAME=your-system@qq.com
MAIL_PASSWORD=<qq-mail-authorization-code>
MAIL_FROM=your-system@qq.com
MAIL_FROM_NAME=Aivora
MAIL_USE_TLS=true
```

## 试用与期限

- 邮箱验证成功后发放 5 次一次性试用。
- 默认授权期限为 6 个月。
- 管理员在后台生成批次时可以指定新授权码的有效月数。
- 授权码明文只在生成结果中显示一次。
- 授权到期后账号仍可登录和查看历史，但不能创建新搜题任务。

## 上线检查

- HTTPS 已启用。
- Redis 可用，验证码限流正常。
- API 和 Worker 使用同一数据库迁移版本。
- `MAIL_PASSWORD` 是 QQ 授权码，不是 QQ 登录密码。
- 发送失败不会创建账号或发放试用。
- 管理员可以查看用户、生成授权码和处理到期账号。
- 不在日志中出现验证码、授权码明文、SMTP 凭证或 Session Token。
