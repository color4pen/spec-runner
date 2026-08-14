/**
 * TC-001: Re-run shape earns assurance instead of deferring (E2E integration).
 *
 * Source: spec.md > Requirement: The bite-evidence red side SHALL evaluate on the
 *   Evidence Base > Scenario: Re-run shape earns assurance instead of deferring
 *
 * Drives the real LocalRuntime against a throwaway git repo where:
 *   - The implementer commit PREDATES the latest test-materialize commit (re-run shape)
 *   - The current gate (pre-Evidence-Base) would have returned strategy-deferred (#991)
 *   - The new gate (Evidence Base) should return passed (base-red via EB, candidate-green at HEAD)
 *
 * Repo structure:
 *   init          → README.md                        (= job base = bootstrap^)
 *   bootstrap     → request.md                       (= synthesizedCommits[0])
 *   mat1          → feature.test.ts added            (first test-materialize, impl absent → red)
 *   impl1         → feature-impl.ts added            (implementer, test goes green)
 *   mat2          → feature.test.ts updated (comment) (SECOND test-materialize; impl1 predates it)
 *
 * State:
 *   synthesizedCommits = [bootstrapOid]
 *   steps["test-materialize"] = [mat1Run(T1), mat2Run(T3)]  (T3 = latest = mat2)
 *   steps["implementer"]      = [impl1Run(T2)]              (T2 < T3 → re-run shape)
 *
 * Evidence Base = bootstrap^ (init tree = README only) + overlay of feature.test.ts@HEAD
 * At Evidence Base: feature-impl.ts is absent → test fails → RED
 * At HEAD (mat2): feature-impl.ts is present (from impl1) → test passes → GREEN
 * Gate verdict: passed (base-red, candidate-green)
 *
 * This test is RED with current gate (returns strategy-deferred on re-run shape).
 * It becomes GREEN once the implementer rewrites the gate to use Evidence Base.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { LocalRuntime } from "../local.js";
import { spawnCommand } from "../../../util/spawn.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { JobState, StepRun } from "../../../state/schema.js";
import { runBiteEvidenceGate } from "../../step/bite-evidence/gate.js";

const GIT_ENV = {
  GIT_AUTHOR_NAME: "T",
  GIT_AUTHOR_EMAIL: "t@t.co",
  GIT_COMMITTER_NAME: "T",
  GIT_COMMITTER_EMAIL: "t@t.co",
};

async function git(cwd: string, ...args: string[]): Promise<string> {
  const r = await spawnCommand("git", args, { cwd, env: GIT_ENV });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed:\n${r.stderr}`);
  return r.stdout.trim();
}

function makeLocal(cwd: string): LocalRuntime {
  return new LocalRuntime({ cwd, githubClient: {} as GitHubClient, spawnFn: spawnCommand });
}

const SCOPED_CONFIG: SpecRunnerConfig = {
  version: 1,
  agents: {},
  verification: {
    commands: ["echo build"],
    scopedTestCommand: "bun test",
  },
} as unknown as SpecRunnerConfig;

// ---------------------------------------------------------------------------
// Repo setup
// ---------------------------------------------------------------------------

let repo: string;
let bootstrapOid: string;
let mat1Oid: string;
let impl1Oid: string;
let mat2Oid: string;   // HEAD after all commits

const TEST_FILE = "feature.test.ts";
const IMPL_FILE = "feature-impl.ts";
const BUN_TEST = "bun" + ":test";

beforeAll(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), "eb-e2e-rerun-"));
  await git(repo, "init", "--initial-branch=main");
  await git(repo, "config", "user.email", "t@t.co");
  await git(repo, "config", "user.name", "T");

  // 1. init commit: README only — this becomes the job base (bootstrap^)
  await fs.writeFile(path.join(repo, "README.md"), "# e2e-rerun-repo\n");
  await git(repo, "add", "README.md");
  await git(repo, "commit", "-m", "init");

  // 2. bootstrap commit: request.md — this will be synthesizedCommits[0]
  await fs.mkdir(path.join(repo, "specrunner", "changes", "example"), { recursive: true });
  await fs.writeFile(
    path.join(repo, "specrunner", "changes", "example", "request.md"),
    "# Request\n\nExample bug-fix request.\n",
  );
  await git(repo, "add", "-A");
  await git(repo, "commit", "-m", "bootstrap: add request.md");
  bootstrapOid = await git(repo, "rev-parse", "HEAD");

  // 3. mat1 commit: add feature.test.ts (imports feature-impl → fails at this tree)
  await fs.writeFile(
    path.join(repo, TEST_FILE),
    [
      `import { test, expect } from "${BUN_TEST}";`,
      `import { value } from "./${IMPL_FILE.replace(".ts", "")}";`,
      `test("feature value is 42", () => { expect(value).toBe(42); });`,
    ].join("\n") + "\n",
  );
  await git(repo, "add", TEST_FILE);
  await git(repo, "commit", "-m", "test-materialize(1): add feature.test.ts (impl absent → red)");
  mat1Oid = await git(repo, "rev-parse", "HEAD");

  // 4. impl1 commit: add feature-impl.ts so the test passes
  await fs.writeFile(path.join(repo, IMPL_FILE), "export const value = 42;\n");
  await git(repo, "add", IMPL_FILE);
  await git(repo, "commit", "-m", "implementer: add feature-impl.ts (test goes green)");
  impl1Oid = await git(repo, "rev-parse", "HEAD");

  // 5. mat2 commit: re-materialize feature.test.ts with a comment (changed content)
  //    This is the second test-materialize run. impl1 predates it → RE-RUN SHAPE.
  await fs.writeFile(
    path.join(repo, TEST_FILE),
    [
      `import { test, expect } from "${BUN_TEST}";`,
      `// TC-001: Evidence Base test (re-materialize with comment)`,
      `import { value } from "./${IMPL_FILE.replace(".ts", "")}";`,
      `test("feature value is 42", () => { expect(value).toBe(42); });`,
    ].join("\n") + "\n",
  );
  await git(repo, "add", TEST_FILE);
  await git(repo, "commit", "-m", "test-materialize(2): re-materialize feature.test.ts (re-run shape)");
  mat2Oid = await git(repo, "rev-parse", "HEAD");

  // node_modules dir for scopedTestCommand's symlink (bun:test builtin + local import only)
  await fs.mkdir(path.join(repo, "node_modules"), { recursive: true });
}, 60_000);

afterAll(async () => {
  await fs.rm(repo, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReRunState(): JobState {
  const makeStepRun = (commitOid: string, startedAt: string): StepRun => ({
    attempt: 1,
    sessionId: null,
    outcome: { verdict: "success", findingsPath: null, error: null },
    startedAt,
    endedAt: startedAt,
    commitOid,
  } as StepRun & { commitOid: string });

  return {
    version: 2,
    jobId: "eb-e2e-rerun-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/example/request.md",
      title: "Feature",
      type: "bug-fix",
      slug: "example",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "bite-evidence",
    status: "running",
    branch: "main",
    history: [],
    error: null,
    synthesizedCommits: [bootstrapOid],  // Evidence Base anchor
    steps: {
      // test-materialize: two runs; mat2 is latest (T3)
      "test-materialize": [
        makeStepRun(mat1Oid, "2026-01-01T00:01:00.000Z"),   // mat1 at T1
        makeStepRun(mat2Oid, "2026-01-01T00:03:00.000Z"),   // mat2 at T3 = LATEST
      ],
      // implementer: ran at T2 which is BEFORE mat2 (T3) → RE-RUN SHAPE
      "implementer": [
        makeStepRun(impl1Oid, "2026-01-01T00:02:00.000Z"),  // impl1 at T2 < T3
      ],
    },
  } as unknown as JobState;
}

// ---------------------------------------------------------------------------
// TC-001: Re-run shape earns assurance instead of deferring
// ---------------------------------------------------------------------------

describe("TC-001: Re-run shape earns assurance instead of deferring", () => {
  it(
    "TC-001: re-run shape gate returns passed (Evidence Base: base-red at job-start tree, HEAD-green)",
    async () => {
      const state = makeReRunState();
      const runtime = makeLocal(repo);

      const result = await runBiteEvidenceGate({
        state,
        cwd: repo,
        slug: "example",
        config: SCOPED_CONFIG,
        runtimeStrategy: runtime,
        tamperStatus: "inconclusive",
      });

      // THEN: verdict is passed — the re-run shape earns assurance via Evidence Base
      // (old code: strategy-deferred because impl1 predates mat2)
      expect(result.verdict).toBe("passed");
      expect(result.records).toHaveLength(1);

      const record = result.records[0]!;
      expect(record.testId).toBe(TEST_FILE);
      expect(record.strategy).toBe("forward");
      // Evidence Base (job base = init tree + test overlay) runs RED (impl absent)
      expect(record.baseResult).toBe("red");
      // HEAD (mat2 which has impl1's impl) runs GREEN
      expect(record.candidateResult).toBe("green");
      expect(record.verified).toBe(true);
    },
    180_000,
  );
});
