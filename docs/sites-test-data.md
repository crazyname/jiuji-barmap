# ChatGPT Sites · 酒迹测试数据

ChatGPT Sites 的 **D1** 用于持久化酒吧、配方、帖子与收藏，**R2** 用于测试上传的照片。管理站只处理**开发数据**；不使用真实用户身份或商户合同。

## 创建测试站

在 ChatGPT 网页版切换到 **Work**，要求创建网站（可使用 `@Sites`），并提交以下要求：

> 创建「酒迹 · 测试数据控制台」网站。采用默认 C「城市编辑」设计（暖纸白 #F4EDDF、棕红 #82442F）。使用 ChatGPT Sites 内置 D1 保存记录、R2 存储上传图片。提供酒吧、调酒配方、探店/品酒/商业推广帖子、测试用户和收藏的数据管理界面，支持列表筛选、搜索、添加、编辑、删除、导入导出 JSON、导出单独表及一键重置开发数据。以 https://raw.githubusercontent.com/crazyname/jiuji-barmap/main/fixtures/sites/seed.json 作为初始数据，按 https://github.com/crazyname/jiuji-barmap/tree/main/packages/contracts/schemas 的类型约束进行校验。要求商业推广帖子必须设置 isSponsored=true 和 sponsorName，未验证坐标保持 null。使用 Sites 支持的身份验证，默认仅授权管理者进行写入，访问权限在服务端校验。不要导入真实个人数据。请为每次修改记录时间和操作类型，并提供 JSON 导出以便备份。

导入源：[开发测试 JSON](../fixtures/sites/seed.json)，包含 **31 家历史酒吧、2 份示例酒谱、3 条模拟帖子**及虚构测试身份。

## 更新测试数据

```bash
npm run data:sync
npm run sites:seed
npm run check
```

`npm run sites:seed` 更新 `fixtures/sites/seed.json`；它不会修改已经部署到 Sites 的 D1 数据库，需要在管理站重新导入。

## 四端访问

**当前把 Sites 作为管理站与持久化数据源，不默认作为四端公共 API。** Sites 的 D1/R2 不是外部客户端可直接登录的数据库。若在 Sites 部署中能够公开受控的 HTTPS JSON 路由，再实测：

- `GET /api/health`、`GET /v1/bars` 等是否能返回 JSON。
- 微信小程序 HTTPS 请求域名和证书；原生移动端请求。
- CORS、读写鉴权与请求频率限制；写入密钥不能打包在客户端。

没有确认以上内容前，四端继续使用本仓库中的测试 JSON，Sites 提供 CRUD 管理、备份和导出。验证可用后再将客户端连接到受控 API；客户端仍应以 `packages/contracts/api.v1.json` 为接口约定。

## 官方文档

- [ChatGPT Sites 数据与连接](https://learn.chatgpt.com/docs/sites/data-and-connections)
- [创建和管理 Sites](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites)

## 使用 Sites 实际导出更新客户端演示数据

将从 Sites 下载的 `jiuji-tools.json` 放在本地，然后运行：

```bash
npm run sites:import -- /path/to/jiuji-tools.json
npm run check
```

也可以传入存放 `jiuji-bars.json`、`jiuji-recipes.json`、`jiuji-posts.json`、`jiuji-testUsers.json`、`jiuji-favorites.json` 的目录。支持 `--dry-run` 验证而不写入。

导入生成 `fixtures/sites/latest.json`（开发快照）及微信 / React Native 两份 `sites-test.json`（仅含示例酒谱和帖子）。两端只把测试内容显示为只读示例，本地草稿仍独立保存。上传的 `jiuji-files.json`、`jiuji-audit.json` 是完整数据的重复导出，不参与独立媒体或审计表导入。

`npm run sites:exports:check` 用于 CI 校验快照一致性。导入只修改 Git 仓库里的测试快照，不会向 Sites 发起写请求；需要再次导出才能获取管理站中的修改。
