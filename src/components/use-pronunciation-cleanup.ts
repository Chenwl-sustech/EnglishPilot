"use client";
import { useEffect } from "react";
import { stopPronunciation } from "@/lib/pronunciation";

/** End pending discovery and playback when a dialog or route is left. */
export function usePronunciationCleanup(scope: unknown) {
  useEffect(() => stopPronunciation, [scope]);
}
