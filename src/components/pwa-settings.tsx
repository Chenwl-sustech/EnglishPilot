"use client";
import { useState } from "react";
import { usePwa } from "./pwa-provider";
import { nativeBuild } from "@/lib/native/runtime";

export function PwaSettings() {
  const pwa = usePwa(),
    [storage, setStorage] = useState(""),
    [updating, setUpdating] = useState(false);
  if (!pwa) return null;
  if (nativeBuild) return (
    <section className="panel" aria-label="安装版与离线资源">
      <h2>安装版与离线资源</h2>
      <p data-testid="native-resources-status">学习界面与内置题库已随应用提供，无需联网下载应用页面。</p>
      <p>学习记录与录音保存在此应用中。换设备前请导出完整备份；卸载应用可能删除本地记录。在线 AI 和素材服务需要单独连接后端。</p>
    </section>
  );
  async function retain() {
    try {
      const kept = await navigator.storage?.persist?.();
      setStorage(
        kept
          ? "浏览器已允许持久保存。仍建议定期导出完整备份。"
          : "浏览器未授予持久保存；请定期导出完整备份，避免清理网站数据后丢失记录。",
      );
    } catch {
      setStorage("当前浏览器不能申请持久保存，请使用完整备份保护记录。");
    }
  }
  return (
    <section
      className="panel pwa-settings"
      id="install-app"
      aria-label="手机与平板安装"
    >
      <h2>手机与平板安装</h2>
      <p>
        部署到 HTTPS 地址后，可在 iPhone、iPad
        或鸿蒙浏览器打开并添加至主屏幕。ZIP
        是服务器部署包，需要先部署后访问网址。
      </p>
      <p role="status" data-testid="pwa-offline-status">
        {pwa.offline ? "当前离线" : "当前在线"} ·{" "}
        {pwa.ready ? "离线资源已就绪" : "正在准备离线资源"}
        {pwa.installed ? " · 已从主屏幕运行" : ""}
      </p>
      {pwa.error && <p role="alert">{pwa.error}</p>}
      <div className="actions">
        {pwa.canInstall && (
          <button className="button primary" onClick={() => void pwa.install()}>
            安装 EnglishPilot
          </button>
        )}
        <button className="button secondary" onClick={() => void pwa.refresh()}>
          检查离线资源与更新
        </button>
        <button className="button secondary" onClick={() => void retain()}>
          申请保留本机学习数据
        </button>
        {pwa.updateReady && (
          <button
            className="button secondary"
            onClick={() => {
              setUpdating(true);
              pwa.applyUpdate();
            }}
          >
            保存当前练习后更新应用
          </button>
        )}
      </div>
      {updating && (
        <p role="status">
          已请求更新。如未自动切换，请关闭所有 EnglishPilot
          标签页及桌面窗口，再重新打开。已保存的学习记录会保留。
        </p>
      )}
      {storage && <p role="status">{storage}</p>}
      <ol>
        <li>
          <strong>iPhone / iPad：</strong>使用 Safari 打开部署网址，分享 →
          添加到主屏幕；系统提供时启用“作为网页 App 打开”。
        </li>
        <li>
          <strong>鸿蒙：</strong>华为浏览器打开网址，菜单 →
          添加至桌面；菜单名称随系统版本有所不同。未提供独立窗口时仍可使用浏览器。
        </li>
      </ol>
      <p className="small muted">
        首次联网且显示“离线资源已就绪”后，可断网使用已保存的课程、词汇复习、小测与记录。AI
        和素材下载需要网络。录音和导入音频保存在当前设备；电脑与手机不会自动同步。换设备请导出并导入完整备份，勿只保留
        JSON。
      </p>
    </section>
  );
}
