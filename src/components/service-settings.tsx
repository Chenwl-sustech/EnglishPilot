"use client";
import { apiFetch } from "@/lib/native/api";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isHostedWebClient } from "@/lib/deployment";
import { nativeBuild } from "@/lib/native/runtime";
import { useStudy } from "./study-context";
import { VoicePackSettings } from "./voice-pack-settings";

type Configuration = {
  backend?: string;
  ai: {
    configured: boolean;
    model: string;
    endpoint: string;
    reasoningEffort: string;
    message: string;
  };
  whisper: {
    available: boolean;
    error?: string;
    models?: { name: string; installed: boolean; size: number; path: string }[];
  };
  tts: {
    available: boolean;
    error?: string;
    message?: string;
    voices?: { id: string; name: string; locale: string }[];
    cache?: { files: number; bytes: number };
  };
};
export function ServiceSettings() {
  const { state, update, fail } = useStudy();
  const [config, setConfig] = useState<Configuration | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{
    url: string;
    cached: boolean;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  async function refresh(resetConnection = false) {
    if (resetConnection) {
      setConnected(false);
      setMessage("");
    }
    setError("");
    try {
      const response = await apiFetch("/api/configuration");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "服务状态检测失败");
      setConfig(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "服务状态检测失败");
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function checkAi() {
    setChecking(true);
    setConnected(false);
    setMessage("");
    try {
      const response = await apiFetch("/api/configuration", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "AI 检测失败");
      setConnected(true);
      setMessage(body.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "AI 检测失败");
    } finally {
      setChecking(false);
    }
  }
  async function previewVoice() {
    setGenerating(true);
    setError("");
    try {
      const response = await apiFetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: state.extension.voicePreference.voiceURI,
          text: "Daily practice helps us learn to speak clearly.",
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "语音生成失败");
      if (
        typeof body.url !== "string" ||
        !/^\/api\/tts\?audio=[a-f0-9]{64}$/.test(body.url)
      )
        throw new Error("本地音频地址无效");
      setPreview(body);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "语音生成失败");
    } finally {
      setGenerating(false);
    }
  }
  async function clearCache() {
    setGenerating(true);
    try {
      const response = await apiFetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-cache" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "清理失败");
      setPreview(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "缓存清理失败");
    } finally {
      setGenerating(false);
    }
  }
  const remoteClient = nativeBuild || isHostedWebClient;
  const voiceId =
    state.extension.voicePreference.mode === "system-local"
      ? state.extension.voicePreference.voiceURI
      : "";
  return (
    <section className="panel service-settings" id="services">
      <div className="section-line">
        <div>
          <span className="eyebrow">
            {remoteClient ? "ONLINE SERVICES" : "LOCAL SERVICES"}
          </span>
          <h2>服务与语音配置</h2>
        </div>
        <button className="button secondary" onClick={() => void refresh(true)}>
          刷新服务状态
        </button>
      </div>
      <p className="muted">
        {nativeBuild ? (
          <>安装版通过 HTTPS 连接私人 AI 后端。连接凭据保存在设备钥匙串，AI 密钥仅在后端保存。提交时发送核对后的文字，录音留在设备；检查连接不发送学习内容。</>
        ) : isHostedWebClient ? (
          <>
            网页版通过 HTTPS 连接部署服务器。AI
            由服务器管理员配置，提交时会把核对后的文字发送至所配置的 AI
            服务。录音保留在当前浏览器，手机端不提供本地 Whisper
            转写。检查状态不会发送学习内容。
          </>
        ) : (
          <>
            运行 <code>npm run dev</code> 启动应用；如需本地转写，请另行配置兼容的 Whisper 服务。
            检查状态不会自动下载模型，也不会发送学习内容。
          </>
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      {config?.backend && <p className="small muted">在线后端：{config.backend}</p>}
      {nativeBuild && config?.backend?.endsWith(".trycloudflare.com") && <p className="small muted">当前经 Mac 临时后端连接，Mac 需保持开机联网。通道停止或重启后可能需要重新配对；这不是全天候独立托管服务。</p>}
      {!config ? (
        <p role="status">
          {error ? "未取得服务状态，请检查网络后刷新。" : remoteClient ? "正在检查服务器配置…" : "正在检查本机服务…"}
        </p>
      ) : (
        <>
          <div className="form-grid">
            <article>
              <h3>AI 语言反馈</h3>
              <p className="tag">
                {config.ai.configured
                  ? connected
                    ? "连接检测通过"
                    : "已配置，待连接检测"
                  : "尚未配置"}
              </p>
              <p>
                模型：<strong>{config.ai.model || "未指定"}</strong>
              </p>
              <p className="small muted">
                {config.ai.endpoint || "服务地址无效"} · 思考：
                {config.ai.reasoningEffort}
              </p>
              <p className="small muted">
                {remoteClient
                  ? "密钥由管理员保存在部署服务器，浏览器不会收到密钥。修改模型、地址或密钥需由管理员更新服务器配置。"
                  : "密钥只保存在本机服务端配置。修改模型、地址或密钥时，请编辑 .env.local 后重启应用。"}
              </p>
              <button
                className="button secondary"
                disabled={checking || !config.ai.configured}
                onClick={() => void checkAi()}
              >
                {checking ? "正在检测 AI…" : "检测 AI 连接"}
              </button>
              {message && <p role="status">{message}</p>}
            </article>
            <article>
              <h3>{remoteClient ? "录音与文字自评" : "本地 Whisper"}</h3>
              <p className="tag">
                {remoteClient
                  ? (nativeBuild ? "安装版暂不提供本地转写" : "网页版不提供本地转写")
                  : config.whisper.available
                    ? "本地服务已连接"
                    : "本地服务未连接"}
              </p>
              {config.whisper.error && (
                <p className="small muted">{config.whisper.error}</p>
              )}
              {!remoteClient && <label>
                默认 Whisper 模型
                <select
                  value={state.extension.whisperModel}
                  disabled={isHostedWebClient}
                  onChange={(event) => {
                    const model = event.target.value as
                      "tiny" | "base" | "small";
                    void update((s) => ({
                      ...s,
                      extension: { ...s.extension, whisperModel: model },
                    })).catch(fail);
                  }}
                >
                  {["tiny", "base", "small"].map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>}
              <p className="small muted">
                {remoteClient
                  ? "可继续在此设备录音、回放并手工填写文本；录音不会上传至服务器转写。"
                  : "只保存选择；未安装模型需要在口语页面确认下载。tiny 适合当前 CPU 配置。"}
              </p>
              {config.whisper.models?.map((model) => (
                <p className="small" key={model.name}>
                  {model.name} · {(model.size / 1e6).toFixed(1)} MB ·{" "}
                  {model.installed ? "已安装" : "未安装"}
                </p>
              ))}
              <Link href="/speaking#whisper" className="text-link">
                {remoteClient
                  ? "录音回放与手工自评 →"
                  : "管理模型与本地转写 →"}
              </Link>
            </article>
          </div>
          {!remoteClient && (
            <>
              <hr />
              <h3>本机语音与 WAV 缓存</h3>
              <p className="small muted">
                {config.tts.error ?? config.tts.message}
              </p>
              <div className="form-grid">
                <label>
                  本地 WAV 默认声音
                  <select
                    value={voiceId}
                    disabled={!config.tts.available}
                    onChange={(event) => {
                      const voice = config.tts.voices?.find(
                        (v) => v.id === event.target.value,
                      );
                      if (!voice) return;
                      setPreview(null);
                      void update((s) => ({
                        ...s,
                        extension: {
                          ...s.extension,
                          voicePreference: {
                            mode: "system-local",
                            voiceURI: voice.id,
                            locale: voice.locale,
                          },
                        },
                      })).catch(fail);
                    }}
                  >
                    <option value="" disabled>
                      请选择真实已安装的声音
                    </option>
                    {config.tts.voices?.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name} · {voice.locale}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  {["en-GB", "en-US", "en-AU"].map((locale) => (
                    <p className="small" key={locale}>
                      {locale}：
                      {config.tts.voices?.some((v) => v.locale === locale)
                        ? "已检测到本地语音"
                        : "本地 WAV 语音不可用"}
                    </p>
                  ))}
                </div>
              </div>
              <div className="actions">
                <button
                  className="button secondary"
                  disabled={!voiceId || generating || !config.tts.available}
                  onClick={() => void previewVoice()}
                >
                  {generating ? "正在处理语音…" : "生成试听 WAV"}
                </button>
                <button
                  className="button secondary"
                  disabled={generating || !config.tts.cache?.files}
                  onClick={() => void clearCache()}
                >
                  清理语音缓存
                </button>
              </div>
              <p className="small muted">
                缓存 {config.tts.cache?.files ?? 0} 个音频，约{" "}
                {((config.tts.cache?.bytes ?? 0) / 1024 / 1024).toFixed(2)}{" "}
                MB；最多 200 个 / 128
                MB，自动移除较早使用的音频。清理不影响学习记录和录音。
              </p>
              {preview && (
                <div>
                  <p className="small">
                    {preview.cached ? "已复用本地缓存" : "已在本机生成 WAV"}
                  </p>
                  <audio controls aria-label="本地语音试听" src={preview.url} />
                  <a
                    className="text-link"
                    href={preview.url}
                    download="englishpilot-local-preview.wav"
                  >
                    下载试听 WAV
                  </a>
                </div>
              )}
            </>
          )}
        </>
      )}
      {remoteClient ? (
        <p className="small muted">
          语音朗读使用设备本地声音，可在听力播放器中选择。缺少英语声音时，请在系统设置中下载后重新打开应用；服务器不安装设备语音包。
        </p>
      ) : (
        <>
          <hr />
          <VoicePackSettings onVoicesChanged={() => void refresh()} />
        </>
      )}
    </section>
  );
}
