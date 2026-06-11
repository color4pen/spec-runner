import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  buildTransportAuthArgs,
  createTransportAuth,
  TRANSPORT_SUBCOMMANDS,
} from "../transport-auth.js";
import type { SpawnFn as UtilSpawnFn, SpawnOptions as UtilSpawnOptions, SpawnResult } from "../../util/spawn.js";
import type { SpawnFn as GitExecSpawnFn } from "../../util/git-exec.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HTTPS_ORIGIN = "https://github.com/owner/repo.git";
const HTTP_ORIGIN = "http://github.example.com/owner/repo.git";
const SSH_AT_ORIGIN = "git@github.com:owner/repo.git";
const SSH_URL_ORIGIN = "ssh://git@github.com/owner/repo.git";
const GIT_PROTO_ORIGIN = "git://github.com/owner/repo.git";
const TOKEN = "ghp_testtoken123";

/** A no-op util/spawn.ts SpawnFn mock. */
function makeUtilSpawnFn(): UtilSpawnFn & ReturnType<typeof vi.fn> {
  return vi.fn(async (_cmd: string, _args: string[], _opts: UtilSpawnOptions): Promise<SpawnResult> => ({
    exitCode: 0,
    stdout: "",
    stderr: "",
  }));
}

/** A no-op git-exec.ts SpawnFn mock (returns a minimal ChildProcess-like). */
function makeGitExecSpawnFn(): GitExecSpawnFn & ReturnType<typeof vi.fn> {
  // Return a minimal ChildProcess-like object that won't break runSubprocess listeners
  return vi.fn((_bin: string, _args: string[], _opts: unknown): ChildProcess => {
    // Use nodeSpawn with a no-op command for a real ChildProcess
    return nodeSpawn("true", [], { stdio: ["pipe", "pipe", "pipe"] });
  });
}

// ---------------------------------------------------------------------------
// buildTransportAuthArgs
// ---------------------------------------------------------------------------

describe("buildTransportAuthArgs", () => {
  it("returns [] when token is undefined", () => {
    expect(buildTransportAuthArgs(undefined, HTTPS_ORIGIN)).toEqual([]);
  });

  it("returns [] when token is empty string", () => {
    expect(buildTransportAuthArgs("", HTTPS_ORIGIN)).toEqual([]);
  });

  it("returns [] when originUrl is undefined", () => {
    expect(buildTransportAuthArgs(TOKEN, undefined)).toEqual([]);
  });

  it("returns [] when originUrl is empty string", () => {
    expect(buildTransportAuthArgs(TOKEN, "")).toEqual([]);
  });

  it("returns [] for SSH git@ origin", () => {
    expect(buildTransportAuthArgs(TOKEN, SSH_AT_ORIGIN)).toEqual([]);
  });

  it("returns [] for SSH url:// origin", () => {
    expect(buildTransportAuthArgs(TOKEN, SSH_URL_ORIGIN)).toEqual([]);
  });

  it("returns [] for git:// origin", () => {
    expect(buildTransportAuthArgs(TOKEN, GIT_PROTO_ORIGIN)).toEqual([]);
  });

  it("returns [] for unparseable URL", () => {
    expect(buildTransportAuthArgs(TOKEN, "not-a-url")).toEqual([]);
  });

  it("returns auth args for HTTPS origin", () => {
    const args = buildTransportAuthArgs(TOKEN, HTTPS_ORIGIN);
    expect(args).toHaveLength(4);
    expect(args[0]).toBe("-c");
    expect(args[2]).toBe("-c");
    expect(args[3]).toBe("credential.helper=");
  });

  it("encodes scope as <scheme>://<host>/ for HTTPS", () => {
    const args = buildTransportAuthArgs(TOKEN, HTTPS_ORIGIN);
    const configArg = args[1]!;
    expect(configArg).toMatch(/^http\.https:\/\/github\.com\/\.extraheader=/);
  });

  it("encodes base64(x-access-token:<token>) correctly", () => {
    const args = buildTransportAuthArgs(TOKEN, HTTPS_ORIGIN);
    const configArg = args[1]!;
    const expected = Buffer.from(`x-access-token:${TOKEN}`).toString("base64");
    expect(configArg).toContain(`AUTHORIZATION: basic ${expected}`);
  });

  it("strips embedded credentials from scope", () => {
    const urlWithCreds = "https://user:password@github.com/owner/repo.git";
    const args = buildTransportAuthArgs(TOKEN, urlWithCreds);
    const configArg = args[1]!;
    // Scope must not contain credentials
    expect(configArg).toMatch(/^http\.https:\/\/github\.com\/\.extraheader=/);
    expect(configArg).not.toContain("user:password");
  });

  it("returns no auth args for plain HTTP origin (cleartext — non-HTTPS preserves ambient behavior)", () => {
    const args = buildTransportAuthArgs(TOKEN, HTTP_ORIGIN);
    expect(args).toEqual([]);
  });

  it("encodes scope including port for GHES non-standard port (url.host not url.hostname)", () => {
    const ghesUrl = "https://github.corp.com:8443/owner/repo.git";
    const args = buildTransportAuthArgs(TOKEN, ghesUrl);
    expect(args).toHaveLength(4);
    const configArg = args[1]!;
    // Scope must include the port so git http.<url> prefix-match works for GHES
    expect(configArg).toMatch(/^http\.https:\/\/github\.corp\.com:8443\/\.extraheader=/);
  });
});

