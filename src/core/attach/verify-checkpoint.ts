/**
 * verify-checkpoint — checkpoint self-consistency verification predicate.
 *
 * Verifies that an `origin/<branch>` HEAD tree is self-consistent before
 * any local state (worktree / sidecar / job state) is created.
 *
 * Implements ADR-20260715 D2: attach checks tree self-consistency and throws a
 * typed error on any violation — never creates local state on failure.
 *
 * This function performs NO I/O beyond the inputs it receives. It is pure in
 * the sense that it does not touch the filesystem, worktrees, or sidecars.
 */
import { composeSplitLayoutFromContent } from "../../store/job-state-projection.js";
import { getPipelineDescriptor } from "../pipeline/registry.js";
import { getPipelineId } from "../../state/pipeline-id.js";
import { getJobSlug } from "../../state/job-slug.js";
import { resolveResumeStep, buildAllowedStepSet } from "../resume/resolve-step.js";
import { requestMdPath } from "../../util/paths.js";
import { checkpointNotAttachableError } from "../../errors.js";
import type { NormalizedJobState } from "../../store/job-state-projection.js";

// ---------------------------------------------------------------------------
// VerifiedCheckpoint
// ---------------------------------------------------------------------------

export interface VerifiedCheckpoint {
  state: NormalizedJobState;
  slug: string;
  jobId: string;
  branch: string;
}

// ---------------------------------------------------------------------------
// verifyCheckpoint
// ---------------------------------------------------------------------------

/**
 * Verify that the checkpoint described by the inputs is self-consistent and
 * safe to attach. Returns a VerifiedCheckpoint on success; throws
 * checkpointNotAttachableError on any violation.
 *
 * Verification order (ADR-20260715 D2, request requirement 2):
 *   (b) journal / projection integrity via composeSplitLayoutFromContent
 *   (a) status === "awaiting-resume" (quiescent; rejects "running" and all others)
 *   (c) resume point + pipeline definition resolvable
 *   (d) request.md present in treeFiles
 *   (e) repository / jobId / branch / slug identity match
 *
 * @param input.slug          - Slug derived from the tree dir name.
 * @param input.stateJson     - Raw state.json string.
 * @param input.eventsJsonl   - Raw events.jsonl string (empty = no events).
 * @param input.treeFiles     - Repo-relative paths present in the ref tree.
 * @param input.branch        - Branch name (without "origin/" prefix).
 * @param input.expectedRepo  - Repository identity to verify against.
 */
export async function verifyCheckpoint(input: {
  slug: string;
  stateJson: string;
  eventsJsonl: string;
  treeFiles: string[];
  branch: string;
  expectedRepo: { owner: string; name: string };
}): Promise<VerifiedCheckpoint> {
  const { slug, stateJson, eventsJsonl, treeFiles, branch, expectedRepo } = input;

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

  // (a) Status must be awaiting-resume (quiescent)
  if (state.status !== "awaiting-resume") {
    throw checkpointNotAttachableError(
      "not-quiescent",
      `state.status is '${state.status}', expected 'awaiting-resume'. Only quiescent jobs can be attached.`,
    );
  }

  // (c) Resume point + pipeline definition resolvable
  try {
    getPipelineDescriptor(getPipelineId(state));
  } catch (err: unknown) {
    throw checkpointNotAttachableError(
      "pipeline-unresolvable",
      `Pipeline descriptor not found: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    resolveResumeStep(
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

  return { state, slug, jobId: state.jobId, branch };
}
