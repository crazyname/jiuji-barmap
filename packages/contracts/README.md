# 共享数据与 API 契约

`schemas/` 使用 JSON Schema 2020-12，`api.v1.json` 定义 API v1 路由与请求结构。四端统一使用 `bar`、`recipe`、`post`、`api-error` 类型。

- `bar.location` 为空表示地点坐标未确认，不能使用模拟位置。
- `post` 的商业推广类型需要 `isSponsored: true` 和非空 `sponsorName`。
- 本机配方与帖子保持本地存储；未来公开内容与账号同步统一通过接口实现。

```bash
npm run contracts:check
npm run check
```

变更字段时，请同步更新 Schema、接口文档和相关测试。
