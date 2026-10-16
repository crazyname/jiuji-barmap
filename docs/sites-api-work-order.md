# Sites Work 任务：让酒迹四端实时双向同步

在既有站点 **https://jiuji-test-console.equal-genet-1707.chatgpt.site** 上修改，保留现有「酒迹 · 测试数据控制台」的 D1 数据、R2 上传、城市编辑主题和管理功能。

## 要求

1. 在现有 D1 数据的基础上提供供微信小程序、iOS、Android 和 HarmonyOS 客户端使用的 HTTPS JSON API。**不要**另建一套不互通的测试数据。
2. 实现 `GET /v1/health`、`GET /v1/sync`、`POST /v1/sync/mutations`；请求和响应严格遵循 [protocol.json](https://github.com/crazyname/jiuji-barmap/blob/main/packages/sync/protocol.json) 以及 [sync.md](https://github.com/crazyname/jiuji-barmap/blob/main/docs/sync.md)。
3. `GET /v1/sync` 对未登录用户返回已公开的酒吧、公开配方与公开帖子，不返回 `testUsers`、审计信息或私人收藏。已登录用户额外返回**自己的** private 内容与收藏，不得返回其他用户内容。响应含所有四个数组、`revision` 与每条记录的 `versions`。
4. 客户端写入使用**独立的用户鉴权**，绝不向小程序提供 Sites 所有者会话、数据库凭证或管理员密钥。先提供可用于小范围设备联调的服务端签发、可撤销、短有效期测试令牌机制，并在控制台添加令牌管理入口；不得把令牌写入 Git 或前端源码。之后替换为正式的微信/移动端登录。写入按当前已认证主体判定归属和权限，不能相信客户端传来的 userId。
5. `POST /v1/sync/mutations` 每次最多 20 条，验证 JSON Schema。新建/更新/删除均用每条的 `baseVersion` 做乐观并发检查；用 `mutationId` 服务器端幂等，网络重试不能生成重复帖子。返回 `{applied:[],conflicts:[]}`，冲突时返回当前记录和当前版本，不得静默覆盖。
6. 调酒和探店的「保存草稿」默认 `visibility=private`；商业推广必须有 `isSponsored=true` 与 `sponsorName`。普通用户不能直接修改酒吧官方资料或审批商业广告。管理控制台的增删改查也应更新记录版本。
7. 网站只读 API 对小程序须可从外部 HTTPS 访问。管理后台仍必须在服务端鉴权；如需要将 Site 共享设置改成公开，应确认后台路由已经严格保护，再调整分享设置。公开路由不能被重定向到 ChatGPT 控制台登录页。
8. 增加最少两台模拟设备的验收脚本：A 创建私人配方→提交→B 以同一账号拉取；B 以其他账号不可见；断网时待发队列保留；修改冲突返回 409 类语义；管理员编辑酒吧后刷新可看到新版本；重复 mutationId 只写入一次。
9. R2 图片上传后续增加单独的已鉴权上传接口及元数据引用，暂时不把文件字节塞进同步 JSON。
10. 完成并发布后，返回实际可用的 API Base URL、`GET /v1/health` 的测试结果、只读未登录 `GET /v1/sync` 的实际响应样例、令牌获取方式及限制。若 Sites 不支持上述 API，请明确列出技术限制并停止宣称已联通，不要模拟成功。

客户端仓库为 [crazyname/jiuji-barmap](https://github.com/crazyname/jiuji-barmap)。客户端同步层与离线队列已准备好，可按返回的 API URL 配置 `apps/wechat/src/config/sync.ts` 和 `apps/mobile/src/config/sync.ts`。
