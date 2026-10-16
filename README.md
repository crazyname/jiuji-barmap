# 酒迹 · Jiuji BarMap

[![CI](https://github.com/crazyname/jiuji-barmap/actions/workflows/test.yml/badge.svg)](https://github.com/crazyname/jiuji-barmap/actions/workflows/test.yml)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL--2.0-blue.svg)](LICENSE)

酒吧地图、调酒教程与探店分享应用。面向微信小程序、iOS、Android、HarmonyOS NEXT。默认 UI：**C · 城市编辑**。

## 快速开始

Node.js 20+：

```bash
git clone https://github.com/crazyname/jiuji-barmap.git
cd jiuji-barmap
npm ci
npm run check
```

开发入口：

- `apps/universal/`：**uni-app x + Vue 3 + TypeScript/UTS** 四端客户端。用 HBuilderX 打开并选择目标平台运行；业务逻辑与测试可在 VS Code 等编辑器维护。
- `miniprogram/`：现有微信原生版本，过渡期使用微信开发者工具从仓库根目录导入。
- `packages/contracts/`：共享数据模型与 API 契约。
- `packages/design/`：主题设计数据。
- `scripts/`、`tests/`：数据同步与自动检查。

## 开发命令

| 命令 | 用途 |
|---|---|
| `npm run check` | 全部数据、契约、兼容性、语法和单元测试 |
| `npm test` | 单元测试 |
| `npm run data:sync` | 同步酒吧种子数据到跨端工程 |
| `npm run migration:status` | 查看微信原生入口迁移进度 |

## 开发文档

[构建与运行](docs/build.md) · [多端架构与框架选择](docs/multiplatform.md) · [接口契约](packages/contracts/README.md) · [兼容性矩阵](docs/compatibility.md) · [微信迁移](docs/migration.md) · [参与贡献](CONTRIBUTING.md)

## License

[MPL-2.0](LICENSE)
