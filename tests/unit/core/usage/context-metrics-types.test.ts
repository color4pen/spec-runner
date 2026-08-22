/**
 * Unit tests for contextMetrics in CommandInvocation (TC-023, TC-024).
 *
 * TC-023: contextMetrics を含む CommandInvocation の round-trip
 * TC-024: contextMetrics を持たない旧 entry の backward compatibility
 */
import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import { appendInvocation, readUsageFile } from "../../../../src/core/usage/store.js";
import type { AgentContextMetrics } from "../../../../src/kernel/context-metrics.js";

// ---------------------------------------------------------------------------
// TC-023: contextMetrics を含む CommandInvocation の round-trip
// ---------------------------------------------------------------------------

describe("TC-023: contextMetrics を含む CommandInvocation の round-trip", () => {
  it("contextMetrics fields survive appendInvocation → readUsageFile round-trip without loss", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "context-metrics-types-test-"));
    const filePath = path.join(tmpDir, "usage.json");

    try {
      const contextMetrics: AgentContextMetrics = {
        provider: "claude-code",
        model: "claude-sonnet-4-5",
        contextWindowTokens: 200000,
        peakActiveContextTokens: 87500,
        compactionCount: 2,
        contextTokensBeforeCompaction: 156000,
        contextTokensAfterCompaction: 42000,
        exhaustionAtTokens: undefined,
      };

      await appendInvocation(filePath, {
        command: "job",
        timestamp: "2026-01-01T10:00:00.000Z",
        modelUsage: {
          "claude-sonnet-4-5": {
            inputTokens: 50000,
            outputTokens: 5000,
            cacheReadInputTokens: 30000,
            cacheCreationInputTokens: 10000,
          },
        },
        jobId: "ctx-metrics-test-job-001",
        stepName: "implementer",
        contextMetrics,
      });

      const usageFile = await readUsageFile(filePath);
      expect(usageFile.commandInvocations).toHaveLength(1);

      const entry = usageFile.commandInvocations[0]!;
      expect(entry.contextMetrics).toBeDefined();
      expect(entry.contextMetrics!.provider).toBe("claude-code");
      expect(entry.contextMetrics!.model).toBe("claude-sonnet-4-5");
      expect(entry.contextMetrics!.contextWindowTokens).toBe(200000);
      expect(entry.contextMetrics!.peakActiveContextTokens).toBe(87500);
      expect(entry.contextMetrics!.compactionCount).toBe(2);
      expect(entry.contextMetrics!.contextTokensBeforeCompaction).toBe(156000);
      expect(entry.contextMetrics!.contextTokensAfterCompaction).toBe(42000);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("contextMetrics with exhaustionAtTokens survives round-trip", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "context-metrics-exhaustion-test-"));
    const filePath = path.join(tmpDir, "usage.json");

    try {
      const contextMetrics: AgentContextMetrics = {
        provider: "claude-code",
        exhaustionAtTokens: 187000,
        peakActiveContextTokens: 187000,
      };

      await appendInvocation(filePath, {
        command: "job",
        timestamp: "2026-01-01T10:00:00.000Z",
        modelUsage: null,
        jobId: "ctx-exhaustion-test-job-001",
        stepName: "implementer",
        contextMetrics,
      });

      const usageFile = await readUsageFile(filePath);
      const entry = usageFile.commandInvocations[0]!;
      expect(entry.contextMetrics).toBeDefined();
      expect(entry.contextMetrics!.provider).toBe("claude-code");
      expect(entry.contextMetrics!.exhaustionAtTokens).toBe(187000);
      expect(entry.contextMetrics!.peakActiveContextTokens).toBe(187000);
      // Optional fields absent in the source should be absent in the round-trip
      expect(entry.contextMetrics!.compactionCount).toBeUndefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("entry without contextMetrics and entry with contextMetrics can coexist", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "context-metrics-coexist-test-"));
    const filePath = path.join(tmpDir, "usage.json");

    try {
      // First entry: no contextMetrics
      await appendInvocation(filePath, {
        command: "job",
        timestamp: "2026-01-01T09:00:00.000Z",
        modelUsage: { "claude-sonnet-4-5": { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
        jobId: "coexist-job",
        stepName: "design",
      });

      // Second entry: with contextMetrics
      await appendInvocation(filePath, {
        command: "job",
        timestamp: "2026-01-01T10:00:00.000Z",
        modelUsage: { "claude-sonnet-4-5": { inputTokens: 200, outputTokens: 100, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
        jobId: "coexist-job",
        stepName: "implementer",
        contextMetrics: {
          provider: "claude-code",
          peakActiveContextTokens: 50000,
          compactionCount: 1,
        },
      });

      const usageFile = await readUsageFile(filePath);
      expect(usageFile.commandInvocations).toHaveLength(2);

      const first = usageFile.commandInvocations[0]!;
      const second = usageFile.commandInvocations[1]!;

      // First entry: no contextMetrics
      expect(first.contextMetrics).toBeUndefined();

      // Second entry: contextMetrics present
      expect(second.contextMetrics).toBeDefined();
      expect(second.contextMetrics!.provider).toBe("claude-code");
      expect(second.contextMetrics!.peakActiveContextTokens).toBe(50000);
      expect(second.contextMetrics!.compactionCount).toBe(1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// TC-024: contextMetrics を持たない旧 entry の backward compatibility
// ---------------------------------------------------------------------------

describe("TC-024: contextMetrics を持たない旧 entry の backward compatibility", () => {
  it("reading a legacy entry (no contextMetrics field) does not throw and field is absent", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "context-metrics-backward-test-"));
    const filePath = path.join(tmpDir, "usage.json");

    try {
      // Write a legacy-style usage.json directly (no contextMetrics field)
      const legacyContent = {
        commandInvocations: [
          {
            command: "job",
            timestamp: "2025-01-01T10:00:00.000Z",
            modelUsage: {
              "claude-opus-4-5": {
                inputTokens: 1000,
                outputTokens: 200,
                cacheReadInputTokens: 500,
                cacheCreationInputTokens: 100,
              },
            },
            jobId: "legacy-job-001",
            stepName: "implementer",
            numTurns: 5,
            durationMs: 12000,
            // No contextMetrics field
          },
        ],
      };
      await fs.writeFile(filePath, JSON.stringify(legacyContent), "utf-8");

      // Should not throw
      const usageFile = await readUsageFile(filePath);
      expect(usageFile.commandInvocations).toHaveLength(1);

      const entry = usageFile.commandInvocations[0]!;
      // contextMetrics is absent (not null, not 0)
      expect(entry.contextMetrics).toBeUndefined();

      // Existing fields are still intact
      expect(entry.jobId).toBe("legacy-job-001");
      expect(entry.stepName).toBe("implementer");
      const raw = entry as unknown as Record<string, unknown>;
      expect(raw["numTurns"]).toBe(5);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("reading a very old legacy entry (no jobId, no stepName, no metrics) does not throw", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "context-metrics-very-old-test-"));
    const filePath = path.join(tmpDir, "usage.json");

    try {
      // Very old entry format
      const veryOldContent = {
        commandInvocations: [
          {
            command: "request-review",
            timestamp: "2025-01-01T08:00:00.000Z",
            modelUsage: null,
          },
        ],
      };
      await fs.writeFile(filePath, JSON.stringify(veryOldContent), "utf-8");

      const usageFile = await readUsageFile(filePath);
      expect(usageFile.commandInvocations).toHaveLength(1);

      const entry = usageFile.commandInvocations[0]!;
      expect(entry.contextMetrics).toBeUndefined();
      expect(entry.command).toBe("request-review");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
