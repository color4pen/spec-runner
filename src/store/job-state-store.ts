import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import {
  slugStateJsonPath,
  slugEventsPath,
  changeFolderPath,
  parseArchiveDirName,
  managedMarkerPath,
  localSlugStateJsonPath,
  localSlugEventsPath,
} from "../util/paths.js";
import { listLocalSidecars } from "./local-job-index.js";
import { atomicWriteJson } from "../util/atomic-write.js";
import { appendHistoryEntry, validateJobState } from "../state/schema.js";
import type { JobState, StepRun, ErrorInfo, HistoryEntry, RequestInfo, RepositoryInfo } from "../state/schema.js";
import { STANDARD_PIPELINE_ID } from "../kernel/pipeline-ids.js";
import { transitionJob } from "../state/lifecycle.js";
import { SpecRunnerError, ERROR_CODES, ambiguousJobIdError } from "../errors.js";
import {
  fold,
  appendEventRecord,
  stepRunToRecord,
  historyEntryToRecord,
} from "./event-journal.js";
import type { FoldResult, InterruptionRecord, LineageRecord } from "./event-journal.js";

/**
 * Normalized view of a JobState with steps as StepRun[].
 * This is the type returned by JobStateStore after normalization.
 */
export type NormalizedJobState = Omit<JobState, "steps"> & {
  steps: Record<string, StepRun[]>;
};

// ---------------------------------------------------------------------------
// Internal journal counter structure stored in state.json
// ---------------------------------------------------------------------------

/**
 * Journal counters stored inside state.json under the `_journal` key.
 * Used for O(1) delta detection in persist().
 */
interface JournalCounters {
  /** Total transition records in events.jsonl. */
  historyCount: number;
  /** Per-step record counts in events.jsonl. */
  stepCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Slug inject options for loadSplitLayout
// ---------------------------------------------------------------------------

interface SlugInjectOptions {
  slug: string;
  stateRoot: string;
}

// ---------------------------------------------------------------------------
// buildInitialJobState — pure factory (no I/O)
// ---------------------------------------------------------------------------

/**
 * Build an initial JobState object without performing any I/O.
 * Pure function: generates a new jobId and constructs the in-memory state.
 * Callers (LocalRuntime.bootstrapJob, ManagedRuntime.bootstrapJob) use this to
 * defer persistence to after workspace establishment.
 */
export function buildInitialJobState(params: {
  request: RequestInfo;
  repository: RepositoryInfo;
  pipelineId?: string;
  /** Reviewer snapshots loaded and validated at job start. Absent = no custom reviewers. */
  reviewers?: import("../core/reviewers/types.js").ReviewerSnapshot[];
}): JobState {
  const jobId = randomUUID();
  const now = new Date().toISOString();

  const initialHistoryEntry: HistoryEntry = {
    ts: now,
    step: "init",
    status: "started",
    message: "job created",
  };

  const state: JobState = {
    version: 2,
    jobId,
    createdAt: now,
    updatedAt: now,
    request: {
      ...params.request,
      slug: params.request.slug !== undefined ? params.request.slug : null,
    },
    repository: params.repository,
    session: null,
    step: "init",
    status: "running",
    pid: process.pid,
    branch: null,
    history: [initialHistoryEntry],
    error: null,
    pipelineId: params.pipelineId ?? STANDARD_PIPELINE_ID,
  };

  if (params.reviewers && params.reviewers.length > 0) {
    state.reviewers = params.reviewers;
  }

  return state;
}

// ---------------------------------------------------------------------------
// JobStateStore class
// ---------------------------------------------------------------------------

/**
 * JobStateStore wraps the job state with typed read/write operations.
 *
 * Storage layouts:
 *   Slug-based current/archive:
 *                {stateRoot}/specrunner/changes/{slug}/events.jsonl
 *                {stateRoot}/specrunner/changes/{slug}/state.json
 *   Slug-based with explicit changeDir (managed sidecar / D3):
 *                {changeDir}/events.jsonl
 *                {changeDir}/state.json
 *
 * Static methods (class-level operations):
 * - list(): list all valid job states (slug-based current, archive, worktrees, managed markers)
 * - resolveId(): resolve a short prefix to a full jobId
 *
 * Instance methods (per-job operations):
 * - load(): read from slug/changeDir, validate and normalize (throws if neither is set)
 * - persist(): delta-append to journal + atomically overwrite state.json
 * - appendHistory(): append a history entry to journal and return updated state
 * - appendInterruption(): append an interruption record to the journal
 * - update(): update fields and persist atomically
 * - fail(): mark as failed and persist
 * - appendStepRun(): append a StepRun to journal and persist
 * - getLatestStepRun(): return the most recent StepRun for a step
 */
export class JobStateStore {
  private readonly jobId: string;
  private readonly repoRoot: string;
  private readonly slug?: string;
  private readonly stateRoot?: string;
  /**
   * D3 (changeDir seam): when set, overrides slug-convention path resolution.
   * getStateJsonPath() → changeDir/state.json
   * getEventsPath()    → changeDir/events.jsonl
   * slug + stateRoot must still be provided for slugInject (request.slug / request.path injection).
   */
  private readonly changeDir?: string;

