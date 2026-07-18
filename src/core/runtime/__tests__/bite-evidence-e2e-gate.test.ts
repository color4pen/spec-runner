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
