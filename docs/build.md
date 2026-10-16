# 构建与测试

## 公共检查（Node.js 20+）

```bash
npm ci
npm run check
npm run migration:status
```

`npm run check` 包括数据同步、JSON Schema、平台能力声明、JS 语法和单元测试，已接入 GitHub Actions。修改 `miniprogram/data/bars.js` 后运行 `npm run data:sync`。

## 四端客户端

统一入口：`apps/universal/`（uni-app x）。

| 目标端 | 开发与构建工具 |
|---|---|
| 微信小程序 | HBuilderX + 微信开发者工具 |
| iOS | macOS、HBuilderX、Xcode |
| Android | HBuilderX、Android SDK |
| HarmonyOS NEXT | HBuilderX、DevEco Studio |

开发 Vue 页面、TypeScript、数据契约和单元测试可以用 VS Code 等编辑器；**四端应用编译仍需要 HBuilderX 工具链**。地图服务需分别配置平台密钥及权限。当前没有采用 uniCloud、DCloud 统计、DCloud 广告等服务。

微信原生版：微信开发者工具导入仓库根目录，使用 `project.config.json` 配置自己的微信 AppID；地图 POI 自动搜索需要腾讯位置服务 WebService Key（仅保存在微信云函数环境变量 `QQMAP_KEY`）。

## 功能与设备验证

开发测试以 `npm run check` 为基础；实际编译、真机地图与系统权限记录在 [四端兼容矩阵](compatibility.md)，微信原生迁移按 [迁移门槛](migration.md) 执行。

DCloud 官方测试 CLI 参考：https://github.com/dcloudio/uni-app/blob/uni-app-x/docs/ai/auto-test.md
