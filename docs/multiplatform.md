# 酒迹 · 跨端开发结构（微信 / iOS / Android / HarmonyOS NEXT）

## 当前交付状态（基础工程，不是已上架的四端成品）

- `miniprogram/`：现有微信原生小程序，保留之前四栏功能和微信地图；继续作为微信端的稳定开发入口。
- `apps/universal/`：新增 uni-app x Vue3 多端基础工程，为 iOS、Android 和 HarmonyOS NEXT 提供四栏 UI、原生地图页、地点选点/导航与本地配方、笔记保存；也能作为未来的微信端迁移目标。
- `scripts/sync-universal-bars.cjs`：从 `miniprogram/data/bars.js` 生成多端共享的 31 家酒吧 JSON 快照。以原始记录为数据源，**绝不生成虚假经纬度**。
- `tests/universal.test.js`：校验两边数据一致和导航顺序。

现阶段两个客户端使用**相同初始数据**，但本地存储互不相通。真正的跨设备账号、收藏、浏览记录、图片和社区同步必须使用统一后端，并完成权限与内容审核。请不要把当前脚手架宣传为四端上线。

## 开发与测试

- Node.js 18+：在仓库根目录执行 `node scripts/sync-universal-bars.cjs`，随后 `node --test tests/*.test.js`。
- 微信：使用微信开发者工具打开仓库根目录，项目根配置 `project.config.json` 仍指向旧原生小程序。需配置自己的微信 AppID/云环境。
- Android/iOS/HarmonyOS NEXT：使用 HBuilderX 4.61+ 打开 `apps/universal/`，识别为 uni-app x 项目，选择目标平台运行。正式打包须设置独立的 DCloud appid 和应用标识，使用平台自己的签名与地图密钥。
- HarmonyOS NEXT：还需 DevEco Studio 和 HarmonyOS API 14+ 的设备/模拟器，先在 HBuilderX 本机编译，打包签名后部署。**不能把 Android APK 作为纯血鸿蒙安装包**。

## 地图和权限

多端 `<map>` 使用平台对应的 SDK，而非人工 SVG 示意图。移动端及鸿蒙需分别为腾讯地图 SDK 配置授权；微信端使用微信地图能力。`uni.chooseLocation`、`uni.openLocation` 也需要对应权限。

多端地图初始中心为广州，种子数据无经纬度。手动选取地点后才生成标记；旧微信版的腾讯地点服务云函数尚未迁移到多端统一后端。未来新增地图 POI 统一检索接口时，必须对门店名称、城市和地址做校验，再将确认结果写入云库。商业地图 SDK Key 的平台绑定依官方要求处理，服务端 WebService Key 不能出现在公开前端仓库。

## 上线前必须完成的项目

1. 公共 API（登录身份、用户资料、门店和收藏、配方、帖子、图片、审核状态）及数据库迁移。
2. 各平台地图 SDK Key、选点/导航、定位与隐私权限的真机测试。
3. 四端内容创建、图片上传、列表分页、举报和广告标识机制、审核与合规测试。
4. iOS 的 App Store Connect 与证书、Android 渠道签名、华为 AppGallery Connect 与 HarmonyOS 签名、微信小程序审核发布。

由于地图、支付、登录和系统分享具有平台差异，不能承诺所有业务代码 100% 复用。优先复用接口、数据模型、设计规范和非平台业务逻辑。
