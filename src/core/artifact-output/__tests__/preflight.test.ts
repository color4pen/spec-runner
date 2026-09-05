/**
 * Unit tests for src/core/artifact-output/preflight.ts and execution-profile.ts
 *
 * TC-028: 非対応ステップが実行前に列挙される
 * TC-029: 実行不能な pipeline がワークスペース作成前に停止する
 * TC-030: Issue 起点の entry が preflight で拒否される
 * TC-031: git-pr profile で既存 pipeline の unsupported が 0 件になる
 * TC-053: preflight.ts が fs および child_process を import しない
 * TC-054: 既存の runtime-capability-gate.ts に変更がない
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  planEffectivePipeline,
  renderEffectivePipelineReport,
} from "../preflight.js";
import {
  assertEntryRouteSupported,
  EXECUTION_PROFILE_IDS,
  UNSUPPORTED_OPERATIONS,
} from "../execution-profile.js";
import {
  STANDARD_DESCRIPTOR,
  FAST_DESCRIPTOR,
  DESIGN_ONLY_DESCRIPTOR,
} from "../../../core/pipeline/registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── TC-031: git-pr profile — all existing pipelines have 0 unsupported ──────

describe("TC-031: git-pr profile — existing pipelines have 0 unsupported steps", () => {
  it("standard pipeline: all steps supported", () => {
    const report = planEffectivePipeline(STANDARD_DESCRIPTOR, EXECUTION_PROFILE_IDS.GIT_PR);
    expect(report.unsupported).toHaveLength(0);
    expect(report.executable).toBe(true);
  });

  it("fast pipeline: all steps supported", () => {
    const report = planEffectivePipeline(FAST_DESCRIPTOR, EXECUTION_PROFILE_IDS.GIT_PR);
    expect(report.unsupported).toHaveLength(0);
    expect(report.executable).toBe(true);
  });

  it("design-only pipeline: all steps supported", () => {
    const report = planEffectivePipeline(DESIGN_ONLY_DESCRIPTOR, EXECUTION_PROFILE_IDS.GIT_PR);
    expect(report.unsupported).toHaveLength(0);
    expect(report.executable).toBe(true);
  });
});

// ─── TC-028: artifact-output profile — pr-create is unsupported ──────────────

describe("TC-028: artifact-output profile — unsupported steps listed before execution", () => {
  it("standard pipeline: pr-create is unsupported", () => {
    const report = planEffectivePipeline(STANDARD_DESCRIPTOR, EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT);
    const prEntry = report.unsupported.find((u) => u.step === "pr-create");
    expect(prEntry).toBeDefined();
    expect(prEntry?.missing).toContain("git-remote-publish");
    expect(prEntry?.missing).toContain("github-api");
  });

  it("artifact-output pipeline: executable is false when pr-create is in pipeline", () => {
    const report = planEffectivePipeline(STANDARD_DESCRIPTOR, EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT);
    expect(report.executable).toBe(false);
  });

  it("design-only pipeline: executable is true in artifact-output (no git steps)", () => {
    const report = planEffectivePipeline(DESIGN_ONLY_DESCRIPTOR, EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT);
    expect(report.executable).toBe(true);
    expect(report.unsupported).toHaveLength(0);
  });

  it("unsupported operations list is non-empty", () => {
    const report = planEffectivePipeline(STANDARD_DESCRIPTOR, EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT);
    expect(report.unsupportedOperations.length).toBeGreaterThan(0);
  });
});

// ─── TC-029: executable: false when pipeline has unsupported steps ────────────

describe("TC-029: non-executable pipeline stops before workspace creation", () => {
  it("planEffectivePipeline returns executable: false for artifact-output + standard", () => {
    const report = planEffectivePipeline(STANDARD_DESCRIPTOR, EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT);
    expect(report.executable).toBe(false);
  });

  it("renderEffectivePipelineReport includes unsupported steps", () => {
    const report = planEffectivePipeline(STANDARD_DESCRIPTOR, EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT);
    const rendered = renderEffectivePipelineReport(report);
    expect(rendered).toContain("pr-create");
  });
});

// ─── TC-030: issue entry routes rejected for artifact-output ─────────────────

describe("TC-030: issue entry routes rejected for artifact-output profile", () => {
  it("fromIssue=true throws for artifact-output", () => {
    expect(() =>
      assertEntryRouteSupported({ fromIssue: true }, EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT),
    ).toThrow();
  });

  it("issueLinked=true throws for artifact-output", () => {
    expect(() =>
      assertEntryRouteSupported({ issueLinked: true }, EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT),
    ).toThrow();
  });

  it("fromIssue=true does NOT throw for git-pr profile", () => {
    expect(() =>
      assertEntryRouteSupported({ fromIssue: true }, EXECUTION_PROFILE_IDS.GIT_PR),
    ).not.toThrow();
  });

  it("issueLinked=true does NOT throw for git-pr profile", () => {
    expect(() =>
      assertEntryRouteSupported({ issueLinked: true }, EXECUTION_PROFILE_IDS.GIT_PR),
    ).not.toThrow();
  });

  it("neither option set: does not throw for either profile", () => {
    expect(() =>
      assertEntryRouteSupported({}, EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT),
    ).not.toThrow();
    expect(() =>
      assertEntryRouteSupported({}, EXECUTION_PROFILE_IDS.GIT_PR),
    ).not.toThrow();
  });
});

// ─── UNSUPPORTED_OPERATIONS content ──────────────────────────────────────────

describe("UNSUPPORTED_OPERATIONS table", () => {
  it("contains push-pr-merge operation", () => {
    expect(UNSUPPORTED_OPERATIONS.some((op) => op.id === "push-pr-merge")).toBe(true);
  });

  it("contains archive-record operation", () => {
    expect(UNSUPPORTED_OPERATIONS.some((op) => op.id === "archive-record")).toBe(true);
  });

  it("contains commit-adopt-egress-ledger operation", () => {
    expect(UNSUPPORTED_OPERATIONS.some((op) => op.id === "commit-adopt-egress-ledger")).toBe(true);
  });

  it("contains remote-reattach operation", () => {
    expect(UNSUPPORTED_OPERATIONS.some((op) => op.id === "remote-reattach")).toBe(true);
  });

  it("contains issue-unattended-managed operation", () => {
    expect(UNSUPPORTED_OPERATIONS.some((op) => op.id === "issue-unattended-managed")).toBe(true);
  });

  it("contains commit-oid-operations operation", () => {
    expect(UNSUPPORTED_OPERATIONS.some((op) => op.id === "commit-oid-operations")).toBe(true);
  });

  it("all operations have non-empty displayName and reason", () => {
    for (const op of UNSUPPORTED_OPERATIONS) {
      expect(op.displayName.length, `${op.id} displayName empty`).toBeGreaterThan(0);
      expect(op.reason.length, `${op.id} reason empty`).toBeGreaterThan(0);
    }
  });
});

// ─── TC-053: preflight.ts has no fs/child_process imports ────────────────────

describe("TC-053: preflight.ts does not import fs or child_process", () => {
  it("preflight.ts source has no fs or child_process imports", () => {
    const srcPath = path.join(__dirname, "../preflight.ts");
    const src = fs.readFileSync(srcPath, "utf-8");
    expect(src).not.toMatch(/from\s+['"]node:fs/);
    expect(src).not.toMatch(/from\s+['"]node:child_process/);
  });

  it("execution-profile.ts source has no fs or child_process imports", () => {
    const srcPath = path.join(__dirname, "../execution-profile.ts");
    const src = fs.readFileSync(srcPath, "utf-8");
    expect(src).not.toMatch(/from\s+['"]node:fs/);
    expect(src).not.toMatch(/from\s+['"]node:child_process/);
  });
});

// ─── TC-054: runtime-capability-gate.ts is unchanged ────────────────────────

describe("TC-054: runtime-capability-gate.ts is not modified by this change", () => {
  it("runtime-capability-gate.ts does not import artifact-output or snapshot modules", () => {
    const gateFile = path.join(
      __dirname,
      "../../../core/pipeline/runtime-capability-gate.ts",
    );
    const src = fs.readFileSync(gateFile, "utf-8");
    expect(src).not.toContain("artifact-output");
    expect(src).not.toContain("snapshot");
    expect(src).not.toContain("execution-profile");
  });
});
