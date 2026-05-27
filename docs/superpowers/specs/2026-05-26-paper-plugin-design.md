# Paper Plugin Design

## Overview

LightTickets Paper 插件，为 Minecraft 服务器提供议题系统游戏内接入能力。支持 Paper 和 Folia 服务器。

**包名：** `ink.neokoni.LightTickets`
**语言：** Java 21+
**构建：** Gradle Kotlin DSL，最终产物单个 JAR
**本地化：** `lang.yml` 资源文件，所有面向玩家的文本从配置读取，支持占位符替换
**插件描述文件：** `paper-plugin.yml`

---

## 1. 模块架构

```
ink.neokoni.LightTickets/
├── LightTickets.java                  # 插件入口，生命周期管理
├── config/
│   └── PluginConfig.java              # 读取 config.yml，运行时单例访问
├── lang/
│   └── LangManager.java               # 读取 lang.yml，消息格式化（占位符替换）
├── network/
│   ├── ApiClient.java                 # REST API 封装（OkHttp），返回 CompletableFuture
│   └── WebSocketClient.java           # Socket.io 连接、认证、事件监听、自动重连
├── command/
│   ├── CommandRegistry.java           # Brigadier 命令树注册入口
│   ├── menu.GuiCommand.java           # /lt 打开主菜单
│   ├── create.CreateCommand.java      # /lt create <title>
│   ├── ticket.TicketCommand.java      # /lt tickets、/lt ticket <id>
│   ├── comment.CommentCommand.java    # /lt comment <id> <text>
│   ├── link.LinkCommand.java          # /lt link
│   └── help.HelpCommand.java          # /lt help
├── gui/
│   ├── MenuManager.java               # Inventory 事件监听，菜单注册/注销
│   ├── BaseMenu.java                  # 抽象基类：分页、异步渲染、空槽填充、刷新
│   ├── MainMenu.java                  # 主菜单：议题列表 + 创建入口
│   ├── TicketDetailMenu.java          # 议题详情：状态、类型、操作按钮
│   └── CreateTicketMenu.java          # 创建议题：类型选择、正文输入（Book/聊天）
├── model/
│   ├── Ticket.java                    # 议题数据（id, title, status, type, priority 等）
│   ├── Notification.java              # 离线通知（id, message, createdAt）
│   └── PlayerLink.java                # 绑定状态查询结果
├── storage/
│   └── NotificationStore.java         # SQLite 本地存储，读取/批量删除离线通知
└── handler/
    ├── NotificationHandler.java       # WebSocket 事件 → 聊天消息/离线队列
    └── LinkHandler.java               # 账号绑定流程：生成码、轮询确认、通知结果
```

---

## 2. 网络层设计

### 2.1 REST API 客户端

基于 OkHttp，所有请求异步执行，返回 `CompletableFuture`，不阻塞主线程。

**请求头自动附加 `X-Server-Key`：**（从 `PluginConfig` 读取）

**暴露方法：**

```java
CompletableFuture<List<Ticket>> getMyTickets(String playerUuid);
CompletableFuture<Ticket> createTicket(String playerUuid, String title, String body, String type);
CompletableFuture<Void> addComment(String playerUuid, String ticketId, String body);
CompletableFuture<String> generateLinkCode(String playerUuid, String playerName);
CompletableFuture<Boolean> reportPermissionExecution(String ticketId, boolean success, String errorMessage);
```

**错误处理：** HTTP 非 2xx 响应时，方法抛出 `ApiException`，调用方在命令/菜单中捕获并显示 `lang.yml` 中的错误消息。

### 2.2 WebSocket 客户端

**连接：** Socket.io 协议，`<server-url>/mc` 命名空间

**认证：** `handshake.auth = { serverKey: "lt_xxx" }`

**监听事件：**

| 事件 | payload | 处理 |
|------|---------|------|
| `permission:approved` | `{ ticketId, playerUuid, groupName }` → 在线发消息，离线入队 |
| `permission:rejected` | `{ ticketId, playerUuid, reason }` → 同上 |
| `ticket:status_changed` | `{ ticketId, playerUuid, oldStatus, newStatus }` → 同上 |

**重连策略：**
- 连接断开 → 立即尝试一次
- 失败 → 每隔 `retryInterval` 分钟（config.yml，默认 3）重试
- 重试次数超过 `maxRetries` → 插件功能禁用，不再重试
- 后端重新连接成功 → 重置计数器，恢复功能

---

