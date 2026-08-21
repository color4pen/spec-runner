/**
 * Real adapter-backed supported models probe for the local Claude Code runtime.
 *
 * Calls sdk.query() in streaming input mode and invokes supportedModels() on the
 * resulting Query object to retrieve the list of currently supported Anthropic models.
 * Used by LocalRuntime.listSupportedModels() in production; replaced by injected fakes in tests.
 *
 * Design decisions:
 * - Streaming input mode: SDK must be started with an AsyncIterable prompt so that
 *   supportedModels() is available on the query result (sdk.d.ts:2026-2030).
 * - AbortController + setTimeout for wall-clock timeout enforcement.
 * - try/finally guarantees abort + close in all paths (success, failure, timeout).
 * - Never throws — all errors are captured as { kind: "unavailable", reason }.
 * - Token value never appears in reason strings.
 */
import { loadClaudeAgentSdk, type ClaudeAgentSdkLoader, type ClaudeSdkQueryResult } from "./sdk-loader.js";
import { stripSecrets } from "../../util/env-filter.js";
import type { SupportedModelsProbe, SupportedModelsResult } from "../../core/port/model-listing.js";

/**
 * Local type for the OAuth token resolver — narrowed to the exact overload the
 * probe uses (opts: { optional: true } → result may be undefined).
 *
 * Defined locally to avoid a forbidden adapter→domain static import edge (DSM §3).
 */
type TokenResolver = (
  env: Record<string, string | undefined>,
  opts: { optional: true },
) => Promise<{ token: string; source: string } | undefined>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Wall-clock timeout for the supported models probe.
 * Matches the provider-readiness probe timeout for consistency.
 */
const PROBE_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

/**
 * Build a sanitized, credential-free reason string from a thrown error.
 * Scrubs the token value before truncation so it never appears in the output.
 */
function buildReason(err: unknown, tokenValue: string | undefined): string {
  let msg = messageOf(err);
  if (tokenValue && msg.includes(tokenValue)) {
    msg = msg.replaceAll(tokenValue, "[REDACTED]");
  }
  return msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
}

/**
 * Async iterable that yields nothing and terminates when the abort signal fires.
 * Used to keep the streaming input channel alive until we are done with supportedModels().
 * The channel closing signals to the SDK that the session is finished.
 */
async function* makePromptIterable(signal: AbortSignal): AsyncIterable<unknown> {
  try {
    await new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  } finally {
    return; // Close the streaming input channel normally.
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface ClaudeSupportedModelsProbeOptions {
  /** Injectable SDK loader for testing. Defaults to the real loadClaudeAgentSdk. */
  loadSdkFn?: ClaudeAgentSdkLoader;
  /**
   * Injectable token resolver for testing.
   * Defaults to resolveClaudeCodeOAuthToken (loaded lazily via dynamic import).
   */
  resolveTokenFn?: TokenResolver;
  /** Wall-clock timeout in ms. Defaults to PROBE_TIMEOUT_MS (30 s). */
  timeoutMs?: number;
}

/**
 * Factory that returns a SupportedModelsProbe backed by the Claude Agent SDK.
 *
 * The returned probe:
 * - Resolves the Claude Code OAuth token best-effort (token absence is not auth-missing).
 * - Launches the SDK in streaming input mode (required for supportedModels()).
 * - Calls supportedModels() and extracts ModelInfo.value entries.
 * - Aborts + closes the session in all paths (success / failure / timeout).
 * - Never throws — all errors become { kind: "unavailable", reason }.
 * - Never exposes the token value in reason strings.
 */
export function createClaudeSupportedModelsProbe(
  opts: ClaudeSupportedModelsProbeOptions = {},
): SupportedModelsProbe {
  const loadSdkFn = opts.loadSdkFn ?? loadClaudeAgentSdk;
  const timeoutMs = opts.timeoutMs ?? PROBE_TIMEOUT_MS;

  return async (env: Record<string, string | undefined>): Promise<SupportedModelsResult> => {
    // Resolve token function lazily to avoid forbidden adapter→domain static import edge (DSM §3).
    const resolveTokenFn: TokenResolver = opts.resolveTokenFn ??
      (async (env) => {
        const { resolveClaudeCodeOAuthToken } = await import("../../core/credentials/claude-code.js");
        return resolveClaudeCodeOAuthToken(env, { optional: true });
      });

    // Step 1: Resolve token best-effort. Absence alone is NOT auth-missing.
    let resolvedToken: string | undefined;
    try {
      const resolved = await resolveTokenFn(env, { optional: true });
      resolvedToken = resolved?.token;
    } catch {
      // Best-effort — token remains undefined.
    }

    // Step 2: Build sanitized environment for the SDK.
    const sdkEnv = stripSecrets(env);
    if (resolvedToken !== undefined) {
      sdkEnv["CLAUDE_CODE_OAUTH_TOKEN"] = resolvedToken;
    }

    // Step 3: Set up AbortController for wall-clock timeout.
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    let query: ClaudeSdkQueryResult | undefined;
    try {
      // Step 4: Load SDK and launch in streaming input mode (required for supportedModels()).
      const sdk = await loadSdkFn();
      query = sdk.query({
        prompt: makePromptIterable(abortController.signal),
        options: {
          allowedTools: [],
          permissionMode: "bypassPermissions",
          abortController,
          env: sdkEnv,
        },
      }) as ClaudeSdkQueryResult;

      // Step 5: Call supportedModels() and extract model IDs.
      const modelInfos = await query.supportedModels();
      return { kind: "listed", models: modelInfos.map((m) => m.value) };
    } catch (err: unknown) {
      const reason = buildReason(err, resolvedToken);
      return { kind: "unavailable", reason };
    } finally {
      // Step 6: Always abort + close to release session / bundled CLI subprocess.
      clearTimeout(timeoutId);
      abortController.abort();
      query?.close();
    }
  };
}
