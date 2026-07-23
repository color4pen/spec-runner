/**
 * Unit tests for detectWorkflowCiPresence.
 *
 * TC-007 (should): push-trigger workflow → { present: true, reason: "trigger-match" }
 * TC-008 (should): pull_request-trigger workflow → { present: true, reason: "trigger-match" }
 * TC-009 (should): empty git ls-tree → { present: false, reason: "no-workflows" }; cat-file never invoked
 * TC-010 (should): schedule-only workflow → { present: false, reason: "no-trigger" }
 * TC-011 (should): git ls-tree exits non-zero → { present: true, reason: "inspection-failed" }; cat-file never invoked
 * TC-012 (should): git cat-file exits non-zero → { present: true, reason: "inspection-failed" }
 * TC-013 (should): pull_request_target trigger (prefix match) → trigger-match
 * TC-014 (could): pull_request_review trigger (prefix match) → trigger-match
 * TC-021 (could): non-.yml/.yaml entries in ls-tree are skipped; only .yml evaluated
 * TC-022 (could): tree-mode entry in ls-tree output skipped; result = no-workflows
 */
import { describe, it, expect, vi } from "vitest";
import type { SpawnFn, SpawnResult } from "../../../util/spawn.js";

// ---------------------------------------------------------------------------
// The module under test (does not exist yet — tests are intentionally red)
// ---------------------------------------------------------------------------
import { detectWorkflowCiPresence } from "../workflow-ci-detection.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const FAKE_CWD = "/repo";
const FAKE_REF = "abc1234deadbeef";

/** Fake SHA used as blob sha in ls-tree output. */
const BLOB_SHA_1 = "blobsha0000000001";
const BLOB_SHA_2 = "blobsha0000000002";

/**
 * Build a fake SpawnFn dispatching on git subcommand.
 *
 * @param lsTreeResult  - Result returned for `git ls-tree ...` calls.
 * @param catFileResult - Result returned for `git cat-file -p <sha>` calls.
 *                        When a Map is provided, dispatch is by blob sha (args[2]).
 */
function makeSpawn(options: {
  lsTreeResult?: SpawnResult;
  catFileResult?: SpawnResult | Map<string, SpawnResult>;
}): SpawnFn {
  const defaultOk: SpawnResult = { exitCode: 0, stdout: "", stderr: "" };

  const impl = vi.fn().mockImplementation(
    async (cmd: string, args: string[], _opts: { cwd: string }) => {
      if (cmd === "git" && args[0] === "ls-tree") {
        return options.lsTreeResult ?? defaultOk;
      }
      if (cmd === "git" && args[0] === "cat-file") {
        const catFile = options.catFileResult;
        if (catFile instanceof Map) {
          const sha = args[2]; // git cat-file -p <sha>
          return catFile.get(sha) ?? defaultOk;
        }
        return catFile ?? defaultOk;
      }
      return defaultOk;
    },
  );
  return impl;
}

/**
 * Build a git ls-tree line for a blob entry.
 * Format: `<mode> blob <sha>\t<path>`
 */
function lsTreeBlobLine(sha: string, path: string): string {
  return `100644 blob ${sha}\t${path}`;
}

/**
 * Build a git ls-tree line for a tree (subdirectory) entry.
 * Format: `<mode> tree <sha>\t<path>`
 */
function lsTreeTreeLine(sha: string, path: string): string {
  return `040000 tree ${sha}\t${path}`;
}

/** Count spawn calls that match a git subcommand (ls-tree or cat-file). */
function countSpawnCalls(spawn: SpawnFn, subcommand: string): number {
  const mock = spawn as ReturnType<typeof vi.fn>;
  return (mock.mock.calls as [string, string[], unknown][]).filter(
    ([cmd, args]) => cmd === "git" && args[0] === subcommand,
  ).length;
}

