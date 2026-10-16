# 参与开发

主技术栈：**React + TypeScript**。微信使用 Taro，iOS/Android 使用 React Native；鸿蒙使用 RNOH 适配层。

## 开发流程

1. Fork 仓库，创建分支：`feat/xxx`、`fix/xxx`。
2. 执行 `npm ci && npm run check`。
3. 微信页面位于 `apps/wechat/src/`；移动端位于 `apps/mobile/`；共享数据模型位于 `packages/core/`。
4. 修改酒吧种子数据时执行 `npm run data:sync`，并提交生成的 JSON。
5. 修改 API 或类型时同步更新 `packages/contracts/` 与测试。
6. PR 说明改动、截图、测试命令和测试平台。

## 代码约定

- 使用 TypeScript、函数组件和 React Hooks；平台 API 放在各端适配层。
- 坐标未经确认就保持 `null`，不得编造真实地理点位。
- 不提交 API 密钥、私人位置数据、无权分发的照片或地图瓦片。
- 源码采用 MPL-2.0；保留第三方依赖版权说明。

参考：[构建指南](docs/build.md)。
