/** Monotonic clock. Each submitted exercise starts a new interval. */
export class ActiveClock {
  private accumulated = 0;
  private started: number | null = null;
  constructor(
    private readonly now: () => number = () => performance.now(),
    initialSeconds = 0,
  ) {
    this.accumulated = this.milliseconds(initialSeconds);
  }
  private milliseconds(seconds: number) {
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400)
      throw new Error("无效的已保存练习时长");
    return seconds * 1000;
  }
  start() {
    if (this.started === null) this.started = this.now();
  }
  pause() {
    if (this.started !== null) {
      this.accumulated += this.now() - this.started;
      this.started = null;
    }
  }
  seconds() {
    return Math.floor(
      (this.accumulated +
        (this.started === null ? 0 : this.now() - this.started)) /
        1000,
    );
  }
  reset(running = false, initialSeconds = 0) {
    this.accumulated = this.milliseconds(initialSeconds);
    this.started = running ? this.now() : null;
  }
}
