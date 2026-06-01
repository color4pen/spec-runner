/**
 * IEventBus: shared-kernel 層の subscriber が domain の concrete EventBus に
 * 依存せず subscribe するための最小契約。
 *
 * shared-kernel (logger/, config/ 等) はこの interface を import する。
 * concrete 実装 (EventBus class) は domain 層 (core/event/) に置かれ、
 * この interface を満たす。
 *
 * Kernel の「import ゼロ」原則: このファイルは他モジュールを import しない。
 */

/** Minimum subscriber contract for shared-kernel consumers. */
export interface IEventBus {
  /**
   * Register a handler for a named event.
   * Mirrors EventBus#on — only the subscribe side is required by the kernel contract.
   * payload is typed as `any` intentionally: concrete event shapes are defined in
   * domain (core/event/types.ts) and not visible from the kernel layer.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (payload: any) => void): void;
}
