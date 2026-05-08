# Design: spec-review lightweight mode enhancement

## Context

`src/config/type-config.ts` は request type ごとに `specReviewMode: "full" | "lightweight"` を定義し、refactoring と chore を lightweight に割り当てている。`spec-review.ts:88` で `getSpecReviewMode()` を呼び出し、`buildSpecReviewModeInstruction()` の戻り値を初期メッセージに注入する仕組みは実装済み。

しかし現在の lightweight instruction は以下の 1 行のみ:

```
Review scope: Architecture and specification review only. Security review is not required for this request type.
```

これはセキュリティ省略のみを指示し、振る舞い不変の前提や他の観点（completeness, consistency, feasibility）の省略を伝えていない。結果として lightweight でも full とほぼ同じ検証が走る。

maxTurns も full と同じ 15 が固定値として `SpecReviewStep` に定義されており、request type に応じた調整ができない。

## Goals

1. lightweight instruction を拡充し、review-standards.md のカテゴリに対応した verify / simplify / skip を明示する
2. lightweight 時の maxTurns を 10 に削減する仕組みを最小限の変更で追加する

## Non-Goals

- step-config resolution chain への type-level 追加（config schema の拡張）
- code-review の lightweight モード
- spec-fixer prompt の変更

## Decisions

### D1: lightweight instruction を観点別に構造化する

`buildSpecReviewModeInstruction("lightweight")` の戻り値を、review-standards.md のカテゴリ体系に合わせた構造化テキストに拡充する。

**Verify（通常通り検証）:**
- architecture: 設計パターン、責務分離、依存方向
- correctness: ロジック、境界条件

**Simplify（簡略化）:**
- completeness: 「タスク分割の網羅性」のみ確認。要件の網羅性は振る舞い不変なので不要
- consistency: 既存 spec との照合を省略。spec 変更がないため

**Skip（省略）:**
- feasibility: 工数見積は refactoring / chore では不要
- security: 既存の省略指示を継承

**根拠**: agent に「何をしない」を明示することで、不要な findings の生成を防ぐ。verify / simplify / skip の 3 段階は review-standards.md の severity 体系とは独立した「scope 制御」レイヤーであり、重複しない。

### D2: AgentStep に getMaxTurns を追加する

`AgentStep` interface に optional な `getMaxTurns?(state: JobState): number | undefined` を追加する。

**解決する問題**: `step.maxTurns` は静的な固定値であり、request type に応じた動的変更ができない。step-config resolution chain は config.steps に基づく静的解決であり、runtime state を参照しない。

**代替案と棄却理由**:
- step-config.ts に type-level resolution を追加 → config schema の拡張が必要。全 step に影響する変更であり、spec-review の 1 ケースには過剰
- config.steps["spec-review"].maxTurns を type 別に分岐 → config file は静的。runtime state を参照できない

**Resolution chain への影響**:
- `ClaudeCodeRunner` が `getStepExecutionConfig()` を呼ぶ際の `stepDefaults.maxTurns` を、`step.getMaxTurns?.(ctx.state) ?? step.maxTurns` で算出する
- config override（priority 1-2）は引き続き最優先。`getMaxTurns` は priority 3 の step definition レイヤーに位置する
- ManagedAgentRunner は maxTurns を使用しない（session timeout で制御）ため変更不要

### D3: SpecReviewStep に getMaxTurns を実装する

```typescript
getMaxTurns(state: JobState): number | undefined {
  const mode = getSpecReviewMode(state.request.type);
  return mode === "lightweight" ? 10 : undefined;
}
```

- lightweight → 10 を返す
- full → undefined を返す（`step.maxTurns: 15` にフォールバック）
- `step.maxTurns: 15` は full mode のデフォルト値として残す

### D4: full mode instruction は変更しない

現在の full instruction は十分に機能しており、変更の必要がない。lightweight のみを拡充する。
