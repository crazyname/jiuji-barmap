# 酒迹 · 跨端同步协议 v1

服务端现已按部署方验收报告发布在 ChatGPT Sites（原 D1 / R2）。API Base URL 为 `https://jiuji-test-console.equal-genet-1707.chatgpt.site`。部署报告：`GET /v1/health` 为 HTTP 200，匿名 `GET /v1/sync` 返回 31 家酒吧、2 份配方、3 条帖子；请求无法从当前执行环境独立复测。

## 工作流

- 打开应用 / 恢复前台：`GET /v1/sync`，更新本机服务器快照。
- 用户发布或修改：立即写入本机待发送队列；有有效登录会话且联网时，`POST /v1/sync/mutations`，再重新 GET。
- 断网、401、403 或请求失败：保留待发送队列，下次重试。
- `baseVersion` 防止不同设备静默覆盖；服务端返回 `conflicts` 时客户端停止自动重试该条记录，需用户解决。
- `mutationId` 实现服务端幂等，避免超时重发造成重复帖子。每次写入后服务端更新记录版本和数据集 revision。
- 首次采用全量快照；数据量增长后再实现增量 `since` / 游标分页和图片 R2 上传。

查看 [机器协议](../packages/sync/protocol.json)。当前设计支持 `bars`、`recipes`、`posts`、`favorites`，不将测试用户及审计记录下发客户端。

**访问规则**：公开端只读取已公开的配方、帖子、酒吧；收藏和未发布内容按已认证用户隔离。写入必须由服务器验证登录令牌；酒吧位置修改、商业推广需要额外审核权限。不得把 Sites 控制台的所有者身份、管理密钥写到小程序里。

## 网站端 API

站点报告已部署 `GET /v1/health`、`GET /v1/sync`、`POST /v1/sync/mutations`。匿名只读、登录后的短期设备令牌及后台 401 隔离已有服务端验收；**线上令牌写入及真机仍需验证**。令牌由所有者在控制台「设备令牌」签发，有效期 5–120 分钟。

如果小程序实际访问得到登录 HTML、重定向或非 JSON，应视为 API 不可用，不提交数据。

## 本机双设备模拟

`npm test` 包含两个独立客户端的同步测试：A 创建帖文，发送后 B 拉取；A 离线排队；两端冲突不会被悄悄覆盖。

## 四端接入

`packages/sync/client.js` 是不依赖 React、Taro 或 Expo 的核心逻辑。`npm run sync:generate` 更新 `apps/wechat/src/services/sync-core.js` 与 `apps/mobile/src/services/sync-core.js`。各端只实现 HTTPS 请求、设备存储与用户登录令牌适配。

## 第一步落地清单

1. 网站侧已发布本协议接口；从两台设备独立完成匿名读和带令牌写入验收。
2. 管理员保持原有登录权限，另外提供客户端使用的用户身份验证和独立授权；不得复用管理后台会话。
3. 微信与 Expo 测试端已配置公开 API 地址；微信公众平台需将 `jiuji-test-console.equal-genet-1707.chatgpt.site` 添加为 request 合法域名后真机验证。
4. 在微信端登录获得经过服务器签名的用户令牌后执行同步；没有有效令牌时本地修改保持排队。
5. 两台测试设备先验证 A 端发布 → D1 持久化 → B 端刷新；再验证断网与并发编辑。

## 微信 Taro 客户端接入

`apps/wechat/src/services/sync.ts` 复用共享引擎。微信地图、调酒、社区及我的页进入前台时尝试同步；提交酒谱/帖子会加入本机离线队列，用户必须通过未来的登录流程获得服务端令牌才会自动上传。

测试模式已配置 HTTPS API 地址，匿名读取无需设备令牌；「我的」可临时输入控制台签发的设备令牌以进行私人数据写入。令牌仅驻留在应用内存中，不写入 Git 或设备持久存储。断开设备会话前先确保待发送队列为零。正式发布前关闭 `ENABLE_DEVICE_TOKEN_TESTING`，替换为正式登录流程。

## React Native / Expo 适配

`apps/mobile/src/services/sync.ts` 用本机 AsyncStorage 持久化同步队列，HTTPS `fetch` 读取公共数据。测试令牌只保留在运行内存，可从移动端「我的」临时录入；正式用户认证之后替换。`apps/mobile/App.tsx` 现可读取缓存并创建私人草稿队列。鸿蒙移植须再验收存储、网络与地图等原生模块。

调酒与社区中标为“保存”的内容默认是 **private 草稿**，同一个用户的其他登录设备可以下载，但不会自动公开给其他账号。

## 公共 API 实际连通测试

`npm run sites:probe` 只请求 `/v1/health` 和匿名 `/v1/sync`，校验 HTTP 200、JSON Content-Type、`revision`、四类集合和匿名隐私过滤。GitHub Actions 的 `Sites Public API Smoke` 工作流也会运行这个检查；它不会发送设备令牌或进行任何写操作。
