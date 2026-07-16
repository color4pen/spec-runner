/**
 * verify-checkpoint — checkpoint self-consistency verification predicate.
 *
 * Verifies that a checkpoint tree is self-consistent before any local state
 * (worktree / sidecar / job state) is created.
 *
 * Implements ADR-20260715 D2: attach checks tree self-consistency and throws a
 * typed error on any violation — never creates local state on failure.
 *
 * This function performs NO I/O beyond the inputs it receives. It is pure in
 * the sense that it does not touch the filesystem, worktrees, or sidecars.
 *
 * Invariant (design.md §D3): all standard pipeline step reads() methods reference
 * only state and deps.slug — not config / request / cwd. The minimum StepDeps
 * constructed here (slug only) satisfies that contract.
 */
import { composeSplitLayoutFromContent } from "../../store/job-state-projection.js";
import { getPipelineDescriptor } from "../pipeline/registry.js";
import { getPipelineId } from "../../state/pipeline-id.js";
import { computePolicyDigest, SUPPORTED_PROFILE_SCHEMA_VERSION } from "../../state/profile.js";
import { getJobSlug } from "../../state/job-slug.js";
import { resolveResumeStep, buildAllowedStepSet } from "../resume/resolve-step.js";
import { requestMdPath, slugEventsPath } from "../../util/paths.js";
import { checkpointNotAttachableError } from "../../errors.js";
import { fold } from "../../store/event-journal.js";
import { detectCounterReversal } from "../../store/journal-integrity.js";
import type { NormalizedJobState } from "../../store/job-state-projection.js";
import type { StepDeps } from "../step/types.js";

// ---------------------------------------------------------------------------
// VerifiedCheckpoint
// ---------------------------------------------------------------------------

export interface VerifiedCheckpoint {
  state: NormalizedJobState;
  slug: string;
  jobId: string;
  branch: string;
  /** Immutable commit OID resolved once after fetch (D1/D2). Materialize MUST use this OID. */
  checkpointOid: string;
}

// ---------------------------------------------------------------------------
// verifyCheckpoint
// ---------------------------------------------------------------------------

/**
 * Verify that the checkpoint described by the inputs is self-consistent and
 * safe to attach. Returns a VerifiedCheckpoint on success; throws
 * checkpointNotAttachableError on any violation.
 *
 * Verification order (ADR-20260715 D2, design.md D3):
 *   (b-new) version 2: events.jsonl required in treeFiles
 *   (b)     journal / projection integrity via composeSplitLayoutFromContent
 *   (b-new) counter reversal: _journal counters vs fold counts
 *   (a)     status === "awaiting-resume" (quiescent — currently only awaiting-resume)
 *   (c)     resume point + pipeline definition resolvable
 *   (d-new) resume step reads() required file inputs present in treeFiles
 *   (d)     request.md present in treeFiles
 *   (e)     repository / jobId / branch / slug identity match
 *
 * @param input.slug          - Slug derived from the tree dir name.
 * @param input.stateJson     - Raw state.json string.
 * @param input.eventsJsonl   - Raw events.jsonl string (empty = no events).
 * @param input.treeFiles     - Repo-relative paths present in the ref tree.
 * @param input.branch        - Branch name (without "origin/" prefix).
 * @param input.expectedRepo  - Repository identity to verify against.
 * @param input.checkpointOid - Immutable commit OID resolved once after fetch (D1/D2).
 */
