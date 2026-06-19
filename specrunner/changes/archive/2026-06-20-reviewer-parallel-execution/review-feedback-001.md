# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | testing | `src/core/pipeline/__tests__/reviewer-chain.test.ts` | `buildParallelReviewerTransitions` と 3 つの routing predicates（`conformanceFixInProgress` / `regressionGateActive` / `codeReviewLoopActive`）の unit test が存在しない。tasks.md T-11 が明示的に `reviewer-chain.test.ts` への追加を "must" 要件として規定しており、test-cases.md TC-029〜TC-032 (計 4 件 must) に対応するテストが未作成。この predicates の ordering バグはサイレントな誤ルーティング（fixer が wrong target へ戻る）を引き起こしうるが、E2E テストは mock 環境で間接的にしか検証できない。 | `buildParallelReviewerTransitions` の返す遷移行を検証する unit test（TC-029/TC-030）と、各 predicate の true/false 条件（conformanceFixInProgress / regressionGateActive / codeReviewLoopActive）を state ごとに確認する unit test（TC-031）を `reviewer-chain.test.ts` に追加する。`buildReviewerChainTransitions([code-review])` が無変更であることの確認（TC-032）も含める。 | yes |
| 2 | high | testing | `src/core/pipeline/__tests__/findings-ledger.test.ts` | `collectParallelFixerFindings` の unit test が存在しない。test-cases.md TC-024（複数 needs-fix member の fixable findings が集約・dedup される、must）と TC-025（approved member の findings を除外、should）に対応するテストが未作成。既存の `findings-ledger.test.ts` は `collectFindingsLedger` / `dedupeFindings` のみをカバーしており、新関数への拡張が漏れている。 | `collectParallelFixerFindings` の unit test を `findings-ledger.test.ts` に追加する。TC-024: needs-fix member 2 件の findings が dedup されて返る; TC-025: approved member の findings は含まれない。 | yes |
| 3 | high | testing | `tests/unit/core/step/executor.test.ts` (or new file) | commit mutex（`StepExecutor.commitMutex`）の直列化保証が unit test で検証されていない。test-cases.md TC-035（並行 execute() で finalizeStepArtifacts が直列実行される、must）が未作成。commit mutex はパラレル reviewer の correctness の要であり、E2E テストは mock `finalizeStepArtifacts` を使うため実際の直列化は観測できない。 | executor unit test に TC-035 を追加する: `finalizeStepArtifacts`（commit/push）を stub した上で 2 件の `executor.execute()` を同時呼び出しし、stub が重複せず直列に呼ばれることを assert する（`toHaveBeenCalledTimes(2)` + 呼び出し順序の確認）。 | yes |
| 4 | medium | maintainability | `src/core/pipeline/reviewer-status.ts` | `computeInvalidations` の JSDoc コメント「Managed runtime (touchedFiles = []) → no invalidation fires (fail-safe, non-intrusive)」が不正確。`activationPaths: undefined`（always-activate）の reviewer は `evaluateActivation` が条件チェックなしで `activated: true` を返すため、`touchedFiles = []` でも invalidation が発火し pending に戻される。managed runtime で always-activate reviewer を使うジョブでは追加 coordinator ラウンドが発生し、design の risk section（「invalidation 不発」）と実挙動が矛盾する。コードロジック自体は design D6「paths 未定義のレビュワーは常に pending に戻す」と整合しているが、コメントは誤読を招く。 | コメントを「Managed runtime (touchedFiles = []) → path-constrained reviewers are not invalidated (no path matches empty list). Always-activate reviewers (activationPaths undefined) are always reverted to pending regardless of touchedFiles, per design D6.」に修正する。 | yes |
| 5 | low | maintainability | `src/core/pipeline/pipeline.ts` (mergeParallelReviewerStates) | `mergeParallelReviewerStates` の `memberNames` パラメータが `string[] | undefined` の optional 型で、`memberSet` が空の場合に「member step は always copy」の条件が成立しない。実際の呼び出し側は常に `pending`（非 null）を渡すが、型シグネチャの optional 定義により future caller が `undefined` を渡した場合、再実行時に既存 member step の StepRun が上書きされない（prior round のデータが残る）リスクがある。 | `memberNames` を `string[]`（non-optional）に変更し、呼び出し側が必ず渡すことを型レベルで強制する。関数の invariant「member step は結果から必ず copy する」を型で表現する。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.15

## Summary

実装の設計品質は高い。parallel fan-out ロジック（coordinator 仮想ノード、Promise.allSettled、commit mutex、state merge、invalidation predicate）は設計 D1〜D9 に忠実で、全 5436 テストが typecheck + lint とともに green。

**問題は unit test カバレッジの欠落に集中している**。tasks.md T-11 が明示した「must」ターゲット 3 件（reviewer-chain.test.ts の並列遷移・predicate テスト、findings-ledger.test.ts の collectParallelFixerFindings テスト、executor の commit mutex 直列化テスト）が未作成。これらは E2E テストが mock 環境のため代替検証できない部分であり、将来のリグレッションリスクが残る。

Finding 4（コメント不正確）は correctness バグではなく、always-activate reviewer の動作が「managed runtime では fail-safe」という設計記述と実挙動が異なるドキュメント不整合。コメント修正で解消可能。

Finding 5（mergeParallelReviewerStates 型）は型安全性の軽微な問題で、実際の呼び出しは常に正しいが defensive に修正することを推奨。

Fix 対象: Finding 1〜5 すべて。
