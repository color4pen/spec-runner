/**
 * Tests for finish command: archive PR creation and auto-merge.
 *
 * TC-035: push → gh pr create → gh pr merge --auto
 * TC-036: auto-merge fails with unavailable → fallback immediate merge
 * TC-038: push failure → escalation
 * TC-055: both auto-merge and fallback fail → escalation
 * TC-064: title, base, head args correct
 */
import { describe, it, expect, vi } from "vitest";
import { createArchivePr } from "../src/core/finish/archive-pr.js";
import type { SpawnFn } from "../src/util/spawn.js";

const BASE = {
  slug: "my-feature",
  jobId: "test-job-id",
  cwd: "/repo",
};

// TC-035
describe("TC-035: archive PR creation — full happy path", () => {
  it("calls gh pr list (idempotency check), git fetch, git checkout, git push, gh pr create, gh pr merge --auto", async () => {
    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, args]);

      // Idempotency check: gh pr list --state merged → empty
      if (cmd === "gh" && args[0] === "pr" && args[1] === "list" && args.includes("merged")) {
        return Promise.resolve({ exitCode: 0, stdout: "[]", stderr: "" });
      }
      // git fetch
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      // git checkout
      if (cmd === "git" && args[0] === "checkout") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      // git push
      if (cmd === "git" && args[0] === "push") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      // gh pr create → returns PR URL
      if (cmd === "gh" && args[0] === "pr" && args[1] === "create") {
        return Promise.resolve({
          exitCode: 0,
          stdout: "https://github.com/user/repo/pull/99\n",
          stderr: "",
        });
      }
      // gh pr merge --auto
      if (cmd === "gh" && args[0] === "pr" && args[1] === "merge" && args.includes("--auto")) {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await createArchivePr({ ...BASE, spawn });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(false);
    expect(result.archivePrUrl).toBe("https://github.com/user/repo/pull/99");

    // Verify push was called
    const pushCall = calls.find(([cmd, args]) => cmd === "git" && args[0] === "push");
    expect(pushCall).toBeDefined();
    expect(pushCall![1]).toContain("chore/archive-my-feature");

    // Verify gh pr create had correct args
    const prCreateCall = calls.find(([cmd, args]) => cmd === "gh" && args[1] === "create");
    expect(prCreateCall).toBeDefined();
    const prArgs = prCreateCall![1];
    expect(prArgs).toContain("--title");
    expect(prArgs[prArgs.indexOf("--title") + 1]).toBe("chore: archive my-feature");
    expect(prArgs).toContain("--base");
    expect(prArgs[prArgs.indexOf("--base") + 1]).toBe("main");
    expect(prArgs).toContain("--head");
    expect(prArgs[prArgs.indexOf("--head") + 1]).toBe("chore/archive-my-feature");
  });
});

// TC-036
describe("TC-036: auto-merge unavailable → fallback immediate merge", () => {
  it("falls back to immediate merge when auto-merge returns 'auto-merge' in error", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "gh" && args[1] === "list" && args.includes("merged")) {
        return Promise.resolve({ exitCode: 0, stdout: "[]", stderr: "" });
      }
      if (cmd === "git" && args[0] === "fetch") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      if (cmd === "git" && args[0] === "checkout") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      if (cmd === "git" && args[0] === "push") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      if (cmd === "gh" && args[1] === "create") {
        return Promise.resolve({ exitCode: 0, stdout: "https://github.com/user/repo/pull/99\n", stderr: "" });
      }
      // auto-merge fails with unavailable error
      if (cmd === "gh" && args[1] === "merge" && args.includes("--auto")) {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "This repository does not allow auto-merge" });
      }
      // fallback merge succeeds
      if (cmd === "gh" && args[1] === "merge" && !args.includes("--auto")) {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await createArchivePr({ ...BASE, spawn });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toContain("immediately");
  });
});

// TC-038
describe("TC-038: git push failure → escalation", () => {
  it("returns escalation when git push fails", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "gh" && args[1] === "list") {
        return Promise.resolve({ exitCode: 0, stdout: "[]", stderr: "" });
      }
      if (cmd === "git" && args[0] === "fetch") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      if (cmd === "git" && args[0] === "checkout") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      // push fails
      if (cmd === "git" && args[0] === "push") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "remote: Permission denied" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await createArchivePr({ ...BASE, spawn });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    expect(result.escalation).toContain("archive-pr-creation");
    expect(result.escalation).toContain("push");
  });
});

// TC-055
describe("TC-055: auto-merge and fallback both fail → escalation", () => {
  it("returns escalation when both auto and fallback merge fail", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "gh" && args[1] === "list") {
        return Promise.resolve({ exitCode: 0, stdout: "[]", stderr: "" });
      }
      if (cmd === "git" && args[0] === "fetch") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      if (cmd === "git" && args[0] === "checkout") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      if (cmd === "git" && args[0] === "push") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      if (cmd === "gh" && args[1] === "create") {
        return Promise.resolve({ exitCode: 0, stdout: "https://github.com/user/repo/pull/99\n", stderr: "" });
      }
      // auto-merge fails with unavailable
      if (cmd === "gh" && args[1] === "merge" && args.includes("--auto")) {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "auto-merge not supported" });
      }
      // fallback merge also fails
      if (cmd === "gh" && args[1] === "merge" && !args.includes("--auto")) {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "branch protection requires review" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await createArchivePr({ ...BASE, spawn });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    expect(result.escalation).toContain("archive-pr-creation");
    // Should mention manual merge
    expect(result.escalation.toLowerCase()).toContain("manually");
  });
});

// TC-064
describe("TC-064: archive PR title and base branch are correct", () => {
  it("uses chore: archive <slug> as title and main as base", async () => {
    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, args]);
      if (cmd === "gh" && args[1] === "list") {
        return Promise.resolve({ exitCode: 0, stdout: "[]", stderr: "" });
      }
      if (cmd === "git") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      if (cmd === "gh" && args[1] === "create") {
        return Promise.resolve({ exitCode: 0, stdout: "https://github.com/u/r/pull/1\n", stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    await createArchivePr({ ...BASE, spawn });

    const createCall = calls.find(([cmd, args]) => cmd === "gh" && args[1] === "create");
    expect(createCall).toBeDefined();
    const args = createCall![1];
    const titleIdx = args.indexOf("--title");
    expect(args[titleIdx + 1]).toBe("chore: archive my-feature");
    const baseIdx = args.indexOf("--base");
    expect(args[baseIdx + 1]).toBe("main");
  });
});
