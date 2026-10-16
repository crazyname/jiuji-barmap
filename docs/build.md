# 构建与测试

## 普通开发者（任意系统）

Node.js **20+**，无需 HBuilderX：

```bash
npm ci
npm run check
npm run data:sync    # 仅修改酒吧数据后执行
npm run migration:status
```

`npm run check` 是 GitHub Actions 里的 PR 必过检查。它运行 Node 逻辑测试、JSON Schema 子集校验、版本一致性、四端静态声明、JS 语法检查；**不编译移动端应用**。

## 微信小程序

目前推荐微信开发者工具导入仓库根目录的 `miniprogram/` 原生版：`project.config.json` 已设置项目结构。请在本地填自己的 AppID；地图基础能力可使用，腾讯位置服务 POI 搜索需微信云开发环境与 `QQMAP_KEY` 云函数环境变量。

逐步用 `apps/universal/` 生成的微信版本替代。切换条件见 [迁移门槛](migration.md)，暂不修改根目录微信项目配置。

## uni-app x：微信 / iOS / Android / HarmonyOS NEXT

统一源码入口：`apps/universal/`。使用支持 uni-app x 的 HBuilderX 打开该目录；在应用发行前配置自己的 DCloud AppID、平台 App ID、证书签名和地图 SDK Key。

| 平台 | 构建工具 | 运行验证 |
|---|---|---|
| 微信 | HBuilderX + 微信开发者工具 | 真机打开地图、地点搜索与分享 |
| iOS | macOS + HBuilderX + Xcode | iOS 模拟器 / 真机地图与定位权限 |
| Android | HBuilderX + Android SDK | 模拟器 / 真机地图、媒体权限 |
| HarmonyOS NEXT | HBuilderX + DevEco Studio | 鸿蒙设备/模拟器、原生地图 SDK |

uni-app x 不等于传统 uni-app CLI 模板。本仓库**不提供未经验证的 npm 四端打包指令**。在设备/编译资源准备完毕后，可按 DCloud 的 HBuilderX 自动化测试 CLI 文档设置独立 runner：

- https://uniapp.dcloud.io/worktile/auto/hbuilderx-cli-uniapp-test.html
- https://doc.dcloud.net.cn/uni-app-x/ai/auto-test.html

GitHub 的 Ubuntu runner 不安装 HBuilderX（其工具链不是纯 Linux 构建）。需要真机构建时，先在目标系统验证运行，再增加对应平台的受控 runner。任何未跑的设备测试不要标成通过。

## 地图与数据

`apps/universal/data/bars.json` 由 `miniprogram/data/bars.js` 派生；当前是过渡期单向同步，不是在线数据库。未经验证的地点经纬度应保持 `null`。四端本地草稿不会自动同步。

## 发布前手动检查

逐项核对：四栏导航、地图拖动缩放、真实位置选点、导航、酒吧搜索筛选、调酒发布草稿、社区推广标注、收藏/历史、主题持久化、隐私与系统权限，然后把真实设备与构建版本记录在 PR。
