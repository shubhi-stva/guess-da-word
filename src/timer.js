/**
 * A pausable countdown.
 *
 * Time is derived from a clock rather than accumulated by ticking, so the
 * remaining time stays correct even if the page is throttled in a background
 * tab. `now` is injectable so the behaviour can be tested without real waiting.
 */
export function createCountdown(duration, now = () => Date.now()) {
  let endsAt = null;
  let pausedAt = null;
  let stopped = true;

  return {
    start() {
      endsAt = now() + duration;
      pausedAt = null;
      stopped = false;
    },

    stop() {
      stopped = true;
      pausedAt = null;
    },

    /** Pausing while a dialog is open means reading the rules costs no time. */
    pause() {
      if (stopped || pausedAt !== null) return;
      pausedAt = now();
    },

    resume() {
      if (stopped || pausedAt === null) return;
      endsAt += now() - pausedAt;
      pausedAt = null;
    },

    get running() {
      return !stopped && pausedAt === null;
    },

    get paused() {
      return !stopped && pausedAt !== null;
    },

    remaining() {
      if (stopped || endsAt === null) return duration;
      return Math.max(0, endsAt - (pausedAt !== null ? pausedAt : now()));
    },

    expired() {
      return !stopped && this.remaining() === 0;
    },
  };
}

/** Milliseconds as m:ss, rounding up so a fresh 120000ms reads "2:00". */
export function formatClock(ms) {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
