/**
 * Shared error normalization for session polling failures.
 * Preserves the original error code when present; falls back to SESSION_TERMINATED.
 */

/**
 * Normalize an unknown thrown value from pollUntilComplete into a structured
 * { code, message, hint } object.
 *
 * Rules:
 * - If err carries a non-empty `.code`, that code is preserved.
 * - Otherwise the code defaults to "SESSION_TERMINATED".
 * - `.hint` defaults to "" when absent.
 */
export function normalizeSessionError(err: unknown): {
  code: string;
  message: string;
  hint: string;
} {
  const code =
    typeof (err as { code?: unknown }).code === "string" &&
    (err as { code: string }).code.length > 0
      ? (err as { code: string }).code
      : "SESSION_TERMINATED";
  const message = err instanceof Error ? err.message : String(err);
  const hint =
    typeof (err as { hint?: unknown }).hint === "string"
      ? (err as { hint: string }).hint
      : "";

  return { code, message, hint };
}
