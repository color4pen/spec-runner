/**
 * Journal anchor — in-process and durable anchor for pipeline-authored journal bytes.
 *
 * Design:
 *   - computeJournalDigest: pure, deterministic SHA-256 digest of events + state bytes.
 *   - JournalAnchorHolder: in-process accumulator that tracks the exact bytes the pipeline wrote.
 *   - evaluateAnchorPresence: pure judgment about which baseline to use (D7 absent-anchor rules).
 *
 * All types in this file are pure (no I/O, no side effects).
 */
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// computeJournalDigest
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic SHA-256 digest of events.jsonl + state.json bytes.
 *
 * Uses a length-delimited concatenation to prevent collisions where swapping
 * events and state would produce the same digest.
 *
 * Format: `"events:" + len + ":" + events + "\n" + "state:" + len + ":" + state`
 * Returns: `"sha256:" + hex`
 */
export function computeJournalDigest(eventsBytes: string, stateBytes: string): string {
  const payload =
    `events:${eventsBytes.length}:${eventsBytes}\n` +
    `state:${stateBytes.length}:${stateBytes}`;
  const hex = createHash("sha256").update(payload, "utf-8").digest("hex");
  return `sha256:${hex}`;
}

// ---------------------------------------------------------------------------
// JournalAnchorHolder
// ---------------------------------------------------------------------------

/**
 * In-process holder for the pipeline-authored journal bytes.
 *
 * Accumulates the exact bytes that the pipeline writes to events.jsonl and
 * state.json in a single job scope. Provides a snapshot of the current digest
 * for comparison with on-disk bytes after each node commit.
 *
 * Thread-safety: not applicable (Node.js is single-threaded).
 */
export class JournalAnchorHolder {
  private eventsAccum: string | null = null;
  private stateStr: string | null = null;
  private _seeded: boolean = false;

  /** Returns true if the holder has been seeded (markSeeded called or seed called). */
  isSeeded(): boolean {
    return this._seeded;
  }

  /**
   * Seed the holder from existing on-disk bytes (resume scenario).
   * Called once before the first delta write when existing journal is detected.
   * Marks the holder as seeded.
   */
  seed(events: string, state: string): void {
    this.eventsAccum = events;
    this.stateStr = state;
    this._seeded = true;
  }

  /**
   * Append a line to the in-memory events accumulator.
   * Used for each line appended to events.jsonl.
   */
  appendEvents(line: string): void {
    this.eventsAccum = (this.eventsAccum ?? "") + line;
  }

  /**
   * Replace the in-memory state string.
   * Used each time state.json is written (atomic overwrite).
   */
  setState(state: string): void {
    this.stateStr = state;
  }

  /**
   * Mark the holder as seeded (after fresh write completes).
   * Called after the first persist() completes on a new journal.
   */
  markSeeded(): void {
    this._seeded = true;
  }

  /**
   * Return a snapshot of the current state.
   *
   * Returns null if neither events nor state have been set (no journal written yet).
   * If only one is set, the other is treated as empty string.
   */
  snapshot(): { events: string; state: string; digest: string } | null {
    if (this.eventsAccum === null && this.stateStr === null) {
      return null;
    }
    const events = this.eventsAccum ?? "";
    const state = this.stateStr ?? "";
    return {
      events,
      state,
      digest: computeJournalDigest(events, state),
    };
  }
}

// ---------------------------------------------------------------------------
// evaluateAnchorPresence
// ---------------------------------------------------------------------------

/**
 * Pure judgment about which anchor baseline to use, per design D7.
 *
 * Rules:
 * 1. Both absent + onDiskDigest null  → skip  (new job, no journal yet)
 * 2. Both absent + onDiskDigest present → tamper (fail-closed)
 * 3. inProcess absent + durable present → use(durable)
 * 4. inProcess present → use(inProcess) (regardless of durable)
 */
export function evaluateAnchorPresence(input: {
  inProcess: string | null;
  durable: string | null;
  onDiskDigest: string | null;
}): { kind: "skip" } | { kind: "use"; baseline: string } | { kind: "tamper" } {
  const { inProcess, durable, onDiskDigest } = input;

  if (inProcess !== null) {
    return { kind: "use", baseline: inProcess };
  }

  if (durable !== null) {
    return { kind: "use", baseline: durable };
  }

  // Both absent
  if (onDiskDigest === null) {
    return { kind: "skip" };
  }

  // Both absent but on-disk exists → tamper
  return { kind: "tamper" };
}
