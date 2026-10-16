# Contributing to Jiuji / 参与酒迹开发

Thank you for contributing. / 感谢参与酒迹开源项目。

## Workflow / 提交方式

1. Open an issue or discuss the change first if it alters public APIs, licensing, data models, location permissions or cross-platform build targets.
2. Fork the repository or create a topic branch. Keep each pull request focused and include screenshots or device notes for UI or map changes.
3. Run `node scripts/sync-universal-bars.cjs` if you change the initial bars dataset; then run `node --test tests/*.test.js`. Check the WeChat client with the WeChat DevTools and test affected uni-app x targets in supported development environments.
4. Describe which platforms you tested: **WeChat / iOS / Android / HarmonyOS NEXT**. If untested, say so explicitly.
5. Do not commit API keys, user location traces, personal data, licensed map tiles, proprietary SDK binaries, bar photos or copied reviews without the proper rights.
6. For new original source code, identify the code license as **MPL-2.0**; for standalone source files, prefer `// SPDX-License-Identifier: MPL-2.0` (or an equivalent comment header). Do not remove third-party notices.

## Developer Certificate of Origin (DCO) / 开发者来源确认

For contributions that introduce or modify code, sign off your commits with `git commit -s`. The `Signed-off-by` line attests to the [Developer Certificate of Origin 1.1](https://developercertificate.org/), including that you have a right to submit the contribution under the project's stated license. It is **not** a transfer of copyright. Please use your actual contributor identity and ensure the sign-off text matches the committer information.

代码贡献请使用 `git commit -s` 签署 DCO，确认你有权将贡献按项目许可提交。这不是著作权转让。首次贡献者无需签署额外 CLA；如果未来计划双重许可，将先公开征询并明确新增授权条件。

## Separate user-created content / 用户作品

Submitting a code or data patch as a Git contribution is different from publishing a photo, recipe or review inside the Jiuji product. The latter requires a separate user-facing content agreement when the online service is built; do not treat user-generated content as GPL/MPL code by default.

## Review and respect / 审核约定

Respectful discussion is expected. Maintainers may request corrections to attribution, permissions, disclosure of commercial sponsorship, accessibility, platform compatibility and privacy. Commercial promotions inside the future community must be clearly marked and comply with platform rules; they are not a condition for contributing to the source code.
