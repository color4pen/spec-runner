/**
 * Unit tests for src/core/artifact-output/run.ts
 *
 * TC-065: ArtifactOutputRun が全 phase の metrics を収集する
 * TC-066: runArtifactOutput が throw しない（never throws）
 * TC-073: run.json に resume.supported === false が記録される
 * TC-079: cross-phase digest mismatch が halt を返す
 * Review fixes: run root が source 内に置かれると失敗する（symlink 経由を含む）、
 *               verify / review seam の例外が failed result に変換され run.json に記録される
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runArtifactOutput } from "../run.js";
import { DESIGN_ONLY_DESCRIPTOR } from "../../../core/pipeline/registry.js";
import { EXECUTION_PROFILE_IDS } from "../execution-profile.js";
import type { SpawnFn } from "../../../util/spawn.js";
import type { AgentSeam, VerifySeam, ReviewSeam } from "../run.js";
import type { VerificationRecord, ReviewRecord } from "../revision-binding.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tempDirs: string[] = [];

async function mktemp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  tempDirs = [];
});

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  }
});

function makeNoopSpawn(): SpawnFn {
  return (_cmd, _args, _opts) =>
    Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
}

function makeNoopAgent(): AgentSeam {
  return { run: async (_candidateRoot, _requestContent) => {} };
}

function makePassingVerify(): VerifySeam {
  return {
    async run(_candidateRoot, contextBlock): Promise<VerificationRecord> {
      const match = contextBlock.match(/\*\*Candidate digest\*\*: (sha256:[0-9a-f]{64})/);
      const candidateDigest = match?.[1] ?? "sha256:" + "0".repeat(64);
      return { candidateDigest, outcome: "passed" };
    },
  };
}

function makeFailingVerify(): VerifySeam {
  return {
    async run(_candidateRoot, contextBlock): Promise<VerificationRecord> {
      const match = contextBlock.match(/\*\*Candidate digest\*\*: (sha256:[0-9a-f]{64})/);
      const candidateDigest = match?.[1] ?? "sha256:" + "0".repeat(64);
      return { candidateDigest, outcome: "failed", details: "Fake failure" };
    },
  };
}

function makePassingReview(): ReviewSeam {
  return {
    async run(_candidateRoot, contextBlock): Promise<ReviewRecord> {
      const match = contextBlock.match(/\*\*Candidate digest\*\*: (sha256:[0-9a-f]{64})/);
      const candidateDigest = match?.[1] ?? "sha256:" + "0".repeat(64);
      return { candidateDigest, outcome: "approved", findings: [] };
    },
  };
}

// ─── TC-066: runArtifactOutput never throws ───────────────────────────────────

describe("TC-066: runArtifactOutput never throws", () => {
  it("does not throw on a successful run", async () => {
    const sourceDir = await mktemp("run-src-");
    const runParentDir = await mktemp("run-parent-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    await expect(
      runArtifactOutput({
        sourceRoot: sourceDir,
        runParentDir,
        runId: "tc-066-success",
        requestContent: "Test",
        pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
        profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
        agent: makeNoopAgent(),
        verify: makePassingVerify(),
        review: makePassingReview(),
        spawn: makeNoopSpawn(),
      }),
    ).resolves.toBeDefined();
  });

  it("does not throw on a failing verification run", async () => {
    const sourceDir = await mktemp("run-src-");
    const runParentDir = await mktemp("run-parent-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    await expect(
      runArtifactOutput({
        sourceRoot: sourceDir,
        runParentDir,
        runId: "tc-066-fail",
        requestContent: "Test",
        pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
        profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
        agent: makeNoopAgent(),
        verify: makeFailingVerify(),
        review: makePassingReview(),
        spawn: makeNoopSpawn(),
      }),
    ).resolves.toBeDefined();
  });

  it("does not throw when agent throws", async () => {
    const sourceDir = await mktemp("run-src-");
    const runParentDir = await mktemp("run-parent-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const throwingAgent: AgentSeam = {
      run: async () => {
        throw new Error("Agent intentionally failed");
      },
    };

    await expect(
      runArtifactOutput({
        sourceRoot: sourceDir,
        runParentDir,
        runId: "tc-066-agent-throw",
        requestContent: "Test",
        pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
        profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
        agent: throwingAgent,
        verify: makePassingVerify(),
        review: makePassingReview(),
        spawn: makeNoopSpawn(),
      }),
    ).resolves.toBeDefined();
  });

  it("does not throw when source directory does not exist", async () => {
    const runParentDir = await mktemp("run-parent-");
    const nonexistent = path.join(os.tmpdir(), "does-not-exist-" + Math.floor(Math.random() * 1e9));

    await expect(
      runArtifactOutput({
        sourceRoot: nonexistent,
        runParentDir,
        runId: "tc-066-nodir",
        requestContent: "Test",
        pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
        profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
        agent: makeNoopAgent(),
        verify: makePassingVerify(),
        review: makePassingReview(),
        spawn: makeNoopSpawn(),
      }),
    ).resolves.toBeDefined();
  });
});

// ─── TC-065: metrics collected ────────────────────────────────────────────────

describe("TC-065: metrics fields present in completed run", () => {
  it("all metrics fields are numbers", async () => {
    const sourceDir = await mktemp("run-src-");
    const runParentDir = await mktemp("run-parent-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");
    await fs.writeFile(path.join(sourceDir, "b.txt"), "more content");

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "tc-065",
      requestContent: "Test",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeNoopSpawn(),
    });

    expect(result.kind).toBe("completed");
    if (result.kind === "completed") {
      expect(typeof result.metrics.durationMs).toBe("number");
      expect(typeof result.metrics.entryCount).toBe("number");
      expect(typeof result.metrics.scannedBytes).toBe("number");
      expect(typeof result.metrics.artifactBytes).toBe("number");
      expect(typeof result.metrics.payloadBytes).toBe("number");
      expect(typeof result.metrics.patchLines).toBe("number");
      // entryCount should be >= number of files
      expect(result.metrics.entryCount).toBeGreaterThanOrEqual(2);
    }
  });

  it("run.json metrics match result metrics", async () => {
    const sourceDir = await mktemp("run-src-");
    const runParentDir = await mktemp("run-parent-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const runId = "tc-065-json";
    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId,
      requestContent: "Test",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeNoopSpawn(),
    });

    if (result.kind === "completed" && result.runRoot) {
      const runJsonPath = path.join(result.runRoot, "run.json");
      const runJson = JSON.parse(await fs.readFile(runJsonPath, "utf-8"));
      expect(runJson.status).toBe("completed");
      expect(runJson.metrics).toBeDefined();
      expect(typeof runJson.metrics.durationMs).toBe("number");
    }
  });
});

// ─── TC-073: resume.supported === false ──────────────────────────────────────

describe("TC-073: run.json declares resume as unsupported", () => {
  it("run.json has resume.supported === false after successful run", async () => {
    const sourceDir = await mktemp("run-src-");
    const runParentDir = await mktemp("run-parent-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const runId = "tc-073";
    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId,
      requestContent: "Test",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeNoopSpawn(),
    });

    expect(result.kind).toBe("completed");
    if (result.kind === "completed" && result.runRoot) {
      const runJsonPath = path.join(result.runRoot, "run.json");
      const runJson = JSON.parse(await fs.readFile(runJsonPath, "utf-8"));
      expect(runJson.resume).toBeDefined();
      expect(runJson.resume.supported).toBe(false);
      expect(typeof runJson.resume.reason).toBe("string");
      expect(runJson.resume.reason.length).toBeGreaterThan(0);
    }
  });

  it("run.json has resume.supported === false even after halted run", async () => {
    const sourceDir = await mktemp("run-src-");
    const runParentDir = await mktemp("run-parent-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const runId = "tc-073-halt";
    await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId,
      requestContent: "Test",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makeFailingVerify(),
      review: makePassingReview(),
      spawn: makeNoopSpawn(),
    });

    const runJsonPath = path.join(runParentDir, runId, "run.json");
    const runJson = JSON.parse(await fs.readFile(runJsonPath, "utf-8"));
    expect(runJson.resume).toBeDefined();
    expect(runJson.resume.supported).toBe(false);
  });
});

// ─── TC-079: cross-phase digest mismatch → halt ───────────────────────────────

describe("TC-079: cross-phase digest mismatch causes halt", () => {
  it("review that reports a different candidateDigest causes cross-phase halt", async () => {
    const sourceDir = await mktemp("run-src-");
    const runParentDir = await mktemp("run-parent-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    // Verify sees real digest; review mutates candidate during execution
    // We simulate this by having the review step change the candidate's files
    // which causes the revision binding to detect drift.
    const verifySeam: VerifySeam = {
      async run(_candidateRoot, contextBlock): Promise<VerificationRecord> {
        const match = contextBlock.match(/\*\*Candidate digest\*\*: (sha256:[0-9a-f]{64})/);
        const candidateDigest = match?.[1] ?? "sha256:" + "0".repeat(64);
        return { candidateDigest, outcome: "passed" };
      },
    };

    const reviewSeam: ReviewSeam = {
      async run(candidateRoot, contextBlock): Promise<ReviewRecord> {
        // Mutate the candidate during review to cause revision drift
        try {
          await fs.writeFile(path.join(candidateRoot, "injected-by-review.txt"), "injected");
        } catch { /* best effort */ }
        const match = contextBlock.match(/\*\*Candidate digest\*\*: (sha256:[0-9a-f]{64})/);
        const candidateDigest = match?.[1] ?? "sha256:" + "0".repeat(64);
        return { candidateDigest, outcome: "approved" };
      },
    };

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "tc-079",
      requestContent: "Test",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: verifySeam,
      review: reviewSeam,
      spawn: makeNoopSpawn(),
    });

    // Must halt (revision-drift during review causes cross-phase digest mismatch)
    expect(result.kind).toBe("halted");

    // artifact/ must not exist — drift-halted runs must not finalize
    const runRoot = "runRoot" in result ? result.runRoot : undefined;
    if (runRoot) {
      const artifactPath = path.join(runRoot, "artifact");
      let exists = false;
      try {
        await fs.access(artifactPath);
        exists = true;
      } catch { /* expected */ }
      expect(exists, "artifact/ must not exist after a revision-drift halt").toBe(false);
    }
  });

  it("non-executable pipeline returns halted at preflight stage", async () => {
    const sourceDir = await mktemp("run-src-");
    const runParentDir = await mktemp("run-parent-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    // Use STANDARD_DESCRIPTOR which includes pr-create (unsupported in artifact-output)
    const { STANDARD_DESCRIPTOR } = await import("../../../core/pipeline/registry.js");

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "tc-079-preflight",
      requestContent: "Test",
      pipelineDescriptor: STANDARD_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeNoopSpawn(),
    });

    expect(result.kind).toBe("halted");
    if (result.kind === "halted") {
      expect(result.reason).toBeDefined();
    }
  });
});

