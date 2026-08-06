/**
 * Entrance fidelity gate: evaluates whether a GitHub issue's requirements are
 * fully accounted for in the request.md before the pipeline starts.
 *
 * Design:
 * - Pure function with injected collaborators (no direct I/O).
 * - Runs between buildDeps/registerCleanup and the first pipeline step.
 * - Fail-closed: any error (fetch failure / parse failure / missing comparator) halts.
 * - Non-propagation: issue body is used only as a local variable; never recorded
 *   in the returned GateDecision or in log output.
 *
 * Position (T-09): called from CommandRunner.execute() after registerCleanup and
 * before buildPipelineForJob + pipeline.run.
 */
import { STEP_NAMES } from "../step/step-names.js";
import { ERROR_CODES } from "../../errors.js";
import type { IssueFidelityComparator } from "../port/issue-fidelity-comparator.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GateDecision =
  /** Gate passed, or gate not applicable (no issue / not entrance / inbox skip). */
  | { kind: "proceed"; skipped?: { reason: string } }
  /** Gate halted: drop found, fetch failed, or wiring error. */
  | {
      kind: "halt";
      code: string;
      reason: string;
      /**
       * Discriminant for hint routing in runner.ts:
       * - "undeclared-drop": issue requirements missing from request.md → fix request.md
       * - "fetch-error": GitHub API / network failure fetching the issue → check network/token
       * - "internal-error": wiring error (comparator not injected) or comparator threw → check logs
       */
      haltKind: "undeclared-drop" | "fetch-error" | "internal-error";
    };

export interface EvaluateIssueFidelityGateParams {
  /** The step from which the pipeline (or resume) will start. Gate only fires at request-review. */
  startStep: string;
  /** GitHub issue number linked to this job. null/undefined = no issue, gate not applicable. */
  issueNumber: number | null | undefined;
  /** When true: job was started from inbox (issue body == request.md), gate skip. */
  inboxOrigin: boolean | undefined;
  owner: string;
  repo: string;
  /** Fetch a single issue by number. Throws on non-200 / network error. */
  getIssue(owner: string, repo: string, n: number): Promise<{ title: string; body: string }>;
  /** Read the full request.md content. Throws on file not found / permission error. */
  readRequestMd(): Promise<string>;
  /** Comparator implementation. undefined = wiring error → halt (fail-closed). */
  comparator: IssueFidelityComparator | undefined;
  /** Log function for gate status messages (skip reason, pass). Must NOT be called with issue body. */
  log(msg: string): void;
}

// ---------------------------------------------------------------------------
// evaluateIssueFidelityGate
// ---------------------------------------------------------------------------

/**
 * Evaluate the entrance fidelity gate.
 *
 * Decision logic (ordered):
 *  1. startStep !== request-review → proceed (entrance only)
 *  2. issueNumber == null/undefined → proceed (no issue linked)
 *  3. inboxOrigin === true → proceed with skip log (inbox: no divergence possible)
 *  4. comparator undefined → halt (wiring error, fail-closed)
 *  5. readRequestMd() throws → halt (fail-closed)
 *  6. getIssue() throws → halt(ISSUE_FETCH_FAILED)
 *  7. comparator.compare() throws → halt (fail-closed)
 *  8. undeclaredDrops.length > 0 → halt(ISSUE_FIDELITY_UNDECLARED_DROP)
 *  9. otherwise → proceed (gate passed)
 *
 * Non-propagation invariant: the issue body (from getIssue) is ONLY passed to
 * comparator.compare() and never included in the returned GateDecision or log output.
 */
export async function evaluateIssueFidelityGate(
  params: EvaluateIssueFidelityGateParams,
): Promise<GateDecision> {
  const {
    startStep,
    issueNumber,
    inboxOrigin,
    owner,
    repo,
    getIssue,
    readRequestMd,
    comparator,
    log,
  } = params;

  // 1. Entrance only: gate fires only when pipeline starts from request-review.
  if (startStep !== STEP_NAMES.REQUEST_REVIEW) {
    return { kind: "proceed" };
  }

  // 2. No issue linked → gate not applicable.
  if (issueNumber == null) {
    return { kind: "proceed" };
  }

  // 3. Inbox origin → issue body == request.md, no divergence possible.
  if (inboxOrigin === true) {
    const skipReason =
      "entrance fidelity gate skipped: inbox origin job (issue body is verbatim request.md, no divergence possible)";
    log(`[issue-fidelity-gate] ${skipReason}`);
    return { kind: "proceed", skipped: { reason: skipReason } };
  }

  // 4. Comparator not injected → wiring error, fail-closed.
  if (comparator === undefined) {
    return {
      kind: "halt",
      code: ERROR_CODES.ISSUE_FETCH_FAILED,
      reason:
        "entrance fidelity gate: comparator not injected (wiring error). Cannot evaluate issue fidelity.",
      haltKind: "internal-error",
    };
  }

  // 5. Read request.md — fail-closed on error.
  let requestMd: string;
  try {
    requestMd = await readRequestMd();
  } catch (err) {
    return {
      kind: "halt",
      code: ERROR_CODES.ISSUE_FETCH_FAILED,
      reason: `entrance fidelity gate: failed to read request.md: ${(err as Error).message ?? String(err)}`,
      haltKind: "internal-error",
    };
  }

  // 6. Fetch the linked issue — fail-closed on error.
  let issue: { title: string; body: string };
  try {
    issue = await getIssue(owner, repo, issueNumber);
  } catch (err) {
    return {
      kind: "halt",
      code: ERROR_CODES.ISSUE_FETCH_FAILED,
      reason: `entrance fidelity gate: failed to fetch issue #${issueNumber}: ${(err as Error).message ?? String(err)}`,
      haltKind: "fetch-error",
    };
  }

  // 7. Run comparator — fail-closed on error.
  // issue.body is used ONLY here: it goes into compare() and is not stored or logged.
  let comparison: import("../port/issue-fidelity-comparator.js").IssueFidelityComparison;
  try {
    comparison = await comparator.compare({
      issueTitle: issue.title,
      issueBody: issue.body,
      requestMd,
    });
  } catch (err) {
    return {
      kind: "halt",
      code: ERROR_CODES.ISSUE_FETCH_FAILED,
      reason: `entrance fidelity gate: comparator error: ${(err as Error).message ?? String(err)}`,
      haltKind: "internal-error",
    };
  }

  // 8. Undeclared drops → halt.
  // reason contains drop descriptions ONLY (not the issue body).
  if (comparison.undeclaredDrops.length > 0) {
    const dropList = comparison.undeclaredDrops
      .map((d, i) => `  ${i + 1}. ${d}`)
      .join("\n");
    return {
      kind: "halt",
      code: ERROR_CODES.ISSUE_FIDELITY_UNDECLARED_DROP,
      reason:
        `Entrance fidelity gate: issue #${issueNumber} requirements not covered in request.md (undeclared drops):\n${dropList}\n\n` +
        `Fix: restore the requirements in request.md or add them to the スコープ外 section, then resume.`,
      haltKind: "undeclared-drop",
    };
  }

  // 9. Gate passed.
  log(`[issue-fidelity-gate] pass: all issue #${issueNumber} requirements are accounted for in request.md`);
  return { kind: "proceed" };
}
