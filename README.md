
<center>
<img src="banner.png" alt="banner" style="width: 25em"></img>

[![License: MIT](https://img.shields.io/github/license/neokoni/LightTickets)](LICENSE)
[![Dev Build Artifacts](https://github.com/neokoni/LightTickets/actions/workflows/dev-build.yml/badge.svg)](https://github.com/neokoni/LightTickets/actions/workflows/dev-build.yml)

</center>
LightTickets 是一个自托管的面向 Minecraft 服务器管理的议题/工单平台，支持网页管理以及Paper/Folia, Velocity插件端连接交互使用

## 功能

- 议题管理： 基于模板创建，可设置标签，负责人，可见性等参数
- Minecraft服务器集成： 通过API Key以及服务端/代理端插件与LightTickets交互
- 账号认证： 支持用户账户注册，找回密码，邮件发送以及外部单点登录功能
- 访问限制： 支持设置不同操作类型的频率限制，自带CloudFlare Turnstil支持
- 自定义站点信息： 支持自定义站点标题, favicon, 以及logo等站点信息
- 文件存储： 支持本地存储与连接S3兼容存储
- 邮件提醒： 支持连接SMTP服务，发送议题状态变更以及新议题分配提醒
- 搜索过滤： 支持`from`, `type`, `status`等语句通过搜索栏过滤议题

## 结构

```text
LightTickets/
    ├─ backend/            # 后端服务
    ├─ frontend/           # Web 前端
    ├─ plugin/             # Minecraft 插件集成
    ├─ docs/               # 部分临时文档约束，非正式参考
    ├─ scripts/            # 部分脚本
    └─ docker-compose.yml  # 示例docker compose文件
```

## 环境要求

- Node.js 24 与 npm
- Java 21 及以上（Minecraft 插件）

## 本地开发

安装全部依赖：

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

启动服务

```bash
npm run dev
```

启动后访问 `http://localhost:23310`，首次运行需要进行初始化。

后端 API 默认监听 `http://localhost:23320`

仅启动前端/后端：

```bash
npm run dev:server   # 仅后端
npm run dev:web      # 仅前端
```
## 配置

`config.yml` 只保存平台基础设置，位于后端数据目录。字段定义见 `backend/src/config.default.yml`。

LightTickets的设置存储在数据库中

| 键                          | 说明                                     |
| --------------------------- | --------------------------------------- |
| `server.port`               | 后端监听端口，默认 `23320`                 |
| `server.corsOrigins`        | 允许的跨域来源（数组）                      |
| `server.trustedProxyIps`    | 可信反向代理 IP （数组），流空表示不信任转发头 |
| `database.provider`         | `sqlite` 或 `mysql`；缺失时进将入初始化模式  |
| `database.mysql.*`          | mysql数据库信息，`host` / `username` / `database` 必填，`port` 默认 `3306`|
| `security.jwtSecret`        | 访问令牌签名密钥                           |
| `security.jwtRefreshSecret` | 刷新令牌签名密钥                           |
| `security.jwtUnsubscribeSecret` | 邮件退订 JWT 密钥，旧版升级时自动生成     |
| `security.legacyJwtCutoff`  | 旧 JWT 格式兼容截止时间戳                   |
| `security.externalEncryptionKey` | 外部登录 Provider 密钥加密主密钥       |



## 快速开始

### Docker Compose

```bash
docker compose up -d
```

Compose 启动 `server` 与 `web` 两个容器：仅 `web` 发布到主机端口 `23310`，`server` 在内部网络以 `23320` 提供服务。

SQLite 数据、配置、模板、语言资源与本地附件保存在`./data`目录。端口、镜像与数据目录的调整方式参考文档。

### 手动运行

后端：

```bash
cd backend
npm install
npm run build
npm start
```

前端：

```bash
cd frontend
npm install
LT_WEB_API_URL=/api npm run build
LT_WEB_HOST=0.0.0.0 LT_WEB_PORT=23310 LT_SERVER_URL=http://127.0.0.1:23320 npm start
```

## 服务端插件

在 `plugin` 目录构建插件：

```bash
cd plugin
./gradlew build
```

产物为 `plugin/paper/build/libs/*-all.jar` 与 `plugin/velocity/build/libs/*-all.jar`

插件 `config.yml` 中的 `baseUrl` 填写LightTickets公开地址（如 `https://tickets.example.com`）

`serverKey` 填入LightTickets管理员后台生成的服务器密钥

命令（前缀为 `/lit` 或 `/lighttickets`）：

| 命令                                | 说明               |
| ----------------------------------- | ------------------ |
| `/lit bind` / `/lit unbind`         | 绑定或解绑账号     |
| `/lit account`                      | 查看账号信息       |
| `/lit register`                     | 获取网页注册链接   |
| `/lit ticket create [type]`         | 创建议题           |
| `/lit ticket list [page]`           | 查看议题列表       |
| `/lit ticket info <id>`             | 查看议题详情       |
| `/lit ticket comment <id>`          | 评论议题           |
| `/lit ticket status <id> [status]`  | 修改议题状态       |
| `/lit ticket search <query>`        | 搜索议题           |
| `/lit reload` / `/lit status`       | 重载配置或查看状态 |

## 文档
详情请查看 [LightTickets文档](https://projects.neokoni.ink/lighttickets/docs/zh-cn)

## 许可证

[MIT](LICENSE)，Copyright (c) 2026 Neokoni。
