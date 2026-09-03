/**
 * Exit contract snapshot tests (T-01).
 *
 * Compares the actual exit code, stdout, and stderr of bin/specrunner.ts
 * for 23 canonical cases against the base fixture captured from the base
 * commit (see fixtures/cli-exit-contract.base.provenance.json).  Any
 * unintentional shift in exit codes or output messages fails here.
 *
 * The fixture is read-only for this suite: its content hash is compared
 * before and after the run so no test can silently rewrite the expected
 * values.  To regenerate it after an INTENTIONAL contract change (standalone
 * command, never part of `bun run test`):
 *   bun run exit-contract:generate
 */

import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { EXIT_CONTRACT_CASES } from "./exit-contract-cases.js";
import { runCase } from "./exit-contract-harness.js";
import { resetMockDefaults, applySetup } from "./exit-contract-setup.js";
import baseFixture from "./fixtures/cli-exit-contract.base.json";
// NOTE: SpecRunnerError is NOT imported statically here because vi.resetModules()
// clears the module cache between tests, causing instanceof to fail when specrunner.ts
// loads a fresh errors.js after reset. exit-contract-setup.ts uses a dynamic import
// instead, so errors.js is cached before specrunner.ts loads it.

// ---------------------------------------------------------------------------
// Mock declarations (hoisted by vitest) — keep in sync with
// exit-contract-generate.gen.ts.  Defaults are re-applied per case by
// resetMockDefaults(); the values here only matter for module shape.
// ---------------------------------------------------------------------------

// archive.js — spread actual so non-mocked exports work; swap out runArchive
vi.mock("../archive.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../archive.js")>();
  return {
    ...actual,
    runArchive: vi.fn().mockResolvedValue(0),
  };
});

// archive-from-issue.js — stub to prevent side effects
vi.mock("../archive-from-issue.js", () => ({
  runArchiveFromIssue: vi.fn().mockResolvedValue(0),
}));

// detection.js — default: not a worktree
vi.mock("../../core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
}));

// command-context.js — default: repo root is cwd
vi.mock("../command-context.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../command-context.js")>();
  return {
    ...actual,
    buildCommandContext: vi.fn().mockResolvedValue({
      repoRoot: process.cwd(),
      invokerCwd: process.cwd(),
    }),
  };
});

// run.js — stub to prevent side effects (job start)
vi.mock("../run.js", () => ({
  runRunCore: vi.fn().mockResolvedValue(0),
  handlePostPipelineState: vi.fn(),
  handleJobStart: vi.fn().mockResolvedValue(0),
}));

// resume.js — stub to prevent side effects (job resume)
vi.mock("../resume.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../resume.js")>();
  return {
    ...actual,
    runResumeCore: vi.fn().mockResolvedValue(0),
  };
});

// resume-from-issue.js — stub to prevent side effects
vi.mock("../resume-from-issue.js", () => ({
  runResumeFromIssue: vi.fn().mockResolvedValue(0),
}));

// Stub modules that make network / fs calls
vi.mock("../init.js", () => ({ runInit: vi.fn().mockResolvedValue(0), handleInit: vi.fn().mockResolvedValue(0) }));
vi.mock("../login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0), handleLogin: vi.fn().mockResolvedValue(0) }));
vi.mock("../doctor.js", () => ({
  runDoctor: vi.fn().mockResolvedValue(0),
  handleDoctor: vi.fn().mockResolvedValue(0),
  handleDoctorRepair: vi.fn().mockResolvedValue(0),
  buildExecFile: vi.fn(),
}));

// ---------------------------------------------------------------------------
// After each: restore module cache so each case gets a fresh specrunner import
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Fixture read-only guard: this suite must never modify the base fixture
// ---------------------------------------------------------------------------

const FIXTURE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "cli-exit-contract.base.json",
);

function fixtureHash(): string {
  return createHash("sha256").update(fs.readFileSync(FIXTURE_FILE)).digest("hex");
}

let fixtureHashBefore = "";

beforeAll(() => {
  fixtureHashBefore = fixtureHash();
});

afterAll(() => {
  if (fixtureHash() !== fixtureHashBefore) {
    throw new Error(
      "cli-exit-contract.base.json was modified during the test run — the fixture is read-only for this suite",
    );
  }
});

// ---------------------------------------------------------------------------
// Fixture completeness guard
// ---------------------------------------------------------------------------

const EXPECTED_IDS = EXIT_CONTRACT_CASES.map((c) => c.id);

describe("cli-exit-contract fixture completeness", () => {
  it("fixture key set matches expected case ID list exactly", () => {
    const fixtureKeys = Object.keys(baseFixture).sort();
    const expectedKeys = [...EXPECTED_IDS].sort();
    expect(fixtureKeys).toEqual(expectedKeys);
  });
});

// ---------------------------------------------------------------------------
// Snapshot tests — one per case
// ---------------------------------------------------------------------------

describe("cli-exit-contract: exit code and output snapshot", () => {
  for (const caseDef of EXIT_CONTRACT_CASES) {
    it(caseDef.id, async () => {
      const expected = (baseFixture as Record<string, { exitCode: number | null; stdout: string[]; stderr: string[] }>)[caseDef.id];
      expect(expected).toBeDefined();

      const result = await runCase(caseDef.argv, async () => {
        await resetMockDefaults();
        await applySetup(caseDef.setup);
      });

      expect(result).toEqual(expected);
    });
  }
});
