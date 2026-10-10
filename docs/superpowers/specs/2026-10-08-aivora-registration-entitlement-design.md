# Aivora 注册、试用与期限授权体系设计

**日期：** 2026-10-08  
**状态：** 已确认，待实施  
**范围：** 公开注册、QQ 邮箱验证码、免费试用、期限授权码、管理员运营

## 1. 目标与已确认规则

Aivora 面向任何人开放注册。用户通过邮箱验证码证明邮箱控制权后创建账号，获得有限次免费搜题体验；用户购买授权码后激活期限授权。模型调用仍由用户配置自己的 BYOK 连接，Aivora 只限制产品使用资格和任务请求，不承担用户模型供应商费用。

已确认规则：

1. 支持正常个人邮箱和企业邮箱，不建立固定服务商白名单。
2. 对明确的临时邮箱域名做拦截或风险控制。
3. 注册必须通过邮箱验证码。
4. 验证成功后赠送 5 次免费搜题。
5. 未购买用户只能使用一次性试用次数，不自动恢复。
6. 授权码激活后获得期限使用权，默认期限为 6 个月。
7. 授权期限按自然月计算，管理员可配置新授权码的月数。
8. 已生成授权码的期限固定，不受之后默认配置变化影响。
9. 续期从当前有效期结束时间顺延；已过期则从激活时间开始计算。
10. 授权绑定用户账号，不绑定单台电脑；默认不可自行转移。
11. 到期后用户仍可登录、配置模型和查看历史，但不能创建新搜题任务。
12. 所有权限和试用判断在后端完成，客户端只负责展示。

## 2. 账号与权益状态

### 2.1 账号状态

使用显式状态代替只依赖 `is_active`：

```text
pending_verification
active
suspended
deleted
```

- `pending_verification`：验证码尚未验证，不允许登录和搜题。
- `active`：可以正常登录；搜题权限由试用次数或授权状态决定。
- `suspended`：管理员停用，撤销全部会话，不允许登录和创建任务。
- `deleted`：逻辑删除或脱敏后的历史状态，不可恢复登录。

`is_active` 可在迁移期间保留兼容，但新业务以 `status` 为准。

### 2.2 搜题资格

用户创建搜题任务时按以下顺序判断：

1. 账号必须为 `active`。
2. 邮箱必须已验证。
3. 存在未过期、未暂停的授权权益时，不扣试用次数。
4. 没有有效授权时，检查可用试用次数。
5. 试用次数不足则拒绝创建任务。
6. 所有请求仍受频率、并发、图片大小和任务输入限制。

权限状态：

| 状态 | 登录 | 查看历史 | 配置模型 | 创建搜题 |
| --- | --- | --- | --- | --- |
| 待验证 | 否 | 否 | 否 | 否 |
| 已验证、试用中 | 是 | 是 | 是 | 试用次数大于 0 |
| 授权有效 | 是 | 是 | 是 | 是 |
| 授权过期 | 是 | 是 | 是 | 否 |
| 管理员停用 | 否 | 否 | 否 | 否 |

## 3. 注册与邮箱验证流程

### 3.1 注册流程

```text
填写邮箱
  -> 请求验证码
  -> 输入验证码
  -> 验证验证码
  -> 设置密码和用户名
  -> 创建 active 用户
  -> 发放 5 次试用
  -> 登录或进入登录页
```

验证码验证和账号创建可以拆成两个接口，但必须使用短时验证票据连接两步流程。前端不能只提交 `email + code` 绕过密码设置，也不能把验证码本身当作登录凭证。

### 3.2 邮箱规范化

- 使用成熟邮箱解析库进行格式验证。
- 域名和邮箱地址用于比较时转小写。
- 不删除本地部分中的合法字符，不自行做 Gmail 点号或加号语义归一化。
- 数据库保存 `email_normalized` 唯一索引。
- 错误响应不暴露某个邮箱是否已注册。
- 正常企业邮箱默认支持。
- 临时邮箱域名通过可更新的风险表管理，管理员可以添加、删除和查看命中原因。

### 3.3 验证码规则

- 6 位密码学安全随机数字码。
- 有效期 10 分钟。
- 验证成功立即消费。
- 单个验证码最多错误 5 次，超过后立即失效。
- 同一邮箱 60 秒内不可重发。
- 同一邮箱每天最多发送 10 次。
- 同一 IP 每小时最多发送 20 次。
- 同一 IP 连续触发异常时进入更严格的冷却或人机校验。
- 数据库只保存验证码哈希，不保存明文。
- 验证码不写入应用日志、审计 metadata 或错误追踪系统。

