# Aivora 远程控制会话优化设计

## 1. 目标

将现有“连接码 + Socket.IO 转发”升级为可观测、可恢复、可审计的远程控制会话系统。

目标包括：

- 一个账号同时最多一个活跃远程会话。
- 桌面端和手机端明确展示连接、断开、替换和错误状态。
- 每个远程操作具备完整的 accepted、running、success、failed 回执。
- 持久化连接历史、连接时长和操作历史。
- 桌面端只执行白名单动作。
- 开发版和正式版的远程设备身份继续隔离。
- 保持现有 `/remote` Socket.IO namespace 和已有操作兼容。

## 2. 当前问题

当前实现存在以下问题：

1. 桌面端收到 `remote:paired` 后，部分 UI 没有消费 `connected` 状态，因此仍显示连接码倒计时。
2. 手机端收到的 Socket ack 仅表示服务端完成转发，不表示桌面端已经执行成功。
3. 在线 Socket 映射保存在进程内存中，服务重启或多实例部署时会丢失。
4. 手机断开时没有完整清理 `mobile_sids`。
5. `remote_sessions` 表存在但没有被实际使用。
6. REST 配对校验和 Socket 配对校验重复，容易产生语义不一致。
7. `remote:result` 当前没有严格校验发送方必须是桌面端。
8. 多个客户端可能覆盖同一设备的内存 Socket 映射。

## 3. 业务规则

### 3.1 单账号单远程会话

同一个 `user_id` 同时只能有一个状态为 `pending`、`connecting`、`active` 或 `closing` 的远程会话。

新手机成功配对时：

1. 找到该账号现有活跃会话。
2. 向旧手机和旧桌面端发送替换通知。
3. 关闭旧 Socket 和旧会话。
4. 创建新会话。
5. 向新手机和桌面端广播新会话状态。

旧手机显示“当前账号已在其他设备建立新的远程连接”。

### 3.2 连接码

- 连接码为 8 位。
- 默认有效期为 5 分钟。
- 同一设备生成新码时撤销旧的未使用连接码。
- 连接码只有在 Socket 配对成功后才标记为已使用。
- 连接码只绑定当前用户和当前桌面设备。
- 桌面端主动结束会话时，当前连接码和会话立即失效。

### 3.3 操作限制

服务端和桌面端都必须执行动作白名单校验。手机端传入未知动作时直接返回 `rejected`，不得将任意 IPC 名称或任意字符串传给 Electron。

## 4. 会话状态

### 4.1 服务端状态

```text
pending      已创建连接码，等待手机连接
connecting   手机正在完成 Socket 注册
active       手机和桌面端均在线
closing      会话正在关闭
closed       会话正常结束
expired      连接码或会话超时
replaced     被新的远程会话替换
```

### 4.2 客户端状态

桌面端和手机端统一使用：

```text
idle
creating
waiting
connected
executing
disconnected
expired
replaced
error
```

客户端状态必须由服务端事件和命令回执驱动，不能仅依赖本地按钮状态或连接码倒计时推断。

## 5. 数据模型

### 5.1 remote_sessions

扩展现有表：

```text
id
user_id
device_id
status
mobile_connected_at
desktop_connected_at
connected_at
last_seen_at
disconnected_at
disconnect_reason
duration_seconds
created_at
updated_at
```

通过 PostgreSQL 条件唯一索引保证一个账号只有一个活跃会话：

```sql
UNIQUE (user_id)
WHERE status IN ('pending', 'connecting', 'active', 'closing')
```

### 5.2 remote_commands

新增命令记录：

```text
id
session_id
request_id
action
status
created_at
accepted_at
started_at
finished_at
duration_ms
error_code
error_message
```

命令状态：

```text
created
accepted
running
success
failed
timeout
rejected
cancelled
```

`request_id` 在单个会话内唯一，用于手机端匹配异步回执。

### 5.3 pairing_codes

扩展现有表：

```text
session_id
consumed_at
revoked_at
```

保留现有 `used_at` 的兼容读取逻辑，迁移完成后统一使用 `consumed_at`。

## 6. Socket.IO 协议

继续使用 `/remote` namespace。

### 6.1 桌面注册

事件：

```text
remote:desktop_register
```

请求：

```json
{
  "deviceId": "local-device-id",
  "clientVersion": "0.1.4",
  "platform": "darwin"
}
```

服务端验证当前登录用户和设备归属，返回注册结果。

### 6.2 手机配对

事件：

```text
remote:mobile_register
```

请求：

```json
{
  "code": "A1B2C3D4"
}
```

配对成功后，两端收到：

```text
remote:session_state
```

```json
{
  "status": "active",
  "sessionId": "session-id",
  "connectedAt": 1790760000000,
  "device": {
    "name": "Aivora Desktop",
    "platform": "darwin",
    "clientVersion": "0.1.4"
  }
}
```

