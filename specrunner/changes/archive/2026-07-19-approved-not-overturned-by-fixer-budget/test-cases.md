# Test Cases: reviewer の approved を fixer 予算切れで覆さない

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 15
- **Manual**: 0
- **Priority**: must: 12, should: 3, could: 0

---

### TC-001: standard 経路で承認が予算切れでも進む

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 承認は paired fixer の予算切れで覆らない > Scenario: standard 経路で承認が予算切れでも進む

> [!NOTE]
> 破壊確認: T-03 の再 routing ロジックをコメントアウトすると、本テストが `CODE_REVIEW_RETRIES_EXHAUSTED` で escalation して落ちることをテストコード内のコメントで明記すること（tasks.md > T-05 の要件）。

---

### TC-002: custom/parallel 経路で承認が予算切れでも進む

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 承認は paired fixer の予算切れで覆らない > Scenario: custom/parallel 経路で承認が予算切れでも進む

> [!NOTE]
> TC-001 とは独立に置き、`buildParallelReviewerTransitions` 経路を独立に検証すること。TC-001 の green を本経路の証拠として流用しない。

---

### TC-003: 省略後も reviewer の findings が残る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 省略された fixable findings を保持する > Scenario: 省略後も reviewer の findings が残る

---

### TC-004: 省略が history / event に記録される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 任意修正の省略を明示して次工程へ進む > Scenario: 省略が history / event に記録される

---

### TC-005: needs-fix 予算切れの escalation は不変

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: needs-fix の予算切れは従来どおり停止する > Scenario: needs-fix 予算切れの escalation は不変

---

### TC-006: 承認時に "did not approve" を出さない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 停止メッセージは verdict と矛盾しない > Scenario: 承認時に "did not approve" を出さない

---

### TC-007: lastReviewerFixableCount が fixable findings の件数を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** state に `code-review` の直近 StepRun が存在し、`outcome.toolResult.findings` に `resolution === "fixable"` のエントリが 2 件含まれる
**WHEN** `lastReviewerFixableCount(state, "code-review")` を呼ぶ
**THEN** 2 を返す

> [!NOTE]
> `code-review`・custom reviewer・`regression-gate` いずれの step 名でも直近 run の findings から fixable 件数を正しく返すことを各 step で確認する。

---

### TC-008: lastReviewerFixableCount が run なし / findings なしで 0 を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** state に対象 reviewer の run が存在しない、または `toolResult` が空
**WHEN** `lastReviewerFixableCount(state, "unknown-reviewer")` を呼ぶ
**THEN** 0 を返す

---

### TC-009: DomainEvent union と EventPayloadMap に pipeline:fixer:budget-skipped が存在し typecheck が通る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `src/kernel/event-types.ts` の `DomainEvent` union と `src/core/event/types.ts` の `EventPayloadMap` に `"pipeline:fixer:budget-skipped"` キーと対応 payload `{ step: string; fixer: string; omittedFixableFindings: number; maxIterations: number }` が追加されている
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーなしで通る（既存の `Payload<>` 参照が壊れない）

---

### TC-010: PipelineLogger が pipeline:fixer:budget-skipped を JSONL に書く

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `PipelineLogger.subscribe` 済みの EventBus が構築されている
**WHEN** `pipeline:fixer:budget-skipped` を `{ step: "code-review", fixer: "code-fixer", omittedFixableFindings: 1, maxIterations: 2 }` で emit する
**THEN** JSONL に `type` / `step` / `fixer` / `omittedFixableFindings` / `maxIterations` を含む 1 行が追加され、既存 event の JSONL 出力は無変更である

---

### TC-011: fixer budget に余裕がある場合は従来どおり fixer を実行する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03, design.md > D2

**GIVEN** `code-review` が `approved` かつ fixable finding を 1 件持ち、`code-fixer` の現在 iteration が `maxIterations` 未満（budget に余裕あり）
**WHEN** pipeline が transition を解決する
**THEN** 再 routing は発火せず、従来どおり `code-fixer` が次ステップとして設定され実行される（通常時の任意修正パスが失われない）

---

### TC-012: clean 遷移先が得られない場合は fail-safe で従来 exhaustion に委ねる

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-03, design.md > D2

**GIVEN** `approved` + fixer 予算切れの条件で、遷移表から `currentStep` の clean approved 遷移先（`to` が fixer でない approved 行）が見つからない（防御的想定外ケース）
**WHEN** pipeline が再 routing を試みる
**THEN** `nextStep` を差し替えず、後続の fixer 突入前 exhaustion 検査（pipeline.ts:493-499）に委ねる（従来どおり escalation）

---

### TC-013: 非発火時に省略 history エントリと budget-skipped event を出力しない

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** 次のいずれか: (a) approved + fixable あり、fixer budget に余裕がある（条件3 偽）、または (b) verdict が `needs-fix` のまま fixer budget を使い切った（条件1 偽）
**WHEN** pipeline が routing を実行する
**THEN** `pipeline:fixer:budget-skipped` event も `status: "warning"` の省略 history エントリも生成されない

---

### TC-014: 再 routing 無効化で TC-001 が escalation で落ちる（破壊確認）

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** T-03 で追加した再 routing ロジックをコメントアウト（無効化）した状態で、standard 経路・`code-review` が approved + fixable 1 件・`code-fixer` が budget 使い切り済み
**WHEN** pipeline を実行する
**THEN** `CODE_REVIEW_RETRIES_EXHAUSTED` で escalation し、TC-001 が落ちる

> [!NOTE]
> テストコード内のコメントとして「T-03 の再 routing を無効化した場合の再現手順」を明記すること（tasks.md > T-05 の受け入れ基準）。

---

### TC-015: 既存テスト群が無変更で green かつ typecheck && test が通る

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** transition table の `approved→code-fixer` 行・verdict 導出規則（`deriveJudgeVerdict`）・`LOOP_ERROR_CODES` 文言・`needs-fix` 予算切れ挙動のいずれも変更されていない
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 既存の pipeline / exhaustion / reviewer-chain / custom-reviewers 系テストが green であり（approved-exhaustion 系の期待更新が必要な場合のみ例外として更新理由コメント付き）、typecheck が型エラーなしで通る

---

## Result

```yaml
result: completed
total: 15
automated: 15
manual: 0
must: 12
should: 3
could: 0
blocked_reasons: []
```
