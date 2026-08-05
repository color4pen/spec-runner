/**
 * Unit tests for showUsage — invocation metrics display.
 *
 * TC-008: metrics 付きエントリで metrics を表示する
 * TC-009: metrics 非保持エントリでも例外なく出力する
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { showUsage } from "../../../../src/core/command/usage-show.js";

let tmpDir: string;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "usage-show-metrics-test-"));
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const TEST_SLUG = "metrics-show-test-slug";

/**
 * Create the usage.json directory structure and write the file.
 * showUsage looks for: <cwd>/specrunner/changes/<slug>/usage.json
 */
async function writeUsageJson(content: object): Promise<void> {
  const usageDir = path.join(tmpDir, "specrunner", "changes", TEST_SLUG);
  await fs.mkdir(usageDir, { recursive: true });
  const usagePath = path.join(usageDir, "usage.json");
  await fs.writeFile(usagePath, JSON.stringify(content), "utf-8");
}

/** Get all stdout output captured by the spy. */
function getCapturedOutput(): string {
  return stdoutSpy.mock.calls
    .map((call: unknown[]) => (typeof call[0] === "string" ? call[0] : ""))
    .join("");
}

// ---------------------------------------------------------------------------
// TC-008: metrics 付きエントリで metrics を表示する
// ---------------------------------------------------------------------------

describe("TC-008: metrics 付きエントリで metrics を表示する", () => {
  it("includes turn count, duration, and cost in output for a metrics-bearing invocation", async () => {
    await writeUsageJson({
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T10:00:00.000Z",
          modelUsage: {
            "claude-sonnet-4-6": {
              inputTokens: 1000,
              outputTokens: 200,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
          jobId: "metrics-test-job-001",
          stepName: "implementer",
          // Metrics fields (will be read by showUsage after implementation)
          numTurns: 6,
          durationMs: 14000,
          durationApiMs: 11000,
          totalCostUsd: 0.052,
        },
      ],
    });

    const exitCode = await showUsage(TEST_SLUG, tmpDir);
    expect(exitCode).toBe(0);

    const output = getCapturedOutput();

    // TC-008: The output must include turn count, duration, and cost
    // These assertions will FAIL until showUsage is updated to display metrics
    expect(output).toMatch(/turn|turns/i);
    // Should show numTurns value
    expect(output).toContain("6");
    // Should show duration
    expect(output).toMatch(/duration|ms/i);
    // Should show cost
    expect(output).toMatch(/cost|\$/i);
    // cost value should appear
    expect(output).toContain("0.052");
  });

  it("displays numTurns value for a metrics-bearing step", async () => {
    await writeUsageJson({
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T10:00:00.000Z",
          modelUsage: {
            "claude-opus-4-5": {
              inputTokens: 500,
              outputTokens: 100,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
          jobId: "metrics-job-002",
          stepName: "spec-review",
          numTurns: 3,
          durationMs: 5000,
          durationApiMs: 4000,
          totalCostUsd: 0.01,
        },
      ],
    });

    const exitCode = await showUsage(TEST_SLUG, tmpDir);
    expect(exitCode).toBe(0);

    const output = getCapturedOutput();
    // numTurns = 3 should appear somewhere in the output
    expect(output).toContain("3");
  });
});

// ---------------------------------------------------------------------------
// TC-009: metrics 非保持エントリでも例外なく出力する
// ---------------------------------------------------------------------------

describe("TC-009: metrics 非保持エントリでも例外なく出力する", () => {
  it("outputs without exception when invocations have no metrics fields", async () => {
    await writeUsageJson({
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T10:00:00.000Z",
          modelUsage: {
            "claude-opus-4-5": {
              inputTokens: 500,
              outputTokens: 200,
              cacheReadInputTokens: 100,
              cacheCreationInputTokens: 50,
            },
          },
          jobId: "no-metrics-job-001",
          stepName: "design",
          // No numTurns, durationMs, durationApiMs, totalCostUsd
        },
      ],
    });

    // TC-009: Must not throw even with metrics-less entries
    let exitCode: number;
    await expect(async () => {
      exitCode = await showUsage(TEST_SLUG, tmpDir);
    }).not.toThrow();

    exitCode = await showUsage(TEST_SLUG, tmpDir);
    expect(exitCode).toBe(0);

    const output = getCapturedOutput();

    // Must still show the existing modelUsage information
    expect(output).toContain("claude-opus-4-5");
    expect(output).toContain("design");
  });

  it("shows existing output format without crashing for entirely legacy entries", async () => {
    await writeUsageJson({
      commandInvocations: [
        {
          command: "request-review",
          timestamp: "2025-06-01T09:00:00.000Z",
          modelUsage: null,
          // Deep legacy: no jobId, no stepName, no metrics
        },
        {
          command: "job",
          timestamp: "2025-06-01T10:00:00.000Z",
          modelUsage: {
            "claude-haiku-4-5": {
              inputTokens: 100,
              outputTokens: 50,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
          jobId: "legacy-job-001",
          stepName: "verification",
          // No metrics
        },
      ],
    });

    const exitCode = await showUsage(TEST_SLUG, tmpDir);
    expect(exitCode).toBe(0);

    const output = getCapturedOutput();

    // Must show the slug and existing data
    expect(output).toContain(TEST_SLUG);
    // The haiku model usage should appear
    expect(output).toContain("claude-haiku-4-5");
  });

  it("returns 0 for exit code even when no metrics are present", async () => {
    await writeUsageJson({
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T10:00:00.000Z",
          modelUsage: null,
          jobId: "no-metrics-job",
          stepName: "build-fixer",
        },
      ],
    });

    const exitCode = await showUsage(TEST_SLUG, tmpDir);
    expect(exitCode).toBe(0);
  });
});
