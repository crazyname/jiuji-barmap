# 多端技术架构

**选型：uni-app x + Vue 3 + TypeScript/UTS**。目标平台：微信小程序、iOS、Android、HarmonyOS NEXT。

## 为什么继续使用

- uni-app 项目在 GitHub 有约 4.16 万 Stars，拥有成熟的中文 Vue/小程序开发者社区；uni-app x 是其中较新的原生渲染技术路线。
- 已有 `apps/universal/` 四端基础工程，优先完善功能而不是重复迁移框架。
- UI 页面共用，地图、权限、媒体与系统分享按平台适配，业务数据以 `packages/contracts/` 为准。

## DCloud 的范围

- **需要**：使用 HBuilderX / uni-app x 工具链编译和调试移动端及鸿蒙应用。
- **不绑定 DCloud 业务服务**：不接入 uniCloud、DCloud 用户账号体系、广告、统计或托管。应用打包使用 DCloud AppID；如使用云打包，需要对应 DCloud 开发者账号与打包权限。
- **日常协作**：Vue / TypeScript 代码在 VS Code 等编辑器开发；`npm run check` 在标准 Node.js 环境运行。

传统 uni-app 的 npm CLI 与 uni-app x 四端构建工具链并不相同，不混用构建命令。

## 项目边界

```text
apps/universal/      四端 UI 与平台适配
miniprogram/         迁移中的原生微信版本
packages/contracts/  数据与 HTTP API 规范
packages/design/     UI 主题
scripts/ tests/      同步、静态验证与单元测试
```

[构建命令](build.md) · [四端兼容矩阵](compatibility.md) · [微信入口迁移](migration.md)

参考：[DCloud uni-app x](https://uniapp.dcloud.io/uni-app-x/) · [GitHub 源码](https://github.com/dcloudio/uni-app) · [Taro](https://github.com/NervJS/taro)
