/** Guest keeps its existing recovery keys; accounts never read that namespace. */
export function teacherDraftCacheKey(
  databaseName: string,
  sessionId: string,
  draftId: string,
): string {
  if (databaseName === "EnglishPilot")
    return `teacher-draft:${sessionId}:${draftId}`;
  return `englishpilot-account-draft:${JSON.stringify([databaseName, sessionId, draftId])}`;
}
