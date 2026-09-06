/**
 * Atomic artifact finalizer for the artifact-output profile.
 * T-07: artifact-writer.ts — writes to staging, then renames to final.
 *
 * Writes to artifact.staging/ first. Only renames to artifact/ after ALL
 * files are written. If any write fails, artifact/ is never created.
 *
 * Source directory is never written.
 */
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import type { ArtifactManifest } from "./manifest.js";
import type { ChangeEntry } from "../snapshot/compare.js";
import type { PatchEntryResult } from "./patch.js";

// ─── APPLY.md template ────────────────────────────────────────────────────────

function buildApplyMd(manifest: ArtifactManifest): string {
  const hasUnsupported = manifest.changes.some(
    (c) =>
      c.patchClassification === "not-applicable" ||
      c.patchClassification === "omitted:binary" ||
      c.patchClassification === "omitted:binary-deletion" ||
      c.patchClassification === "omitted:size" ||
      c.patchClassification === "omitted:size-deletion" ||
      c.patchClassification === "omitted:unreadable",
  );

  return `# APPLY.md — Artifact Application Instructions

## IMPORTANT: This artifact is NOT applied automatically.

The artifact-output profile produces a read-only artifact. Applying changes
to your source directory is a separate, explicit operation that you must
perform manually or via a dedicated apply command.

## Precondition: Baseline digest must match

Before applying, verify that your source directory matches the baseline digest:

  Baseline digest: ${manifest.baseline.digest}

If the source directory has changed since this artifact was produced,
do NOT apply — the patch may not apply cleanly and may corrupt your source.

## Contents

- \`manifest.json\`   — full change manifest with baseline/candidate digests
- \`changes.patch\`   — unified diff (text changes only; for review)
- \`payload/\`        — candidate bytes of EVERY added / modified regular file
                       (text, binary, large, and empty files alike), in path structure
- \`verification.json\` — verification record
- \`review.json\`     — review record

## Application steps

1. Verify baseline digest matches your source directory.
2. For every entry with \`change: "deleted"\` in \`manifest.json\`, remove the path.
   (\`changes.patch\` carries deletion hunks only for text deletions; binary / large
   deletions appear in the manifest only.)
3. Copy every file under \`payload/\` to its path, overwriting. The payload is the
   authoritative content for all added / modified regular files — including files
   that are empty (a zero-byte file must be created), binary, or too large for the patch.
   Apply the \`mode\` recorded in the manifest entry.
4. For entries with \`patchClassification: "not-applicable"\` (symlink / directory /
   mode-only changes), apply the metadata recorded in the manifest entry
   (\`kind\`, \`mode\`, \`symlinkTarget\`). A kind change is recorded as a
   \`deleted\` entry plus an \`added\` entry with the same path.
5. \`changes.patch\` is intended for review. Applying it with \`patch -p0\` against the
   baseline is equivalent to step 3 for \`included\` entries only; it is never required
   after step 3.
6. Verify the result matches the candidate digest: ${manifest.candidate.digest}

${hasUnsupported ? "## NOTE: Some changes are not representable as text patches\n\nSee entries with `patchClassification` of `not-applicable`, `omitted:binary`, `omitted:binary-deletion`, `omitted:size`, `omitted:size-deletion`, or `omitted:unreadable` in manifest.json. Added / modified regular files among them are applied from `payload/` (step 3); the rest are applied from manifest metadata (steps 2 and 4).\n" : ""}
## Profile: ${manifest.profile}

Resume: NOT supported. If the run was interrupted, restart from the source directory.
`;
}

// ─── Finalizer ────────────────────────────────────────────────────────────────

export interface FinalizeArtifactInput {
  /** Path to the artifact.staging/ directory. */
  stagingDir: string;
  /** Path to the final artifact/ directory. */
  artifactDir: string;
  /** Candidate workspace root (for reading payload files). */
  candidateRoot: string;
  /** Baseline / source root (for reading baseline files for payload comparison). */
  baselineRoot: string;
  /** The built manifest. */
  manifest: ArtifactManifest;
  /** The changes.patch text. */
  patchText: string;
  /** Per-entry patch classification results. */
  patchEntries: readonly PatchEntryResult[];
  /** All change entries. */
  changes: readonly ChangeEntry[];
  /** Serialized verification record. */
  verificationRecord: unknown;
  /** Serialized review record. */
  reviewRecord: unknown;
}

