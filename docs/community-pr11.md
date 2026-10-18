# PR-11 · 社区双列图文流、独立帖子与主动分享草稿

状态：**本机交互与独立领域模型已完成；真实社区发布审核/图片上传 API 未部署。** 不代表公众可投稿，不代表演示帖子真实存在。本 PR 不部署服务、不启用生产认证或公开写入，不修改 PR-07 私人 API。

## 实现目录及边界

- \`packages/core/src/community.ts\`：独立 CommunityPost、CommunityDraft、CommunityFields、CommunityImage、CommunitySubmission 及可注入的 CommunityRepository。与 \`DrinkEntry\`、\`VisitSession\`、正式 \`BarReview\` 和知识库配方完全不同。不可通过个人评分生成公开酒吧评价。
- \`apps/wechat/src/services/community.ts\`：生产持久化仅使用新用户隔离命名空间 \`jiuji.community.drafts.v1:<verified-user-id>\`，身份由 PR-06 \`AuthService.verifiedIdentity()\` 校验。**未配置公开 source 和 publisher**，且 \`COMMUNITY_REVIEW_API_ENABLED=false\`。绝不调用旧 Sites \`queueRemoteUpsert('posts',...)\`。
- \`CommunityViews.tsx\`：真实 React 双列不等高卡片，按照图文高度估算交替分配到两列。真实图片只接受来源可信的 HTTPS、授权声明及合理宽高比；没有合法图片也可展示纯文本封面。标题两行省略，正文只在详情展开。显式商业推广标签、作者显示实际返回的审核数据，不造点赞数或评论数。空状态、错误重试；如后续数据源返回稳定分页 \`nextCursor\`，仅按实际值人工加载下一页，不模拟无限滚动。
- \`pages/community/index.tsx\` 及新增 \`community-detail\`、\`community-editor\` 页面：游客可看到可信审核源返回的 approved + public 内容；目前未部署审核源，显示准确空状态，不将 Sites 测试数据冒充真实用户发表。
- 原四个 Tab 保留，自定义中央「＋」第 3 个操作现在使用 \`navigateTo('/pages/community-editor/index')\`，不再将编辑器错误注册为第五 Tab；其他两个快捷私人记录动作保留。

## 社区模型及状态

\`CommunityPost\` 字段包括独立 ID、经过服务端验证的内部 authorUserId 与实际展示作者名、title/body、可选已授权 HTTPS 图片引用/来源/比例、可选 barId、topics、type、visibility、moderationStatus、isSponsored/sponsorName、createdAt/updatedAt/revision。

状态契约：本机 \`local_draft\`、待提交 \`pending_submission\`、待审核 \`pending_review\`、审核通过 \`approved\`、退回 \`rejected\`、隐藏 \`hidden\`、撤回 \`withdrawn\`。审核结果必须来自独立可信服务端；客户端不得自设 approved。公开列表只接收 **visibility=public AND moderationStatus=approved**，并显式投影公共白名单，丢弃任意未授权附加字段（私人评分、备注、精确位置、私人记录引用、服务器内部元数据等）。服务端仍必须强制执行同一过滤和鉴权，客户端过滤只是防御深度。

本机草稿有修订 revision；保存草稿先同步写入设备，失败抛异常且不显示保存成功。已提交审核的草稿不允许本机作为未审版本自由改写。保存时不默认上传或发布。编辑器允许预览标题、正文、可选酒吧和话题、商业声明；推广必须填写赞助方。媒体上传未实现，编辑器不会将 wxfile/tmp/未授权照片当作持久线上素材。

## 私人转社区：**显式单向白名单**

仅私人 DrinkEntry/VisitSession **详情** 的用户点击「分享到社区（先编辑草稿）」才进行本机转换：
- DrinkEntry → title='聊聊这杯酒'、type='cocktail_note'；body 默认为空。无酒名默认抄写，避免潜在敏感文本被不知情地预填并意外公开。
- VisitSession → title='一次探店分享'、type='visit_note'；body 默认为空。
- 其余公共字段一律初始化为 \`barId=null\`、\`topics=[]\`、\`images=[]\`、\`isSponsored=false\`、\`sponsorName=null\`。
- 严禁从私人对象复制 \`note\`、\`personalRating\`、\`contextDetails\`、价格、照片、精确时间、地理位置、visitSessionId、私人记录 ID、个人内部关联和私人 ownerUserId。**草稿不保留 sourcePrivateId 或其他可从公开帖子反查私有记录的链接**。
- 分享草稿独立编辑/取消/丢弃，不会更新源 DrinkEntry/VisitSession；不创建酒吧评价，也不计入正式评分。

### 账号及旧数据

\`AUTH_API_ENABLED=false\` 保持。匿名游客可浏览审核通过的公开内容，无法保存新账户草稿或提交；没有模拟生产用户。旧 \`jiuji.react.posts\`、\`jiuji-personal-v1:posts\`、原 Sites v1 \`posts\` 设备缓存/测试种子及原有收藏、浏览历史、配方和草稿 **原样保留**。新版社区绝不自动读取并公开这些历史内容；将来如允许导入，必须明确询问归属、提供逐篇预览、用户主动确认并经过正式审核，不能静默复制。

本机社区草稿仍为小程序沙箱明文；和 PR-09 离线安全结论一致，不能声称已采用可信静态数据加密。账号切换卸载不属于当前已验证账号的草稿页。生产身份/审核服务在 PR-12 完成验收前，不能启动真实写入。

## PR-12 后端必须提供的可验证接口（本轮只有契约和注入）

- \`GET /v1/community/posts?limit=...&cursor=...\`：公开免登录，但**服务器**只返回 approved/public；稳定复合游标或不可伪造服务器游标，分页去重、撤回及隐藏即时不可见；字段严格白名单；合法图片引用/授权与作者展示身份应被服务端可靠验证。
- \`GET /v1/community/posts/:id\`：同样只允许公开/审核通过，匿名可读；未审核/被隐藏/撤回统一 404，不能泄露私人内容。
- \`POST /v1/community/submissions\`：已验证 Bearer 会话，由服务器生成 authorUserId 与 postId，禁止客户端传 authorUserId、moderationStatus、visibility=public。参数为 \`CommunitySubmission { title, body, type, topics, barId, images[], isSponsored, sponsorName, clientMutationId }\`；按 author + clientMutationId 幂等，返回 \`pending_review/private\` 和服务端 revision；拒绝 Sponsor 缺失、正文过长、未知 barId、非持久/未授权图片路径；设置发布频率限制/敏感词/人工审核。客户端绝不可将收到 200 当作公开通过。
- \`PATCH/DELETE /v1/community/submissions/:id\`：服务器作者身份与 expectedRevision CAS，明确被退回重提、撤稿/隐藏，带审核日志和必要内容留存政策。
- \`POST /v1/community/posts/:id/reports\`：用户举报接口；独立幂等、节流、审核状态、私密举报内容及滥用限制。PR-11 的举报按钮只提示服务不可用，**不会虚假声称举报成功**。
- \`POST /v1/community/images/upload-request\` / R2 安全临时凭据或等价接口：服务端用户鉴权、图片格式/大小/病毒/内容审核、对象归属、合法授权证明、图片与帖子的引用有效期及版权投诉/撤下流程。未接通前无图片添加入口。
- 商业广告标识应强制展示且由服务端审核，不以用户可隐藏字段代替合规流程；正式酒吧评价独立模型与统计，不在 CommunityPost 生命周期内写评价或点赞。

## 测试/部署门禁

\`npm run check\`、原有 journal/UI/auth/cloud/backend/security/cocktails 测试、\`test:community-model\`、\`test:community-ui\`、严格 TypeScript、\`migration:status\`、WeChat production build 与 Wrangler dry-run。模型测试执行真实身份隔离的 repo、草稿持久化、编辑版本冲突、分享白名单、公共字段投影、已审核过滤及无审核 API 发布拒绝；UI 测试运行真实 React 组件，验证两列、点击跳转、无图/合法图片、长标题、商业声明、草稿编辑/预览/本机保存/取消及服务端提交禁用。无真实云端登录、真机媒体上传或内容审核服务验收。
