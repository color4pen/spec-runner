# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Implementation gap | tasks.md § T-03 | `skipped` 結果の `commitRound` 畳み込みで `completedAt` が不明。`StepExecutionResult` の skipped 変形は `skipReason` のみで timestamp を持たず、member tuple の `startedAt` との対称性が暗黙。 | `commitRound` の skipped 畳み込みでは `startedAt` を member tuple から取り、`completedAt = startedAt`（または commit 時の `now`）を使う実装で対応できる。spec の範囲外だが PR レビューで確認する。 |
| 2 | LOW | Implementation gap | tasks.md § T-02 / T-04 | `halt` / `skipped` 結果の `startedAt` を member tuple に詰める手段が未明示。success variant は `result.startedAt` で取れるが、それ以外は "fan-out 前 or produceResult 内の startedAt" として実装者判断に委ねられている。 | fan-out ループ内で `const memberStartedAt = new Date().toISOString()` を `produceResult` 呼び出し前に取り、tuple の `startedAt` に使う実装が最もシンプル。PRレビューで一貫性を確認する。 |

## Rationale

### コード照合

- **`parallel-review-round.ts:208-216`** — `this.executor.execute(memberStep, state, roundDeps)` の呼び出しを確認。`execute` が `CommitOrchestrator.begin`（`store.update` + `appendHistory` = persist）→ `produce` → `CommitOrchestrator.apply`（`store.persist`）を各 member ごとに発火しており、crash 時に member 単位の部分 projection が on-disk に残る問題が実在する。
- **`parallel-review-round.ts:327-329`** — `const store = deps.storeFactory(state.jobId); await store.persist(state);` の直接呼び出しを確認。D4 の削除対象。
- **`commit-orchestrator.ts`** — `CommitOrchestrator` は逐次 `begin` / `commitSuccess` / `commitSkipped` / `commitHalt` / `apply` が実装済み。コメントに "Parallel round commits (R6) will reuse this orchestrator in a future request." と明記されており、本 request はその想定後続。
- **`executor.ts:143`** — `private async produce(...)` が既に `StepExecutionResult` を返すことを確認。T-02 の `produceResult` は `produce` の public wrapper で実現できる。
- **`StepExecutionResult`** 型は `commit-orchestrator.ts` で export 済み。T-01 の `verdictOfResult` は `result.completion.verdict ?? "escalation"` / `"skipped"` / `"escalation"` の純粋関数で実装可能。
- **`mergeParallelReviewerStates`**（`parallel-review-round.ts:48-81`）— 削除対象。呼び出し元は `parallel-review-round.ts` 内の 1 箇所のみ（L250）。他に参照なし（grep 確認）。

### 仕様整合性

**request.md ↔ spec.md**:
- 要件 1（member no-persist）→ Requirement: member 実行経路は state を persist しない ✓
- 要件 2（coordinator 単一 commit）→ Requirement: coordinator は round 完了後に一度だけ CommitOrchestrator 経由で commit する ✓
- 要件 3（部分 projection 非発生）→ Requirement: crash 相当で on-disk state は member 部分 projection にならない ✓
- 要件 4（結果不変）→ Requirement: round の verdict 集約・reviewer status の結果を不変に保つ ✓

**design.md ↔ tasks.md**:
- D1 → T-02（`produceResult` 追加）✓
- D2 → T-03（`commitRound` 追加）✓
- D3 → T-04（`ParallelReviewRound` rewire、`mergeParallelReviewerStates` 削除）✓
- D4 → T-04（coordinator 内で `new CommitOrchestrator(deps.storeFactory, this.events)` 構築）✓

**受け入れ基準 ↔ T-05 テスト計画**:
- AC #1（member persist なし）→ executor level: fake store spy で `produceResult` が store mutation を呼ばない ✓
- AC #2（coordinator 単一 commit）→ orchestrator level / coordinator level: `store.persist` ちょうど 1 回 ✓
- AC #3（部分 projection 非発生）→ coordinator level: persist 引数 capture で全 member 反映済みを assert ✓
- AC #4（verdict / status 不変）→ coordinator level: `{approved, needs-fix}` → aggregate `needs-fix` ✓
- AC #5（typecheck && test green）→ T-06 ✓

### 設計リスク評価

- **[OK] member halt での job 誤 fail リスク**: D2 / T-03 が `commitRound` の halt 畳み込みで `store.fail` / `transitionJob` を明示的に除外。aggregate escalation が pipeline の escalate 終端を経由するという既存 handled path を温存。
- **[OK] R5 git 副作用の順序**: `commitRound` の前に R5 ブロックを置く（T-04 で明示）。`partitionRoundChanges` が pipeline 管理 path を除外するため、member の persist 有無によらず判定対象が変わらない。
- **[OK] 逐次経路不変**: `CommitOrchestrator` の逐次メソッドを非改変とする制約が design / tasks の両方で繰り返し強調されており、既存 `commit-orchestrator.test.ts` が回帰リスクの安全網になっている。
- **[OK] 既存テスト更新**: `parallel-review-round-git-effects.test.ts` / `parallel-review-round-resume.test.ts` の fake executor が `execute`（`JobState` 返却）を提供している。T-05 で `produceResult`（`StepExecutionResult` 返却）契約へ更新することが明示されており、抜け漏れなし。

### セキュリティ

外部入力・認証・ネットワークアクセスを持たない内部 state 管理の変更。OWASP Top 10 の適用範囲外。injection ベクタなし。
