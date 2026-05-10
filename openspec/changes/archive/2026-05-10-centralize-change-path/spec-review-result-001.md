# Spec Review Result — centralize-change-path

- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-10
- **request-type**: refactoring

## Summary

設計は堅実。パスユーティリティの配置（`src/util/paths.ts`）、関数 API 設計（低レベル + 高レベルヘルパー）、re-export 戦略、循環依存の回避すべて適切。タスク分解に若干の漏れがあるが、受け入れ基準 8.3 の grep 検証が安全網として機能するため承認阻止には至らない。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | completeness | tasks.md | `src/core/pr-create/body-template.ts` に 5 箇所のパスリテラル（resultPathTemplate, line 67/72/77/106/113）があるがタスクに含まれていない | Task 2 にサブタスク追加: `body-template.ts` の `resultPathTemplate` ラムダと hardcoded path を `specReviewResultPath` / `verificationResultPath` / `reviewFeedbackPath` / `changeFolderPath` 経由に置換 |
| 2 | MEDIUM | completeness | tasks.md | `src/core/command/runner.ts:245` にフォールバックパスリテラルがあるがタスクに含まれていない | Task 6 にサブタスク追加: `runner.ts` の `specReviewResult.findingsPath ?? "openspec/changes/"` を `specReviewResultPath` 経由に置換 |
| 3 | MEDIUM | completeness | tasks.md (Section 7) | テストファイル 15 件以上が Task 7 に列挙されていない（`tests/unit/step/verification.test.ts`, `tests/unit/step/build-fixer.test.ts`, `tests/unit/adapter/managed-agent/agent-runner.test.ts`, `tests/prompts/propose-system.test.ts` 等） | Task 7 を拡充するか、「上記以外のファイルも 8.3 の grep で検出し置換する」の明示的なキャッチオール指示を追加 |
| 4 | LOW | correctness | tasks.md:20-21 | Task 2.5/2.6 が `src/core/verification/runner.ts:220` と `propagate.ts` の行番号を指定しているが、実装時にはズレる可能性がある。機能に影響なし | 行番号を目安として扱うか削除する（implementer は grep で特定するため影響小） |

## Category Assessment

### architecture (verify)

**Score: 9/10**

- `src/util/paths.ts` の配置は既存パターン（slugify, spawn, atomic-write）と整合
- pure function のみ・外部 import なしの設計で循環依存リスクをゼロにしている
- 2 層 API（`changeFolderPath` + 具体 result path ヘルパー）は適切な抽象レベル
- re-export による段階的移行（D3）は import churn を最小化する実用的判断

### correctness (verify)

**Score: 8/10**

- 関数シグネチャが実際のコードベースの使用パターン（zero-padding, path.join 分解）と一致
- fixture JSON 除外（D4）は backward compat テストとして正しい判断
- `specsDirRel()` / `changesDirRel()` の追加は R2 で specs パスも変更する可能性に対応

### completeness (simplified — task decomposition only)

**Assessment: Adequate with gaps**

- ソースファイル 19 件中 17 件がタスクでカバーされている（2 件漏れ: body-template.ts, command/runner.ts）
- テストファイル 31 件（fixture 除く）中 14 件が明示的に列挙されている（残り 17 件が暗黙）
- 受け入れ基準 8.3 の grep 検証がキャッチオールとして機能するため、実質的なリスクは低い

### consistency (simplified — skip cross-ref)

Skipped per review scope.
