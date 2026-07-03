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
  conventionalPrefix: string;
  /**
   * Whether this request type requires a behavior specification (spec.md with Requirements/Scenarios).
   * false → spec-exempt: design step may pass without writing any Requirements.
   * true → spec-required: design step must produce a non-empty spec.md.
   */
  specRequired: boolean;
}

export const TYPE_CONFIG: Record<string, TypeConfigEntry> = {
  "new-feature": {
    branchPrefix: "feat/",
    specReviewMode: "full",
    specImpact: "`## Requirements` で新規 capability を追加（tool が全 Requirement を ADDED に自動分類）",
    description: "新機能の追加",
    conventionalPrefix: "feat",
    specRequired: true,
  },
  "spec-change": {
    branchPrefix: "change/",
    specReviewMode: "full",
    specImpact: "`## Requirements` + `## Removed` / `## Renamed` で既存 spec を変更（tool が baseline 突合で ADDED/MODIFIED を自動分類）",
    description: "既存仕様の変更",
    conventionalPrefix: "feat",
    specRequired: true,
  },
  "refactoring": {
    branchPrefix: "refactor/",
    specReviewMode: "lightweight",
    specImpact: "振る舞い不変のため通常不要",
    description: "コードの内部構造改善（振る舞い不変）",
    conventionalPrefix: "refactor",
    specRequired: true,
  },
  "bug-fix": {
    branchPrefix: "fix/",
    specReviewMode: "full",
    specImpact: "原因が spec 不備なら `## Requirements` に修正内容を記載、実装だけの問題なら不要",
    description: "バグ修正",
    conventionalPrefix: "fix",
    specRequired: true,
  },
  "chore": {
    branchPrefix: "chore/",
    specReviewMode: "lightweight",
    specImpact: "通常不要（CI/依存更新等は spec 対象外）",
    description: "CI、依存更新、ドキュメントなど",
    conventionalPrefix: "chore",
    specRequired: false,
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

/**
 * Get the conventional commits prefix for a request type.
 * Unknown types fall back to "feat" for backward compatibility.
 */
export function getConventionalPrefix(type: string): string {
  return TYPE_CONFIG[type]?.conventionalPrefix ?? "feat";
}

/**
 * Whether the given request type requires a behavior specification (spec.md).
 *
 * Returns false for spec-exempt types (e.g. "chore") — design step may pass
 * without writing any Requirements or Scenarios.
 * Returns true for all other known types and unknown types (fail-closed).
 *
 * Unknown types default to true (spec-required) for backward compatibility and
 * to prevent silent failure-open on unrecognised types.
 */
export function isSpecRequired(type: string): boolean {
  return TYPE_CONFIG[type]?.specRequired ?? true;
}
