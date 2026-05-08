/**
 * Unit tests for branch-checkout.ts
 *
 * TC-11: branch-checkout.ts — checkoutForValidation と restoreBranch が export される
 * TC-12: restoreBranch — warnFn が呼ばれる
 * TC-13: restoreBranch — warnFn 未指定時は process.stderr.write にフォールバック
 */
import { describe, it, expect, vi } from "vitest";
import {
  checkoutForValidation,
  restoreBranch,
} from "../../../../src/core/finish/branch-checkout.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

const cwd = "/tmp";

/**
 * TC-11: checkoutForValidation と restoreBranch が named import できる
 */
describe("TC-11: branch-checkout.ts exports checkoutForValidation and restoreBranch", () => {
  it("can import and call checkoutForValidation", async () => {
    expect(typeof checkoutForValidation).toBe("function");
  });

  it("can import and call restoreBranch", async () => {
    expect(typeof restoreBranch).toBe("function");
  });

  it("checkoutForValidation returns ok:true on success", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((_cmd: string, args: string[]) => {
      // git rev-parse → current branch
      if (args[0] === "rev-parse") {
        return Promise.resolve({ exitCode: 0, stdout: "main\n", stderr: "" });
      }
      // git fetch, git checkout
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await checkoutForValidation({ branch: "feat/test", cwd, spawn });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.originalBranch).toBe("main");
    }
  });
});

/**
 * TC-12: restoreBranch — warnFn が呼ばれる（git checkout 失敗時）
 */
describe("TC-12: restoreBranch — warnFn is called on failure", () => {
  it("calls warnFn with warning message when git checkout fails", async () => {
    const warnFn = vi.fn();
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "error: checkout failed",
    });

    await restoreBranch({ originalBranch: "main", cwd, spawn, warnFn });

    expect(warnFn).toHaveBeenCalledOnce();
    const callArg = warnFn.mock.calls[0]?.[0] as string;
    expect(callArg).toContain("Warning");
    expect(callArg).toContain("main");

    // process.stderr.write must NOT have been called
    expect(stderrSpy).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
  });
});

/**
 * TC-13: restoreBranch — warnFn 未指定時は process.stderr.write にフォールバック
 */
describe("TC-13: restoreBranch — falls back to process.stderr.write when warnFn not provided", () => {
  it("calls process.stderr.write when warnFn is not provided and checkout fails", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "error: restore failed",
    });

    await restoreBranch({ originalBranch: "main", cwd, spawn });

    expect(stderrSpy).toHaveBeenCalled();
    const callArg = stderrSpy.mock.calls[0]?.[0] as string;
    expect(callArg).toContain("Warning");

    stderrSpy.mockRestore();
  });

  it("does not throw a runtime error when warnFn is not provided", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "error",
    });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await expect(restoreBranch({ originalBranch: "main", cwd, spawn })).resolves.toBeUndefined();
    stderrSpy.mockRestore();
  });
});
