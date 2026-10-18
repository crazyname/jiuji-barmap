# PR-10 · 鸡尾酒知识库与配方版本核对

## 数据审计

原仓库的 `apps/wechat/src/data/sites-test.json`、`apps/mobile/src/data/sites-test.json` 及 `fixtures/sites/latest.json` 继承 Sites 开发快照，其 `recipes` 是 **`{id,title,ingredients,steps,visibility}` 扁平合同**。目前两个 `dev-recipe-001/002` 来自开发演示，没有配方作者/资料来源及可追溯核验日期，不得自动标记为 IBA 或官方资料。旧页面的 `jiuji.react.recipes` 是设备本机草稿，原配料是未结构化字符串；不解析猜测用量。

新增 `Cocktail` 与 `RecipeVariant` 独立类型（`packages/core/src/models.ts`），由 `CocktailCatalog` 将一款酒映射到多个版本 ID，版本可以有不同来源、配料行、制作步骤、杯型/技法/装饰/预计产量、已核实状态及创建/修改时间。来源包括名称、原始 URL、来源类型、人工核验日期。文档中所谓“已核实”仅限我们实际检查过的来源和数值，不表示 IBA 对酒迹的官方授权或永久固定版本。

## 本轮核对的公开来源（2026-10-18）

| Cocktail | RecipeVariant ID | 原始出处 | 核对的用量 | 状态 |
|---|---|---|---|---|
| Margarita / 玛格丽特 | `margarita-iba-2026` | https://iba-world.com/iba-cocktail/margarita/ | 100% agave tequila 50ml、triple sec 20ml、鲜青柠汁 15ml；加冰摇和滤入冰镇鸡尾酒杯，盐边可选 | verified |
| Negroni / 尼格罗尼 | `negroni-iba-2026` | https://iba-world.com/iba-cocktail/negroni/ | gin 30ml、Campari 30ml、sweet red vermouth 30ml；加冰于古典杯中轻搅，橙片装饰 | verified |

以上数据手工以官方原始页面逐项核对。制作步骤为中文简短转述，未大段复制文字，未下载或搬运第三方照片；酒精度、历史故事、调制损耗、价格和产量未臆测填写。IBA 页面若未来修订，应创建新配方版本或审慎更新核验记录，**不能仅因同名合并来源差异**。测试中所用的第三个 Margarita 配方版本明确是 **unverified 测试夹具**，**没有加入公开产品数据**。本轮公开产品数据只有两款酒、各一个经核实的版本，不以数量充当验收依据。

## 模型约束与可重复运行校验器

`packages/core/src/cocktails.ts` 对重复 ID、失效外键、版本归属、别名/名称、单位/有限数值/正数、配料行、步骤、来源 URL 与核验日期做运行时检查。来源不满足约束的版本不得声明 `verified`；对于“适量”等未知数量，仅允许 `quantity:null` 与 `unit:'unspecified'`，保留 `originalText`，不自动猜毫升。

运行：

```bash
npm run cocktails:check
node --experimental-strip-types scripts/validate-cocktail-import.mjs --input /path/to/candidate.json --report /path/to/source-report.json
npm run test:cocktails
```

第二种调用只读取候选数据并写出来源报告，**不会覆盖**正式种子、Sites 快照、私人草稿或历史数据。机器验证只能证明字段结构与来源信息存在，**不能代替人工逐行核实原始来源**。每条记录的真实核验来源、日期、类型和状态在结果中可查，开发演示快照单独列为 unverified。

## 页面行为及访问隔离

四个 Tab 保留；调酒目录在离线时仍可浏览打包的少量数据，搜索中英文与别名；酒款详情列出版本，版本详情呈现结构化配料/用量/步骤和明确出处。不依赖登录，未核实来源不会显示官方标签。没有匹配项时允许私人单杯输入自由酒名。

「记一杯酒」可仅选择 Cocktail ID、再可选择 RecipeVariant ID；二者在表单与核心数据层严格匹配，修改自由酒名会清除原有知识库关联。原始 `DrinkEntry` 仍是私人逐杯事实，个人评分只存在 `DrinkEntry.personalRating`；不会自动创建版本评分、公开酒吧评分、社区帖子或公共配方。

## 与旧数据的非破坏兼容

- 旧 `jiuji.react.recipes` **不删除、不覆盖、不批量转换**：游客只读公共知识库，绝不读取未归属账号的本机旧草稿。已验证账号须先明确确认“这台设备旧草稿可能属于其他人”，才可以本机只读预览原始条目；**不将其绑定到当前账户、不新增公共写入、不修改已有行或自定义字段**。无法解析的条目也原封不动保存在设备存储中，后续真正归属迁移需独立用户授权。
- 用户旧字符串 `ingredients` / `steps` 保持原文；`legacyRecipePreview` 只做只读投影，不声称其数量/单位已被验证。无法确认的私人数据不迁移到公开知识库。
- Sites `/v1/sync` v1 `recipes` 扁平接口、`packages/sync/protocol.json`、生成器与旧数据导入脚本均保持原样。调酒页仍可只读显示旧 Sites 和演示资料，标注「未核实」，不会调用 `queueRemoteUpsert('recipes')` 来发送私人草稿；其它社区公开同步代码不受此改造影响。
- PR-09 的 AuthService、云端私人安全队列、存储容错、用户会话均不修改。正式认证开关保持 `false`；没有部署后端或迁移任何用户资料。

## 后续独立工作（不在 PR-10 范围）

扩大数据需逐来源核实与版权审查（尤其图片、长篇说明）、来源历史与撤回、版本差异、公开投稿审批、配方评分聚合、餐厅/酒吧酒单绑定；真正的结构化知识库后端与 API 需独立设计迁移和数据管理员审核。微信开发者工具与真机尚需验收搜索输入、双层导航返回、Picker 选择、Tab 保持、字体溢出、离线回退、旧存储异常及容量边界。CI 构建/React renderer 不等于真机验证。
