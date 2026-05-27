# Test Cases: README 整備 + specrunner init の npx 対応改善

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 8
- **Manual**: 4
- **Priority**: must: 9, should: 3, could: 0

---

## T-01: specrunner init — プロジェクトディレクトリ作成

### TC-001: git repo 内での init — ディレクトリが作成される

**Category**: unit
**Priority**: must
**Source**: T-01 AC, request 受け入れ基準

**GIVEN** git init 済みの空ディレクトリに cwd を設定している  
**WHEN** runInit() を実行する  
**THEN** specrunner/drafts/ が cwd 直下に存在すること  
AND specrunner/changes/ が cwd 直下に存在すること

---

### TC-002: git repo 外での init — specrunner/ ディレクトリが作られない

**Category**: unit
**Priority**: must
**Source**: T-01 AC「git repo 外では specrunner/ ディレクトリは作成されない」

**GIVEN** git init されていない空ディレクトリに cwd を設定している  
**WHEN** runInit() を実行する  
**THEN** specrunner/ ディレクトリが存在しないこと  
AND エラーなく正常終了すること

---

### TC-003: 冪等性 — 既存ディレクトリがある場合はエラーにならない

**Category**: unit
**Priority**: must
**Source**: T-01 AC「既存のディレクトリがある場合はエラーにならない」, T-02 冪等性テスト

**GIVEN** git init 済みディレクトリに cwd を設定し、runInit() を 1 回実行済みである  
**WHEN** 同じ cwd で runInit() を再度実行する  
**THEN** エラーなく正常終了すること  
AND specrunner/drafts/ と specrunner/changes/ が引き続き存在すること

---

### TC-004: 既存ディレクトリにファイルがある場合は上書きしない

**Category**: unit
**Priority**: should
**Source**: D2「冪等」、`recursive: true` の仕様

**GIVEN** git init 済みディレクトリに specrunner/drafts/existing-file.txt が存在する  
**WHEN** runInit() を実行する  
**THEN** existing-file.txt が失われないこと  
AND エラーなく正常終了すること

---

### TC-005: init 後にディレクトリ作成のログが出ない（サイレント）

**Category**: unit
**Priority**: should
**Source**: T-01「ディレクトリ作成後にログ出力は不要（サイレント）」

**GIVEN** git init 済みディレクトリに cwd を設定している  
**WHEN** runInit() を実行する  
**THEN** stdout / stderr に specrunner/drafts/ や specrunner/changes/ への言及がないこと  
AND init 全体の成功メッセージのみが出力されること

---

## T-02: init テスト — テストスイートの整合

### TC-006: 既存テストが引き続き pass する

**Category**: unit
**Priority**: must
**Source**: T-01 AC「既存テスト (tests/init.test.ts) が引き続き pass する」

**GIVEN** 変更前の tests/init.test.ts に定義された既存テストケース群がある  
**WHEN** bun run test を実行する  
**THEN** init.test.ts 内のすべての既存テストが pass すること

---

### TC-007: 新規テスト — git repo 内 init 後のディレクトリ検証

**Category**: unit
**Priority**: must
**Source**: T-02 AC「git repo 内での init 後にプロジェクトディレクトリが存在することを検証するテストがある」

**GIVEN** tests/init.test.ts に git repo 内 init のテストが追加されている  
**WHEN** bun run test を実行する  
**THEN** 追加テストが pass すること  
AND specrunner/drafts/ と specrunner/changes/ の存在を検証していること

---

### TC-008: 新規テスト — 冪等性の検証

**Category**: unit
**Priority**: must
**Source**: T-02「冪等性テスト: 2 回 runInit しても正常に完了すること」

**GIVEN** tests/init.test.ts に冪等性テストが追加されている  
**WHEN** bun run test を実行する  
**THEN** 2 回連続実行のテストが pass すること

---

## T-03: README.md — コンテンツ整合性

### TC-009: Installation セクションが .npmrc 設定手順と npm install を含み Quick Start より前にある

**Category**: manual
**Priority**: must
**Source**: T-03 AC「README に Installation セクション（.npmrc 設定 + npm install）がある」, D1

**GIVEN** README.md が更新されている  
**WHEN** セクション構成と Installation セクションの内容を確認する  
**THEN** `@color4pen:registry=https://npm.pkg.github.com` を .npmrc に設定する手順が記載されていること  
AND `npm install @color4pen/specrunner` のコマンド例があること  
AND Installation セクションが Quick Start セクションより先に出現すること

---

### TC-010: Quick Start の手順順序と alias が正しい

**Category**: manual
**Priority**: must
**Source**: T-03 AC「Quick Start の手順が install → init → login → request new → run → job finish の順序」, D3

**GIVEN** README.md の Quick Start セクションを参照する  
**WHEN** 手順を上から順に確認する  
**THEN** 次の順序で手順が記載されていること: (1) npx specrunner init, (2) npx specrunner login, (3) npx specrunner request new, (4) request.md 編集, (5) npx specrunner run, (6) npx specrunner job finish  
AND pipeline 開始ステップに `specrunner run` alias が使われており `specrunner job start` は Quick Start に出現しないこと

---

### TC-011: コマンド名が command-registry.ts の定義と一致する

**Category**: manual
**Priority**: must
**Source**: T-03 AC「コマンド名が src/cli/command-registry.ts の定義と一致している」

**GIVEN** README.md に記載されているすべての specrunner サブコマンドのリスト  
**WHEN** src/cli/command-registry.ts の USAGE / コマンド定義と照合する  
**THEN** README に登場するコマンド名・フラグが command-registry.ts の定義と一致すること  
AND 存在しないコマンド名が README に記載されていないこと

---

### TC-012: SPECRUNNER_API_KEY の説明が managed/local runtime の違いとともに記載されている

**Category**: manual
**Priority**: should
**Source**: T-03 AC「SPECRUNNER_API_KEY の説明がある」, D4

**GIVEN** README.md が更新されている  
**WHEN** 環境変数セクションを参照する  
**THEN** SPECRUNNER_API_KEY が記載されていること  
AND managed runtime で必須、local runtime では不要であることが明記されていること  
AND SPECRUNNER_DEBUG が環境変数セクションに重複して出現しないこと

---

## T-04: ビルド品質

### TC-013: typecheck と test が両方 green

**Category**: integration
**Priority**: must
**Source**: T-04 AC, request 受け入れ基準

**GIVEN** 本 change のすべての実装変更が適用されている  
**WHEN** bun run typecheck && bun run test を実行する  
**THEN** 両コマンドの exit code が 0 であること  
AND 型エラー・テスト失敗が 0 件であること

---

## Result

```yaml
result: completed
total: 12
automated: 8
manual: 4
must: 9
should: 3
could: 0
blocked_reasons: []
```
