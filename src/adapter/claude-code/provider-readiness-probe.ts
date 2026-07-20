/**
 * Real adapter-backed provider readiness probe for the local Claude Code runtime.
 *
 * Performs a minimal, side-effect-free authenticated connection attempt via the
 * Claude Agent SDK. Used by LocalRuntime.assertProviderReadiness() in production;
 * replaced by an injected fake in tests (T-04 / T-05).
 *
 * Design decisions (from design.md):
 * - Probe approach (not connection pre-ordering): the minimal query adds negligible
 *   latency and avoids restructuring the pipeline execution order.
 * - Uses the SDK's query() function (same as agent-runner.ts) with maxTurns: 1,
 *   no tools, no MCP, a wall-clock timeout, and early abort after the first
 *   assistant turn confirms authentication.
 * - Token absence alone is NOT auth-missing; the SDK may authenticate via
 *   interactive credential stores. Token resolution is best-effort.
 * - Error classification uses conservative signal patterns (spirit of AUTH_PATTERNS
 *   in git-fetch-error.ts and transient-error.ts).
 * - The token value never appears in the returned detail string.
 */
import { loadClaudeAgentSdk, type ClaudeAgentSdkLoader } from "./sdk-loader.js";
import { stripSecrets } from "../../util/env-filter.js";
import type { ProviderReadinessProbe, ProviderReadinessResult } from "../../core/port/provider-readiness.js";

/**
 * Local type for the OAuth token resolver — narrowed to the exact overload the
 * probe uses (opts: { optional: true } → result may be undefined).
 *
 * Defined locally to avoid a forbidden adapter→domain static import edge (DSM §3).
 * The real implementation is loaded lazily via dynamic import at probe call time.
 */
type TokenResolver = (
  env: Record<string, string | undefined>,
  opts: { optional: true },
) => Promise<{ token: string; source: string } | undefined>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Wall-clock timeout for the readiness probe (comparable to doctor's 5 s check). */
const PROBE_TIMEOUT_MS = 10_000;

/** Cheapest viable model for the probe (minimal token cost). */
const PROBE_MODEL = "claude-haiku-4-5";

// ---------------------------------------------------------------------------
// Auth-related error patterns (conservative — must not misclassify network errors)
// ---------------------------------------------------------------------------

/** Patterns that indicate a credential was found but rejected (401-equivalent). */
const AUTH_INVALID_PATTERNS: RegExp[] = [
  /unauthorized/i,
  /invalid.*(?:token|credential|key)/i,
  /(?:token|credential|key).*(?:invalid|expired|revoked)/i,
  /\b401\b/,
  /authentication.*(?:fail|reject|error)/i,
];

/** Patterns that indicate no credential was found / not authenticated at all. */
const AUTH_MISSING_PATTERNS: RegExp[] = [
  /no.*(?:credential|token|auth)/i,
  /credential.*not.*found/i,
  /not.*authenticated/i,
  /login.*required/i,
];

/** Patterns that indicate a transient network / connectivity failure. */
const NETWORK_PATTERNS: RegExp[] = [
  /econnrefused/i,
  /econnreset/i,
  /etimedout/i,
  /fetch failed/i,
  /network error/i,
  /socket hang up/i,
  /unable to connect/i,
  /enetunreach/i,
  /ehostunreach/i,
  /aborted/i,
  /timed? ?out/i,
];

// ---------------------------------------------------------------------------
// Error classification helpers
// ---------------------------------------------------------------------------

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "AbortError" ||
    err.message.toLowerCase().includes("abort") ||
    err.message.toLowerCase().includes("the operation was aborted")
  );
}

function classifyError(
  err: unknown,
  hadToken: boolean,
): Exclude<ProviderReadinessResult["kind"], "ready"> {
  if (isAbortError(err)) {
    return "unreachable";
  }

  const msg = messageOf(err);

  // Network / connectivity failure (checked before auth to avoid misclassifying
  // "connection refused" as an auth error)
  if (NETWORK_PATTERNS.some((p) => p.test(msg))) {
    return "unreachable";
  }

  // Auth-missing: no credential found at all
  if (AUTH_MISSING_PATTERNS.some((p) => p.test(msg))) {
    return hadToken ? "auth-invalid" : "auth-missing";
  }

  // Auth-invalid: credential found but rejected
  if (AUTH_INVALID_PATTERNS.some((p) => p.test(msg))) {
    return hadToken ? "auth-invalid" : "auth-missing";
  }

  // Unknown / server-side error
  return "provider-failure";
}

/**
 * Build a sanitized, credential-free detail string from a thrown error.
 * Never includes the token value or any pattern-matched secret.
 */
