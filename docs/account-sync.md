# 账号与跨设备同步

本功能使用 **Supabase Auth + PostgreSQL + 私有 Storage**，Mac 关机后仍由云服务处理同步。现有 Vercel AI 服务保持独立；学习账号不自动获得任何私人 AI 配对令牌。

当前个人部署的[手机网页预览](https://englishpilot-sync.vercel.app/)已可访问。首次页面展开“已有学习账号？登录并同步到此设备”，使用管理员已创建的学习账号。网页与云服务已部署，登录后的同步和真实双设备验收仍在进行，进度见[验证记录](qa/2026-10-26-account-sync.md)。v0.1.3 安装包尚未包含此功能。

## 当前接入范围

- iPhone / iPad：更新后的 iOS 安装版；账号会话存储在设备钥匙串。最低 iOS 15，实际系统兼容性以 Xcode / 设备为准。
- iPhone、iPad 和华为鸿蒙手机：部署后的 HTTPS 网页，可在 Safari / 华为浏览器使用并按系统提供的菜单添加到主屏幕。
- 现有 Harmony 原生工程尚未提供账号会话安全存储接口，因此这一版不在 Harmony 原生包里保存会话；请使用手机浏览器。账号数据协议相同，后续原生接口可继续复用。
- 页面前台每 60 秒检查，数据修改后防抖 10 秒，联网恢复或回到前台也会同步。关闭应用后不保证后台同步；离开设备前可点“立即同步”并核对成功时间。

## 免费云项目配置

1. 本人注册 / 登录 [Supabase](https://supabase.com/dashboard)，在 Free 组织中新建专用于 EnglishPilot 的项目。数据库管理员密码由本人填写并保存；不要提交给源码或发到聊天。
2. 在 SQL Editor 中执行 [202610260001_account_sync.sql](../supabase/migrations/202610260001_account_sync.sql)。它创建账号隔离的数据表、比较交换 RPC 和 private bucket `englishpilot-sync`，不会读取或导入本机学习记录。
3. 项目 API 页面复制 **Project URL** 和 **publishable key**（旧式 anon key 也支持）。不要复制 secret / service_role。
4. 配置公开构建变量：

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
   NEXT_PUBLIC_SYNC_SIGNUP=0
   ```

   Web 需部署此仓库的 Next.js 前端并重新构建。完整前端在 Vercel 上保留原有 `ENGLISHPILOT_ACCESS_HASH` 站点访问保护，未配置会返回 503。部署者需自行设置站点入口用户名和密码，将 UTF-8 字符串 `用户名:密码` 的 SHA-256 十六进制值保存为服务端环境变量 `ENGLISHPILOT_ACCESS_HASH`（不要把明文或哈希提交到仓库）。站点入口的访问凭据与学习账号是两道独立验证，不要通过删除保护来公开原来的 AI 接口。现有 `englishpilot` 项目的框架设置需先核实，不应直接覆盖不匹配的项目。

   安装版需在 `npm run native:build` 前将相同的公开变量提供给 shell 环境，再按原安装说明编译覆盖安装。例如：

   ```sh
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY npm run native:build
   ```

   原生构建会在独立暂存目录运行，原项目的 `.env.local` 不会被复制；因此不要只把变量写入原目录的 `.env.local` 后就假定已生效。也可在设置 → 账号与跨设备同步 → 云服务配置中手动输入 URL 和公开 Key；未配置时不会上传。

5. 私人使用：在 Authentication → Users 中创建个人学习账号，填写邮箱和本人选择的密码，按控制台选项完成邮箱确认；然后关闭项目的公开注册。创建登录凭据与密码步骤由本人操作。**学习账号与 Supabase 控制台管理员账号是两回事。**
6. 在 iPad 登录学习账号。确认上传范围，首次关联时选择“带入本机学习数据（含录音）”，再点“进入账号空间并启用同步”。原本机空间保留，新的账号副本开始同步。首次也有云端数据时会保守提示冲突。
7. 在手机打开已部署网址或更新后的 iOS 安装版，首次页面可展开“已有学习账号？登录并同步到此设备”。使用同一个学习账号，空的新设备不要勾选带入本机数据。启用后接收云端数据。

## 手机网页与同账号 AI（免费部署变体）

独立部署使用 `npm run cloud:web:build`，生成 `.local/account-web-deploy`。该目录包含公开静态页面与单独的 Vercel AI 函数，不部署原完整 Next.js 站点的本地服务；原站点的 Basic 访问保护不改动。

构建前提供 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。静态构建只接收这些公开配置和必要系统环境，排除全部私人 AI 凭据。发布到新的 Vercel Hobby 项目，避免覆盖原来的 `englishpilot` 或 `englishpilot-ai-free` 项目。

在新项目的 **服务端** 配置以下运行时环境变量；不能写入 `NEXT_PUBLIC_*`、静态文件、公开仓库或截图：

- `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`：同一云项目。
- `ENGLISHPILOT_ALLOWED_USERS`：管理员明确批准使用私人 AI 的学习账号 uid，以逗号分隔；空值时拒绝 AI 调用。
- `AI_BACKEND_ORIGIN`：现有私人 AI 后端的 HTTPS 根地址。
- `AI_BACKEND_TOKEN`：后端设备访问凭据，使用云平台 Secret 环境变量保存。

网页使用当前账号会话调用同源接口，网关向 Supabase 验证身份，并检查 uid 白名单；仅转发四个既有 AI JSON 路径。用户 JWT、浏览器 Cookie 和 Origin 不转发给私人 AI 后端。每日 AI 额度继续由原后端共享累计，模型调用费与此前相同。

未登录、账号未获批准、运行时配置缺失或验证失败时不调用 AI。网页的 Whisper 本地转写等依赖 Mac 的服务仍不可用；可保存录音并手工核对文字。账号同步直接使用 Supabase 的 RLS 和私有 Storage，网页关闭后的后台同步仍不保证。

## Netlify 免费备用部署

若手机所在网络无法访问 Vercel 默认域名，可先在手机测试 Netlify 官方演示站是否可达，再准备独立备用站点。已有学习账号和 Supabase 数据不变；新站点第一次登录时使用同一学习账号，未启用前不会自动上传本机资料。

在原有公开 Supabase 构建变量之外，按需要设置 `NEXT_PUBLIC_SYNC_EMAIL_RECOVERY=link`，执行 `npm run cloud:web:netlify`。输出 `.local/account-netlify-deploy`，其中 `public/` 才是发布目录，`functions/` 和 `server/` 是服务器文件；环境文件和私人 AI 凭据不会复制进去。不要把整个目录作为纯静态文件上传。

使用本人 Netlify Free 账号，通过官方 CLI 在输出目录构建 / 部署函数与静态页面。五项服务器环境变量与上方 Vercel 网关一致，另将函数运行时设置为 Node 24（`AWS_LAMBDA_JS_RUNTIME=nodejs24.x`）。不要把这些服务器变量改成 `NEXT_PUBLIC_*`。新网关仍验证 Supabase 会话和批准账号，再由服务器转发至原私人 AI 后端。

取得自己的 `https://你的站点.netlify.app` 地址后，在 Supabase 的 Redirect URLs 添加精确的 `https://你的站点.netlify.app/reset-password/`，不要使用通配符。原 Vercel 回调可继续保留；新域名的浏览器存储与旧站点分开，须在**新站点的目标浏览器**重新请求恢复邮件，不能继续使用在旧站点 / 其他浏览器发起的 PKCE 邮件。

Netlify [Free 计划](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)有每月 credit 上限，达到限额后可能暂停；模型调用费仍由原服务商账号承担。其[同步函数默认限时 60 秒](https://docs.netlify.com/build/functions/configuration/)，此适配器在 55 秒网络期限前返回 JSON 错误，不自动重试 AI。慢请求的额度仍以原后端账本为准。更换托管平台不保证所有网络长期可达，必须继续实测手机网页、Auth、音频和 AI。

## 邮件、公开注册与找回密码

Supabase 默认邮件服务只向项目组织成员邮箱发送，当前额度为每小时 2 封，不适合公开注册。私人部署可以先在控制台创建并确认自己的账号；需要向其他邮箱发送注册 / 找回邮件时必须配置自己的 SMTP 服务。参见 [官方 SMTP 说明](https://supabase.com/docs/guides/auth/auth-smtp)。

公开注册需同时在项目 Auth 设置中允许注册、配置 SMTP，并在前端构建时设置 `NEXT_PUBLIC_SYNC_SIGNUP=1`。确认邮件链接完成邮箱验证后，回应用使用邮箱和密码登录。建议开启项目提供的注册保护，避免公开项目被滥用；注册对云服务条款的确认由部署者负责。

邮件找回默认关闭（`NEXT_PUBLIC_SYNC_EMAIL_RECOVERY=0`），部署者可以选择下面一种方式。

手机网页可设置 `NEXT_PUBLIC_SYNC_EMAIL_RECOVERY=link` 后重新执行 `npm run cloud:web:build`，启用“忘记密码／重设密码”及 `/reset-password/` 页面。使用 Supabase 官方 PKCE 邮件链接，不需要修改默认邮件模板。先将 Auth → URL Configuration 的 Site URL 设为实际 HTTPS 网页根地址，并在 Redirect URLs 添加**精确的** `https://你的域名/reset-password/`。默认邮件仍仅面向项目组织成员邮箱；其他邮箱须配置 SMTP。当前个人网页预览采用此方式，实际收信与新密码提交仍须本人完成。

在重设页面请求邮件后，须在**发起请求的同一浏览器**打开邮件链接；必要时把邮件链接复制到该浏览器地址栏，切勿发送到聊天。网页立即清除回调参数，只将临时授权码用于 PKCE 交换，不处理 URL 中的 access token。恢复客户端与学习会话隔离，仅将有期限的 PKCE verifier 保存到自己的本地命名空间，恢复会话只在内存；验证后十分钟内本人输入两次新密码。重设完成返回首页正常登录，不自动启用或上传学习数据。链接过期、使用不同浏览器或刷新已清除链接的重设表单时，重新请求邮件即可。

配置了自有邮件服务及验证码模板的部署，可继续使用**邮件验证码**方式：设置 `NEXT_PUBLIC_SYNC_EMAIL_RECOVERY=1` 重新构建。此方式不把会话放进 URL，须先配置下方模板并实际验证收信。

在 Authentication → Email Templates → Reset Password 模板中加入：

```html
<h2>重设 EnglishPilot 学习账号密码</h2>
<p>验证码：{{ .Token }}</p>
<p>请回应用填写验证码和新密码；未请求重置时可忽略本邮件。</p>
```

不要把普通 magic link 当作此界面的验证码。配置后实际测试一次“发送验证码 → 输入验证码 → 设置新密码 → 两台设备重新登录”。官方说明：[邮件模板与 Token](https://supabase.com/docs/guides/auth/auth-email-templates)。

## 隔离、冲突和恢复

- 本机空间仍是旧的 `EnglishPilot` IndexedDB。每个云项目、每个 uid 都有单独的账号数据库；返回本机 / 切换账号会重载页面，其他窗口也会重载以避免混用。
- 未登录匹配账号时，界面不会打开该账号的离线学习内容。浏览器本地存储本身不是加密保险箱；设备与浏览器账户仍需由本人保护。
- 已登录过且仍保留本设备会话时，即使 access token 过期又断网，仍可打开对应账号的本机副本；云端写入仍必须重新通过服务端身份检查。联网恢复后尝试续期。离线退出会移除此设备的会话，不影响其他设备；退出后需要再次登录才能打开该账号空间。
- 账号空间启用时上传：考试目标、个人设置、练习与错题、词库、作文 / 对话、全部原始录音、导入素材音频。不上传 API Key、AI 配对令牌和学习账号密码到同步文档。会话在独立安全存储 / 同源浏览器存储中。
- 云端读取通过 `auth.uid() = user_id` 的 RLS，提交 RPC 只写当前 JWT 用户。普通客户端不能直接改数据表，也不能覆盖或删除私有 bucket 的历史分块。
- 数据先写本地，再上传音频，最后按云端 revision 原子提交。SHA-256 和结构校验通过之后才恢复到本地。网络失败、容量不足或校验失败均不清空本机数据。
- 独立变更会合并。相同草稿、同一复习卡或无法确定顺序的数组并发修改时暂停自动同步。先导出“本机副本”和“云端副本”，检查后选择采用哪份；本轮选择只对展示时的版本有效，期间再变化须重新检查。
- 冲突选择会采用选中副本中的冲突内容；不要假定系统能自动拼接两篇作文或两段有序对话。保留两份 `.epbackup`，必要时再人工转移所需内容。
- 云同步不是独立备份替代品。此版不自动清理旧音频分块；多次重录会逐渐占用空间。额度不足时先导出完整备份，由项目管理员确认保留策略后管理云存储。
- 恢复 `.epbackup` 会作为本地学习修改参与下一轮同步；若其他设备也有改动，可能需要处理冲突。不要为解决冲突先卸载应用。

## 额度与真实验收

截至 2026-10-26，Supabase [Free 计划](https://supabase.com/pricing)列出 500 MB 数据库、1 GB 文件存储、5 GB egress、5 GB cached egress；连续 1 周无活动可能暂停，最多 2 个活跃免费项目。是否可用与实际控制台状态及额度为准，不能承诺永久免费连续在线。音频使用 4 MiB 分块，适配免费版单文件限制；单份同步快照沿用本地备份的 512 MiB 总上限和 20 MiB 清单上限。

上线前必做：

1. 在独立测试账号 A / B 上验证 A 看不到 B 的表与文件，匿名不可访问；两端用旧 revision 同时提交只有一个成功。
2. A 在设备一写一条合成草稿并录一段无私人内容的测试音频，设备二登录后核对文字、字节和播放。
3. 断网编辑再联网，验证恢复；两端改同一草稿应提示冲突，导出后明确选择；上传期间继续输入不能被覆盖。
4. 退出 A 登录 B，B 界面不能显示 A 的学习记录；再登录 A 恢复其自己的副本。
5. 以上测试通过后，再由本人在原 iPad 明确启用个人数据上传。

代码和本地 PostgreSQL / IndexedDB 测试通过，只说明实现具备验证基础；未配置真实云项目、未做双设备验收时，不能称为云同步已上线。
