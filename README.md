# 酒迹 · Jiuji BarMap

[![CI](https://github.com/crazyname/jiuji-barmap/actions/workflows/test.yml/badge.svg)](https://github.com/crazyname/jiuji-barmap/actions/workflows/test.yml)

React + TypeScript 的开源酒吧地图、鸡尾酒知识库、个人饮酒记录与社区应用。微信 React 客户端已迁入部分地点详情、筛选、地图选点和旧数据读取，其他能力尚在迁移/规划。目标平台：**微信小程序优先，后续 iOS、Android、HarmonyOS NEXT**。**已确认的新 UI 方向是 A「城市极简」+ 原品牌棕红色 `#82442F`；当前客户端旧风格尚未改造。**

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
# 导入 Sites 测试控制台的 JSON（导出后按实际路径替换）
npm run sites:import -- ./jiuji-tools.json
```

**开发前必读：**[当前产品基线](docs/product-baseline.md) · [A「城市极简」UI 规范](docs/ui-a-minimal-spec.md) · [微信小程序开发任务与验收](docs/wechat-dev-roadmap.md) · [个人饮酒记录规则](docs/personal-drinking-journal-design.md) · [原完整产品规划 v0.1（存档）](docs/archive/product-plan-v0.1-review-draft.md)。

**状态：**上述文档已建立研发范围和建议开发顺序，**不表示新 UI、私人饮酒日记、正式账号和同步已写入客户端或通过真机验收**。

[产品决策](docs/product-decisions.md) · [社区瀑布流与发布入口](docs/community-ui-design.md) · [账号与身份设计](docs/auth-design.md) · [调酒模块设计](docs/cocktails-design.md) · [标签系统设计](docs/tags-design.md) · [酒吧评价设计](docs/reviews-design.md) · [酒单与活动](docs/bar-menus-events.md) · [1.0 版本范围](docs/release-scope.md) · [构建指南](docs/build.md) · [个人中心界面](docs/profile-ui.md) · [Sites 测试数据](docs/sites-test-data.md) · [四端架构](docs/multiplatform.md) · [兼容矩阵](docs/compatibility.md) · [迁移任务](docs/migration.md) · [参与贡献](CONTRIBUTING.md)

**License:** [MPL-2.0](LICENSE)

跨端自动同步的协议与接入条件见 [数据同步](docs/sync.md)。

开发测试同步 API：`https://jiuji-test-console.equal-genet-1707.chatgpt.site`（已配置匿名读取；带令牌写入待真机验收）。
