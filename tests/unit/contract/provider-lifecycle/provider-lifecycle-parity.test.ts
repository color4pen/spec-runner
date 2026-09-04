/**
 * Provider Lifecycle Parity Contract — main test driver.
 *
 * For each ContractCase × CONTRACT_PROVIDERS, this file generates one test.
 * - shared cases:           both providers run (2 tests per case)
 * - provider-specific cases: "absent" provider gets test.skip; "supported" runs
 *
 * Test structure per combination:
 *   1. Setup: fake timers (if usesFakeTimers), tempDir creation, result file creation
 *   2. Harness build: PROVIDER_HARNESSES[provider].build(scenario, opts)
 *   3. Context build: buildBaseContext + step.resultFilePath override
 *   4. Run: runner.run(ctx) — with timer advance for fake-timer scenarios
 *   5. Assert: completionReason, toolResult, followUpAttempts, field presence, etc.
 *   6. Cleanup: vi.useRealTimers(), rm(tempDir)
 *
 * Universal invariants (applied to every successful run):
 *   - On completionReason=success: error must be undefined
 *   - On completionReason=error|timeout: error must be defined
 *   - followUpAttempts must be a non-negative integer
 *
 * Ledger: test name format "[<providerId>] <caseId>" so grep/filter works.
 *
 * buildArtifactBundle mock rationale:
 *   ClaudeCodeRunner.run() calls buildArtifactBundle (real file I/O) before armReportGrace()
 *   is called. With fake timers, vi.advanceTimersByTimeAsync uses originalSetTimeout internally
 *   (sinon/fake-timers tickAsync), which fires in the event-loop timers phase — BEFORE the
 *   I/O phase. This means the real buildArtifactBundle I/O completes TOO LATE: doTick(60001)
 *   advances the fake clock before the grace timer is scheduled, causing the grace timer to be
 *   scheduled at clock+60000 which is unreachable.
 *
 *   The mock returns "" immediately (no real I/O), so the async chain from runner.run() to
 *   armReportGrace() completes as microtasks — which all drain BEFORE any event-loop timer
 *   fires. This ensures armReportGrace schedules the grace fake-timer BEFORE doTick advances
 *   the clock, allowing vi.advanceTimersByTimeAsync(60_001) to fire it correctly.
 *
 *   Semantic correctness: the test tempDir never contains artifact files, so the real
 *   buildArtifactBundle would also return "". The mock produces identical behavior.
 */
// Hoisted vi.mock: must appear before imports that transitively load the module.
// Mocks buildArtifactBundle for ALL tests in this file; see comment block above for rationale.
vi.mock("../../../../src/adapter/shared/artifact-bundle.js", () => ({
  buildArtifactBundle: async () => "",
}));

import { describe, test, expect, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentRunResult } from "../../../../src/core/port/agent-runner.js";
import { CONTRACT_CASES, type ProviderExpectation } from "./case-table.js";
import { PROVIDER_HARNESSES } from "./harness/registry.js";
import { CONTRACT_PROVIDERS } from "./case-ids.js";
import { buildBaseContext } from "./scenario.js";

// ---------------------------------------------------------------------------
// Assertion helper
// ---------------------------------------------------------------------------

/**
 * Assert a single provider's expectations against an AgentRunResult.
 * Also applies universal invariants (error↔completionReason coherence).
 */
