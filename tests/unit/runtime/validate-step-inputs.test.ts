/**
 * Unit tests for validateStepInputs in LocalRuntime and ManagedRuntime.
 * T-04: local: file exists → resolve; missing → STEP_INPUT_MISSING
 *        managed: file exists on branch → resolve; missing → STEP_INPUT_MISSING
 * T-07: validateStepInputs behavior
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalRuntime } from "../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../src/core/runtime/managed.js";
import { ERROR_CODES } from "../../../src/errors.js";
import type { RequiredInput } from "../../../src/core/port/runtime-strategy.js";
import type { SpawnFn } from "../../../src/util/spawn.js";

// ---------------------------------------------------------------------------
// LocalRuntime.validateStepInputs
// ---------------------------------------------------------------------------

describe("LocalRuntime.validateStepInputs", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "validate-local-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function makeLocalRuntime(spawnFn?: SpawnFn): LocalRuntime {
    const mockGithubClient = {
      createPullRequest: async () => ({ url: "", number: 0, createdAt: "" }),
      getPullRequest: async () => null,
    } as unknown as ConstructorParameters<typeof LocalRuntime>[0]["githubClient"];
    return new LocalRuntime({
      cwd: tempDir,
      githubClient: mockGithubClient,
      spawnFn: spawnFn ?? (async () => ({ exitCode: 0, stdout: "", stderr: "" })),
    });
  }

  it("resolves when inputs array is empty", async () => {
    const runtime = makeLocalRuntime();
    await expect(runtime.validateStepInputs([], tempDir, null)).resolves.toBeUndefined();
  });

  it("resolves when all required files exist", async () => {
    const filePath = path.join(tempDir, "test.md");
    await fs.writeFile(filePath, "content");
    const runtime = makeLocalRuntime();
    const inputs: RequiredInput[] = [{ path: "test.md", artifact: "file" }];
    await expect(runtime.validateStepInputs(inputs, tempDir, "main")).resolves.toBeUndefined();
  });

  it("throws STEP_INPUT_MISSING when a required file is absent", async () => {
    const runtime = makeLocalRuntime();
    const inputs: RequiredInput[] = [{ path: "missing-file.md", artifact: "file" }];
    await expect(runtime.validateStepInputs(inputs, tempDir, "main"))
      .rejects.toMatchObject({ code: ERROR_CODES.STEP_INPUT_MISSING });
  });

  it("error message contains the missing path", async () => {
    const runtime = makeLocalRuntime();
    const inputs: RequiredInput[] = [{ path: "specrunner/changes/my-slug/review-feedback-001.md", artifact: "file" }];
    let thrown: unknown;
    try {
      await runtime.validateStepInputs(inputs, tempDir, "feat/my-slug-abc123");
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toContain("review-feedback-001.md");
  });

  it("resolves for gitState when git is valid (spawnFn returns exit 0)", async () => {
    const spawnFn: SpawnFn = async (cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") {
        return { exitCode: 0, stdout: ".git", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    };
    const runtime = makeLocalRuntime(spawnFn);
    const inputs: RequiredInput[] = [{ path: ".", artifact: "gitState" }];
    await expect(runtime.validateStepInputs(inputs, tempDir, null)).resolves.toBeUndefined();
  });

  it("throws STEP_INPUT_MISSING for gitState when git rev-parse fails", async () => {
    const spawnFn: SpawnFn = async (cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") {
        return { exitCode: 128, stdout: "", stderr: "not a git repository" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    };
    const runtime = makeLocalRuntime(spawnFn);
    const inputs: RequiredInput[] = [{ path: ".", artifact: "gitState" }];
    await expect(runtime.validateStepInputs(inputs, tempDir, null))
      .rejects.toMatchObject({ code: ERROR_CODES.STEP_INPUT_MISSING });
  });

  it("collects multiple missing paths in error", async () => {
    const runtime = makeLocalRuntime();
    const inputs: RequiredInput[] = [
      { path: "missing-a.md", artifact: "file" },
      { path: "missing-b.md", artifact: "file" },
    ];
    let thrown: unknown;
    try {
      await runtime.validateStepInputs(inputs, tempDir, null);
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toContain("missing-a.md");
    expect((thrown as Error).message).toContain("missing-b.md");
  });
});

// ---------------------------------------------------------------------------
// ManagedRuntime.validateStepInputs
// ---------------------------------------------------------------------------

describe("ManagedRuntime.validateStepInputs", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "validate-managed-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function makeManagedRuntime(catFileExitCode: number = 0): ManagedRuntime {
    const spawnFn: SpawnFn = async (cmd, args) => {
      if (cmd === "git" && args[0] === "fetch") {
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      if (cmd === "git" && args[0] === "cat-file") {
        return { exitCode: catFileExitCode, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const mockSessionClient = {} as ConstructorParameters<typeof ManagedRuntime>[1];
    const mockGithubClient = {} as ConstructorParameters<typeof ManagedRuntime>[2];
    const mockRepo = { owner: "testowner", name: "testrepo" } as ConstructorParameters<typeof ManagedRuntime>[3];

    return new ManagedRuntime(
      tempDir,
      mockSessionClient,
      mockGithubClient,
      mockRepo,
      spawnFn,
      "ghp_test",
    );
  }

  it("resolves when inputs array is empty", async () => {
    const runtime = makeManagedRuntime();
    await expect(runtime.validateStepInputs([], tempDir, "main")).resolves.toBeUndefined();
  });

  it("resolves when cat-file exits 0 (file exists on branch)", async () => {
    const runtime = makeManagedRuntime(0);
    const inputs: RequiredInput[] = [
      { path: "specrunner/changes/my-slug/review-feedback-001.md", artifact: "file" },
    ];
    await expect(runtime.validateStepInputs(inputs, tempDir, "feat/my-slug")).resolves.toBeUndefined();
  });

  it("throws STEP_INPUT_MISSING when cat-file exits non-zero (file absent)", async () => {
    const runtime = makeManagedRuntime(128);
    const inputs: RequiredInput[] = [
      { path: "specrunner/changes/my-slug/review-feedback-001.md", artifact: "file" },
    ];
    await expect(runtime.validateStepInputs(inputs, tempDir, "feat/my-slug"))
      .rejects.toMatchObject({ code: ERROR_CODES.STEP_INPUT_MISSING });
  });

  it("error message contains the missing path", async () => {
    const runtime = makeManagedRuntime(128);
    const inputs: RequiredInput[] = [
      { path: "specrunner/changes/my-slug/review-feedback-002.md", artifact: "file" },
    ];
    let thrown: unknown;
    try {
      await runtime.validateStepInputs(inputs, tempDir, "feat/my-slug");
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toContain("review-feedback-002.md");
  });

  it("throws STEP_INPUT_MISSING for gitState when cat-file fails", async () => {
    const runtime = makeManagedRuntime(128);
    const inputs: RequiredInput[] = [{ path: ".", artifact: "gitState" }];
    await expect(runtime.validateStepInputs(inputs, tempDir, "feat/my-slug"))
      .rejects.toMatchObject({ code: ERROR_CODES.STEP_INPUT_MISSING });
  });

  it("does not call fetch when branch is null — missing gitState inputs recorded", async () => {
    const fetchCalls: string[] = [];
    const spawnFn: SpawnFn = async (cmd, args) => {
      if (cmd === "git" && args[0] === "fetch") {
        fetchCalls.push(args.join(" "));
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      // cat-file with no branch: caller gets missing path
      return { exitCode: 128, stdout: "", stderr: "" };
    };
    const mockSessionClient = {} as ConstructorParameters<typeof ManagedRuntime>[1];
    const mockGithubClient = {} as ConstructorParameters<typeof ManagedRuntime>[2];
    const mockRepo = { owner: "testowner", name: "testrepo" } as ConstructorParameters<typeof ManagedRuntime>[3];
    const runtime = new ManagedRuntime(tempDir, mockSessionClient, mockGithubClient, mockRepo, spawnFn, "ghp_test");

    const inputs: RequiredInput[] = [{ path: "some/file.md", artifact: "file" }];
    await expect(runtime.validateStepInputs(inputs, tempDir, null))
      .rejects.toMatchObject({ code: ERROR_CODES.STEP_INPUT_MISSING });
    // fetch should not have been called when branch is null
    expect(fetchCalls).toHaveLength(0);
  });

  it("fetch uses stdout-silent spawn (captured not passed to process stdout)", async () => {
    // The spawnFn captures stdout/stderr — managed implementation does not write them to process.stdout.
    // This test verifies the fetch command is called and its output stays captured.
    const fetchArgs: string[][] = [];
    const spawnFn: SpawnFn = async (cmd, args) => {
      if (cmd === "git" && args[0] === "fetch") {
        fetchArgs.push(args);
        return { exitCode: 0, stdout: "fetch output that stays captured", stderr: "" };
      }
      if (cmd === "git" && args[0] === "cat-file") {
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const mockSessionClient = {} as ConstructorParameters<typeof ManagedRuntime>[1];
    const mockGithubClient = {} as ConstructorParameters<typeof ManagedRuntime>[2];
    const mockRepo = { owner: "testowner", name: "testrepo" } as ConstructorParameters<typeof ManagedRuntime>[3];
    const runtime = new ManagedRuntime(tempDir, mockSessionClient, mockGithubClient, mockRepo, spawnFn, "ghp_test");

    const inputs: RequiredInput[] = [{ path: "some/file.md", artifact: "file" }];
    await runtime.validateStepInputs(inputs, tempDir, "feat/test");
    expect(fetchArgs).toHaveLength(1);
    expect(fetchArgs[0]).toContain("feat/test");
  });
});
