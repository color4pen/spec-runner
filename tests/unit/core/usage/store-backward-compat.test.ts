/**
 * Unit tests for usage.json backward compatibility with legacy format.
 *
 * TC-007: legacy usage.json を読み書きしても既存エントリが保持される
 *
 * These tests verify that:
 * - A usage.json written before the metrics feature (no numTurns/durationMs/etc.)
 *   can be parsed correctly by readUsageFile.
 * - appendInvocation can append a new metrics-bearing entry to a legacy file
 *   without corrupting the existing entries.
 * - Reading back the file returns both legacy and new entries.
 */
import { describe, it, expect } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { readUsageFile, appendInvocation } from "../../../../src/core/usage/store.js";
import type { CommandInvocation } from "../../../../src/core/usage/types.js";

// ---------------------------------------------------------------------------
// TC-007: legacy usage.json を読み書きしても既存エントリが保持される
// ---------------------------------------------------------------------------

describe("TC-007: legacy usage.json を読み書きしても既存エントリが保持される", () => {
  it("parses a legacy usage.json without metrics fields and preserves all existing entries", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "usage-compat-test-"));
    const filePath = path.join(tmpDir, "usage.json");

    // Write a legacy usage.json that has no metrics fields (format before this change)
    const legacyContent = JSON.stringify({
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
          jobId: "legacy-job-001",
          stepName: "implementer",
          // Note: no numTurns, durationMs, durationApiMs, totalCostUsd
        },
        {
          command: "request-review",
          timestamp: "2025-12-15T09:00:00.000Z",
          modelUsage: null,
          // Note: no metrics fields
        },
      ],
    });

    await fs.writeFile(filePath, legacyContent, "utf-8");

    // TC-007: reading a legacy file must succeed and preserve entries
    const usageFile = await readUsageFile(filePath);
    expect(usageFile.commandInvocations).toHaveLength(2);

    const entry0 = usageFile.commandInvocations[0]!;
    expect(entry0.command).toBe("job");
    expect(entry0.timestamp).toBe("2026-01-01T10:00:00.000Z");
    expect(entry0.modelUsage!["claude-opus-4-5"]).toBeDefined();
    expect(entry0.jobId).toBe("legacy-job-001");
    expect(entry0.stepName).toBe("implementer");

    const entry1 = usageFile.commandInvocations[1]!;
    expect(entry1.command).toBe("request-review");
    expect(entry1.modelUsage).toBeNull();

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("appends a metrics-bearing entry to a legacy file without corrupting existing entries", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "usage-compat-append-test-"));
    const filePath = path.join(tmpDir, "usage.json");

    // Start with a legacy usage.json (no metrics fields)
    const legacyContent = JSON.stringify({
      commandInvocations: [
        {
          command: "job",
          timestamp: "2026-01-01T10:00:00.000Z",
          modelUsage: {
            "claude-opus-4-5": {
              inputTokens: 500,
              outputTokens: 200,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
          jobId: "legacy-job-001",
          stepName: "design",
        },
      ],
    });

    await fs.writeFile(filePath, legacyContent, "utf-8");

    // Append a new entry WITH metrics (the new format after this change)
    const newEntry: CommandInvocation = {
      command: "job",
      timestamp: "2026-01-02T11:00:00.000Z",
      modelUsage: {
        "claude-sonnet-4-6": {
          inputTokens: 300,
          outputTokens: 150,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
      jobId: "new-job-002",
      stepName: "implementer",
      // New metrics fields (will be set after implementation adds them to CommandInvocation type)
      numTurns: 5,
      durationMs: 10000,
      durationApiMs: 8000,
      totalCostUsd: 0.03,
    } as CommandInvocation & { numTurns?: number; durationMs?: number; durationApiMs?: number; totalCostUsd?: number };

    // TC-007: appendInvocation must preserve the legacy entry and add the new one
    await appendInvocation(filePath, newEntry);

    const usageFile = await readUsageFile(filePath);
    expect(usageFile.commandInvocations).toHaveLength(2);

    // Legacy entry must be preserved unchanged
    const legacy = usageFile.commandInvocations[0]!;
    expect(legacy.command).toBe("job");
    expect(legacy.timestamp).toBe("2026-01-01T10:00:00.000Z");
    expect(legacy.jobId).toBe("legacy-job-001");
    expect(legacy.stepName).toBe("design");
    // Legacy entry must NOT have metrics fields filled in from the new entry
    const legacyRaw = legacy as unknown as Record<string, unknown>;
    expect(legacyRaw["numTurns"]).toBeUndefined();
    expect(legacyRaw["totalCostUsd"]).toBeUndefined();

    // New entry must be there with its metrics
    const newEntryRead = usageFile.commandInvocations[1]!;
    expect(newEntryRead.command).toBe("job");
    expect(newEntryRead.timestamp).toBe("2026-01-02T11:00:00.000Z");
    expect(newEntryRead.jobId).toBe("new-job-002");

    // New metrics fields must be readable on the new entry
    // These will FAIL until implementation adds the fields to CommandInvocation type
    const newEntryWithMetrics = newEntryRead as CommandInvocation & {
      numTurns?: number;
      durationMs?: number;
      durationApiMs?: number;
      totalCostUsd?: number;
    };
    expect(newEntryWithMetrics.numTurns).toBe(5);
    expect(newEntryWithMetrics.durationMs).toBe(10000);
    expect(newEntryWithMetrics.durationApiMs).toBe(8000);
    expect(newEntryWithMetrics.totalCostUsd).toBe(0.03);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("readUsageFile does not throw on a legacy file with no metrics fields", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "usage-compat-nothrow-test-"));
    const filePath = path.join(tmpDir, "usage.json");

    // Write a deeply legacy format (even without jobId)
    const deepLegacyContent = JSON.stringify({
      commandInvocations: [
        {
          command: "request-review",
          timestamp: "2025-01-01T10:00:00.000Z",
          modelUsage: null,
          // No jobId, no stepName, no metrics
        },
      ],
    });

    await fs.writeFile(filePath, deepLegacyContent, "utf-8");

    // Must not throw
    await expect(readUsageFile(filePath)).resolves.not.toThrow();
    const result = await readUsageFile(filePath);
    expect(result.commandInvocations).toHaveLength(1);
    expect(result.commandInvocations[0]!.command).toBe("request-review");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
