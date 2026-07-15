/**
 * Tests for src/core/attach/orchestrator.ts (T-07).
 *
 * TC-ORC-001: fetch failure → ATTACH_FETCH_FAILED
 * TC-ORC-002: checkpoint not found → CHECKPOINT_NOT_FOUND
 * TC-ORC-003: verify failure (status=running) → CHECKPOINT_NOT_ATTACHABLE
 * TC-ORC-004: valid input → VerifiedCheckpoint returned
 * TC-ORC-005: verify failure leaves no filesystem side effects
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runAttachVerification } from "../../src/core/attach/orchestrator.js";
import { ERROR_CODES } from "../../src/errors.js";
import type { SpawnFn, SpawnResult } from "../../src/util/spawn.js";

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

const BRANCH = "feat/my-feature-1234abcd";
const SLUG = "my-feature";
const JOB_ID = "test-job-id-12345678";
const CHECKPOINT_OID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const _REF = CHECKPOINT_OID; // After T-01: OID is used as ref for read operations
const EXPECTED_REPO = { owner: "acme", name: "repo" };

const VALID_STATE_JSON = JSON.stringify({
  version: 2,
  jobId: JOB_ID,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T01:00:00.000Z",
  request: {
    path: `/repo/specrunner/changes/${SLUG}/request.md`,
    title: "Test feature",
    type: "new-feature",
    slug: SLUG,
  },
  repository: { owner: EXPECTED_REPO.owner, name: EXPECTED_REPO.name },
  session: null,
  step: "implementer",
  status: "awaiting-resume",
  branch: BRANCH,
  history: [],
  error: null,
  pipelineId: "standard",
  resumePoint: {
    step: "implementer",
    reason: "interrupted",
    iterationsExhausted: 0,
  },
});

const VALID_EVENTS_JSONL =
  `{"type":"interruption","ts":"2026-01-01T01:00:00.000Z","step":"implementer","reason":"interrupted","budgetRemaining":3}\n`;

const RUNNING_STATE_JSON = JSON.stringify({
  ...JSON.parse(VALID_STATE_JSON),
  status: "running",
});

/**
 * Build a stub SpawnFn that intercepts git commands by prefix matching.
 */
function makeStubSpawn(
  responses: Map<string, Partial<SpawnResult>>,
): SpawnFn {
  return vi.fn(async (cmd: string, args: string[], _opts: { cwd: string }) => {
    const key = `${cmd} ${args.join(" ")}`;
    // Exact match first
    if (responses.has(key)) {
      const r = responses.get(key)!;
      return { exitCode: 0, stdout: "", stderr: "", ...r };
    }
    // Prefix match for dynamic refs
    for (const [k, v] of responses.entries()) {
      if (key.startsWith(k)) {
        return { exitCode: 0, stdout: "", stderr: "", ...v };
      }
    }
    // Default: success with empty output
    return { exitCode: 0, stdout: "", stderr: "" };
  }) as SpawnFn;
}

/** Build a stub SpawnFn that models a fully valid checkpoint + fetch. */
function makeValidSpawn(): SpawnFn {
  return makeStubSpawn(
    new Map<string, Partial<SpawnResult>>([
      [`git fetch origin ${BRANCH}`, { exitCode: 0, stdout: "", stderr: "" }],
      // T-01: OID resolution immediately after fetch
      [`git rev-parse origin/${BRANCH}^{commit}`, { exitCode: 0, stdout: CHECKPOINT_OID + "\n" }],
      // All subsequent read operations use OID (not symbolic origin/<branch>)
      [`git ls-tree --name-only ${CHECKPOINT_OID} specrunner/changes/`, {
        exitCode: 0,
        stdout: `specrunner/changes/${SLUG}\n`,
      }],
      [`git cat-file -e ${CHECKPOINT_OID}:specrunner/changes/${SLUG}/state.json`, { exitCode: 0 }],
      [`git show ${CHECKPOINT_OID}:specrunner/changes/${SLUG}/state.json`, {
        exitCode: 0,
        stdout: VALID_STATE_JSON,
      }],
      [`git show ${CHECKPOINT_OID}:specrunner/changes/${SLUG}/events.jsonl`, {
        exitCode: 0,
        stdout: VALID_EVENTS_JSONL,
      }],
      [`git ls-tree -r --name-only ${CHECKPOINT_OID} -- specrunner/changes/${SLUG}/`, {
        exitCode: 0,
        stdout: [
          `specrunner/changes/${SLUG}/state.json`,
          `specrunner/changes/${SLUG}/events.jsonl`,
          `specrunner/changes/${SLUG}/request.md`,
          `specrunner/changes/${SLUG}/tasks.md`,
          `specrunner/changes/${SLUG}/spec.md`,
        ].join("\n") + "\n",
      }],
    ]),
  );
}

