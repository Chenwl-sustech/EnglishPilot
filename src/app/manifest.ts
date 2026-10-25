import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "EnglishPilot",
    short_name: "EnglishPilot",
    description: "IELTS / TOEFL 双考试个性化学习工作台",
    lang: "zh-CN",
    start_url: "/today?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#f7f9f6",
    theme_color: "#183d4b",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "今日学习", url: "/today" },
      { name: "词汇复习", url: "/vocabulary" },
      { name: "小测与历史", url: "/mini-test" },
    ],
  };
}
