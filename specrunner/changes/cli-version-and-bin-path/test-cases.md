# Test Cases: 公開 CLI の体裁 — `--version` と bin パス正規化

## Summary

- **Total**: 9 cases
- **Automated** (unit/integration): 8
- **Manual**: 1
- **Priority**: must: 5, should: 3, could: 1

---

### TC-001: --version で version を出力し exit 0

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `specrunner --version` は package version を報告する > Scenario: --version で version を出力し exit 0

---

### TC-002: ソース実行とバンドル実行の両方で version が解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `specrunner --version` は package version を報告する > Scenario: ソース実行とバンドル実行の両方で version が解決される

---

### TC-003: 未知 command は exit 2

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 未知 command の挙動が保たれる > Scenario: 未知 command は exit 2

---

### TC-004: bin 値が正規化されている

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: package.json の bin パスは `./` prefix を持たない > Scenario: bin 値が正規化されている

---

### TC-005: package.json が見つからない場合に throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** version resolver の開始ディレクトリとして、先祖に package.json が存在しない temp ディレクトリを与える
**WHEN** resolver を呼ぶ
**THEN** 明確なエラーを throw する（正常 return しない）

---

### TC-006: version フィールドが string でない場合に throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** 最寄り先祖の package.json に `version` フィールドが存在しない（または string でない値を持つ）temp ディレクトリを開始点として与える
**WHEN** resolver を呼ぶ
**THEN** 明確なエラーを throw する

---

### TC-007: exports["."] が変更されていない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D3

**GIVEN** 公開される package.json
**WHEN** `exports["."]` エントリを読む
**THEN** その値はちょうど `"./dist/specrunner.js"` であり、`./` prefix が保たれている

---

### TC-008: version resolver が node 標準 API のみを使う

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `src/cli/version.ts` の import 文一覧
**WHEN** import しているモジュールを確認する
**THEN** `fs`・`path`・`url` 等 node 組み込みのみで、外部 npm パッケージへの依存がない

---

### TC-009: subcommand 後の `--version` は top-level intercept の対象外

**Category**: integration
**Priority**: could
**Source**: design.md > D1 (Non-Goals)

**GIVEN** specrunner が `<subcommand> --version` の形式（args[0] が既知の subcommand）で起動される
**WHEN** main() が引数を処理する
**THEN** top-level `--version` intercept は発火せず、通常の command dispatch が行われる（exit 2 にはならない）

---

## Result

```yaml
result: completed
total: 9
automated: 8
manual: 1
must: 5
should: 3
could: 1
blocked_reasons: []
```