// ---------------------------------------------------------------------------
// TC-ORC-001: fetch failure → ATTACH_FETCH_FAILED
// ---------------------------------------------------------------------------
describe("TC-ORC-001: fetch failure → ATTACH_FETCH_FAILED", () => {
  it("throws ATTACH_FETCH_FAILED when git fetch exits non-zero", async () => {
    const spawnFn = makeStubSpawn(
      new Map([
        [`git fetch origin ${BRANCH}`, {
          exitCode: 128,
          stdout: "",
          stderr: "fatal: repository 'origin' not found",
        }],
      ]),
    );

    await expect(
      runAttachVerification({ cwd: "/repo", branch: BRANCH, spawnFn, expectedRepo: EXPECTED_REPO }),
    ).rejects.toMatchObject({ code: ERROR_CODES.ATTACH_FETCH_FAILED });
  });
});

// ---------------------------------------------------------------------------
// TC-ORC-002: checkpoint not found → CHECKPOINT_NOT_FOUND
// ---------------------------------------------------------------------------
describe("TC-ORC-002: checkpoint not found → CHECKPOINT_NOT_FOUND", () => {
  it("throws CHECKPOINT_NOT_FOUND when no active change folder exists in ref", async () => {
    const spawnFn = makeStubSpawn(
      new Map<string, Partial<SpawnResult>>([
        [`git fetch origin ${BRANCH}`, { exitCode: 0 }],
        [`git rev-parse origin/${BRANCH}^{commit}`, { exitCode: 0, stdout: CHECKPOINT_OID + "\n" }],
        [`git ls-tree --name-only ${CHECKPOINT_OID} specrunner/changes/`, {
          exitCode: 0,
          stdout: "specrunner/changes/archive\n",
        }],
      ]),
    );

    await expect(
      runAttachVerification({ cwd: "/repo", branch: BRANCH, spawnFn, expectedRepo: EXPECTED_REPO }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CHECKPOINT_NOT_FOUND });
  });
});

// ---------------------------------------------------------------------------
// TC-ORC-003: verify failure (status=running) → CHECKPOINT_NOT_ATTACHABLE
// ---------------------------------------------------------------------------
describe("TC-ORC-003: verify failure → CHECKPOINT_NOT_ATTACHABLE", () => {
  it("throws CHECKPOINT_NOT_ATTACHABLE when checkpoint status is running", async () => {
    const spawnFn = makeStubSpawn(
      new Map<string, Partial<SpawnResult>>([
        [`git fetch origin ${BRANCH}`, { exitCode: 0 }],
        [`git rev-parse origin/${BRANCH}^{commit}`, { exitCode: 0, stdout: CHECKPOINT_OID + "\n" }],
        [`git ls-tree --name-only ${CHECKPOINT_OID} specrunner/changes/`, {
          exitCode: 0,
          stdout: `specrunner/changes/${SLUG}\n`,
        }],
        [`git cat-file -e ${CHECKPOINT_OID}:specrunner/changes/${SLUG}/state.json`, { exitCode: 0 }],
        [`git show ${CHECKPOINT_OID}:specrunner/changes/${SLUG}/state.json`, {
          exitCode: 0,
          stdout: RUNNING_STATE_JSON,
        }],
        [`git show ${CHECKPOINT_OID}:specrunner/changes/${SLUG}/events.jsonl`, {
          exitCode: 0,
          stdout: VALID_EVENTS_JSONL,
        }],
        [`git ls-tree -r --name-only ${CHECKPOINT_OID} -- specrunner/changes/${SLUG}/`, {
          exitCode: 0,
          stdout: [
            `specrunner/changes/${SLUG}/state.json`,
            `specrunner/changes/${SLUG}/events.jsonl`,
            `specrunner/changes/${SLUG}/request.md`,
          ].join("\n") + "\n",
        }],
      ]),
    );

    await expect(
      runAttachVerification({ cwd: "/repo", branch: BRANCH, spawnFn, expectedRepo: EXPECTED_REPO }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE });
  });
});

// ---------------------------------------------------------------------------
// TC-ORC-004: valid input → VerifiedCheckpoint returned
// ---------------------------------------------------------------------------
describe("TC-ORC-004: valid checkpoint → VerifiedCheckpoint", () => {
  it("returns VerifiedCheckpoint with correct slug, jobId, and branch", async () => {
    const spawnFn = makeValidSpawn();
    const result = await runAttachVerification({
      cwd: "/repo",
      branch: BRANCH,
      spawnFn,
      expectedRepo: EXPECTED_REPO,
    });
    expect(result.slug).toBe(SLUG);
    expect(result.jobId).toBe(JOB_ID);
    expect(result.branch).toBe(BRANCH);
    expect(result.state.status).toBe("awaiting-resume");
    expect(result.checkpointOid).toBe(CHECKPOINT_OID);
  });
});

