# PR-09 · 私人离线数据安全、异常恢复与账号生命周期

状态：**开发与自动化测试代码，不代表生产已部署/已安全加密。** 不开启 AUTH_API_ENABLED、无线上数据迁移、不创建正式微信账号。

## 设备安全评估

微信小程序 getStorageSync/setStorageSync 是本地应用持久化接口。由认证后的内部账户 ID 派生独立命名空间，可以避免本应用跨账户错误读取，但**不提供经验证的硬件密钥托管、静态数据加密或抗设备备份窃取的承诺**。微信 UserCryptoManager / getLatestUserKey 的用途主要是小程序与开发者后台之间的加密通信，尚不能认定为具备本场景离线/冷启动可用的独立硬件保护密钥库。相关资料：[微信小程序加密网络通道](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/security/user-encryptkey.html)、[微信 getStorageSync](https://developers.weixin.qq.com/miniprogram/dev/api/storage/sync/wx.getStorageSync.html)。需要真机验证 API 支持版本、用户密钥生命周期与密钥轮换。

**本轮没有实施设备端静态加密。** 离线队列、主镜像、恢复副本、隔离损坏副本均可能含**明文私人酒名、备注和场景**。不能把 AES 密钥和密文放到同一不受保护的存储里然后声称强安全。FNV-1a 校验用于意外字节损坏检测，不是密码学 MAC、不具备抗篡改和机密性。root/越狱设备、设备备份、共用设备仍有风险。敏感 Token 和微信 code 不写入离线镜像/日志/错误提示；退出后短期 Token 从内存卸载。

## 双副本非破坏式保存

新增 packages/sync/recoverable-cloud-storage.ts，继续使用 PR-08 主存储键 jiuji-private-cloud-v1:<编码账号 ID>，增加独立 :recovery 副本，每次写入先确认可读取恢复副本再写并确认主副本。序列化包含非密码学损坏校验与单调代次。只有**两槽写入和回读确认成功**，本机 UI 才可报告保存成功；quota 或读写失败抛 STORAGE 并熔断新写入及同步，避免状态假成功。

断电或主槽写入失败时，重启/明确恢复操作优先读取代次较高、通过校验的副本。损坏的单槽在手动恢复时先拷贝原始损坏字节到 :quarantine 并验证，随后才能修复；隔离位已占用或新写失败时停止并保留原字节。双槽同时损坏、未知 schema、账号归属不符或无法读时阻止自动覆盖和清理，等待独立人工工具。PR-08 旧单镜像 schema=1 可直接读取，**仅在下次成功写入时**进入双副本格式，不主动删除旧收藏、浏览历史、配方及草稿。多份明文副本额外占用存储空间，发布前必须审查占用策略和私密性。

## ACK 丢失的恢复算法

CloudJournalCoordinator 在执行 HTTP 前先持久化 syncing + uncertain。重启后恢复 pending，但保持 uncertain。CREATE 保持稳定 clientMutationId 进行服务器幂等重试。对可能已提交的 UPDATE、LINK、DELETE（PR-07 expectedRevision）：**先使用当前已认证会话 GET 服务器对象**。若仍是预期 revision，可尝试继续执行；若 revision 恰好 +1 且欲修改字段与服务器一致，则确认为已提交并停止重复 PATCH/PUT；删除后查无记录则视为已执行。若内容/版本不匹配，保留本机修改和队列，交给 409 人工冲突处理，不自动覆盖服务器。服务器完成但设备本机确认存储失败，协调器停止新请求，直到用户恢复本机数据。

本机创建后马上编辑/删除、后关联新探店及探店多杯饮用，沿用 PR-08 队列依赖顺序、临时 ID 映射与服务器探店删除保留饮用事实。所有私人 API 与公共 /v1/sync、帖子、评价、投稿完全分离。并发账号切换立即卸载私有内存，延迟服务器响应不写入另一账号。Taro 适配器额外检查**发送时 accessToken 与当前 accessToken 全等**，旧会话迟到的 401 不能使同一用户新登录或另一账号被迫登出。

## 退出与数据生命周期

点击退出后**先本机退出**：立即清理内存 Access/Refresh Token、私人页面及后续同步许可，随后尝试服务器吊销。成功才显示「本机已退出，服务器已确认撤销」；网络失败显示「本机已退出，远端撤销尚未确认」。旧会话在服务端仍可能有效，这是当前风险；**不为重试持久化 Refresh Token**。用户需重新通过安全身份交换才能恢复。旧请求结果不会覆盖新登录态。

本轮不提供不可逆清理操作：所有已验证账户的未同步队列、缓存及恢复槽跨退出/冷启动保留，不把 A 的数据迁移给 B，不把匿名历史关联给新登录者。没有自动设置过期即删除，也不自动清除失败队列。日后如实现账号退出时清除设备数据、账户注销或保留期限，应先验证服务端确认状态，解释可能失去的仅本机记录，明确用户授权与可恢复/导出方式；否则不执行删除。临时多副本容量和隐私将是发布门禁项。

## UI 真实性

本机读写确认前不能称「已保存到当前设备」，云端 ACK 前不能称「已同步」。设备 STORAGE 错误：快速记录保留当前输入，展示「设备存储失败，尚未确认保存」，全局同步区展示明确恢复入口；网络错误继续保留离线队列、允许重试，409 须用户选择。未认证显示安全锁定。品牌色仍为 #82442F，A「城市极简」布局不变。

## 测试与发布门禁

GitHub CI 执行 npm run check、test:journal、test:quick-ui、test:journal-views、test:auth、test:backend、test:cloud、test:cloud-ui、test:hardening、migration:status、严格 TypeScript、微信生产 build:weapp 及 Wrangler deploy dry-run。新测试实跑 CloudJournalCoordinator、AuthService、可注入本机存储和模拟异常；旧跨设备测试仍直接操作 PR-07 HTTP/SQLite。自动化测试**不等于**真实 Cloudflare D1、真实微信合法域名、真机 Root/备份及真机离线安全验收。

**PR-10 建议依赖（此 PR 不开发）**：经审计的静态加密与安全密钥存储方案、跨设备密钥恢复/吊销/轮换；真机存储 quota/断电/数据恢复验证；真实微信 AppID、HTTPS 域名及独立 Cloudflare D1 部署审批；WAF/日志隐私评估；服务端确认吊销失败策略和 Refresh Token 无持久化条件下的安全保障；用户明确确认后的设备清除、导出和匿名旧数据迁移；增量/tombstone 水位、图片保护与跨设备冲突流程。上述门禁完成前不得开启生产认证。
