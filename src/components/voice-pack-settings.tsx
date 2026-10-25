"use client";
import { apiFetch } from "@/lib/native/api";


import { useCallback, useEffect, useRef, useState } from "react";
import type {
  VoicePackLocale,
  VoicePackStatus,
} from "@/lib/server/voice-packs";

const phaseLabels = {
  "awaiting-confirmation": "等待 Windows 管理员确认",
  preparing: "检查系统组件",
  "installing-basic": "下载并安装基础语言组件",
  "installing-tts": "下载并安装语音组件",
  complete: "系统组件安装完成，等待实际声音检测",
  failed: "安装未完成",
};
const packLabels: Record<string, string> = {
  unsupported: "此系统不支持 Windows 语音包安装",
  ready: "已检测到真实本地声音，可生成 WAV",
  "installed-unavailable": "组件已安装，但系统尚未提供可用声音",
  unknown: "组件安装状态待确认，尚未检测到可用声音",
  "not-installed": "语音组件尚未安装",
};

export function VoicePackSettings({
  onVoicesChanged,
}: { onVoicesChanged?: () => void } = {}) {
  const [status, setStatus] = useState<VoicePackStatus | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [previewing, setPreviewing] = useState<VoicePackLocale | null>(null);
  const [selected, setSelected] = useState<
    Partial<Record<VoicePackLocale, string>>
  >({});
  const [previews, setPreviews] = useState<
    Partial<Record<VoicePackLocale, string>>
  >({});
  const changed = useRef(onVoicesChanged);
  const completed = useRef("");
  useEffect(() => {
    changed.current = onVoicesChanged;
  }, [onVoicesChanged]);
  const load = useCallback(
    async (action?: "install" | "refresh", locale?: VoicePackLocale) => {
      if (action) setWorking(true);
      setError("");
      try {
        const response = await apiFetch(
          "/api/voice-packs",
          action
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...(locale ? { locale } : {}) }),
              }
            : { cache: "no-store" },
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "语音包状态检查失败");
        const next = body as VoicePackStatus;
        setStatus(next);
        if (
          action === "refresh" ||
          (next.operation?.phase === "complete" &&
            completed.current !== next.operation.id)
        ) {
          if (next.operation?.phase === "complete")
            completed.current = next.operation.id;
          changed.current?.();
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "无法检查语音包状态");
      } finally {
        if (action) setWorking(false);
      }
    },
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const pending =
    !!status?.operation &&
    !["complete", "failed"].includes(status.operation.phase);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      void load();
    }, 3000);
    return () => clearInterval(timer);
  }, [pending, load]);

  async function preview(locale: VoicePackLocale, voiceId: string) {
    setPreviewing(locale);
    setError("");
    try {
      const response = await apiFetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId,
          text:
            locale === "en-GB"
              ? "A little daily practice makes learning English a pleasant habit."
              : "Let's take a short walk this afternoon and practise speaking clearly.",
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "本地声音试听失败");
      if (
        typeof body.url !== "string" ||
        !/^\/api\/tts\?audio=[a-f0-9]{64}$/.test(body.url)
      )
        throw new Error("本地 WAV 地址无效");
      setPreviews((previous) => ({ ...previous, [locale]: body.url }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "本地声音试听失败");
    } finally {
      setPreviewing(null);
    }
  }

  return (
    <section
      aria-labelledby="accent-packs-title"
      className="voice-pack-settings"
    >
      <div className="section-line">
        <h3 id="accent-packs-title">英音／澳音系统语音包</h3>
        <button
          className="button secondary"
          disabled={working}
          onClick={() => void load("refresh")}
        >
          刷新语音包与声音
        </button>
      </div>
      <p className="small muted">
        点击安装后，Windows 会弹出管理员确认，并通过 Microsoft Windows Update
        下载基础语言和语音组件。下载需要联网，可能耗时数分钟；完成后在本机生成
        WAV。
      </p>
      {error && <p role="alert">{error}</p>}
      {!status ? (
        <p role="status">正在检查真实系统声音与语音包…</p>
      ) : (
        <>
          <p className="small muted">
            来源：
            <a
              className="text-link"
              href={status.source.url}
              target="_blank"
              rel="noreferrer"
            >
              {status.source.name}
            </a>
          </p>
          {status.operation && (
            <div
              role={status.operation.phase === "failed" ? "alert" : "status"}
            >
              <p>
                <strong>
                  {status.operation.locale} ·{" "}
                  {phaseLabels[status.operation.phase]}
                </strong>
              </p>
              <p className="small">{status.operation.message}</p>
              {pending && (
                <p className="small muted">
                  正在按安装步骤更新状态，Windows Update
                  未提供可靠的下载百分比。
                </p>
              )}
              {status.operation.restartNeeded && (
                <p className="small">
                  Windows 提示需要重新启动。保存工作后重启，再刷新并试听声音。
                </p>
              )}
            </div>
          )}
          <div className="form-grid">
            {status.packs.map((pack) => {
              const voiceId = pack.voices.some(
                (voice) => voice.id === selected[pack.locale],
              )
                ? selected[pack.locale]!
                : (pack.voices[0]?.id ?? "");
              return (
                <article key={pack.locale}>
                  <h4>
                    {pack.label} · {pack.locale}
                  </h4>
                  <p className="small">{packLabels[pack.status]}</p>
                  {pack.usable && (
                    <label>
                      实际已安装的声音
                      <select
                        value={voiceId}
                        onChange={(event) =>
                          setSelected((previous) => ({
                            ...previous,
                            [pack.locale]: event.target.value,
                          }))
                        }
                      >
                        {pack.voices.map((voice) => (
                          <option value={voice.id} key={voice.id}>
                            {voice.name} · {voice.locale}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="actions">
                    {!pack.usable && (
                      <button
                        className="button secondary"
                        disabled={working || !pack.actions.includes("install")}
                        onClick={() => void load("install", pack.locale)}
                      >
                        安装{pack.label}（管理员确认）
                      </button>
                    )}
                    {pack.usable && (
                      <button
                        className="button secondary"
                        disabled={previewing !== null || !voiceId}
                        onClick={() => void preview(pack.locale, voiceId)}
                      >
                        {previewing === pack.locale
                          ? "正在生成本地 WAV…"
                          : "生成试听 WAV"}
                      </button>
                    )}
                  </div>
                  {pack.status === "installed-unavailable" && (
                    <p className="small muted">
                      请先刷新；仍无声音时，可在 Windows
                      语音设置检查该语言，或保存工作后注销／重启再试。
                    </p>
                  )}
                  {pack.error && (
                    <details className="small muted">
                      <summary>系统组件检测信息</summary>
                      <p>{pack.error}</p>
                      <p>
                        普通权限可能无法读取组件状态；是否可用以实际检测到的声音为准。
                      </p>
                    </details>
                  )}
                  {previews[pack.locale] && (
                    <audio
                      controls
                      aria-label={`${pack.label}本地 WAV 试听`}
                      src={previews[pack.locale]}
                    />
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
export default VoicePackSettings;
