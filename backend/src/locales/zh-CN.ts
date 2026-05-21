// 后端错误消息中文本地化
// =============================

export const Errors = {
  // 通用
  Unauthorized: '未登录或登录已过期',
  Unauthorized_TokenInvalid: '无效的认证令牌',
  Unauthorized_TokenMissing: '缺少认证令牌或格式不正确',
  NotFound: '资源不存在',
  Forbidden: '权限不足',
  ValidationFailed: '参数校验失败',

  // 初始设置 (setup)
  Setup_AlreadyCompleted: '站点已完成初始化，无法重复设置',
  Setup_InvalidDbProvider: '无效的数据库类型，仅支持 sqlite 或 mysql',
  Setup_DbUrlRequired: '数据库连接地址不能为空',
  Setup_AdminInfoRequired: '管理员邮箱、密码和用户名均为必填项',
  Setup_PasswordMinLength: '管理员密码长度不能低于 6 位',
  Setup_AdminExists: '该邮箱或用户名已被使用',

  // 认证 (auth)
  Auth_EmailExists: '该邮箱已被注册',
  Auth_UsernameExists: '该用户名已被占用',
  Auth_InvalidCredentials: '邮箱或密码错误',
  Auth_RefreshTokenInvalid: '刷新令牌无效或已过期',
  Auth_InvalidLinkCode: '无效或已过期的绑定码',

  // 工单 (tickets)
  Ticket_NotFound: '工单不存在',
  Ticket_NoPermission: '无权操作此工单',

  // 附件 (attachments)
  Attachment_NotFound: '附件不存在',
  Attachment_NoFile: '请选择要上传的文件',

  // 标签 (labels)
  Label_AlreadyExists: '标签已存在',
  Label_NotFound: '标签不存在',

  // 服务器 (servers)
  Server_NameExists: '服务器名称已存在',
  Server_NotFound: '服务器不存在',

  // 权限申请 (permission)
  Permission_NotRequest: '该工单不是权限申请类型',
  Permission_NoRequestData: '该权限申请缺少必要数据',
} as const;
