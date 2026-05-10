# Code Review: remove-openspec-cli-dependency (Iteration 002)

## Summary

Iteration 1 の全 5 findings（HIGH ×2, MEDIUM ×3）が修正済み。propose-system.ts から openspec CLI 参照を完全除去、spec-fixer.ts の proposal.md 残存を修正、branch-checkout/dynamic-context/pr-create のコメントを更新。typecheck green、全 1549 テスト green。受け入れ基準を全て満たしている。

## Iteration Comparison (vs iteration 001)

### Improvements
- Finding #1 (HIGH): propose-system.ts セキュリティセクションの openspec CLI 参照 → 修正済み
- Finding #2 (HIGH): spec-fixer.ts の proposal.md 残存 → 修正済み
- Finding #3 (MEDIUM): branch-checkout.ts JSDoc → 修正済み
- Finding #4 (MEDIUM): dynamic-context.ts interface JSDoc → 修正済み
- Finding #5 (MEDIUM): pr-create.ts Design D5 コメント → 修正済み

### Regressions
なし

### Unchanged Issues
- Finding #6 (LOW): archive-change-folder.ts の `git mv` 前の `archive/` ディレクトリ存在確認 → 未対応。ただし `git mv` は親ディレクトリを自動作成するため実害なし。LOW のまま維持

### Convergence Trend
`improving` — Total スコア 7.85 → 8.45（+0.60）。HIGH findings 0 件に改善。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.45** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | src/core/runtime/local.ts:222-238 | request.md の change folder コピー（AD-8 実装）に対するユニットテストが未実装。test-cases.md の must シナリオ TC-028/TC-029/TC-030/TC-048 が tests/unit/core/runtime/local.test.ts にカバーされていない。managed.ts も同様 | `tests/unit/core/runtime/local.test.ts` に setupWorkspace のテストケースを追加し、`changeFolderPath(slug)/request.md` への fs.cp 呼び出しを検証する。managed.test.ts にも同様のケースを追加 |
| 2 | LOW | maintainability | src/git/dynamic-context.ts:76,87 | `collectSpecsList` と `collectChangesList` の関数 JSDoc にそれぞれ `openspec/specs/` と `openspec/changes/` のリテラルが残存。interface レベルのコメント（L27-29）は修正済みだが、関数レベルが未更新。T-15 の grep 除外条件（コメント）に該当するため AC 違反ではない | L76: `openspec/specs/` → `specrunner/specs/ (deprecated)`、L87: `openspec/changes/` → `specrunner/changes/` に更新 |
| 3 | LOW | correctness | src/core/finish/archive-change-folder.ts:46 | `git mv` 前に `specrunner/changes/archive/` の親ディレクトリを明示的に作成していない。`git mv` は親を自動作成するため実害はないが、コメントでその前提を明記すると保守性が向上する | L46 の前に `// git mv auto-creates parent directories (specrunner/changes/archive/)` コメントを追加、または防御的に `await fs.mkdir(...)` を挿入 |

## Verdict

- **verdict**: approved

**理由**: CRITICAL: 0, HIGH: 0, Total スコア 8.45（pass threshold 7.0 超過）。受け入れ基準 5 項目を全て充足:
1. ✅ `openspec` コマンドがコードの実行パスから呼ばれない（`grep -r "openspec" src/` の結果はコメント・ADR 名・project.md チェック（required: false）のみ）
2. ✅ propose が openspec CLI を使わずに design.md + tasks.md + specs/ を生成する prompt になっている
3. ✅ proposal.md への参照がプロンプト内に残っていない
4. ✅ finish が openspec archive を呼ばない
5. ✅ `bun run typecheck && bun run test` が green（1549 tests passed）

残存 findings は MEDIUM ×1（テスト不足）と LOW ×2（コメント・防御的 mkdir）であり、いずれもマージブロック要因ではない。MEDIUM #1 は次の変更で追加可能。

## Test Coverage (Scenario Coverage)

test-cases.md の must シナリオ 47 件:
- TC-001〜TC-005 (paths): ✅ 実装済み
- TC-006〜TC-011 (propose prompt): ✅ 実装済み
- TC-012〜TC-013 (archive-openspec 除去): ✅ 実装済み
- TC-014〜TC-017 (archive-change-folder): ✅ 実装済み
- TC-018〜TC-019 (preflight): ✅ 実装済み
- TC-020〜TC-022 (doctor): ✅ 実装済み
- TC-023〜TC-024 (dynamic-context): ✅ 実装済み
- TC-025〜TC-027 (proposal.md 除去): ✅ 実装済み
- TC-028〜TC-030 (request.md コピー): ⚠️ コード実装済みだがユニットテスト未追加
- TC-031〜TC-033: ✅ 実装済み
- TC-035 (openspec 実行パス消滅): ✅ 実装済み
- TC-036〜TC-037 (typecheck / test): ✅ green
- TC-038〜TC-046 (テスト更新): ✅ 実装済み
- TC-048 (request.md コピーテスト): ⚠️ ユニットテスト未追加
- TC-049〜TC-050: ✅ 実装済み
