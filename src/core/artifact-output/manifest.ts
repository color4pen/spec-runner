/**
 * Artifact manifest builder for the artifact-output profile.
 * T-07: manifest.ts — pure function, no I/O.
 *
 * Builds the ArtifactManifest structure (D9 contract).
 */
import type { ChangeEntry } from "../snapshot/compare.js";
import type { PatchEntryResult } from "./patch.js";
import { PATCH_MAX_FILE_SIZE_BYTES } from "./patch.js";
import { UNSUPPORTED_OPERATIONS } from "./execution-profile.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerificationReference {
  boundDigest: string;
  outcome: "passed" | "failed" | "skipped";
  details?: string;
}

export interface ReviewReference {
  boundDigest: string;
  outcome: "approved" | "needs-fix" | "skipped";
  findings?: string[];
}

export interface ManifestChangeEntry {
  path: string;
  change: "added" | "modified" | "deleted";
  kind?: string;
  previousKind?: string;
  mode?: string;
  previousMode?: string;
  baselineDigest?: string;
  candidateDigest?: string;
  symlinkTarget?: string;
  previousSymlinkTarget?: string;
  patchClassification?: string;
}

export interface ArtifactManifest {
  schemaVersion: string;
  profile: string;
  runId: string;
  source: {
    root: string;
    exclusions: readonly string[];
  };
  baseline: {
    digest: string;
  };
  candidate: {
    digest: string;
  };
  changes: ManifestChangeEntry[];
  /**
   * D9 per-file unsupported array: paths of files that could not be processed
   * due to snapshot failures (e.g. unsupported entry kind, unreadable files,
   * non-UTF-8 paths). Callers can use this to learn which files were excluded.
   */
  unsupported: string[];
  patchCoverage: {
    maxFileSizeBytes: number;
    included: number;
    omitted: number;
  };
  verification: VerificationReference | null;
  review: ReviewReference | null;
  resume: {
    supported: false;
    reason: string;
  };
  unsupportedOperations: typeof UNSUPPORTED_OPERATIONS;
}

// ─── Manifest input ───────────────────────────────────────────────────────────

export interface BuildManifestInput {
  runId: string;
  profile: string;
  sourceRoot: string;
  exclusions: readonly string[];
  baselineDigest: string;
  candidateDigest: string;
  changes: readonly ChangeEntry[];
  patchEntries: readonly PatchEntryResult[];
  verification: VerificationReference | null;
  review: ReviewReference | null;
  /**
   * D9 per-file unsupported: paths excluded due to snapshot failures.
   * Defaults to [] when not provided.
   */
  unsupported?: readonly string[];
}

// ─── Manifest builder ─────────────────────────────────────────────────────────

/**
 * Build an ArtifactManifest from the run inputs and outputs.
 * Pure function: no I/O, no side effects.
 */
export function buildManifest(input: BuildManifestInput): ArtifactManifest {
  const patchClassMap = new Map<string, string>();
  for (const pe of input.patchEntries) {
    patchClassMap.set(pe.path, pe.classification);
  }

  const manifestChanges: ManifestChangeEntry[] = input.changes.map((c) => ({
    path: c.path,
    change: c.change,
    kind: c.kind,
    previousKind: c.previousKind,
    mode: c.mode,
    previousMode: c.previousMode,
    baselineDigest: c.baselineDigest,
    candidateDigest: c.candidateDigest,
    symlinkTarget: c.symlinkTarget,
    previousSymlinkTarget: c.previousSymlinkTarget,
    patchClassification: patchClassMap.get(c.path),
  }));

  const included = input.patchEntries.filter(
    (e) => e.classification === "included" || e.classification === "included:deletion",
  ).length;
  const omitted = input.patchEntries.length - included;

  return {
    schemaVersion: "1",
    profile: input.profile,
    runId: input.runId,
    source: {
      root: input.sourceRoot,
      exclusions: input.exclusions,
    },
    baseline: {
      digest: input.baselineDigest,
    },
    candidate: {
      digest: input.candidateDigest,
    },
    changes: manifestChanges,
    unsupported: input.unsupported ? [...input.unsupported] : [],
    patchCoverage: {
      maxFileSizeBytes: PATCH_MAX_FILE_SIZE_BYTES,
      included,
      omitted,
    },
    verification: input.verification,
    review: input.review,
    resume: {
      supported: false,
      reason: "artifact-output profile does not support resume; restart from source directory",
    },
    unsupportedOperations: UNSUPPORTED_OPERATIONS,
  };
}
