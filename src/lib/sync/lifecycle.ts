export function createSyncScheduler(
  run: () => Promise<void>,
  visible: () => boolean,
) {
  let disposed = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  const resume = () => {
    if (!disposed && visible()) void run().catch(() => {});
  };
  const interval = setInterval(resume, 60000);
  return {
    changed() {
      if (disposed) return;
      clearTimeout(timer);
      timer = setTimeout(resume, 10000);
    },
    resume,
    dispose() {
      disposed = true;
      clearInterval(interval);
      clearTimeout(timer);
    },
  };
}
