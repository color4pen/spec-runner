import { randomUUID } from "node:crypto";
import type { JobState, StepRun, ErrorInfo, HistoryEntry, RequestInfo, RepositoryInfo, EffectiveProfile } from "../state/schema.js";
import { STANDARD_PIPELINE_ID } from "../kernel/pipeline-ids.js";
import { STANDARD_PROFILE } from "../state/profile.js";
import { transitionJob } from "../state/lifecycle.js";
import type { InterruptionRecord, LineageRecord } from "./event-journal.js";
import { JobLocationResolver } from "./job-location-resolver.js";
import { JobJournal } from "./job-journal.js";
import { JobCatalog } from "./job-catalog.js";
import { loadSplitLayout } from "./job-state-projection.js";

/**
 * Normalized view of a JobState with steps as StepRun[].
 * This is the type returned by JobStateStore after normalization.
 */
export type NormalizedJobState = Omit<JobState, "steps"> & {
  steps: Record<string, StepRun[]>;
};

/**
 * An entry returned by JobStateStore.listWithSourceDirs().
 * Pairs each job state with the change directory it was loaded from,
 * so callers can resolve per-job artifacts (e.g. usage.json) without slug re-lookup.
 */
export interface ListedJobEntry {
  state: JobState;
  /**
   * Absolute path to the change directory that contains state.json (and usage.json)
   * for this job. Derived from the scan source: active slug dir, archive dir,
   * worktree slug dir, or sidecar worktree slug dir.
   * For managed-marker entries (section 4), this is the slug-based change dir
   * in the main checkout.
   */
  sourceChangeDir: string;
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
  /** Effective profile for this job. Absent = STANDARD_PROFILE. R1: always standard. */
  profile?: EffectiveProfile;
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
    profile: params.profile ?? STANDARD_PROFILE,
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

  private readonly _location: JobLocationResolver;
  private readonly _journal: JobJournal;

  constructor(jobId: string, repoRoot: string, opts?: { slug?: string; stateRoot?: string; changeDir?: string }) {
    this.jobId = jobId;
    this.repoRoot = repoRoot;
    this.slug = opts?.slug;
    this.stateRoot = opts?.stateRoot;
    this.changeDir = opts?.changeDir;
    this._location = new JobLocationResolver(jobId, repoRoot, opts);
    this._journal = new JobJournal(this._location);
  }

  private isSlugMode(): boolean {
    return this._location.isSlugMode();
  }

  private getEventsPath(): string {
    return this._location.getEventsPath();
  }

  private getStateJsonPath(): string {
    return this._location.getStateJsonPath();
  }

  // -------------------------------------------------------------------------
  // Static methods
  // -------------------------------------------------------------------------

  /**
   * List all valid job states from slug-based stores, paired with their source change directory.
   * Scans (1) slug-based states in current checkout and local worktrees,
   * (2) archived states (only when opts.includeArchived === true),
   * (3) machine-local sidecar supplement, (4) managed markers.
   * Deduplicates by jobId: newest updatedAt wins.
   *
   * Each entry carries the absolute sourceChangeDir from which the state was loaded,
   * so callers can resolve per-job artifacts (e.g. usage.json) without slug re-lookup.
   *
   * By default archived states are skipped entirely (no directory scan).
   * Pass { includeArchived: true } to include archived states (e.g. --all, job show).
   */
  static async listWithSourceDirs(repoRoot: string, opts?: { includeArchived?: boolean }): Promise<ListedJobEntry[]> {
    return JobCatalog.listWithSourceDirs(repoRoot, opts);
  }

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
    return JobCatalog.list(repoRoot, opts);
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
    return JobCatalog.resolveId(repoRoot, prefix);
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
    return this._journal.persist(state);
  }

  /**
   * Append a history entry and persist atomically.
   */
  async appendHistory(state: JobState, entry: HistoryEntry): Promise<JobState> {
    return this._journal.appendHistory(state, entry);
  }

  /**
   * Append an interruption record to the events journal.
   * Does not update state.json — callers should persist() separately if needed.
   */
  async appendInterruption(record: InterruptionRecord): Promise<void> {
    return this._journal.appendInterruption(record);
  }

  /**
   * Append a lineage record to the events journal (D1, artifact-observability).
   * Does not update state.json — lineage is journal-only and never materialized
   * into NormalizedJobState (keeps projection lean).
   * Best-effort: callers catch and swallow errors (usage.json append pattern).
   */
  async appendLineage(record: LineageRecord): Promise<void> {
    return this._journal.appendLineage(record);
  }

  /**
   * Update job state fields and persist atomically.
   * profile is excluded from patch: it is immutable-per-job (set at creation only).
   */
  async update(
    state: JobState,
    patch: Partial<Omit<JobState, "version" | "jobId" | "createdAt" | "profile">>,
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
