/**
 * Port types for provider readiness verification.
 *
 * Pure port layer: no imports from adapter/ or core/runtime/ (no back-edges).
 * Consumed by RuntimeStrategy (optional on base, required on RealRuntimeStrategy)
 * and by core/runtime/provider-readiness.ts (classifier).
 */

// ---------------------------------------------------------------------------
// ProviderReadinessKind
// ---------------------------------------------------------------------------

/**
 * Classification of provider readiness outcome.
 *
 * - ready:            Provider is authenticated and reachable. Gate passes.
 * - auth-missing:     No credential found; user must authenticate before running.
 * - auth-invalid:     Credential found but rejected (401-equivalent); must be replaced.
 * - unreachable:      Network timeout or connectivity failure; retry after checking network.
 * - provider-failure: Server-side error unrelated to auth; retry after checking provider status.
 */
export type ProviderReadinessKind =
  | "ready"
  | "auth-missing"
  | "auth-invalid"
  | "unreachable"
  | "provider-failure";

// ---------------------------------------------------------------------------
// ProviderReadinessResult
// ---------------------------------------------------------------------------

/**
 * Discriminated union returned by a ProviderReadinessProbe.
 *
 * - `{ kind: "ready" }` — gate passes; no error.
 * - Non-ready kinds optionally carry a short, credential-free `detail` string
 *   for diagnostic context (never contains the token value or raw credentials).
 */
export type ProviderReadinessResult =
  | { kind: "ready" }
  | { kind: Exclude<ProviderReadinessKind, "ready">; detail?: string };

// ---------------------------------------------------------------------------
// ProviderReadinessProbe
// ---------------------------------------------------------------------------

/**
 * Injectable seam for provider readiness determination.
 *
 * Receives the sanitized process environment (secrets stripped by the caller).
 * The adapter implementation may enrich the env with a resolved OAuth token
 * before calling the SDK.
 *
 * Contract:
 * - Never throws — all errors are captured and returned as non-ready kinds.
 * - Returns ProviderReadinessResult synchronously after the probe completes.
 * - The real adapter probe (adapter/claude-code/provider-readiness-probe.ts)
 *   performs a minimal authenticated connection attempt.
 * - Test fakes return a predetermined result without any real network call.
 */
export type ProviderReadinessProbe = (
  env: Record<string, string | undefined>,
) => Promise<ProviderReadinessResult>;
