## ADDED Requirements

### Requirement: multi-layer-defense integration test suite

多層防衛 (delta-spec-validation / spec-review / design completion checklist) の 3 層が連携して動作することを保証する integration test を追加する。

- `tests/multi-layer-defense.test.ts` を新規作成する
- mock agent 応答 + 実物の pipeline state machine / step orchestrator / fixer 遷移で構成する（実 LLM 呼び出しなし）
- 既存 `tests/pipeline-integration.test.ts` の `TC-DSV-INT-*` と同型の構造とする

### Requirement: 正常系 state 遷移の assert

- type=spec-change で design が `specs/` を作成した場合、`dsv approved → spec-review approved` の state 遷移を辿ることを assert する

### Requirement: Sub-B catch シナリオの assert（spec-review 層が防衛）

- design が `specs/` 構造を作るが delta spec の中身が不十分なケースを mock agent 応答で構築する
- pipeline が `dsv approved → spec-review needs-fix → spec-fixer → 再 dsv approved → 再 spec-review approved` の state 遷移を辿ることを assert する
- `spec-fixer` を経由すること（`delta-spec-fixer` ではない）を assert する

### Requirement: Sub-A catch シナリオの assert（dsv 層が防衛）

- design が `specs/` を作らなかったケースを mock agent 応答で構築する
- pipeline が `dsv needs-fix → delta-spec-fixer → 再 dsv approved` の state 遷移を辿ることを assert する

### Requirement: 2 層同時 failure シナリオ 5-a の assert（dsv 残存）

- design + spec-review が共に bug（両層が specs/ 不在を見逃す）のケースを mock で構築する
- 残る dsv が catch し、`dsv needs-fix → delta-spec-fixer → 再 dsv approved` で修復まで完走することを assert する

### Requirement: 2 層同時 failure シナリオ 5-b の assert（spec-review 残存）

- design + dsv が共に bug（design 段の checklist 漏れ + dsv 段の rule 無視）のケースを mock で構築する
- 残る spec-review が catch し、`dsv approved → spec-review needs-fix → spec-fixer → 再 dsv approved → 再 spec-review approved` で修復まで完走することを assert する

### Requirement: typecheck + test green

- `bun run typecheck && bun run test` が green であること
