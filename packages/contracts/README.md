# 共享数据契约

`schemas/` 是 JSON Schema 2020-12，`api.v1.json` 定义 API v1 的草案。微信 Taro 和 React Native 使用相同的 `bar`、`recipe`、`post` 数据含义。

- `bar.location: null` 表示坐标尚未核实。
- 商业推广类型 `promo` 须填写 `sponsorName` 并明确 `isSponsored: true`。
- 业务数据来自 `miniprogram/data/bars.js`，通过 `npm run data:sync` 同步两个 React 客户端。

运行 `npm run contracts:check` 验证字段规则。
