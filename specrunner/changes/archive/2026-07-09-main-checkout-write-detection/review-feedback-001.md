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

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | testing | `src/core/command/runner.ts` | TC-007（CLI が検出差分と resume 案内を出力する）は test-cases.md で category=integration / priority=must と宣言されているが、対応する自動テストが存在しない。runner.ts の drift 分岐（10 行の条件付き出力）はテストされていない。changed-line-coverage gate は DA レコードなしのまま pass した可能性が高い。コードは目視で正しく、変更は単純な条件分岐出力のみ。 | `handleResult` の drift 分岐をカバーする単体テストを追加する（logError/logInfo の spy で出力内容を確認）。 | no |

## Observations

- `emptyGuardSnapshot` の JSDoc に「importers が lcov レコードを生成し changed-line coverage gate の rule 3 が適用される」と記載されているが、`.specrunner/config.json` の `coverage.exclude` に `src/core/port/runtime-strategy.ts` が追加されたため、このファイルは coverage 計測対象外となっており JSDoc の説明は実態と乖離している。機能的影響はなく `emptyGuardSnapshot` 自体は `local.ts` で正当に利用されている。

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.90

## Summary

実装は設計（D1〜D7）を忠実に追い、受け入れ基準の大半を自動テストで固定している。typecheck / test (454 files, 6250 tests) / lint / changed-line-coverage の全フェーズが green。

**確認事項**:

- **純関数モジュール** (`main-checkout-guard.ts`): `resolveMonitoredGuardGlobs`・`matchesMonitored`・`diffGuardSnapshots` の 3 関数が fs / child_process なしで実装されており、D2 の「I/O は seam、判定は純関数」の分離が徹底されている。`diffGuardSnapshots` の created / modified / deleted / no-change の 4 分類（TC-013〜TC-016）はすべて単体テストで固定されている。
- **seam 設計** (`runtime-strategy.ts`): `snapshotMainCheckoutGuard` は port では optional、`RealRuntimeStrategy` では required として宣言されており、test fake への影響ゼロ・実 runtime への実装強制が `canDeriveChangedFiles` パターンと完全に対称。
- **LocalRuntime 実装** (`local.ts`): `detectSpecrunnerWorktree` で worktree モードを確認し、non-worktree では即 null を返す。`git status --porcelain -z --no-renames` を spawn し、出力 path を `matchesMonitored` でフィルタ、sha256 content hash を生成する。例外・非 0 exit はすべて catch して null を返す fail-open 契約（D6）が local-snapshot-guard.test.ts で検証されている。`.specrunner/local/` 等の gitignore 対象ファイルは `git status` が自然に除外するため監視対象外（D3 の意図どおり）。
- **executor 配線** (`executor.ts`): drift 検出は agent 実行後・output contract gate 前に配置され（T-07 の設計どおり）、成功フローのみで実行される。timeout/failure ガードより後に来るため、失敗ステップでは検出が走らない（D5）。drift 検出時は `recordFailedStepResult` → `transitionJob(awaiting-resume)` → `appendInterruption` → `appendHistory` → `persist` → `attachStateAndRethrow` の経路を踏み、`finalizeStepArtifacts`（commit）に進まないことが `executor-drift-detection.test.ts` で固定されている。
- **CLI 出力** (`runner.ts`): drift あり／なしの両分岐が正しく実装されている。drift なしの従来出力（resume 案内）は変更されていない。drift ありの出力は変更ファイル一覧・並行編集の可能性・`job resume` 案内を含み T-08 の要件を満たす。自動テストは存在しないが（Finding #1）コードは正しい。
- **state schema** (`schema.ts`): `mainCheckoutDrift` を optional で追加し、不在 legacy state が従来どおり parse できることを TC-022 テストで確認済み。
- **スコープ遵守**: adapter 側のパス制限・main checkout 全体監視・自動 revert・cli step への追加はすべてスコープ外として実装されていない。forbiddenSurfaces スキーマの変更もなし。
- **依存追加なし**: node 標準 `crypto`・`fs` と既存 util のみ。外部 npm パッケージの追加は確認されない。

