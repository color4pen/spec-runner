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
 *
 * D9 payload completeness — payload/ carries every added / modified regular file
 *         (text, empty, binary, large); any required copy failure fails finalize.
 *
 * Kind change identity — a deleted + added pair with the same path keeps two
 *         distinct patch classifications in the manifest (keyed by change + path).
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
      { path: missingPath, change: "added", classification: "omitted:unreadable", diffContribution: "" },
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
    // from candidate). writePayload skips deleted entries.
    const deletedPath = "deleted-unreadable.bin";
    const patchEntries: PatchEntryResult[] = [
      { path: deletedPath, change: "deleted", classification: "omitted:unreadable", diffContribution: "" },
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
      { path: missingPath, change: "modified", classification: "omitted:unreadable", diffContribution: "" },
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

// ─── D9: payload completeness / fail-closed ──────────────────────────────────

describe("D9: payload/ carries every added / modified regular file", () => {
  function baseInput(tmp: string, candidateRoot: string, changes: ChangeEntry[], patchEntries: PatchEntryResult[]) {
    return {
      stagingDir: path.join(tmp, "artifact.staging"),
      artifactDir: path.join(tmp, "artifact"),
      candidateRoot,
      baselineRoot: tmp,
      manifest: makeMinimalManifest({ changes, patchEntries }),
      patchText: "",
      patchEntries,
      changes,
      verificationRecord: { candidateDigest: CANDIDATE_DIGEST, outcome: "passed" },
      reviewRecord: { candidateDigest: CANDIDATE_DIGEST, outcome: "approved", findings: [] },
    };
  }

  it("copies included text files, empty added files and binary files into payload/", async () => {
    const tmp = await mktemp("aw-d9-");
    const candidateRoot = path.join(tmp, "candidate");
    await fs.mkdir(path.join(candidateRoot, "sub"), { recursive: true });
    await fs.writeFile(path.join(candidateRoot, "text.txt"), "hello\n");
    await fs.writeFile(path.join(candidateRoot, "sub", "empty.txt"), "");
    await fs.writeFile(path.join(candidateRoot, "blob.bin"), new Uint8Array([0, 1, 2]));

    const changes: ChangeEntry[] = [
      { path: "text.txt", change: "modified", kind: "file", baselineDigest: BASELINE_DIGEST, candidateDigest: CANDIDATE_DIGEST },
      { path: "sub/empty.txt", change: "added", kind: "file", candidateDigest: CANDIDATE_DIGEST },
      { path: "blob.bin", change: "added", kind: "file", candidateDigest: CANDIDATE_DIGEST },
      { path: "gone.txt", change: "deleted", kind: "file", baselineDigest: BASELINE_DIGEST },
    ];
    const patchEntries: PatchEntryResult[] = [
      { path: "text.txt", change: "modified", classification: "included", diffContribution: "x" },
      { path: "sub/empty.txt", change: "added", classification: "included", diffContribution: "" },
      { path: "blob.bin", change: "added", classification: "omitted:binary", diffContribution: "" },
      { path: "gone.txt", change: "deleted", classification: "included:deletion", diffContribution: "y" },
    ];

    await finalizeArtifact(baseInput(tmp, candidateRoot, changes, patchEntries));

    const payload = path.join(tmp, "artifact", "payload");
    expect(await fs.readFile(path.join(payload, "text.txt"), "utf-8")).toBe("hello\n");
    expect((await fs.stat(path.join(payload, "sub", "empty.txt"))).size).toBe(0);
    expect(Array.from(await fs.readFile(path.join(payload, "blob.bin")))).toEqual([0, 1, 2]);
    await expect(fs.access(path.join(payload, "gone.txt"))).rejects.toMatchObject({ code: "ENOENT" });

    const applyMd = await fs.readFile(path.join(tmp, "artifact", "APPLY.md"), "utf-8");
    expect(applyMd).toContain("empty");
    expect(applyMd).toContain("payload/");
  });

  it.each(["omitted:binary", "omitted:size"] as const)(
    "a missing candidate file for a %s entry fails finalize and artifact/ is not created",
    async (classification) => {
      const tmp = await mktemp("aw-d9-fail-");
      const candidateRoot = path.join(tmp, "candidate");
      await fs.mkdir(candidateRoot, { recursive: true });

      const changes: ChangeEntry[] = [
        { path: "missing.dat", change: "added", kind: "file", candidateDigest: CANDIDATE_DIGEST },
      ];
      const patchEntries: PatchEntryResult[] = [
        { path: "missing.dat", change: "added", classification, diffContribution: "" },
      ];

      await expect(finalizeArtifact(baseInput(tmp, candidateRoot, changes, patchEntries))).rejects.toThrow();
      await expect(fs.access(path.join(tmp, "artifact"))).rejects.toMatchObject({ code: "ENOENT" });
    },
  );
});

// ─── Kind change: deleted + added with the same path ─────────────────────────

describe("kind change keeps distinct classifications per (change, path)", () => {
  it("manifest records not-applicable for the deleted symlink and included for the added file", () => {
    const changes: ChangeEntry[] = [
      { path: "link", change: "deleted", previousKind: "symlink", previousSymlinkTarget: "target" },
      { path: "link", change: "added", kind: "file", previousKind: "symlink", candidateDigest: CANDIDATE_DIGEST },
    ];
    const patchEntries: PatchEntryResult[] = [
      { path: "link", change: "deleted", classification: "not-applicable", diffContribution: "" },
      { path: "link", change: "added", classification: "included", diffContribution: "+x" },
    ];
    const manifest = makeMinimalManifest({ changes, patchEntries });
    const deleted = manifest.changes.find((c) => c.change === "deleted");
    const added = manifest.changes.find((c) => c.change === "added");
    expect(deleted?.patchClassification).toBe("not-applicable");
    expect(added?.patchClassification).toBe("included");
  });

  it("payload/ receives the added file of a symlink → file kind change", async () => {
    const tmp = await mktemp("aw-kind-");
    const candidateRoot = path.join(tmp, "candidate");
    await fs.mkdir(candidateRoot, { recursive: true });
    await fs.writeFile(path.join(candidateRoot, "link"), "now a file\n");

    const changes: ChangeEntry[] = [
      { path: "link", change: "deleted", previousKind: "symlink", previousSymlinkTarget: "target" },
      { path: "link", change: "added", kind: "file", previousKind: "symlink", candidateDigest: CANDIDATE_DIGEST },
    ];
    const patchEntries: PatchEntryResult[] = [
      { path: "link", change: "deleted", classification: "not-applicable", diffContribution: "" },
      { path: "link", change: "added", classification: "included", diffContribution: "+x" },
    ];
    await finalizeArtifact({
      stagingDir: path.join(tmp, "artifact.staging"),
      artifactDir: path.join(tmp, "artifact"),
      candidateRoot,
      baselineRoot: tmp,
      manifest: makeMinimalManifest({ changes, patchEntries }),
      patchText: "",
      patchEntries,
      changes,
      verificationRecord: { candidateDigest: CANDIDATE_DIGEST, outcome: "passed" },
      reviewRecord: { candidateDigest: CANDIDATE_DIGEST, outcome: "approved", findings: [] },
    });
    expect(await fs.readFile(path.join(tmp, "artifact", "payload", "link"), "utf-8")).toBe("now a file\n");
  });
});
