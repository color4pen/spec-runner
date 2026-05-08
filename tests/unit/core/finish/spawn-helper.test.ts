/**
 * Unit tests for spawn-helper.ts
 *
 * TC-01: spawnOrEscalate — 成功時
 * TC-02: spawnOrEscalate — exitCode 非ゼロ時に escalation を生成する
 * TC-03: spawnOrEscalate — recommendedAction カスタム値の優先
 * TC-04: spawnOrEscalate — recommendedAction 未指定時のデフォルト文字列
 * TC-34: spawnOrEscalate — args が空配列の場合の detectedState
 */
import { describe, it, expect, vi } from "vitest";
import { spawnOrEscalate } from "../../../../src/core/finish/spawn-helper.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

const cwd = "/tmp";
const failedStep = "Phase 1 (git fetch)";
const resumeCommand = "specrunner finish my-slug";

/**
 * TC-01: spawn が exitCode 0 で返る → { ok: true, stdout, stderr }
 */
describe("TC-01: spawnOrEscalate — success case", () => {
  it("returns { ok: true, stdout, stderr } when spawn exits 0", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "fetched",
      stderr: "",
    });

    const result = await spawnOrEscalate({
      spawn,
      cmd: "git",
      args: ["fetch", "origin", "feat"],
      cwd,
      failedStep,
      resumeCommand,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stdout).toBe("fetched");
      expect(result.stderr).toBe("");
    }
  });
});

/**
 * TC-02: spawn が exitCode 非ゼロ → escalation に detectedState, resumeCommand, stderr が含まれる
 */
describe("TC-02: spawnOrEscalate — non-zero exit generates escalation", () => {
  it("includes detectedState, resumeCommand and stderr in escalation", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "fatal: branch not found",
    });

    const result = await spawnOrEscalate({
      spawn,
      cmd: "git",
      args: ["fetch", "origin", "feat"],
      cwd,
      failedStep: "Phase 1 (git fetch)",
      resumeCommand: "specrunner finish my-slug",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.escalation).toContain("git fetch origin feat failed (exit 1)");
      expect(result.escalation).toContain("specrunner finish my-slug");
      expect(result.escalation).toContain("fatal: branch not found");
    }
  });
});

/**
 * TC-03: recommendedAction カスタム値の優先
 */
describe("TC-03: spawnOrEscalate — custom recommendedAction takes priority", () => {
  it("uses custom recommendedAction and omits default Check error string", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "some error",
    });

    const result = await spawnOrEscalate({
      spawn,
      cmd: "git",
      args: ["fetch", "origin", "feat"],
      cwd,
      failedStep,
      resumeCommand,
      recommendedAction: "Fix spec errors first",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.escalation).toContain("Fix spec errors first");
      expect(result.escalation).not.toContain("Check error:");
    }
  });
});

/**
 * TC-04: recommendedAction 未指定時のデフォルト文字列
 */
describe("TC-04: spawnOrEscalate — default recommendedAction includes trimmed stderr and resumeCommand", () => {
  it("uses trimmed stderr and resumeCommand in default recommendedAction", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 2,
      stdout: "",
      stderr: "  permission denied  ",
    });

    const result = await spawnOrEscalate({
      spawn,
      cmd: "git",
      args: ["fetch", "origin", "feat"],
      cwd,
      failedStep,
      resumeCommand,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.escalation).toContain("Check error: permission denied.");
      expect(result.escalation).toContain(`Then re-run: ${resumeCommand}`);
    }
  });
});

/**
 * TC-34: args が空配列の場合の detectedState
 */
describe("TC-34: spawnOrEscalate — empty args array in detectedState", () => {
  it("formats detectedState correctly when args is empty", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "error",
    });

    const result = await spawnOrEscalate({
      spawn,
      cmd: "git",
      args: [],
      cwd,
      failedStep,
      resumeCommand,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Should be "git failed (exit 1)" not "git  failed (exit 1)"
      expect(result.escalation).toContain("git failed (exit 1)");
      expect(result.escalation).not.toContain("git  failed");
    }
  });
});
