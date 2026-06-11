/**
 * Unit tests for validateStepOutputs in LocalRuntime and ManagedRuntime.
 *
 * TC-OVR-001: LocalRuntime — empty contracts → no violations
 * TC-OVR-002: LocalRuntime — produced: file missing → violation
 * TC-OVR-003: LocalRuntime — produced: file empty → violation
 * TC-OVR-004: LocalRuntime — produced: scaffold match → violation
 * TC-OVR-005: LocalRuntime — produced: content present, non-scaffold → no violation
 * TC-OVR-006: LocalRuntime — tasks-complete: file missing → violation
 * TC-OVR-007: LocalRuntime — tasks-complete: all checked → no violation
 * TC-OVR-008: LocalRuntime — tasks-complete: unchecked items → violation with labels
 * TC-OVR-009: ManagedRuntime — branch null → all violations
 * TC-OVR-010: ManagedRuntime — produced: getRawFile null → violation
 * TC-OVR-011: ManagedRuntime — produced: empty content → violation
 * TC-OVR-012: ManagedRuntime — produced: scaffold match → violation
 * TC-OVR-013: ManagedRuntime — produced: content present → no violation
 * TC-OVR-014: ManagedRuntime — tasks-complete: getRawFile null → violation
 * TC-OVR-015: ManagedRuntime — tasks-complete: unchecked → violation with labels
 * TC-OVR-016: ManagedRuntime — tasks-complete: all checked → no violation
 * TC-OVR-017: ManagedRuntime — fetch called with branch (stdout-clean)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalRuntime } from "../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../src/core/runtime/managed.js";
import type { OutputContract } from "../../../src/core/port/output-contract.js";
import type { SpawnFn } from "../../../src/util/spawn.js";

// ---------------------------------------------------------------------------
// LocalRuntime.validateStepOutputs
// ---------------------------------------------------------------------------

describe("LocalRuntime.validateStepOutputs", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "validate-outputs-local-test-"));
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeLocalRuntime(): LocalRuntime {
    const mockGithubClient = {
      createPullRequest: async () => ({ url: "", number: 0, createdAt: "" }),
      getPullRequest: async () => null,
    } as unknown as ConstructorParameters<typeof LocalRuntime>[0]["githubClient"];
    return new LocalRuntime({
      cwd: tempDir,
      githubClient: mockGithubClient,
      spawnFn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });
  }

  it("TC-OVR-001: empty contracts → no violations", async () => {
    const runtime = makeLocalRuntime();
    const result = await runtime.validateStepOutputs([], tempDir, null);
    expect(result.violations).toEqual([]);
  });

  it("TC-OVR-002: produced — file missing → violation", async () => {
    const runtime = makeLocalRuntime();
    const contracts: OutputContract[] = [
      { kind: "produced", path: "specrunner/changes/slug/spec.md", policy: "halt" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("produced");
    expect(result.violations[0]?.path).toBe("specrunner/changes/slug/spec.md");
    expect(result.violations[0]?.policy).toBe("halt");
  });

  it("TC-OVR-003: produced — file empty (whitespace only) → violation", async () => {
    const runtime = makeLocalRuntime();
    const filePath = path.join(tempDir, "spec.md");
    await fs.writeFile(filePath, "   \n  ");
    const contracts: OutputContract[] = [
      { kind: "produced", path: "spec.md", policy: "halt" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("produced");
  });

  it("TC-OVR-004: produced — content matches scaffold exactly → violation", async () => {
    const runtime = makeLocalRuntime();
    const scaffold = "# Spec\n\n<!-- fill in here -->\n";
    const filePath = path.join(tempDir, "spec.md");
    await fs.writeFile(filePath, scaffold);
    const contracts: OutputContract[] = [
      { kind: "produced", path: "spec.md", policy: "halt", scaffold },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("produced");
  });

  it("TC-OVR-005: produced — content present, not matching scaffold → no violation", async () => {
    const runtime = makeLocalRuntime();
    const scaffold = "# Spec\n\n<!-- fill in here -->\n";
    const filePath = path.join(tempDir, "spec.md");
    await fs.writeFile(filePath, "# Spec\n\n## Overview\n\nThis is the real content.\n");
    const contracts: OutputContract[] = [
      { kind: "produced", path: "spec.md", policy: "halt", scaffold },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(0);
  });

  it("TC-OVR-006: tasks-complete — file missing → violation (no labels)", async () => {
    const runtime = makeLocalRuntime();
    const contracts: OutputContract[] = [
      { kind: "tasks-complete", path: "specrunner/changes/slug/tasks.md", policy: "follow-up" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("tasks-complete");
    expect(result.violations[0]?.policy).toBe("follow-up");
    expect(result.violations[0]?.detail).toEqual([]);
  });

  it("TC-OVR-007: tasks-complete — all tasks checked → no violation", async () => {
    const runtime = makeLocalRuntime();
    const tasksDir = path.join(tempDir, "specrunner", "changes", "slug");
    await fs.mkdir(tasksDir, { recursive: true });
    await fs.writeFile(path.join(tasksDir, "tasks.md"), "- [x] Task 1\n- [X] Task 2\n");
    const contracts: OutputContract[] = [
      { kind: "tasks-complete", path: "specrunner/changes/slug/tasks.md", policy: "follow-up" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(0);
  });

  it("TC-OVR-008: tasks-complete — unchecked items → violation with labels", async () => {
    const runtime = makeLocalRuntime();
    const tasksDir = path.join(tempDir, "specrunner", "changes", "slug");
    await fs.mkdir(tasksDir, { recursive: true });
    await fs.writeFile(
      path.join(tasksDir, "tasks.md"),
      "- [x] Done task\n- [ ] Write tests\n- [ ] Update docs\n",
    );
    const contracts: OutputContract[] = [
      { kind: "tasks-complete", path: "specrunner/changes/slug/tasks.md", policy: "follow-up" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("tasks-complete");
    expect(result.violations[0]?.detail).toEqual(["Write tests", "Update docs"]);
  });

  it("multiple contracts: produced violation + tasks-complete pass", async () => {
    const runtime = makeLocalRuntime();
    const tasksDir = path.join(tempDir, "specrunner", "changes", "slug");
    await fs.mkdir(tasksDir, { recursive: true });
    await fs.writeFile(path.join(tasksDir, "tasks.md"), "- [x] All done\n");
    const contracts: OutputContract[] = [
      { kind: "produced", path: "specrunner/changes/slug/design.md", policy: "halt" },
      { kind: "tasks-complete", path: "specrunner/changes/slug/tasks.md", policy: "follow-up" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("produced");
  });
});

// ---------------------------------------------------------------------------
// ManagedRuntime.validateStepOutputs
// ---------------------------------------------------------------------------

describe("ManagedRuntime.validateStepOutputs", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "validate-outputs-managed-test-"));
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeManagedRuntime(getRawFileFn: (owner: string, repo: string, ref: string, path: string) => Promise<string | null>): ManagedRuntime {
    const fetchArgs: string[][] = [];
    const spawnFn: SpawnFn = async (cmd, args) => {
      if (cmd === "git" && args[0] === "fetch") {
        fetchArgs.push(args);
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const mockSessionClient = {} as ConstructorParameters<typeof ManagedRuntime>[1];
    const mockGithubClient = {
      getRawFile: getRawFileFn,
    } as unknown as ConstructorParameters<typeof ManagedRuntime>[2];
    const mockRepo = { owner: "testowner", name: "testrepo" } as ConstructorParameters<typeof ManagedRuntime>[3];
    return new ManagedRuntime(tempDir, mockSessionClient, mockGithubClient, mockRepo, spawnFn, "ghp_test");
  }

  it("empty contracts → no violations", async () => {
    const runtime = makeManagedRuntime(async () => null);
    const result = await runtime.validateStepOutputs([], tempDir, "feat/my-slug");
    expect(result.violations).toEqual([]);
  });

  it("TC-OVR-009: branch null → all contracts treated as violations", async () => {
    const getRawFile = vi.fn<(owner: string, repo: string, ref: string, p: string) => Promise<string | null>>().mockResolvedValue("content");
    const runtime = makeManagedRuntime(getRawFile);
    const contracts: OutputContract[] = [
      { kind: "produced", path: "specrunner/changes/slug/spec.md", policy: "halt" },
      { kind: "tasks-complete", path: "specrunner/changes/slug/tasks.md", policy: "follow-up" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(2);
    // getRawFile should not be called when branch is null
    expect(getRawFile).not.toHaveBeenCalled();
  });

  it("TC-OVR-010: produced — getRawFile null → violation", async () => {
    const runtime = makeManagedRuntime(async () => null);
    const contracts: OutputContract[] = [
      { kind: "produced", path: "specrunner/changes/slug/spec.md", policy: "halt" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/slug");
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("produced");
  });

  it("TC-OVR-011: produced — empty string content → violation", async () => {
    const runtime = makeManagedRuntime(async () => "   \n  ");
    const contracts: OutputContract[] = [
      { kind: "produced", path: "specrunner/changes/slug/spec.md", policy: "halt" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/slug");
    expect(result.violations).toHaveLength(1);
  });

  it("TC-OVR-012: produced — content matches scaffold exactly → violation", async () => {
    const scaffold = "# Spec\n\n<!-- fill in here -->\n";
    const runtime = makeManagedRuntime(async () => scaffold);
    const contracts: OutputContract[] = [
      { kind: "produced", path: "specrunner/changes/slug/spec.md", policy: "halt", scaffold },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/slug");
    expect(result.violations).toHaveLength(1);
  });

  it("TC-OVR-013: produced — content present, non-scaffold → no violation", async () => {
    const scaffold = "# Spec\n\n<!-- fill in here -->\n";
    const runtime = makeManagedRuntime(async () => "# Spec\n\nReal content here.\n");
    const contracts: OutputContract[] = [
      { kind: "produced", path: "specrunner/changes/slug/spec.md", policy: "halt", scaffold },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/slug");
    expect(result.violations).toHaveLength(0);
  });

  it("TC-OVR-014: tasks-complete — getRawFile null → violation (no labels)", async () => {
    const runtime = makeManagedRuntime(async () => null);
    const contracts: OutputContract[] = [
      { kind: "tasks-complete", path: "specrunner/changes/slug/tasks.md", policy: "follow-up" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/slug");
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("tasks-complete");
    expect(result.violations[0]?.detail).toEqual([]);
  });

  it("TC-OVR-015: tasks-complete — unchecked items → violation with labels", async () => {
    const tasksContent = "- [x] Done\n- [ ] Write tests\n- [ ] Update docs\n";
    const runtime = makeManagedRuntime(async () => tasksContent);
    const contracts: OutputContract[] = [
      { kind: "tasks-complete", path: "specrunner/changes/slug/tasks.md", policy: "follow-up" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/slug");
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.detail).toEqual(["Write tests", "Update docs"]);
  });

  it("TC-OVR-016: tasks-complete — all tasks checked → no violation", async () => {
    const runtime = makeManagedRuntime(async () => "- [x] Task 1\n- [X] Task 2\n");
    const contracts: OutputContract[] = [
      { kind: "tasks-complete", path: "specrunner/changes/slug/tasks.md", policy: "follow-up" },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/slug");
    expect(result.violations).toHaveLength(0);
  });

  it("TC-OVR-017: fetch is called with branch (stdout-clean)", async () => {
    const fetchArgs: string[][] = [];
    const spawnFn: SpawnFn = async (cmd, args) => {
      if (cmd === "git" && args[0] === "fetch") {
        fetchArgs.push(args);
        return { exitCode: 0, stdout: "fetch output stays captured", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const mockGithubClient = {
      getRawFile: async () => "real content",
    } as unknown as ConstructorParameters<typeof ManagedRuntime>[2];
    const mockRepo = { owner: "o", name: "r" } as ConstructorParameters<typeof ManagedRuntime>[3];
    const runtime = new ManagedRuntime(
      tempDir,
      {} as ConstructorParameters<typeof ManagedRuntime>[1],
      mockGithubClient,
      mockRepo,
      spawnFn,
      "ghp_test",
    );
    const contracts: OutputContract[] = [
      { kind: "produced", path: "specrunner/changes/slug/spec.md", policy: "halt" },
    ];
    await runtime.validateStepOutputs(contracts, tempDir, "feat/my-feature");
    expect(fetchArgs).toHaveLength(1);
    expect(fetchArgs[0]).toContain("feat/my-feature");
  });

  it("fetch not called when branch is null", async () => {
    const fetchArgs: string[][] = [];
    const spawnFn: SpawnFn = async (cmd, args) => {
      if (cmd === "git" && args[0] === "fetch") {
        fetchArgs.push(args);
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const mockGithubClient = {
      getRawFile: vi.fn().mockResolvedValue("content"),
    } as unknown as ConstructorParameters<typeof ManagedRuntime>[2];
    const mockRepo = { owner: "o", name: "r" } as ConstructorParameters<typeof ManagedRuntime>[3];
    const runtime = new ManagedRuntime(
      tempDir,
      {} as ConstructorParameters<typeof ManagedRuntime>[1],
      mockGithubClient,
      mockRepo,
      spawnFn,
      "ghp_test",
    );
    const contracts: OutputContract[] = [
      { kind: "produced", path: "specrunner/changes/slug/spec.md", policy: "halt" },
    ];
    await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(fetchArgs).toHaveLength(0);
  });
});
