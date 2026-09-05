/**
 * Unit / integration tests for src/core/artifact-output/artifact-writer.ts
 *
 * TC-022: An unrepresentable entry (omitted:unreadable) prevents finalization —
 *         copyFile failure for omitted:unreadable entries must propagate so that
 *         finalizeArtifact throws and artifact/ is never created.
 *
 * TC-062: Staging-to-final atomicity — if finalizeArtifact throws after writing
 *         manifest.json but before completing all files, the artifact/ directory
 *         is not created (only artifact.staging/ may remain).
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { finalizeArtifact } from "../artifact-writer.js";
import { buildManifest } from "../manifest.js";
import type { PatchEntryResult } from "../patch.js";
import type { ChangeEntry } from "../../snapshot/compare.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tempDirs: string[] = [];

async function mktemp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  }
});

const BASELINE_DIGEST = "sha256:" + "0".repeat(64);
const CANDIDATE_DIGEST = "sha256:" + "a".repeat(64);

function makeMinimalManifest(overrides?: { changes?: ChangeEntry[]; patchEntries?: PatchEntryResult[] }) {
  return buildManifest({
    runId: "test-run",
    profile: "artifact-output",
    sourceRoot: "/source",
    exclusions: [".git/"],
    baselineDigest: BASELINE_DIGEST,
    candidateDigest: CANDIDATE_DIGEST,
    changes: overrides?.changes ?? [],
    patchEntries: overrides?.patchEntries ?? [],
    verification: { boundDigest: CANDIDATE_DIGEST, outcome: "passed" },
    review: { boundDigest: CANDIDATE_DIGEST, outcome: "approved" },
  });
}

// ─── TC-022: unrepresentable entry prevents finalization ───────────────────────

describe("TC-022: omitted:unreadable entry prevents finalization (fail-closed)", () => {
  it("finalizeArtifact throws when candidate file for omitted:unreadable entry is absent", async () => {
    const tmp = await mktemp("aw-tc022-");
    const stagingDir = path.join(tmp, "artifact.staging");
    const artifactDir = path.join(tmp, "artifact");
    const candidateRoot = path.join(tmp, "candidate");
    await fs.mkdir(candidateRoot, { recursive: true });

    // An omitted:unreadable entry whose file does NOT exist in the candidate workspace.
    // This simulates a file that was unreadable during classification and is still
    // unavailable at finalization time.
    const missingPath = "unreadable-file.bin";
    const patchEntries: PatchEntryResult[] = [
      { path: missingPath, classification: "omitted:unreadable", diffContribution: "" },
    ];
    const changes: ChangeEntry[] = [
      {
        path: missingPath,
        change: "added",
        kind: "file",
        candidateDigest: CANDIDATE_DIGEST,
      },
    ];

    // finalizeArtifact must throw because it cannot copy the missing file
    await expect(
      finalizeArtifact({
        stagingDir,
        artifactDir,
        candidateRoot,
        baselineRoot: tmp,
        manifest: makeMinimalManifest({ changes, patchEntries }),
        patchText: "",
        patchEntries,
        changes,
        verificationRecord: { candidateDigest: CANDIDATE_DIGEST, outcome: "passed" },
        reviewRecord: { candidateDigest: CANDIDATE_DIGEST, outcome: "approved", findings: [] },
      }),
    ).rejects.toThrow();

    // artifact/ must NOT exist — finalization failed before the atomic rename
    await expect(fs.access(artifactDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("finalizeArtifact succeeds when omitted:unreadable entry is for a deleted file (no payload needed)", async () => {
    const tmp = await mktemp("aw-tc022-del-");
    const stagingDir = path.join(tmp, "artifact.staging");
    const artifactDir = path.join(tmp, "artifact");
    const candidateRoot = path.join(tmp, "candidate");
    await fs.mkdir(candidateRoot, { recursive: true });

    // A deletion entry classified as omitted:unreadable has no payload (file is deleted
    // from candidate). writePayload skips it via the `change.change === "deleted"` guard.
    const deletedPath = "deleted-unreadable.bin";
    const patchEntries: PatchEntryResult[] = [
      { path: deletedPath, classification: "omitted:unreadable", diffContribution: "" },
    ];
    const changes: ChangeEntry[] = [
      {
        path: deletedPath,
        change: "deleted",
        kind: "file",
        baselineDigest: BASELINE_DIGEST,
      },
    ];

    // Should not throw for deleted entries — no payload needed
    await expect(
      finalizeArtifact({
        stagingDir,
        artifactDir,
        candidateRoot,
        baselineRoot: tmp,
        manifest: makeMinimalManifest({ changes, patchEntries }),
        patchText: "",
        patchEntries,
        changes,
        verificationRecord: { candidateDigest: CANDIDATE_DIGEST, outcome: "passed" },
        reviewRecord: { candidateDigest: CANDIDATE_DIGEST, outcome: "approved", findings: [] },
      }),
    ).resolves.toBeUndefined();

    // artifact/ SHOULD exist — finalization completed successfully
    await expect(fs.access(artifactDir)).resolves.toBeUndefined();
  });
});

// ─── TC-062: staging-to-final atomicity ──────────────────────────────────────

describe("TC-062: artifact staging-to-final atomicity", () => {
  it("artifact/ directory is not created when finalization fails after writing manifest.json", async () => {
    const tmp = await mktemp("aw-tc062-");
    const stagingDir = path.join(tmp, "artifact.staging");
    const artifactDir = path.join(tmp, "artifact");
    const candidateRoot = path.join(tmp, "candidate");
    await fs.mkdir(candidateRoot, { recursive: true });

    // Inject a failure that occurs AFTER manifest.json is written (step 1) but
    // before finalization completes (step 7 rename). We use an omitted:unreadable
    // entry whose file is missing — writePayload (step 3) will throw after
    // manifest.json (step 1) and changes.patch (step 2) are already written.
    const missingPath = "missing.bin";
    const patchEntries: PatchEntryResult[] = [
      { path: missingPath, classification: "omitted:unreadable", diffContribution: "" },
    ];
    const changes: ChangeEntry[] = [
      {
        path: missingPath,
        change: "modified",
        kind: "file",
        baselineDigest: BASELINE_DIGEST,
        candidateDigest: CANDIDATE_DIGEST,
      },
    ];

    await expect(
      finalizeArtifact({
        stagingDir,
        artifactDir,
        candidateRoot,
        baselineRoot: tmp,
        manifest: makeMinimalManifest({ changes, patchEntries }),
        patchText: "",
        patchEntries,
        changes,
        verificationRecord: { candidateDigest: CANDIDATE_DIGEST, outcome: "passed" },
        reviewRecord: { candidateDigest: CANDIDATE_DIGEST, outcome: "approved", findings: [] },
      }),
    ).rejects.toThrow();

    // Verify the failure happened mid-write: manifest.json was already written to staging
    const manifestPath = path.join(stagingDir, "manifest.json");
    await expect(
      fs.access(manifestPath),
      "manifest.json should exist in staging (failure was mid-write)",
    ).resolves.toBeUndefined();

    // The artifact/ directory must NOT exist — the atomic rename never happened
    await expect(
      fs.access(artifactDir),
      "artifact/ must not exist after mid-write failure",
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
