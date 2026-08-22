/**
 * Unit tests for showUsage — context metrics display (T-07).
 *
 * TC-034: usage show で全 field 揃った context entry を出力する (should priority)
 * TC-035: usage show で modelUsage null + contextMetrics あり entry でも context 行が出る
 * TC-016: context metrics を持たない entry では context 行を出さない (should priority)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { showUsage } from "../../../../src/core/command/usage-show.js";

let tmpDir: string;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let _stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "usage-show-ctx-metrics-test-"));
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  _stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const TEST_SLUG = "ctx-metrics-show-slug";

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
// TC-034: 全 field 揃った context entry で全 token が出る
// ---------------------------------------------------------------------------

describe("TC-034: usage show で全 field 揃った context entry を出力する", () => {
  it("includes all context metric tokens in output for a fully-populated contextMetrics entry", async () => {
    await writeUsageJson({
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T10:00:00.000Z",
          modelUsage: {
            "claude-sonnet-4-5": {
              inputTokens: 50000,
              outputTokens: 5000,
              cacheReadInputTokens: 10000,
              cacheCreationInputTokens: 2000,
            },
          },
          jobId: "ctx-full-test-001",
          stepName: "implementer",
          contextMetrics: {
            provider: "claude-code",
            model: "claude-sonnet-4-5",
            contextWindowTokens: 200000,
            peakActiveContextTokens: 87500,
            compactionCount: 2,
            contextTokensBeforeCompaction: 156000,
            contextTokensAfterCompaction: 42000,
          },
        },
      ],
    });

    const exitCode = await showUsage(TEST_SLUG, tmpDir);
    expect(exitCode).toBe(0);

    const output = getCapturedOutput();

    // TC-034: output must include "context:" line
    expect(output).toContain("context:");

    // All tokens must be present
    expect(output).toContain("provider=claude-code");
    expect(output).toContain("model=claude-sonnet-4-5");
    expect(output).toContain("window=200000");
    expect(output).toContain("peak=87500");
    expect(output).toContain("compactions=2");
    expect(output).toContain("preCompact=156000");
    expect(output).toContain("postCompact=42000");

    // exhaustedAt should NOT be present (not in the entry)
    expect(output).not.toContain("exhaustedAt=");
  });

  it("includes exhaustedAt when present in contextMetrics", async () => {
    await writeUsageJson({
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T11:00:00.000Z",
          modelUsage: null,
          jobId: "ctx-exhaust-show-001",
          stepName: "implementer",
          contextMetrics: {
            provider: "claude-code",
            peakActiveContextTokens: 195000,
            exhaustionAtTokens: 195000,
          },
        },
      ],
    });

    const exitCode = await showUsage(TEST_SLUG, tmpDir);
    expect(exitCode).toBe(0);

    const output = getCapturedOutput();

    expect(output).toContain("context:");
    expect(output).toContain("provider=claude-code");
    expect(output).toContain("peak=195000");
    expect(output).toContain("exhaustedAt=195000");
  });
});

// ---------------------------------------------------------------------------
// TC-034 (partial): 一部 field のみの entry で欠落 field が出ない
// ---------------------------------------------------------------------------

describe("TC-034 (partial): 一部 field のみの entry で欠落 field が出ない", () => {
  it("omits tokens for absent contextMetrics fields", async () => {
    await writeUsageJson({
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T10:00:00.000Z",
          modelUsage: {
            "claude-sonnet-4-5": {
              inputTokens: 30000,
              outputTokens: 2000,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
          jobId: "ctx-partial-show-001",
          stepName: "implementer",
          contextMetrics: {
            // Only provider and peak — no model, window, compaction, exhaustion
            provider: "claude-code",
            peakActiveContextTokens: 35000,
          },
        },
      ],
    });

    const exitCode = await showUsage(TEST_SLUG, tmpDir);
    expect(exitCode).toBe(0);

    const output = getCapturedOutput();

    // present fields
    expect(output).toContain("context:");
    expect(output).toContain("provider=claude-code");
    expect(output).toContain("peak=35000");

    // absent fields must NOT appear in output
    expect(output).not.toContain("model=");
    expect(output).not.toContain("window=");
    expect(output).not.toContain("compactions=");
    expect(output).not.toContain("preCompact=");
    expect(output).not.toContain("postCompact=");
    expect(output).not.toContain("exhaustedAt=");
  });
});

// ---------------------------------------------------------------------------
// TC-016: contextMetrics を持たない entry では context 行を出さない
// ---------------------------------------------------------------------------

describe("TC-016: context metrics を持たない entry では context 行を出さない", () => {
  it("no 'context:' line in output when contextMetrics is absent", async () => {
    await writeUsageJson({
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T09:00:00.000Z",
          modelUsage: {
            "claude-sonnet-4-5": {
              inputTokens: 1000,
              outputTokens: 100,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
          jobId: "no-ctx-metrics-job-001",
          stepName: "spec-review",
          // No contextMetrics field — legacy entry
        },
      ],
    });

    const exitCode = await showUsage(TEST_SLUG, tmpDir);
    expect(exitCode).toBe(0);

    const output = getCapturedOutput();

    // Legacy entry without contextMetrics: no "context:" line
    expect(output).not.toContain("context:");
    expect(output).not.toContain("provider=");
    expect(output).not.toContain("peak=");
  });

  it("entries with and without contextMetrics can coexist in output", async () => {
    await writeUsageJson({
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T09:00:00.000Z",
          modelUsage: {
            "claude-sonnet-4-5": {
              inputTokens: 500,
              outputTokens: 50,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
          jobId: "coexist-job",
          stepName: "spec-review",
          // No contextMetrics
        },
        {
          command: "job",
          timestamp: "2026-01-01T10:00:00.000Z",
          modelUsage: {
            "claude-sonnet-4-5": {
              inputTokens: 30000,
              outputTokens: 2000,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
          jobId: "coexist-job",
          stepName: "implementer",
          contextMetrics: {
            provider: "claude-code",
            peakActiveContextTokens: 32000,
            compactionCount: 1,
          },
        },
      ],
    });

    const exitCode = await showUsage(TEST_SLUG, tmpDir);
    expect(exitCode).toBe(0);

    const output = getCapturedOutput();

    // Second entry has contextMetrics — context: line must appear
    expect(output).toContain("context:");
    expect(output).toContain("provider=claude-code");
    expect(output).toContain("peak=32000");
    expect(output).toContain("compactions=1");
  });
});

// ---------------------------------------------------------------------------
// TC-035: modelUsage null + contextMetrics あり entry でも context 行が出る
// ---------------------------------------------------------------------------

describe("TC-035: usage show で modelUsage null + contextMetrics あり entry でも context 行が出る", () => {
  it("shows context line and '(no usage data)' for a halt-derived entry (modelUsage: null)", async () => {
    await writeUsageJson({
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T12:00:00.000Z",
          modelUsage: null,
          jobId: "exhaust-halt-job-001",
          stepName: "implementer",
          contextMetrics: {
            provider: "claude-code",
            model: "claude-sonnet-4-5",
            peakActiveContextTokens: 187000,
            exhaustionAtTokens: 187000,
          },
        },
      ],
    });

    const exitCode = await showUsage(TEST_SLUG, tmpDir);
    expect(exitCode).toBe(0);

    const output = getCapturedOutput();

    // Must show (no usage data) for modelUsage: null
    expect(output).toContain("(no usage data)");

    // Must also show context line despite null modelUsage
    expect(output).toContain("context:");
    expect(output).toContain("provider=claude-code");
    expect(output).toContain("model=claude-sonnet-4-5");
    expect(output).toContain("peak=187000");
    expect(output).toContain("exhaustedAt=187000");
  });

  it("does not throw when contextMetrics has only provider field", async () => {
    await writeUsageJson({
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T13:00:00.000Z",
          modelUsage: null,
          jobId: "minimal-ctx-job-001",
          stepName: "implementer",
          contextMetrics: {
            provider: "claude-code",
          },
        },
      ],
    });

    // Must not throw
    const exitCode = await showUsage(TEST_SLUG, tmpDir);
    expect(exitCode).toBe(0);

    const output = getCapturedOutput();

    // Only provider appears; no optional fields
    expect(output).toContain("context:");
    expect(output).toContain("provider=claude-code");
    expect(output).not.toContain("model=");
    expect(output).not.toContain("window=");
    expect(output).not.toContain("peak=");
    expect(output).not.toContain("exhaustedAt=");
  });
});
