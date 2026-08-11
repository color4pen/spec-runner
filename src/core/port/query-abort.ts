/**
 * Port interface for registering in-flight agent query AbortControllers.
 *
 * D4 (design.md): runner self-abort seam. The adapter layer imports only from
 * core/port/ — this interface keeps the adapter free of core/lifecycle imports.
 */

export interface QueryAbortRegistration {
  /**
   * Register `controller` with the hub.
   * Returns a deregister function; call it on every exit path of the query (success / error / throw).
   */
  register(controller: AbortController): () => void;
}
