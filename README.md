# 酒迹 · Jiuji BarMap

[![CI](https://github.com/crazyname/jiuji-barmap/actions/workflows/test.yml/badge.svg)](https://github.com/crazyname/jiuji-barmap/actions/workflows/test.yml)

React + TypeScript 的开源酒吧地图、调酒教程与探店分享应用。微信 React 客户端已迁入地点详情、经营状态筛选、地图选点、导航及旧数据读取，其他功能逐步迁移。目标平台：**微信小程序、iOS、Android、HarmonyOS NEXT**。默认视觉为 C「城市编辑」。

## 开始开发

```bash
git clone https://github.com/crazyname/jiuji-barmap.git
cd jiuji-barmap
npm ci
npm run check
```

| 目录 | 技术 |
|---|---|
| `apps/wechat/` | Taro 4 + React + TypeScript · 新微信小程序客户端 |
| `apps/mobile/` | React Native + Expo · iOS / Android |
| `apps/harmony/` | React Native OpenHarmony 适配说明 · 鸿蒙 |
| `packages/core/` | React 客户端共享业务模型 |
| `packages/contracts/` | 数据结构与 API 契约 |
| `packages/design/` | UI 主题 |
| `miniprogram/` | 现有原生微信客户端，迁移验收后删除 |

## 运行

**微信 React 客户端**

```bash
cd apps/wechat
npm install
npm run dev:weapp
```

微信开发者工具打开 `apps/wechat/dist/`；发布前配置自己的 AppID。

**iOS / Android**

```bash
cd apps/mobile
npm install
npx expo install --fix
npm start
```

使用 Expo 设备工具或开发构建运行。地图使用原生地图组件，安卓发行需要配置地图 SDK。

**共享检查**

```bash
npm run check
npm run migration:status
```

[构建指南](docs/build.md) · [Sites 测试数据](docs/sites-test-data.md) · [四端架构](docs/multiplatform.md) · [兼容矩阵](docs/compatibility.md) · [迁移任务](docs/migration.md) · [参与贡献](CONTRIBUTING.md)

**License:** [MPL-2.0](LICENSE)
