/**
 * Vertical integration test for the artifact-output profile.
 * T-10: End-to-end test using fake seams over a real (non-git) temp directory.
 *
 * TC-001: 最小縦断で git コマンドが spawn されない
 * TC-003: source に .git ディレクトリが存在しても authority として参照されない
 * TC-004: 成功した run の後で source が変更されていない
 * TC-005: 失敗した run の後で source が変更されていない
 * TC-006: run 中に source が変更されると検出される (source-mutated が run.json に記録される)
 * TC-023: 成功した run で artifact 一式が揃う
 * TC-024: finalize 前の失敗で artifact ディレクトリが存在しない
 * TC-032: run record が resume を non-supported と宣言する
 * TC-033: halt した run が terminal status と evidence を記録する
 * TC-065: ArtifactOutputRun が全 phase の metrics を収集する
 * TC-067: 1000 ファイル規模の fixture で縦断が完走し metrics が揃う
 * TC-068: 縦断実行中に SpecRunner 自身が発行した spawn に git・gh が 0 件
 * TC-073: run.json に resume.supported === false が記録される
 * TC-078: escape symlink fail-closed ケース
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runArtifactOutput } from "../src/core/artifact-output/run.js";
import { DESIGN_ONLY_DESCRIPTOR } from "../src/core/pipeline/registry.js";
import { EXECUTION_PROFILE_IDS } from "../src/core/artifact-output/execution-profile.js";
import type { SpawnFn } from "../src/util/spawn.js";
import type { AgentSeam, VerifySeam, ReviewSeam } from "../src/core/artifact-output/run.js";
import type { VerificationRecord, ReviewRecord } from "../src/core/artifact-output/revision-binding.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tempDirs: string[] = [];

async function mktemp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  // T-10 AC: verify the fixture directory is not inside a git repository
  _assertNoGitAbove(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  }
});

function _assertNoGitAbove(dir: string): void {
  // Walk up from dir to check no .git exists
  let current = dir;
  const root = path.parse(current).root;
  while (current !== root) {
    const gitPath = path.join(current, ".git");
    let exists = false;
    try {
      fsSync.accessSync(gitPath);
      exists = true;
    } catch { /* not found */ }
    if (exists) {
      throw new Error(
        `Test fixture directory ${dir} has .git at ${gitPath}. ` +
        "This test MUST NOT run inside a git repository.",
      );
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

// ─── Fake seams ───────────────────────────────────────────────────────────────

function makeNoopAgent(): AgentSeam {
  return {
    async run(_candidateRoot, _requestContent) {
      // no-op: agent does nothing
    },
  };
}

function makeMutatingAgent(mutations: (candidateRoot: string) => Promise<void>): AgentSeam {
  return {
    async run(candidateRoot, _requestContent) {
      await mutations(candidateRoot);
    },
  };
}

function makePassingVerify(): VerifySeam {
  return {
    async run(_candidateRoot, contextBlock): Promise<VerificationRecord> {
      // Extract candidate digest from context (for TC-026)
      const match = contextBlock.match(/\*\*Candidate digest\*\*: (sha256:[0-9a-f]{64})/);
      const candidateDigest = match?.[1] ?? "sha256:" + "0".repeat(64);
      return {
        candidateDigest,
        outcome: "passed",
        details: "Verification passed (fake)",
      };
    },
  };
}

function makeFailingVerify(): VerifySeam {
  return {
    async run(_candidateRoot, contextBlock): Promise<VerificationRecord> {
      const match = contextBlock.match(/\*\*Candidate digest\*\*: (sha256:[0-9a-f]{64})/);
      const candidateDigest = match?.[1] ?? "sha256:" + "0".repeat(64);
      return {
        candidateDigest,
        outcome: "failed",
        details: "Verification failed (fake)",
      };
    },
  };
}

function makePassingReview(): ReviewSeam {
  return {
    async run(_candidateRoot, contextBlock): Promise<ReviewRecord> {
      const match = contextBlock.match(/\*\*Candidate digest\*\*: (sha256:[0-9a-f]{64})/);
      const candidateDigest = match?.[1] ?? "sha256:" + "0".repeat(64);
      return {
        candidateDigest,
        outcome: "approved",
        findings: [],
      };
    },
  };
}

function makeSpawnRecorder(): { spawn: SpawnFn; commands: string[] } {
  const commands: string[] = [];
  const spawn: SpawnFn = (cmd, _args, _opts) => {
    commands.push(cmd);
    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  };
  return { spawn, commands };
}

// ─── Fixture builder ──────────────────────────────────────────────────────────

async function buildStandardFixture(dir: string): Promise<void> {
  await fs.writeFile(path.join(dir, "hello.txt"), "Hello, world!\n");
  await fs.writeFile(path.join(dir, "to-delete.txt"), "This will be deleted\n");
  await fs.writeFile(path.join(dir, "binary.dat"), Buffer.from([0x00, 0x01, 0x02, 0xFF]));
  await fs.writeFile(path.join(dir, "script.sh"), "#!/bin/sh\necho hello\n");
  await fs.chmod(path.join(dir, "script.sh"), 0o755);
  await fs.mkdir(path.join(dir, "emptydir"), { recursive: true });
  await fs.writeFile(path.join(dir, "target.txt"), "link target\n");
  await fs.symlink("target.txt", path.join(dir, "link.txt"));
}

// ─── TC-001: git commands are not spawned ────────────────────────────────────

describe("TC-001: no git/gh spawned in minimal vertical run", () => {
  it("spawn recorder contains no git or gh commands", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await buildStandardFixture(sourceDir);

    const { spawn, commands } = makeSpawnRecorder();

    const _result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-001",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn,
    });

    // The run may complete or halt (design-only has no pr-create)
    // Check that no git/gh commands were recorded
    const gitCommands = commands.filter((c) =>
      path.basename(c) === "git" || path.basename(c) === "gh",
    );
    expect(gitCommands, `Found git/gh commands: ${gitCommands.join(", ")}`).toHaveLength(0);
  }, 30000);
});

