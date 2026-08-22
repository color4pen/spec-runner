/**
 * TC-008, TC-014, TC-015 — store/fold layer unit tests for CheckpointRestackRecord.
 *
 * TC-008: fold() が checkpoint-restack record で historyCount/stepCounts/history/steps を変更しない
 *         (fold() does NOT change historyCount/stepCounts/history/steps with a checkpoint-restack record)
 *
 * TC-014: fold() が CheckpointRestackRecord を checkpointRestacks[] に収集し historyCount 不変
 *         (fold() collects CheckpointRestackRecord in checkpointRestacks[] and historyCount is invariant)
 *
 * TC-015: appendCheckpointRestack() が events.jsonl のみ更新し state.json を書き換えない
 *         (appendCheckpointRestack() writes to events.jsonl without modifying state.json)
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { fold } from "../event-journal.js";
import type { CheckpointRestackRecord } from "../event-journal.js";
import { JobStateStore } from "../job-state-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a step-attempt JSONL line for testing that existing fields are unaffected. */
function makeStepAttemptLine(step = "design"): string {
  return JSON.stringify({
    type: "step-attempt",
    step,
    sessionId: null,
    outcome: { verdict: "approved", findingsPath: null, error: null },
    startedAt: "2026-07-01T09:00:00.000Z",
    endedAt: "2026-07-01T09:30:00.000Z",
  });
}

/** Build a transition JSONL line for testing that existing fields are unaffected. */
function makeTransitionLine(): string {
  return JSON.stringify({
    type: "transition",
    ts: "2026-07-01T09:00:00.000Z",
    step: "init",
    status: "ok",
    message: "running → awaiting-archive: completed",
  });
}

/** Build a checkpoint-restack JSONL line. */
function makeCheckpointRestackLine(
  overrides: Partial<CheckpointRestackRecord> = {},
): string {
  const record: CheckpointRestackRecord = {
    type: "checkpoint-restack",
    ts: "2026-07-01T09:05:00.000Z",
    slug: "test-slug",
    branch: "fix/test-branch-abc123",
    parentOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    localTipOid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    unpublishedCommits: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
    reason: "remote: error: push rejected by pre-receive hook",
    ...overrides,
  };
  return JSON.stringify(record);
}

// ---------------------------------------------------------------------------
// TC-008: checkpoint-restack record が projection（history/steps）を変更しない
// ---------------------------------------------------------------------------

describe("TC-008: fold() historyCount/stepCounts/history/steps are unchanged by checkpoint-restack record", () => {
  it("TC-008-a: checkpoint-restack record is NOT counted in historyCount", () => {
    // GIVEN a journal with one transition and one checkpoint-restack record
    const content =
      [makeTransitionLine(), makeCheckpointRestackLine()].join("\n") + "\n";

    // WHEN fold() is called
    const result = fold(content);

    // THEN historyCount reflects only the transition record
    expect(result.historyCount).toBe(1);
  });

  it("TC-008-b: checkpoint-restack record is NOT counted in stepsTotal or stepCounts", () => {
    // GIVEN a journal with one step-attempt and one checkpoint-restack record
    const content =
      [makeStepAttemptLine("design"), makeCheckpointRestackLine()].join("\n") + "\n";

    // WHEN fold() is called
    const result = fold(content);

    // THEN stepsTotal and stepCounts reflect only the step-attempt record
    expect(result.stepsTotal).toBe(1);
    expect(result.stepCounts).toEqual({ design: 1 });
    // checkpoint-restack must NOT appear as a step name in stepCounts
    expect("checkpoint-restack" in result.stepCounts).toBe(false);
  });

  it("TC-008-c: checkpoint-restack record does NOT appear in history[] or steps{}", () => {
    // GIVEN a journal with step-attempt, transition, and checkpoint-restack records
    const content =
      [
        makeStepAttemptLine("spec-review"),
        makeTransitionLine(),
        makeCheckpointRestackLine(),
      ].join("\n") + "\n";

    // WHEN fold() is called
    const result = fold(content);

    // THEN history[] contains only transition records
    expect(result.history).toHaveLength(1);
    expect(result.history[0]!.step).toBe("init"); // from makeTransitionLine()

    // THEN steps{} contains only step-attempt records
    expect(Object.keys(result.steps)).toEqual(["spec-review"]);
    expect("checkpoint-restack" in result.steps).toBe(false);
  });

  it("TC-008-d: multiple checkpoint-restack records leave historyCount and stepCounts unchanged", () => {
    // GIVEN a journal with a mix of records including two checkpoint-restack records
    const content =
      [
        makeStepAttemptLine("implementer"),
        makeTransitionLine(),
        makeCheckpointRestackLine({ ts: "2026-07-01T09:05:00.000Z" }),
        makeCheckpointRestackLine({ ts: "2026-07-01T09:10:00.000Z" }),
      ].join("\n") + "\n";

    // WHEN fold() is called
    const result = fold(content);

    // THEN projection counts are unchanged (checkpoint-restack adds nothing)
    expect(result.historyCount).toBe(1); // only the transition
    expect(result.stepsTotal).toBe(1); // only the step-attempt
    expect(result.stepCounts).toEqual({ implementer: 1 });
  });
});