/**
 * Finalize the artifact atomically.
 *
 * 1. Creates artifact.staging/ (fails if it already exists).
 * 2. Writes all files to artifact.staging/.
 * 3. Renames artifact.staging/ → artifact/.
 *
 * If any step fails, artifact/ is never created.
 * If any required payload copy fails, fails closed (artifact/ is never created).
 *
 * Source directory is NEVER written to.
 */
export async function finalizeArtifact(input: FinalizeArtifactInput): Promise<void> {
  const {
    stagingDir,
    artifactDir,
    candidateRoot,
    manifest,
    patchText,
    patchEntries,
    verificationRecord,
    reviewRecord,
  } = input;

  // Ensure staging dir doesn't already exist
  try {
    await fs.access(artifactDir);
    throw new Error(`Artifact directory already exists: ${artifactDir}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // Create staging directory
  await fs.mkdir(stagingDir, { recursive: true });

  try {
    // 1. Write manifest.json
    await writeJson(nodePath.join(stagingDir, "manifest.json"), manifest);

    // 2. Write changes.patch
    await fs.writeFile(nodePath.join(stagingDir, "changes.patch"), patchText, "utf-8");

    // 3. Write payload/ (candidate bytes of every added / modified regular file)
    const payloadDir = nodePath.join(stagingDir, "payload");
    await fs.mkdir(payloadDir, { recursive: true });
    await writePayload(payloadDir, candidateRoot, patchEntries, input.changes);

    // 4. Write verification.json
    await writeJson(nodePath.join(stagingDir, "verification.json"), verificationRecord);

    // 5. Write review.json
    await writeJson(nodePath.join(stagingDir, "review.json"), reviewRecord);

    // 6. Write APPLY.md
    await fs.writeFile(nodePath.join(stagingDir, "APPLY.md"), buildApplyMd(manifest), "utf-8");

    // 7. Atomic rename: artifact.staging/ → artifact/
    await fs.rename(stagingDir, artifactDir);
  } catch (err) {
    // Do NOT rename to artifact/ — leave staging as-is for debugging but never create artifact/
    throw err;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(nodePath.dirname(filePath), { recursive: true });
  const json = JSON.stringify(data, null, 2) + "\n";
  await fs.writeFile(filePath, json, "utf-8");
}

async function writePayload(
  payloadDir: string,
  candidateRoot: string,
  patchEntries: readonly PatchEntryResult[],
  changes: readonly ChangeEntry[],
): Promise<void> {
  // Keyed by (change, path): a kind change is a deleted + added pair with the same path.
  const changeMap = new Map<string, ChangeEntry>();
  for (const c of changes) {
    changeMap.set(`${c.change}|${c.path}`, c);
  }

  for (const entry of patchEntries) {
    // D9: payload/ carries the candidate bytes of EVERY added / modified regular file,
    // regardless of patch classification. This makes the payload authoritative for
    // application (empty files, BOM-only differences, binary and large files are all
    // recoverable from it) and keeps changes.patch a review aid rather than the only
    // carrier of the change.
    if (entry.change === "deleted") continue;
    const change = changeMap.get(`${entry.change}|${entry.path}`);
    if (!change || change.kind !== "file") continue;

    const srcPath = nodePath.join(candidateRoot, entry.path);
    const dstPath = nodePath.join(payloadDir, entry.path);

    // Fail-closed (D6 / D8): every payload copy is required. If any candidate file cannot
    // be copied, the artifact would be incomplete — propagate so finalizeArtifact throws
    // and artifact/ is never created.
    await fs.mkdir(nodePath.dirname(dstPath), { recursive: true });
    await fs.copyFile(srcPath, dstPath);
  }
}
