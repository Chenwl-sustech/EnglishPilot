# HarmonyOS 开发与安装

鸿蒙版复用离线学习页面和题库，以 ArkWeb 承载界面。源码在 `feature/harmony-adaptation` 分支。当前产物是**未签名调试 HAP**：已在本地手机模拟器安装运行，不能直接作为公开分发或真机签名安装包。实际验收范围见 [2026-11-01 验收记录](qa/2026-11-01-harmony.md)。

## 编译

要求 Node 22+、DevEco Studio 及配套 HarmonyOS SDK、Hvigor、OHPM、Java。此次验证：Mac arm64、DevEco 26.0.0.865、SDK 26.0.0.105、Hvigor 6.26.9、Java 25。构建使用当前 SDK 默认编译版本，保留最低与目标 `5.0.0(12)`；API 12 真机仍未验证。不要重新添加与 DevEco 26 不兼容的旧 `compileSdkVersion` 配置。

```sh
npm ci
npm run native:build
npm run native:harmony:build
```

`native:build` 生成静态页面并同步至 ArkWeb rawfile；`native:sync` 仅同步已有页面与桥接共享策略。构建输出：

```
native/harmony/entry/build/default/outputs/default/entry-default-unsigned.hap
```

在 DevEco 中打开 `native/harmony`。实际手机安装需要自己的华为开发者账号、设备调试授权和有效开发签名配置；默认包名 `com.example.englishpilot` 是开发包名，正式发布前需确定自己的包名、签名与后续升级身份。不要卸载已有学习应用来更新；先导出含录音完整备份。

Mac 本次环境可先执行 `source ~/.config/englishpilot/harmony-env.zsh`；该文件是本机配置，不在仓库内。Windows 安装路径不同，参照 [Windows Codex 提示词](windows-harmony-codex-prompt.zh-CN.md)。

## 账号、AI 与隐私

编译前可设置公开配置 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，与现有网页版指向同一项目。它们是客户端公开配置，不能用服务端密钥替代。既有 Netlify AI 接口由学习账号授权；服务端模型 Key、配对令牌、签名私钥均不应进入源码、HAP、备份或日志。

- ArkWeb 只加载内置 `https://englishpilot.local` 页面，保留资源映射和 CSP 限制。
- 网络经原生 HTTPS 桥接，只允许已定义的账号、同步、私有音频与 AI 路由；禁用自动重定向，限制请求数与传输大小。
- 会话使用系统 Asset Store 加密存储；采用分块与原子提交标记支持长会话。不可用时明确失败，不降级到明文。
- 系统返回键、确认弹窗与文字输入弹窗由原生宿主处理。仅调试包开启 ArkWeb CDP 检查。
- 本地 Core Speech Kit 英语声音使用 Laura；设置页可以检测、下载和试听。下载由系统确认。合成文本留在本机，PCM 转 WAV 后由播放器提供暂停和变速。部分模拟器系统声音下载失败，不代表真实手机已验证成功；缺声音时显示错误和重试入口，不伪造成功。

## 模拟器验收

推荐已验证录音正常的 **HarmonyOS 6.0.0.48 / API 20 ARM** 手机镜像。本次 API 26 镜像的录音仅返回极短容器；使用 API 20 后约 5 秒录音完整播放。两镜像的英语声音下载都尚未成功。

先启动模拟器、解锁、安装 HAP 并完成初始设置，称呼设为 **Harmony QA**。测试脚本会修改该合成测试学习空间；不要用于个人学习数据。首次键盘向导应先完成基本输入设置。HDC 默认为本地 `127.0.0.1:5555`；可用 `HARMONY_TARGET` 调整另一个本地模拟器端口。测试专用 CDP 端口默认为 9227。

```sh
node tests-harmony/native-bridges.mjs
node tests-harmony/app-acceptance.mjs
node tests-harmony/system-back.mjs
node tests-harmony/dialogs.mjs
node tests-harmony/mock-exam.mjs
# 已在系统设置中允许麦克风后（不重复测拒绝步骤）：
HARMONY_RECORDING_GRANTED=1 node tests-harmony/recording.mjs
```

`recording.mjs` 不设置变量时尝试使用官方 ATM 调试工具重置/恢复权限，适用于支持该工具的镜像；API 20 镜像需通过系统设置操作。结果与截图只保存至被 Git 忽略的 `.local/harmony-qa`。真实录音听感、真机签名、真实账号双向同步与 AI 回复仍需单独核验，不能由上述测试代替。
