export interface SecureSessionTransport {
  get(input: { key: string }): Promise<{ value: string | null }>;
  set(input: { key: string; value: string }): Promise<unknown>;
  remove(input: { key: string }): Promise<unknown>;
}
export interface SessionStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}
export function sessionStorageKey(project: string): string {
  return `englishpilot-auth-${new URL(project).hostname.split(".")[0]}`;
}
export async function forgetStoredSession(
  storage: SessionStorage,
  key: string,
): Promise<void> {
  await storage.removeItem(key);
  await storage.removeItem(key + "-user");
  await storage.removeItem(key + "-code-verifier");
}
export async function readOfflineIdentity(
  storage: SessionStorage,
  key: string,
): Promise<{ id: string } | null> {
  // This identity only opens an existing local copy. It is never an online
  // credential; cloud operations still require a server-validated session.
  const raw = await storage.getItem(key);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (
      typeof session.access_token !== "string" ||
      !session.access_token ||
      typeof session.refresh_token !== "string" ||
      !session.refresh_token ||
      typeof session.expires_at !== "number" ||
      !/^[a-f0-9-]{36}$/.test(session.user?.id ?? "")
    )
      return null;
    return { id: session.user.id };
  } catch {
    return null;
  }
}
export function createSessionStorage(transport: SecureSessionTransport) {
  return {
    getItem: async (key: string): Promise<string | null> =>
      (await transport.get({ key })).value,
    setItem: async (key: string, value: string): Promise<void> => {
      await transport.set({ key, value });
    },
    removeItem: async (key: string): Promise<void> => {
      await transport.remove({ key });
    },
  };
}
