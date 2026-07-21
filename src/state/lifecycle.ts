/**
 * Job lifecycle module — canonical source for transition rules and status constants.
 *
 * Design decisions:
 * D1: transitionJob is a pure function (no I/O)
 * D2: VALID_TRANSITIONS uses ReadonlyMap + ReadonlySet for immutability
 * D3: Same-status transitions return noop: true (idempotent case)
 * D4: Terminal status transitions throw (except noop)
 * D5: TransitionContext.trigger is recorded in history for forensics
 * D7: appendHistoryEntry is reused from schema.ts
 * D8: patch type constrains which fields can be overwritten
 */

import { appendHistoryEntry } from "./schema.js";
import type { JobState, JobStatus } from "./schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransitionContext {
  trigger: string;   // "pipeline", "signal-handler", "finish" etc.
  reason: string;    // human-readable transition reason
  patch?: Partial<Omit<JobState, "version" | "jobId" | "createdAt" | "status" | "history" | "profile">>;
}

export interface TransitionResult {
  state: JobState;
  noop: boolean;     // same-status transition (idempotent case)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VALID_TRANSITIONS: ReadonlyMap<JobStatus, ReadonlySet<JobStatus>> = new Map([
  ["running",          new Set(["awaiting-resume", "awaiting-archive", "failed", "terminated", "canceled"])],
  ["awaiting-resume",  new Set(["running", "canceled"])],
  ["awaiting-archive", new Set(["archived", "canceled"])],
  ["failed",           new Set(["running", "canceled", "awaiting-resume"])],
  ["terminated",       new Set(["running", "canceled"])],
  ["archived",         new Set()],
  ["canceled",         new Set()],
]);

/**
 * Operator-scoped reopen transitions.
 * Only accessible via the explicit `job reopen` command (allowReopen opt-in).
 * The general `canTransition` guard and `job resume` path must NOT consult this table.
 *
 * D1 (reopen-fsm): awaiting-archive → running is permitted only through
 * an explicit operator action with reason + journal recording.
 */
export const REOPEN_TRANSITIONS: ReadonlyMap<JobStatus, ReadonlySet<JobStatus>> = new Map([
  ["awaiting-archive", new Set(["running"])],
]);

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set(["archived", "canceled"]);

export const ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set(["running", "awaiting-resume"]);

// ---------------------------------------------------------------------------
// Guard functions
// ---------------------------------------------------------------------------

/**
 * Returns true if the transition from → to is allowed.
 * Same-status transitions always return true (noop is always permitted).
 */
export function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return true;  // noop is always permitted
  return VALID_TRANSITIONS.get(from)?.has(to) ?? false;
}

/**
 * Returns true if the given status is terminal (archived or canceled).
 */
export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ---------------------------------------------------------------------------
// Core transition function
// ---------------------------------------------------------------------------

/**
 * Optional opts for operator-scoped transition overrides.
 * allowReopen: when true, also consults REOPEN_TRANSITIONS for allowed edges.
 * Must only be passed by ReopenCommand.prepare() — never by resume or other callers.
 */
export interface TransitionOpts {
  allowReopen?: boolean;
}

/**
 * Pure transition function — validates the transition, appends a history entry,
 * merges any patch, and updates status + updatedAt.
 *
 * Throws if the transition is invalid (non-noop transition from/to incompatible statuses).
 * Returns { state, noop: true } for same-status transitions without modifying the state.
 *
 * @param opts.allowReopen - When true, also permits edges in REOPEN_TRANSITIONS.
 *   Only ReopenCommand.prepare() should pass this. All other callers (resume, etc.)
 *   must omit opts so the general guard remains enforced.
 */
export function transitionJob(
  state: JobState,
  to: JobStatus,
  ctx: TransitionContext,
  opts?: TransitionOpts,
): TransitionResult {
  // Same status → noop (idempotent)
  if (state.status === to) {
    return { state, noop: true };
  }

  // Validate transition: normal edges first, then operator-scoped reopen edge if opt-in
  const allowed = VALID_TRANSITIONS.get(state.status);
  const reopenAllowed = opts?.allowReopen === true && (REOPEN_TRANSITIONS.get(state.status)?.has(to) ?? false);
  if ((!allowed || !allowed.has(to)) && !reopenAllowed) {
    throw new Error(
      `Invalid transition: ${state.status} → ${to} (trigger: ${ctx.trigger}, reason: ${ctx.reason})`,
    );
  }

  // Append history entry via existing appendHistoryEntry (handles MAX_HISTORY_SIZE)
  let updated = appendHistoryEntry(state, {
    ts: new Date().toISOString(),
    step: ctx.trigger,
    status: "ok",
    message: `${state.status} → ${to}: ${ctx.reason}`,
  });

  // Merge patch (excludes protected fields via TransitionContext type)
  if (ctx.patch) {
    updated = { ...updated, ...ctx.patch };
  }

  // Apply new status (always after patch to ensure status is correct)
  updated = { ...updated, status: to, updatedAt: new Date().toISOString() };

  return { state: updated, noop: false };
}
