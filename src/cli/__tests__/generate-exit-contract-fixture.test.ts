/**
 * Fixture generator for cli-exit-contract.test.ts.
 *
 * Run this with:
 *   bun run test -- src/cli/__tests__/generate-exit-contract-fixture.test.ts
 *
 * It runs all 23 exit contract cases and writes the results to
 * src/cli/__tests__/fixtures/cli-exit-contract.base.json.
 *
 * This file is NOT part of the normal test suite — it is only run to
 * regenerate the fixture after intentional changes.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_CONTRACT_CASES } from "./exit-contract-cases.js";
import type { SetupKind } from "./exit-contract-cases.js";
import { runCase } from "./exit-contract-harness.js";
// NOTE: SpecRunnerError is NOT imported statically — see applySetup for reason

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const OUTPUT_FILE = path.join(FIXTURES_DIR, "cli-exit-contract.base.json");

// ---------------------------------------------------------------------------
// Mock declarations (same as cli-exit-contract.test.ts)
// ---------------------------------------------------------------------------

vi.mock("../archive.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../archive.js")>();
  return {
    ...actual,
    runArchive: vi.fn().mockResolvedValue(0),
  };
});

vi.mock("../archive-from-issue.js", () => ({
  runArchiveFromIssue: vi.fn().mockResolvedValue(0),
}));

vi.mock("../../core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
}));

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

vi.mock("../run.js", () => ({
  runRunCore: vi.fn().mockResolvedValue(0),
  handlePostPipelineState: vi.fn(),
  handleJobStart: vi.fn().mockResolvedValue(0),
}));

vi.mock("../resume.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../resume.js")>();
  return {
    ...actual,
    runResumeCore: vi.fn().mockResolvedValue(0),
  };
});

vi.mock("../resume-from-issue.js", () => ({
  runResumeFromIssue: vi.fn().mockResolvedValue(0),
}));

vi.mock("../init.js", () => ({ runInit: vi.fn().mockResolvedValue(0), handleInit: vi.fn().mockResolvedValue(0) }));
vi.mock("../login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0), handleLogin: vi.fn().mockResolvedValue(0) }));
vi.mock("../doctor.js", () => ({
  runDoctor: vi.fn().mockResolvedValue(0),
  handleDoctor: vi.fn().mockResolvedValue(0),
  handleDoctorRepair: vi.fn().mockResolvedValue(0),
  buildExecFile: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Apply setup (same as cli-exit-contract.test.ts)
// ---------------------------------------------------------------------------

async function applySetup(setup: SetupKind): Promise<void> {
  if (setup.kind === "none") return;

  if (setup.kind === "archive-resolve") {
    const { runArchive } = await import("../archive.js");
    vi.mocked(runArchive).mockResolvedValue(setup.value);
    return;
  }

  if (setup.kind === "archive-reject-specrunner-error") {
    const { runArchive } = await import("../archive.js");
    // Dynamic import before specrunner loads ensures same class instance for instanceof
    const { SpecRunnerError } = await import("../../errors.js");
    const err = new SpecRunnerError(setup.code, setup.hint, setup.message, setup.exitCode as 1 | 2);
    vi.mocked(runArchive).mockRejectedValue(err);
    return;
  }

  if (setup.kind === "archive-reject-plain") {
    const { runArchive } = await import("../archive.js");
    vi.mocked(runArchive).mockRejectedValue(new Error(setup.message));
    return;
  }

  if (setup.kind === "worktree") {
    const { detectWorktree } = await import("../../core/worktree/detection.js");
    vi.mocked(detectWorktree).mockResolvedValue({
      isWorktree: true,
      mainWorktreePath: setup.mainWorktreePath,
    });
    return;
  }

  if (setup.kind === "no-repo") {
    const { buildCommandContext } = await import("../command-context.js");
    vi.mocked(buildCommandContext).mockResolvedValue({
      repoRoot: null,
      invokerCwd: "/tmp/not-a-repo",
    });
    return;
  }
}

// ---------------------------------------------------------------------------
// Generate fixture
// ---------------------------------------------------------------------------

// Collect results across separate it() blocks
const fixture: Record<string, unknown> = {};

describe("generate-exit-contract-fixture", () => {
  for (const caseDef of EXIT_CONTRACT_CASES) {
    it(caseDef.id, async () => {
      const result = await runCase(caseDef.argv, async () => {
        await applySetup(caseDef.setup);
      });
      fixture[caseDef.id] = result;
      console.log(`  ${caseDef.id}: exitCode=${result.exitCode}`);
    }, 30000);
  }

  // Write fixture after all cases run
  it("writes fixture file", () => {
    if (!fs.existsSync(FIXTURES_DIR)) {
      fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    }
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fixture, null, 2) + "\n", "utf-8");
    console.log(`\nFixture written to: ${OUTPUT_FILE}`);
    // Verify all cases are present
    expect(Object.keys(fixture)).toHaveLength(EXIT_CONTRACT_CASES.length);
  });
});
