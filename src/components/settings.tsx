"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Save, ArrowUpRight } from "lucide-react";
import { useStudy } from "./study-context";
import { PlanFields } from "./plan-fields";
import { PageHeading } from "./exercises";
import { today, commitPreferences, ieltsOverall } from "@/lib/engine";
import { profileSchema, type Profile } from "@/lib/model";
import { BackupSettings } from "./backup-settings";
import { ServiceSettings } from "./service-settings";
import { AiUsageSettings } from "./ai-usage-settings";
import { PwaSettings } from "./pwa-settings";
import { AccountSync } from "./account-sync";
import { nativeBuild } from "@/lib/native/runtime";
export function Settings() {
  const { state, update, notify, fail } = useStudy();
  const [settings, setSettings] = useState(state.settings),
    [profile, setProfile] = useState(state.profile),
    [busy, setBusy] = useState(false);
  const baseline = useRef({ settings: state.settings, profile: state.profile });
  const edited = useRef(false);
  const [dirty, setDirty] = useState(false);
  function markDirty() {
    edited.current = true;
    setDirty(true);
  }
  useEffect(() => {
    if (!edited.current) {
      setSettings(state.settings);
      setProfile(state.profile);
      baseline.current = { settings: state.settings, profile: state.profile };
    }
  }, [state.settings, state.profile, dirty]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const p = profileSchema.parse(profile);
      if (p.examDate < today())
        throw new Error("预计考试日期应为今天或未来日期");
      await update((s) =>
        commitPreferences(s, baseline.current, { settings, profile: p }),
      );
      edited.current = false;
      setDirty(false);
      notify("设置已保存，学习计划已更新");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const numeric = (
    key: keyof Profile,
    label: string,
    min: number,
    max: number,
    step = 0.5,
  ) => (
    <label key={key}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={String(profile[key])}
        onChange={(e) =>
          setProfile({ ...profile, [key]: e.target.valueAsNumber })
        }
      />
    </label>
  );
  return (
    <>
      <PageHeading
        eyebrow="SETTINGS · MAKE IT YOURS"
        title="适合你的，才是好计划。"
        description="调整每日投入与学习目标。手动修改配额后，从今天重新开始 7 天评估周期。"
      />
      <form
        onSubmit={(e) => void save(e)}
        onChangeCapture={markDirty}
        className="settings-form"
      >
        <section className="panel">
          <div className="section-line">
            <div>
              <span className="eyebrow">01 · YOUR DAILY RHYTHM</span>
              <h2>每日学习计划</h2>
            </div>
            <span className="tag">均衡提升</span>
          </div>
          <p className="muted">
            初始默认：120 分钟，词汇与语法 21、听力 26、阅读 26、口语 21、写作
            26。你可以自由修改下方配额。
          </p>
          <PlanFields
            total={settings.dailyMinutes}
            base={settings.base}
            onTotal={(dailyMinutes) => {
              markDirty();
              setSettings((current) => ({ ...current, dailyMinutes }));
            }}
            onBase={(base) => {
              markDirty();
              setSettings((current) => ({ ...current, base }));
            }}
          />
          <div className="form-grid">
            <label>
              每周学习天数
              <span className="small">（更改次日生效）</span>
              <select
                value={settings.weeklyDays}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    weeklyDays: Number(e.target.value),
                  })
                }
              >
                {[7, 6, 5, 4, 3, 2, 1].map((n) => (
                  <option value={n} key={n}>
                    {n} 天 · 从周一开始
                  </option>
                ))}
              </select>
            </label>
            <label>
              界面主题
              <select
                value={settings.theme}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    theme: e.target.value as "light" | "dark",
                  })
                }
              >
                <option value="light">柔和浅色</option>
                <option value="dark">静谧深色</option>
              </select>
            </label>
          </div>
          <div className="toggle-row">
            <div>
              <h3>每周自适应调整</h3>
              <p>依据真实练习；总时长不变。数据不足时保留现有配额。</p>
            </div>
            <label className="switch">
              <input
                aria-label="每周自适应调整"
                type="checkbox"
                checked={settings.adaptive}
                onChange={(e) =>
                  setSettings({ ...settings, adaptive: e.target.checked })
                }
              />
              <span />
            </label>
          </div>
        </section>
        <section className="panel">
          <span className="eyebrow">02 · YOUR DESTINATION</span>
          <h2>学习与考试目标</h2>
          <div className="form-grid three">
            <label>
              你的称呼
              <input
                value={profile.name}
                maxLength={40}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
              />
            </label>
            <label>
              预计考试日期
              <input
                type="date"
                min={today()}
                value={profile.examDate}
                onChange={(e) =>
                  setProfile({ ...profile, examDate: e.target.value })
                }
              />
            </label>
            <label>
              学习模式
              <select
                value={profile.mode}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    mode: e.target.value as Profile["mode"],
                  })
                }
              >
                <option value="dual">双考试</option>
                <option value="ielts">IELTS Academic</option>
                <option value="toefl">TOEFL iBT 2026</option>
              </select>
            </label>
            <label>
              主考试
              <select
                value={profile.primary}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    primary: e.target.value as Profile["primary"],
                  })
                }
              >
                <option value="ielts">IELTS</option>
                <option value="toefl">TOEFL</option>
              </select>
            </label>
            <label>
              主考试专项比例（%）
              <input
                type="number"
                min="10"
                max="90"
                value={profile.primaryShare}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    primaryShare: e.target.valueAsNumber,
                  })
                }
              />
            </label>
            <label className="check-label academic">
              <input
                type="checkbox"
                checked={profile.academic}
                onChange={(e) =>
                  setProfile({ ...profile, academic: e.target.checked })
                }
              />
              包含学术英语兴趣
            </label>
          </div>
          <div className="exam-targets">
            <div>
              <h3>IELTS Academic</h3>
              <div className="form-grid three">
                {numeric("ielts", "总分目标", 0, 9)}
                {numeric("ieltsListening", "听力目标", 0, 9)}
                {numeric("ieltsReading", "阅读目标", 0, 9)}
                {numeric("ieltsSpeaking", "口语目标", 0, 9)}
                {numeric("ieltsWriting", "写作目标", 0, 9)}
              </div>
              <p className="small muted">
                当前分项目标对应总分{" "}
                {ieltsOverall([
                  profile.ieltsListening,
                  profile.ieltsReading,
                  profile.ieltsSpeaking,
                  profile.ieltsWriting,
                ])}
                （均值按半分进位规则取整），与个人总分目标独立保存。
              </p>
            </div>
            <div>
              <h3>TOEFL iBT</h3>
              <div className="form-grid">
                {numeric("toefl2026", "2026 新版目标（1–6）", 1, 6)}
                {numeric("toeflLegacy", "旧版参考目标（0–120）", 0, 120, 1)}
              </div>
              <p className="small muted">
                两种量表分别保存，不作精确等价换算。新版采用半分间隔。
                <a
                  href="https://www.ets.org/toefl/test-takers/ibt/scores/understand-scores.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  查看 ETS 评分说明 ↗
                </a>
              </p>
            </div>
          </div>
        </section>
        <div className="settings-save">
          <p className="small muted">
            改配额会更新今天的计划时长，已完成状态与真实练习记录会保留。
          </p>
          <button className="button primary" type="submit" disabled={busy}>
            <Save size={16} />
            保存学习设置
          </button>
        </div>
      </form>
      <PwaSettings />
      <AccountSync />
      <ServiceSettings />
      <AiUsageSettings />
      <BackupSettings
        onRestored={(next) => {
          edited.current = false;
          setSettings(next.settings);
          setProfile(next.profile);
          setDirty(false);
          baseline.current = { settings: next.settings, profile: next.profile };
        }}
      />
      <div className="feature-note">
        <span className="tag">Adaptive v3</span>
        <p>
          {nativeBuild
            ? "安装版内置学习页面与题库，可离线训练；在线 AI 连接与用量见上方服务配置。AI 评价仅供练习参考，非官方考试成绩。"
            : "本地学习无需 API Key；AI 反馈使用上方配置的服务。首次联网完成离线准备后，可继续本机学习。正式考试估分尚未校准。"}
        </p>
        <Link className="text-link" href="/plan">
          查看计划规则 <ArrowUpRight size={16} />
        </Link>
      </div>
    </>
  );
}
