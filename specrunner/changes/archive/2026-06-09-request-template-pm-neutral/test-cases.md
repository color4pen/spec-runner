# Test Cases: request template と prompt から bun / tests/ のハードコードを除去

## Summary

- **Total**: 9 cases
- **Automated** (unit/integration): 6
- **Manual**: 3
- **Priority**: must: 8, should: 1, could: 0

---

### TC-001: template 出力に bun が含まれない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: request template の受け入れ基準は package manager 非依存とする > Scenario: template 出力に bun が含まれない

---

### TC-002: build-fixer prompt に tests/ 固定パスが含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: build-fixer prompt は test 配置をプロジェクト既存パターンに委ねる > Scenario: build-fixer prompt に tests/ 固定パスが含まれない

---

### TC-003: buildScaffoldTemplate 関数出力に bun を含まない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: request template の受け入れ基準を PM 非依存にする

**GIVEN** `buildScaffoldTemplate()` または `executeTemplate()` を任意の `--type` で呼び出す
**WHEN** 関数が scaffold 文字列を返す
**THEN** 返却値の文字列全体に `bun` という部分文字列が含まれない

---

### TC-004: request.test.ts の acceptance criteria assertion が新 wording で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: request template の受け入れ基準を PM 非依存にする

**GIVEN** `tests/unit/core/command/request.test.ts` の受け入れ基準アサーションが新 wording に更新されている
**WHEN** `bun run test` でテストスイートを実行する
**THEN** `request.test.ts` の全テストが pass する（`bun run typecheck && bun run test` を期待していた旧アサーションがない）

---

### TC-005: build-fixer-system.test.ts が green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: build-fixer prompt の test 配置を implementer（#569）方針に揃える

**GIVEN** `BUILD_FIXER_SYSTEM_PROMPT` が固定パス `tests/` を含まない wording に更新されている
**WHEN** `bun run test` で `tests/prompts/build-fixer-system.test.ts` を実行する
**THEN** TC-024 を含む全テストが pass する

---

### TC-006: phases.ts に bun run が含まれない

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03: phases.ts / runner.ts の stale JSDoc を PM 検出ベースに更新する

**GIVEN** `src/core/verification/phases.ts` の JSDoc が PM 検出ベースの記述に更新されている
**WHEN** `grep -n "bun run" src/core/verification/phases.ts` を実行する
**THEN** マッチが 0 件である

---

### TC-007: runner.ts に bun run が含まれない

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03: phases.ts / runner.ts の stale JSDoc を PM 検出ベースに更新する

**GIVEN** `src/core/verification/runner.ts` の JSDoc が PM 検出ベースの記述に更新されている
**WHEN** `grep -n "bun run" src/core/verification/runner.ts` を実行する
**THEN** マッチが 0 件である

---

### TC-008: runner.ts / phases.ts の diff が JSDoc のみ

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-03: phases.ts / runner.ts の stale JSDoc を PM 検出ベースに更新する

**GIVEN** T-03 の変更が適用されたブランチ
**WHEN** `phases.ts` / `runner.ts` の diff を確認する
**THEN** 変更行がすべてコメント（`//` または `/** ... */`）行のみであり、実行ロジックの変更が含まれない

---

### TC-009: typecheck / test / lint が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04: 全体検証

**GIVEN** T-01 〜 T-03 の変更がすべて適用されている
**WHEN** `bun run typecheck && bun run test && bun run lint` を実行する
**THEN** すべてのコマンドが exit code 0 で終了する

---

## Result

```yaml
result: completed
total: 9
automated: 6
manual: 3
must: 8
should: 1
could: 0
blocked_reasons: []
```
