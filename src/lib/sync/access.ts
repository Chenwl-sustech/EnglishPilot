import type { AccountSpace } from "./space";
export function accountAccess(
  space: AccountSpace | null,
  ready: boolean,
  uid: string | null,
  project: string | null,
  offlineOwner?: string | null,
): "open" | "loading" | "login" {
  if (!space) return "open";
  if (!ready) return "loading";
  return space.project === project &&
    (space.uid === uid || (!uid && space.uid === offlineOwner))
    ? "open"
    : "login";
}
