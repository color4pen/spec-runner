/**
 * Unit tests for reloadCoverageConfig (T-04).
 *
 * TC-RCC-01: project-local config with coverage.exclude → applied: true, coverage with exclude
 * TC-RCC-02: disk config exclude updated → re-call reflects updated exclude
 * TC-RCC-03: .specrunner/config.json absent → applied: false
 * TC-RCC-04: JSON invalid → does not throw, returns applied: false
 * TC-RCC-05: validation error (bad schema) → does not throw, returns applied: false
 * TC-RCC-06: coverage not declared in config → applied: true, coverage: undefined
 * TC-RCC-07: resolveRepoRoot returns null (not a git repo) → applied: false
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Mock resolveRepoRoot and loadConfig before importing the module under test.
vi.mock("../../../../src/util/repo-root.js", () => ({
  resolveRepoRoot: vi.fn(),
}));

vi.mock("../../../../src/config/store.js", () => ({
  loadConfig: vi.fn(),
}));

import { resolveRepoRoot } from "../../../../src/util/repo-root.js";
import { loadConfig } from "../../../../src/config/store.js";
import { reloadCoverageConfig } from "../../../../src/core/verification/reload-coverage-config.js";

const MOCK_CWD = "/fake/cwd";

/** Minimal valid SpecRunnerConfig shape for test purposes. */
function makeConfig(coverageOverride?: unknown) {
  return {
    version: 1 as const,
    agents: {},
    environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    verification: coverageOverride !== undefined
      ? { coverage: coverageOverride }
      : undefined,
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "reload-coverage-test-"));
  vi.clearAllMocks();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TC-RCC-01: config with coverage.exclude → applied: true, coverage with exclude
// ---------------------------------------------------------------------------

