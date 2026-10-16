# 酒迹 · 跨端同步协议 v1

服务端暂定部署在 Sites 的服务端路由，网站使用现有 D1 / R2。**接口尚未在 Sites 部署**，当前由共享引擎和本地模拟器先验证。

## 工作流

- 打开应用 / 恢复前台：`GET /v1/sync`，更新本机服务器快照。
- 用户发布或修改：立即写入本机待发送队列；有有效登录会话且联网时，`POST /v1/sync/mutations`，再重新 GET。
- 断网、401、403 或请求失败：保留待发送队列，下次重试。
- `baseVersion` 防止不同设备静默覆盖；服务端返回 `conflicts` 时客户端停止自动重试该条记录，需用户解决。
- `mutationId` 实现服务端幂等，避免超时重发造成重复帖子。每次写入后服务端更新记录版本和数据集 revision。
- 首次采用全量快照；数据量增长后再实现增量 `since` / 游标分页和图片 R2 上传。

查看 [机器协议](../packages/sync/protocol.json)。当前设计支持 `bars`、`recipes`、`posts`、`favorites`，不将测试用户及审计记录下发客户端。

**访问规则**：公开端只读取已公开的配方、帖子、酒吧；收藏和未发布内容按已认证用户隔离。写入必须由服务器验证登录令牌；酒吧位置修改、商业推广需要额外审核权限。不得把 Sites 控制台的所有者身份、管理密钥写到小程序里。

## 网站端需要增加的路由

在已经发布的 `https://jiuji-test-console.equal-genet-1707.chatgpt.site` 中新增上述三个路由，共用现有 D1 数据表，不另建不相关的数据副本。Sites 控制台的登录不自动构成微信、iOS 和 Android 客户端登录。服务端必须为外部客户端提供可验证的用户令牌或对接身份提供方。

如果 Sites 平台当前不允许外部客户端直接访问这些 API，应将相同协议部署在独立的 HTTPS API 层，并连接到允许授权访问的数据服务；不要公开数据库凭证。

## 本机双设备模拟

`npm test` 包含两个独立客户端的同步测试：A 创建帖文，发送后 B 拉取；A 离线排队；两端冲突不会被悄悄覆盖。

## 四端接入

`packages/sync/client.js` 是不依赖 React、Taro 或 Expo 的核心逻辑。`npm run sync:generate` 更新 `apps/wechat/src/services/sync-core.js` 与 `apps/mobile/src/services/sync-core.js`。各端只实现 HTTPS 请求、设备存储与用户登录令牌适配。

## 第一步落地清单

1. 将 `packages/sync/protocol.json` 交给 Sites 管理站的 Work 开发会话，实现真实的 D1 读写接口。
2. 管理员保持原有登录权限，另外提供客户端使用的用户身份验证和独立授权；不得复用管理后台会话。
3. 微信端将 `apps/wechat/src/config/sync.ts` 中的 `SYNC_ENABLED` 打开、填写经过真机验证的 `API_BASE_URL`，并在微信公众平台添加 request 合法域名。
4. 在微信端登录获得经过服务器签名的用户令牌后执行同步；没有有效令牌时本地修改保持排队。
5. 两台测试设备先验证 A 端发布 → D1 持久化 → B 端刷新；再验证断网与并发编辑。

## 微信 Taro 客户端接入

`apps/wechat/src/services/sync.ts` 复用共享引擎。微信地图、调酒、社区及我的页进入前台时尝试同步；提交酒谱/帖子会加入本机离线队列，用户必须通过未来的登录流程获得服务端令牌才会自动上传。

配置 `apps/wechat/src/config/sync.ts` 中的 HTTPS API 根地址及开关；当前默认关闭，因为尚未验证网站公开路由。没有服务端 API 时保留现有 `sites-test.json` 演示内容。

## React Native / Expo 适配

`apps/mobile/src/services/sync.ts` 用本机 AsyncStorage 持久化同步队列，HTTPS `fetch` 用于 API，请求令牌需由真正的客户端登录流程传入。`apps/mobile/App.tsx` 现可读取缓存并创建私人草稿队列。鸿蒙移植须再验收存储、网络与地图等原生模块。

调酒与社区中标为“保存”的内容默认是 **private 草稿**，同一个用户的其他登录设备可以下载，但不会自动公开给其他账号。