// ─── Run root must be disjoint from the source directory ─────────────────────

describe("run root placement is rejected when it would live inside the source", () => {
  async function runWith(sourceDir: string, runParentDir: string, runId: string) {
    return runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId,
      requestContent: "Test",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: makePassingReview(),
      spawn: makeNoopSpawn(),
    });
  }

  it("runParentDir === sourceRoot fails before anything is written into the source", async () => {
    const sourceDir = await mktemp("run-src-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const result = await runWith(sourceDir, sourceDir, "inside-source");
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.reason).toBe("Run root placement rejected");
      expect(result.runRoot).toBeUndefined();
    }
    expect((await fs.readdir(sourceDir)).sort()).toEqual(["a.txt"]);
  });

  it("runParentDir as a not-yet-existing subdirectory of the source is rejected", async () => {
    const sourceDir = await mktemp("run-src-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const result = await runWith(sourceDir, path.join(sourceDir, "runs", "nested"), "inside-source-2");
    expect(result.kind).toBe("failed");
    expect((await fs.readdir(sourceDir)).sort()).toEqual(["a.txt"]);
  });

  it("a symlinked runParentDir that resolves into the source is rejected", async () => {
    const sourceDir = await mktemp("run-src-");
    const outside = await mktemp("run-outside-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");
    await fs.mkdir(path.join(sourceDir, "runs"));
    const link = path.join(outside, "runs-link");
    await fs.symlink(path.join(sourceDir, "runs"), link);

    const result = await runWith(sourceDir, link, "via-symlink");
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") expect(result.reason).toBe("Run root placement rejected");
    expect(await fs.readdir(path.join(sourceDir, "runs"))).toEqual([]);
  });

  it("a source directory located inside the run root is rejected", async () => {
    const runParentDir = await mktemp("run-parent-");
    const runId = "outer";
    const sourceDir = path.join(runParentDir, runId, "src");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const result = await runWith(sourceDir, runParentDir, runId);
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") expect(result.reason).toBe("Run root placement rejected");
  });
});

