/**
 * Env behavioral test: doctor.ts buildExecFile strips secrets from env.
 *
 * TC-DOC-ENV-01: buildExecFile strips GH_TOKEN from env
 * TC-DOC-ENV-02: buildExecFile preserves PATH and forwards timeout/signal
 *
 * Verifies that the composition-root buildExecFile adapter strips secrets
 * via stripSecrets before passing env to the underlying execFileAsyncImpl.
 */
import { describe, it, expect, vi } from "vitest";
import { buildExecFile } from "../../../src/cli/doctor.js";

describe("TC-DOC-ENV-01: buildExecFile strips credential keys from env", () => {
  it("does not pass GH_TOKEN to the underlying execFileAsyncImpl", async () => {
    const spy = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    const execFile = buildExecFile(
      { GH_TOKEN: "ghp_secret", GITHUB_TOKEN: "github_pat_secret", PATH: "/usr/bin" },
      spy as unknown as Parameters<typeof buildExecFile>[1],
    );

    await execFile("git", ["--version"]);

    expect(spy).toHaveBeenCalledOnce();
    const thirdArg = spy.mock.calls[0]?.[2] as { env?: Record<string, string> } | undefined;
    expect(thirdArg?.env).toBeDefined();
    expect(thirdArg?.env?.["GH_TOKEN"]).toBeUndefined();
    expect(thirdArg?.env?.["GITHUB_TOKEN"]).toBeUndefined();
  });
});

describe("TC-DOC-ENV-02: buildExecFile preserves PATH and forwards timeout/signal", () => {
  it("preserves PATH in the env passed to the underlying execFileAsyncImpl", async () => {
    const spy = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    const execFile = buildExecFile(
      { GH_TOKEN: "secret", PATH: "/usr/local/bin:/usr/bin" },
      spy as unknown as Parameters<typeof buildExecFile>[1],
    );

    await execFile("git", ["--version"]);

    const thirdArg = spy.mock.calls[0]?.[2] as { env?: Record<string, string> } | undefined;
    expect(thirdArg?.env?.["PATH"]).toBe("/usr/local/bin:/usr/bin");
  });

  it("forwards timeout and signal options to the underlying execFileAsyncImpl", async () => {
    const spy = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    const execFile = buildExecFile(
      { PATH: "/usr/bin" },
      spy as unknown as Parameters<typeof buildExecFile>[1],
    );

    const controller = new AbortController();
    await execFile("git", ["--version"], { timeout: 5000, signal: controller.signal });

    const thirdArg = spy.mock.calls[0]?.[2] as {
      timeout?: number;
      signal?: AbortSignal;
    } | undefined;
    expect(thirdArg?.timeout).toBe(5000);
    expect(thirdArg?.signal).toBe(controller.signal);
  });
});
