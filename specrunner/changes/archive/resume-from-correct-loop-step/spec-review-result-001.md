# Spec Review Result: resume-from-correct-loop-step

- **verdict**: approved

## Summary

Root cause analysis は正確。`pipeline.ts` safety-net が `finalState.step`（遷移テーブル適用後）を `resumePoint.step` に記録するため、fixer 未実行なのに `resumePoint.step = "code-fixer"` になる。design の「fixer-empty mismatch 検出」アプローチは最小変更で #236 を正確に修正する。

## Findings

### F1: Delta spec ヘッダーが MODIFIED だが ADDED であるべき [minor]

`specs/cli-resume-command/spec.md` は新規 capability（`specrunner/specs/cli-resume-command/` は未存在）。ヘッダー `## MODIFIED Requirements` → `## ADDED Requirements` に修正が必要。実装時に対応可能。

### F2: delta-spec-fixer ペアの暗黙カバレッジ [info]

`STANDARD_LOOP_FIXER_PAIRS` に `delta-spec-validation → delta-spec-fixer` が含まれるため、reverse map に `delta-spec-fixer → delta-spec-validation` が自動追加される。design D5 では 3 ペアのみ明示だが、実装は 4 ペアをカバーする。動作として正しいが、Task 3 にテストケースがない。implementer が追加すれば理想的。

### F3: steps パラメータの型注釈 [info]

Task 1.1 で `Record<string, { outcome: { verdict: string | null } }[]>` を使うが、schema.ts の `Record<string, StepRun[]>` を参照するほうが型安全。構造的には互換なので動作に問題なし。implementer 判断で OK。

## Verification Checklist

| 項目 | 結果 |
|------|------|
| request.md の目的と design.md の方針が整合 | ✅ design は request の「実バグシナリオ」を正確にカバー |
| design の root cause が source code と一致 | ✅ `pipeline.ts:100` の safety-net + `resolve-step.ts` Tier 2 の組合せ |
| tasks が design decisions を網羅 | ✅ D1-D6 すべて Task 1-4 にマッピング |
| テストケースが受け入れ基準を網羅 | ✅ 6/6 基準（fixer-empty→loop, fixer-ran→fixer, --from override, legacy path, mismatch-no-needsfix） |
| 既存テストへの regression リスク | ✅ 低。新ルールは Tier 2 の前に挿入、既存パスは steps=undefined で bypass |
| spec authority 反映 | ✅ 新規 cli-resume-command spec で documented（F1 のヘッダー修正要） |
| セキュリティ | ✅ 該当なし。ローカル state file の読み取りのみ、新しい attack surface なし |
| スコープ外の明示 | ✅ `--from <step-name>` 拡張、state restoration 拡張、cancel、concurrency は除外 |
