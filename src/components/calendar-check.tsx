"use client";
import { apiFetch } from "@/lib/native/api";

import { useEffect, useRef } from "react";
import { useStudy } from "./study-context";
import { chinaDate } from "@/lib/calendar";
export function CalendarCheck() {
  const { state, update } = useStudy();
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !state.profile.onboarded) return;
    started.current = true;
    const year = Number(chinaDate().slice(0, 4));
    void (async () => {
      for (const y of [year, year + 1]) {
        const last = state.extension.calendarChecks.find((c) => c.year === y);
        if (last && Date.now() - Date.parse(last.checkedAt) < 7 * 86400000)
          continue;
        try {
          const r = await apiFetch(`/api/calendar/check?year=${y}`);
          if (!r.ok) continue;
          const value = await r.json();
          await update(
            (s) => ({
              ...s,
              extension: {
                ...s.extension,
                calendarChecks: [
                  ...s.extension.calendarChecks.filter((c) => c.year !== y),
                  value,
                ],
              },
            }),
            { silent: true },
          );
        } catch {
          /* Annual check never blocks local learning. Calendar page exposes saved status. */
        }
      }
    })();
  }, [state, update]);
  return null;
}
