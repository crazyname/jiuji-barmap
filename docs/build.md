# 开发与构建

## 共用检查

Node.js 20+：

```bash
npm ci
npm run check
npm run migration:status
```

共享业务检查不需要 Xcode、Android Studio 或 DevEco Studio。

## 微信小程序（Taro + React）

```bash
cd apps/wechat
npm install
npm run dev:weapp
# 生产构建：npm run build:weapp
```

用微信开发者工具打开 `apps/wechat/dist/`。GitHub Actions 单独执行 Taro 微信生产编译；地图、位置与导航仍需微信真机验收。原生入口 `miniprogram/` 暂时保留，尚不替换根目录 `project.config.json`。

## iOS / Android（React Native + Expo）

```bash
cd apps/mobile
npm install
npx expo install --fix
npm start
```

iOS 需要 macOS / Xcode 进行正式构建；Android 构建需要相应 SDK。地图使用 `react-native-maps`；生产 Android 地图需要 Google Maps 配置。所需依赖以对应 Expo SDK 的 `expo install` 检查结果为准。

## HarmonyOS NEXT

React Native OpenHarmony（RNOH）方向，说明在 [apps/harmony/README.md](../apps/harmony/README.md)。需 DevEco Studio 和鸿蒙原生适配工作；当前尚无可打包的鸿蒙应用，不能当作 Android APK 使用。

## 数据与测试

```bash
npm run data:sync
npm run data:check
npm run contracts:check
npm run compat:check
npm test
```

`npm run check` 对数据、契约、声明、JS 语法和 Node 测试执行校验。各端实际编译及真机结果独立记录在 [兼容矩阵](compatibility.md)。

## ChatGPT Sites 开发测试数据

`npm run sites:seed` 导出测试数据，`npm run sites:check` 验证快照。管理站搭建说明见 [Sites 测试数据](sites-test-data.md)。