  constructor(jobId: string, repoRoot: string, opts?: { slug?: string; stateRoot?: string; changeDir?: string }) {
    this.jobId = jobId;
    this.repoRoot = repoRoot;
    this.slug = opts?.slug;
    this.stateRoot = opts?.stateRoot;
    this.changeDir = opts?.changeDir;
  }

  private isSlugMode(): boolean {
    return !!(this.slug && this.stateRoot);
  }

  private getEventsPath(): string {
    if (this.changeDir) {
      return path.join(this.changeDir, "events.jsonl");
    }
    if (this.isSlugMode()) {
      return path.join(this.stateRoot!, slugEventsPath(this.slug!));
    }
    throw new SpecRunnerError(
      ERROR_CODES.STATE_FILE_INVALID,
      "Internal invariant violation: JobStateStore requires slug+stateRoot or changeDir.",
      `getEventsPath: no slug or changeDir for jobId ${this.jobId}`,
    );
  }

  private getStateJsonPath(): string {
    if (this.changeDir) {
      return path.join(this.changeDir, "state.json");
    }
    if (this.isSlugMode()) {
      return path.join(this.stateRoot!, slugStateJsonPath(this.slug!));
    }
    throw new SpecRunnerError(
      ERROR_CODES.STATE_FILE_INVALID,
      "Internal invariant violation: JobStateStore requires slug+stateRoot or changeDir.",
      `getStateJsonPath: no slug or changeDir for jobId ${this.jobId}`,
    );
  }

  // -------------------------------------------------------------------------
  // Static methods
  // -------------------------------------------------------------------------

