import { parsePublicSyncConfig as parseSyncConfig } from "./public-config.mjs";
export { parseSyncConfig };
export type SyncConfig = { url: string; key: string };
export const syncConfigKey = "englishpilot-sync-config-v1";
export function readSyncConfig(): SyncConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(syncConfigKey);
    if (raw) return parseSyncConfig(JSON.parse(raw));
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
      return parseSyncConfig({
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      });
  } catch {
    /* Invalid or incomplete configuration never enables uploads. */
  }
  return null;
}
