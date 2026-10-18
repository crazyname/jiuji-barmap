# PR-08 · 私人云同步与离线队列基础

状态：独立的客户端协调层、复合游标和集成测试；Cloudflare 真实云端、微信真机仍未部署/联调。PR-06 AUTH_API_ENABLED=false 保持不变。

## 数据流及代码边界

- packages/core/src/journal.ts：PR-03 已有同步本地仓储，保留其旧数据、字段和存储键，不直接变成网络仓储。
- packages/sync/private-cloud.ts：新异步 CloudJournalCoordinator，负责账户命名空间内持久化的本机镜像、待提交操作队列、服务端 ID 映射、失败和冲突状态。CloudRemote 所有 HTTP 调用均是异步的；localRepository() 仅用于兼容已有 UI 的同步读取/本机暂存，不能表示服务器确认。
- apps/wechat/src/services/private-cloud.ts：唯一私人 Taro HTTP 适配器，从 AuthService 当前有效、经过 /v1/me 验证的会话取得 Access Token。每次请求检查账户；401/403 立即作废客户端身份。绝不使用 Sites 设备令牌。
- apps/private-api/src/private.mjs：GET drinks/visits 现在以时间 DESC、ID ASC 排序；beforeId 只能与合法 before 时间一起出现。nextCursor 对象含 before 和 beforeId；旧客户端仅传 before 仍可工作，但完整同步必须使用复合游标。SQL 仍按服务端当前会话 owner 隔离。
- 原有五个个人回顾/详情页面与 PR-04 两个快速表单已用本机镜像和状态组件连接。提示区分本机待同步、正在同步、已同步、失败、冲突、未认证。没有自动公开帖子/评分。

## 离线操作及安全策略

创建 DrinkEntry/VisitSession 时先把原始记录和稳定 clientMutationId 一起写入当前账号本机队列，再让 UI 显示“已保存到当前设备，待同步”。服务器响应成功后持久化服务端实体 ID 与临时 ID 的对应关系；依赖探店临时 ID 的三条饮用记录按顺序上传前转换关联。网络异常或响应超时均保留同一 mutationId 重试，避免重复创建。

修改、删除和手动关联继续携带 expectedRevision。收到 HTTP 409 停止自动提交并读取服务器当前实体，保留本机草稿；用户可显式保留草稿或放弃本机改动、恢复服务器版本。不得执行 last-write-wins。删除 VisitSession 后 DrinkEntry 事实不删除，由 D1 原子事务解除链接。正在请求中的实体不能被后续本机修改直接覆盖，后续变更按依赖排队。

用户存储前缀为 jiuji-private-cloud-v1:<urlencoded-internal-user-id>，每次装载/写入前要求 AuthService 当前验证身份与对应 owner 一致。登出、过期、换账号时立即卸载内存镜像、停止后续队列上传。已经提交给服务器且正在传输中的操作无法仅凭本机取消；远端撤销及弱网时间窗口需单独真机验收。匿名旧收藏、浏览历史、旧草稿不自动迁移。

**本机隐私限制：** Taro setStorageSync 是小程序存储沙箱，不提供可信端到端加密保证。当前离线队列和云端缓存镜像包含 JSON 明文私人正文；只做按账号隔离、权限门控、不记录日志、不公开导出、避免触碰其他旧数据。用户设备被 root、共享或备份泄露时仍有隐私风险。正式上线前必须独立审查加密/密钥管理、登出清理与保留政策、存储配额及设备兼容性。禁止声称本机正文已经加密。

## 服务端与后续依赖

GET /v1/private/drinks 或 /v1/private/visits 支持 limit、before、beforeId 并返回 nextCursor: { before, beforeId } | null。服务端禁止信任任何客户端 ownerUserId，新增同时间超过 100 条记录连续多页的真实 SQLite 测试。POST 带 clientMutationId，PATCH/DELETE/PUT 关联使用 expectedRevision。Worker 仍单独部署、独立授权，不暴露给公共 /v1/sync。

云端 D1 部署与迁移、微信 AppID/域名和真机认证、真正会话续期和吊销、服务器增量变更日志及删除 tombstone、端侧加密/清除、图片 R2、数据导入授权及审计均不属于 PR-08 已验证的生产能力。下一轮须独立设计与验收，不得自动开启生产认证。

## 复现检查

npm run check
npm run test:journal
npm run test:quick-ui
npm run test:journal-views
npm run test:auth
npm run test:backend
npm run test:cloud
npm run test:cloud-ui
npm run migration:status
apps/wechat/node_modules/.bin/tsc --noEmit -p tsconfig.journal.json
cd apps/wechat && npm run build:weapp
cd apps/private-api && npm run deploy:check

Cloud sync tests use real AuthService, Worker HTTP handler and Node SQLite with separate device queues and accounts. Tests and Worker dry-run bundle do not prove production cloud access.