function buildDetail(err: unknown, tokenValue: string | undefined): string {
  let msg = messageOf(err);
  // Scrub token value before truncation so it never appears in the detail string
  if (tokenValue && msg.includes(tokenValue)) {
    msg = msg.replaceAll(tokenValue, "[REDACTED]");
  }
  // Truncate to a reasonable bound; never include the token literal
  const bounded = msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
  return bounded;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface ClaudeProviderReadinessProbeOptions {
  /** Injectable SDK loader for testing. Defaults to the real loadClaudeAgentSdk. */
  loadSdkFn?: ClaudeAgentSdkLoader;
  /**
   * Injectable token resolver for testing.
   * Defaults to resolveClaudeCodeOAuthToken (loaded lazily via dynamic import to avoid
   * a forbidden adapter→domain static import edge per DSM §3).
   */
  resolveTokenFn?: TokenResolver;
  /** Wall-clock timeout in ms. Defaults to PROBE_TIMEOUT_MS (10 s). */
  timeoutMs?: number;
  /** Model to use for the probe. Defaults to PROBE_MODEL. */
  model?: string;
}

/**
 * Factory that returns a ProviderReadinessProbe backed by the Claude Agent SDK.
 *
 * The returned probe:
 * - Resolves the Claude Code OAuth token best-effort (token absence is not auth-missing).
 * - Fires a minimal SDK query (maxTurns: 1, no tools, no MCP, cheapest model).
 * - Aborts early once an authenticated turn is confirmed.
 * - Never throws — all errors are captured and classified into ProviderReadinessResult.
 * - Never exposes the token value in any returned detail string.
 */
export function createClaudeProviderReadinessProbe(
  opts: ClaudeProviderReadinessProbeOptions = {},
): ProviderReadinessProbe {
  const loadSdkFn = opts.loadSdkFn ?? loadClaudeAgentSdk;
  const timeoutMs = opts.timeoutMs ?? PROBE_TIMEOUT_MS;
  const model = opts.model ?? PROBE_MODEL;

  return async (env: Record<string, string | undefined>): Promise<ProviderReadinessResult> => {
    // Resolve token function: use injected resolver if provided, otherwise wrap the
    // real implementation loaded via dynamic import to avoid a forbidden
    // adapter→domain static import edge (DSM §3).
    // The wrapper narrows to TokenResolver (always calls with { optional: true }).
    // TypeScript allows a one-parameter function to be assigned to a two-parameter
    // function type when the extra parameter can be safely ignored.
    const resolveTokenFn: TokenResolver = opts.resolveTokenFn ??
      (async (env) => {
        const { resolveClaudeCodeOAuthToken } = await import("../../core/credentials/claude-code.js");
        return resolveClaudeCodeOAuthToken(env, { optional: true });
      });

    // Step 1: Resolve token best-effort.
    // Token absence alone is NOT auth-missing — the SDK may authenticate via
    // interactive credential stores (CLAUDE.md, keychain, etc.).
    let resolvedToken: string | undefined;
    try {
      const resolved = await resolveTokenFn(env, { optional: true });
      resolvedToken = resolved?.token;
    } catch {
      // Best-effort resolution; token remains undefined
    }
    const hadToken = resolvedToken !== undefined;

    // Step 2: Build the environment for the SDK (secrets stripped, token injected if present).
    const sdkEnv = stripSecrets(env);
    if (resolvedToken !== undefined) {
      sdkEnv["CLAUDE_CODE_OAUTH_TOKEN"] = resolvedToken;
    }

    // Step 3: Set up AbortController for wall-clock timeout.
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    // Step 4: Run the minimal probe query.
    try {
      const sdk = await loadSdkFn();
      const messages = sdk.query({
        prompt: "ok",
        options: {
          allowedTools: [],
          maxTurns: 1,
          model,
          systemPrompt: "Reply with one word: ok",
          permissionMode: "bypassPermissions",
          abortController,
          env: sdkEnv,
        },
      });

      // Step 5: Consume messages until an assistant turn is confirmed or the stream ends.
      for await (const message of messages as AsyncGenerator<Record<string, unknown>, void>) {
        const msgType = message["type"];
        if (msgType === "result") {
          // Any result message (success or otherwise) indicates an authenticated turn.
          abortController.abort();
          return { kind: "ready" };
        }
        if (msgType === "stream_event") {
          const event = message["event"] as Record<string, unknown> | undefined;
          if (event?.["type"] === "message_start") {
            // message_start fires only after authentication succeeds.
            abortController.abort();
            return { kind: "ready" };
          }
        }
      }

      // Reached end of stream without error and without explicit abort — treat as ready.
      return { kind: "ready" };
    } catch (err: unknown) {
      // Timeout abort → unreachable
      if (abortController.signal.aborted) {
        return { kind: "unreachable", detail: `Readiness probe timed out after ${timeoutMs}ms` };
      }

      const kind = classifyError(err, hadToken);
      const detail = buildDetail(err, resolvedToken);
      return { kind, detail };
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