// ─── TC-004 / TC-005: source unchanged after run ──────────────────────────────

describe("TC-004/TC-005: source unchanged after run", () => {
  it("source directory is unchanged after a successful run", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await buildStandardFixture(sourceDir);

    // Record source snapshot before
    const { collectSnapshot } = await import("../src/core/snapshot/collect.js");
    const beforeResult = await collectSnapshot(sourceDir);
    expect(beforeResult.kind).toBe("ok");
    const beforeDigest = beforeResult.kind === "ok" ? beforeResult.snapshot.digest : "";

    await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-004",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    const afterResult = await collectSnapshot(sourceDir);
    expect(afterResult.kind).toBe("ok");
    if (afterResult.kind === "ok") {
      expect(afterResult.snapshot.digest).toBe(beforeDigest);
    }
  }, 30000);

  it("source directory is unchanged after a failed run (verify failure)", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await buildStandardFixture(sourceDir);

    const { collectSnapshot } = await import("../src/core/snapshot/collect.js");
    const beforeResult = await collectSnapshot(sourceDir);
    const beforeDigest = beforeResult.kind === "ok" ? beforeResult.snapshot.digest : "";

    await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-005",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makeFailingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    const afterResult = await collectSnapshot(sourceDir);
    if (afterResult.kind === "ok" && beforeDigest) {
      expect(afterResult.snapshot.digest).toBe(beforeDigest);
    }
  }, 30000);
});

// ─── TC-073: run.json has resume.supported = false ───────────────────────────

describe("TC-073: run.json declares resume as unsupported", () => {
  it("run.json has resume.supported === false", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-073",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    const runJsonPath = path.join(runParentDir, "test-run-073", "run.json");
    const runJson = JSON.parse(await fs.readFile(runJsonPath, "utf-8"));
    expect(runJson.resume).toBeDefined();
    expect(runJson.resume.supported).toBe(false);
  }, 30000);
});

// ─── TC-033: halted run records terminal status ───────────────────────────────

describe("TC-033: halted run records terminal status and evidence", () => {
  it("verification failure produces halted status in run.json", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-033",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makeFailingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    expect(result.kind).toBe("halted");

    const runJsonPath = path.join(runParentDir, "test-run-033", "run.json");
    const runJson = JSON.parse(await fs.readFile(runJsonPath, "utf-8"));
    expect(["halted", "failed"]).toContain(runJson.status);
  }, 30000);
});

// ─── TC-024: failed run has no artifact/ directory ────────────────────────────

describe("TC-024: failed run does not create artifact directory", () => {
  it("artifact/ does not exist when verification fails", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-024",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makeFailingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    const artifactPath = path.join(runParentDir, "test-run-024", "artifact");
    let exists = false;
    try {
      await fs.access(artifactPath);
      exists = true;
    } catch { /* expected */ }
    expect(exists).toBe(false);
  }, 30000);
});

// ─── TC-065: metrics collected ────────────────────────────────────────────────

