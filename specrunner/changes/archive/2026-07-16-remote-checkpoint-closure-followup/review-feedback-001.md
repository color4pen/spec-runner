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
| 1 | low | testing | tests/core/pipeline/pipeline.guard-halt.test.ts | TC-004（getStepOutcome fail-safe）の独立テスト欠落。`getStepOutcome` が `state.status==="awaiting-resume"` のとき `"awaiting-resume"` を返す fail-safe パスを直接アサートするテストがない。D1 guard が先に break するため routing 上の問題はないが、将来 D1 guard が refactor されたとき fail-safe が機能することを確認できない。 | `getStepOutcome` を `any` cast などで呼び出し、awaiting-resume state を渡したとき `"awaiting-resume"` が返ることを assert する最小ユニットテストを追加する。または D1 guard をモックで無効化して verify する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.8

## Summary

4 つの correctness hole（guard-halt 終端、branch cleanup race、主役 E2E、reads() fail-closed）すべてが設計通りに実装されている。7044 テスト全 pass、typecheck clean。

**D1（pipeline.ts）**: `firstUnitExecuted = true` 直後・transition lookup 前という sequential/coordinator 両経路の唯一収束点にステートベースの終端ガードを配置。escalate terminal への相乗り回避（二重 `transitionJob` による resumePoint 上書き防止）の判断が設計文書・コードコメントに正確に記述されており、`getStepOutcome` 硬化と役割が明確に分離されている。

**D2（manager.ts / workspace-materializer.ts）**: `branchWasPreExisting` → `preserveBranchOnFailure` のリネームで所有意味を正確に表現。attach arm の事前 rev-parse を削除し `preserveBranchOnFailure: true` を無条件で渡す。positional 引数の値・既定値・挙動は不変なので既存テストは無変更で green。TC-WTM-027 がレース条件を実際にモデル化している。

**D3（E2E テスト）**: real git（bare + 2 clone）+ 実 StepExecutor + fake runner の組み合わせで、guard-halt → publisher seam → origin push → Machine B attach → 実 Pipeline.run() 起動の全因果チェーンを runner 呼び出し回数で決定的にアサートしており flaky でない。

**D4（verify-checkpoint.ts）**: `catch { /* skip */ }` を `throw checkpointNotAttachableError("resume-reads-unevaluable", ...)` に変更。`vi.mock` でディスクリプタを差し替える TC-VC-014 が fail-closed を正確にアサートしている。

非ブロッキング観察（finding #1）: `getStepOutcome` fail-safe の独立テストがない。設計が「secondary/defensive layer」と明記しておりブロック条件には当たらない。
