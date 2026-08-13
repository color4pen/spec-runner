/**
 * Integration tests for runVerification() — test-generation type-gate exemption.
 *
 * TC-008: 免除 type で changed-line coverage gate が明示 skip される
 * TC-009: 非免除 type では changed-line coverage gate が従来通り実行される
 * TC-010: chore でも verification の command 実行が走る
 * TC-013: requestType 未指定のとき coverage gate は従来通り実行される（fail-closed）
 * TC-014: build 失敗時でも coverage の skip 理由は免除 type 由来が明示される
 *
 * Source: spec.md > Requirement: 免除 type では changed-line coverage gate を明示 skip する
 *         spec.md > Requirement: 免除 type でも既存テスト実行は維持される
 *         design.md > D4, tasks.md > T-04, T-05
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runVerification } from "../../../src/core/verification/runner.js";
import { CHANGED_LINE_COVERAGE_PHASE } from "../../../src/core/verification/changed-line-coverage.js";

const TEST_SLUG = "test-slug-exemption";

/** Minimal CoverageConfig that satisfies the schema (command will exit non-zero in tmpDir). */
const DUMMY_COVERAGE_CONFIG = {
  command: "false" as string,  // always fails — coverage command run is the signal, not its result
  lcovPath: "coverage/lcov.info",
  include: ["src/**"] as string[],
};

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-test-gen-exemption-"));
  await fs.mkdir(path.join(tmpDir, "specrunner", "changes", TEST_SLUG), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-008: 免除 type で changed-line coverage gate が明示 skip される
// Source: spec.md > Scenario: 免除 type で coverage gate が明示 skip される
// ---------------------------------------------------------------------------
describe("TC-008: exempt type (chore) + coverage configured → coverage phase is skipped with exempt reason", () => {
  it(
    "TC-008: changed-line-coverage phase is skipped with 'test-generation-exempt request type: chore' in stdout",
    async () => {
      const result = await runVerification(
        TEST_SLUG,
        tmpDir,
        { commands: ["true"], coverage: DUMMY_COVERAGE_CONFIG },
        undefined,   // baseBranch
        "chore",     // requestType (new 5th arg)
      );

      const coveragePhase = result.phases.find((p) => p.phase === CHANGED_LINE_COVERAGE_PHASE);
      expect(coveragePhase, "changed-line-coverage phase must be present").toBeDefined();
      expect(coveragePhase?.status).toBe("skipped");
      expect(coveragePhase?.stdout).toContain("test-generation-exempt request type: chore");
    },
  );

  it("TC-008: skipped coverage phase does not make the verdict fail (all commands pass → verdict passed)", async () => {
    const result = await runVerification(
      TEST_SLUG,
      tmpDir,
      { commands: ["true"], coverage: DUMMY_COVERAGE_CONFIG },
      undefined,
      "chore",
    );

    expect(result.verdict).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// TC-009: 非免除 type では changed-line coverage gate が従来通り実行される
// Source: spec.md > Scenario: 非免除 type では coverage gate が従来通り走る
// ---------------------------------------------------------------------------
describe("TC-009: non-exempt type (bug-fix) + coverage configured → coverage gate runs normally", () => {
  it(
    "TC-009: changed-line-coverage phase is present and does NOT have test-generation-exempt skip reason",
    async () => {
      const result = await runVerification(
        TEST_SLUG,
        tmpDir,
        { commands: ["true"], coverage: DUMMY_COVERAGE_CONFIG },
        undefined,
        "bug-fix",
      );

      const coveragePhase = result.phases.find((p) => p.phase === CHANGED_LINE_COVERAGE_PHASE);
      // Gate runs: phase present (though it may be failed since coverage command is "false")
      expect(coveragePhase, "changed-line-coverage phase must be present when gate runs").toBeDefined();
      // Must NOT be skipped with the exempt reason
      expect(coveragePhase?.stdout ?? "").not.toContain("test-generation-exempt");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-010: chore でも verification の command 実行が走る
// Source: spec.md > Requirement: 免除 type でも既存テスト実行は維持される
//         spec.md > Scenario: chore でも verification の command 実行が走る
// ---------------------------------------------------------------------------
describe("TC-010: exempt type (chore) — verification commands still execute", () => {
  it("TC-010: commands are executed and appear in result phases for chore", async () => {
    const result = await runVerification(
      TEST_SLUG,
      tmpDir,
      { commands: ["true", { name: "typecheck", run: "true" }] },
      undefined,
      "chore",
    );

    // Both commands should have run
    expect(result.phases.length).toBeGreaterThanOrEqual(2);
    // First command phase
    expect(result.phases[0]?.status).toBe("passed");
    // Second command phase (named "typecheck")
    const typecheckPhase = result.phases.find((p) => p.phase === "typecheck");
    expect(typecheckPhase).toBeDefined();
    expect(typecheckPhase?.status).toBe("passed");
  });

  it("TC-010: verdict is passed when all commands pass for chore (test suite ran)", async () => {
    const result = await runVerification(
      TEST_SLUG,
      tmpDir,
      {
        commands: [
          { name: "build", run: "true" },
          { name: "typecheck", run: "true" },
          { name: "test", run: "true" },
        ],
      },
      undefined,
      "chore",
    );

    expect(result.verdict).toBe("passed");
    // All three phases ran
    const phaseNames = result.phases.map((p) => p.phase);
    expect(phaseNames).toContain("build");
    expect(phaseNames).toContain("typecheck");
    expect(phaseNames).toContain("test");
    for (const p of result.phases) {
      expect(p.status).toBe("passed");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-013: requestType 未指定のとき coverage gate は従来通り実行される（fail-closed）
// Source: design.md > D4, tasks.md > T-04
// ---------------------------------------------------------------------------
describe("TC-013: requestType omitted → fail-closed, coverage gate runs normally", () => {
  it("TC-013: changed-line-coverage phase present and NOT exempt-skipped when requestType is absent", async () => {
    // No requestType arg — legacy call signature
    const result = await runVerification(
      TEST_SLUG,
      tmpDir,
      { commands: ["true"], coverage: DUMMY_COVERAGE_CONFIG },
      // baseBranch: undefined (omitted)
      // requestType: undefined (omitted — fail-closed)
    );

    const coveragePhase = result.phases.find((p) => p.phase === CHANGED_LINE_COVERAGE_PHASE);
    expect(coveragePhase, "changed-line-coverage phase must be present (gate ran)").toBeDefined();
    expect(coveragePhase?.stdout ?? "").not.toContain("test-generation-exempt");
  });
});

// ---------------------------------------------------------------------------
// TC-014: build 失敗時でも coverage の skip 理由は免除 type 由来が明示される
// Source: design.md > D4, tasks.md > T-05
// ---------------------------------------------------------------------------
describe("TC-014: exempt type + build failure → coverage skip reason is exempt (not 'previous command failed')", () => {
  it(
    "TC-014: even when build command fails, coverage phase skip says 'test-generation-exempt request type: chore'",
    async () => {
      const result = await runVerification(
        TEST_SLUG,
        tmpDir,
        {
          commands: ["false"],   // build fails
          coverage: DUMMY_COVERAGE_CONFIG,
        },
        undefined,
        "chore",
      );

      const coveragePhase = result.phases.find((p) => p.phase === CHANGED_LINE_COVERAGE_PHASE);
      expect(coveragePhase, "changed-line-coverage phase must be present").toBeDefined();
      expect(coveragePhase?.status).toBe("skipped");

      // Exempt reason must appear (exempt check fires BEFORE failed check)
      expect(coveragePhase?.stdout).toContain("test-generation-exempt request type: chore");
      // Must NOT say "previous command failed" — exempt check takes precedence
      expect(coveragePhase?.stdout).not.toContain("previous command failed");
    },
  );
});