describe("TC-RCC-01: project-local config with coverage.exclude → applied: true, coverage with exclude", () => {
  it("returns applied: true and coverage including exclude globs", async () => {
    // Set up a fake .specrunner/config.json in tmpDir.
    const specrunnerDir = path.join(tmpDir, ".specrunner");
    await fs.mkdir(specrunnerDir, { recursive: true });
    await fs.writeFile(
      path.join(specrunnerDir, "config.json"),
      JSON.stringify({ version: 1 }),
      "utf-8",
    );

    const expectedCoverage = {
      command: "bun run test --coverage",
      lcovPath: "coverage/lcov.info",
      include: ["src/**"],
      exclude: ["src/types.ts"],
    };

    vi.mocked(resolveRepoRoot).mockResolvedValue(tmpDir);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(loadConfig).mockResolvedValue(makeConfig(expectedCoverage) as any);

    const result = await reloadCoverageConfig(MOCK_CWD);

    expect(result.applied).toBe(true);
    expect(result.coverage).toEqual(expectedCoverage);
    expect(result.coverage?.exclude).toContain("src/types.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-RCC-02: disk config exclude updated → re-call reflects updated exclude
// ---------------------------------------------------------------------------

describe("TC-RCC-02: disk config exclude updated → re-call reflects updated exclude", () => {
  it("second call after mock update reflects new exclude", async () => {
    const specrunnerDir = path.join(tmpDir, ".specrunner");
    await fs.mkdir(specrunnerDir, { recursive: true });
    await fs.writeFile(
      path.join(specrunnerDir, "config.json"),
      JSON.stringify({ version: 1 }),
      "utf-8",
    );

    vi.mocked(resolveRepoRoot).mockResolvedValue(tmpDir);

    const coverageV1 = {
      command: "bun run test --coverage",
      lcovPath: "coverage/lcov.info",
      include: ["src/**"],
    };
    const coverageV2 = {
      ...coverageV1,
      exclude: ["src/types.ts"],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(loadConfig).mockResolvedValueOnce(makeConfig(coverageV1) as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(loadConfig).mockResolvedValueOnce(makeConfig(coverageV2) as any);

    const first = await reloadCoverageConfig(MOCK_CWD);
    const second = await reloadCoverageConfig(MOCK_CWD);

    expect(first.applied).toBe(true);
    expect(first.coverage?.exclude).toBeUndefined();

    expect(second.applied).toBe(true);
    expect(second.coverage?.exclude).toContain("src/types.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-RCC-03: .specrunner/config.json absent → applied: false
// ---------------------------------------------------------------------------

describe("TC-RCC-03: .specrunner/config.json absent → applied: false", () => {
  it("returns applied: false when no project-local config file exists", async () => {
    // tmpDir exists but has no .specrunner/config.json.
    vi.mocked(resolveRepoRoot).mockResolvedValue(tmpDir);

    const result = await reloadCoverageConfig(MOCK_CWD);

    expect(result.applied).toBe(false);
    expect(loadConfig).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-RCC-04: JSON invalid → does not throw, returns applied: false
// ---------------------------------------------------------------------------

describe("TC-RCC-04: JSON invalid → does not throw, returns applied: false", () => {
  it("returns applied: false when loadConfig throws a parse error", async () => {
    const specrunnerDir = path.join(tmpDir, ".specrunner");
    await fs.mkdir(specrunnerDir, { recursive: true });
    await fs.writeFile(
      path.join(specrunnerDir, "config.json"),
      "{ invalid json !!!",
      "utf-8",
    );

    vi.mocked(resolveRepoRoot).mockResolvedValue(tmpDir);
    vi.mocked(loadConfig).mockRejectedValue(new Error("JSON parse error"));

    // Must not throw.
    const result = await reloadCoverageConfig(MOCK_CWD);

    expect(result.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-RCC-05: validation error → does not throw, returns applied: false
// ---------------------------------------------------------------------------

describe("TC-RCC-05: validation error (bad schema) → does not throw, returns applied: false", () => {
  it("returns applied: false when loadConfig throws a validation error", async () => {
    const specrunnerDir = path.join(tmpDir, ".specrunner");
    await fs.mkdir(specrunnerDir, { recursive: true });
    await fs.writeFile(
      path.join(specrunnerDir, "config.json"),
      JSON.stringify({ version: 1, badField: true }),
      "utf-8",
    );

    vi.mocked(resolveRepoRoot).mockResolvedValue(tmpDir);
    vi.mocked(loadConfig).mockRejectedValue(
      Object.assign(new Error("Config validation failed"), { code: "CONFIG_INVALID" }),
    );

    const result = await reloadCoverageConfig(MOCK_CWD);

    expect(result.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-RCC-06: coverage not declared → applied: true, coverage: undefined
// ---------------------------------------------------------------------------

describe("TC-RCC-06: coverage not declared in config → applied: true, coverage: undefined", () => {
  it("returns applied: true with coverage undefined when config has no verification.coverage", async () => {
    const specrunnerDir = path.join(tmpDir, ".specrunner");
    await fs.mkdir(specrunnerDir, { recursive: true });
    await fs.writeFile(
      path.join(specrunnerDir, "config.json"),
      JSON.stringify({ version: 1 }),
      "utf-8",
    );

    vi.mocked(resolveRepoRoot).mockResolvedValue(tmpDir);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);

    const result = await reloadCoverageConfig(MOCK_CWD);

    expect(result.applied).toBe(true);
    expect(result.coverage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-RCC-07: resolveRepoRoot returns null → applied: false
// ---------------------------------------------------------------------------

describe("TC-RCC-07: resolveRepoRoot returns null (not a git repo) → applied: false", () => {
  it("returns applied: false when not inside a git repository", async () => {
    vi.mocked(resolveRepoRoot).mockResolvedValue(null);

    const result = await reloadCoverageConfig(MOCK_CWD);

    expect(result.applied).toBe(false);
    expect(loadConfig).not.toHaveBeenCalled();
  });
});