function assertExpectations(
  result: AgentRunResult,
  exp: ProviderExpectation,
  getInvocationCount: () => number,
  caseId: string,
  providerId: string,
): void {
  const tag = `[${providerId}] ${caseId}`;

  // --- Core result fields ---

  if (exp.completionReason !== undefined) {
    expect(result.completionReason, `${tag}: completionReason`).toBe(exp.completionReason);
  }

  if (exp.toolResult !== undefined) {
    if (exp.toolResult === null) {
      expect(result.toolResult, `${tag}: toolResult should be null`).toBeNull();
    } else {
      expect(result.toolResult, `${tag}: toolResult should be defined`).toBeDefined();
      expect(
        (result.toolResult as unknown as Record<string, unknown>)["ok"],
        `${tag}: toolResult.ok`,
      ).toBe(exp.toolResult.ok);
    }
  }

  if (exp.followUpAttempts !== undefined) {
    expect(result.followUpAttempts, `${tag}: followUpAttempts`).toBe(exp.followUpAttempts);
  }

  // --- transientRetryAttempts ---

  if (exp.transientRetryAttempts !== undefined) {
    if (exp.transientRetryAttempts === "absent") {
      expect(result.transientRetryAttempts, `${tag}: transientRetryAttempts should be absent`).toBeUndefined();
    } else {
      expect(result.transientRetryAttempts, `${tag}: transientRetryAttempts`).toBe(
        exp.transientRetryAttempts,
      );
    }
  }

  // --- addedTurns ---

  if (exp.addedTurns !== undefined) {
    if (exp.addedTurns === "absent") {
      expect(result.addedTurns, `${tag}: addedTurns should be absent`).toBeUndefined();
    } else {
      expect(result.addedTurns, `${tag}: addedTurns should be defined`).toBeDefined();
      expect(result.addedTurns?.reportRetry, `${tag}: addedTurns.reportRetry`).toBe(
        exp.addedTurns.reportRetry,
      );
      expect(result.addedTurns?.postWork, `${tag}: addedTurns.postWork`).toBe(
        exp.addedTurns.postWork,
      );
      expect(result.addedTurns?.outputRepair, `${tag}: addedTurns.outputRepair`).toBe(
        exp.addedTurns.outputRepair,
      );
    }
  }

  // --- addedTurns invariant: reportRetry + outputRepair === followUpAttempts ---

  if (exp.assertAddedTurnsInvariant) {
    expect(result.addedTurns, `${tag}: addedTurns must be defined for invariant check`).toBeDefined();
    const { reportRetry = 0, outputRepair = 0 } = result.addedTurns ?? {};
    expect(
      reportRetry + outputRepair,
      `${tag}: addedTurns.reportRetry + addedTurns.outputRepair must equal followUpAttempts`,
    ).toBe(result.followUpAttempts);
  }

  // --- resultContent ---

  if (exp.resultContent !== undefined) {
    if (exp.resultContent === null) {
      expect(result.resultContent, `${tag}: resultContent should be null`).toBeNull();
    } else {
      expect(result.resultContent, `${tag}: resultContent should contain substring`).toContain(
        exp.resultContent,
      );
    }
  }

  // --- Error fields ---

  if (exp.errorCode !== undefined) {
    expect(result.error, `${tag}: error should be defined for errorCode assertion`).toBeDefined();
    expect(result.error?.code, `${tag}: error.code`).toBe(exp.errorCode);
  }

  if (exp.errorMessagePattern !== undefined) {
    expect(result.error, `${tag}: error should be defined for message pattern assertion`).toBeDefined();
    expect(result.error?.message ?? "", `${tag}: error.message pattern`).toContain(
      exp.errorMessagePattern,
    );
  }

  if (exp.errorMustBeAbsent) {
    expect(result.error, `${tag}: error must be absent on success`).toBeUndefined();
  }

  // --- Universal invariants (always applied) ---

  if (result.completionReason === "success") {
    expect(result.error, `${tag} [universal]: error must be absent when completionReason=success`).toBeUndefined();
  } else {
    expect(result.error, `${tag} [universal]: error must be defined when completionReason=${result.completionReason}`).toBeDefined();
  }

  expect(result.followUpAttempts, `${tag} [universal]: followUpAttempts must be a non-negative integer`).toBeGreaterThanOrEqual(0);

  // --- Metrics / diagnostics ---

  if (exp.modelUsageDefined) {
    expect(result.modelUsage, `${tag}: modelUsage should be defined`).toBeDefined();
    expect(Object.keys(result.modelUsage ?? {}).length, `${tag}: modelUsage should have at least 1 entry`).toBeGreaterThan(0);
  }

  if (exp.contextWindowTokens !== undefined) {
    expect(result.contextMetrics, `${tag}: contextMetrics should be defined`).toBeDefined();
    expect(result.contextMetrics?.contextWindowTokens, `${tag}: contextMetrics.contextWindowTokens`).toBe(
      exp.contextWindowTokens,
    );
  }

  if (exp.invocationMetricsNumTurns !== undefined) {
    expect(result.invocationMetrics, `${tag}: invocationMetrics should be defined`).toBeDefined();
    expect(result.invocationMetrics?.numTurns, `${tag}: invocationMetrics.numTurns`).toBe(
      exp.invocationMetricsNumTurns,
    );
  }

  if (exp.completionReportDiagnosticsPresent) {
    expect(
      result.completionReportDiagnostics,
      `${tag}: completionReportDiagnostics should be defined and non-empty`,
    ).toBeDefined();
    expect(
      (result.completionReportDiagnostics ?? []).length,
      `${tag}: completionReportDiagnostics should have at least 1 entry`,
    ).toBeGreaterThan(0);
  }

  if (exp.sessionRolloversLength !== undefined) {
    expect(result.sessionRollovers, `${tag}: sessionRollovers should be defined`).toBeDefined();
    expect(result.sessionRollovers?.length, `${tag}: sessionRollovers.length`).toBe(
      exp.sessionRolloversLength,
    );
  }

  // --- Field presence checks ---

  if (exp.fieldPresence) {
    for (const [field, presence] of Object.entries(exp.fieldPresence)) {
      const value = (result as unknown as Record<string, unknown>)[field];
      if (presence === "present") {
        expect(value, `${tag}: result.${field} should be defined (present)`).toBeDefined();
      } else {
        expect(value, `${tag}: result.${field} should be undefined (absent)`).toBeUndefined();
      }
    }
  }

  // --- SDK invocation count ---

  if (exp.sdkInvocations !== undefined) {
    expect(getInvocationCount(), `${tag}: sdkInvocations`).toBe(exp.sdkInvocations);
  }
}

