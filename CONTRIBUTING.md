# 参与开发

酒迹采用 **Vue 3 + TypeScript/UTS + uni-app x** 开发跨端客户端，欢迎通过 Issue 和 Pull Request 贡献。

## 开始

```bash
npm ci
npm run check
```

1. Fork 仓库，从 `main` 创建功能分支，例如 `feat/map-search`。
2. 在 `apps/universal/` 实现跨端功能；平台专用 SDK、系统权限与分享逻辑单独封装。
3. 修改酒吧种子数据后运行 `npm run data:sync`。
4. 涉及数据结构或接口时，先同步修改 `packages/contracts/` 和测试。
5. 提交 PR，说明变更与测试结果；UI 更新附截图。

## 代码规范

- 优先使用 Vue 3、TypeScript、已有组件和共享设计数据；避免重复平台业务实现。
- 真实地点必须使用确认过的坐标，未确认时保持空值。
- 禁止提交 API Key、个人位置记录、无权分发的照片或地图数据。
- 新代码按 [MPL-2.0](LICENSE) 授权，保留第三方版权声明。
- 提交前运行 `npm run check`，改动到的端按 [兼容矩阵](docs/compatibility.md) 验收。

[构建与运行](docs/build.md) · [PR 模板](.github/pull_request_template.md)
