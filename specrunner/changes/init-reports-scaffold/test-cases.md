# Test Cases: init が実行結果を報告する

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 12
- **Manual**: 1
- **Priority**: must: 6, should: 6, could: 1

---

### TC-001: 非 git ディレクトリで非ゼロ exit かつ FS に何も作られない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init SHALL stop with a non-zero exit outside a git repository > Scenario: non-git directory stops with non-zero exit and writes nothing

---

### TC-002: git ゲートを無効化すると T1 テストが exit 0 で落ちる（破壊確認）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: init SHALL stop with a non-zero exit outside a git repository > Scenario: reverting the fix regresses the non-git guard

---

### TC-003: git バイナリが利用不能な場合にエラーで停止し FS に何も作られない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init SHALL stop with a non-zero exit outside a git repository > Scenario: unavailable git binary is reported as an error

---

### TC-004: 未初期化 git repo で init を実行すると 4 項目すべて created と報告される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init SHALL report each artifact as created or already-exists to stdout > Scenario: fresh git repository reports every artifact created

---

### TC-005: 初期化済み repo での再実行が 4 項目すべて already exists を報告し FS を変更しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init SHALL be idempotent and report already-exists on a fully initialized repository > Scenario: second run reports all already-exists with no filesystem change

---

### TC-006: config 既存かつ scaffold 欠損の状態から実行すると欠損分が created として報告される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init SHALL complete and report a half-initialized repository > Scenario: config exists but scaffold missing is completed and reported

---

### TC-007: README Quick Start が git repo 前提を含んでいる

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: README Quick Start SHALL state the git-repository precondition > Scenario: Quick Start includes the git-repository precondition

---

### TC-008: ensureDotSpecrunnerGitignore が .gitignore を変更しない場合 false を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: `ensureDotSpecrunnerGitignore` が変更有無を返すようにする

**GIVEN** specrunner エントリおよび `node_modules/` が既に揃った `.gitignore` が存在する
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ
**THEN** 戻り値が `false` である
**AND** `.gitignore` の内容が変化しない

---

### TC-009: ensureDotSpecrunnerGitignore が .gitignore を書き換えた場合 true を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: `ensureDotSpecrunnerGitignore` が変更有無を返すようにする

**GIVEN** specrunner エントリが存在しない `.gitignore`（または `.gitignore` 自体が存在しない）
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ
**THEN** 戻り値が `true` である
**AND** `.gitignore` に specrunner エントリが追記されている

---

### TC-010: 環境エラーは exit code 1、引数エラーは exit code 2 を返す

**Category**: integration
**Priority**: should
**Source**: design.md > D4: 環境エラーの exit code は 1、引数エラーは既存の 2 を維持する

**GIVEN** 非 git ディレクトリで `runInit({})` を呼ぶ場合（環境エラー）
**WHEN** `runInit({})` を実行する
**THEN** 戻り値が `1` である

**GIVEN** `--runtime managed` など非推奨フラグを指定して `runInit` を呼ぶ場合（引数エラー）
**WHEN** `runInit` を実行する
**THEN** 戻り値が `2` である

---

### TC-011: repo-required エラーの処方が git init または既存 repo への移動を案内する

**Category**: integration
**Priority**: should
**Source**: design.md > D5: 処方文（prescription）の内容

**GIVEN** 非 git ディレクトリで `runInit({})` を呼ぶ
**WHEN** `runInit({})` が終了する
**THEN** stderr に `git init` への言及または既存 repo への移動を案内する文言が含まれる
**AND** 自動で `git init` を実行したことを示す文言は含まれない

---

### TC-012: 成功した init 実行後に login 案内が stderr に出力される

**Category**: integration
**Priority**: could
**Source**: tasks.md > T-02: `runInit` に git repo ゲートと項目別報告を実装する

**GIVEN** 未初期化の git repo で `runInit({})` を呼ぶ
**WHEN** 4 項目が作成されて exit 0 で終了する
**THEN** stderr に login を促す案内メッセージが出力される

---

### TC-013: 旧メッセージ（Config saved. / Config already exists. Skipping ...）がコードに存在しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: `runInit` に git repo ゲートと項目別報告を実装する

**GIVEN** `src/cli/init.ts` のソースコード
**WHEN** `"Config saved."` および `"Config already exists. Skipping global config generation."` の文字列を検索する
**THEN** いずれの文字列もソースコード内に存在しない

---

## Result

```yaml
result: completed
total: 13
automated: 12
manual: 1
must: 6
should: 6
could: 1
blocked_reasons: []
```
