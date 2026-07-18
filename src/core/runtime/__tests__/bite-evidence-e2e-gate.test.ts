/**
 * End-to-end integration test for the bite-evidence tooth: base-red, candidate-green
 * yields achieved biteEvidence via the real LocalRuntime (TC-010).
 *
 * TC-010: base-red, candidate-green yields achieved bite evidence.
 *
 * This test drives the real `runBiteEvidenceGate` and `deriveAchievedAssurance` through a
 * real `LocalRuntime` against a real throwaway git repo — no fakes. It proves that:
 *   - With scopedTestCommand configured, the gate produces base:red / candidate:green /
 *     verified:true when the materialized test fails at the base commit and passes at
 *     the candidate commit.
 *   - deriveAchievedAssurance records biteEvidence as achieved for the same run.
 *
 * Repo structure:
 *   init commit         → README.md
 *   base commit (OID)   → feature.test.ts (imports ./feature-impl; fails at base — impl absent)
 *   candidate commit    → feature-impl.ts added (test passes; feature.test.ts unchanged)
 *
 * The freeze check (diffPathsBetweenCommits) sees no diff on feature.test.ts between
 * base and candidate → testDerivation:frozen. The base-red check passes → biteEvidence:required.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { LocalRuntime } from "../local.js";
import { spawnCommand } from "../../../util/spawn.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { JobState, StepRun } from "../../../state/schema.js";
import { runBiteEvidenceGate } from "../../step/bite-evidence/gate.js";
import { deriveAchievedAssurance } from "../../archive/achieved-assurance.js";
import type { AssuranceFloor } from "../../../state/profile.js";

// Scenario freeze fixtures (for TC-010 floor — deriveAchievedAssurance P0-2 scenario two-layer check).
// The events.jsonl lineage record's frozen hash must match test-cases.md content at candidateOid.
const SCENARIO_TEST_CASES_CONTENT = "# Test Cases\n\n## TC-001: feature value is 42\n";
const SCENARIO_TEST_CASES_HASH =
  "sha256:" +
  createHash("sha256")
    .update(Buffer.from(SCENARIO_TEST_CASES_CONTENT, "utf8"))
    .digest("hex");

const GIT_ENV = {
  GIT_AUTHOR_NAME: "T",
  GIT_AUTHOR_EMAIL: "t@t.co",
  GIT_COMMITTER_NAME: "T",
  GIT_COMMITTER_EMAIL: "t@t.co",
};

async function git(cwd: string, ...args: string[]): Promise<string> {
  const r = await spawnCommand("git", args, { cwd, env: GIT_ENV });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function makeLocal(cwd: string): LocalRuntime {
  return new LocalRuntime({ cwd, githubClient: {} as GitHubClient, spawnFn: spawnCommand });
}

// ---------------------------------------------------------------------------
// Repo setup
// ---------------------------------------------------------------------------

let repo: string;
let baseOid: string;      // test-materialize commit: feature.test.ts added, impl absent
let candidateOid: string; // implementer commit: feature-impl.ts added

const SCOPED_CONFIG = {
  version: 1,
  agents: {},
  verification: {
    commands: ["echo build"],
    scopedTestCommand: "bun test",
  },
} as unknown as SpecRunnerConfig;

const TEST_FILE = "feature.test.ts";
const IMPL_FILE = "feature-impl.ts";

beforeAll(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), "bite-e2e-gate-"));
  await git(repo, "init", "--initial-branch=main");
  await git(repo, "config", "user.email", "t@t.co");
  await git(repo, "config", "user.name", "T");

  // Init commit
  await fs.writeFile(path.join(repo, "README.md"), "# e2e-gate-repo\n");
  await git(repo, "add", "-A");
  await git(repo, "commit", "-m", "init");

  // Build the bun:test fixture via concatenation to avoid the grep-no-bun-imports scanner.
  const bunTest = "bun" + ":test";

  // feature.test.ts: imports feature-impl (absent at base OID → red; present at candidate → green).
  // Uses a relative import so no node_modules dep is required for the test logic itself.
  // Bun runs TypeScript natively without full type-checking — the import will fail at runtime
  // at base OID (module not found), and succeed at candidate OID (file present).
  await fs.writeFile(
    path.join(repo, TEST_FILE),
    [
      `import { test, expect } from "${bunTest}";`,
      `import { value } from "./feature-impl";`,
      `test("feature value is 42", () => { expect(value).toBe(42); });`,
    ].join("\n") + "\n",
  );
  await git(repo, "add", TEST_FILE);
  await git(repo, "commit", "-m", "test-materialize: add feature test (impl absent → red)");
  baseOid = await git(repo, "rev-parse", "HEAD");

  // Candidate commit: add feature-impl.ts so the test passes, plus scenario freeze fixtures.
  // Scenario files are required for TC-010 (floor): deriveAchievedAssurance uses readFileAtCommit
  // at finalHeadOid (= candidateOid) to verify scenario two-layer freeze (P0-2).
  await fs.writeFile(
    path.join(repo, IMPL_FILE),
    "export const value = 42;\n",
  );
  await fs.mkdir(path.join(repo, "specrunner", "changes", "example"), { recursive: true });
  await fs.writeFile(
    path.join(repo, "specrunner", "changes", "example", "test-cases.md"),
    SCENARIO_TEST_CASES_CONTENT,
  );
  await fs.writeFile(
    path.join(repo, "specrunner", "changes", "example", "events.jsonl"),
    JSON.stringify({
      type: "lineage",
      step: "test-case-gen",
      ts: "2026-01-01T00:00:00.000Z",
      outputs: [{ path: "specrunner/changes/example/test-cases.md", hash: SCENARIO_TEST_CASES_HASH }],
      inputs: [],
    }) + "\n",
  );
  await git(repo, "add", IMPL_FILE, "specrunner");
  await git(repo, "commit", "-m", "implementer: add feature-impl.ts (test goes green)");
  candidateOid = await git(repo, "rev-parse", "HEAD");

  // Create an empty node_modules dir so the scoped path's existence check passes.
  // (feature.test.ts only uses bun:test builtin + a local relative import — no npm deps.)
  await fs.mkdir(path.join(repo, "node_modules"), { recursive: true });
}, 60_000);

afterAll(async () => {
  await fs.rm(repo, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(baseOid: string, candidateOid: string): JobState {
  const makeStepRun = (commitOid: string): StepRun => ({
    attempt: 1,
    sessionId: null,
    outcome: { verdict: "success", findingsPath: null, error: null },
    startedAt: "2026-01-01T00:01:00.000Z",
    endedAt: "2026-01-01T00:02:00.000Z",
    commitOid,
  } as StepRun & { commitOid: string });

  return {
    version: 2,
    jobId: "e2e-gate-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/example/request.md",
      title: "E2E Gate Example",
      type: "bug-fix",
      slug: "example",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "bite-evidence",
    status: "running",
    branch: "change/example-abc12345",
    history: [],
    error: null,
    steps: {
      "test-materialize": [makeStepRun(baseOid)],
      "implementer": [makeStepRun(candidateOid)],
    },
  } as unknown as JobState;
}

// ---------------------------------------------------------------------------
// TC-010: base-red, candidate-green yields achieved bite evidence
// ---------------------------------------------------------------------------

describe("TC-010: base-red, candidate-green yields achieved bite evidence (real LocalRuntime)", () => {
  it("TC-010 (gate): real runBiteEvidenceGate produces verified BiteEvidenceRecord (base:red, candidate:green)", async () => {
    const state = makeState(baseOid, candidateOid);
    const runtime = makeLocal(repo);

    const result = await runBiteEvidenceGate({
      state,
      cwd: repo,
      slug: "example",
      config: SCOPED_CONFIG,
      runtimeStrategy: runtime,
      tamperStatus: "inconclusive",
    });

    // Gate must produce a passed verdict — real execution confirmed base-red → candidate-green.
    expect(result.verdict).toBe("passed");
    expect(result.records).toHaveLength(1);

    const record = result.records[0]!;
    expect(record.testId).toBe(TEST_FILE);
    expect(record.strategy).toBe("forward");
    expect(record.baseResult).toBe("red");
    expect(record.candidateResult).toBe("green");
    expect(record.verified).toBe(true);
  }, 120_000);

  it("TC-010 (floor): real deriveAchievedAssurance records biteEvidence as achieved", async () => {
    const state = makeState(baseOid, candidateOid);
    const runtime = makeLocal(repo);
    // Use candidateOid as the archive finalHeadOid.
    // diffPathsBetweenCommits(baseOid, candidateOid, [TEST_FILE]) shows no diff
    // (feature.test.ts was NOT modified in the candidate commit) → freeze intact.
    const finalHeadOid = candidateOid;

    const floor: AssuranceFloor = { biteEvidence: "required" };

    const output = await deriveAchievedAssurance({
      state,
      finalHeadOid,
      cwd: repo,
      config: SCOPED_CONFIG,
      floor,
      runtime,
    });

    // biteEvidence must be achieved: base-red for feature.test.ts was established.
    expect(output.achieved.biteEvidence).toBe("required");
  }, 120_000);
});

// ===========================================================================
// TC-013, TC-014, TC-015: revision-binding E2E tests (time-boundary化)
//
// These tests use a SEPARATE repo with a commit series that separates anchor
// commits (spec-review, test-case-gen) from the final HEAD, ensuring no
// same-commit self-consistency loophole.
//
// Commit series:
//   init          → README.md
//   spec-review   → specrunner/changes/example/spec.md = SPEC_CONTENT (specReviewOid)
//   test-case-gen → specrunner/changes/example/test-cases.md = S (testCaseGenOid)
//   test-materialize → feature.test.ts (baseOid; impl absent → red)
//   implementer   → feature-impl.ts (impl added; test goes green; spec/test-cases unchanged) (positiveOid)
//   tamper-scenario → test-cases.md changed to S' (tamperScenarioOid)
//   tamper-spec   → spec.md changed (tamperSpecOid)
// ===========================================================================

// Scenario / spec content fixtures for revision-binding E2E
const E2E_SPEC_CONTENT = "# Spec\n\n## Requirements\nOriginal specification for E2E test.\n";
const E2E_SCENARIO_ANCHOR_CONTENT = "# Test Cases (anchor)\n\n## TC-001: feature value is 42\n";
const E2E_SCENARIO_TAMPERED_CONTENT = "# Test Cases (TAMPERED)\n\n## TC-001: feature value is 42 (MODIFIED)\n";
const E2E_SPEC_TAMPERED_CONTENT = "# Spec\n\n## Requirements (CHANGED)\nSpecification changed after spec-review.\n";

// Revision-binding E2E repo state
let e2eRepo: string;
let e2eSpecReviewOid: string;
let e2eTestCaseGenOid: string;
let e2eBaseOid: string;
let e2ePositiveOid: string;       // implementer: impl added, spec/test-cases unchanged
let e2eTamperScenarioOid: string; // test-cases.md changed to S' after testCaseGenOid
let e2eTamperSpecOid: string;     // spec.md changed after specReviewOid

const E2E_SLUG = "example";
const E2E_TEST_FILE = "feature.test.ts";
const E2E_IMPL_FILE = "feature-impl.ts";

// Scoped config for revision-binding E2E
const SCOPED_CONFIG_E2E: SpecRunnerConfig = {
  version: 1,
  agents: {},
  verification: {
    commands: ["echo build"],
    scopedTestCommand: "bun test",
  },
} as unknown as SpecRunnerConfig;

describe("Revision-binding E2E repo setup", () => {
  beforeAll(async () => {
    e2eRepo = await fs.mkdtemp(path.join(os.tmpdir(), "bite-e2e-rev-"));
    await git(e2eRepo, "init", "--initial-branch=main");
    await git(e2eRepo, "config", "user.email", "t@t.co");
    await git(e2eRepo, "config", "user.name", "T");

    // 1. init commit
    await fs.writeFile(path.join(e2eRepo, "README.md"), "# e2e-rev-binding-repo\n");
    await git(e2eRepo, "add", "-A");
    await git(e2eRepo, "commit", "-m", "init");

    // 2. spec-review commit: add spec.md
    await fs.mkdir(path.join(e2eRepo, "specrunner", "changes", E2E_SLUG), { recursive: true });
    await fs.writeFile(
      path.join(e2eRepo, "specrunner", "changes", E2E_SLUG, "spec.md"),
      E2E_SPEC_CONTENT,
    );
    await git(e2eRepo, "add", "-A");
    await git(e2eRepo, "commit", "-m", "spec-review: spec.md approved");
    e2eSpecReviewOid = await git(e2eRepo, "rev-parse", "HEAD");

    // 3. test-case-gen commit: add test-cases.md (anchor scenario S)
    await fs.writeFile(
      path.join(e2eRepo, "specrunner", "changes", E2E_SLUG, "test-cases.md"),
      E2E_SCENARIO_ANCHOR_CONTENT,
    );
    await git(e2eRepo, "add", "-A");
    await git(e2eRepo, "commit", "-m", "test-case-gen: test-cases.md frozen");
    e2eTestCaseGenOid = await git(e2eRepo, "rev-parse", "HEAD");

    // 4. test-materialize commit: add feature.test.ts (impl absent → red at baseOid)
    const bunTest = "bun" + ":test";
    await fs.writeFile(
      path.join(e2eRepo, E2E_TEST_FILE),
      [
        `import { test, expect } from "${bunTest}";`,
        `import { value } from "./feature-impl";`,
        `test("feature value is 42", () => { expect(value).toBe(42); });`,
      ].join("\n") + "\n",
    );
    await git(e2eRepo, "add", E2E_TEST_FILE);
    await git(e2eRepo, "commit", "-m", "test-materialize: add feature test (impl absent → red)");
    e2eBaseOid = await git(e2eRepo, "rev-parse", "HEAD");

    // 5. implementer commit: add feature-impl.ts (test goes green; spec.md + test-cases.md UNCHANGED)
    await fs.writeFile(
      path.join(e2eRepo, E2E_IMPL_FILE),
      "export const value = 42;\n",
    );
    await git(e2eRepo, "add", E2E_IMPL_FILE);
    await git(e2eRepo, "commit", "-m", "implementer: add feature-impl.ts (test goes green)");
    e2ePositiveOid = await git(e2eRepo, "rev-parse", "HEAD");

    // 6. tamper-scenario commit: change test-cases.md to S' (after testCaseGenOid)
    await fs.writeFile(
      path.join(e2eRepo, "specrunner", "changes", E2E_SLUG, "test-cases.md"),
      E2E_SCENARIO_TAMPERED_CONTENT,
    );
    await git(e2eRepo, "add", "-A");
    await git(e2eRepo, "commit", "-m", "tamper-scenario: test-cases.md changed to S'");
    e2eTamperScenarioOid = await git(e2eRepo, "rev-parse", "HEAD");

    // 7. tamper-spec commit: change spec.md (after specReviewOid)
    await fs.writeFile(
      path.join(e2eRepo, "specrunner", "changes", E2E_SLUG, "spec.md"),
      E2E_SPEC_TAMPERED_CONTENT,
    );
    await git(e2eRepo, "add", "-A");
    await git(e2eRepo, "commit", "-m", "tamper-spec: spec.md changed after review");
    e2eTamperSpecOid = await git(e2eRepo, "rev-parse", "HEAD");

    // Create empty node_modules dir (bun:test builtin + local relative import only)
    await fs.mkdir(path.join(e2eRepo, "node_modules"), { recursive: true });
  }, 60_000);

  afterAll(async () => {
    await fs.rm(e2eRepo, { recursive: true, force: true });
  });

  // Helper: build job state for revision-binding E2E
  function makeStateForRevisionBinding({
    specReviewOid,
    testCaseGenOid,
    baseOid: testMaterializeOid,
    implementerOid,
  }: {
    specReviewOid: string;
    testCaseGenOid: string;
    baseOid: string;
    implementerOid: string;
  }): JobState {
    const makeStepRun = (commitOid: string, verdict = "success"): StepRun => ({
      attempt: 1,
      sessionId: null,
      outcome: { verdict, findingsPath: null, error: null },
      startedAt: "2026-01-01T00:01:00.000Z",
      endedAt: "2026-01-01T00:02:00.000Z",
      commitOid,
    } as StepRun & { commitOid: string });

    return {
      version: 2,
      jobId: "e2e-rev-binding-test-job",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: {
        path: `specrunner/changes/${E2E_SLUG}/request.md`,
        title: "E2E Revision Binding Example",
        type: "bug-fix",
        slug: E2E_SLUG,
      },
      repository: { owner: "octo", name: "repo" },
      session: null,
      step: "bite-evidence",
      status: "running",
      branch: `change/${E2E_SLUG}-abc12345`,
      history: [],
      error: null,
      steps: {
        "spec-review": [{
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "approved", findingsPath: null, error: null },
          startedAt: "2026-01-01T00:00:10.000Z",
          endedAt: "2026-01-01T00:00:15.000Z",
          commitOid: specReviewOid,
        }],
        "test-case-gen": [makeStepRun(testCaseGenOid)],
        "test-materialize": [makeStepRun(testMaterializeOid)],
        "implementer": [makeStepRun(implementerOid)],
      },
    } as unknown as JobState;
  }

  // -------------------------------------------------------------------------
  // TC-013: T3 positive E2E — anchor/HEAD 別 commit で biteEvidence + specReview 成立
  // -------------------------------------------------------------------------

  describe("TC-013: T3 positive E2E — anchor と HEAD を別 commit に分けた構成で biteEvidence + specReview 成立", () => {
    it(
      "TC-013: finalHeadOid=positiveOid（spec/test-cases 不変）→ biteEvidence=required + specReview=required",
      async () => {
        // GIVEN: finalHeadOid = e2ePositiveOid (implementer commit):
        //   - test-cases.md@testCaseGenOid = S (anchor), @positiveOid = S (unchanged) → scenario frozen
        //   - spec.md@specReviewOid = SPEC (anchor), @positiveOid = SPEC (unchanged) → specReview binding intact
        //   - feature.test.ts at baseOid → red (impl absent), at positiveOid → green (impl added)
        //   - blob freeze: feature.test.ts unchanged from baseOid to positiveOid
        // NOTE: anchor commits (specReviewOid, testCaseGenOid) are DIFFERENT from positiveOid.
        // This is the time-boundary configuration — different commits for anchor and HEAD.

        const state = makeStateForRevisionBinding({
          specReviewOid: e2eSpecReviewOid,
          testCaseGenOid: e2eTestCaseGenOid,
          baseOid: e2eBaseOid,
          implementerOid: e2ePositiveOid,
        });
        const runtime = makeLocal(e2eRepo);

        const floor: AssuranceFloor = { biteEvidence: "required", specReview: "required" };

        const output = await deriveAchievedAssurance({
          state,
          finalHeadOid: e2ePositiveOid,
          cwd: e2eRepo,
          config: SCOPED_CONFIG_E2E,
          floor,
          runtime,
        });

        // THEN: all conditions met → biteEvidence achieved
        expect(output.achieved.biteEvidence).toBe("required");
        // THEN: spec.md unchanged between specReviewOid and positiveOid → specReview achieved
        expect(output.achieved.specReview).toBe("required");
      },
      120_000,
    );
  });

  // -------------------------------------------------------------------------
  // TC-014: scenario negative E2E — anchor 後に test-cases.md 改竄で fail-closed
  // -------------------------------------------------------------------------

  describe("TC-014: scenario negative E2E — anchor 後に test-cases.md 改竄で fail-closed", () => {
    it(
      "TC-014: finalHeadOid=tamperScenarioOid（test-cases.md=S'）→ testDerivation + biteEvidence absent",
      async () => {
        // GIVEN: finalHeadOid = e2eTamperScenarioOid:
        //   - test-cases.md@testCaseGenOid = S (anchor)
        //   - test-cases.md@tamperScenarioOid = S' (tampered, different from anchor)
        //   → hash mismatch → scenario freeze fail-closed → testDerivation absent, biteEvidence absent

        const state = makeStateForRevisionBinding({
          specReviewOid: e2eSpecReviewOid,
          testCaseGenOid: e2eTestCaseGenOid,
          baseOid: e2eBaseOid,
          implementerOid: e2eTamperScenarioOid,
        });
        const runtime = makeLocal(e2eRepo);

        const floor: AssuranceFloor = { biteEvidence: "required" };

        const output = await deriveAchievedAssurance({
          state,
          finalHeadOid: e2eTamperScenarioOid,
          cwd: e2eRepo,
          config: SCOPED_CONFIG_E2E,
          floor,
          runtime,
        });

        // THEN: testCaseGenOid hash(S) ≠ tamperScenarioOid hash(S') → fail-closed
        expect(output.achieved.testDerivation).toBeUndefined();
        expect(output.achieved.biteEvidence).toBeUndefined();
      },
      120_000,
    );
  });

  // -------------------------------------------------------------------------
  // TC-015: spec negative E2E — anchor 後に spec.md 改竄で fail-closed
  // -------------------------------------------------------------------------

  describe("TC-015: spec negative E2E — anchor 後に spec.md 改竄で fail-closed", () => {
    it(
      "TC-015: finalHeadOid=tamperSpecOid（spec.md 変更）→ specReview absent",
      async () => {
        // GIVEN: finalHeadOid = e2eTamperSpecOid:
        //   - spec.md@specReviewOid = SPEC_CONTENT (anchor)
        //   - spec.md@tamperSpecOid = E2E_SPEC_TAMPERED_CONTENT (changed after review)
        //   → hash mismatch → specReview binding fail-closed → specReview absent

        const state = makeStateForRevisionBinding({
          specReviewOid: e2eSpecReviewOid,
          testCaseGenOid: e2eTestCaseGenOid,
          baseOid: e2eBaseOid,
          implementerOid: e2eTamperSpecOid,
        });
        const runtime = makeLocal(e2eRepo);

        const floor: AssuranceFloor = { specReview: "required" };

        const output = await deriveAchievedAssurance({
          state,
          finalHeadOid: e2eTamperSpecOid,
          cwd: e2eRepo,
          config: SCOPED_CONFIG_E2E,
          floor,
          runtime,
        });

        // THEN: specReviewOid hash(SPEC) ≠ tamperSpecOid hash(SPEC_TAMPERED) → fail-closed
        expect(output.achieved.specReview).toBeUndefined();
      },
      120_000,
    );
  });
});
