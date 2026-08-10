/**
 * Unit tests for buildAdoptionHaltMessage.
 *
 * TC-009: buildAdoptionHaltMessage の 3 分岐
 *   (a) dirtyCanonPaths のみ非空（unadoptedCommits 空）→ --apply-canon のみ、dirty path 列挙
 *   (b) dirtyCanonPaths と unadoptedCommits の両方が非空 → --apply-canon --adopt-commits、両列挙
 *   (c) commitDetectionFailed: true（unadoptedCommits 空）→ --apply-canon のみ、検出失敗を言及
 *
 * Source: test-cases.md > TC-009
 *
 * RED state: buildAdoptionHaltMessage は T-01 実装前は adopt-commits.ts に存在しない。
 *   import は成功するが値が undefined → 呼び出しで "not a function" TypeError が発生し fail する。
 * GREEN: T-01 実装後、3 分岐の出力を検証して pass する。
 */

import { describe, it, expect } from "vitest";
import type { UnadoptedCommit } from "../adopt-commits.js";
import * as _adoptCommitsModule from "../adopt-commits.js";

// TC-009: buildAdoptionHaltMessage は T-01 が実装するまで adopt-commits.ts に存在しない。
// RED state では undefined になるため、呼び出しで TypeError が発生し fail する (RED 確認)。
// GREEN state: T-01 実装後に関数が存在し、3 分岐の出力を検証して pass する。
//
// dynamic access を使って TS コンパイルエラーを回避しつつ、
// ランタイムでの RED（undefined 呼び出し）を保持する。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildAdoptionHaltMessage = (_adoptCommitsModule as any).buildAdoptionHaltMessage as (args: {
  slug: string;
  dirtyCanonPaths: string[];
  unadoptedCommits: UnadoptedCommit[];
  commitDetectionFailed?: boolean;
}) => string;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_SLUG = "my-feature-job";
const DIRTY_PATH_1 = "specrunner/changes/my-feature-job/tasks.md";
const DIRTY_PATH_2 = "specrunner/changes/my-feature-job/design.md";

const SAMPLE_COMMIT: UnadoptedCommit = {
  oid: "abc1234567890abcdef1234567890abcdef123456",
  shortSha: "abc1234",
  subject: "operator: fix escalation handling",
  author: "Operator Dev",
  paths: ["specrunner/changes/my-feature-job/spec.md"],
};

const SECOND_COMMIT: UnadoptedCommit = {
  oid: "def5678901234567890abcdef567890abcdef5678",
  shortSha: "def5678",
  subject: "operator: add missing test coverage",
  author: "Another Dev",
  paths: ["src/core/command/resume.ts"],
};

// ---------------------------------------------------------------------------
// TC-009(a): dirtyCanonPaths のみ → --apply-canon のみ
// ---------------------------------------------------------------------------

describe("TC-009(a): buildAdoptionHaltMessage — dirty canon only", () => {
  it("TC-009: complete command contains --apply-canon", () => {
    // TC-009(a): dirty canon only path
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [],
    });
    expect(msg).toContain("--apply-canon");
  });

  it("TC-009: complete command does NOT contain --adopt-commits", () => {
    // TC-009(a): adopt-commits must be absent when no unadopted commits
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [],
    });
    expect(msg).not.toContain("--adopt-commits");
  });

  it("TC-009: complete command line is 'specrunner job resume <slug> --apply-canon'", () => {
    // TC-009(a): full copyable command must include real slug
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [],
    });
    expect(msg).toContain(`specrunner job resume ${TEST_SLUG} --apply-canon`);
  });

  it("TC-009: dirty canon path is enumerated in the output", () => {
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [],
    });
    expect(msg).toContain(DIRTY_PATH_1);
  });

  it("TC-009: multiple dirty canon paths are all enumerated", () => {
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1, DIRTY_PATH_2],
      unadoptedCommits: [],
    });
    expect(msg).toContain(DIRTY_PATH_1);
    expect(msg).toContain(DIRTY_PATH_2);
  });

  it("TC-009: output returns a non-empty string", () => {
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [],
    });
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TC-009(b): dirtyCanonPaths + unadoptedCommits → --apply-canon --adopt-commits、両列挙
// ---------------------------------------------------------------------------

