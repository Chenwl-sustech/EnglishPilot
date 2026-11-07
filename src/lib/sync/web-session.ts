import { activeSpace } from "./space";

/** Only authorize AI with the session that owns the open learning space. */
export async function webSessionToken(): Promise<string | null> {
  const before = activeSpace();
  const [{ readSyncConfig }, { syncClient }] = await Promise.all([
    import("./config"),
    import("./client"),
  ]);
  const config = readSyncConfig();
  if (!config || (before && before.project !== config.url)) return null;
  const { data, error } = await syncClient(config).auth.getSession();
  const after = activeSpace();
  if (
    error ||
    !data.session ||
    before?.uid !== after?.uid ||
    before?.project !== after?.project ||
    (after && after.uid !== data.session.user.id)
  )
    return null;
  return data.session.access_token;
}