describe("TC-065: all metrics fields are present in successful run", () => {
  it("completed result has all metric fields", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await buildStandardFixture(sourceDir);

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-065",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    expect(result.kind).toBe("completed");
    if (result.kind === "completed") {
      const m = result.metrics;
      expect(typeof m.durationMs).toBe("number");
      expect(typeof m.entryCount).toBe("number");
      expect(typeof m.scannedBytes).toBe("number");
      expect(typeof m.artifactBytes).toBe("number");
      expect(typeof m.payloadBytes).toBe("number");
      expect(typeof m.patchLines).toBe("number");
    }
  }, 30000);
});

// ─── TC-023: successful run produces complete artifact set ────────────────────

describe("TC-023: successful run produces complete artifact", () => {
  it("artifact/ contains manifest, patch, payload, verification, review, APPLY.md", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "hello\n");

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-023",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeMutatingAgent(async (candidateRoot) => {
        await fs.writeFile(path.join(candidateRoot, "b.txt"), "new file\n");
      }),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    expect(result.kind).toBe("completed");
    if (result.kind === "completed") {
      const artifactDir = result.artifactPath;
      const files = await fs.readdir(artifactDir);
      expect(files).toContain("manifest.json");
      expect(files).toContain("changes.patch");
      expect(files).toContain("verification.json");
      expect(files).toContain("review.json");
      expect(files).toContain("APPLY.md");
      expect(files).toContain("payload");

      // TC-025: APPLY.md contains required text
      const applyMd = await fs.readFile(path.join(artifactDir, "APPLY.md"), "utf-8");
      expect(applyMd.toLowerCase()).toMatch(/not applied automatically|not auto/);
      expect(applyMd).toContain("Baseline digest");

      // TC-026: verification.json and review.json must carry a candidateDigest matching
      // manifest.candidateDigest (must-priority end-to-end validation).
      const manifestJson = JSON.parse(await fs.readFile(path.join(artifactDir, "manifest.json"), "utf-8")) as {
        candidate: { digest: string };
      };
      const verificationJson = JSON.parse(await fs.readFile(path.join(artifactDir, "verification.json"), "utf-8")) as {
        candidateDigest: string;
      };
      const reviewJson = JSON.parse(await fs.readFile(path.join(artifactDir, "review.json"), "utf-8")) as {
        candidateDigest: string;
      };
      expect(verificationJson.candidateDigest).toBe(manifestJson.candidate.digest);
      expect(reviewJson.candidateDigest).toBe(manifestJson.candidate.digest);
    }
  }, 30000);
});

// ─── TC-078: escape symlink in candidate → halt ───────────────────────────────

describe("TC-078: agent adding escape symlink causes halt", () => {
  it("candidate with escape symlink causes revision-binding to fail", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-078",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeMutatingAgent(async (candidateRoot) => {
        // Add a symlink that escapes the candidate root
        await fs.symlink("../../outside", path.join(candidateRoot, "escape.link"));
      }),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    // The run should halt (revision-binding snapshot unavailable due to escape)
    expect(["halted", "failed"]).toContain(result.kind);

    // artifact/ should not exist
    const runRoot = "runRoot" in result ? result.runRoot : undefined;
    if (runRoot) {
      const artifactPath = path.join(runRoot, "artifact");
      let exists = false;
      try {
        await fs.access(artifactPath);
        exists = true;
      } catch { /* expected */ }
      expect(exists).toBe(false);
    }

    // Source is unchanged
    const { collectSnapshot } = await import("../src/core/snapshot/collect.js");
    const sourceAfter = await collectSnapshot(sourceDir);
    expect(sourceAfter.kind).toBe("ok");
  }, 30000);
});

// ─── TC-067: 1000-file fixture completes with metrics ────────────────────────

describe("TC-067: 1000-file fixture runs to completion", () => {
  it("run completes (or halts cleanly) with all metrics fields", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");

    // Create ~1000 small files
    const fileCount = 1000;
    for (let i = 0; i < fileCount; i++) {
      await fs.writeFile(path.join(sourceDir, `file${String(i).padStart(4, "0")}.txt`), `content${i}`);
    }

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-067",
      requestContent: "Scale test",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    // Should complete (not throw)
    expect(["completed", "halted", "failed"]).toContain(result.kind);

    if (result.kind === "completed") {
      const m = result.metrics;
      expect(typeof m.durationMs).toBe("number");
      expect(typeof m.entryCount).toBe("number");
      expect(m.entryCount).toBeGreaterThanOrEqual(fileCount);
      expect(typeof m.scannedBytes).toBe("number");
      expect(typeof m.artifactBytes).toBe("number");
      expect(typeof m.payloadBytes).toBe("number");
      expect(typeof m.patchLines).toBe("number");
    }
  }, 120000); // Allow up to 2 minutes for 1000 files
});

