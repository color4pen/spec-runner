/**
 * KeepAlive: sentinel timer to prevent Bun/Node event loop premature exit.
 *
 * A long-lived setInterval keeps the event loop alive until explicitly released.
 * acquire() and release() are idempotent — safe to call multiple times.
 */
export class KeepAlive {
  private _timerId: ReturnType<typeof setInterval> | undefined;

  acquire(): void {
    if (this._timerId !== undefined) return;
    this._timerId = setInterval(() => {}, 0x7fffffff);
  }

  release(): void {
    if (this._timerId === undefined) return;
    clearInterval(this._timerId);
    this._timerId = undefined;
  }

  get isActive(): boolean {
    return this._timerId !== undefined;
  }
}
