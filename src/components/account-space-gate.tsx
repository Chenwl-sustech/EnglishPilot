"use client";
import { useAccountSync } from "./sync-provider";
import { AccountSync } from "./account-sync";
import { activeSpace } from "@/lib/sync/space";
import { accountAccess } from "@/lib/sync/access";
export function AccountSpaceGate({ children }: { children: React.ReactNode }) {
  const sync = useAccountSync();
  const access = accountAccess(
    activeSpace(),
    sync.ready,
    sync.user?.id ?? null,
    sync.config?.url ?? null,
    sync.offlineOwner,
  );
  if (access === "loading")
    return (
      <div className="loading-screen">
        <h2>正在读取账号会话…</h2>
        <p>离线副本仍保存在此设备。</p>
      </div>
    );
  if (access === "login")
    return (
      <main
        className="onboarding"
        style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}
      >
        <h1>请登录学习账号</h1>
        <p>
          为避免混用其他账号的数据，登录后再打开对应学习空间。也可返回原本机空间继续离线学习。
        </p>
        <AccountSync />
      </main>
    );
  return children;
}