### 6.3 远程命令

手机发送：

```text
remote:command
```

```json
{
  "requestId": "request-id",
  "action": "screenshot",
  "params": {}
}
```

服务端先返回 `accepted` 或 `rejected`，再向桌面端转发：

```text
remote:execute
```

```json
{
  "sessionId": "session-id",
  "requestId": "request-id",
  "action": "screenshot",
  "params": {}
}
```

桌面端立即发送 `running`，执行结束后发送 `success` 或 `failed`。

### 6.4 断开和替换

统一事件：

```text
remote:session_state
```

断开示例：

```json
{
  "status": "closed",
  "reason": "desktop_disconnected"
}
```

替换示例：

```json
{
  "status": "replaced",
  "reason": "new_remote_session"
}
```

## 7. 服务端实现

新增远程控制 service，集中负责：

- 连接码创建、消费、撤销。
- 单账号活跃会话约束。
- Socket 上下文和数据库会话同步。
- 当前设备和 Socket 映射。
- 命令白名单和命令记录。
- 会话关闭、替换和超时。

Socket handler 只负责协议适配，不直接写复杂业务逻辑。

第一阶段继续使用单实例内存 Socket 映射，同时所有会话和命令写入 PostgreSQL。后续多实例部署时接入 Socket.IO Redis Manager，不改变上层协议。

## 8. 桌面端实现

重构 `RemoteControlClient`：

- 用统一状态对象替代 `paired`、`pairing` 等分散字段。
- 监听 `remote:session_state`。
- 发送命令执行中的 `running` 回执。
- 对服务端传来的动作做白名单校验。
- 对耗时动作保留单并发限制。
- 为每条命令携带 `requestId`、`sessionId`。
- 连接断开、被替换和服务端重启时清理本地状态。
- 所有 UI 入口订阅同一份状态事件。

## 9. Web 端实现

远程控制页面拆成：

1. 连接表单。
2. 当前会话状态。
3. 操作分组。
4. 操作执行列表。
5. 最近操作记录。

按钮状态由 `requestId` 对应的命令状态驱动，不使用单个全局 message 覆盖所有操作。

页面显示：

- 当前设备。
- 在线状态。
- 连接开始时间。
- 当前连接时长。
- 当前操作状态。
- 错误原因。
- 被其他设备替换时的明确提示。

## 10. 桌面端体验

远程控制区域状态：

```text
未连接
等待手机连接
手机已连接
远程连接已结束
连接已被其他设备替换
连接失败
```

连接成功后：

- 隐藏连接码倒计时。
- 显示手机已连接。
- 显示连接时间和当前时长。
- 提供结束远程控制按钮。
- 显示成功 Toast。

## 11. 管理端接口

保留：

```text
POST /api/remote/devices/register
GET  /api/remote/devices
POST /api/remote/pairing/create
```

新增：

```text
POST /api/remote/pairing/revoke
GET  /api/remote/session/current
POST /api/remote/session/close
GET  /api/remote/sessions
GET  /api/remote/commands
```

现有 `POST /api/remote/pairing/verify` 暂停使用。配对校验逻辑抽到 service，避免 REST 和 Socket 两套实现。

## 12. 分阶段实施

### Phase 1：连接可靠性

- 统一桌面端和手机端状态。
- 修复倒计时不消失。
- 修复手机断开清理。
- 实现单账号单会话和连接替换。
- 增加服务端连接日志。

### Phase 2：命令回执

- 引入 `requestId`。
- 实现 accepted、running、success、failed。
- 手机端按钮显示执行状态。
- 服务端和桌面端双重白名单。
- 增加命令超时和错误回传。

### Phase 3：数据持久化

- 添加数据库迁移。
- 使用 `remote_sessions`。
- 新增 `remote_commands`。
- 记录连接时长、结束原因和操作耗时。

### Phase 4：管理端历史

- 当前会话卡片。
- 连接历史。
- 操作历史。
- 分页和状态筛选。

### Phase 5：稳定性验证

覆盖以下场景：

1. 正常配对。
2. 连接码过期和重复使用。
3. 第二部手机替换第一部手机。
4. 手机主动断开。
5. 桌面端主动断开。
6. 桌面端异常退出。
7. 服务端重启。
8. 命令执行超时。
9. 快速连续点击。
10. 开发版和正式版同时运行。
11. 同账号多个桌面设备。
12. 未知动作和伪造回执。

## 13. 兼容和发布策略

- 保持 `/remote` namespace 不变。
- 保留现有动作名称。
- 数据库迁移只新增字段和表，不删除已有数据。
- 新客户端兼容旧服务端时，继续使用旧事件作为临时降级路径。
- 服务端先部署兼容协议，再发布新桌面端和 Web 端。
- 完成新客户端验证后，再移除旧配对事件和 REST verify 路径。