// ---------------------------------------------------------------------------
// TC-007: push-trigger workflow → trigger-match (should)
// ---------------------------------------------------------------------------
describe("detectWorkflowCiPresence — unit", () => {
  it("TC-007: push-trigger workflow returns { present: true, reason: 'trigger-match' }", async () => {
    const pushWorkflow = `name: CI\non:\n  push:\n    branches: [main]\njobs:\n  test:\n    runs-on: ubuntu-latest\n`;

    const spawnFn = makeSpawn({
      lsTreeResult: {
        exitCode: 0,
        stdout: lsTreeBlobLine(BLOB_SHA_1, ".github/workflows/ci.yml") + "\n",
        stderr: "",
      },
      catFileResult: { exitCode: 0, stdout: pushWorkflow, stderr: "" },
    });

    const result = await detectWorkflowCiPresence({
      spawn: spawnFn,
      cwd: FAKE_CWD,
      ref: FAKE_REF,
    });

    expect(result).toEqual({ present: true, reason: "trigger-match" });
    // ls-tree must have been invoked once
    expect(countSpawnCalls(spawnFn, "ls-tree")).toBe(1);
    // cat-file must have been invoked to read the workflow body
    expect(countSpawnCalls(spawnFn, "cat-file")).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // TC-008: pull_request-trigger workflow → trigger-match (should)
  // ---------------------------------------------------------------------------
  it("TC-008: pull_request-trigger workflow returns { present: true, reason: 'trigger-match' }", async () => {
    const prWorkflow = `name: CI\non:\n  pull_request:\n    branches: [main]\njobs:\n  test:\n    runs-on: ubuntu-latest\n`;

    const spawnFn = makeSpawn({
      lsTreeResult: {
        exitCode: 0,
        stdout: lsTreeBlobLine(BLOB_SHA_1, ".github/workflows/pr.yaml") + "\n",
        stderr: "",
      },
      catFileResult: { exitCode: 0, stdout: prWorkflow, stderr: "" },
    });

    const result = await detectWorkflowCiPresence({
      spawn: spawnFn,
      cwd: FAKE_CWD,
      ref: FAKE_REF,
    });

    expect(result).toEqual({ present: true, reason: "trigger-match" });
  });

  // ---------------------------------------------------------------------------
  // TC-009: empty git ls-tree → no-workflows; cat-file never invoked (should)
  // ---------------------------------------------------------------------------
  it("TC-009: empty ls-tree output → { present: false, reason: 'no-workflows' }; cat-file not called", async () => {
    const spawnFn = makeSpawn({
      lsTreeResult: { exitCode: 0, stdout: "", stderr: "" },
    });

    const result = await detectWorkflowCiPresence({
      spawn: spawnFn,
      cwd: FAKE_CWD,
      ref: FAKE_REF,
    });

    expect(result).toEqual({ present: false, reason: "no-workflows" });
    // cat-file must NOT have been called when ls-tree yields no blobs
    expect(countSpawnCalls(spawnFn, "cat-file")).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // TC-010: schedule-only workflow → no-trigger (should)
  // ---------------------------------------------------------------------------
  it("TC-010: schedule-only workflow → { present: false, reason: 'no-trigger' }", async () => {
    const scheduleWorkflow = `name: Nightly\non:\n  schedule:\n    - cron: '0 2 * * *'\njobs:\n  build:\n    runs-on: ubuntu-latest\n`;

    const spawnFn = makeSpawn({
      lsTreeResult: {
        exitCode: 0,
        stdout: lsTreeBlobLine(BLOB_SHA_1, ".github/workflows/nightly.yml") + "\n",
        stderr: "",
      },
      catFileResult: { exitCode: 0, stdout: scheduleWorkflow, stderr: "" },
    });

    const result = await detectWorkflowCiPresence({
      spawn: spawnFn,
      cwd: FAKE_CWD,
      ref: FAKE_REF,
    });

    expect(result).toEqual({ present: false, reason: "no-trigger" });
  });

  // ---------------------------------------------------------------------------
  // TC-011: git ls-tree exits non-zero → inspection-failed (fail-closed); cat-file never invoked (should)
  // ---------------------------------------------------------------------------
  it("TC-011: git ls-tree exits 128 → { present: true, reason: 'inspection-failed' }; cat-file not called", async () => {
    const spawnFn = makeSpawn({
      lsTreeResult: { exitCode: 128, stdout: "", stderr: "fatal: not a tree object" },
    });

    const result = await detectWorkflowCiPresence({
      spawn: spawnFn,
      cwd: FAKE_CWD,
      ref: FAKE_REF,
    });

    expect(result).toEqual({ present: true, reason: "inspection-failed" });
    expect(countSpawnCalls(spawnFn, "cat-file")).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // TC-012: git cat-file exits non-zero → inspection-failed (fail-closed) (should)
  // ---------------------------------------------------------------------------
  it("TC-012: git cat-file exits non-zero → { present: true, reason: 'inspection-failed' }", async () => {
    const spawnFn = makeSpawn({
      lsTreeResult: {
        exitCode: 0,
        stdout: lsTreeBlobLine(BLOB_SHA_1, ".github/workflows/ci.yml") + "\n",
        stderr: "",
      },
      catFileResult: { exitCode: 1, stdout: "", stderr: "fatal: object not found" },
    });

    const result = await detectWorkflowCiPresence({
      spawn: spawnFn,
      cwd: FAKE_CWD,
      ref: FAKE_REF,
    });

    expect(result).toEqual({ present: true, reason: "inspection-failed" });
  });

  // ---------------------------------------------------------------------------
  // TC-013: pull_request_target is classified as CI trigger (prefix match) (should)
  // ---------------------------------------------------------------------------
  it("TC-013: pull_request_target trigger → { present: true, reason: 'trigger-match' } (prefix match)", async () => {
    const workflow = `name: Sec\non:\n  pull_request_target:\n    branches: [main]\njobs:\n  scan:\n    runs-on: ubuntu-latest\n`;

    const spawnFn = makeSpawn({
      lsTreeResult: {
        exitCode: 0,
        stdout: lsTreeBlobLine(BLOB_SHA_1, ".github/workflows/security.yml") + "\n",
        stderr: "",
      },
      catFileResult: { exitCode: 0, stdout: workflow, stderr: "" },
    });

    const result = await detectWorkflowCiPresence({
      spawn: spawnFn,
      cwd: FAKE_CWD,
      ref: FAKE_REF,
    });

    expect(result).toEqual({ present: true, reason: "trigger-match" });
  });

  // ---------------------------------------------------------------------------
  // TC-014: pull_request_review is classified as CI trigger (prefix match) (could)
  // ---------------------------------------------------------------------------
  it("TC-014: pull_request_review trigger → { present: true, reason: 'trigger-match' } (prefix match)", async () => {
    const workflow = `name: Review\non:\n  pull_request_review:\n    types: [submitted]\njobs:\n  notify:\n    runs-on: ubuntu-latest\n`;

    const spawnFn = makeSpawn({
      lsTreeResult: {
        exitCode: 0,
        stdout: lsTreeBlobLine(BLOB_SHA_1, ".github/workflows/review.yml") + "\n",
        stderr: "",
      },
      catFileResult: { exitCode: 0, stdout: workflow, stderr: "" },
    });

    const result = await detectWorkflowCiPresence({
      spawn: spawnFn,
      cwd: FAKE_CWD,
      ref: FAKE_REF,
    });

    expect(result).toEqual({ present: true, reason: "trigger-match" });
  });

  // ---------------------------------------------------------------------------
  // TC-021: non-.yml/.yaml files in ls-tree output are ignored (could)
  // ---------------------------------------------------------------------------
  it("TC-021: .json entry in ls-tree is not read by cat-file; only .yml entry is evaluated → no-trigger", async () => {
    const scheduleWorkflow = `name: Nightly\non:\n  schedule:\n    - cron: '0 2 * * *'\n`;

    const catFileMap = new Map<string, SpawnResult>([
      [BLOB_SHA_2, { exitCode: 0, stdout: scheduleWorkflow, stderr: "" }],
      // BLOB_SHA_1 (.json) should never be requested
      [BLOB_SHA_1, { exitCode: 0, stdout: "should not be read", stderr: "" }],
    ]);

    const spawnFn = makeSpawn({
      lsTreeResult: {
        exitCode: 0,
        stdout: [
          lsTreeBlobLine(BLOB_SHA_1, ".github/workflows/config.json"),
          lsTreeBlobLine(BLOB_SHA_2, ".github/workflows/nightly.yml"),
        ].join("\n") + "\n",
        stderr: "",
      },
      catFileResult: catFileMap,
    });

    const result = await detectWorkflowCiPresence({
      spawn: spawnFn,
      cwd: FAKE_CWD,
      ref: FAKE_REF,
    });

    // Result: only the .yml is evaluated (schedule-only → no-trigger)
    expect(result).toEqual({ present: false, reason: "no-trigger" });

    // cat-file must NOT have been called with the .json blob sha
    const mock = spawnFn as ReturnType<typeof vi.fn>;
    const catFileCalls = (mock.mock.calls as [string, string[], unknown][]).filter(
      ([cmd, args]) => cmd === "git" && args[0] === "cat-file",
    );
    const calledShas = catFileCalls.map(([, args]) => args[2]);
    expect(calledShas).not.toContain(BLOB_SHA_1);
    expect(calledShas).toContain(BLOB_SHA_2);
  });

  // ---------------------------------------------------------------------------
  // TC-022: tree-mode entry in ls-tree is skipped; result = no-workflows (could)
  // ---------------------------------------------------------------------------
  it("TC-022: tree-mode entry in ls-tree → skipped; cat-file not called → { present: false, reason: 'no-workflows' }", async () => {
    const spawnFn = makeSpawn({
      lsTreeResult: {
        exitCode: 0,
        // A tree entry (subdirectory), NOT a blob
        stdout: lsTreeTreeLine(BLOB_SHA_1, ".github/workflows/subdir") + "\n",
        stderr: "",
      },
    });

    const result = await detectWorkflowCiPresence({
      spawn: spawnFn,
      cwd: FAKE_CWD,
      ref: FAKE_REF,
    });

    expect(result).toEqual({ present: false, reason: "no-workflows" });
    expect(countSpawnCalls(spawnFn, "cat-file")).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Additional: multiple workflow files — early exit on first trigger-match
  // ---------------------------------------------------------------------------
  it("first trigger-matching workflow short-circuits; later blobs not needed for the result", async () => {
    // Two .yml blobs: first has push, second has schedule
    // After the first matches, cat-file for the second may or may not be called;
    // the result must be trigger-match regardless
    const pushWorkflow = `name: CI\non:\n  push:\n    branches: [main]\n`;
    const scheduleWorkflow = `name: Nightly\non:\n  schedule:\n    - cron: '0 2 * * *'\n`;

    const catFileMap = new Map<string, SpawnResult>([
      [BLOB_SHA_1, { exitCode: 0, stdout: pushWorkflow, stderr: "" }],
      [BLOB_SHA_2, { exitCode: 0, stdout: scheduleWorkflow, stderr: "" }],
    ]);

    const spawnFn = makeSpawn({
      lsTreeResult: {
        exitCode: 0,
        stdout: [
          lsTreeBlobLine(BLOB_SHA_1, ".github/workflows/ci.yml"),
          lsTreeBlobLine(BLOB_SHA_2, ".github/workflows/nightly.yml"),
        ].join("\n") + "\n",
        stderr: "",
      },
      catFileResult: catFileMap,
    });

    const result = await detectWorkflowCiPresence({
      spawn: spawnFn,
      cwd: FAKE_CWD,
      ref: FAKE_REF,
    });

    expect(result).toEqual({ present: true, reason: "trigger-match" });
  });

  // ---------------------------------------------------------------------------
  // Additional: ls-tree exit 0 but only whitespace → no-workflows
  // ---------------------------------------------------------------------------
  it("ls-tree exit 0 with only whitespace/newlines → { present: false, reason: 'no-workflows' }", async () => {
    const spawnFn = makeSpawn({
      lsTreeResult: { exitCode: 0, stdout: "\n\n  \n", stderr: "" },
    });

    const result = await detectWorkflowCiPresence({
      spawn: spawnFn,
      cwd: FAKE_CWD,
      ref: FAKE_REF,
    });

    expect(result).toEqual({ present: false, reason: "no-workflows" });
    expect(countSpawnCalls(spawnFn, "cat-file")).toBe(0);
  });
});