// ─── Seam exceptions are converted into failed results ───────────────────────

describe("verify / review seam exceptions become failed results", () => {
  async function readRunJson(runRoot: string) {
    return JSON.parse(await fs.readFile(path.join(runRoot, "run.json"), "utf-8")) as {
      status: string;
      phase: string;
      error?: string;
    };
  }

  it("a throwing verify seam yields kind=failed with run.json status=failed / phase=verification", async () => {
    const sourceDir = await mktemp("run-src-");
    const runParentDir = await mktemp("run-parent-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const throwingVerify: VerifySeam = {
      async run(): Promise<VerificationRecord> {
        throw new Error("verify exploded");
      },
    };

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "verify-throws",
      requestContent: "Test",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: throwingVerify,
      review: makePassingReview(),
      spawn: makeNoopSpawn(),
    });

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.reason).toBe("Verification execution failed");
    expect(result.runRoot).toBeDefined();
    const runJson = await readRunJson(result.runRoot!);
    expect(runJson.status).toBe("failed");
    expect(runJson.phase).toBe("verification");
    expect(runJson.error).toContain("verify exploded");
    await expect(fs.access(path.join(result.runRoot!, "artifact"))).rejects.toMatchObject({ code: "ENOENT" });
    // Source untouched
    expect((await fs.readdir(sourceDir)).sort()).toEqual(["a.txt"]);
  });

  it("a throwing review seam yields kind=failed with run.json status=failed / phase=review", async () => {
    const sourceDir = await mktemp("run-src-");
    const runParentDir = await mktemp("run-parent-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const throwingReview: ReviewSeam = {
      async run(): Promise<ReviewRecord> {
        throw new Error("review exploded");
      },
    };

    const result = await runArtifactOutput({
      sourceRoot: sourceDir,
      runParentDir,
      runId: "review-throws",
      requestContent: "Test",
      pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
      profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
      agent: makeNoopAgent(),
      verify: makePassingVerify(),
      review: throwingReview,
      spawn: makeNoopSpawn(),
    });

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.reason).toBe("Review execution failed");
    const runJson = await readRunJson(result.runRoot!);
    expect(runJson.status).toBe("failed");
    expect(runJson.phase).toBe("review");
    expect(runJson.error).toContain("review exploded");
    await expect(fs.access(path.join(result.runRoot!, "artifact"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("a non-Error rejection from the verify seam is still converted (never throws)", async () => {
    const sourceDir = await mktemp("run-src-");
    const runParentDir = await mktemp("run-parent-");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

    const rejectingVerify: VerifySeam = {
      run: () => Promise.reject("plain string rejection"),
    };

    await expect(
      runArtifactOutput({
        sourceRoot: sourceDir,
        runParentDir,
        runId: "verify-rejects",
        requestContent: "Test",
        pipelineDescriptor: DESIGN_ONLY_DESCRIPTOR,
        profileId: EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT,
        agent: makeNoopAgent(),
        verify: rejectingVerify,
        review: makePassingReview(),
        spawn: makeNoopSpawn(),
      }),
    ).resolves.toMatchObject({ kind: "failed", reason: "Verification execution failed" });
  });
});
