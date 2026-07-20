/**
 * Pure domain module: provider readiness classifier and kind-specific recovery hints.
 *
 * No imports from adapter/ (no back-edges to the adapter layer).
 * Imports only from port layer (provider-readiness types) and errors.ts.
 *
 * Pattern mirrors describeGitFetchFailure (git-fetch-error.ts):
 * - prescriptive first sentence (no raw provider error, no credential value)
 * - bounded, credential-free detail appended after a newline when present
 */
import type { ProviderReadinessResult, ProviderReadinessKind } from "../port/provider-readiness.js";
import { SpecRunnerError } from "../../errors.js";

// ---------------------------------------------------------------------------
// PROVIDER_READINESS_HINTS
// ---------------------------------------------------------------------------

/**
 * Kind-specific recovery prescriptions for provider readiness failures.
 *
 * Each entry names only real, registered specrunner commands (verified by
 * tests/hint-command-existence.test.ts). The `claude setup-token` reference is
 * to the external Claude CLI, not to specrunner itself.
 */
export const PROVIDER_READINESS_HINTS: Record<Exclude<ProviderReadinessKind, "ready">, string> = {
  "auth-missing":
    "Run 'claude setup-token' to obtain a Claude authentication token, then store it with 'specrunner login --provider claude'.",
  "auth-invalid":
    "Your Claude authentication token has been rejected. Regenerate it via 'claude setup-token', then replace the stored credential with 'specrunner login --provider claude'.",
  "unreachable":
    "Check network connectivity and retry. If the problem persists, verify that the Claude provider API is reachable from this machine.",
  "provider-failure":
    "The Claude provider returned a server-side error. Retry shortly; if it persists, check the Claude provider status page.",
};

// ---------------------------------------------------------------------------
// Prescriptive first-sentence messages (no raw error, no credential value)
// ---------------------------------------------------------------------------

const PRESCRIPTIVE_MESSAGES: Record<Exclude<ProviderReadinessKind, "ready">, string> = {
  "auth-missing":
    "Claude provider authentication is missing. Set up credentials before running specrunner.",
  "auth-invalid":
    "Claude provider authentication was rejected. Regenerate and replace your credential.",
  "unreachable":
    "Claude provider is unreachable. Check network connectivity and retry.",
  "provider-failure":
    "Claude provider returned a server-side error. Retry shortly.",
};

// ---------------------------------------------------------------------------
// classifyProviderReadiness
// ---------------------------------------------------------------------------

/**
 * Classify a ProviderReadinessResult into a SpecRunnerError for human display.
 *
 * Returns null when result.kind === "ready" (gate passes).
 *
 * For non-ready kinds, returns a SpecRunnerError with:
 * - code: "PROVIDER_NOT_READY" (exits 1 via default EXIT_CODE_MAP fallback)
 * - hint: the matching PROVIDER_READINESS_HINTS entry
 * - message: prescriptive first sentence + "\n" + bounded, credential-free detail
 *            (detail is omitted when absent, following describeGitFetchFailure shape)
 *
 * The first sentence is always prescriptive (never contains the raw provider error
 * or any credential value); detail appears only on a following line when present.
 */
export function classifyProviderReadiness(result: ProviderReadinessResult): SpecRunnerError | null {
  if (result.kind === "ready") return null;

  const kind = result.kind;
  const hint = PROVIDER_READINESS_HINTS[kind];
  const firstSentence = PRESCRIPTIVE_MESSAGES[kind];

  // detail is present only on non-ready kinds (discriminated union shape)
  const detail = (result as { detail?: string }).detail;
  const message = detail ? `${firstSentence}\n${detail}` : firstSentence;

  return new SpecRunnerError("PROVIDER_NOT_READY", hint, message);
}
