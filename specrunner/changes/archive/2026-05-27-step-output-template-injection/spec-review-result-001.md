# Spec Review Result

- **verdict**: needs-fix

## Summary

設計の方向性・アーキテクチャ選択は妥当。ただし tasks.md の iteration 番号算出式に演算子優先順位の誤りがあり、そのままでは `spec-review-result-002.md` が生成されずに `001.md` が上書きされるバグが発生する。request.md の受け入れ基準に存在しない step 名（"propose step"）も implementer に混乱を与えるため修正が必要。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|-----------|
| 1 | HIGH | Correctness | tasks.md (T-01) | iteration 番号算出式 `state.steps[stepName]?.length ?? 0 + 1` に演算子優先順位の誤り。JavaScript では `a ?? 0 + 1` = `a ?? (0 + 1)` = `a ?? 1` と評価されるため、length が 1 のとき `1 ?? 1 = 1` となり、2回目の spec-review が `spec-review-result-001.md` を上書きする。delta spec のシナリオ（1 existing entry → `spec-review-result-002.md`）と矛盾。 | `(state.steps[stepName]?.length ?? 0) + 1` と括弧を補う。既存の `computeSpecReviewIteration` (spec-review.ts L56) が正しい実装の参照例。 |
| 2 | MEDIUM | Consistency | request.md (受け入れ基準 4) | "delta-spec-template.md が **propose step** 完了後に削除されていること" — "propose step" は step-names.ts に存在しない。design.md (D3)、tasks.md (T-01, T-03)、delta spec はすべて "design step" と記載しており用語が不一致。implementer が誤った step に cleanup を組み込むリスクがある。 | "propose step" → "design step" に修正する。 |
| 3 | LOW | Robustness | design.md (D5 / Risks) | A群テンプレートが agent に上書きされなかった場合（agent が別パスに書いた場合など）、テンプレートのスケルトンが commitAndPush で commit に含まれるリスクが Risks セクションに記載されていない。受け入れ基準「テンプレート残骸が PR に含まれないこと」を保証する実装上の仕組みが設計で言及されていない。 | Risks セクションに "A群テンプレートが上書きされなかった場合のリスクと対策（agent が上書きするという前提を受け入れ、テンプレートファイル名で git diff を確認するなど）" を追記する。必須ではないがトレードオフとして明示することを推奨。 |
