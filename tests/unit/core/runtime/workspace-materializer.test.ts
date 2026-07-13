/**
 * Unit tests for workspace-materializer.ts
 *
 * TC-WM-001: All five DU variants of WorktreeMaterializationPlan are constructable.
 * TC-WM-002: "new-run" variant accepts an optional branchName.
 *
 * Note: workspace-materializer.ts is a type-only module. The bare import below
 * ensures the module is loaded at runtime (side-effect import survives esbuild
 * tree-shaking) so it appears in v8 coverage reports.
 */
// Side-effect import: forces the module to be loaded at runtime for coverage tracking.
import "../../../../src/core/runtime/workspace-materializer.js";
import { describe, it, expect } from "vitest";
import type { WorktreeMaterializationPlan } from "../../../../src/core/runtime/workspace-materializer.js";

describe("WorktreeMaterializationPlan", () => {
  describe("TC-WM-001: all DU variants are constructable", () => {
    it("no-worktree variant", () => {
      const plan: WorktreeMaterializationPlan = { kind: "no-worktree" };
      expect(plan.kind).toBe("no-worktree");
    });

    it("resume-existing variant", () => {
      const plan: WorktreeMaterializationPlan = {
        kind: "resume-existing",
        worktreePath: "/tmp/worktrees/job-abc",
      };
      expect(plan.kind).toBe("resume-existing");
      if (plan.kind === "resume-existing") {
        expect(plan.worktreePath).toBe("/tmp/worktrees/job-abc");
      }
    });

    it("resume-recreated variant", () => {
      const plan: WorktreeMaterializationPlan = {
        kind: "resume-recreated",
        remoteBaseRef: "origin/main",
      };
      expect(plan.kind).toBe("resume-recreated");
      if (plan.kind === "resume-recreated") {
        expect(plan.remoteBaseRef).toBe("origin/main");
      }
    });

    it("resume-without-recorded-worktree variant", () => {
      const plan: WorktreeMaterializationPlan = {
        kind: "resume-without-recorded-worktree",
        remoteBaseRef: "origin/main",
      };
      expect(plan.kind).toBe("resume-without-recorded-worktree");
      if (plan.kind === "resume-without-recorded-worktree") {
        expect(plan.remoteBaseRef).toBe("origin/main");
      }
    });

    it("new-run variant (without branchName)", () => {
      const plan: WorktreeMaterializationPlan = {
        kind: "new-run",
        remoteBaseRef: "origin/main",
      };
      expect(plan.kind).toBe("new-run");
      if (plan.kind === "new-run") {
        expect(plan.remoteBaseRef).toBe("origin/main");
        expect(plan.branchName).toBeUndefined();
      }
    });
  });

  describe("TC-WM-002: new-run accepts optional branchName", () => {
    it("new-run variant with branchName", () => {
      const plan: WorktreeMaterializationPlan = {
        kind: "new-run",
        remoteBaseRef: "origin/main",
        branchName: "feature/my-feature",
      };
      expect(plan.kind).toBe("new-run");
      if (plan.kind === "new-run") {
        expect(plan.branchName).toBe("feature/my-feature");
      }
    });
  });
});
