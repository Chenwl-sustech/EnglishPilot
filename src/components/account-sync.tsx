"use client";
import { useState } from "react";
import { Cloud, RefreshCw, Download, LogOut } from "lucide-react";
import { useAccountSync } from "./sync-provider";
import { useStudy } from "./study-context";
import { db, PilotDB, exportFullBackup } from "@/lib/db";
import { prepareAccountSpace } from "@/lib/sync/local";
import {
  activeSpace,
  accountDatabaseName,
  selectSpace,
} from "@/lib/sync/space";
import { parseSyncConfig, syncConfigKey } from "@/lib/sync/config";
import { supabaseCloud, forgetOfflineIdentity } from "@/lib/sync/client";
import { cloudSnapshot } from "@/lib/sync/engine";
import { encodeBackup } from "@/lib/backup";
import { saveExport } from "@/lib/native/files";
import { today } from "@/lib/engine";

export function AccountSync() {
  const emailRecoveryAvailable =
    process.env.NEXT_PUBLIC_SYNC_EMAIL_RECOVERY === "1";
  const sync = useAccountSync(),
    { state, fail, notify } = useStudy();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const [working, setWorking] = useState(false),
    [accepted, setAccepted] = useState(false),
    [importGuest, setImportGuest] = useState(state.profile.onboarded);
  const [url, setUrl] = useState(sync.config?.url ?? ""),
    [key, setKey] = useState("");
  const [recovery, setRecovery] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const space = activeSpace(),
    busy = working || sync.busy;
  const active = !!(
    space &&
    sync.user &&
    space.uid === sync.user.id &&
    space.project === sync.config?.url
  );
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setWorking(true);
    try {
      await action();
    } catch (e) {
      fail(e);
    } finally {
      setWorking(false);
    }
  }
  async function signIn() {
    if (!sync.client) throw new Error("请先配置账号云服务");
    const { error } = await sync.client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    setPassword("");
    notify("登录成功；请确认下方说明后进入账号学习空间");
  }
  async function activate() {
    if (!sync.user || !sync.config || !accepted) return;
    const account = new PilotDB(
      accountDatabaseName(sync.config.url, sync.user.id),
    );
    const guest = new PilotDB("EnglishPilot");
    try {
      await prepareAccountSpace(
        guest,
        account,
        sync.config.url,
        sync.user.id,
        importGuest,
      );
      sync.invalidate();
      selectSpace({ project: sync.config.url, uid: sync.user.id });
    } finally {
      account.close();
      guest.close();
    }
  }
  async function exportCopy(cloud: boolean) {
    let file: Blob;
    if (cloud) {
      if (!sync.client || !sync.config || !sync.user) return;
      const snapshot = await cloudSnapshot(
        supabaseCloud(sync.client, sync.config.url, sync.user.id),
      );
      file = await encodeBackup(
        snapshot.state,
        snapshot.recordings,
        snapshot.listeningAudio,
      );
    } else file = await exportFullBackup();
    const result = await saveExport(
      file,
      `englishpilot-${cloud ? "cloud" : "local"}-${today()}.epbackup`,
    );
    notify(result === "canceled" ? "已取消导出" : "完整备份已导出，包含录音");
  }
  const status = {
    local: space
      ? sync.offlineOwner === space.uid
        ? "离线账号副本可用；恢复联网后续期登录并同步"
        : "未登录当前账号，自动同步已暂停"
      : "本机空间 · 尚未启用云同步",
    syncing: "正在同步，请保持网络连接…",
    synced: "已同步",
    pending: "本机有新变化，等待下一次同步",
    conflict: "两端有冲突，已暂停自动同步",
    error: "同步未完成，本机数据仍保留",
  }[sync.status];
  return (
    <section
      className="panel account-sync"
      id="account-sync"
      aria-label="账号与跨设备同步"
    >
      <div className="section-line">
        <div>
          <span className="eyebrow">ONE ACCOUNT · ALL YOUR DEVICES</span>
          <h2>账号与跨设备同步</h2>
        </div>
        <Cloud size={26} />
      </div>
      <p>
        iPhone、iPad
        和鸿蒙手机浏览器登录同一学习账号，联网后同步目标、词库、练习记录、作文草稿、对话和录音。断网仍可使用当前设备保存的内容；应用回到前台或恢复联网后再同步。
      </p>
      <p role="status" data-testid="account-sync-status">
        {status}
        {sync.meta?.lastSync
          ? ` · 上次成功：${new Date(sync.meta.lastSync).toLocaleString()}`
          : ""}
      </p>
      {sync.error && <p role="alert">{sync.error}</p>}
      {!sync.config && (
        <p className="muted">
          账号云服务尚未配置。完成免费 Supabase
          项目配置后即可启用；当前学习记录仍在本机。
        </p>
      )}
      <details>
        <summary>云服务配置（部署者）</summary>
        <div className="form-grid">
          <label>
            Supabase 项目地址
            <input
              type="url"
              value={url}
              placeholder="https://项目编号.supabase.co"
              onChange={(e) => setUrl(e.target.value)}
              disabled={!!space || !!sync.user || busy}
            />
          </label>
          <label>
            Publishable / anon 公开 Key
            <input
              value={key}
              autoComplete="off"
              placeholder={
                sync.config ? "已配置；仅更换服务时填写" : "sb_publishable_…"
              }
              onChange={(e) => setKey(e.target.value)}
              disabled={!!space || !!sync.user || busy}
            />
          </label>
        </div>
        <p className="small muted">
          仅填写公开 Key。service_role、secret Key、AI Key
          和账号密码不能填在这里。更换云项目须先退出账号并返回本机空间。
          <a
            href="https://github.com/Chenwl-sustech/EnglishPilot/blob/main/docs/account-sync.md"
            target="_blank"
            rel="noreferrer"
          >
            配置说明 ↗
          </a>
        </p>
        <button
          className="button secondary"
          disabled={!!space || !!sync.user || busy}
          onClick={() =>
            void perform(async () => {
              const config = parseSyncConfig({ url, key });
              localStorage.setItem(syncConfigKey, JSON.stringify(config));
              window.location.reload();
            })
          }
        >
          保存云服务配置
        </button>
      </details>
      {sync.client && !sync.user && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(signIn);
          }}
        >
          <div className="form-grid">
            <label>
              学习账号邮箱
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label>
              {recovery ? "新密码（至少 8 位）" : "学习账号密码"}
              <input
                type="password"
                autoComplete={recovery ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={recovery ? 8 : 1}
                required
                disabled={busy}
              />
            </label>
          </div>
          <div className="actions">
            <button
              className="button primary"
              type="submit"
              disabled={busy || recovery}
            >
              登录学习账号
            </button>
            {process.env.NEXT_PUBLIC_SYNC_SIGNUP === "1" && (
              <button
                className="button secondary"
                type="button"
                disabled={busy || password.length < 8 || !email}
                onClick={() =>
                  void perform(async () => {
                    const { error } = await sync.client!.auth.signUp({
                      email: email.trim(),
                      password,
                    });
                    if (error) throw error;
                    setPassword("");
                    notify(
                      "请查看邮箱并完成确认，再回此处登录；若没有邮件，请联系部署者检查 SMTP",
                    );
                  })
                }
              >
                注册学习账号
              </button>
            )}
            <button
              className="button secondary"
              type="button"
              disabled={busy || !email || !emailRecoveryAvailable}
              onClick={() =>
                void perform(async () => {
                  const { error } =
                    await sync.client!.auth.resetPasswordForEmail(email.trim());
                  if (error) throw error;
                  setRecovery(true);
                  setPassword("");
                  notify(
                    "已请求重置邮件；请填写邮件中的验证码。未收到时请检查云端邮件配置",
                  );
                })
              }
            >
              {emailRecoveryAvailable
                ? "忘记密码／发送验证码"
                : "邮件找回尚未启用"}
            </button>
          </div>
          {!emailRecoveryAvailable && (
            <p className="small muted">
              此个人云项目尚未配置找回密码邮件。如需重设，请使用自己的云项目管理账号处理。
            </p>
          )}
          {recovery && emailRecoveryAvailable && (
            <>
              <label>
                邮件中的重置验证码
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>
              <div className="actions">
                <button
                  className="button primary"
                  type="button"
                  disabled={busy || !code || password.length < 8}
                  onClick={() =>
                    void perform(async () => {
                      const { error } = await sync.client!.auth.verifyOtp({
                        email: email.trim(),
                        token: code.trim(),
                        type: "recovery",
                      });
                      if (error) throw error;
                      const updated = await sync.client!.auth.updateUser({
                        password,
                      });
                      if (updated.error) throw updated.error;
                      setPassword("");
                      setCode("");
                      setRecovery(false);
                      notify("密码已更新，请进入账号学习空间");
                    })
                  }
                >
                  验证并设置新密码
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setRecovery(false);
                    setPassword("");
                  }}
                >
                  返回登录
                </button>
              </div>
            </>
          )}
          <p className="small muted">
            学习账号由此云项目管理，与 Supabase
            控制台管理员账号分开。私用部署可由管理员创建；公开注册需要先配置邮件服务。
          </p>
        </form>
      )}
      {sync.user && (
        <>
          <p>
            当前学习账号：<strong>{sync.user.email}</strong>
          </p>
          {!active && (
            <div className="feature-note">
              <p>
                进入账号空间后，将按此账号同步到 Supabase 云项目{" "}
                <strong>{sync.config?.url}</strong>
                。内容包括个人学习设置、练习文字、导入的词库、全部录音和素材音频。账号会话与
                AI 密钥不进入学习备份。原本机空间会保留。
              </p>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={importGuest}
                  onChange={(e) => setImportGuest(e.target.checked)}
                  disabled={busy}
                />
                首次在此设备使用该账号时，带入本机学习数据（含录音）
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  disabled={busy}
                />
                我已了解上传内容，同意在此云项目启用账号同步
              </label>
              <button
                className="button primary"
                disabled={busy || !accepted}
                onClick={() => void perform(activate)}
              >
                进入账号空间并启用同步
              </button>
              <p className="small muted">
                如果这个账号已经在此设备使用过，将继续原账号副本；不会重复导入本机数据。两端已有内容时可能需要处理首次同步冲突。
              </p>
            </div>
          )}
          {active && (
            <>
              <div className="actions">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void sync.run()}
                >
                  <RefreshCw size={16} />
                  立即同步
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void perform(() => exportCopy(false))}
                >
                  <Download size={16} />
                  导出本机副本
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void perform(() => exportCopy(true))}
                >
                  <Download size={16} />
                  导出云端副本
                </button>
              </div>
              {sync.meta?.conflict && (
                <div role="alert" className="feature-note">
                  <h3>请处理同步冲突</h3>
                  <p>
                    同一内容在两端被修改，系统保留当前本机与云端版本。建议先分别导出两份完整备份，再选择本轮使用哪一份。
                  </p>
                  <p className="small">
                    {sync.meta.conflict.paths.slice(0, 8).join("；")}
                  </p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                      disabled={busy}
                    />
                    已检查两份数据，了解下方操作将采用选定副本替换另一端的冲突内容
                  </label>
                  <div className="actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        setReviewed(false);
                        void sync.run("recheck");
                      }}
                    >
                      重新检查冲突
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy || !reviewed}
                      onClick={() => {
                        setReviewed(false);
                        void sync.run("local");
                      }}
                    >
                      采用本机副本并更新云端
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy || !reviewed}
                      onClick={() => {
                        setReviewed(false);
                        void sync.run("cloud");
                      }}
                    >
                      采用云端副本更新本机
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                sync.invalidate();
                const { error } = await sync.client!.auth.signOut({
                  scope: "local",
                });
                if (error) throw error;
                selectSpace(null);
              })
            }
          >
            <LogOut size={16} />
            退出此设备账号，返回本机空间
          </button>
        </>
      )}
      {space && !active && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            sync.invalidate();
            selectSpace(null);
          }}
        >
          返回原本机学习空间（保留账号离线副本）
        </button>
      )}
      {!sync.user && sync.offlineOwner && sync.config && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              sync.invalidate();
              sync.client?.auth.stopAutoRefresh();
              await forgetOfflineIdentity(sync.config!);
              selectSpace(null);
            })
          }
        >
          离线退出此设备账号，返回本机空间
        </button>
      )}
      <p className="small muted">
        云同步需联网，应用关闭后不会持续后台同步。免费云服务有容量和休眠限制；离线改动会保留在本机，建议继续定期导出完整备份。AI
        服务的设备配对与额度另行配置。
      </p>
    </section>
  );
}