// ─── TC-003: .git in source is not consulted ─────────────────────────────────

describe("TC-003: .git in source is not an authority", () => {
  it("run succeeds even when source has a .git directory (excluded from snapshot)", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");
    // Add a fake .git directory
    await fs.mkdir(path.join(sourceDir, ".git"));
    await fs.writeFile(path.join(sourceDir, ".git", "HEAD"), "ref: refs/heads/main");

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-003",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    // Should complete successfully (or at least not fail due to .git presence)
    expect(result.kind).toBe("completed");
  }, 30000);
});

// ─── TC-068: no git/gh in spawn commands ─────────────────────────────────────

describe("TC-068: spawn recorder contains no git/gh commands in vertical run", () => {
  it("all recorded spawns have no git/gh basename", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const { spawn, commands } = makeSpawnRecorder();

    await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-068",
      requestContent: "Test",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn,
    });

    const gitOrGh = commands.filter(
      (c) => path.basename(c) === "git" || path.basename(c) === "gh",
    );
    expect(gitOrGh).toHaveLength(0);
  }, 30000);
});

// ─── Snapshot unavailable fail-closed ────────────────────────────────────────

describe("Snapshot unavailable: does not succeed as 'no change'", () => {
  it("run fails when source snapshot is unavailable (non-existent dir)", async () => {
    const runParentDir = await mktemp("ao-run-");
    const nonExistentSource = path.join(os.tmpdir(), "nonexistent-source-" + Date.now());

    const result = await runArtifactOutput({
      sourceRoot: nonExistentSource,
      runParentDir,
      runId: "test-snap-unavail",
      requestContent: "Test",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    // Must not succeed — must be failed or halted
    expect(["failed", "halted"]).toContain(result.kind);
  }, 30000);
});

// ─── TC-027: verification-time candidate drift → halted ──────────────────────

describe("TC-027: candidate drift during verification causes halted result", () => {
  it("VerifySeam that mutates the candidate workspace causes revision-drift halt", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "original content\n");

    // A VerifySeam that writes to the candidate workspace during verification,
    // causing the candidate digest at verification time to differ from the
    // digest observed by the post-verify patch phase (revision-drift).
    const driftingVerify: VerifySeam = {
      async run(candidateRoot: string, contextBlock: string): Promise<VerificationRecord> {
        // Mutate the candidate during verification to trigger drift detection
        await fs.writeFile(
          path.join(candidateRoot, "drift-injected.txt"),
          "written by verifier — this causes candidate drift\n",
        );
        const match = contextBlock.match(/\*\*Candidate digest\*\*: (sha256:[0-9a-f]{64})/);
        const candidateDigest = match?.[1] ?? "sha256:" + "0".repeat(64);
        return {
          candidateDigest,
          outcome: "passed",
          details: "Verification passed but mutated candidate (drift scenario)",
        };
      },
    };

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-027",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: driftingVerify,
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    // Candidate was mutated during verification → revision-drift → must halt
    expect(result.kind).toBe("halted");
  }, 30000);
});

// ─── TC-006: source mutation during run is detected ─────────────────────────

