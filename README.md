# 酒迹 · Jiuji BarMap

[![CI](https://github.com/crazyname/jiuji-barmap/actions/workflows/test.yml/badge.svg)](https://github.com/crazyname/jiuji-barmap/actions/workflows/test.yml)

酒迹是开源酒吧地图与调酒分享应用。目标平台：**微信小程序、iOS、Android、HarmonyOS NEXT**。统一采用 **C · 城市编辑** 风格，可扩展个人主题。

## 快速开始

需要 Node.js 20+。无需地图密钥即可运行数据与静态测试。

```bash
git clone https://github.com/crazyname/jiuji-barmap.git
cd jiuji-barmap
npm ci
npm run check
npm run migration:status
```

本地启动：

- **微信原生版本**：微信开发者工具导入仓库根目录，配置小程序 AppID；该入口仍保留，直到 uni-app x 微信端达到功能对等。
- **uni-app x 四端工程**：用 HBuilderX 打开 `apps/universal/`，选择微信、iOS、Android 或 HarmonyOS 构建/运行，相关设备 SDK 及地图密钥按需配置。

运行平台与环境详情见 [构建说明](docs/build.md)。

## 目录

```text
apps/universal/        uni-app x 多端客户端（逐步接管四端入口）
miniprogram/           微信原生客户端（迁移过渡期保留）
cloudfunctions/        原生微信地点搜索云函数
packages/contracts/    酒吧、酒谱、帖子数据契约与 API v1 草案
packages/design/       四套主题基础色板
scripts/               数据同步、测试检查、迁移状态工具
tests/                 逻辑、数据契约、平台兼容静态测试
docs/                  开发构建、平台能力矩阵、迁移计划
```

## 开发命令

| 命令 | 作用 |
|---|---|
| `npm test` | Node.js 逻辑与契约测试 |
| `npm run check` | 数据一致性、契约、平台声明、JS 语法和全部测试 |
| `npm run data:sync` | 从微信种子表生成 uni-app x 酒吧 JSON |
| `npm run data:check` | 检查种子同步（不改文件） |
| `npm run contracts:check` | 校验数据契约和拟议 API 定义 |
| `npm run compat:check` | 四端工程静态能力检查（不代表真机验证） |
| `npm run migration:status` | 查看微信入口迁移门槛 |

## 开发规范

[CONTRIBUTING.md](CONTRIBUTING.md) · [接口契约](packages/contracts/README.md) · [四端兼容矩阵](docs/compatibility.md) · [迁移计划](docs/migration.md)

当前在线社区、统一账号和跨端云同步尚未开发；本机调酒配方与帖子只是本地记录。真实地图上仅显示经过定位的门店，不会根据旧图编造经纬度。

## License

**MPL-2.0**。当前唯一项目维护者为 [crazyname](https://github.com/crazyname)。早期 MIT 版本可在 Git 历史中查阅。地图 SDK、商户素材和用户创作内容分别遵守其对应授权；「酒迹」品牌并非软件许可证自动授予的商标许可。
