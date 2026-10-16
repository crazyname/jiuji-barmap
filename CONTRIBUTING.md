# 参与酒迹开发

维护者：[@crazyname](https://github.com/crazyname)。欢迎通过 Issue、Pull Request 参与，首次贡献可以从酒吧数据纠错、文案或跨端组件开始。

## 运行与提交

1. Fork 并创建功能分支（例如 `feat/map-search`）。
2. 安装 Node.js 20+，执行 `npm ci && npm run check`。
3. 修改种子数据后执行 `npm run data:sync`，把同步结果一同提交。
4. PR 说明改动、截图、实际测试的平台和设备；没测试的如实标注。
5. 新业务模型先更新 `packages/contracts/`，再更新客户端和测试。

## 代码约定

- 新跨端页面统一写在 `apps/universal/`，使用 Vue 3、TypeScript/UTS；平台专有能力独立适配。
- 当前 `miniprogram/` 是迁移中的微信稳定入口，未过迁移门槛前不删除、不大规模重写。
- 地图点位必须是核实过的地理坐标；不得硬编码真实位置的假数据。
- 不提交密钥、个人定位记录、无权分发的图片、地图瓦片或第三方商业数据。
- 贡献原创代码默认采用 MPL-2.0，保留既有第三方版权信息。
- PR 使用模板；review 由项目维护者负责。目前不要求额外 CLA / DCO 签署。

CI 在 Linux 检查 Node 逻辑、契约、数据一致性和语法。iOS/Android/鸿蒙/微信设备编译由有平台 SDK 的开发者执行；测试结果记录在 [兼容矩阵](docs/compatibility.md)。
