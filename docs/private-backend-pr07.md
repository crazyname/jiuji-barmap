# PR-07 · 私人认证及日记后端（部署前基础）

**状态：代码与自动化本地 SQLite 集成测试，不代表线上服务已部署。** 新服务位于 \`apps/private-api\`，使用 Cloudflare Workers + D1。仓库中此前不存在可信认证后端源码；ChatGPT Sites 已记录的 \`/v1/sync\` 和设备测试令牌属于独立系统，**无法复用 Sites 的管理员身份或现有 D1 资源**。本服务不代理、不改写原有 Sites 公共数据集，所有新表均由独立迁移创建。小程序 \`apps/wechat/src/config/auth.ts\` 中的 \`AUTH_API_ENABLED=false\`、空 URL **原样保留**。

## 目录与服务配置

- \`src/index.mjs\`：Cloudflare Workers Fetch 处理器、固定路由及安全错误边界
- \`src/auth.mjs\`：服务端 code2Session、账户映射、可撤销短期会话、refresh 轮换
- \`src/private.mjs\`：饮用 / 探店 CRUD、关联、幂等写入、乐观锁与按时间读取
- \`src/common.mjs\`：严格请求解析、字段/长度/日期检查、哈希与安全错误
- \`migrations/0001_private_foundation.sql\`：独立 D1 表、索引、唯一约束及跨用户关联约束
- \`tests/backend.test.mjs\`：直接调用生产 HTTP Worker 入口，在 Node 22 的实际 SQLite 上运行 D1 兼容异步语句 / 事务适配（**真实 SQL 执行，非模拟的 Map 数据库**）。Worker 打包还应单独经 Wrangler 校验。

### 独立部署步骤（需要 Cloudflare 管理员权限）

1. 为私人服务创建**专用** D1 资源，禁止直接填写 Sites 现有数据库 ID。运行 \`cd apps/private-api && npm install && npx wrangler login && npx wrangler d1 create jiuji-private\`。
2. 将 Cloudflare 返回的 D1 UUID 手工放进 \`wrangler.jsonc\` 的 \`database_id\`，绑定变量名须仍为 \`DB\`。这个公开 UUID 不是数据库访问密钥；源仓库当前提交的是**无效占位符**，没有任何真实数据库资源。
3. 本地先执行 \`npm run db:local\`、\`npm test\`、\`npm run deploy:check\`。之后由授权运维人员执行 \`npm run db:remote\` 并确认无业务数据表被修改，最后 \`npm run deploy\`。迁移由 Wrangler 记录版本；重复运行不会覆盖公共 \`bars/recipes/posts/favorites\`。
4. 在 **Cloudflare Worker Secret**（例如 \`npx wrangler secret put WECHAT_APP_ID\`，另两项同理）配置 \`WECHAT_APP_ID\`、\`WECHAT_APP_SECRET\`、\`SUBJECT_PEPPER\`。后两项必须为独立、高熵的服务端秘密：\`SUBJECT_PEPPER\` 至少 32 字符；生产代码禁止演示凭据。禁止在 GitHub、Wrangler \`vars\`、终端日志、客户端源码、审查评论存放真实 AppSecret。管理者应通过安全管理器注入秘密。
5. 部署前单独核对密钥、Cloudflare Workers routes/custom domain、合法小程序 request 域名、HTTPS、WeChat AppID 类型、D1 权限与访问日志脱敏。**本 PR 没有执行任何真实账户部署、密钥注入或手机联调，不能修改客户端的 AUTH 开关**。
6. Secret 缺失时 \`POST /v1/auth/wechat/exchange\`、\`POST /v1/auth/refresh\` 返回 HTTP 503 / \`AUTH_BACKEND_UNAVAILABLE\`；不回退为测试用户。真实请求 \`code2Session\` 只从 Worker 发往微信官方 HTTPS 接口；它携带的 AppSecret/code URL 从不写入日志。

### 兼容 PR-06 的认证契约

- \`POST /v1/auth/wechat/exchange\`：\`{"code":"once-only-wechat-code"}\` → HTTP 200 \`{"accessToken":"opaque-hex","refreshToken":"opaque-hex","accessExpiresAt":"ISO","sessionId":"uuid"}\`。
- \`GET /v1/me\`：\`Authorization: Bearer <accessToken>\` → \`{"account":{"id":"internal-user-id","displayName":null,"bindings":{"wechat":true,"phone":false,"providers":["wechat"]}},"session":{"id":"uuid","expiresAt":"ISO","revoked":false}}\`。请求方不能指定账号 ID。
- \`POST /v1/auth/refresh\`：\`{"refreshToken":"old-opaque"}\` → 相同格式的新令牌对与相同 sessionId。旧刷新凭证被记录为已用，重放时拒绝并吊销关联会话（包括其最新 access token）；短期 access token 15 分钟、会话及 refresh 有最大 30 天上限；冷启动令牌恢复仍由 PR-06 客户端的内存策略决定。
- `POST /v1/auth/logout`：Bearer **当前会话最后签发的 Access** + `{"refreshToken":"current-opaque"}` → `{"ok":true}`。即使 Access 已超过 15 分钟，只要 Refresh 仍有效、两者哈希对应同一未吊销会话，仍能原子撤销；已轮换的旧 Access 与新 Refresh 不允许混用。仅凭 Refresh 或其他用户的 Access 不可注销。离线无法联系服务器时，PR-06 客户端仍只能本机退出；服务端撤销需另行重试/确认。
- 微信 code 防重使用仅服务器知道的 HMAC 摘要与唯一索引；openid 不作为公开用户 ID，也不以明文保存在 D1：\`account_bindings.external_subject_hash\` 存经 pepper HMAC 生成的私有标识。任何 code2Session 返回的 \`session_key\` 仅用于服务器完成验证，不缓存、不下发。
- 登录与刷新都以 Cloudflare 注入的 `cf-connecting-ip` 为来源（数据库只存哈希），按来源/分钟分别限制 10 次与 15 次；不同伪造 Refresh Token 不能产生新的限流身份；不信任 X-Forwarded-For，缺少边缘 IP 时使用共享 unknown 桶。上线仍需 WAF、分布式滥用告警。
- Wrangler 配置每天 03:00 UTC Cron Trigger：清理两小时前的限流桶、一天前的微信 code 重放哈希、过期超过一天的会话（并级联清理其 Refresh 重放哈希）。有效会话内保留完整防重放记录。生产部署时必须启用、监测 Cron 执行。

## 私人数据 API（均先验证 Access Token）

请求与响应始终为 JSON，响应含 \`Cache-Control: no-store\`。所有 create body 必须带 8–128 字符的 \`clientMutationId\`；账户身份只能来自 Bearer token 指向的**实时、未撤销、未过期的服务器会话**。任何 body \`ownerUserId\`、\`visibility\`、公共发布字段直接按非法输入拒绝。

| Method | 路径 | 请求内容 | 响应 |
| --- | --- | --- | --- |
| GET | \`/v1/private/drinks?limit=50&before=<ISO>&context=bar&visitSessionId=<id>\` | 可选筛选，每页 1–100 | \`{"entries":[DrinkEntry...]}\`，按时间倒序 |
| POST | \`/v1/private/drinks\` | \`{clientMutationId,drinkLabel,consumedAt,contextKind, ...optional}\` | 201 \`{"entry":DrinkEntry}\`；相同 mutation 重试 200 返回同 ID |
| GET | \`/v1/private/drinks/:id\` | 无 | 200 \`{"entry":DrinkEntry}\` |
| PATCH | \`/v1/private/drinks/:id\` | \`{"expectedRevision":1,"changes":{"note":"...","personalRating":4.5}}\` | 200 \`{"entry":DrinkEntry}\` |
| DELETE | \`/v1/private/drinks/:id\` | \`{"expectedRevision":1}\` | 200 \`{"ok":true}\` |
| PUT | \`/v1/private/drinks/:id/visit\` | \`{"expectedRevision":1,"visitSessionId":"visit-id"}\`，置 null 解除 | 200 \`{"entry":DrinkEntry}\` |
| GET | \`/v1/private/visits?limit=50&before=<ISO>\` | 可选筛选 | 200 \`{"visits":[VisitSession...]}\` |
| POST | \`/v1/private/visits\` | \`{clientMutationId,occurredAt, ...optional}\` | 201 \`{"visit":VisitSession}\` |
| GET/PATCH/DELETE | \`/v1/private/visits/:id\` | 与饮用同类的版本约束 | 200 返回 \`visit\` 或 \`ok\` |
| GET | \`/v1/private/visits/:id/drinks\` | 无 | 200 \`{"entries":[DrinkEntry...]}\`，仅所属用户 |

字段遵从 PR-03 \`packages/core/src/models.ts\`：酒名、可选 cocktail/recipe ID、三种 contextKind、photoRefs、个人评分、场景 JSON、私人备注、关联 visit、createdAt、updatedAt、revision 与默认 \`visibility=private\`。服务器只保存可选附件引用，不含图片上传；手机号、短信与账号合并不属于本 PR。

## 事务、隐私与异常语义

- 所有按 ID 查询、更新、删除的 SQL 包含 \`owner_user_id=?\`；Drink→Visit 的 \`(owner_user_id,visit_session_id)\` 复合外键与 D1 CHECK 约束阻止跨用户关联；找不到他人记录返回 404，不透露其是否存在。
- 编辑与删除使用 \`UPDATE/DELETE ... WHERE revision=?\`、验证 \`changes=1\`；过期版本返回 409 / \`CONFLICT\`。原子创建用 \`D1.batch([INSERT record, INSERT mutation_idempotency])\`；用户/ mutation_id 唯一，重试同内容返回原条目，重试不同内容返回 409。若旧记录已删除，幂等重试返回 \`REPLAY_DELETED\` 而非重新创建。
- 删除 Visit 使用同一 D1.batch 事务**先**把该 owner 对应的 DrinkEntry.visitSessionId 设为空、递增相关记录 revision，**再**按 expectedRevision 删除 Visit；DrinkEntry 事实保留。D1 FOREIGN KEY 禁止删除未解除关联的 Visit。
- 成功写入**绝不**碰 \`/v1/sync\`、公共 \`posts\` 或正式评价表；Worker 对 \`/v1/sync\` 明确 404，原 Sites 公开 API 完全隔离。
- 401：\`AUTH_UNAUTHORIZED\`、\`AUTH_CODE_INVALID\`、\`AUTH_REVOKED\`、\`AUTH_EXPIRED\`；409：\`CONFLICT\` 或 \`REPLAY_DELETED\`；400：\`INVALID_INPUT\`；413：\`PAYLOAD_TOO_LARGE\`；429：\`AUTH_RATE_LIMITED\`；503：\`AUTH_BACKEND_UNAVAILABLE\`。未知内部异常统一 500 / \`INTERNAL_ERROR\`，**不记录 token/code/secret/个人酒文档正文**。

## PR-08（本轮明确不做）

客户端需在后续独立 PR 将私人日记 Repository 与以上 API 接线：登录确认以后分账户获取服务端状态、处理增量分页 / resume 游标、离线操作队列持久化与重试、局部版本冲突 UI、登出状态清空、私有附件上传和安全 URL；跨设备历史迁移必须要求明确用户授权。当前 GET 时间列表的 \`before\` 是时间排除式筛选，时间相同时无法构成无遗漏的游标分页，PR-08 在同步批量使用前应升级为 \`(time,id)\` 复合游标或等价稳定分页。没有任何私有 API 被加入旧 Sites 公共 \`/v1/sync\`。

## 手动发布门禁

待 Cloudflare 账号授权、独立 D1 ID、微信 AppID/Secret、WAF/隐私审核、真机认证与不同设备交叉校验；GitHub CI 只能证明本地 SQLite 数据路径和 Worker 构建，不能证明真实线上已经提供可用服务。


## PR-08 复合游标补充

列表接口新增 `beforeId`（须和有效 ISO `before` 同时提供）；排序固定时间 DESC、ID ASC。响应增加 `nextCursor: {before,beforeId} | null`；客户端连续使用它读取所有页面，同一时间戳超过 100 条不会遗漏或重复。原 `before` 单参保持兼容但不适合作为完整历史同步的稳定游标。查询仍先从有效服务器会话确定 owner。已加入 216 条同时间饮用和 124 条同时间探店的真实 SQLite HTTP 分页测试。
