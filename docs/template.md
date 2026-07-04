# 议题模板配置说明

## 模板文件结构

模板以 YAML 文件形式存储在 `backend/templates/` 目录下，文件名（不含 `.yml`）即为模板标识符（key）。

```yaml
name: "显示名称"            # 必填，创建议题时展示的模板名
description: "模板描述"      # 必填，模板用途说明
title_prefix: "[前缀] "     # 可选，自动拼接到议题标题前
labels: []                  # 可选，关联标签 ID 列表
body: []                    # 必填，表单字段定义数组
completion_hooks: []        # 可选，状态变更时触发的钩子
```

## body 字段类型

### markdown — 静态说明文本

纯展示用，不参与表单输入，直接渲染为 Markdown 内容。

```yaml
- type: markdown
  attributes:
    value: |
      感谢你反馈问题！请尽量提供**稳定复现的步骤**。
```

### input — 单行文本输入

```yaml
- type: input
  id: version
  validations:
    required: true
  attributes:
    label: "游戏版本"
    placeholder: "如 1.21.1"
```

### textarea — 多行文本输入

支持拖拽/粘贴上传 Markdown 图片。

```yaml
- type: textarea
  id: description
  validations:
    required: true
  attributes:
    label: "问题描述"
    placeholder: "清晰描述你遇到的问题..."
```

### checkboxes — 多选复选框

选项值以逗号分隔存储。

```yaml
- type: checkboxes
  id: checklist
  attributes:
    label: "提交前确认"
    options:
      - "我确认此问题尚未被反馈"
      - "我已阅读常见问题"
```

也支持带 `required` 标记的选项对象形式（仅影响前端显示）：

```yaml
- type: checkboxes
  id: checklist
  attributes:
    label: "提交前确认"
    options:
      - label: "我确认此问题尚未被反馈"
        required: true
```

### dropdown — 下拉单选

```yaml
- type: dropdown
  id: severity
  validations:
    required: true
  attributes:
    label: "严重程度"
    options:
      - "低 - 仅影响外观"
      - "中 - 功能受损但有替代方案"
      - "高 - 严重影响游戏体验"
      - "紧急 - 服务器崩溃/数据丢失"
```

## 字段属性一览

| 属性 | 适用类型 | 说明 |
|------|---------|------|
| `id` | input / textarea / checkboxes / dropdown | 字段标识符，用于 `formData` 存储和 `{field.<id>}` 占位符 |
| `validations.required` | input / textarea / checkboxes / dropdown | 是否必填（前端校验） |
| `attributes.label` | input / textarea / checkboxes / dropdown | 字段标签 |
| `attributes.description` | input / textarea / dropdown | 字段说明文字 |
| `attributes.placeholder` | input / textarea | 输入框占位提示 |
| `attributes.value` | markdown | 静态 Markdown 内容 |
| `attributes.options` | checkboxes / dropdown | 选项列表 |

## completion_hooks — 状态变更钩子

当议题状态变更为指定值时，后端自动解析占位符并通过 WebSocket 下发给 Minecraft 插件执行。

### 钩子结构

```yaml
completion_hooks:
  - event: closed
    type: minimessage
    messages:
      - "<color:#ffffff>你的议题 <color:#96bfff>#{ticket_id}</color> 已关闭</color>"
  - event: closed
    type: command
    commands:
      - "tell {player_name} 议题 #{ticket_id} 已关闭"
```

### 可用事件（event）

| 事件值 | 触发时机 |
|--------|---------|
| `closed` | 议题状态变更为 `closed` |
| `invalid` | 议题状态变更为 `invalid` |

### 钩子类型（type）

| 类型 | 说明 | 内容字段 |
|------|------|---------|
| `command` | 以服务器控制台权限执行 Minecraft 命令 | `commands` |
| `minimessage` | 向议题作者发送 MiniMessage 格式消息 | `messages` 或 `message` |

`type` 可省略，省略时自动推断：有 `commands` 字段则为 `command`，否则为 `minimessage`。

### 可用占位符变量

在 `commands` 和 `messages` 中可用的占位符，后端在发送前完成替换：

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{ticket_id}` | 议题 ID | `42` |
| `{ticket_title}` | 议题标题 | `[Bug] 无法登录` |
| `{player_name}` | 议题作者的 Minecraft 用户名 | `Notch` |
| `{player_uuid}` | 议题作者的 Minecraft UUID | `069a79f4-44e9-4726-a5be-fca90e38aaf5` |
| `{field.<id>}` | 表单中指定字段的值 | `{field.version}` → `1.21.1` |

字段值取自议题创建时提交的 `formData`，字段不存在或为空时替换为空字符串。

### 完整示例

```yaml
name: "权限申请"
description: "申请权限组或特殊节点"
title_prefix: "[权限] "
body:
  - type: textarea
    id: reason
    validations:
      required: true
    attributes:
      label: 申请理由
  - type: input
    id: permission
    validations:
      required: false
    attributes:
      label: 权限节点（选填）
      placeholder: 如 essentials.fly
  - type: dropdown
    id: version
    attributes:
      label: Version
      options:
        - 1.0.2 (Default)
        - 1.0.3 (Edge)
    validations:
      required: true
completion_hooks:
  - event: closed
    type: minimessage
    messages:
      - <color:#ffffff>你的权限申请 </color><color:#96bfff>#{ticket_id}</color><color:#ffffff> 已通过</color>
  - event: invalid
    type: minimessage
    messages:
      - <color:#ffffff>你的权限申请 </color><color:#96bfff>#{ticket_id}</color><color:#ff8181> 已被拒绝</color>
```

## 渲染为 Markdown 正文的规则

议题创建时 `body` 字段按以下规则渲染为 Markdown 正文存储到数据库：

| 字段类型 | 渲染格式 |
|---------|---------|
| `markdown` | 原样输出 `value` 内容 |
| `input` | `**标签:** 值` |
| `textarea` | `**标签:**` 后换行两行再输出值 |
| `checkboxes` | 每个选中项输出 `- [x] 选项文本` |
| `dropdown` | `**标签:** 选中值` |

各字段之间以 `---` 分隔。若所有字段均为空则输出 `No content provided`。

## 管理后台编辑

管理后台的「模板管理」页面中，`body` 和 `completion_hooks` 字段以 YAML 格式编辑，提交时自动校验并转换为 JSON 存入数据库，同时同步写回 `backend/templates/<name>.yml` 文件。
