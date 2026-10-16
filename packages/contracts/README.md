# 共享数据契约（v1 草案）

四端使用统一语义：`bar`、`recipe`、`post`、`api-error`。`schemas/` 为 JSON Schema 2020-12，`api.v1.json` 为拟议的 HTTP 接口索引；目前**尚无线上 API**。

约定：

- 酒吧 `status` 是营业资料证据等级，不是“此刻开门”；`location: null` 表示未经核实，禁止编造经纬度。
- 调酒记录的材料/步骤保留原始文字供前端展示；后续可以向结构化计量升级，不直接替换现有字段。
- 社区 `promo` 帖必须具有 `isSponsored: true` 与非空 `sponsorName`。
- `visibility` 用于区分本机内容与未来云端公开内容。本机数据迁移到云端前需要明确用户同意。
- API 协议是设计稿，客户端目前不能依赖这些接口可用。正式实现前需定义登录方式、上传媒体和错误返回。

检查：`npm run contracts:check`；修改后运行 `npm run check`。
