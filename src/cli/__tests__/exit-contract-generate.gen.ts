/**
 * Fixture generator for cli-exit-contract.test.ts (standalone).
 *
 * This file is deliberately NOT named `*.test.ts`, so `bun run test` never
 * discovers it and the normal suite can never overwrite the base fixture.
 * It is only picked up by the dedicated config vitest.exit-contract.config.ts:
 *
 *   bun run exit-contract:generate
 *
 * Run it on a tree whose production files (src/cli/**, bin/specrunner.ts)
 * match the base commit the contract is meant to pin.  It writes:
 *   - fixtures/cli-exit-contract.base.json         (expected snapshots)
 *   - fixtures/cli-exit-contract.base.provenance.json
 *       { baseCommit, generatedAt, productionDirtyFiles }
 * where productionDirtyFiles lists uncommitted changes under the production
 * paths at generation time (must be empty for a trustworthy fixture).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EXIT_CONTRACT_CASES } from "./exit-contract-cases.js";
import { runCase } from "./exit-contract-harness.js";
import { resetMockDefaults, applySetup } from "./exit-contract-setup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const OUTPUT_FILE = path.join(FIXTURES_DIR, "cli-exit-contract.base.json");
const PROVENANCE_FILE = path.join(FIXTURES_DIR, "cli-exit-contract.base.provenance.json");

// ---------------------------------------------------------------------------
// Mock declarations — keep in sync with cli-exit-contract.test.ts
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
// Provenance helpers
// ---------------------------------------------------------------------------

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
}

function productionDirtyFiles(): string[] {
  const out = git([
    "status",
    "--porcelain",
    "--",
    "src/cli",
    "bin/specrunner.ts",
    ":!src/cli/__tests__",
  ]);
  return out === "" ? [] : out.split("\n").map((l) => l.slice(3));
}

// ---------------------------------------------------------------------------
// Generate fixture
// ---------------------------------------------------------------------------

// Collect results across separate it() blocks
const fixture: Record<string, unknown> = {};

describe("exit-contract-generate", () => {
  for (const caseDef of EXIT_CONTRACT_CASES) {
    it(caseDef.id, async () => {
      const result = await runCase(caseDef.argv, async () => {
        await resetMockDefaults();
        await applySetup(caseDef.setup);
      });
      fixture[caseDef.id] = result;
      console.log(`  ${caseDef.id}: exitCode=${result.exitCode}`);
    }, 30000);
  }

  // Write fixture + provenance after all cases run
  it("writes fixture and provenance files", () => {
    expect(Object.keys(fixture)).toHaveLength(EXIT_CONTRACT_CASES.length);

    if (!fs.existsSync(FIXTURES_DIR)) {
      fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    }
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fixture, null, 2) + "\n", "utf-8");

    const provenance = {
      baseCommit: git(["rev-parse", "HEAD"]),
      generatedAt: new Date().toISOString(),
      generator: "bun run exit-contract:generate",
      productionDirtyFiles: productionDirtyFiles(),
    };
    fs.writeFileSync(PROVENANCE_FILE, JSON.stringify(provenance, null, 2) + "\n", "utf-8");

    console.log(`\nFixture written to: ${OUTPUT_FILE}`);
    console.log(`Provenance: ${JSON.stringify(provenance)}`);
  });
});