## 3. 命令系统

基于 Brigadier（Paper 原生支持）。

**命令树：**

```
/lt                              → 打开主菜单 GUI（需要 lighttickets.menu）
/lt create <title>               → TUI 创建议题，完成后聊天反馈
/lt tickets                      → TUI 聊天列表：每条显示 #ID 标题 状态
/lt ticket <id>                  → TUI 聊天详情：显示标题、状态、内容、评论
/lt comment <id> <text>          → 添加评论，成功后聊天确认
/lt link                         → 生成 6 位验证码，显示在聊天
/lt help                         → 显示帮助（从 lang.yml 读取）
```

**权限节点（细粒度）：**

| 节点 | 控制功能 |
|------|---------|
| `lighttickets.menu` | `/lt` 打开主菜单 |
| `lighttickets.create` | `/lt create` 创建议题 |
| `lighttickets.list` | `/lt tickets`、`/lt ticket` 查看议题 |
| `lighttickets.comment` | `/lt comment` 添加评论 |
| `lighttickets.link` | `/lt link` 账号绑定 |
| `lighttickets.notify` | 收到离线通知推送 |
| `lighttickets.use` | **组**：包含上述所有节点 |
| `lighttickets.admin` | **组**：管理权限（预留） |

**检查逻辑：**

```java
boolean hasPermission(Player player, String node) {
    return player.hasPermission("lighttickets." + node) 
        || player.hasPermission("lighttickets.use");
}
```

---

## 4. GUI 菜单系统

基于 Bukkit `Inventory` API，Folia 兼容（在 `RegionScheduler` 上执行菜单操作）。

### 4.1 BaseMenu

```java
abstract class BaseMenu {
    String title;            // 从 lang.yml 读取
    int rows;                // 行数（1-6）
    int placeholderId;       // 空槽位物品 ID（config.yml，默认 160 玻璃板）
    boolean autoRefresh;     // 是否定时刷新
    
    // 子类实现
    abstract Map<Integer, SlotAction> render(Player player);
    // SlotAction 包含：ItemStack 或 Runnable（点击回调）
    
    void open(Player player);
    void refresh(Player player);   // 原地更新内容，不重新打开
    void close(Player player);
}
```

**分页支持：** BaseMenu 提供 `getPage()` / `setPage()`，子类通过 `render()` 决定当前页内容。左右箭头槽位翻页。

### 4.2 具体菜单

**MainMenu（主菜单）：**

```
┌─────────────────────────────────────┐
│           Light Tickets             │
├─────────────────────────────────────┤
│  [议题1]    [议题2]    [议题3]      │
│  状态图标      状态图标    状态图标   │
│                                     │
│  [议题4]    [议题5]    [议题6]      │
│                                     │
│                    [← 上一页] [下一页 →] │
├─────────────────────────────────────┤
│              [创建新议题]             │
└─────────────────────────────────────┘
```

- 点击议题项 → 打开 `TicketDetailMenu`
- 点击创建新议题 → 打开 `CreateTicketMenu`
- 分页箭头 → 翻页重新渲染

**TicketDetailMenu（议题详情）：**

```
┌─────────────────────────────────────┐
│           #123 Bug 报告              │
├─────────────────────────────────────┤
│  状态：[处理中]  类型：[Bug报告]     │
│  优先级：[高]  服务器：[survival]   │
├─────────────────────────────────────┤
│       [添加评论]    [返回主菜单]     │
└─────────────────────────────────────┘
```

- 添加评论：点击后弹出聊天输入提示，输入完成后在 GUI 中显示反馈

**CreateTicketMenu（创建议题）：**

- 议题类型：4 个选项按钮（Bug/权限申请/建议/举报）
- 标题：点击后提示玩家在聊天输入
- 正文：点击后提示玩家在聊天输入，支持多行（输入 `/done` 结束）
- 确认创建 → 调用 `ApiClient.createTicket()`，成功后关闭菜单并发聊天确认

---

## 5. TUI 模式

所有 GUI 功能都有对应的命令行操作：

| GUI 操作 | TUI 命令 |
|---------|---------|
| 打开主菜单 | `/lt tickets` 直接列出 |
| 查看议题详情 | `/lt ticket <id>` |
| 创建议题 | `/lt create <title>` 完成后聊天反馈 |
| 添加评论 | `/lt comment <id> <text>` |
| 账号绑定 | `/lt link` |
| 接收通知 | 聊天消息，无 UI 操作 |
| 帮助信息 | `/lt help` |