// ---------------------------------------------------------------------------
// TC-ORC-006: OID fixation — read commands use resolved OID, not symbolic origin/<branch>
// ---------------------------------------------------------------------------
describe("TC-ORC-006: OID fixation — git read commands use resolved OID, not symbolic ref", () => {
  it("uses resolved OID for ls-tree / cat-file / show — never symbolic origin/<branch> after rev-parse", async () => {
    const spawnFn = makeValidSpawn();
    const result = await runAttachVerification({
      cwd: "/repo",
      branch: BRANCH,
      spawnFn,
      expectedRepo: EXPECTED_REPO,
    });

    // Verify checkpointOid is the OID from rev-parse (not a symbolic ref)
    expect(result.checkpointOid).toBe(CHECKPOINT_OID);

    const calls = (spawnFn as ReturnType<typeof vi.fn>).mock.calls as [string, string[], unknown][];

    // The symbolic origin/<branch> should appear ONLY in fetch and rev-parse args
    const symbolicRef = `origin/${BRANCH}`;
    const callsUsingSymbolic = calls.filter(
      ([_cmd, args]) =>
        args.some((a) => a === symbolicRef || a.includes(symbolicRef)) &&
        args[0] !== "fetch" &&
        !(args[0] === "rev-parse" && args.some((a) => a.includes("^{commit}"))),
    );
    // After fetch + rev-parse, NO command should use the symbolic ref
    expect(callsUsingSymbolic).toHaveLength(0);
  });

  it("VerifiedCheckpoint.checkpointOid matches rev-parse output (immutable OID fixation)", async () => {
    const spawnFn = makeValidSpawn();
    const result = await runAttachVerification({
      cwd: "/repo",
      branch: BRANCH,
      spawnFn,
      expectedRepo: EXPECTED_REPO,
    });
    // The OID in result must be the one from rev-parse, not re-evaluated
    expect(result.checkpointOid).toBe(CHECKPOINT_OID);
    expect(result.checkpointOid).toMatch(/^[0-9a-f]{40}$/);
  });
});

// ---------------------------------------------------------------------------
// TC-ORC-005: verify failure leaves no filesystem side effects
// ---------------------------------------------------------------------------
describe("TC-ORC-005: verify failure → no filesystem side effects", () => {
  it("does not write any worktree/sidecar/state files on CHECKPOINT_NOT_ATTACHABLE", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "orc-test-"));
    try {
      // Simulate a running-status checkpoint (verify failure)
      const spawnFn = makeStubSpawn(
        new Map<string, Partial<SpawnResult>>([
          [`git fetch origin ${BRANCH}`, { exitCode: 0 }],
          [`git rev-parse origin/${BRANCH}^{commit}`, { exitCode: 0, stdout: CHECKPOINT_OID + "\n" }],
          [`git ls-tree --name-only ${CHECKPOINT_OID} specrunner/changes/`, {
            exitCode: 0,
            stdout: `specrunner/changes/${SLUG}\n`,
          }],
          [`git cat-file -e ${CHECKPOINT_OID}:specrunner/changes/${SLUG}/state.json`, { exitCode: 0 }],
          [`git show ${CHECKPOINT_OID}:specrunner/changes/${SLUG}/state.json`, {
            exitCode: 0,
            stdout: RUNNING_STATE_JSON,
          }],
          [`git show ${CHECKPOINT_OID}:specrunner/changes/${SLUG}/events.jsonl`, {
            exitCode: 0,
            stdout: VALID_EVENTS_JSONL,
          }],
          [`git ls-tree -r --name-only ${CHECKPOINT_OID} -- specrunner/changes/${SLUG}/`, {
            exitCode: 0,
            stdout: [
              `specrunner/changes/${SLUG}/state.json`,
              `specrunner/changes/${SLUG}/events.jsonl`,
              `specrunner/changes/${SLUG}/request.md`,
            ].join("\n") + "\n",
          }],
        ]),
      );

      let threw = false;
      try {
        await runAttachVerification({
          cwd: tmpDir,
          branch: BRANCH,
          spawnFn,
          expectedRepo: EXPECTED_REPO,
        });
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);

      // Verify no worktree directory was created
      const worktreeDir = path.join(tmpDir, ".git", "specrunner-worktrees");
      const worktreeDirExists = await fs.access(worktreeDir).then(() => true).catch(() => false);
      expect(worktreeDirExists).toBe(false);

      // Verify no sidecar directory was created
      const sidecarDir = path.join(tmpDir, ".specrunner", "local");
      const sidecarDirExists = await fs.access(sidecarDir).then(() => true).catch(() => false);
      expect(sidecarDirExists).toBe(false);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
