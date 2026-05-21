# Spec Review Result: cli-step-observable-progress

- **reviewer**: spec-reviewer
- **date**: 2026-05-17
- **verdict**: needs-fix

## Summary

request.md / design.md / tasks.md の 3 アーティファクトは全体的に高品質。ソースコード（pipeline.ts）の行番号参照・step kind 分類・loopNames ロジックの分析は正確で、設計判断（D1〜D6）も整合している。1 件の実装時テスト失敗を引き起こす欠落を検出したため needs-fix とする。

## Findings

### F1: retries exhausted フォーマット変更の影響テストが不完全 (severity: high)

**問題**: 要件 3-b は TC-029 (`tests/cli-stdout-snapshot.test.ts:298`) の fixture 更新のみを記載しているが、同じ `retries exhausted, escalating` 文字列を `toContain` で assert しているテストが他に 2 件存在する:

1. `tests/pipeline-integration.test.ts:531` (TC-016) — `expect(stdout).toContain("retries exhausted, escalating")`
2. `tests/core/pipeline/pipeline.test.ts:432` — `expect(stdout).toContain("[iter 2/2] retries exhausted, escalating")`

変更後のフォーマット `retries exhausted on <step>, escalating` では `retries exhausted, escalating` が部分文字列として一致しなくなる（`exhausted` の直後が `, ` ではなく ` on ` になるため）。これらのテストは実装後に fail する。

**修正案**: tasks.md に §4.2 / §4.3 として以下を追加:
- `tests/pipeline-integration.test.ts:531` を `retries exhausted on spec-review, escalating` に更新
- `tests/core/pipeline/pipeline.test.ts:432` を `[iter 2/2] retries exhausted on spec-review, escalating` に更新

### F2: request.md の L252 参照が不正確 (severity: low, non-blocking)

request.md 要件 1 に「L242 / L244 / L252 / L346 の `this.loopName` 参照も `currentStep` に置換」とあるが、L252 は `Pipeline finished: spec-review iterations=...` のハードコード文字列リテラルであり `this.loopName` を含まない。design.md D2 と tasks.md は正しく L252 を変更対象から除外しているため実装には影響しないが、request.md の記述が実装者を混乱させる可能性がある。

**修正案**: request.md 要件 1 のリストから L252 を除外し、「L242 / L244 / L346」に修正。

### F3: spec authority の既存フォーマット文字列がコードと不一致 (severity: info, pre-existing)

`specrunner/specs/pipeline-orchestrator/spec.md:150` の iteration start フォーマット `[iter <N>] <loopName> starting` は実際のコード `[iter <N>/<max>] starting <loopName>` と一致しない（`<N>` vs `<N>/<max>`、語順の違い）。tasks.md §7.1 が正しいフォーマット `[iter <N>/<max>] starting <currentStep>` で更新を提案しており、本変更でこの既存不一致は解消される。対応不要だが記録として残す。

## Checklist

| 項目 | 判定 |
|---|---|
| request.md ↔ design.md 整合 | ✅ 全設計判断が request の要件をカバー |
| design.md ↔ tasks.md 整合 | ✅ D1-D6 が tasks §1-§7 に 1:1 対応 |
| tasks.md のコード参照正確性 | ✅ diff が実ソースの行番号・変数名と一致 |
| step kind 分類の正確性 | ✅ verification/dsv/pr-create = cli, code-review = agent を確認 |
| テスト網羅性 | ❌ F1: 既存テスト 2 件の fixture 更新が欠落 |
| spec authority 更新の網羅性 | ✅ 既存 Requirement 更新 + 新規 Requirement 追加 |
| スコープ境界の明確性 | ✅ AgentStep non-loop / --verbose / color を明示的に除外 |
| セキュリティ考慮 | ✅ stdout 出力のみで入力処理なし。step 名は内部定数由来でインジェクションリスクなし |
