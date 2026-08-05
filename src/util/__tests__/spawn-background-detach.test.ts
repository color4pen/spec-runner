/**
 * Tests for spawnBackground detach extensions in src/util/spawn.ts.
 *
 * TC-008: 新オプション未指定で spawnBackground の既存挙動が保たれる
 * TC-009: detach 経路の子 env に credential とマーカーが含まれる
 * TC-021: detach log ファイルは 0o600 モードで作成される
 * TC-022: log redirect fd は追記モード（'a'）で開かれる
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as childProcess from "node:child_process";
import * as nodeFs from "node:fs";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    openSync: vi.fn().mockReturnValue(99),
    closeSync: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { spawnBackground } from "../spawn.js";

// The marker env var name — must match the DETACH_MARKER_ENV constant in detach.ts
// This local constant documents the expected contract without creating a cross-dependency.
const EXPECTED_DETACH_MARKER_ENV = "SPECRUNNER_DETACHED";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeProc(pid = 1234) {
  return {
    pid,
    unref: vi.fn(),
    kill: vi.fn(),
    on: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const fakeProc = makeFakeProc();
  vi.mocked(childProcess.spawn).mockReturnValue(fakeProc as never);
  vi.mocked(nodeFs.openSync).mockReturnValue(99);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TC-008: 新オプション未指定で既存挙動が保たれる
// ---------------------------------------------------------------------------

describe("TC-008: spawnBackground — 新オプション未指定で既存挙動が保たれる", () => {
  it("TC-008: detached is NOT passed to spawn when detached option is not set", () => {
    spawnBackground("cmd", ["arg"], { cwd: "/repo" });

    const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0]!;
    const spawnOpts = spawnCall[2] as Record<string, unknown>;
    // detached must NOT be true
    expect(spawnOpts["detached"]).toBeFalsy();
  });

  it("TC-008: stdio is 'ignore' when logFilePath is not specified", () => {
    spawnBackground("cmd", ["arg"], { cwd: "/repo" });

    const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0]!;
    const spawnOpts = spawnCall[2] as Record<string, unknown>;
    expect(spawnOpts["stdio"]).toBe("ignore");
  });

  it("TC-008: env uses stripSecrets — GITHUB_TOKEN is stripped", () => {
    const savedGhToken = process.env["GITHUB_TOKEN"];
    const savedApiKey = process.env["ANTHROPIC_API_KEY"];
    process.env["GITHUB_TOKEN"] = "gh-secret";
    process.env["ANTHROPIC_API_KEY"] = "anthropic-secret";

    try {
      spawnBackground("cmd", ["arg"], { cwd: "/repo" });

      const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0]!;
      const spawnOpts = spawnCall[2] as Record<string, unknown>;
      const usedEnv = spawnOpts["env"] as Record<string, string | undefined>;

      expect(usedEnv["GITHUB_TOKEN"]).toBeUndefined();
      expect(usedEnv["ANTHROPIC_API_KEY"]).toBeUndefined();
    } finally {
      if (savedGhToken === undefined) {
        delete process.env["GITHUB_TOKEN"];
      } else {
        process.env["GITHUB_TOKEN"] = savedGhToken;
      }
      if (savedApiKey === undefined) {
        delete process.env["ANTHROPIC_API_KEY"];
      } else {
        process.env["ANTHROPIC_API_KEY"] = savedApiKey;
      }
    }
  });

  it("TC-008: proc.unref() is called regardless of options", () => {
    const fakeProc = makeFakeProc();
    vi.mocked(childProcess.spawn).mockReturnValue(fakeProc as never);

    spawnBackground("cmd", ["arg"], { cwd: "/repo" });
    expect(fakeProc.unref).toHaveBeenCalledTimes(1);
  });

  it("TC-008: openSync is NOT called when logFilePath is not specified", () => {
    spawnBackground("cmd", ["arg"], { cwd: "/repo" });
    expect(vi.mocked(nodeFs.openSync)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-009: detach 経路の子 env に credential とマーカーが含まれる
// ---------------------------------------------------------------------------

describe("TC-009: spawnBackground — detach 経路で credential とマーカーが env に含まれる", () => {
  it("TC-009: rawEnv passthrough includes credential keys when rawEnv is provided", () => {
    const rawEnv: Record<string, string> = {
      GITHUB_TOKEN: "gh-real-token",
      ANTHROPIC_API_KEY: "anthropic-real-key",
      [EXPECTED_DETACH_MARKER_ENV]: "1",
      PATH: "/usr/bin",
    };

    spawnBackground("cmd", ["arg"], {
      cwd: "/repo",
      rawEnv,
    });

    const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0]!;
    const spawnOpts = spawnCall[2] as Record<string, unknown>;
    const usedEnv = spawnOpts["env"] as Record<string, string | undefined>;

    // Credential keys must be preserved (full env passthrough)
    expect(usedEnv["GITHUB_TOKEN"]).toBe("gh-real-token");
    expect(usedEnv["ANTHROPIC_API_KEY"]).toBe("anthropic-real-key");
    // Marker must be present
    expect(usedEnv[EXPECTED_DETACH_MARKER_ENV]).toBe("1");
  });

  it("TC-009: detached: true is passed to spawn when detached option is set", () => {
    spawnBackground("cmd", ["arg"], {
      cwd: "/repo",
      detached: true,
      rawEnv: { PATH: "/usr/bin" },
    });

    const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0]!;
    const spawnOpts = spawnCall[2] as Record<string, unknown>;
    expect(spawnOpts["detached"]).toBe(true);
  });

  it("TC-009: rawEnv is used verbatim (not merged with stripSecrets(process.env))", () => {
    // When rawEnv is provided, it must replace the normal env (not be overlaid on stripped env)
    const rawEnv: Record<string, string> = {
      CUSTOM_SECRET: "my-secret",
      PATH: "/usr/bin",
    };

    spawnBackground("cmd", ["arg"], {
      cwd: "/repo",
      rawEnv,
    });

    const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0]!;
    const spawnOpts = spawnCall[2] as Record<string, unknown>;
    const usedEnv = spawnOpts["env"] as Record<string, string | undefined>;

    // Must have the custom secret from rawEnv
    expect(usedEnv["CUSTOM_SECRET"]).toBe("my-secret");
  });
});

// ---------------------------------------------------------------------------
// TC-021: detach log ファイルは 0o600 モードで作成される
// ---------------------------------------------------------------------------

describe("TC-021: detach log ファイルは 0o600 モードで作成される", () => {
  it("TC-021: openSync is called with mode 0o600 when logFilePath is specified", () => {
    const logPath = "/repo/.specrunner/logs/foo.detach.log";

    spawnBackground("cmd", ["arg"], {
      cwd: "/repo",
      detached: true,
      logFilePath: logPath,
      rawEnv: { PATH: "/usr/bin" },
    });

    const openCalls = vi.mocked(nodeFs.openSync).mock.calls;
    const logOpenCall = openCalls.find((call) => call[0] === logPath);
    expect(logOpenCall).toBeDefined();
    // Mode must be 0o600 (owner read+write only)
    expect(logOpenCall![2]).toBe(0o600);
  });
});

// ---------------------------------------------------------------------------
// TC-022: log redirect fd は追記モード（'a'）で開かれる
// ---------------------------------------------------------------------------

describe("TC-022: log redirect fd は追記モード（'a'）で開かれる", () => {
  it("TC-022: openSync is called with flag 'a' when logFilePath is specified", () => {
    const logPath = "/repo/.specrunner/logs/foo.detach.log";

    spawnBackground("cmd", ["arg"], {
      cwd: "/repo",
      detached: true,
      logFilePath: logPath,
      rawEnv: { PATH: "/usr/bin" },
    });

    const openCalls = vi.mocked(nodeFs.openSync).mock.calls;
    const logOpenCall = openCalls.find((call) => call[0] === logPath);
    expect(logOpenCall).toBeDefined();
    // Flag must be 'a' (append mode)
    expect(logOpenCall![1]).toBe("a");
  });

  it("TC-022: stdio uses the opened fd as both stdout and stderr when logFilePath is specified", () => {
    const fakeFd = 77;
    vi.mocked(nodeFs.openSync).mockReturnValue(fakeFd);

    spawnBackground("cmd", ["arg"], {
      cwd: "/repo",
      detached: true,
      logFilePath: "/repo/.specrunner/logs/foo.detach.log",
      rawEnv: { PATH: "/usr/bin" },
    });

    const spawnCall = vi.mocked(childProcess.spawn).mock.calls[0]!;
    const spawnOpts = spawnCall[2] as Record<string, unknown>;
    // stdio should be ["ignore", fd, fd] where fd is the opened log fd
    const stdio = spawnOpts["stdio"] as unknown[];
    expect(stdio).toEqual(["ignore", fakeFd, fakeFd]);
  });
});