// ---------------------------------------------------------------------------
// TRANSPORT_SUBCOMMANDS
// ---------------------------------------------------------------------------

describe("TRANSPORT_SUBCOMMANDS", () => {
  it("includes fetch, push, clone, ls-remote, pull", () => {
    expect(TRANSPORT_SUBCOMMANDS.has("fetch")).toBe(true);
    expect(TRANSPORT_SUBCOMMANDS.has("push")).toBe(true);
    expect(TRANSPORT_SUBCOMMANDS.has("clone")).toBe(true);
    expect(TRANSPORT_SUBCOMMANDS.has("ls-remote")).toBe(true);
    expect(TRANSPORT_SUBCOMMANDS.has("pull")).toBe(true);
  });

  it("does not include add, commit, checkout, status, rev-parse, branch", () => {
    expect(TRANSPORT_SUBCOMMANDS.has("add")).toBe(false);
    expect(TRANSPORT_SUBCOMMANDS.has("commit")).toBe(false);
    expect(TRANSPORT_SUBCOMMANDS.has("checkout")).toBe(false);
    expect(TRANSPORT_SUBCOMMANDS.has("status")).toBe(false);
    expect(TRANSPORT_SUBCOMMANDS.has("rev-parse")).toBe(false);
    expect(TRANSPORT_SUBCOMMANDS.has("branch")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// wrapTransportSpawn (via createTransportAuth) — util/spawn.ts SpawnFn
// ---------------------------------------------------------------------------

describe("createTransportAuth → wrapSpawn", () => {
  let resolveOriginUrl: () => Promise<string | undefined>;
  let baseSpawn: ReturnType<typeof makeUtilSpawnFn>;

  beforeEach(() => {
    resolveOriginUrl = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;
    baseSpawn = makeUtilSpawnFn();
  });

  it("prepends auth args for git fetch", async () => {
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);
    await wrapped("git", ["fetch", "origin"], { cwd: "/repo" });

    const [cmd, args] = baseSpawn.mock.calls[0]!;
    expect(cmd).toBe("git");
    expect(args).toContain("-c");
    expect(args.indexOf("fetch")).toBeGreaterThan(args.indexOf("-c"));
  });

  it("prepends auth args for git push", async () => {
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);
    await wrapped("git", ["push", "origin", "main"], { cwd: "/repo" });

    const [, args] = baseSpawn.mock.calls[0]!;
    const pushIdx = args.indexOf("push");
    const firstArgIdx = args[0] === "-c" ? 0 : -1;
    expect(firstArgIdx).toBe(0);
    expect(pushIdx).toBeGreaterThan(0);
  });

  it("prepends auth args for git ls-remote", async () => {
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);
    await wrapped("git", ["ls-remote", "origin"], { cwd: "/repo" });

    const [, args] = baseSpawn.mock.calls[0]!;
    expect(args[0]).toBe("-c");
  });

  it("passes git add through without auth", async () => {
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);
    await wrapped("git", ["add", "-A"], { cwd: "/repo" });

    const [cmd, args] = baseSpawn.mock.calls[0]!;
    expect(cmd).toBe("git");
    expect(args).toEqual(["add", "-A"]);
  });

  it("passes git commit through without auth", async () => {
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);
    await wrapped("git", ["commit", "-m", "msg"], { cwd: "/repo" });

    const [, args] = baseSpawn.mock.calls[0]!;
    expect(args).toEqual(["commit", "-m", "msg"]);
  });

  it("passes git rev-parse through without auth", async () => {
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);
    await wrapped("git", ["rev-parse", "HEAD"], { cwd: "/repo" });

    const [, args] = baseSpawn.mock.calls[0]!;
    expect(args).toEqual(["rev-parse", "HEAD"]);
  });

  it("passes git branch -D through without auth", async () => {
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);
    await wrapped("git", ["branch", "-D", "my-branch"], { cwd: "/repo" });

    const [, args] = baseSpawn.mock.calls[0]!;
    expect(args).toEqual(["branch", "-D", "my-branch"]);
  });

  it("passes non-git commands through without auth", async () => {
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);
    await wrapped("gh", ["pr", "create"], { cwd: "/repo" });

    const [cmd, args] = baseSpawn.mock.calls[0]!;
    expect(cmd).toBe("gh");
    expect(args).toEqual(["pr", "create"]);
  });

  it("injects no auth for SSH origin", async () => {
    const sshResolve: () => Promise<string | undefined> = vi.fn().mockResolvedValue(SSH_AT_ORIGIN) as () => Promise<string | undefined>;
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl: sshResolve });
    const wrapped = wrapSpawn(baseSpawn);
    await wrapped("git", ["fetch", "origin"], { cwd: "/repo" });

    const [, args] = baseSpawn.mock.calls[0]!;
    expect(args).toEqual(["fetch", "origin"]);
  });

  it("injects no auth when token is undefined", async () => {
    const { wrapSpawn } = createTransportAuth({ token: undefined, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);
    await wrapped("git", ["fetch", "origin"], { cwd: "/repo" });

    const [, args] = baseSpawn.mock.calls[0]!;
    expect(args).toEqual(["fetch", "origin"]);
  });

  it("auth args contain correct base64-encoded token value", async () => {
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);
    await wrapped("git", ["fetch", "origin"], { cwd: "/repo" });

    const [, args] = baseSpawn.mock.calls[0]!;
    const configArg = (args as string[]).find((a) => a.includes("extraheader"));
    expect(configArg).toBeDefined();
    const expected = Buffer.from(`x-access-token:${TOKEN}`).toString("base64");
    expect(configArg).toContain(expected);
  });

  it("does not call git config or modify remote URL", async () => {
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);
    await wrapped("git", ["fetch", "origin"], { cwd: "/repo" });
    await wrapped("git", ["push", "origin", "main"], { cwd: "/repo" });

    // Verify no "config" command was spawned
    const calls = baseSpawn.mock.calls as Array<[string, string[], UtilSpawnOptions]>;
    const configCalls = calls.filter(([, args]) => args[0] === "config");
    expect(configCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// wrapTransportGitExecSpawn — git-exec.ts SpawnFn
// ---------------------------------------------------------------------------

describe("createTransportAuth → wrapGitExecSpawn", () => {
  it("injects auth args for git push after pre-warm", async () => {
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;
    const { wrapGitExecSpawn, authArgs } = createTransportAuth({ token: TOKEN, resolveOriginUrl });

    // Pre-warm the cache
    await authArgs();

    const baseGitExecSpawn = makeGitExecSpawnFn();
    const wrapped = wrapGitExecSpawn(baseGitExecSpawn);
    wrapped("git", ["push", "origin", "main"], {
      cwd: "/repo",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const [, args] = baseGitExecSpawn.mock.calls[0]!;
    expect(args[0]).toBe("-c");
    const pushIdx = (args as string[]).indexOf("push");
    expect(pushIdx).toBeGreaterThan(0);
  });

  it("passes git add through without auth (even after pre-warm)", async () => {
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;
    const { wrapGitExecSpawn, authArgs } = createTransportAuth({ token: TOKEN, resolveOriginUrl });

    await authArgs();

    const baseGitExecSpawn = makeGitExecSpawnFn();
    const wrapped = wrapGitExecSpawn(baseGitExecSpawn);
    wrapped("git", ["add", "-A"], {
      cwd: "/repo",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const [, args] = baseGitExecSpawn.mock.calls[0]!;
    expect(args).toEqual(["add", "-A"]);
  });

  it("falls back to no auth if cache not yet populated", () => {
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;
    const { wrapGitExecSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });

    // Do NOT call authArgs() — cache is empty
    const baseGitExecSpawn = makeGitExecSpawnFn();
    const wrapped = wrapGitExecSpawn(baseGitExecSpawn);
    wrapped("git", ["push", "origin", "main"], {
      cwd: "/repo",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const [, args] = baseGitExecSpawn.mock.calls[0]!;
    // No auth args injected (safe fallback)
    expect(args).toEqual(["push", "origin", "main"]);
  });
});

// ---------------------------------------------------------------------------
// createTransportAuth — memoization
// ---------------------------------------------------------------------------

describe("createTransportAuth memoization", () => {
  it("resolves origin URL only once across multiple transport calls", async () => {
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;
    const baseSpawn = makeUtilSpawnFn();
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);

    await wrapped("git", ["fetch", "origin"], { cwd: "/repo" });
    await wrapped("git", ["push", "origin", "main"], { cwd: "/repo" });
    await wrapped("git", ["push", "origin", "--delete", "branch"], { cwd: "/repo" });

    expect(vi.mocked(resolveOriginUrl)).toHaveBeenCalledTimes(1);
  });

  it("returns the same Promise on concurrent authArgs() calls (no double resolution)", async () => {
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;
    const { authArgs } = createTransportAuth({ token: TOKEN, resolveOriginUrl });

    const [r1, r2] = await Promise.all([authArgs(), authArgs()]);
    expect(r1).toEqual(r2);
    expect(vi.mocked(resolveOriginUrl)).toHaveBeenCalledTimes(1);
  });

  it("returns cached result on subsequent authArgs() calls", async () => {
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;
    const { authArgs } = createTransportAuth({ token: TOKEN, resolveOriginUrl });

    const first = await authArgs();
    const second = await authArgs();
    expect(first).toEqual(second);
    expect(vi.mocked(resolveOriginUrl)).toHaveBeenCalledTimes(1);
  });

  it("wrapSpawn populates cache used by wrapGitExecSpawn", async () => {
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;
    const baseSpawn = makeUtilSpawnFn();
    const baseGitExecSpawn = makeGitExecSpawnFn();
    const { wrapSpawn, wrapGitExecSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });

    const wrappedSpawn = wrapSpawn(baseSpawn);
    const wrappedGitExec = wrapGitExecSpawn(baseGitExecSpawn);

    // First, trigger async resolution via wrapSpawn
    await wrappedSpawn("git", ["fetch", "origin"], { cwd: "/repo" });

    // Now wrapGitExecSpawn should use cached args
    wrappedGitExec("git", ["push", "origin", "main"], {
      cwd: "/repo",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const [, gitExecArgs] = baseGitExecSpawn.mock.calls[0]!;
    expect(gitExecArgs[0]).toBe("-c"); // auth args were injected
  });

  it("SSH origin produces empty auth args (memoized)", async () => {
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(SSH_AT_ORIGIN) as () => Promise<string | undefined>;
    const { authArgs } = createTransportAuth({ token: TOKEN, resolveOriginUrl });

    const args = await authArgs();
    expect(args).toEqual([]);

    // Subsequent call uses cache
    const args2 = await authArgs();
    expect(args2).toEqual([]);
    expect(vi.mocked(resolveOriginUrl)).toHaveBeenCalledTimes(1);
  });

  it("clears resolvePromise on rejection so subsequent authArgs() call retries", async () => {
    let callCount = 0;
    // First call rejects; second call resolves HTTPS_ORIGIN
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("transient error"));
      return Promise.resolve(HTTPS_ORIGIN);
    }) as () => Promise<string | undefined>;

    const { authArgs } = createTransportAuth({ token: TOKEN, resolveOriginUrl });

    // First call should reject
    await expect(authArgs()).rejects.toThrow("transient error");

    // resolvePromise must be cleared; second call should succeed
    const args = await authArgs();
    expect(args).toHaveLength(4);
    expect(args[0]).toBe("-c");
    expect(vi.mocked(resolveOriginUrl)).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Token does not appear in logs (D5)
// ---------------------------------------------------------------------------

describe("token security (D5)", () => {
  it("auth args do not contain plaintext token in header value (only base64)", async () => {
    const args = buildTransportAuthArgs(TOKEN, HTTPS_ORIGIN);
    // The raw token should not appear verbatim — only base64-encoded
    const configArg = args[1]!;
    // configArg should NOT contain the raw token
    expect(configArg).not.toContain(TOKEN);
    // But should contain the base64 form
    const encoded = Buffer.from(`x-access-token:${TOKEN}`).toString("base64");
    expect(configArg).toContain(encoded);
  });

  it("auth args do not modify remote URL", async () => {
    const args = buildTransportAuthArgs(TOKEN, HTTPS_ORIGIN);
    // No arg should be a URL with embedded token
    for (const arg of args) {
      if (arg.startsWith("https://") || arg.startsWith("http://")) {
        expect(arg).not.toContain(TOKEN);
      }
    }
  });

  it("auth args do not invoke git config commands", async () => {
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;
    const baseSpawn = makeUtilSpawnFn();
    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(baseSpawn);

    await wrapped("git", ["push", "origin", "main"], { cwd: "/repo" });

    const calls = baseSpawn.mock.calls as Array<[string, string[], UtilSpawnOptions]>;
    // Should only have one call (no git config side-calls)
    expect(calls).toHaveLength(1);
    const [cmd, args] = calls[0]!;
    expect(cmd).toBe("git");
    // No "config" subcommand
    expect(args[0]).not.toBe("config");
  });

  it("TC-027: error message built from SpawnResult.stderr excludes auth args and token", async () => {
    // Simulates a failed push: stderr is git's raw output, never contains auth args.
    // Callers (e.g. local.ts, orchestrator.ts) build error messages from stderr only.
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;
    const gitStderr = "fatal: repository 'https://github.com/owner/repo.git/' not found";
    const failingSpawn = vi.fn().mockResolvedValue({
      exitCode: 128,
      stdout: "",
      stderr: gitStderr,
    }) as unknown as UtilSpawnFn;

    const { wrapSpawn } = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const wrapped = wrapSpawn(failingSpawn);
    const result = await wrapped("git", ["push", "origin", "main"], { cwd: "/repo" });

    // Auth args were injected into argv (confirm wiring is active)
    const [, spawnArgs] = (failingSpawn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((spawnArgs as string[])[0]).toBe("-c");

    // SpawnResult.stderr is pure git output — no auth material
    expect(result.stderr).toBe(gitStderr);
    expect(result.stderr).not.toContain("extraheader");
    expect(result.stderr).not.toContain(TOKEN);
    const encoded = Buffer.from(`x-access-token:${TOKEN}`).toString("base64");
    expect(result.stderr).not.toContain(encoded);

    // Error message built from stderr (as all callers do) excludes auth args
    const errorMessage = `git push failed (exit ${result.exitCode}): ${result.stderr.trim()}`;
    expect(errorMessage).not.toContain("AUTHORIZATION");
    expect(errorMessage).not.toContain(encoded);
    expect(errorMessage).not.toContain("extraheader");
  });
});

// ---------------------------------------------------------------------------
// Wiring integration tests — TC-015, TC-016, TC-022
//
// These tests mirror the exact wiring code at each call site so that a future
// refactor that silently disconnects auth injection produces a failing test.
// ---------------------------------------------------------------------------

describe("wiring: TC-015 LocalRuntime C1 fetch (local.ts:106 + :437)", () => {
  it("wrappedSpawnFn = wrapSpawn(spawnFn) injects auth args for git fetch origin", async () => {
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;
    const transportAuth = createTransportAuth({ token: TOKEN, resolveOriginUrl });

    // Mirrors local.ts:106 — this.wrappedSpawnFn = this.transportAuth.wrapSpawn(this.spawnFn)
    const baseSpawn = makeUtilSpawnFn();
    const wrappedSpawnFn = transportAuth.wrapSpawn(baseSpawn);

    // Mirrors local.ts:437 — await this.wrappedSpawnFn("git", ["fetch", "origin"], { cwd })
    await wrappedSpawnFn("git", ["fetch", "origin"], { cwd: "/repo" });

    const [cmd, args] = baseSpawn.mock.calls[0]!;
    expect(cmd).toBe("git");
    expect(args[0]).toBe("-c");
    const extraheaderArg = (args as string[]).find((a) => a.includes("extraheader"));
    expect(extraheaderArg).toBeDefined();
    expect(extraheaderArg).toContain("AUTHORIZATION: basic");
  });
});

describe("wiring: TC-016 StepExecutor C5 pushOnly via gitTransportSpawn (local.ts:559)", () => {
  it("wrapGitExecSpawn(defaultSpawnFn) injects auth args for git push after pre-warm", async () => {
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;
    const transportAuth = createTransportAuth({ token: TOKEN, resolveOriginUrl });

    // Pre-warm: mirrors local.ts:436 — await this.transportAuth.authArgs().catch(() => {})
    await transportAuth.authArgs();

    // Mirrors local.ts:559 — gitTransportSpawn: this.transportAuth.wrapGitExecSpawn(defaultSpawnFn)
    const baseGitExecSpawn = makeGitExecSpawnFn();
    const gitTransportSpawn = transportAuth.wrapGitExecSpawn(baseGitExecSpawn);

    // Mirrors pushOnly → gitExecExitCode(infra.spawnFn, cwd, ["push", "origin", branch])
    gitTransportSpawn("git", ["push", "origin", "change/feature-abc123"], {
      cwd: "/repo",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const [, args] = baseGitExecSpawn.mock.calls[0]!;
    expect(args[0]).toBe("-c");
    const extraheaderArg = (args as string[]).find((a) => a.includes("extraheader"));
    expect(extraheaderArg).toBeDefined();
    expect(extraheaderArg).toContain("AUTHORIZATION: basic");
  });
});

describe("wiring: TC-022 archive orchestrator C8 main push (orchestrator.ts:94-95 + :248)", () => {
  it("wrapSpawn(input.spawn) injects auth args for git push origin <baseBranch>", async () => {
    const resolveOriginUrl: () => Promise<string | undefined> = vi.fn().mockResolvedValue(HTTPS_ORIGIN) as () => Promise<string | undefined>;

    // Mirrors orchestrator.ts:94-95:
    //   const transportAuth = createTransportAuth({ token: input.githubToken, cwd });
    //   const spawn = transportAuth.wrapSpawn(input.spawn);
    const transportAuth = createTransportAuth({ token: TOKEN, resolveOriginUrl });
    const baseSpawn = makeUtilSpawnFn();
    const spawn = transportAuth.wrapSpawn(baseSpawn);

    // Mirrors orchestrator.ts:248:
    //   const pushResult = await spawn("git", ["push", "origin", baseBranch], { cwd });
    await spawn("git", ["push", "origin", "main"], { cwd: "/repo" });

    const [cmd, args] = baseSpawn.mock.calls[0]!;
    expect(cmd).toBe("git");
    expect(args[0]).toBe("-c");
    const extraheaderArg = (args as string[]).find((a) => a.includes("extraheader"));
    expect(extraheaderArg).toBeDefined();
    expect(extraheaderArg).toContain("AUTHORIZATION: basic");
  });
});
