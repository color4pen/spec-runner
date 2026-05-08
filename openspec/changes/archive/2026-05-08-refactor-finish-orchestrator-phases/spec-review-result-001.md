# Spec Review Result: refactor-finish-orchestrator-phases

- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-08
- **reviewer**: spec-reviewer

## Summary

Pure Extract Method リファクタリングの仕様として十分な精度と網羅性を持つ。proposal/design/tasks の行番号参照は実コード（orchestrator.ts L62-313）と完全一致。Phase 間のデータフロー（Phase2Result.mergeStateAfterPush → Phase 3）が明示的に設計されており、dispatcher の 80 行目標も達成可能な構造になっている。

## Review by Category

### architecture (verify)

**Score: 9/10**

- Extract Method を同ファイル内 module-private 関数で実行する方針は適切。export surface を変えない
- Phase2Result を PhaseResult から独立させた判断（D2）は正しい。汎用型に不要フィールドを混入させない
- Phase 3 にラッパーを追加しない判断（D3）は合理的。既存 mergeFeaturePrPhase3 は完結している
- markJobArchived を Phase 4 に包含する判断（D4）は論理的に正しい。finalize の最終ステップとして自然

### correctness (verify)

**Score: 8/10**

- Phase 1: `!operationCwd` 時のみ `checkoutFeatureBranch` を呼ぶガード条件が正しく保存される
- Phase 2: `archiveCwd` の導出（`operationCwd ?? cwd`）が push に使われ、poll には `cwd` が使われる差異が設計に反映されている（params に `operationCwd` と `cwd` の両方を渡す）
- Phase 4: worktree 有無 × isOnMain の 3 分岐が設計に網羅されている
- branch 削除の best-effort（exitCode !== 0 でも続行）が Phase 4 に包含される設計は実コード L298-306 と整合

### completeness (task decomposition)

**Score: 9/10**

- T1-T4 が request.md の要件 1-4 と 1:1 対応
- T5 の typecheck + test 確認が受け入れ基準をカバー
- 実行順序の制約（T1-T3 独立、T4 が統合）が明記されている

### consistency (reduced scope)

N/A — behavior-preserving change, cross-spec check skipped.

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | correctness | tasks.md:T2 | `archiveCwd` は Phase 1 スコープで定義されるため、Phase 2 関数内で `operationCwd ?? cwd` として再導出が必要。design.md は params で対応済みだが tasks.md に明記がない | T2 の移動対象コード説明に「`pushFeatureBranch` の cwd には `operationCwd ?? cwd` を渡す」を追記する。ただし実装者が design.md を参照すれば自明であり blocking ではない |
| 2 | LOW | correctness | tasks.md:T3 | `process.stderr.write`（L250, L301, L305）が stdoutWrite とは別経路で出力される点が tasks.md に明記されていない | T3 の注意事項に「stderr 出力は process.stderr.write を維持」を追記する。振る舞い不変の原則から自明だが明示的な方がよい |

## Verdict Rationale

CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 2。全 findings は情報提供レベルで承認阻止条件に該当しない。設計の精度が高く、実コードとの整合性が確認できた。
