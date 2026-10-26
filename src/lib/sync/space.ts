export const activeSpaceKey = "englishpilot-active-account-v1";
export type AccountSpace = { project: string; uid: string };
export function accountDatabaseName(project: string, uid: string): string {
  const url = new URL(project);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || !/^[a-zA-Z0-9_-]{1,100}$/.test(uid))
    throw new Error("账号云服务地址或用户 ID 无效");
  return `EnglishPilot-account-${url.hostname}-${uid}`;
}
export function activeSpace(): AccountSpace | null {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(activeSpaceKey);
    if (!raw) return null;
    const value = JSON.parse(raw);
    accountDatabaseName(value.project, value.uid);
    return { project: value.project, uid: value.uid };
  } catch { return null; }
}
export function activeDatabaseName(): string {
  const space = activeSpace();
  return space ? accountDatabaseName(space.project, space.uid) : "EnglishPilot";
}
export function selectSpace(space: AccountSpace | null): void {
  if (space) {
    accountDatabaseName(space.project, space.uid);
    localStorage.setItem(activeSpaceKey, JSON.stringify(space));
  } else localStorage.removeItem(activeSpaceKey);
  window.location.reload();
}