export async function verifyCheckpoint(input: {
  slug: string;
  stateJson: string;
  eventsJsonl: string;
  treeFiles: string[];
  branch: string;
  expectedRepo: { owner: string; name: string };
  checkpointOid: string;
}): Promise<VerifiedCheckpoint> {
  const { slug, stateJson, eventsJsonl, treeFiles, branch, expectedRepo, checkpointOid } = input;

  // (b-new) version 2: events.jsonl is required in treeFiles.
  // Parse raw state.json version before normalization so we see the wire value.
  let rawVersion: number | null = null;
  try {
    const rawParsed = JSON.parse(stateJson) as Record<string, unknown>;
    rawVersion = typeof rawParsed["version"] === "number" ? rawParsed["version"] : null;
  } catch {
    // Parse failure is surfaced by composeSplitLayoutFromContent below.
  }
  if (rawVersion === 2) {
    const eventsPath = slugEventsPath(slug);
    if (!treeFiles.includes(eventsPath)) {
      throw checkpointNotAttachableError(
        "events-missing",
        `version 2 checkpoint requires events.jsonl but '${eventsPath}' is not present in the ref tree.`,
      );
    }
  }

  // (b) Journal / projection integrity
  let state: NormalizedJobState;
  let corruption: import("../../store/event-journal.js").FoldCorruption | null;
  try {
    ({ state, corruption } = await composeSplitLayoutFromContent(stateJson, eventsJsonl));
  } catch (err: unknown) {
    throw checkpointNotAttachableError(
      "state-json-invalid",
      `Failed to parse or validate state.json: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (corruption !== null) {
    throw checkpointNotAttachableError(
      "journal-corrupted",
      `events.jsonl journal is corrupted: ${JSON.stringify(corruption)}`,
    );
  }

  // (b-new) Counter reversal: compare _journal stored counters against fold counts.
  // Detects journal truncation (truncated events.jsonl produces fewer records than stored).
  try {
    const rawParsed = JSON.parse(stateJson) as Record<string, unknown>;
    const journalField = rawParsed["_journal"];
    if (
      journalField !== null &&
      journalField !== undefined &&
      typeof journalField === "object" &&
      !Array.isArray(journalField)
    ) {
      const stored = journalField as { historyCount: number; stepCounts: Record<string, number> };
      if (typeof stored.historyCount === "number" && stored.stepCounts !== null && typeof stored.stepCounts === "object") {
        const foldResult = fold(eventsJsonl);
        const reversal = detectCounterReversal(stored, foldResult);
        if (reversal !== null) {
          throw checkpointNotAttachableError(
            "counter-reversal",
            `events.jsonl is truncated: ${reversal.field === "history"
              ? `history count ${reversal.actual} < stored ${reversal.stored}`
              : `step '${reversal.step}' count ${reversal.actual} < stored ${reversal.stored}`
            }`,
          );
        }
      }
    }
  } catch (err: unknown) {
    // Re-throw only SpecRunnerError (our typed error); ignore JSON parse errors.
    if (err instanceof Error && "code" in err) throw err;
  }

  // (profile) Stored profile self-consistency (ADR-20260716 D1/D6).
  // Only verified when profile is present; absent profile is backward-compat (resolves to standard).
  // Use raw state.profile presence — do not call getProfile() here to avoid confusing absent with present.
  if (state.profile !== undefined) {
    // Verify policyDigest matches the profile body (stored self-consistency, not re-resolution).
    const expectedDigest = computePolicyDigest(state.profile);
    if (expectedDigest !== state.profile.policyDigest) {
      throw checkpointNotAttachableError(
        "profile-inconsistent",
        `Profile '${state.profile.id}' policyDigest mismatch: stored '${state.profile.policyDigest}', computed '${expectedDigest}'.`,
      );
    }
    // Verify schemaVersion is interpretable by this runtime.
    if (state.profile.schemaVersion > SUPPORTED_PROFILE_SCHEMA_VERSION) {
      throw checkpointNotAttachableError(
        "profile-uninterpretable",
        `Profile '${state.profile.id}' schemaVersion ${state.profile.schemaVersion} exceeds supported version ${SUPPORTED_PROFILE_SCHEMA_VERSION}.`,
      );
    }
  }

  // (a) Status must be awaiting-resume (quiescent — currently only awaiting-resume is supported)
  if (state.status !== "awaiting-resume") {
    throw checkpointNotAttachableError(
      "not-quiescent",
      `state.status is '${state.status}', expected 'awaiting-resume'. Only awaiting-resume jobs can be attached.`,
    );
  }

  // (c) Resume point + pipeline definition resolvable
  let descriptor: ReturnType<typeof getPipelineDescriptor>;
  try {
    descriptor = getPipelineDescriptor(getPipelineId(state));
  } catch (err: unknown) {
    throw checkpointNotAttachableError(
      "pipeline-unresolvable",
      `Pipeline descriptor not found: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let resolvedStepName: string;
  try {
    resolvedStepName = resolveResumeStep(
      undefined,
      state.resumePoint ?? null,
      state.step,
      buildAllowedStepSet(state.reviewers),
      state.reviewers,
    );
  } catch (err: unknown) {
    throw checkpointNotAttachableError(
      "resume-step-unresolvable",
      `Cannot resolve resume step: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // (d-new) Resume step reads() tree-precheck: required file inputs must be in treeFiles.
  // Skip dynamic steps (coordinator / regression-gate) not in the static descriptor set.
  // Invariant: all standard pipeline step reads() reference only state + deps.slug
  // (audited; config / request / cwd are not accessed).
  const descriptorStepMap = new Map(descriptor.steps);
  const resumeStep = descriptorStepMap.get(resolvedStepName);
  if (resumeStep !== undefined && typeof resumeStep.reads === "function") {
    const minDeps = { slug } as unknown as StepDeps;
    let readsRefs: import("../step/types.js").IoRef[] = [];
    try {
      readsRefs = resumeStep.reads(state as import("../../state/schema.js").JobState, minDeps);
    } catch (err: unknown) {
      // reads() threw — scope unevaluable → fail-closed (scope-unevaluable → reject).
      // Cannot prove the resume step's required inputs will be present in the checkpoint tree.
      // Allowing attach when attachability cannot be proven creates a fail-open vulnerability
      // (B-11: scope-unevaluable → reject). The operator must fix the checkpoint or step
      // definition before attaching.
      throw checkpointNotAttachableError(
        "resume-reads-unevaluable",
        `Cannot evaluate reads() for resume step '${resolvedStepName}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    for (const ref of readsRefs) {
      if (ref.required !== false && ref.artifact !== "gitState") {
        if (!treeFiles.includes(ref.path)) {
          throw checkpointNotAttachableError(
            "resume-input-missing",
            `Resume step '${resolvedStepName}' requires '${ref.path}' but it is not present in the checkpoint tree.`,
          );
        }
      }
    }
  }

  // (d) request.md must be present in treeFiles
  const requiredPath = requestMdPath(slug);
  if (!treeFiles.includes(requiredPath)) {
    throw checkpointNotAttachableError(
      "missing-request-md",
      `Required file '${requiredPath}' is not present in the ref tree. treeFiles: ${treeFiles.slice(0, 10).join(", ")}${treeFiles.length > 10 ? "..." : ""}`,
    );
  }

  // (e) Repository / jobId / branch / slug identity
  if (state.repository.owner !== expectedRepo.owner || state.repository.name !== expectedRepo.name) {
    throw checkpointNotAttachableError(
      "repository-identity-mismatch",
      `state.repository is '${state.repository.owner}/${state.repository.name}', expected '${expectedRepo.owner}/${expectedRepo.name}'.`,
    );
  }

  if (!state.jobId || state.jobId.trim().length === 0) {
    throw checkpointNotAttachableError(
      "jobid-empty",
      `state.jobId is absent or empty.`,
    );
  }

  if (state.branch !== branch) {
    throw checkpointNotAttachableError(
      "branch-identity-mismatch",
      `state.branch is '${state.branch}', expected '${branch}'.`,
    );
  }

  const derivedSlug = getJobSlug(state as import("../../state/schema.js").JobState);
  if (derivedSlug !== slug) {
    throw checkpointNotAttachableError(
      "slug-identity-mismatch",
      `getJobSlug(state) is '${derivedSlug}', expected '${slug}' (from tree dir name).`,
    );
  }

  return { state, slug, jobId: state.jobId, branch, checkpointOid };
}
