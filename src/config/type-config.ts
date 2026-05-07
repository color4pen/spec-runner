/**
 * TYPE_CONFIG: single source of truth for request type definitions.
 *
 * Defines 5 canonical request types aligned with openspec-workflow type-config.md:
 * new-feature, bug-fix, spec-change, refactoring, chore
 *
 * Each type declares:
 * - branchPrefix: git branch prefix for this type
 * - specReviewMode: review depth ("full" | "lightweight")
 * - specImpact: guidance for spec-review prompt injection
 * - description: human-readable description
 */

export interface TypeConfigEntry {
  branchPrefix: string;
  specReviewMode: "full" | "lightweight";
  specImpact: string;
  description: string;
}

export const TYPE_CONFIG: Record<string, TypeConfigEntry> = {
  "new-feature": {
    branchPrefix: "feat/",
    specReviewMode: "full",
    specImpact: "ADDED Requirements で新規 capability を追加",
    description: "新機能の追加",
  },
  "spec-change": {
    branchPrefix: "change/",
    specReviewMode: "full",
    specImpact: "MODIFIED/RENAMED/REMOVED Requirements で既存 spec を変更",
    description: "既存仕様の変更",
  },
  "refactoring": {
    branchPrefix: "refactor/",
    specReviewMode: "lightweight",
    specImpact: "振る舞い不変のため通常不要",
    description: "コードの内部構造改善（振る舞い不変）",
  },
  "bug-fix": {
    branchPrefix: "fix/",
    specReviewMode: "full",
    specImpact: "原因が spec 不備なら MODIFIED Requirements、実装だけの問題なら不要",
    description: "バグ修正",
  },
  "chore": {
    branchPrefix: "chore/",
    specReviewMode: "lightweight",
    specImpact: "通常不要（CI/依存更新等は spec 対象外）",
    description: "CI、依存更新、ドキュメントなど",
  },
};

/**
 * Get the branch prefix for a request type.
 * Unknown types fall back to "feat/" for backward compatibility.
 */
export function getBranchPrefix(type: string): string {
  return TYPE_CONFIG[type]?.branchPrefix ?? "feat/";
}

/**
 * Get the spec-review mode for a request type.
 * Unknown types fall back to "full" for backward compatibility.
 */
export function getSpecReviewMode(type: string): "full" | "lightweight" {
  return TYPE_CONFIG[type]?.specReviewMode ?? "full";
}
