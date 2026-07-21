import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fold } from "./event-journal.js";
import type { FoldResult, FoldCorruption } from "./event-journal.js";
import { validateJobState } from "../state/schema.js";
import type { JobState, RequestInfo } from "../state/schema.js";
import { changeFolderPath } from "../util/paths.js";
import { journalCorruptedError } from "../errors.js";
import { describeJournalIssue } from "./journal-integrity.js";
import { migrateSteps } from "./legacy-state-migrator.js";
import type { JournalCounters } from "./job-journal.js";
import type { NormalizedJobState } from "./job-state-store.js";

// Re-export for consumers that need it
export type { NormalizedJobState };

// ---------------------------------------------------------------------------
// Slug inject options for loadSplitLayout
// ---------------------------------------------------------------------------

export interface SlugInjectOptions {
  slug: string;
  stateRoot: string;
}

// ---------------------------------------------------------------------------
// composeSplitLayoutFromContent
// ---------------------------------------------------------------------------

/**
 * Compose a split-layout job state from raw string content (not file paths).
 * Returns both the composed NormalizedJobState and the fold's corruption field
 * (null when clean). Does NOT throw on journal corruption; still throws on
 * invalid state.json content.
 *
 * Used by composeSplitLayout (file-path wrapper) and verifyCheckpoint (attach path).
 *
 * @param stateJson    - Raw contents of state.json (must be non-empty valid JSON).
 * @param eventsJsonl  - Raw contents of events.jsonl; empty string means "no events" (empty fold).
 * @param slugInject   - Optional slug injection to derive request.slug / request.path from convention.
 */
export async function composeSplitLayoutFromContent(
  stateJson: string,
  eventsJsonl: string,
  slugInject?: SlugInjectOptions,
): Promise<{ state: NormalizedJobState; corruption: FoldCorruption | null }> {
  const parsedState = JSON.parse(stateJson) as Record<string, unknown>;

  // Extract journal counters (internal — not part of JobState)
  let storedCounters: JournalCounters = {
    historyCount: 0,
    stepCounts: {},
  };
  if (parsedState["_journal"] && typeof parsedState["_journal"] === "object") {
    storedCounters = parsedState["_journal"] as JournalCounters;
  }

  // Strip internal fields before validation
  const { _journal: _j, ...stateWithoutJournal } = parsedState as Record<string, unknown> & { _journal?: unknown };
  void _j; // suppress unused warning

  // Inject request fields from slug convention before validation (slug mode)
  if (slugInject) {
    const { slug, stateRoot } = slugInject;
    const reqObj = stateWithoutJournal["request"] as Record<string, unknown> | undefined;
    if (reqObj) {
      const requestMdAbsPath = path.join(stateRoot, changeFolderPath(slug), "request.md");
      if (!reqObj["slug"]) reqObj["slug"] = slug;
      if (!reqObj["path"]) reqObj["path"] = requestMdAbsPath;
    }
  }

  // Fold events.jsonl — empty string means "no events" (empty fold)
  let foldResult: FoldResult = { steps: {}, history: [], stepsTotal: 0, stepCounts: {}, historyCount: 0, lineage: [], operatorEvents: [] };
  if (eventsJsonl.length > 0) {
    foldResult = fold(eventsJsonl);
  }

  // Crash recovery (D3): if fold count > stored counter, journal has more data
  // than state.json knows about.
  if (
    foldResult.historyCount > storedCounters.historyCount ||
    foldResult.stepsTotal > Object.values(storedCounters.stepCounts).reduce((a, b) => a + b, 0)
  ) {
    // Counters are stale — use fold result (next persist will fix counters)
  }

  // Validate state.json fields (minus steps/history which come from journal)
  // Inject empty arrays so validateJobState doesn't fail
  const rawForValidation = { ...stateWithoutJournal, history: [], steps: {} };
  const validated = validateJobState(rawForValidation);

  // Materialize resumePoint from lastInterruption if present (T-11)
  // Journal is the truth; state.json resumePoint is a rebuildable cache.
  if (foldResult.lastInterruption) {
    const intr = foldResult.lastInterruption;
    validated.resumePoint = {
      step: (validated.step ?? "init") as import("../state/schema.js").StepName,
      reason: intr.reason,
      iterationsExhausted: intr.reason === "exhaustion" ? 1 : 0,
      ...(intr.exhaustionPhase ? { exhaustionPhase: intr.exhaustionPhase as import("../state/schema.js").ResumePoint["exhaustionPhase"] } : {}),
    };
  }

  // Legacy migration: if events.jsonl has no steps and state.json has no _journal
  // (pre-split-layout format), normalize legacy steps from state.json.
  const composedSteps = migrateSteps(foldResult, parsedState, stateWithoutJournal);

  // Compose NormalizedJobState with journal-derived data
  const composed: NormalizedJobState = {
    ...validated,
    history: foldResult.history,
    steps: composedSteps,
  };

  return { state: composed, corruption: foldResult.corruption ?? null };
}