### 3.4 QQ 邮箱发送

后端通过 SMTP 适配器调用 QQ 邮箱，使用 QQ 邮箱授权码而非 QQ 登录密码。配置只存在后端环境变量或部署密钥中：

```env
MAIL_PROVIDER=smtp
MAIL_HOST=<qq-smtp-host>
MAIL_PORT=<qq-smtp-port>
MAIL_USERNAME=<system-qq-mailbox>
MAIL_PASSWORD=<qq-mail-app-password>
MAIL_FROM=<system-qq-mailbox>
MAIL_FROM_NAME=Aivora
MAIL_USE_TLS=true
```

邮件发送模块必须定义稳定接口，使未来可以切换邮件 API：

```python
class MailSender(Protocol):
    async def send_verification_code(
        self, recipient: str, code: str, expires_minutes: int
    ) -> None: ...
```

生产发信建议使用专门的 QQ 邮箱，不使用管理员个人日常邮箱。发送失败不能创建账号或发放试用。

### 3.5 注册接口

建议接口：

```text
POST /api/auth/registration/send-code
POST /api/auth/registration/verify-code
POST /api/auth/register
POST /api/auth/registration/resend-code
```

`verify-code` 返回短时 `registration_ticket`，只允许用于完成指定邮箱的注册；ticket 只存哈希，默认 15 分钟有效，使用一次后失效。

接口响应：

- 发送验证码：统一返回“如果请求有效，验证码将发送到邮箱”。
- 验证失败：返回通用错误，不暴露邮箱注册状态。
- 注册完成：返回用户信息或要求重新登录，具体由前端流程确定。

## 4. 数据模型与迁移

### 4.1 `users` 增量字段

```text
email_normalized VARCHAR(320) NOT NULL UNIQUE
status VARCHAR(32) NOT NULL
email_verified_at TIMESTAMPTZ
trial_granted_at TIMESTAMPTZ
trial_total INTEGER NOT NULL DEFAULT 0
trial_used INTEGER NOT NULL DEFAULT 0
created_ip INET
last_login_at TIMESTAMPTZ
```

历史用户迁移策略：

- 已存在且 `is_active = true` 的用户标记为 `active`。
- `email_verified_at` 由产品迁移策略决定；本项目现有账号不能因为迁移被静默锁死。
- 新注册用户必须走邮箱验证。

### 4.2 `email_verification_codes`

