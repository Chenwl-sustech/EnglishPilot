import type { Metadata } from "next";
import { PasswordRecovery } from "@/components/password-recovery";
export const metadata: Metadata = {
  title: "重设学习密码 · EnglishPilot",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <PasswordRecovery />;
}
