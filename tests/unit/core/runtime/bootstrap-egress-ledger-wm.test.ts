/**
 * Tests for bootstrap-commit-egress-ledger + draft-consume-on-start: workspace-materializer paths
 *
 * TC-001 (bootstrap): workspace-materializer new-run path records bootstrap OID in synthesizedCommits
 * TC-004 (bootstrap): workspace-materializer rev-parse failure aborts bootstrap and cleans up worktree
 * TC-001/TC-002 (consume): both flat and directory drafts are consumed after successful start
 * TC-003 (consume): commit failure before materialization preserves the draft
 * TC-006 (resume): operator-edited request.md survives a subsequent resume (no draft recopy)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { WorkspaceMaterializer } from "../../../../src/core/runtime/workspace-materializer.js";
import type { MaterializerHost } from "../../../../src/core/runtime/workspace-materializer.js";
import type { JobState } from "../../../../src/state/schema.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";
import type { WorkspaceSetupPlan } from "../../../../src/core/worktree/setup.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

const SLUG = "bootstrap-wm-egress-test";
const JOB_ID = "aaaabbbb-cccc-dddd-eeee-000000000001";
const BOOTSTRAP_OID = "abc123def456abc123def456abc123def456abc1";

let tempDir: string;
let worktreeDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-wm-"));
  worktreeDir = path.join(tempDir, "worktree");
  await fs.mkdir(worktreeDir, { recursive: true });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeInitialState(): JobState {
  return buildInitialJobState({
    request: {
      path: path.join(tempDir, "request.md"),
      title: "Bootstrap Egress Test",
      type: "bug-fix",
      slug: SLUG,
    },
    repository: { owner: "test", name: "repo" },
  });
}

// ---------------------------------------------------------------------------
// TC-001: workspace-materializer new-run path records bootstrap OID in synthesizedCommits
// ---------------------------------------------------------------------------
describe("TC-001: workspace-materializer new-run path records bootstrap OID in synthesizedCommits", () => {
  it(
    "synthesizedCommits contains bootstrap OID after materialize() with requestFilePath set",
    async () => {
      // Arrange: create a real request.md file (materialize() does fs.cp)
      const requestFilePath = path.join(tempDir, "request.md");
      await fs.writeFile(requestFilePath, "# Bootstrap Egress Test\n", "utf-8");

      const initialState = makeInitialState();
      let trackedState: JobState = { ...initialState };

      const host: MaterializerHost = {
        cwd: tempDir,
        manager: {
          create: vi.fn().mockResolvedValue(worktreeDir),
          remove: vi.fn().mockResolvedValue(undefined),
          prune: vi.fn().mockResolvedValue(undefined),
        },
        // spawnFn: returns known OID for rev-parse HEAD; success for all other git calls
        spawnFn: vi.fn().mockImplementation(
          async (_cmd: string, args: string[]) => {
            if (args[0] === "rev-parse" && args[1] === "HEAD") {
              return { exitCode: 0, stdout: `${BOOTSTRAP_OID}\n`, stderr: "" };
            }
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        ) as unknown as SpawnFn,
        resolveSetupPlan: vi.fn().mockReturnValue({ kind: "skip" } satisfies WorkspaceSetupPlan),
        registerWorkspace: vi.fn(),
        // updateJobState: applies each mutator to trackedState so we can inspect the result
        updateJobState: vi.fn().mockImplementation(
          async (_jobId: string, mutator: (s: JobState) => JobState) => {
            trackedState = mutator(trackedState);
          },
        ),
        writeLivenessSidecar: vi.fn().mockResolvedValue(undefined),
      };

      const materializer = new WorkspaceMaterializer(host);

      // Act
      await materializer.materialize(
        SLUG,
        JOB_ID,
        { kind: "new-run", remoteBaseRef: "origin/main", branchName: "feat/bootstrap-wm-egress-test" },
        { requestFilePath, bootstrapState: initialState },
      );

      // Assert: TC-001
      // RED before T-01 fix: updateJobState is never called with appendSynthesizedCommit,
      // so synthesizedCommits remains undefined / empty. The test fails here.
      expect(
        trackedState.synthesizedCommits,
        "synthesizedCommits must contain the bootstrap OID after T-01 fix " +
        "(RED: current code does not capture OID via git rev-parse HEAD)",
      ).toContain(BOOTSTRAP_OID);
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// R2: ledger persistence failure aborts bootstrap (fail-closed)
//
// R2 names BOTH capture (rev-parse) and persistence (updateJobState) failures as
// fail-closed. A silently-swallowed persistence failure would leave a pipeline
// commit outside the ledger — the exact class this request closes.
// DESTROY: wrap the appendSynthesizedCommit updateJobState call in a
// swallow-and-continue catch → this test fails (resolves instead of rejecting).
// ---------------------------------------------------------------------------
describe("R2: updateJobState (ledger persistence) failure aborts bootstrap", () => {
  it(
    "materialize() rejects when persisting the bootstrap OID fails (no silent continue)",
    async () => {
      const requestFilePath = path.join(tempDir, "request.md");
      await fs.writeFile(requestFilePath, "# Bootstrap Egress Test\n", "utf-8");

      const initialState = makeInitialState();

      const host: MaterializerHost = {
        cwd: tempDir,
        manager: {
          create: vi.fn().mockResolvedValue(worktreeDir),
          remove: vi.fn().mockResolvedValue(undefined),
          prune: vi.fn().mockResolvedValue(undefined),
        },
        spawnFn: vi.fn().mockImplementation(
          async (_cmd: string, args: string[]) => {
            if (args[0] === "rev-parse" && args[1] === "HEAD") {
              return { exitCode: 0, stdout: `${BOOTSTRAP_OID}\n`, stderr: "" };
            }
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        ) as unknown as SpawnFn,
        resolveSetupPlan: vi.fn().mockReturnValue({ kind: "skip" } satisfies WorkspaceSetupPlan),
        registerWorkspace: vi.fn(),
        // updateJobState call order in new-run arm:
        //   1. worktreePath recording (line 176)
        //   2. request.path update   (line 208)
        //   3. appendSynthesizedCommit — ledger append (lines 238-242) ← fail this one
        //   4. branch recording      (lines 248-252, only reached if 3 passes)
        // Using ordered one-time values so calls 1-2 succeed and call 3 rejects.
        updateJobState: vi.fn()
          .mockResolvedValueOnce(undefined)   // call 1: worktreePath
          .mockResolvedValueOnce(undefined)   // call 2: request.path
          .mockRejectedValueOnce(new Error("ledger persistence failed")), // call 3: ledger append
        writeLivenessSidecar: vi.fn().mockResolvedValue(undefined),
      };

      const materializer = new WorkspaceMaterializer(host);

      await expect(
        materializer.materialize(
          SLUG,
          JOB_ID,
          { kind: "new-run", remoteBaseRef: "origin/main", branchName: "feat/bootstrap-wm-egress-test" },
          { requestFilePath, bootstrapState: initialState },
        ),
      ).rejects.toThrow("ledger persistence failed");
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-004: workspace-materializer rev-parse failure aborts bootstrap and cleans up worktree
// ---------------------------------------------------------------------------
describe("TC-004: workspace-materializer rev-parse failure aborts bootstrap and cleans up worktree", () => {
  it(
    "materialize() rejects and calls manager.remove + manager.prune when rev-parse fails",
    async () => {
      // Arrange
      const requestFilePath = path.join(tempDir, "request.md");
      await fs.writeFile(requestFilePath, "# Bootstrap Egress Test\n", "utf-8");

      const initialState = makeInitialState();
      const removeStub = vi.fn().mockResolvedValue(undefined);
      const pruneStub = vi.fn().mockResolvedValue(undefined);

      const host: MaterializerHost = {
        cwd: tempDir,
        manager: {
          create: vi.fn().mockResolvedValue(worktreeDir),
          remove: removeStub,
          prune: pruneStub,
        },
        // spawnFn: git commit succeeds, git rev-parse HEAD fails with exitCode 128
        spawnFn: vi.fn().mockImplementation(
          async (_cmd: string, args: string[]) => {
            if (args[0] === "rev-parse" && args[1] === "HEAD") {
              return { exitCode: 128, stdout: "", stderr: "fatal: not a git repository" };
            }
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        ) as unknown as SpawnFn,
        resolveSetupPlan: vi.fn().mockReturnValue({ kind: "skip" } satisfies WorkspaceSetupPlan),
        registerWorkspace: vi.fn(),
        updateJobState: vi.fn().mockResolvedValue(undefined),
        writeLivenessSidecar: vi.fn().mockResolvedValue(undefined),
      };

      const materializer = new WorkspaceMaterializer(host);

      // Act + Assert: TC-004
      // RED before T-01 fix: current code never calls git rev-parse HEAD, so materialize()
      // does NOT reject. The test fails here (expects rejection, gets resolution).
      await expect(
        materializer.materialize(
          SLUG,
          JOB_ID,
          { kind: "new-run", remoteBaseRef: "origin/main", branchName: "feat/bootstrap-wm-egress-test" },
          { requestFilePath, bootstrapState: initialState },
        ),
      ).rejects.toThrow();

      // After T-01 fix: cleanup must be called before propagating the error.
      expect(
        removeStub,
        "manager.remove must be called on rev-parse failure (worktree cleanup, invariant 3)",
      ).toHaveBeenCalled();
      expect(
        pruneStub,
        "manager.prune must be called on rev-parse failure (worktree cleanup, invariant 3)",
      ).toHaveBeenCalled();
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-001/TC-002 (consume): both flat and directory drafts are consumed on successful start
// ---------------------------------------------------------------------------
describe("TC-001/TC-002 (consume): flat and directory drafts are deleted after successful new-run materialize", () => {
  it(
    "deletes both specrunner/drafts/<slug>.md and specrunner/drafts/<slug>/ after commit succeeds",
    async () => {
      const requestFilePath = path.join(tempDir, "request.md");
      await fs.writeFile(requestFilePath, "# Consume Test\n", "utf-8");

      // Create both canonical draft forms in the repo root (host.cwd = tempDir)
      const flatDraft = path.join(tempDir, "specrunner", "drafts", `${SLUG}.md`);
      const dirDraft = path.join(tempDir, "specrunner", "drafts", SLUG);
      await fs.mkdir(path.dirname(flatDraft), { recursive: true });
      await fs.writeFile(flatDraft, "# Flat Draft\n");
      await fs.mkdir(path.join(dirDraft), { recursive: true });
      await fs.writeFile(path.join(dirDraft, "request.md"), "# Dir Draft\n");

      const initialState = makeInitialState();
      let trackedState: JobState = { ...initialState };

      const host: MaterializerHost = {
        cwd: tempDir, // repo root — consumeDraft looks here for drafts
        manager: {
          create: vi.fn().mockResolvedValue(worktreeDir),
          remove: vi.fn().mockResolvedValue(undefined),
          prune: vi.fn().mockResolvedValue(undefined),
        },
        // spawnFn: rev-parse returns OID; ls-files returns empty (untracked); all else succeeds
        spawnFn: vi.fn().mockImplementation(
          async (_cmd: string, args: string[]) => {
            if (args[0] === "rev-parse" && args[1] === "HEAD") {
              return { exitCode: 0, stdout: `${BOOTSTRAP_OID}\n`, stderr: "" };
            }
            if (args[0] === "ls-files") {
              return { exitCode: 0, stdout: "", stderr: "" }; // untracked
            }
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        ) as unknown as SpawnFn,
        resolveSetupPlan: vi.fn().mockReturnValue({ kind: "skip" } satisfies WorkspaceSetupPlan),
        registerWorkspace: vi.fn(),
        updateJobState: vi.fn().mockImplementation(
          async (_jobId: string, mutator: (s: JobState) => JobState) => {
            trackedState = mutator(trackedState);
          },
        ),
        writeLivenessSidecar: vi.fn().mockResolvedValue(undefined),
      };

      const materializer = new WorkspaceMaterializer(host);
      await materializer.materialize(
        SLUG,
        JOB_ID,
        { kind: "new-run", remoteBaseRef: "origin/main", branchName: "feat/consume-test" },
        { requestFilePath, bootstrapState: initialState },
      );

      // Both draft forms must be gone
      await expect(fs.access(flatDraft)).rejects.toThrow();
      await expect(fs.access(dirDraft)).rejects.toThrow();
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-003 (consume): commit failure before materialization preserves the draft
// ---------------------------------------------------------------------------
describe("TC-003 (consume): commit failure before materialization preserves the draft", () => {
  it(
    "draft still exists on disk when the git commit command fails",
    async () => {
      const requestFilePath = path.join(tempDir, "request.md");
      await fs.writeFile(requestFilePath, "# Commit Fail Test\n", "utf-8");

      // Create directory-format draft
      const dirDraft = path.join(tempDir, "specrunner", "drafts", SLUG);
      await fs.mkdir(dirDraft, { recursive: true });
      await fs.writeFile(path.join(dirDraft, "request.md"), "# Draft\n");

      const initialState = makeInitialState();

      const host: MaterializerHost = {
        cwd: tempDir,
        manager: {
          create: vi.fn().mockResolvedValue(worktreeDir),
          remove: vi.fn().mockResolvedValue(undefined),
          prune: vi.fn().mockResolvedValue(undefined),
        },
        // spawnFn: commit returns exitCode != 0; consumeDraft should never be reached
        spawnFn: vi.fn().mockImplementation(
          async (_cmd: string, args: string[]) => {
            if (args[0] === "commit") {
              return { exitCode: 1, stdout: "", stderr: "error: nothing to commit" };
            }
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        ) as unknown as SpawnFn,
        resolveSetupPlan: vi.fn().mockReturnValue({ kind: "skip" } satisfies WorkspaceSetupPlan),
        registerWorkspace: vi.fn(),
        updateJobState: vi.fn().mockResolvedValue(undefined),
        writeLivenessSidecar: vi.fn().mockResolvedValue(undefined),
      };

      const materializer = new WorkspaceMaterializer(host);
      await expect(
        materializer.materialize(
          SLUG,
          JOB_ID,
          { kind: "new-run", remoteBaseRef: "origin/main", branchName: "feat/commit-fail" },
          { requestFilePath, bootstrapState: initialState },
        ),
      ).rejects.toThrow();

      // Draft must still exist (consumeDraft was never reached)
      await expect(fs.access(dirDraft)).resolves.toBeUndefined();
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-006 (resume): operator-edited request.md survives a subsequent resume
// ---------------------------------------------------------------------------
describe("TC-006 (resume): operator-edited request.md is not overwritten by draft on resume", () => {
  it(
    "resume-existing materialize leaves change-folder request.md unchanged even when draft differs",
    async () => {
      const operatorContent = "# Operator-Edited Content\n";
      const draftContent = "# Old Draft Content\n";

      // Set up worktree with operator-edited request.md
      const worktreePath = path.join(tempDir, "worktree");
      await fs.mkdir(worktreePath, { recursive: true });
      const changeFolder = path.join(worktreePath, "specrunner", "changes", SLUG);
      await fs.mkdir(changeFolder, { recursive: true });
      await fs.writeFile(path.join(changeFolder, "request.md"), operatorContent);

      // Set up a different-content draft in the repo root (should NOT overwrite)
      const draftDir = path.join(tempDir, "specrunner", "drafts", SLUG);
      await fs.mkdir(draftDir, { recursive: true });
      await fs.writeFile(path.join(draftDir, "request.md"), draftContent);

      const initialState = makeInitialState();

      const host: MaterializerHost = {
        cwd: tempDir,
        manager: {
          create: vi.fn().mockResolvedValue(worktreePath),
          remove: vi.fn().mockResolvedValue(undefined),
          prune: vi.fn().mockResolvedValue(undefined),
        },
        spawnFn: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }) as unknown as SpawnFn,
        resolveSetupPlan: vi.fn().mockReturnValue({ kind: "skip" } satisfies WorkspaceSetupPlan),
        registerWorkspace: vi.fn(),
        updateJobState: vi.fn().mockImplementation(
          async (_jobId: string, mutator: (s: JobState) => JobState) => {
            mutator(initialState);
          },
        ),
        writeLivenessSidecar: vi.fn().mockResolvedValue(undefined),
      };

      const materializer = new WorkspaceMaterializer(host);
      await materializer.materialize(
        SLUG,
        JOB_ID,
        { kind: "resume-existing", worktreePath },
        { bootstrapState: initialState },
      );

      // Operator content must be preserved — draft must NOT have overwritten it
      const actualContent = await fs.readFile(
        path.join(changeFolder, "request.md"),
        "utf-8",
      );
      expect(actualContent).toBe(operatorContent);
    },
    20000,
  );
});
