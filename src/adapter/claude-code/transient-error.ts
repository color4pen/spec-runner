/**
 * Transient agent error classifier for the local Claude Code adapter.
 *
 * Implements a fail-closed whitelist: only known transient connection/socket/
 * network-timeout/5xx-class patterns are classified as transient.
 * Unknown or unrecognised errors always return false (immediate halt).
 *
 * Pure module — no I/O or SDK imports.
 */

/**
 * Simple text tokens matched case-insensitively (substring match).
 * Presence of any token indicates a transient error.
 */
const SIMPLE_TOKENS_LC: string[] = [
  // Connection errors
  "connectionrefused",
  "econnrefused",
  "econnreset",
  "epipe",
  "enetunreach",
  "ehostunreach",
  "eai_again",
  // Socket errors
  "failedtoopensocket",
  "socket hang up",
  "unable to connect to api",
  // Network / fetch errors
  "fetch failed",
  "network error",
  "etimedout",
  "request timed out",
  "socket timeout",
  "stream idle timeout",
  // Named 5xx descriptors
  "internal server error",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
  "overloaded",
];

/**
 * Pattern that matches 5xx numeric HTTP status codes only in a status context.
 *
 * - 500, 502, 503, 504, 529 require a context word (status/HTTP/Error/API/code)
 *   to the left, to avoid matching standalone digit sequences.
 * - Both "HTTP 503" and "status 503" and "Error 503" match.
 * - A bare "503" or "503 items" does NOT match.
 */
const STATUS_5XX_PATTERN =
  /(?:status|http|error|api|code)\s*[:/]?\s*(500|502|503|504|529)\b/i;

/**
 * Collect all message strings from an error, recursively following `.cause`.
 * Cycle-safe via a visited set.
 */
function collectMessages(err: unknown, visited = new Set<unknown>()): string[] {
  if (!err || typeof err !== "object" || visited.has(err)) return [];
  visited.add(err);

  const obj = err as Record<string, unknown>;
  const messages: string[] = [];

  if (typeof obj["message"] === "string") {
    messages.push(obj["message"]);
  }

  if (obj["cause"] !== undefined) {
    messages.push(...collectMessages(obj["cause"], visited));
  }

  return messages;
}

function isTransientMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  if (SIMPLE_TOKENS_LC.some((token) => lower.includes(token))) {
    return true;
  }
  if (STATUS_5XX_PATTERN.test(msg)) {
    return true;
  }
  return false;
}

/**
 * Returns true when `err` (or any nested `cause`) contains a known transient
 * token. Returns false for any error not on the whitelist (fail-closed).
 */
export function isTransientAgentError(err: unknown): boolean {
  const messages = collectMessages(err);
  return messages.some(isTransientMessage);
}