// ---------------------------------------------------------------------------
// composeSplitLayout
// ---------------------------------------------------------------------------

/**
 * Compose a split-layout job state from state.json + events.jsonl.
 * Returns both the composed NormalizedJobState and the fold's corruption field
 * (null when clean). Does NOT throw on journal corruption; still throws on
 * missing/invalid state.json exactly as before.
 *
 * Used by list() (tolerant) and loadSplitLayout() (fail-closed wrapper).
 * Delegates to composeSplitLayoutFromContent after reading files.
 */
export async function composeSplitLayout(
  stateJsonPath: string,
  eventsPath: string,
  slugInject?: SlugInjectOptions,
): Promise<{ state: NormalizedJobState; corruption: FoldCorruption | null }> {
  // Read state.json (throws on ENOENT — unchanged behaviour)
  const rawState = await fs.readFile(stateJsonPath, "utf-8");

  // Read events.jsonl; ENOENT is "no events" (empty string)
  let eventsJsonl = "";
  try {
    eventsJsonl = await fs.readFile(eventsPath, "utf-8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
    // No events.jsonl yet — treat as empty
  }

  return composeSplitLayoutFromContent(rawState, eventsJsonl, slugInject);
}

// ---------------------------------------------------------------------------
// loadSplitLayout
// ---------------------------------------------------------------------------

/**
 * Fail-closed wrapper around composeSplitLayout.
 * Throws JOURNAL_CORRUPTED when the fold detects mid-journal corruption.
 * Used by load() and loadStateByJobId (resume/finish/cancel paths).
 */
export async function loadSplitLayout(
  stateJsonPath: string,
  eventsPath: string,
  slugInject?: SlugInjectOptions,
): Promise<NormalizedJobState> {
  const { state, corruption } = await composeSplitLayout(stateJsonPath, eventsPath, slugInject);
  if (corruption !== null) {
    throw journalCorruptedError(
      eventsPath,
      describeJournalIssue({ kind: "corrupt-record", corruption }),
    );
  }
  return state;
}

// ---------------------------------------------------------------------------
// stateToStateJson
// ---------------------------------------------------------------------------

/**
 * Extract the state fields that go into state.json.
 * In slug mode, strips machine-local fields (worktreePath, pid, session)
 * and derived fields (request.slug, request.path).
 */
export function stateToStateJson(
  state: JobState,
  opts?: { slugMode?: boolean },
): Omit<JobState, "history" | "steps"> {
  const { history: _h, steps: _s, ...rest } = state as JobState & { history: unknown; steps: unknown };
  void _h; void _s;

  if (!opts?.slugMode) {
    return rest as Omit<JobState, "history" | "steps">;
  }

  // Slug mode: strip machine-local fields
  const {
    worktreePath: _wt,
    pid: _pid,
    session: _sess,
    ...withoutMachineLocal
  } = rest as typeof rest & { worktreePath?: unknown; pid?: unknown; session?: unknown };
  void _wt; void _pid; void _sess;

  // Strip request.slug and request.path (derived from location convention)
  if (withoutMachineLocal.request) {
    const reqUnknown = withoutMachineLocal.request as unknown as Record<string, unknown>;
    const { slug: _rslug, path: _rpath, ...requestWithout } = reqUnknown;
    void _rslug; void _rpath;
    return {
      ...withoutMachineLocal,
      request: requestWithout as unknown as RequestInfo,
    } as Omit<JobState, "history" | "steps">;
  }

  return withoutMachineLocal as Omit<JobState, "history" | "steps">;
}

