"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PracticeSession } from "@/lib/practice-model";
import {
  claimPracticeTiming,
  recordPracticeTiming,
} from "@/lib/practice-timing";
import { stopPronunciation } from "@/lib/pronunciation";
import { useStudy } from "./study-context";

type Run = {
  id: string;
  owner: string;
  questionId: string;
  sectionIndex: number;
  checkpoint: number;
  sequence: number;
  running: boolean;
  cancelled: boolean;
};

/** Only observed foreground deltas are sent; no persisted wall anchor can charge offline time. */
export function usePracticeTiming(
  session: PracticeSession,
  questionId: string,
) {
  const { update } = useStudy();
  const enabled = session.kind === "weekly" && !!session.timing;
  const run = useRef<Run | null>(null),
    queue = useRef(Promise.resolve());
  const alive = useRef(true),
    manual = useRef(session.timing?.paused ?? false);
  const [status, setStatus] = useState<"running" | "paused" | "starting">(
      "paused",
    ),
    [notice, setNotice] = useState(""),
    [delta, setDelta] = useState(0);
  const enqueue = useCallback((work: () => Promise<void>) => {
    const next = queue.current.catch(() => {}).then(work);
    queue.current = next;
    return next;
  }, []);
  const flushRun = useCallback(
    async (r: Run, release: boolean, pause: boolean) => {
      if (!r.running) return;
      const stamp = performance.now(),
        ms = Math.max(0, Math.round(stamp - r.checkpoint));
      r.checkpoint = stamp;
      const sequence = ++r.sequence;
      if (release) r.running = false;
      if (alive.current && run.current === r) {
        setDelta(0);
        if (release) setStatus("paused");
      }
      await enqueue(async () => {
        let owned = false;
        await update(
          (s) => {
            owned =
              s.extension.practiceSessions.find((p) => p.id === r.id)?.timing
                ?.lease?.owner === r.owner;
            return recordPracticeTiming(
              s,
              r.id,
              r.owner,
              sequence,
              ms,
              new Date(),
              release,
              pause,
            );
          },
          { silent: true },
        );
        if (!owned) {
          r.running = false;
          if (alive.current && run.current === r) {
            setStatus("paused");
            setNotice("另一窗口已接管计时；可点击继续在本页计时。");
          }
        }
      });
    },
    [enqueue, update],
  );
  const flush = useCallback(
    async (release = false, pause = false) => {
      const r = run.current;
      if (pause) manual.current = true;
      if (release && r) {
        r.cancelled = true;
        if (alive.current) setStatus("paused");
      }
      if (r) await flushRun(r, release, pause);
    },
    [flushRun],
  );
  const start = useCallback(
    async (takeover = false) => {
      if (
        !enabled ||
        document.hidden ||
        run.current?.running ||
        (!takeover && !document.hasFocus())
      )
        return;
      manual.current = false;
      const r: Run = {
        id: session.id,
        owner: crypto.randomUUID(),
        questionId,
        sectionIndex: session.sectionIndex,
        checkpoint: performance.now(),
        sequence: 0,
        running: false,
        cancelled: false,
      };
      run.current = r;
      if (alive.current) {
        setStatus("starting");
        setNotice("");
      }
      try {
        let claimed = false;
        await enqueue(async () => {
          await update(
            (s) => {
              const next = claimPracticeTiming(
                s,
                r.id,
                r.sectionIndex,
                r.questionId,
                r.owner,
                new Date(),
                takeover,
              );
              claimed =
                next.extension.practiceSessions.find((p) => p.id === r.id)
                  ?.timing?.lease?.owner === r.owner;
              return next;
            },
            { silent: true },
          );
        });
        r.running = claimed;
        r.checkpoint = performance.now();
        if (
          r.cancelled ||
          document.hidden ||
          !alive.current ||
          run.current !== r
        ) {
          if (claimed) await flushRun(r, true, false);
          return;
        }
        setStatus(claimed ? "running" : "paused");
      } catch (e) {
        r.running = false;
        if (alive.current) {
          setStatus("paused");
          setNotice(e instanceof Error ? e.message : "计时保存失败，请重试");
        }
      }
    },
    [
      enabled,
      session.id,
      session.sectionIndex,
      questionId,
      enqueue,
      update,
      flushRun,
    ],
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    if (!manual.current) void start();
    const visibility = () => {
      if (document.hidden) {
        stopPronunciation();
        void flush(true).catch((e) => {
          if (alive.current) setNotice(e.message);
        });
      } else if (!manual.current) void start(true);
    };
    const focus = () => {
      if (!manual.current) void start(true);
    };
    const hide = () => {
      void flush(true).catch(() => {});
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", focus);
    window.addEventListener("pagehide", hide);
    const pulse = setInterval(() => {
      if (run.current?.running)
        void flush().catch((e) => {
          if (run.current) run.current.running = false;
          if (alive.current) {
            setStatus("paused");
            setNotice(e.message);
          }
        });
    }, 1000);
    const paint = setInterval(() => {
      const r = run.current;
      if (alive.current)
        setDelta(r?.running ? Math.floor(performance.now() - r.checkpoint) : 0);
    }, 250);
    return () => {
      clearInterval(pulse);
      clearInterval(paint);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pagehide", hide);
      const r = run.current;
      if (r) {
        r.cancelled = true;
        void flushRun(r, true, false).catch(() => {});
      }
    };
  }, [enabled, start, flush, flushRun]);
  return {
    enabled,
    status,
    notice,
    flush,
    start: () => start(true),
    milliseconds: (session.timing?.milliseconds[questionId] ?? 0) + delta,
    pause: () => flush(true, true),
  };
}
