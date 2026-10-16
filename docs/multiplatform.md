# 四端架构 · React + TypeScript

| 平台 | 客户端 | 平台构建工具 |
|---|---|---|
| 微信小程序 | Taro 4 / React | 微信开发者工具 |
| iOS | React Native + Expo | Xcode / Expo |
| Android | React Native + Expo | Android SDK / Expo |
| HarmonyOS NEXT | React Native OpenHarmony 适配（筹建） | DevEco Studio |

## 共享模块

- `packages/core/`：酒吧模型、数据过滤和无平台依赖的业务逻辑。
- `packages/contracts/`：JSON Schema 与公共 API 契约。
- `packages/design/`：C「城市编辑」及其他主题的设计 Token。
- `apps/*/`：地图、定位、照片、系统分享等平台适配与页面渲染。

微信采用 Taro 是因为它支持 React 小程序编译，并不意味着强制移动端也采用 Taro 的 React Native 转译。移动端直接使用 React Native + Expo 官方工具链。鸿蒙使用 RNOH 单独验证。

DCloud / HBuilderX / uni-app x 不属于本项目新架构。

[构建步骤](build.md) · [兼容矩阵](compatibility.md) · [微信入口迁移](migration.md)
