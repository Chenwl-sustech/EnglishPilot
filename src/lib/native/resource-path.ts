/** Shared with the generated ArkTS host. Inspect raw paths before URL normalization. */
export function bundledResourcePath(
  rawUrl: string,
  origin: string,
): string | null {
  if (!rawUrl.startsWith(origin + "/")) return null;
  let path: string;
  try {
    path = decodeURIComponent(rawUrl.slice(origin.length).split(/[?#]/, 1)[0]);
  } catch {
    return null;
  }
  if (path === "/") return path;
  const relative = path.slice(1).replace(/\/$/, "");
  if (
    !/^[\w.$\[\]/-]+$/.test(relative) ||
    relative.split("/").some((part) => !part || part.startsWith("."))
  )
    return null;
  return path;
}