// ---------------------------------------------------------------------------
// TC-014: fold() が CheckpointRestackRecord を checkpointRestacks[] に収集し historyCount 不変
// ---------------------------------------------------------------------------

describe("TC-014: fold() collects CheckpointRestackRecord in checkpointRestacks[] — historyCount invariant", () => {
  it("TC-014-a: single checkpoint-restack record is collected with all fields intact", () => {
    // GIVEN a journal with step-attempt, transition, and one checkpoint-restack record
    const record: CheckpointRestackRecord = {
      type: "checkpoint-restack",
      ts: "2026-07-01T10:00:00.000Z",
      slug: "halt-checkpoint-restack",
      branch: "change/halt-checkpoint-restack-abc123",
      parentOid: "1111111111111111111111111111111111111111",
      localTipOid: "2222222222222222222222222222222222222222",
      unpublishedCommits: [
        "2222222222222222222222222222222222222222",
        "3333333333333333333333333333333333333333",
      ],
      reason: "remote: push rejected by pre-receive hook (masked)",
    };

    const content =
      [
        makeStepAttemptLine("design"),
        makeTransitionLine(),
        JSON.stringify(record),
      ].join("\n") + "\n";

    // WHEN fold() is called
    const result = fold(content);

    // THEN historyCount and stepCounts are unchanged (as if the record were absent)
    expect(result.historyCount).toBe(1);
    expect(result.stepsTotal).toBe(1);
    expect(result.stepCounts).toEqual({ design: 1 });

    // THEN checkpointRestacks[] contains the record with all fields intact
    expect(result.checkpointRestacks).toBeDefined();
    expect(result.checkpointRestacks).toHaveLength(1);

    const collected = result.checkpointRestacks![0]!;
    expect(collected.type).toBe("checkpoint-restack");
    expect(collected.slug).toBe("halt-checkpoint-restack");
    expect(collected.branch).toBe("change/halt-checkpoint-restack-abc123");
    expect(collected.parentOid).toBe("1111111111111111111111111111111111111111");
    expect(collected.localTipOid).toBe("2222222222222222222222222222222222222222");
    expect(collected.unpublishedCommits).toEqual([
      "2222222222222222222222222222222222222222",
      "3333333333333333333333333333333333333333",
    ]);
    expect(collected.reason).toBe(
      "remote: push rejected by pre-receive hook (masked)",
    );
    expect(collected.ts).toBe("2026-07-01T10:00:00.000Z");
  });

  it("TC-014-b: multiple checkpoint-restack records are collected in chronological order", () => {
    // GIVEN a journal with two checkpoint-restack records
    const content =
      [
        makeStepAttemptLine("design"),
        makeTransitionLine(),
        makeCheckpointRestackLine({
          ts: "2026-07-01T09:05:00.000Z",
          reason: "first push failure",
        }),
        makeCheckpointRestackLine({
          ts: "2026-07-01T09:10:00.000Z",
          reason: "second push failure",
        }),
      ].join("\n") + "\n";

    // WHEN fold() is called
    const result = fold(content);

    // THEN historyCount and stepCounts are unchanged by the two checkpoint-restack records
    expect(result.historyCount).toBe(1);
    expect(result.stepsTotal).toBe(1);

    // THEN both records are collected in chronological (file) order
    expect(result.checkpointRestacks).toHaveLength(2);
    expect(result.checkpointRestacks![0]!.reason).toBe("first push failure");
    expect(result.checkpointRestacks![1]!.reason).toBe("second push failure");
  });

  it("TC-014-c: journal with no checkpoint-restack records has checkpointRestacks absent or empty", () => {
    // GIVEN a journal with only step-attempt and transition records
    const content =
      [makeStepAttemptLine("design"), makeTransitionLine()].join("\n") + "\n";

    // WHEN fold() is called
    const result = fold(content);

    // THEN checkpointRestacks is absent (empty array optimization) — no records
    const restacks = result.checkpointRestacks;
    expect(restacks === undefined || restacks.length === 0).toBe(true);
  });

  it("TC-014-d: checkpoint-restack record is not treated as a corruption", () => {
    // GIVEN a journal with a single checkpoint-restack record
    const content = makeCheckpointRestackLine() + "\n";

    // WHEN fold() is called
    const result = fold(content);

    // THEN no corruption is recorded (checkpoint-restack is a known type)
    expect(result.corruption).toBeUndefined();
  });

  it("TC-014-e: historyCount after adding checkpoint-restack equals historyCount without it", () => {
    // GIVEN two journals: one with and one without a checkpoint-restack record
    const baseContent =
      [makeStepAttemptLine("design"), makeTransitionLine()].join("\n") + "\n";
    const withRestackContent =
      [
        makeStepAttemptLine("design"),
        makeTransitionLine(),
        makeCheckpointRestackLine(),
      ].join("\n") + "\n";

    // WHEN fold() is called on both
    const baseResult = fold(baseContent);
    const withRestackResult = fold(withRestackContent);

    // THEN historyCount, stepCounts, and stepsTotal are identical
    expect(withRestackResult.historyCount).toBe(baseResult.historyCount);
    expect(withRestackResult.stepCounts).toEqual(baseResult.stepCounts);
    expect(withRestackResult.stepsTotal).toBe(baseResult.stepsTotal);

    // AND the with-restack result additionally has the record in checkpointRestacks
    expect(withRestackResult.checkpointRestacks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TC-015: appendCheckpointRestack() が events.jsonl のみ更新し state.json を書き換えない
// ---------------------------------------------------------------------------

describe("TC-015: appendCheckpointRestack() writes to events.jsonl without modifying state.json", () => {
  it(
    "TC-015: events.jsonl receives one appended line; state.json content and mtime are unchanged",
    async () => {
      const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "checkpoint-restack-rt-"),
      );
      try {
        const changeDir = path.join(
          tempDir,
          "specrunner",
          "changes",
          "test-slug",
        );
        await fs.mkdir(changeDir, { recursive: true });

        // Write minimal state.json required for JobStateStore path resolution
        const stateJsonPath = path.join(changeDir, "state.json");
        await fs.writeFile(
          stateJsonPath,
          JSON.stringify({
            version: 2,
            jobId: "test-job-id",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            request: {
              path: "/req.md",
              title: "T",
              type: "bug-fix",
              slug: "test-slug",
            },
            repository: { owner: "o", name: "r" },
            session: null,
            step: "pr-create",
            status: "awaiting-archive",
            branch: "fix/test-slug",
            history: [],
            error: null,
            _journal: { historyCount: 0, stepCounts: {} },
          }),
        );

        // Record state.json mtime and content BEFORE the operation
        const statBefore = await fs.stat(stateJsonPath);
        const contentBefore = await fs.readFile(stateJsonPath, "utf-8");

        // WHEN appendCheckpointRestack is called on a real JobStateStore instance
        const store = new JobStateStore("test-job-id", tempDir, {
          slug: "test-slug",
          stateRoot: tempDir,
        });

        const record: CheckpointRestackRecord = {
          type: "checkpoint-restack",
          ts: "2026-07-01T10:00:00.000Z",
          slug: "test-slug",
          branch: "fix/test-slug",
          parentOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          localTipOid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          unpublishedCommits: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
          reason: "remote: error: push rejected by pre-receive hook",
        };
        await store.appendCheckpointRestack(record);

        // THEN events.jsonl has exactly one appended line containing the record
        const eventsJsonlPath = path.join(changeDir, "events.jsonl");
        const eventsContent = await fs.readFile(eventsJsonlPath, "utf-8");
        const foldResult = fold(eventsContent);

        expect(foldResult.checkpointRestacks).toHaveLength(1);
        const collected = foldResult.checkpointRestacks![0]!;
        expect(collected.type).toBe("checkpoint-restack");
        expect(collected.slug).toBe("test-slug");
        expect(collected.parentOid).toBe(
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        );
        expect(collected.localTipOid).toBe(
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        );
        expect(collected.ts).toBe("2026-07-01T10:00:00.000Z");

        // THEN state.json content is unchanged
        const contentAfter = await fs.readFile(stateJsonPath, "utf-8");
        expect(contentAfter).toBe(contentBefore);

        // THEN state.json mtime is unchanged (within 150 ms tolerance for fast filesystems)
        const statAfter = await fs.stat(stateJsonPath);
        expect(
          Math.abs(statAfter.mtimeMs - statBefore.mtimeMs),
        ).toBeLessThan(150);

        // AND state.json does NOT contain a checkpointRestacks field
        const stateParsed = JSON.parse(contentAfter) as Record<string, unknown>;
        expect("checkpointRestacks" in stateParsed).toBe(false);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    },
  );
});
