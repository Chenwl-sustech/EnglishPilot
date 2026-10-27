"use client";
import { useEffect, useRef, useState } from "react";
import { readSyncConfig } from "@/lib/sync/config";
import { createPasswordRecovery } from "@/lib/sync/password-recovery";
import { nativeBuild } from "@/lib/native/runtime";

export function PasswordRecovery() {
  const flow = useRef<ReturnType<typeof createPasswordRecovery> | null>(null);
  const started = useRef(false);
  const [phase, setPhase] = useState<
    "loading" | "request" | "password" | "done" | "off"
  >("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (phase !== "request") return;
    const timer = window.setInterval(
      () => setRetrySeconds(flow.current?.retryAfterSeconds() ?? 0),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const raw = window.location.href;
    const clear = () =>
      window.history.replaceState(null, "", "/reset-password/");
    const config = readSyncConfig();
    if (
      nativeBuild ||
      process.env.NEXT_PUBLIC_SYNC_EMAIL_RECOVERY !== "link" ||
      !config
    ) {
      clear();
      setPhase("off");
      return;
    }
    try {
      flow.current = createPasswordRecovery(config, window.localStorage);
      void flow.current
        .consume(raw, clear)
        .then((address) => {
          if (address) {
            setEmail(address);
            setPhase("password");
          } else setPhase("request");
        })
        .catch((error) => {
          setMessage(error.message);
          setPhase("request");
        });
    } catch {
      clear();
      setMessage("无法初始化重设服务，请检查浏览器存储和云配置");
      setPhase("off");
    }
  }, []);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "暂时无法连接重设服务，请重试",
      );
    } finally {
      setRetrySeconds(flow.current?.retryAfterSeconds() ?? 0);
      setBusy(false);
    }
  }
  return (
    <main style={{ maxWidth: 620, margin: "56px auto", padding: 24 }}>
      <a href="/">EnglishPilot · 返回学习登录</a>
      <section className="card" style={{ marginTop: 24, padding: 24 }}>
        <h1>重设学习账号密码</h1>
        <p className="muted">
          重设后保留原账号和学习数据。新密码由你本人填写，请勿发送到聊天。
        </p>
        {phase === "loading" && <p role="status">正在检查重设入口…</p>}
        {phase === "off" && (
          <p>此部署尚未启用邮件链接重设，请联系云项目管理员。</p>
        )}
        {phase === "request" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                await flow.current!.request(email, window.location.origin);
                setMessage(
                  "已请求重设邮件。请检查收件箱和垃圾邮件，并在本次请求使用的同一浏览器打开链接。没有收到时请稍后重试或联系部署者。",
                );
              });
            }}
          >
            <label>
              学习账号邮箱
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
            <button
              type="submit"
              className="button primary"
              disabled={busy || retrySeconds > 0}
            >
              {busy
                ? "正在请求…"
                : retrySeconds > 0
                  ? `请等待 ${retrySeconds} 秒`
                  : "发送密码重设邮件"}
            </button>
            <p className="small muted">
              个人免费云项目的默认邮件仅面向项目成员邮箱，并有发送频率限制。
              请勿连续发送；更换浏览器或重新发送后，须使用相应请求的最新邮件。
            </p>
          </form>
        )}
        {phase === "password" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                await flow.current!.finish(password, confirmation);
                setPassword("");
                setConfirmation("");
                setPhase("done");
              });
            }}
          >
            <p>
              正在为 <strong>{email}</strong> 设置新密码。
            </p>
            <label>
              新密码（8–128 位）
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              再次输入新密码
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={busy}
              />
            </label>
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "正在保存…" : "确认设置新密码"}
            </button>
          </form>
        )}
        {phase === "done" && (
          <p role="status">
            密码已更新。<a href="/">返回学习网页</a>，用邮箱和新密码登录。
          </p>
        )}
        {message && (
          <p role="status" style={{ marginTop: 16 }}>
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
