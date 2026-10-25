"use client";
import { useState } from "react";
import { useStudy } from "./study-context";
import { importVocabularyPack, parseVocabularyPack, type VocabularyPack, type VocabularyImportSummary } from "@/lib/vocabulary-import";
import { saveExport } from "@/lib/native/files";

export function VocabularyImportPanel() {
  const { state, update, notify, fail } = useStudy();
  const [pack, setPack] = useState<VocabularyPack | null>(null);
  const [summary, setSummary] = useState<VocabularyImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function inspect(file?: File) {
    setPack(null); setSummary(null); setError("");
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("词库文件超过 10 MB，请拆分后导入");
      const parsed = parseVocabularyPack(await file.text());
      const preview = importVocabularyPack(state, parsed);
      setPack(parsed); setSummary(preview.summary);
    } catch (e) { setError(e instanceof Error ? e.message : "无法读取词库"); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!pack || busy) return;
    setBusy(true); setError("");
    try {
      let result: VocabularyImportSummary | undefined;
      await update((current) => {
        const imported = importVocabularyPack(current, pack);
        result = imported.summary;
        return imported.state;
      });
      notify(`词库已保存：新增 ${result!.added}，合并 ${result!.merged}，保留 ${result!.unchanged}；原复习记录保留`);
      setPack(null); setSummary(null);
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，原数据未更改"); }
    finally { setBusy(false); }
  }
  async function template() {
    try {
      const data = { format: "englishpilot-vocabulary-v1", name: "我的词库", sources: [{ id: "my-vocabulary-v1", name: "个人词库", url: "", license: "个人学习资料", licenseUrl: "", attribution: "本人整理", modification: "本人填写释义" }], entries: [{ headword: "sample", meaning: "示例", definition: "An example of something.", pos: "noun", examples: ["This is a sample sentence."], sourceIds: ["my-vocabulary-v1"] }] };
      await saveExport(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "englishpilot-vocabulary-template.json");
    } catch (e) { fail(e); }
  }
  return <details className="panel vocabulary-import">
    <summary>导入自己的词库文件</summary>
    <p className="small muted">读取 EnglishPilot 词库 JSON，每批最多 10,000 条、10 MB。先预览再确认；重复词合并来源和例句，保留已有释义、卡片与复习记录。导入的词库会进入完整备份。</p>
    <div className="actions"><button className="button secondary" disabled={busy} onClick={() => void template()}>导出格式示例</button></div>
    <label>选择词库 JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => { void inspect(e.target.files?.[0]); e.target.value = ""; }} /></label>
    {busy && <p role="status">正在核对词条或保存…</p>}
    {error && <p role="alert">{error}</p>}
    {pack && summary && <div className="import-preview">
      <h3>{pack.name}</h3>
      <p>新增 {summary.added} · 合并 {summary.merged} · 保留 {summary.unchanged} · 文件内重复 {summary.duplicates}</p>
      <p className="small">来源：{pack.sources.map((s) => `${s.name}（${s.license}）`).join("；")}</p>
      <p className="small">示例：{pack.entries.slice(0, 5).map((w) => w.headword).join(" / ")}</p>
      <div className="actions"><button className="button primary" disabled={busy} onClick={() => void confirm()}>确认合并到本机</button><button className="button secondary" disabled={busy} onClick={() => { setPack(null); setSummary(null); }}>取消</button></div>
    </div>}
  </details>;
}