// ---------------------------------------------------------------------------
// Test generation
// ---------------------------------------------------------------------------

describe("provider-lifecycle-parity", () => {
  for (const contractCase of CONTRACT_CASES) {
    describe(contractCase.id, () => {
      for (const providerId of CONTRACT_PROVIDERS) {
        const expectation = contractCase.expectations[providerId];
        const testName = `[${providerId}]`;

        // Skip absent cases — provider does not implement this behavior.
        const runTest = expectation.support === "absent" ? test.skip : test;

        runTest(testName, async () => {
          const scenario = contractCase.scenario;

          // --- Real-timer setup: all I/O before fake timers are installed ---
          const tempDir = await mkdtemp(join(tmpdir(), "parity-"));

          try {
            // --- Create result file if needed ---
            let resultFilePath: string | null = null;
            const resultFile = scenario.resultFile;
            if (resultFile !== null) {
              const fullPath = join(tempDir, resultFile.path);
              // Only write the file when content is provided.
              // When content is undefined, the driver sets step.resultFilePath
              // but deliberately does NOT create the file (result-file-not-found case).
              if (resultFile.content !== undefined) {
                await writeFile(fullPath, resultFile.content, "utf8");
              }
              resultFilePath = fullPath;
            }

            // --- Build harness (sync) ---
            const sleepFn = async (_ms: number): Promise<void> => {
              // no-op: fake timers handle delays for fake-timer scenarios;
              // real scenarios have no sleep in the happy path
            };
            const emit = (() => {}) as AgentRunResult["error"] extends infer _E
              ? (..._args: unknown[]) => void
              : never;

            const harness = PROVIDER_HARNESSES[providerId]!;
            const { runner, getInvocationCount } = harness.build(scenario, {
              tempDir,
              sleepFn,
              emit: emit as unknown as Parameters<(typeof harness)["build"]>[1]["emit"],
            });

            // --- Build context (sync) ---
            const baseCtx = buildBaseContext(tempDir);
            const ctx = {
              ...baseCtx,
              step: {
                ...baseCtx.step,
                resultFilePath: (): string | null => resultFilePath,
              },
            };

            // --- Run ---
            let result: AgentRunResult;
            if (scenario.usesFakeTimers) {
              // Install fake timers AFTER all real I/O setup is complete.
              // This ensures that all I/O operations (mkdtemp, writeFile) resolve
              // via real timers, while the runner's internal timers are properly faked.
              vi.useFakeTimers();
              try {
                // Start the run in the background, then advance fake timers.
                const runPromise = runner.run(ctx);
                const advanceMs = scenario.timerAdvanceMs ?? 900_001;
                await vi.advanceTimersByTimeAsync(advanceMs);
                result = await runPromise;
              } finally {
                vi.useRealTimers();
              }
            } else {
              result = await runner.run(ctx);
            }

            // --- Assert expectations ---
            assertExpectations(
              result,
              expectation,
              getInvocationCount,
              contractCase.id,
              providerId,
            );
          } finally {
            await rm(tempDir, { recursive: true, force: true });
          }
        });
      }
    });
  }
});
