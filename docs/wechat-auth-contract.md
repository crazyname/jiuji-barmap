# PR-06 · 微信正式认证与私人访问控制契约（服务端待实现）

当前状态：**客户端及测试契约已实现，生产端未开启，真实微信身份验证未连通**。现有 ChatGPT Sites 测试站的 \`GET /v1/health\`、\`GET /v1/sync\`、\`POST /v1/sync/mutations\` 与短期 **管理/设备测试令牌**不是普通用户登录。仓库与现有部署报告没有声明 \`/v1/auth/wechat/exchange\`、\`/v1/auth/refresh\`、\`/v1/auth/logout\`、\`/v1/me\` 已上线。从当前执行工具也无法独立确认这些端点可用。因此 \`apps/wechat/src/config/auth.ts\` 中 \`AUTH_API_ENABLED=false\`、\`AUTH_API_BASE_URL=''\`，**严禁将假响应、控制台 owner 会话或测试令牌用于生产**。

## 账户与登录信任链

统一账号：服务端分配不可预测、稳定的 \`AuthAccount.id\`，字段 \`displayName: string|null\`、\`bindings:{wechat:boolean,phone:boolean,providers:string[]}\`。微信 openid / unionid 只允许服务端保存或内部映射，**不可作为客户端输入或公开主键**。未来微信手机号使用用户主动授权的临时 phone code，经服务端微信 API 验证；SMS 注册与账号合并必须由服务器证明双方身份，拒绝仅按手机号、昵称或客户端传入的 userId 合并。

1. 客户端执行 \`Taro.login()\` 获取一次性 code。不得打印、缓存或复用。
2. \`POST /v1/auth/wechat/exchange\` body \`{"code":"<short-lived-WeChat-code>"}\`，服务端调用微信 \`code2Session\`（AppSecret 只在服务端），校验 code 一次性、AppID、频率、异常与关联账号，建立可撤销会话。
3. 服务端返回 \`{"accessToken":"<opaque>","refreshToken":"<opaque>","accessExpiresAt":"<UTC ISO 8601>","sessionId":"<opaque>"}\`，响应 JSON，通过 HTTPS/TLS 和受信任的微信 request 域名，不得返回用户自选 ID。
4. 客户端使用 \`Authorization: Bearer <accessToken>\` 发出 \`GET /v1/me\`。服务端必须**再次**校验签名/会话表的有效性及吊销情况，响应 \`{"account":{"id":"server-account-id","displayName":null,"bindings":{"wechat":true,"phone":false,"providers":["wechat"]}},"session":{"id":"<matching-sessionId>","expiresAt":"<UTC ISO>","revoked":false}}\`。客户端必须核对 \`session.id\` 一致、有效期大于当前时间、\`revoked=false\` 才建立 \`verified\` 身份；绝不能靠解码 JWT、读本地 userId 或依据微信头像建立会话。
5. \`POST /v1/auth/refresh\` body \`{"refreshToken":"<opaque>"}\`：服务端核对会话/撤销表，轮换刷新凭证并签发相同 sessionId、同一账户的新短效 access token。客户端用新 token 再次 \`GET /v1/me\`，若账号或 sessionId 改变则全量拒绝。请求失败、401/403、吊销或账号变化即清空当前内存会话及私人页面状态。
6. \`POST /v1/auth/logout\`：Bearer access token + body \`{"refreshToken":"<opaque>"}\`；服务端在可用时撤销该 sessionId 及其刷新凭证。客户端应**先**本机安全退出，再进行网络撤销；离线退出仍不保留客户端访问权限。服务端要求短期令牌过期、刷新令牌最大有效期以及可以主动撤销，不能永久有效。
7. 所有接口成功需返回正确 HTTP 2xx JSON；预期错误码 \`AUTH_CODE_INVALID\`、\`AUTH_UNAUTHORIZED\` (401)、\`AUTH_FORBIDDEN\` (403)、\`AUTH_REVOKED\`、\`AUTH_EXPIRED\`、\`AUTH_RATE_LIMITED\` (429)、\`AUTH_BACKEND_UNAVAILABLE\` (503)。对小程序不回显服务端密钥、诊断栈或用户查询信息。

**重要限制：** PR-06 内存会话不持久化，冷启动必须重新微信登录；刷新与 /me 调用期间先卸载私人记录 UI，缺乏服务端验证不能将客户端资料当作身份。客户端缓存的本地日记依 PR-03 所属 userId 单独命名空间保存，切换账号不自动迁移历史草稿或浏览记录。客户端存储**不能代替服务端私有 API 授权**，也不构成加密保护：PR-07 的每次远程私有操作仍须服务端用 accessToken 查出 account.id，再用所有权条件查询/修改实体，绝不能信任 body.ownerUserId 或客户端本机状态。

## PR-07 接口/安全阻塞清单

- 在可信服务端完成微信 AppSecret 存放、code 交换、access / refresh token 发放轮换、短效会话表和设备撤销；强制 HTTPS、频率限制、访问日志脱敏、微信合法域名、后台端到端测试。
- 建立服务端 \`drink_entries\` / \`visit_sessions\` 对应私有 CRUD/关联 API、所有权约束、版本冲突和幂等键；不能加入现有公开 \`/v1/sync\` 数据集合；A/B 用户互访必须 403/404。
- 建立账号绑定/合并审核与用户主动授权（包括未来手机号 code）、数据导出、删除和退出时远端会话撤销。
- 图片存储需签名短效权限、私有桶、来源/权限审核与隐私元数据保护；离线排队的数据与 PR-03 仓储进行版本冲突协调，旧本机记录的归属迁移**必须明确经用户同意**。
- 增加设备端登录/刷新/退出/离线/吊销测试。服务端未就绪前不要启用 \`AUTH_API_ENABLED\`。
