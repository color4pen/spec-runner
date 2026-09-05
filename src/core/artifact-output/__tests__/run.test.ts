/**
 * Unit tests for src/core/artifact-output/run.ts
 *
 * TC-065: ArtifactOutputRun が全 phase の metrics を収集する
 * TC-066: runArtifactOutput が throw しない（never throws）
 * TC-073: run.json に resume.supported === false が記録される
 * TC-079: cross-phase digest mismatch が halt を返す
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
    let candidateRootRef = "";
    const verifySeam: VerifySeam = {
      async run(candidateRoot, contextBlock): Promise<VerificationRecord> {
        candidateRootRef = candidateRoot;
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

    // Must halt (revision-drift during review or cross-phase digest mismatch)
    expect(["halted", "failed"]).toContain(result.kind);
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