  /**
   * List all valid job states from slug-based stores.
   * Scans (1) slug-based states in current checkout and local worktrees,
   * (2) archived states (only when opts.includeArchived === true),
   * (3) machine-local sidecar supplement, (4) managed markers.
   * Deduplicates by jobId: newest updatedAt wins.
   *
   * By default archived states are skipped entirely (no directory scan).
   * Pass { includeArchived: true } to include archived states (e.g. --all, job show).
   */
  static async list(repoRoot: string, opts?: { includeArchived?: boolean }): Promise<JobState[]> {
    const stateMap = new Map<string, JobState>(); // jobId → most-recent state

    const tryMerge = (state: JobState) => {
      const existing = stateMap.get(state.jobId);
      if (!existing || new Date(state.updatedAt) > new Date(existing.updatedAt)) {
        stateMap.set(state.jobId, state);
      }
    };

    // 1. Slug-based states in current checkout (specrunner/changes/*/state.json)
    const changesDir = path.join(repoRoot, "specrunner", "changes");
    try {
      const entries = await fs.readdir(changesDir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip reserved subdirectories: archive/ (finished jobs) and canceled/ (canceled gravestones)
        if (!entry.isDirectory() || entry.name === "archive" || entry.name === "canceled") continue;
        const slug = entry.name;
        const stateJsonPath = path.join(repoRoot, slugStateJsonPath(slug));
        const eventsPath = path.join(repoRoot, slugEventsPath(slug));
        try {
          const state = await loadSplitLayout(stateJsonPath, eventsPath, { slug, stateRoot: repoRoot });
          tryMerge(state);
        } catch {
          // Skip malformed slug state in current checkout
        }
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }

    // 1b. Archived states in current checkout (specrunner/changes/archive/*/state.json)
    // Only scanned when opts.includeArchived === true to avoid O(archive-size) cost on every list().
    if (opts?.includeArchived === true) {
      const archiveDir = path.join(repoRoot, "specrunner", "changes", "archive");
      try {
        const archiveEntries = await fs.readdir(archiveDir, { withFileTypes: true });
        for (const entry of archiveEntries) {
          if (!entry.isDirectory()) continue;
          const datedSlug = entry.name;
          // Extract slug from "<YYYY-MM-DD>-<slug>" (strip date prefix if present)
          const { slug: archiveSlug } = parseArchiveDirName(datedSlug);
          const stateJsonPath = path.join(archiveDir, datedSlug, "state.json");
          const eventsPath = path.join(archiveDir, datedSlug, "events.jsonl");
          try {
            const state = await loadSplitLayout(stateJsonPath, eventsPath, { slug: archiveSlug, stateRoot: repoRoot });
            tryMerge(state);
          } catch {
            // Skip malformed archive state
          }
        }
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw err;
      }
    }

    // 2. Slug-based states in local worktrees (.git/specrunner-worktrees/*/specrunner/changes/*/state.json)
    const worktreesDir = path.join(repoRoot, ".git", "specrunner-worktrees");
    try {
      const worktreeDirs = await fs.readdir(worktreesDir, { withFileTypes: true });
      for (const worktreeEntry of worktreeDirs) {
        if (!worktreeEntry.isDirectory()) continue;
        const worktreePath = path.join(worktreesDir, worktreeEntry.name);
        const changesInWorktree = path.join(worktreePath, "specrunner", "changes");
        try {
          const slugEntries = await fs.readdir(changesInWorktree, { withFileTypes: true });
          for (const slugEntry of slugEntries) {
            if (!slugEntry.isDirectory() || slugEntry.name === "archive") continue;
            const slug = slugEntry.name;
            const stateJsonPath = path.join(worktreePath, slugStateJsonPath(slug));
            const eventsPath = path.join(worktreePath, slugEventsPath(slug));
            try {
              const state = await loadSplitLayout(stateJsonPath, eventsPath, { slug, stateRoot: worktreePath });
              tryMerge(state);
            } catch {
              // Skip malformed worktree slug state
            }
          }
        } catch {
          // Worktree has no changes dir — skip
        }
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }

    // 3. Sidecar supplement (D2): for local entries not yet in stateMap, try worktreePath slug dir.
    // Sections 1/1b/2 cover main-checkout active, archived, and standard worktrees.
    // This supplement adds coverage for non-standard worktree paths and future edge cases.
    const localSidecars = await listLocalSidecars(repoRoot);
    for (const sidecarEntry of localSidecars) {
      if (sidecarEntry.kind !== "local") continue; // managed handled by section 4
      if (stateMap.has(sidecarEntry.jobId)) continue; // already found
      if (!sidecarEntry.worktreePath) continue; // no worktree to try

      const sidecarStateJsonPath = path.join(sidecarEntry.worktreePath, slugStateJsonPath(sidecarEntry.slug));
      const sidecarEventsPath = path.join(sidecarEntry.worktreePath, slugEventsPath(sidecarEntry.slug));
      try {
        const state = await loadSplitLayout(sidecarStateJsonPath, sidecarEventsPath, {
          slug: sidecarEntry.slug,
          stateRoot: sidecarEntry.worktreePath,
        });
        tryMerge(state);
      } catch {
        // Worktree slug dir not accessible — state not available, skip (jobId preserved in resolveId)
      }
    }

    // 4. Managed markers (.specrunner/local/<slug>/marker.json) — D7
    // Enumerate local managed job markers to find managed active jobs.
    // For each marker, try to load state from the co-located .specrunner/local/<slug>/state.json.
    const localSidecarBase = path.join(repoRoot, ".specrunner", "local");
    try {
      const localEntries = await fs.readdir(localSidecarBase, { withFileTypes: true });
      for (const localEntry of localEntries) {
        if (!localEntry.isDirectory()) continue;
        const slug = localEntry.name;
        const markerAbsPath = path.join(repoRoot, managedMarkerPath(slug));
        try {
          const markerRaw = await fs.readFile(markerAbsPath, "utf-8");
          const marker = JSON.parse(markerRaw) as Record<string, unknown>;
          const markerJobId = typeof marker["jobId"] === "string" ? marker["jobId"] : null;
          if (!markerJobId) continue;

          // Skip if already found by another scan (dedup by jobId)
          if (stateMap.has(markerJobId)) continue;

          // Try to load from co-located .specrunner/local/<slug>/state.json (D4)
          const markerStateJsonPath = path.join(repoRoot, localSlugStateJsonPath(slug));
          const markerEventsPath = path.join(repoRoot, localSlugEventsPath(slug));
          try {
            const state = await loadSplitLayout(markerStateJsonPath, markerEventsPath);
            tryMerge(state);
          } catch {
            // State file not found locally — skip; marker alone cannot reconstruct full state
          }
        } catch {
          // Skip malformed or missing marker
        }
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }

    return Array.from(stateMap.values());
  }

  /**
   * Resolve a full job UUID from a prefix (short ID) or full UUID.
   *
   * - Full UUID (36 chars): returned as-is without calling list() or sidecar index.
   * - Short prefix: candidate set = list() jobIds ∪ sidecar index jobIds (dedup).
   *   - 0 matches: throws JOB_NOT_FOUND
   *   - 1 match: returns the full UUID
   *   - 2+ matches: throws AMBIGUOUS_JOB_ID with candidate list in hint
   *
   * The sidecar union ensures degraded local jobs (worktree deleted, not yet archived)
   * whose jobId is only in liveness.json are still prefix-resolvable (requirement 5).
   */
  static async resolveId(repoRoot: string, prefix: string): Promise<string> {
    // Full UUID v4 is exactly 36 characters (8-4-4-4-12 + 4 hyphens)
    if (prefix.length === 36) {
      return prefix;
    }

    // Candidate set: list() jobIds ∪ sidecar index jobIds (D3)
    // includeArchived: true so archived jobs remain resolvable by prefix.
    const [states, sidecarEntries] = await Promise.all([
      JobStateStore.list(repoRoot, { includeArchived: true }),
      listLocalSidecars(repoRoot),
    ]);

    const candidateIds = new Set<string>(states.map((s) => s.jobId));
    for (const entry of sidecarEntries) {
      candidateIds.add(entry.jobId);
    }

    const matches = Array.from(candidateIds).filter((id) => id.startsWith(prefix));

    if (matches.length === 0) {
      throw new SpecRunnerError(
        ERROR_CODES.JOB_NOT_FOUND,
        "Run 'specrunner ps' to list available job IDs.",
        `Job not found: no job ID starts with '${prefix}'`,
      );
    }

    if (matches.length === 1) {
      return matches[0]!;
    }

    throw ambiguousJobIdError(prefix, matches);
  }

  // -------------------------------------------------------------------------
  // Instance methods
  // -------------------------------------------------------------------------

  /**
   * Load and validate a job state from disk.
   *
   * Requires either slug+stateRoot or changeDir to be set; throws an internal
   * invariant error otherwise. ENOENT from the underlying file read propagates
   * to the caller.
   *
   * Crash recovery (D3): if fold row count > stored counter, resets counter to
   * fold count before computing any delta.
   */
  async load(): Promise<NormalizedJobState> {
    return await loadSplitLayout(
      this.getStateJsonPath(),
      this.getEventsPath(),
      this.isSlugMode() ? { slug: this.slug!, stateRoot: this.stateRoot! } : undefined,
    );
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
    const stateJsonPath = this.getStateJsonPath();
    const eventsPath = this.getEventsPath();
    const inSlugMode = this.isSlugMode();

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
        stepCounts: buildStepCounts(state.steps),
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
        (s) => (existingCounters.stepCounts[s] ?? 0) >= (inMemoryStepCounts[s] ?? 0),
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
        foldResult = { steps: {}, history: [], stepsTotal: 0, stepCounts: {}, historyCount: 0, lineage: [] };
      } else {
        throw err;
      }
    }

    // Crash recovery: if fold count > stored counter, reset counters (D3)
    const recoveredCounters: JournalCounters = {
      historyCount: Math.max(existingCounters.historyCount, foldResult.historyCount),
      stepCounts: mergeStepCountsMax(existingCounters.stepCounts, foldResult.stepCounts),
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
    await appendEventRecord(this.getEventsPath(), record);
  }

  /**
   * Append a lineage record to the events journal (D1, artifact-observability).
   * Does not update state.json — lineage is journal-only and never materialized
   * into NormalizedJobState (keeps projection lean).
   * Best-effort: callers catch and swallow errors (usage.json append pattern).
   */
  async appendLineage(record: LineageRecord): Promise<void> {
    await appendEventRecord(this.getEventsPath(), record);
  }

  /**
   * Update job state fields and persist atomically.
   */
  async update(
    state: JobState,
    patch: Partial<Omit<JobState, "version" | "jobId" | "createdAt">>,
  ): Promise<JobState> {
    const updated: JobState = {
      ...state,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.persist(updated);
    return updated;
  }

  /**
   * Mark a job as failed with error info and persist atomically.
   */
  async fail(
    state: JobState,
    errorInfo: ErrorInfo,
    step?: string,
  ): Promise<JobState> {
    const { state: updated } = transitionJob(state, "failed", {
      trigger: "store-fail",
      reason: errorInfo.message,
      patch: { error: errorInfo, step: step ?? state.step },
    });
    await this.persist(updated);
    return updated;
  }

  /**
   * Append a new StepRun to the given step's array and persist atomically.
   * Auto-assigns the attempt number as (existing.length + 1).
   */
  async appendStepRun(
    state: NormalizedJobState,
    stepName: string,
    run: Omit<StepRun, "attempt">,
  ): Promise<NormalizedJobState> {
    const existing = state.steps[stepName] ?? [];
    const attempt = existing.length + 1;
    const newRun: StepRun = { attempt, ...run };
    const updated: NormalizedJobState = {
      ...state,
      steps: {
        ...state.steps,
        [stepName]: [...existing, newRun],
      },
      updatedAt: new Date().toISOString(),
    };
    await this.persist(updated);
    return updated;
  }

  /**
   * Get the most recent StepRun for a given step.
   */
  getLatestStepRun(state: NormalizedJobState, stepName: string): StepRun | undefined {
    const runs = state.steps[stepName];
    if (!runs || runs.length === 0) return undefined;
    return runs[runs.length - 1];
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Load a split-layout job state from state.json + events.jsonl.
 * Performs crash recovery if fold count > stored counter.
 * If slugInject is provided, injects request.slug and request.path from convention,
 * and materializes resumePoint from lastInterruption if present in fold result.
 */
async function loadSplitLayout(
  stateJsonPath: string,
  eventsPath: string,
  slugInject?: SlugInjectOptions,
): Promise<NormalizedJobState> {
  // Read state.json
  const rawState = await fs.readFile(stateJsonPath, "utf-8");
  const parsedState = JSON.parse(rawState) as Record<string, unknown>;

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

  // Fold events.jsonl
  let foldResult: FoldResult = { steps: {}, history: [], stepsTotal: 0, stepCounts: {}, historyCount: 0, lineage: [] };
  try {
    const eventsContent = await fs.readFile(eventsPath, "utf-8");
    foldResult = fold(eventsContent);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
    // No events.jsonl yet — start with empty fold result
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
  let composedSteps = foldResult.steps;
  if (foldResult.stepsTotal === 0 && !parsedState["_journal"]) {
    const legacyStepsRaw = stateWithoutJournal["steps"];
    if (
      legacyStepsRaw &&
      typeof legacyStepsRaw === "object" &&
      !Array.isArray(legacyStepsRaw) &&
      Object.keys(legacyStepsRaw as object).length > 0
    ) {
      const legacyValidated = validateJobState({ ...stateWithoutJournal, history: [] });
      composedSteps = legacyValidated.steps ?? {};
    }
  }

  // Compose NormalizedJobState with journal-derived data
  const composed: NormalizedJobState = {
    ...validated,
    history: foldResult.history,
    steps: composedSteps,
  };

  return composed;
}

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
 * Extract the state fields that go into state.json.
 * In slug mode, strips machine-local fields (worktreePath, pid, session)
 * and derived fields (request.slug, request.path).
 */
function stateToStateJson(
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

/**
 * Merge two stepCounts records, taking the max value for each step.
 */
function mergeStepCountsMax(
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = { ...a };
  for (const [step, count] of Object.entries(b)) {
    result[step] = Math.max(result[step] ?? 0, count);
  }
  return result;
}
