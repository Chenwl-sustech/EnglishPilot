# EnglishPilot

本地优先的英语学习工具，提供雅思 / 托福方向的词汇复习、原创分级练习、口语录音、写作练习、学习计划、完整备份及可选 AI 教师与模拟评价。

本仓库包含 Web 源码、iPhone/iPad 的 Capacitor/Swift 工程、HarmonyOS ArkTS 工程和独立的 Vercel/Upstash AI 后端。**公开工程不包含个人 AI Key、配对凭据、签名身份或学习数据。**

## 下载和安装

[下载 Release](https://github.com/Chenwl-sustech/EnglishPilot/releases/latest)

- `EnglishPilot-Source-v0.1.3.zip`：完整源码，含独立 AI 后端。
- `EnglishPilot-Xcode-Project-v0.1.3.zip`：已内置页面的原生工程包；解压后按文档选择自己的 Apple Team 和 Bundle Identifier，再编译安装。
- `SHA256SUMS.txt`：下载文件校验值。

当前公开 Release 提供可自行签名的工程，**不是免签安装包**。免费 Personal Team 的安装仅适用于自己的已登记设备，签名会到期。面向其他用户的 TestFlight / App Store 分发需要适当的 Apple 开发者资格和签名；本项目没有发布他人的个人签名 Profile。

完整步骤见 [iPhone/iPad 安装](docs/installation.md)。HarmonyOS 工程需在 DevEco Studio 中自行配置和验证，本次未提供已签名 HAP。

## 本地运行

要求 Node 22+；独立 AI 后端要求 Node 24。

```sh
npm ci
npm run dev
```

打开终端给出的 localhost 地址。练习、复习状态与录音保存在当前设备；换设备前请在设置中导出完整备份。

```sh
npm test
npm run typecheck
npm run native:build
```

`native:build` 生成静态页面并同步到两端原生工程。`native:ios:check` 尝试不签名的模拟器构建；它通过不代表已完成真机签名。

## 可选 AI

离线学习和录音不需要 AI Key。AI 功能需要使用自己的服务端配置，见 [云后端部署](docs/cloud-backend.md)。

- 独立后端位于 `backend/`，支持 Vercel Hobby + Upstash Redis Free。
- DeepSeek Key 留在服务端；设备使用单独的访问凭据。
- 提交的文字会发送给所配置的 AI 服务；录音不由此接口上传。
- 默认北京时间每日 20 次、200000 token、单次最多 4096 输出 token；存储失败时停止 AI，不自动清零。
- AI 模拟评价不是官方考试成绩。托管在免费额度内可免费使用，模型调用按服务商账号计费。

## 可选账号同步（云端预览）

账号同步使用 Supabase Auth、按账号隔离的 PostgreSQL 数据与私有音频存储，支持 iOS 安装版与手机浏览器。原本机空间保留，确认启用后才上传；断网继续学习，同一内容发生并发修改时提示冲突。部署配置、免费额度、邮件服务与恢复方式见 [账号同步说明](docs/account-sync.md)。

此功能尚未包含在 v0.1.3 Release 中。网页目前供云端预览，真实双设备验收尚未完成；现有发布包的使用方式不变。

个人部署的[手机网页预览](https://englishpilot-chenwl-sync.netlify.app/)和[密码重设页面](https://englishpilot-chenwl-sync.netlify.app/reset-password/)已发布，账号由部署者创建，AI 访问额外限制为批准的用户。云数据库和未登录接口保护已验证，实际账号同步与设备验收进度见[验证记录](docs/qa/2026-10-26-account-sync.md)。网页无需 Mac 保持开机，安装版升级仍需按签名与设备流程处理。

部分手机网络无法访问原 Vercel 默认域名；上述 Netlify Free 备用站点已发布并完成 Mac 直连检查，手机实际登录仍待验证。自行部署可用 `npm run cloud:web:netlify` 生成部署包，按文档配置自己的平台账号；免费额度不保证永久连续在线。

## 内容来源

项目包含原创练习、公开许可词库和官方/第三方资源入口。外站链接不等于已复制整套试卷；不包含商业题库、九分学长题库、私人导入材料或官方完整试卷与音频。

NGSL、NAWL 和 BNC/COCA 的版本、署名、整理变化与许可见 [第三方声明](NOTICE.md)、[词库署名](public/open-vocabulary-attribution.txt) 和 `data-provenance/`。按来源合并的词头与词族不应当作考试官方规定的“必须掌握单词总数”。

## 质量记录

v0.1.3 补齐 AI 教师的安装版提示，并完成原有录音播放、断网重启和 App 内真实 AI 回复/点评复测；v0.1.2 修复 iPad 首次发音、退出后延迟朗读、录音权限提示、课程进入位置和日历状态问题，并整理安装版可用的操作入口。测试范围、结果与未验证场景见 [iPad 功能审计](docs/qa/2026-10-25-ipad-audit.md)。

## 许可

自有程序代码使用 [MIT](LICENSE)。`src/lib/data/open-vocabulary.json`、`public/vocabulary-ngsl-nawl.json` 及其中来源词表的整理数据按 **CC BY-SA 4.0** 保留原作者署名和相同方式共享要求；它们不被重新许可为 MIT。依赖及第三方内容保留各自许可。