```text
id UUID PRIMARY KEY
email_normalized VARCHAR(320) NOT NULL
purpose VARCHAR(32) NOT NULL
code_hash CHAR(64) NOT NULL
registration_ticket_hash CHAR(64)
expires_at TIMESTAMPTZ NOT NULL
consumed_at TIMESTAMPTZ
attempt_count INTEGER NOT NULL DEFAULT 0
request_ip INET
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

索引：

- `(email_normalized, purpose, created_at DESC)`
- `expires_at`
- `registration_ticket_hash` 唯一索引（非空）

### 4.3 `license_batches` 与 `license_codes`

批次：

```text
id UUID PRIMARY KEY
name VARCHAR(160)
duration_months INTEGER NOT NULL
quantity INTEGER NOT NULL
created_by UUID NOT NULL
created_at TIMESTAMPTZ NOT NULL
```

授权码：

```text
id UUID PRIMARY KEY
batch_id UUID NOT NULL
code_hash CHAR(64) NOT NULL UNIQUE
code_suffix VARCHAR(16) NOT NULL
status VARCHAR(24) NOT NULL
activated_by UUID
activated_at TIMESTAMPTZ
revoked_at TIMESTAMPTZ
revoke_reason TEXT
created_at TIMESTAMPTZ NOT NULL
```

授权码状态：

```text
unused
activated
revoked
```

授权码明文只在生成时显示或导出一次；后台列表只显示掩码和后缀。

### 4.4 `user_entitlements`

```text
id UUID PRIMARY KEY
user_id UUID NOT NULL
entitlement_type VARCHAR(32) NOT NULL
starts_at TIMESTAMPTZ NOT NULL
expires_at TIMESTAMPTZ NOT NULL
status VARCHAR(24) NOT NULL
source VARCHAR(32) NOT NULL
source_license_id UUID
created_by UUID
created_at TIMESTAMPTZ NOT NULL
revoked_at TIMESTAMPTZ
revoke_reason TEXT
```

权益状态：

```text
active
expired
paused
revoked
```

### 4.5 `usage_ledger`

```text
id UUID PRIMARY KEY
user_id UUID NOT NULL
task_id UUID
usage_type VARCHAR(32) NOT NULL
amount INTEGER NOT NULL
status VARCHAR(24) NOT NULL
idempotency_key VARCHAR(200) NOT NULL UNIQUE
created_at TIMESTAMPTZ NOT NULL
reversed_at TIMESTAMPTZ
reversal_reason TEXT
```

试用次数不能只依赖 `users.trial_remaining` 这样的可变数字。可使用用户汇总字段加流水表，但每次预占、确认、退回都必须在事务中产生可追溯记录。

## 5. 试用次数结算

一次成功创建的搜题任务预占 1 次。建议状态：

```text
reserved
committed
reversed
```

结算规则：

- 重复 `client_request_id` 不重复预占。
- 图片解码、上传或任务入库失败：退回预占。
- Worker 派发结果不确定：保持 `reserved`，由后台恢复任务或人工处理，不能盲目重复扣减。
- 进入模型调用后失败：默认视为已使用，记录 `committed`。
- 模型调用前取消：退回。
- 模型调用开始后取消：视为已使用。
- 已有有效期限授权：不消耗试用次数。
- 管理员赠送或调整次数：写入独立权益/调整流水，不能覆盖历史使用记录。

任务创建必须在数据库事务内完成资格判断、额度预占、任务创建和任务输入关联，提交成功后才投递 Worker。

## 6. 授权码与期限

### 6.1 生成

- 管理员设置批次名称、数量和授权月数。
- 月数为正整数，设置部署级上限。
- 每个授权码使用密码学安全随机值生成。
- 数据库保存哈希，后台保存可识别后缀。
- 明文仅在生成响应或一次性导出中出现。

### 6.2 激活

```text
POST /api/licenses/redeem
```

激活要求：

1. 当前用户已验证邮箱并处于 `active`。
2. 授权码存在、未使用、未撤销。
3. 事务锁定授权码。
4. 将授权码标记为 `activated`。
5. 创建用户权益记录。
6. 写入管理员/系统审计事件。

重复提交同一码必须幂等地返回“已使用”，不能转移到其他账号。

### 6.3 续期

```text
new_start = max(now, current_active_entitlement.expires_at)
new_expiry = add_calendar_months(new_start, duration_months)
```

自然月计算需要明确月末规则：如果起始日期在目标月份不存在，则取目标月份最后一天。

### 6.4 到期

授权到期后：

- 保留账号和历史任务。
- 禁止新建搜题任务。
- 允许登录、查看历史、修改模型配置和兑换新授权码。
- 前端显示到期日期和激活入口。

## 7. 管理员能力

### 7.1 用户

- 搜索、分页、按状态筛选。
- 查看邮箱验证状态、注册时间、最近登录、任务统计。
- 查看试用总数、已用数、剩余数。
- 查看授权开始时间、到期时间、来源批次。
- 停用/恢复账号。
- 撤销全部会话。
- 赠送试用次数。
- 延长、暂停、恢复或撤销授权。

### 7.2 授权码

- 配置默认授权月数。
- 创建授权码批次。
- 一次性导出明文授权码。
- 查看未使用/已使用/已撤销数量。
- 按后缀、批次、兑换账号查询。
- 撤销未使用授权码。
- 查看兑换时间和账号。

### 7.3 审计

复用现有 `admin_audit_logs`，覆盖：

```text
registration_policy_changed
user_suspended
user_reactivated
user_sessions_revoked
trial_adjusted
license_batch_created
license_codes_exported
license_revoked
license_redeemed
entitlement_extended
entitlement_paused
entitlement_revoked
```

每条记录包含操作者、目标资源、结果、原因和必要 metadata，不记录验证码、授权码明文、密码或 Session Token。

管理员不得停用自己的唯一管理员账号；高风险操作至少需要二次确认，后续可增加管理员 MFA。

## 8. 防刷与安全

### 8.1 速率限制

第一版使用 Redis 计数器实现：

| 动作 | 限制 |
| --- | --- |
| 邮箱验证码重发 | 同邮箱 60 秒一次 |
| 邮箱验证码发送 | 同邮箱每日 10 次 |
| 验证码发送 | 同 IP 每小时 20 次 |
| 验证码校验 | 单验证码最多 5 次 |
| 登录失败 | 邮箱和 IP 双维度退避 |
| 授权码兑换 | 用户、IP 双维度限流 |
| 创建搜题 | 用户并发上限和 IP 频率上限 |

### 8.2 认证与凭证

- QQ SMTP 授权码仅存在后端配置。
- Web 长期会话不放入 `localStorage`，改用 `HttpOnly`、`Secure`、`SameSite` Cookie，并设计 CSRF 防护。
- Electron 会话使用系统安全存储。
- 不在日志打印验证码、完整授权码和 Session Token。
- 验证码和授权码不出现在 URL。
- 生产环境强制 HTTPS。

### 8.3 邮箱状态

邮件发送失败不创建正式账号，不发试用。

邮件服务要记录：

- 发送成功/失败
- 服务商错误码
- 脱敏收件邮箱
- 请求时间
- 关联用途

不能记录验证码正文。

## 9. 接口草案

认证：

```text
POST /api/auth/registration/send-code
POST /api/auth/registration/verify-code
POST /api/auth/register
POST /api/auth/registration/resend-code
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/password-reset/request
POST /api/auth/password-reset/confirm
GET  /api/session_status
```

用户权益：

```text
GET  /api/account/entitlements
GET  /api/account/usage
POST /api/licenses/redeem
```

管理员：

```text
GET   /api/admin/users
GET   /api/admin/users/{user_id}
PATCH /api/admin/users/{user_id}/status
POST  /api/admin/users/{user_id}/revoke-sessions
POST  /api/admin/users/{user_id}/trial-adjustments
POST  /api/admin/users/{user_id}/entitlements
GET   /api/admin/license-settings
PATCH /api/admin/license-settings
POST  /api/admin/license-batches
GET   /api/admin/license-batches
GET   /api/admin/license-codes
POST  /api/admin/license-codes/{id}/revoke
GET   /api/admin/audit-logs
```

搜题接口保留现有路径，但在 `TaskService.create()` 内统一执行资格和用量结算。

## 10. 前端流程

Web 注册页拆成三个状态：

1. 邮箱输入与发送验证码。
2. 验证码输入与重发倒计时。
3. 用户名、密码和注册完成。

登录后工作台显示：

- 当前账号状态。
- 免费试用剩余次数。
- 授权是否有效。
- 授权到期日期。
- 兑换授权码入口。

桌面端在搜题前由后端返回统一错误码：

```text
EMAIL_NOT_VERIFIED
TRIAL_EXHAUSTED
ENTITLEMENT_EXPIRED
ACCOUNT_SUSPENDED
BYOK_NOT_CONFIGURED
```

客户端按错误码展示注册验证、兑换授权或模型配置入口，不在客户端自行计算权限。

## 11. 验收标准

### 注册

- 正常邮箱可以收件并完成注册。
- 无效格式、明确临时邮箱和超频请求得到清晰错误。
- 验证码过期、重复使用、输错 5 次均不能完成注册。
- 发送失败不创建账号、不赠送试用。
- 同邮箱和同 IP 不能无限发送验证码。

### 试用

- 新验证用户准确获得 5 次。
- 两个并发请求不能消耗同一剩余次数。
- 客户端改请求参数不能绕过服务端判断。
- 重试同一幂等键不重复扣次数。
- 指定失败阶段按规则退回或确认使用。

### 授权

- 管理员可生成不同期限批次。
- 激活一码只能绑定一个账号。
- 续期从原到期日顺延。
- 默认期限调整不影响既有批次。
- 到期后只能阻止新搜题，不影响登录和历史查看。

### 管理

- 管理员可查看和处理用户、授权码与权益。
- 所有敏感变更有审计记录。
- 普通用户无法访问管理员接口。
- 管理员不能读取 SMTP 凭证、验证码、授权码明文或用户模型密钥。

## 12. 非目标

第一阶段不实现：

- 在线支付和自动发码。
- 自动续费。
- 多级套餐。
- 团队授权和共享账号。
- 按模型成本计费。
- 一人多账号的绝对识别。
- 复杂营销优惠券。

