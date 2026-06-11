/**
 * Git transport authentication helper.
 *
 * Provides per-invocation token injection for git transport operations (fetch, push, etc.)
 * via HTTP extraheader, without modifying global git config or using credential helpers.
 *
 * D1: Uses `git -c http.<scope>.extraheader=AUTHORIZATION: basic <base64>` injection.
 * D2: Sets `credential.helper=` to disable any credential helper prompts.
 * D3: SSH / non-HTTPS origins receive no injection (transparent pass-through).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SpawnFn as UtilSpawnFn } from "../util/spawn.js";
import type { SpawnFn as GitExecSpawnFn } from "../util/git-exec.js";

const execFileAsync = promisify(execFile);

/**
 * Git transport subcommands that require authentication.
 */
export const TRANSPORT_SUBCOMMANDS = new Set([
  "fetch",
  "push",
  "clone",
  "ls-remote",
  "pull",
]);

/**
 * Build git `-c` arguments that inject a GitHub token as HTTP basic auth.
 *
 * Returns `[]` when:
 * - `token` is absent or empty
 * - `originUrl` is absent, non-HTTPS (SSH / git@), or unparseable
 *
 * Returns `["-c", "http.<scope>.extraheader=AUTHORIZATION: basic <base64>", "-c", "credential.helper="]`
 * for a valid HTTPS URL + token, where `<scope>` is `<scheme>://<host>/`.
 *
 * Tokens are passed via base64("x-access-token:" + token) per GitHub HTTPS PAT auth spec.
 */
export function buildTransportAuthArgs(
  token: string | undefined,
  originUrl: string | undefined,
): string[] {
  if (!token || token.length === 0) return [];
  if (!originUrl || originUrl.length === 0) return [];

  // SSH format: git@host:... or git://... — not HTTPS
  if (originUrl.startsWith("git@") || originUrl.startsWith("git://")) return [];

  let url: URL;
  try {
    url = new URL(originUrl);
  } catch {
    return []; // Unparseable URL
  }

  // HTTPS only — plain http: would send the basic-auth token in cleartext
  // (spec: non-HTTPS origins preserve ambient git behavior).
  if (url.protocol !== "https:") return [];

  // Derive scope: <scheme>://<host>/  (no embedded credentials)
  // url.host includes port when non-default (e.g. github.corp.com:8443),
  // which is required for git http.<url> prefix-match on GHES non-standard ports.
  const scope = `${url.protocol}//${url.host}/`;

  // Encode token as basic auth: base64("x-access-token:" + token)
  const encoded = Buffer.from(`x-access-token:${token}`).toString("base64");
  const headerValue = `AUTHORIZATION: basic ${encoded}`;

  return [
    "-c", `http.${scope}.extraheader=${headerValue}`,
    "-c", "credential.helper=",
  ];
}

/**
 * Find the first git subcommand in args (skip `-c key=value` pairs and other flags).
 * Returns undefined if no subcommand is found.
 *
 * Limitation: two-token flags other than `-c` (e.g. `-C <path>`, `--git-dir <path>`)
 * are not skipped as pairs, so their value would be misread as the subcommand and
 * injection silently skipped. Call transport commands without such flags, or use
 * the single-token `--git-dir=<path>` form.
 */
function firstSubcommand(args: string[]): string | undefined {
  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (arg === "-c") {
      i += 2; // skip -c and its key=value argument
    } else if (arg.startsWith("-")) {
      i++;
    } else {
      return arg;
    }
  }
  return undefined;
}

/**
 * Returns true if the git args include a transport subcommand.
 */
function isTransportArgs(args: string[]): boolean {
  const sub = firstSubcommand(args);
  return sub !== undefined && TRANSPORT_SUBCOMMANDS.has(sub);
}

/**
 * Wrap a util/spawn.ts SpawnFn to inject transport auth for git transport commands.
 * Auth args are resolved async on first transport call, then memoized.
 *
 * Non-transport git commands and non-git commands are passed through unchanged.
 */
export function wrapTransportSpawn(
  base: UtilSpawnFn,
  getAuthArgs: () => Promise<string[]>,
): UtilSpawnFn {
  return async (cmd, args, opts) => {
    if (cmd === "git" && isTransportArgs(args)) {
      const authArgs = await getAuthArgs();
      if (authArgs.length > 0) {
        return base("git", [...authArgs, ...args], opts);
      }
    }
    return base(cmd, args, opts);
  };
}

/**
 * Wrap a git-exec.ts SpawnFn to inject transport auth for git transport commands.
 * Uses the synchronously-cached auth args (populated by a prior wrapTransportSpawn call
 * or an explicit `authArgs()` pre-warm).
 *
 * If the cache is not yet populated, the command runs without auth (safe fallback).
 * Callers should pre-warm via `authArgs()` before using this wrapper for transport commands.
 */
export function wrapTransportGitExecSpawn(
  base: GitExecSpawnFn,
  getSyncArgs: () => string[],
): GitExecSpawnFn {
  return (bin, args, opts) => {
    if (bin === "git" && isTransportArgs(args)) {
      const authArgs = getSyncArgs();
      if (authArgs.length > 0) {
        return base("git", [...authArgs, ...args], opts);
      }
    }
    return base(bin, args, opts);
  };
}

/**
 * Resolve the raw git remote URL for "origin" using execFile.
 * Returns undefined on failure (not a git repo, no origin, etc.).
 */
async function getRawOriginUrl(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["remote", "get-url", "origin"],
      { cwd },
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Create a transport auth provider for a given token and origin.
 *
 * The provider memoizes the auth args: origin URL is resolved once, extraheader is built once.
 * Returns wrappers for both util/spawn.ts and git-exec.ts SpawnFn interfaces.
 *
 * @param opts.token             - Resolved GitHub token (or undefined for no auth)
 * @param opts.cwd               - Working directory for default origin URL resolution
 * @param opts.resolveOriginUrl  - Async fn to get the origin URL (default: git remote get-url origin)
 */
export function createTransportAuth(opts: {
  token?: string;
  cwd?: string;
  resolveOriginUrl?: () => Promise<string | undefined>;
}): {
  wrapSpawn: (base: UtilSpawnFn) => UtilSpawnFn;
  wrapGitExecSpawn: (base: GitExecSpawnFn) => GitExecSpawnFn;
  authArgs: () => Promise<string[]>;
} {
  let cachedArgs: string[] | undefined;
  let resolvePromise: Promise<string[]> | null = null;

  const authArgs = (): Promise<string[]> => {
    if (cachedArgs !== undefined) return Promise.resolve(cachedArgs);
    if (resolvePromise) return resolvePromise;

    resolvePromise = (async (): Promise<string[]> => {
      try {
        const resolveUrl =
          opts.resolveOriginUrl ??
          (() => getRawOriginUrl(opts.cwd ?? process.cwd()));
        const url = await resolveUrl();
        const args = buildTransportAuthArgs(opts.token, url);
        cachedArgs = args;
        return args;
      } catch (err) {
        resolvePromise = null; // allow retry on next authArgs() call
        throw err;
      }
    })();

    return resolvePromise;
  };

  // Sync accessor for git-exec wrapper (returns cached value or [] if not yet resolved)
  const getAuthArgsSync = (): string[] => cachedArgs ?? [];

  const wrapSpawn = (base: UtilSpawnFn): UtilSpawnFn =>
    wrapTransportSpawn(base, authArgs);

  const wrapGitExecSpawn = (base: GitExecSpawnFn): GitExecSpawnFn =>
    wrapTransportGitExecSpawn(base, getAuthArgsSync);

  return { wrapSpawn, wrapGitExecSpawn, authArgs };
}
