"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActiveClock } from "@/lib/clock";
export function useStopwatch(autoStart = true, initialSeconds = 0) {
  const [seconds, setSeconds] = useState(initialSeconds),
    [running, setRunning] = useState(autoStart);
  const clock = useRef<ActiveClock>(new ActiveClock(undefined, initialSeconds));
  const pause = useCallback(() => {
    clock.current.pause();
    setSeconds(clock.current.seconds());
    setRunning(false);
  }, []);
  useEffect(() => {
    if (!running) return;
    const activeClock = clock.current;
    activeClock.start();
    const interval = setInterval(() => {
      setSeconds(activeClock.seconds());
    }, 500);
    return () => {
      activeClock.pause();
      clearInterval(interval);
    };
  }, [running]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);
  const elapsed = useCallback(() => {
    return clock.current.seconds();
  }, []);
  const restore = useCallback(
    (savedSeconds: number, continueRunning = false) => {
      clock.current.reset(continueRunning, savedSeconds);
      setSeconds(savedSeconds);
      setRunning(continueRunning);
    },
    [],
  );
  return {
    seconds,
    running,
    pause,
    toggle: () => setRunning((v) => !v),
    elapsed,
    restore,
    reset: (continueRunning = running) => {
      clock.current.reset(continueRunning);
      setSeconds(0);
      setRunning(continueRunning);
    },
  };
}
export function clockText(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
