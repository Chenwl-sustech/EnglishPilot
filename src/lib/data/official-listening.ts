/** Publisher links only. Copyrighted audio, transcripts and questions stay in the private local library. */
export interface OfficialListeningSource {
  id: string;
  title: string;
  exam: "ielts" | "toefl";
  version: string;
  publisher: string;
  pageUrl: string;
  audioUrl: string;
  archiveEntry?: string;
  /** Hash and length of the selected MP3, including when it comes from a ZIP. */
  sha256: string;
  bytes: number;
  /** Fully decoded duration in seconds; no sentence alignment is implied. */
  duration: number;
  /** Number of questions paired with this particular sample audio. */
  questionCount: number;
  transcriptUrl: string;
  questionsUrl: string;
  termsUrl: string;
  note: string;
}

const ieltsPage =
  "https://takeielts.britishcouncil.org/teach-ielts/teaching-resources/lesson-plans-listening";
const ieltsPdf =
  "https://takeielts.britishcouncil.org/sites/default/files/%5Bdownloads%5D/ielts-listening-sample-tasks-2023.pdf";
const ieltsTerms =
  "https://ielts.org/legal/ielts-copyright-and-trade-mark-statement";
const toeflPage =
  "https://www.ets.org/toefl/teachers-advisors-agents/ibt/teaching/preparing-students.html";
const toeflAudio =
  "https://www.ets.org/content/dam/ets-org/pdfs/toefl/listening-lesson-plans-audio.zip";
const toeflPdf =
  "https://www.ets.org/content/dam/ets-org/pdfs/toefl/toefl-ibt-lesson-plan-listening.pdf";

export const officialListeningCatalog: OfficialListeningSource[] = [
  {
    id: "ielts-official-form-completion",
    title: "IELTS 官方样题：海运咨询与表格填空",
    exam: "ielts",
    version: "IELTS official sample tasks (2023; verified 2026-10-18)",
    publisher: "IELTS Partners / British Council",
    pageUrl: ieltsPage,
    audioUrl:
      "https://ielts.org/cdn/Sample-tests/Listening/ielts-listening-sample-task-1-form-completion.mp3",
    sha256: "eeb094a86cd36167790382f60f5dcac36c92f90b9f18eb44a466d324db8c1b73",
    bytes: 1225460,
    duration: 153.80898,
    questionCount: 8,
    transcriptUrl: ieltsPdf,
    questionsUrl: ieltsPdf,
    termsUrl: ieltsTerms,
    note: "官方练习样题，非往年实考真题。Part 1 第1–8题；题目在 PDF 第3页，原文第4–6页，答案第7页。仅供个人、非商业学习；保留原始文件和版权标记。",
  },
  {
    id: "ielts-official-multiple-choice",
    title: "IELTS 官方样题：保险与交货选择",
    exam: "ielts",
    version: "IELTS official sample tasks (2023; verified 2026-10-18)",
    publisher: "IELTS Partners / British Council",
    pageUrl: ieltsPage,
    audioUrl:
      "https://ielts.org/cdn/Sample-tests/Listening/ielts-listening-sample-task-2-multiple-choice.mp3",
    sha256: "5bcc907c3bddac1812f9194449613ff928c299d3271a5e52c3c9662aea168732",
    bytes: 406242,
    duration: 63.756,
    questionCount: 2,
    transcriptUrl: ieltsPdf,
    questionsUrl: ieltsPdf,
    termsUrl: ieltsTerms,
    note: "官方练习样题，非往年实考真题。Part 1 第9–10题；题目在 PDF 第8页，原文第9页，答案第10页。与表格填空为同一情境的不同音频片段。仅供个人、非商业学习。",
  },
  {
    id: "toefl-2026-official-short-conversation",
    title: "TOEFL 2026 官方示例：超市与看戏安排",
    exam: "toefl",
    version: "TOEFL iBT 2026",
    publisher: "ETS",
    pageUrl: toeflPage,
    audioUrl: toeflAudio,
    archiveEntry: "Listening_Lesson1_Short Conversation.mp3",
    sha256: "7ea2a4e2deeaf169f9382423c8b05941a70553ce173288e4461ef1c9efea7189",
    bytes: 497416,
    duration: 31.085714,
    questionCount: 2,
    transcriptUrl: toeflPdf,
    questionsUrl: toeflPdf,
    termsUrl: "https://www.ets.org/legal/terms.html",
    note: "ETS 更新版听力 Lesson 1 的 Listen to a Conversation 官方教学示例，非实考真题。PDF 第5页为2道题，第6页原文，第7页答案。ZIP 约7.5 MB，仅导入选定音轨。限个人、私人、非商业使用，并保留版权标记。",
  },
  {
    id: "toefl-2026-official-academic-talk",
    title: "TOEFL 2026 官方示例：注意力与心理疲劳",
    exam: "toefl",
    version: "TOEFL iBT 2026",
    publisher: "ETS",
    pageUrl: toeflPage,
    audioUrl: toeflAudio,
    archiveEntry: "Listening_Lesson1_Academic Talk.mp3",
    sha256: "9e7a544435c49b528faf81e8b93084255925b9124767afaf2013caf108e19fce",
    bytes: 768856,
    duration: 96.086712,
    questionCount: 4,
    transcriptUrl: toeflPdf,
    questionsUrl: toeflPdf,
    termsUrl: "https://www.ets.org/legal/terms.html",
    note: "ETS 更新版听力 Lesson 1 的 Listen to an Academic Talk 官方教学示例，非实考真题。PDF 第5–6页为4道题，第6–7页原文，第7页答案。ZIP 约7.5 MB，与短对话共用同一官方下载。仅供个人、私人、非商业学习。",
  },
];
