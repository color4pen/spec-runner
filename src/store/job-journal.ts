import * as fs from "node:fs/promises";
import { JobLocationResolver } from "./job-location-resolver.js";
import { stateToStateJson } from "./job-state-projection.js";
import {
  fold,
  appendEventRecord,
  stepRunToRecord,
  historyEntryToRecord,
} from "./event-journal.js";
import type { FoldResult, InterruptionRecord, LineageRecord, OperatorEventRecord, FindingRecencyRecord } from "./event-journal.js";
import { detectCounterReversal, describeJournalIssue } from "./journal-integrity.js";
import { atomicWriteJson } from "../util/atomic-write.js";
import { appendHistoryEntry } from "../state/schema.js";
import type { JobState, StepRun, HistoryEntry } from "../state/schema.js";
import { journalCorruptedError } from "../errors.js";
import type { NormalizedJobState } from "./job-state-store.js";

// ---------------------------------------------------------------------------
// JournalCounters — exported so job-state-projection.ts can import it as a type
// ---------------------------------------------------------------------------

/**
 * Journal counters stored inside state.json under the `_journal` key.
 * Used for O(1) delta detection in persist().
 */
export interface JournalCounters {
  /** Total transition records in events.jsonl. */
  historyCount: number;
  /** Per-step record counts in events.jsonl. */
  stepCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Write ALL history entries and step runs to events.jsonl (used for fresh writes).
 */
async function writeAllToJournal(eventsPath: string, state: JobState): Promise<void> {
  for (const entry of state.history) {
    await appendEventRecord(eventsPath, historyEntryToRecord(entry));
  }
  const steps = (state as NormalizedJobState).steps ?? {};
  for (const [stepName, runs] of Object.entries(steps)) {
    for (const run of runs) {
      await appendEventRecord(eventsPath, stepRunToRecord(stepName, run));
    }
  }
}

/**
 * Build a stepCounts record from a steps object.
 * If baseCounters provided, ensures result[step] >= base[step].
 */
function buildStepCounts(
  steps: Record<string, StepRun[]> | undefined,
  baseCounters?: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = { ...(baseCounters ?? {}) };
  if (!steps) return result;
  for (const [stepName, runs] of Object.entries(steps)) {
    result[stepName] = runs.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// JobJournal class
// ---------------------------------------------------------------------------

/**
 * Manages journal append, delta computation, and state.json persistence for a job.
 * Delegates path resolution to a JobLocationResolver.
 */
export class JobJournal {
  private readonly resolver: JobLocationResolver;

  constructor(resolver: JobLocationResolver) {
    this.resolver = resolver;
  }

  /**
   * Atomically persist the state to disk using the appropriate layout.
   *
   * For each call:
   * 1. Compute history delta = entries after stored historyCount
   * 2. Compute steps delta = runs after stored stepCounts per step
   * 3. Append delta records to events.jsonl
   * 4. Update counters
   * 5. Atomically overwrite state.json
   *
   * Accepts both NormalizedJobState and plain JobState.
   */
  async persist(state: JobState): Promise<void> {
    const stateJsonPath = this.resolver.getStateJsonPath();
    const eventsPath = this.resolver.getEventsPath();
    const inSlugMode = this.resolver.isSlugMode();

    // Check if split layout exists; if not, write both files fresh
    let existingCounters: JournalCounters | null = null;
    try {
      const rawState = await fs.readFile(stateJsonPath, "utf-8");
      const parsed = JSON.parse(rawState) as Record<string, unknown>;
      const journalField = parsed["_journal"];
      if (journalField && typeof journalField === "object") {
        existingCounters = journalField as JournalCounters;
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
      // File doesn't exist yet — write fresh
    }

    if (existingCounters === null) {
      // Fresh write: append all history and steps to events.jsonl
      await writeAllToJournal(eventsPath, state);
      const counters: JournalCounters = {
        historyCount: state.history.length,
        stepCounts: buildStepCounts((state as NormalizedJobState).steps),
      };
      await atomicWriteJson(stateJsonPath, { ...stateToStateJson(state, { slugMode: inSlugMode }), _journal: counters });
      return;
    }

    // Fast path: if stored counters already cover all in-memory events, skip the O(n) fold.
    const stepsForFastPath = (state as NormalizedJobState).steps ?? {};
    const inMemoryStepCounts = buildStepCounts(stepsForFastPath);
    const fastPathEligible =
      existingCounters.historyCount >= state.history.length &&
      Object.keys(inMemoryStepCounts).every(
        (s) => (existingCounters!.stepCounts[s] ?? 0) >= (inMemoryStepCounts[s] ?? 0),
      );
    if (fastPathEligible) {
      // No new events since last persist — only cursor fields may have changed.
      await atomicWriteJson(stateJsonPath, { ...stateToStateJson(state, { slugMode: inSlugMode }), _journal: existingCounters });
      return;
    }

    // Fold current journal to get true counts (for crash recovery, D3).
    let foldResult: FoldResult;
    try {
      const eventsContent = await fs.readFile(eventsPath, "utf-8");
      foldResult = fold(eventsContent);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        foldResult = { steps: {}, history: [], stepsTotal: 0, stepCounts: {}, historyCount: 0, lineage: [], operatorEvents: [], findingRecency: [] };
      } else {
        throw err;
      }
    }

    // Fail-closed: reject corrupt journal (mid-journal invalid JSON or non-object line)
    if (foldResult.corruption) {
      throw journalCorruptedError(
        eventsPath,
        describeJournalIssue({ kind: "corrupt-record", corruption: foldResult.corruption }),
      );
    }

    // Fail-closed: reject counter reversal (journal was truncated externally)
    const reversal = detectCounterReversal(existingCounters, foldResult);
    if (reversal !== null) {
      throw journalCorruptedError(
        eventsPath,
        describeJournalIssue({ kind: "counter-reversal", reversal }),
      );
    }

    // After the reversal check, fold >= stored for all counters.
    // Spread foldResult.stepCounts over existingCounters.stepCounts so new steps
    // from the fold (crash-recovery: fold > stored) are included.
    const recoveredCounters: JournalCounters = {
      historyCount: foldResult.historyCount,
      stepCounts: { ...existingCounters.stepCounts, ...foldResult.stepCounts },
    };

    // Compute and append history delta
    const historyDelta = state.history.slice(recoveredCounters.historyCount);
    for (const entry of historyDelta) {
      await appendEventRecord(eventsPath, historyEntryToRecord(entry));
    }

    // Compute and append steps delta
    const steps = (state as NormalizedJobState).steps ?? {};
    for (const [stepName, runs] of Object.entries(steps)) {
      const storedCount = recoveredCounters.stepCounts[stepName] ?? 0;
      const deltaRuns = runs.slice(storedCount);
      for (const run of deltaRuns) {
        await appendEventRecord(eventsPath, stepRunToRecord(stepName, run));
      }
    }

    // Update counters
    const newCounters: JournalCounters = {
      historyCount: recoveredCounters.historyCount + historyDelta.length,
      stepCounts: buildStepCounts(steps, recoveredCounters.stepCounts),
    };

    // Write state.json
    await atomicWriteJson(stateJsonPath, { ...stateToStateJson(state, { slugMode: inSlugMode }), _journal: newCounters });
  }

  /**
   * Append a history entry and persist atomically.
   */
  async appendHistory(state: JobState, entry: HistoryEntry): Promise<JobState> {
    const updated = appendHistoryEntry(state, entry);
    await this.persist(updated);
    return updated;
  }

  /**
   * Append an interruption record to the events journal.
   * Does not update state.json — callers should persist() separately if needed.
   */
  async appendInterruption(record: InterruptionRecord): Promise<void> {
    await appendEventRecord(this.resolver.getEventsPath(), record);
  }

  /**
   * Append a lineage record to the events journal (D1, artifact-observability).
   * Does not update state.json — lineage is journal-only and never materialized
   * into NormalizedJobState (keeps projection lean).
   * Best-effort: callers catch and swallow errors (usage.json append pattern).
   */
  async appendLineage(record: LineageRecord): Promise<void> {
    await appendEventRecord(this.resolver.getEventsPath(), record);
  }

  /**
   * Append an operator event record to the events journal (D1, reopen-journal).
   * Does not update state.json — operator events are journal-only evidence.
   * Appended BEFORE the corresponding lifecycle transition is persisted,
   * ensuring the event is durable even if the subsequent persist fails.
   */
  async appendOperatorEvent(record: OperatorEventRecord): Promise<void> {
    await appendEventRecord(this.resolver.getEventsPath(), record);
  }

  /**
   * Append a finding-recency record to the events journal (D4, spec-review-full-enumeration).
   * Does not update state.json — finding-recency is journal-only and never materialized
   * into NormalizedJobState (observation signal, not state mutation).
   * Best-effort: callers wrap in try/catch (same pattern as appendLineage).
   */
  async appendFindingRecency(record: FindingRecencyRecord): Promise<void> {
    await appendEventRecord(this.resolver.getEventsPath(), record);
  }
}
