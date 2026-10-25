"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useStudy } from "./study-context";
import { vocabularyEntries } from "@/lib/vocabulary";
import { openVocabularySources, isVocabularyLearnable } from "@/lib/open-vocabulary";
import { publicResources } from "@/lib/data/public-resources";
import etsTests from "@/lib/data/ets-practice-links.json";

export function PublicResources() {
  const { state } = useStudy();
  const [kind, setKind] = useState("all");
  const words = useMemo(() => vocabularyEntries(state), [state.extension.userWords]);
  return <>
    <div className="page-heading"><div className="eyebrow">YOUR LEARNING LIBRARY</div><h1>词库与公开备考资源</h1><p>本地词库可离线使用；官方与第三方题库通过原站练习。来源核对：2026 年 10 月 24 日。</p></div>
    <section className="panel">
      <div className="section-line"><h2>已经加入本地的词库</h2><Link className="button primary" href="/vocabulary">打开词汇学习</Link></div>
      <p><strong>{words.length.toLocaleString()}</strong> 个去重词头，其中 <strong>{words.filter(isVocabularyLearnable).length.toLocaleString()}</strong> 个有中文或英文释义。不同词表包含相同词，不将数量相加。</p>
      <p className="small muted">词头、词族和释义按原始数据提供；未自动编造中文、音标或例句。只有词头的条目可搜索、查看词族和手动补充，不进入空白记忆卡。</p>
      <div className="resource-grid">
        {openVocabularySources.map((source) => {
          const rows = words.filter((word) => word.sources.includes(source.id));
          return <article className="resource-card" key={source.id}>
            <span className="tag">已加入本地</span><h3>{source.name}</h3>
            <p>{rows.length.toLocaleString()} 个词头 · {rows.filter(isVocabularyLearnable).length.toLocaleString()} 个有释义</p>
            <a href={source.url} target="_blank" rel="noreferrer">原始来源</a>
            <details><summary>署名、许可与整理说明</summary><p className="small">{source.attribution}</p><p className="small"><a href={source.licenseUrl} target="_blank" rel="noreferrer">{source.license}</a></p><p className="small">{source.modification}</p></details>
          </article>;
        })}
      </div>
    </section>
    <section className="panel resource-section">
      <h2>题库与补充词表的原站入口</h2>
      <p className="muted">以下入口已经收录到资源目录；题目正文、答案、录音和受限制词表尚未复制到本地题库，不计为已导入题目。现有原创练习保留。</p>
      <div className="tabs" aria-label="资源类型">{[["all", "全部"], ["ielts", "雅思"], ["toefl", "托福"], ["vocabulary", "补充词表"]].map(([id, name]) => <button key={id} className={kind === id ? "active" : ""} onClick={() => setKind(id)}>{name}</button>)}</div>
      <div className="resource-grid">{publicResources.filter((resource) => kind === "all" || resource.exam === kind).map((resource) => <article className="resource-card" key={resource.id}>
        <span className="tag">{resource.access}</span><h3>{resource.name}</h3><p className="small muted">{resource.format}</p><p>{resource.note}</p><a className="button secondary" href={resource.url} target="_blank" rel="noreferrer">打开原站</a>
      </article>)}</div>
    </section>
    <details className="panel resource-section"><summary>ETS 7 套官方练习的原始 PDF 与音频</summary>
      <p className="small muted">PDF 链接已核验，音频保留官方入口。下载后仍需按题型整理才能导入；纸面模拟不完全复刻真实自适应考试。</p>
      <ul>{etsTests.map((test) => <li key={test.name}>{test.name} · <a href={test.pdf} target="_blank" rel="noreferrer">官方 PDF</a> · <a href={test.audio} target="_blank" rel="noreferrer">官方音频 ZIP</a></li>)}</ul>
    </details>
  </>;
}
