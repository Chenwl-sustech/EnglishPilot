import { PilotApp } from "@/components/pilot-app";
import { notFound } from "next/navigation";
const sections = [
  "today",
  "dashboard",
  "vocabulary",
  "resources",
  "grammar",
  "listening",
  "reading",
  "speaking",
  "writing",
  "exams",
  "mistakes",
  "teacher",
  "analytics",
  "plan",
  "settings",
  "assessment",
  "calendar",
  "mini-test",
];
export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <PilotApp section={section} />;
}