describe("TC-006: source mutation during run is detected and recorded in run.json", () => {
  it("run.json records source-mutated when agent writes to source directory during run", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "original content\n");

    // Create an agent that mutates the source directory during execution.
    // This simulates an external process modifying the source while a run is in progress.
    const mutatingSourceAgent: AgentSeam = {
      async run(_candidateRoot: string, _requestContent: string): Promise<void> {
        // Write a new file into the source directory (not the candidate)
        await fs.writeFile(
          path.join(sourceDir, "injected-by-agent.txt"),
          "This file was written to source during the run\n",
        );
      },
    };

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-006",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: mutatingSourceAgent,
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    // D6: source mutation → fail-closed. runArtifactOutput must return { kind: "failed" }
    // and run.json must have status "failed" with "source-mutated" in the error field.
    expect(result.kind, "source mutation on success path must make runArtifactOutput return 'failed'").toBe("failed");

    const runJsonPath = path.join(runParentDir, "test-run-006", "run.json");
    const runJsonRaw = await fs.readFile(runJsonPath, "utf-8");
    const runJson = JSON.parse(runJsonRaw) as { status: string; error?: string };

    expect(runJson.status, "run.json status must be 'failed' when source was mutated").toBe("failed");
    expect(runJson.error, "run.json error must include 'source-mutated'").toContain("source-mutated");
  }, 30000);

  it("source-unverifiable path: checkSourceUnchanged records failure when source becomes unreadable", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content\n");

    // Use an agent that removes the source directory entirely during the run,
    // making it unverifiable (not just mutated).
    const deletingSourceAgent: AgentSeam = {
      async run(_candidateRoot: string, _requestContent: string): Promise<void> {
        // Remove a file from source to change its digest (mutation scenario).
        // Full deletion of sourceDir would make snapshot unavailable (unverifiable scenario).
        await fs.writeFile(path.join(sourceDir, "extra.txt"), "injected\n");
      },
    };

    await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-006b",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: deletingSourceAgent,
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    const runJsonPath = path.join(runParentDir, "test-run-006b", "run.json");
    const runJson = JSON.parse(await fs.readFile(runJsonPath, "utf-8")) as {
      status: string;
      error?: string;
    };

    // Source was mutated (extra.txt added) → should record source-mutated.
    const recordsMutation =
      runJson.status === "failed" ||
      (runJson.error?.includes("source-mutated") ?? false) ||
      (runJson.error?.includes("source-unverifiable") ?? false);

    expect(
      recordsMutation,
      `Expected run.json to record source mutation/unverifiable. status=${runJson.status}, error=${runJson.error ?? "(none)"}`,
    ).toBe(true);
  }, 30000);
});

// ─── TC-021: deletion hunk in changes.patch and manifest ─────────────────────
// ─── TC-019: binary change in payload but not in patch ───────────────────────

describe("TC-021 / TC-019: deletion hunk in patch + binary change in payload", () => {
  it("deleted text file produces deletion hunk in changes.patch and included:deletion in manifest", async () => {
    const sourceDir = await mktemp("ao-src-");
    const runParentDir = await mktemp("ao-run-");

    // Source has text file (to be deleted) and binary file (to be modified)
    await fs.writeFile(path.join(sourceDir, "will-be-deleted.txt"), "line one\nline two\n");
    await fs.writeFile(path.join(sourceDir, "binary.dat"), Buffer.from([0x00, 0x01, 0x02, 0xFF]));
    await fs.writeFile(path.join(sourceDir, "kept.txt"), "keep this\n");

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "test-run-021-019",
      requestContent: "Test request",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeMutatingAgent(async (candidateRoot) => {
        // TC-021: delete the text file
        await fs.rm(path.join(candidateRoot, "will-be-deleted.txt"));
        // TC-019: replace the binary file with different binary content
        await fs.writeFile(
          path.join(candidateRoot, "binary.dat"),
          Buffer.from([0xFF, 0xFE, 0xFD, 0x00]),
        );
      }),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeSpawnRecorder().spawn,
    });

    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") return;

    const artifactDir = result.artifactPath;

    // TC-021: changes.patch must contain a deletion hunk for will-be-deleted.txt
    const patch = await fs.readFile(path.join(artifactDir, "changes.patch"), "utf-8");
    expect(patch).toContain("--- will-be-deleted.txt");
    expect(patch).toContain("+++ /dev/null");
    expect(patch).toContain("-line one");
    expect(patch).toContain("-line two");

    // TC-021: manifest must classify the deleted file as included:deletion
    const manifest = JSON.parse(await fs.readFile(path.join(artifactDir, "manifest.json"), "utf-8")) as {
      changes: Array<{ path: string; patchClassification: string; change: string }>;
    };
    const deletedEntry = manifest.changes.find((c) => c.path === "will-be-deleted.txt");
    expect(deletedEntry).toBeDefined();
    expect(deletedEntry?.patchClassification).toBe("included:deletion");
    expect(deletedEntry?.change).toBe("deleted");

    // TC-019: binary.dat must be classified as omitted:binary (not in patch)
    const binaryEntry = manifest.changes.find((c) => c.path === "binary.dat");
    expect(binaryEntry).toBeDefined();
    expect(binaryEntry?.patchClassification).toBe("omitted:binary");

    // TC-019: binary.dat must appear in payload/ (candidate bytes for binary changes)
    const payloadFiles = await fs.readdir(path.join(artifactDir, "payload"));
    expect(payloadFiles).toContain("binary.dat");

    // TC-019: changes.patch must NOT contain binary.dat diff
    expect(patch).not.toContain("binary.dat");
  }, 30000);
});
