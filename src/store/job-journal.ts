import * as fs from "node:fs/promises";
import * as path from "node:path";
import { JobLocationResolver } from "./job-location-resolver.js";
import { stateToStateJson } from "./job-state-projection.js";
import {
  fold,
  stepRunToRecord,
  historyEntryToRecord,
} from "./event-journal.js";
import type { FoldResult, InterruptionRecord, LineageRecord, LineageInput } from "./event-journal.js";
import { detectCounterReversal, describeJournalIssue } from "./journal-integrity.js";
import { atomicWriteString } from "../util/atomic-write.js";
import { appendHistoryEntry } from "../state/schema.js";
import type { JobState, StepRun, HistoryEntry } from "../state/schema.js";
import { journalCorruptedError } from "../errors.js";
import type { NormalizedJobState } from "./job-state-store.js";
import type { JournalAnchorHolder } from "./journal-anchor.js";

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
 *
 * When a JournalAnchorHolder is injected, all journal mutations are reflected
 * in the holder so the pipeline can track the exact bytes it authored without
 * re-reading disk (D1 — no re-read after write).
 */
export class JobJournal {
  private readonly resolver: JobLocationResolver;
  private readonly holder: JournalAnchorHolder | undefined;

  constructor(resolver: JobLocationResolver, holder?: JournalAnchorHolder) {
    this.resolver = resolver;
    this.holder = holder;
  }

  // ---------------------------------------------------------------------------
  // Private helpers for holder tracking
  // ---------------------------------------------------------------------------

  /**
   * Append a JSON event line to events.jsonl AND to the holder (if injected).
   * Centralizes the holder tracking for all events mutations.
   */
  private async _appendEventLine(eventsPath: string, line: string): Promise<void> {
    await fs.appendFile(eventsPath, line, "utf-8");
    this.holder?.appendEvents(line);
  }

  /**
   * Write state.json atomically AND update the holder (if injected).
   * Pre-serializes the state object so we can pass the exact bytes to holder.setState().
   */
  private async _writeStateJson(stateJsonPath: string, stateObj: unknown): Promise<void> {
    const stateStr = JSON.stringify(stateObj, null, 2) + "\n";
    await atomicWriteString(stateJsonPath, stateStr);
    this.holder?.setState(stateStr);
  }

  /**
   * Seed the holder from on-disk files (resume scenario).
   * Called once when existingCounters !== null and holder is not yet seeded.
   * Reads events.jsonl + state.json exactly once, then seeds.
   */
  private async _seedHolderFromDisk(eventsPath: string, stateJsonPath: string): Promise<void> {
    if (!this.holder) return;
    if (this.holder.isSeeded()) return;

    const eventsContent = await fs.readFile(eventsPath, "utf-8").catch(() => "");
    const stateContent = await fs.readFile(stateJsonPath, "utf-8").catch(() => "");
    this.holder.seed(eventsContent, stateContent);
  }

  // ---------------------------------------------------------------------------
  // persist
  // ---------------------------------------------------------------------------

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
   * When a JournalAnchorHolder is injected, it is updated with the exact bytes
   * written so callers can verify authorship without re-reading disk (D1).
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
      await fs.mkdir(path.dirname(eventsPath), { recursive: true });
      for (const entry of state.history) {
        const line = JSON.stringify(historyEntryToRecord(entry)) + "\n";
        await this._appendEventLine(eventsPath, line);
      }
      const steps = (state as NormalizedJobState).steps ?? {};
      for (const [stepName, runs] of Object.entries(steps)) {
        for (const run of runs) {
          const line = JSON.stringify(stepRunToRecord(stepName, run)) + "\n";
          await this._appendEventLine(eventsPath, line);
        }
      }
      const counters: JournalCounters = {
        historyCount: state.history.length,
        stepCounts: buildStepCounts((state as NormalizedJobState).steps),
      };
      await this._writeStateJson(stateJsonPath, {
        ...stateToStateJson(state, { slugMode: inSlugMode }),
        _journal: counters,
      });
      this.holder?.markSeeded();
      return;
    }

    // Resume seed: if holder is injected but not yet seeded, seed from disk BEFORE writing delta
    if (this.holder && !this.holder.isSeeded()) {
      await this._seedHolderFromDisk(eventsPath, stateJsonPath);
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
      await this._writeStateJson(stateJsonPath, {
        ...stateToStateJson(state, { slugMode: inSlugMode }),
        _journal: existingCounters,
      });
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
        foldResult = { steps: {}, history: [], stepsTotal: 0, stepCounts: {}, historyCount: 0, lineage: [] };
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
      const line = JSON.stringify(historyEntryToRecord(entry)) + "\n";
      await this._appendEventLine(eventsPath, line);
    }

    // Compute and append steps delta
    const steps = (state as NormalizedJobState).steps ?? {};
    for (const [stepName, runs] of Object.entries(steps)) {
      const storedCount = recoveredCounters.stepCounts[stepName] ?? 0;
      const deltaRuns = runs.slice(storedCount);
      for (const run of deltaRuns) {
        const line = JSON.stringify(stepRunToRecord(stepName, run)) + "\n";
        await this._appendEventLine(eventsPath, line);
      }
    }

    // Update counters
    const newCounters: JournalCounters = {
      historyCount: recoveredCounters.historyCount + historyDelta.length,
      stepCounts: buildStepCounts(steps, recoveredCounters.stepCounts),
    };

    // Write state.json
    await this._writeStateJson(stateJsonPath, {
      ...stateToStateJson(state, { slugMode: inSlugMode }),
      _journal: newCounters,
    });
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
   *
   * When a holder is injected, the line is also appended to the holder.
   * If the holder is not yet seeded, seed from disk first (resume path).
   */
  async appendInterruption(record: InterruptionRecord): Promise<void> {
    const eventsPath = this.resolver.getEventsPath();
    // Seed holder from disk if not yet seeded (resume path: appendInterruption before first persist)
    if (this.holder && !this.holder.isSeeded()) {
      const stateJsonPath = this.resolver.getStateJsonPath();
      await this._seedHolderFromDisk(eventsPath, stateJsonPath);
    }
    const line = JSON.stringify(record) + "\n";
    await this._appendEventLine(eventsPath, line);
  }

  /**
   * Append a lineage record to the events journal (D1, artifact-observability).
   * Does not update state.json — lineage is journal-only and never materialized
   * into NormalizedJobState (keeps projection lean).
   * Best-effort: callers catch and swallow errors (usage.json append pattern).
   *
   * When a holder is injected, the line is also appended to the holder.
   */
  async appendLineage(record: LineageInput): Promise<void> {
    const eventsPath = this.resolver.getEventsPath();
    // Seed holder from disk if not yet seeded (resume path)
    if (this.holder && !this.holder.isSeeded()) {
      const stateJsonPath = this.resolver.getStateJsonPath();
      await this._seedHolderFromDisk(eventsPath, stateJsonPath);
    }
    const line = JSON.stringify(record) + "\n";
    await this._appendEventLine(eventsPath, line);
  }
}

