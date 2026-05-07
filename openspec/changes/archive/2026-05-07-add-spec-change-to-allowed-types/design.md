## Context

spec-runner は request.md の `type` field を 6 type（`new-feature`, `bug-fix`, `refactor`, `documentation`, `chore`, `improvement`）で定義しているが、openspec-workflow の type-config.md は 5 type（`new-feature`, `bug-fix`, `spec-change`, `refactoring`, `chore`）。乖離がある。

branch prefix は `propose.ts:61` と `executor.ts:218` で `feat/` にハードコード。type は spec-review prompt に `{{REQUEST_TYPE}}` として注入されるのみで、pipeline のフロー分岐に使われていない。

## Goals / Non-Goals

**Goals:**

- TYPE_CONFIG を single source of truth として 5 type を集約する
- branch prefix を type から動的に解決する
- spec-review mode（full / lightweight）を type から解決して prompt に注入する
- BRANCH_PREFIXES を TYPE_CONFIG から導出する
- 後方互換: unknown type は warning 続行を維持する

**Non-Goals:**

- code-review の weight override（将来の拡張ポイントとして予約）
- bug-fix の execute-bugfix 委譲（spec-runner に execute-bugfix が未実装）
- ADR 生成の type 連動（spec-runner に ADR step が未実装）

## Decisions

### D1: TYPE_CONFIG の配置と型

`src/config/type-config.ts` に配置する。既存の `schema.ts`（型定義）/ `step-config.ts`（解決ロジック）と対称構造。

```typescript
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
```

**理由**: `Record<string, TypeConfigEntry>` で将来の type 追加に型変更不要。`adrRequired` や `weights` が必要になれば field 追加で拡張可能。

### D2: ALLOWED_TYPES の導出

`request-md.ts` の `ALLOWED_TYPES` を `Object.keys(TYPE_CONFIG)` で導出する。`isAllowedType()` は `key in TYPE_CONFIG` に置き換え。

**理由**: 重複定義を排除し、TYPE_CONFIG が唯一の type 定義源になる。

### D3: branch prefix の解決

`propose.ts:61` と `executor.ts:218` で `TYPE_CONFIG[deps.request.type]?.branchPrefix ?? "feat/"` に置き換える。unknown type は `feat/` fallback で後方互換を維持。

`deps.request.type` は既存の `StepContext.request` 経由でアクセス可能。PipelineDeps / StepContext の型変更は不要。

**理由**: Step は既に `deps.request` で request 情報に依存しており、追加の間接層は over-engineering。

### D4: BRANCH_PREFIXES の導出

`job-slug.ts:17` の `BRANCH_PREFIXES` を `Object.values(TYPE_CONFIG).map(c => c.branchPrefix)` で導出。重複排除は不要（各 type の prefix はユニーク）。

**理由**: branch 生成（D3）と slug strip（job-slug.ts）が単一情報源（TYPE_CONFIG）から導出されることを保証する。

### D5: specReviewMode の注入

`SpecReviewPromptInput` に `specReviewMode: "full" | "lightweight"` を追加。`spec-review.ts:buildMessage()` で `TYPE_CONFIG[request.type]?.specReviewMode ?? "full"` を解決し、`SpecReviewPromptInput` 経由で渡す。prompt 層（`spec-review-system.ts`）が `config/type-config.ts` を直接 import しない。

`buildSpecReviewInitialMessage()` は mode に応じた指示文をテンプレートに埋め込む:
- `"full"`: security-reviewer の観点を含むフルレビュー
- `"lightweight"`: architect + spec-reviewer のみ、security 観点は対象外

**理由**: 関心の分離。prompt → config の直接依存を避け、step 層が config を解決する既存パターン（D3 of step-config-externalization）に従う。
