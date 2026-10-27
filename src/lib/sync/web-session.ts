export async function webSessionToken(): Promise<string | null> {
  const [{ readSyncConfig }, { syncClient }] = await Promise.all([
    import("./config"),
    import("./client"),
  ]);
  const config = readSyncConfig();
  if (!config) return null;
  const { data, error } = await syncClient(config).auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}
