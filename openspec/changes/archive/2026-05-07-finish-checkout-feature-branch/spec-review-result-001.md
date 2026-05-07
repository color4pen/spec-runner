# Spec Review Result: finish-checkout-feature-branch

- **verdict**: approved
- **iteration**: 1
- **date**: 2026-05-07
- **request-type**: bug-fix

## Summary

仕様は request の 4 要件・3 受け入れ基準をすべて網羅しており、既存コードとの整合性も確認済み。proposal → design → tasks の一貫性が高く、実装可能な粒度まで分解されている。CRITICAL/HIGH の指摘なし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | proposal.md:17 | request は `git checkout -` で戻ると記述しているが、design は `git checkout <originalBranch>` を採用。design の方がシェル状態に依存せず堅牢だが、乖離は明示すべき | proposal.md に「request の `git checkout -` は `git checkout <originalBranch>` に変更（堅牢性のため）」と一文追加 |
| 2 | LOW | completeness | tasks.md:103 | TC-CHECKOUT-4（restore 失敗 → warning のみ）で stderr の warning 内容の assert がない。テスト実装時に検証漏れの余地がある | TC-CHECKOUT-4 の期待値に `stderr contains "warning"` 相当の記述を追加 |
| 3 | LOW | correctness | design.md:97 | restore 失敗時「stderr に warning を出力（escalation は Check 5/6 の結果を優先）」とあるが、Check 5/6 成功 + restore 失敗のケースでは `{ ok: true }` を返す設計。ユーザーが git 状態の不整合に気付けるかは stderr 依存になる | 現行設計で許容範囲。Phase 1 が再 checkout するため実害なし。ドキュメントの注記で十分 |

## Completeness Check

| Request Requirement | Covered By | Status |
|---------------------|-----------|--------|
| R1: validate 前に `git checkout <state.branch>` | design.md `checkoutForValidation` / tasks T2 | ✅ |
| R2: 完了後に元 branch に戻る（成功/失敗問わず） | design.md `restoreBranch` + finally / tasks T2 | ✅ |
| R3: checkout 失敗時は escalation | design.md エラーハンドリング表 / tasks T1 | ✅ |
| R4: managed mode で `git fetch` 先行 | design.md `checkoutForValidation` 内 fetch+checkout | ✅ |

| Acceptance Criteria | Covered By | Status |
|--------------------|-----------|--------|
| AC1: local mode で Phase 0 check 6 通過 | TC-CHECKOUT-1 | ✅ |
| AC2: finish 完了後に元 branch に戻る | TC-CHECKOUT-2 (finally) | ✅ |
| AC3: typecheck + test green | T5 | ✅ |

## Consistency Check

- `ResolvedTarget.branch: string` が存在することを確認済み（types.ts:14）
- preflight.ts の Check 5（L103-106）と Check 6（L112-130）の位置が tasks.md T2 の記述と一致
- Phase 1 の `-B` フラグによる冪等性は design.md の記述通り
- Check 8（L132-147）は restore 後に実行されるが、pre-existing の問題であり本 change のスコープ外

## Feasibility Check

- 変更対象は `preflight.ts` 1 ファイル + テスト 1 ファイルのみ。影響範囲が限定的
- `SpawnFn` 経由の git 操作で、既存の DI パターンに従っている
- テストは既存の spawn mock パターンを拡張するだけで対応可能