---

## 6. 通知系统

### 6.1 处理流程

```
WebSocket 事件
  │
  ▼
NotificationHandler
  │
  ├─ 权限检查：玩家是否有 lighttickets.notify
  │    └─ No → 忽略
  │
  ├─ 玩家在线？
  │    ├─ Yes → 直接发聊天消息（Paper ChatComponent）
  │    └─ No  → 写入 NotificationStore（SQLite）
  │
  └─ 事件类型：
       ├─ permission:approved → "你的议题 #{id} 权限申请已通过：{groupName}"
       ├─ permission:rejected → "你的议题 #{id} 被拒绝：{reason}"
       └─ ticket:status_changed → "你的议题 #{id} 状态已更新为 {status}"
```

### 6.2 离线通知存储

SQLite 文件位置：`plugins/LightTickets/notifications.db`

```sql
CREATE TABLE IF NOT EXISTS lt_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_uuid TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
```

### 6.3 玩家上线补发

监听 `PlayerJoinEvent`（在 `RegionScheduler` 上异步读取）：

1. `NotificationStore.popAll(uuid)` 读取并删除该玩家所有待处理通知
2. 如果有通知 → 发送汇总消息 + 逐条显示
3. 所有消息文本从 `lang.yml` 读取

---

## 7. 配置文件

### config.yml

```yaml
server:
  url: "http://localhost:3000"
  key: "lt_xxxxxxxxxxxx"
  maxRetries: 20
  retryInterval: 3

notifications:
  offlineQueue: true
  showOnJoin: true

gui:
  refreshInterval: 0
  placeholderItem: 160
```

### lang.yml（资源文件）

```yaml
# 通用
prefix: "[LightTickets]"
no-permission: "你没有执行此操作的权限"

# 通知
notify-ticket-status: "你的议题 #{ticketId} 状态已更新为 {status}"
notify-permission-approved: "你的议题 #{ticketId} 权限申请已通过：{groupName}"
notify-permission-rejected: "你的议题 #{ticketId} 被拒绝：{reason}"
notify-offline-summary: "你有 {count} 条离线通知："

# 命令
cmd-help: |
  /lt - 打开主菜单
  /lt create <标题> - 创建议题
  /lt tickets - 查看我的议题
  /lt ticket <id> - 查看议题详情
  /lt comment <id> <内容> - 添加评论
  /lt link - 账号绑定
  /lt help - 显示帮助
cmd-create-success: "议题创建成功：#{ticketId} {title}"
cmd-comment-success: "评论已添加"
cmd-link-code: "你的绑定验证码是：{code}，5分钟内有效，请到网页端输入完成绑定。"
cmd-link-pending: "验证码已发送，请在游戏内等待确认..."
cmd-link-success: "账号绑定成功！Minecraft：{name}"
cmd-tickets-header: "我的议题列表："
cmd-tickets-empty: "暂无议题"
cmd-tickets-item: "#{id} {title} [{status}]"
cmd-ticket-header: "议题 #{id}"
cmd-ticket-title: "标题：{title}"
cmd-ticket-status: "状态：{status}"
cmd-ticket-type: "类型：{type}"
cmd-ticket-body: "内容："

# 错误
error-api-failed: "请求失败，请稍后重试"
error-not-linked: "你的账号未绑定，请先使用 /lt link 完成绑定"
error-ticket-not-found: "议题 #{ticketId} 不存在"
error-connection-failed: "无法连接到服务器，轻工单功能已暂时禁用"
```

---

## 8. 构建与部署

**构建工具：** Gradle + Kotlin DSL

**依赖：**
- Paper API（编译时依赖，scope=provided）
- OkHttp 4.x（HTTP + WebSocket）
- SQLite JDBC（嵌入式，打包进 JAR）

**产出：** 单个 `LightTickets-1.0.0.jar`

**部署步骤：**
1. 将 JAR 放入 `server/plugins/`
2. 启动服务器，自动生成 `config.yml` 和 `lang.yml` 默认值
3. 在管理面板后台注册该服务器，获取 API Key
4. 编辑 `config.yml` 填入服务器 URL 和 Key
5. 重载插件或重启服务器

**paper-plugin.yml：**

```yaml
name: LightTickets
version: 1.0.0
main: ink.neokoni.LightTickets.LightTickets
api-version: '1.21.1'
description: LightTickets Minecraft Server Plugin
authors: [neokoni]
folia-supported: true
```