describe("TC-009(b): buildAdoptionHaltMessage — dirty canon + unadopted commits", () => {
  it("TC-009: complete command contains both --apply-canon and --adopt-commits", () => {
    // TC-009(b): both flags required when both issues present
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [SAMPLE_COMMIT],
    });
    expect(msg).toContain("--apply-canon");
    expect(msg).toContain("--adopt-commits");
  });

  it("TC-009: complete command line is 'specrunner job resume <slug> --apply-canon --adopt-commits'", () => {
    // TC-009(b): single copyable command with both flags in one line
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [SAMPLE_COMMIT],
    });
    expect(msg).toContain(`specrunner job resume ${TEST_SLUG} --apply-canon --adopt-commits`);
  });

  it("TC-009: dirty canon path is enumerated", () => {
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [SAMPLE_COMMIT],
    });
    expect(msg).toContain(DIRTY_PATH_1);
  });

  it("TC-009: unadopted commit shortSha is enumerated", () => {
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [SAMPLE_COMMIT],
    });
    expect(msg).toContain(SAMPLE_COMMIT.shortSha);
  });

  it("TC-009: unadopted commit subject is enumerated", () => {
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [SAMPLE_COMMIT],
    });
    expect(msg).toContain(SAMPLE_COMMIT.subject);
  });

  it("TC-009: multiple unadopted commits are all enumerated", () => {
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [SAMPLE_COMMIT, SECOND_COMMIT],
    });
    expect(msg).toContain(SAMPLE_COMMIT.shortSha);
    expect(msg).toContain(SECOND_COMMIT.shortSha);
    expect(msg).toContain(SECOND_COMMIT.subject);
  });
});

// ---------------------------------------------------------------------------
// TC-009(c): commitDetectionFailed: true → --apply-canon のみ、検出失敗を言及
// ---------------------------------------------------------------------------

describe("TC-009(c): buildAdoptionHaltMessage — commit detection failed", () => {
  it("TC-009: complete command contains --apply-canon when detection failed", () => {
    // TC-009(c): must still guide operator to resolve dirty canon
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [],
      commitDetectionFailed: true,
    });
    expect(msg).toContain("--apply-canon");
  });

  it("TC-009: complete command does NOT contain --adopt-commits when detection failed", () => {
    // TC-009(c): must NOT recommend --adopt-commits without confirmed detection
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [],
      commitDetectionFailed: true,
    });
    expect(msg).not.toContain("--adopt-commits");
  });

  it("TC-009: complete command line is 'specrunner job resume <slug> --apply-canon' (no --adopt-commits)", () => {
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [],
      commitDetectionFailed: true,
    });
    expect(msg).toContain(`specrunner job resume ${TEST_SLUG} --apply-canon`);
  });

  it("TC-009: output mentions that detection of unknown commits could not be completed", () => {
    // TC-009(c): operator must know detection was incomplete, not that there are no commits
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [],
      commitDetectionFailed: true,
    });
    const lower = msg.toLowerCase();
    const mentionsFailure =
      lower.includes("fail") ||
      lower.includes("could not") ||
      lower.includes("unable") ||
      lower.includes("detect");
    expect(
      mentionsFailure,
      "output must mention that commit detection could not be completed",
    ).toBe(true);
  });

  it("TC-009: dirty canon path is still enumerated even when detection failed", () => {
    const msg = buildAdoptionHaltMessage({
      slug: TEST_SLUG,
      dirtyCanonPaths: [DIRTY_PATH_1],
      unadoptedCommits: [],
      commitDetectionFailed: true,
    });
    expect(msg).toContain(DIRTY_PATH_1);
  });
});
