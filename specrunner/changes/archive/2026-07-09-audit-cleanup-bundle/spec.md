# Spec: audit-cleanup-bundle

## Requirements

### Requirement: coverage gate の coverage command は verification.commands と同じ実行環境で実行される

coverage gate 内の `spawnCommand` 呼び出しには、`runner.ts` で `detectPackageManager` が返す `root` を第 4 引数として渡さなければならない（MUST）。これにより `<root>/node_modules/.bin` が PATH に前置され、monorepo で coverage コマンドが解決できる。

#### Scenario: root が cwd と異なる monorepo で coverage command が実行できる

**Given** `coverage.command` が `"vitest run --coverage"` で設定されており、
         `detectPackageManager` の `root` が `/workspace`、`cwd` が `/workspace/packages/app` である
**When** `runChangedLineCoverageGate` が coverage command を spawn する
**Then** spawn の環境変数 PATH に `/workspace/node_modules/.bin` が含まれる

---

### Requirement: minChangedLineCoverage 未達と全行未実行は reason とメッセージで区別される

`minChangedLineCoverage` が設定されており ratio が閾値を下回る場合、`FailReason` は `"below-threshold"` でなければならず（MUST）、失敗メッセージには実行率（%）と閾値（%）が含まれなければならない（MUST）。全行未実行のケースは引き続き `"unexecuted"` を使う。

#### Scenario: 1/3 実行で閾値 0.8 → below-threshold

**Given** `src/foo.ts` の変更 DA 行が 3 行で 1 行のみ実行済み（ratio = 0.33）
         `minChangedLineCoverage` = 0.8
**When** `evaluateChangedLineCoverage` を呼ぶ
**Then** `failedFiles[0].reason` === `"below-threshold"`
         `stdout` に実行率（33%）と閾値（80%）が含まれる

#### Scenario: 0/2 実行で threshold 未設定 → unexecuted（既存挙動維持）

**Given** `src/bar.ts` の変更 DA 行が 2 行、両方実行ゼロ、`minChangedLineCoverage` 未設定
**When** `evaluateChangedLineCoverage` を呼ぶ
**Then** `failedFiles[0].reason` === `"unexecuted"`
         `stdout` に `"changed DA lines were not executed"` が含まれる

---

### Requirement: ADR の minChangedLineCoverage 例 config は schema の制約（gt(0), lte(1)）に適合する

`specrunner/adr/2026-07-08-lcov-changed-line-gate.md` の D2 例 config の `minChangedLineCoverage` 値は 0 より大きく 1 以下でなければならない（MUST）。D10 の説明文も同じ制約を明示しなければならない（MUST）。

#### Scenario: ADR の例 config をそのままコピーしても validation が通る

**Given** D2 セクションの例 config を `.specrunner/config.json` にそのまま貼り付ける
**When** `specrunner` が config を validate する
**Then** `minChangedLineCoverage` に関する validation エラーが出ない

---

### Requirement: doctor の config loadError hint は実際に失敗したファイルを案内する

`ctx.config.loadError` が設定されている場合、hint は `ctx.config.loadErrorPath`（失敗したファイルのパス）を使わなければならない（MUST）。`loadErrorPath` が未設定の場合は従来の user-global パスを使うことで後方互換を保つ（MUST）。

#### Scenario: project-local config が malformed → hint が project-local パスを案内する

**Given** `ctx.config.loadError` に project-local config のパースエラーが設定されており
         `ctx.config.loadErrorPath` が `/repo/.specrunner/config.json` に設定されている
**When** `configFileExistsCheck.check(ctx)` を呼ぶ
**Then** `result.hint` に `/repo/.specrunner/config.json` が含まれる
         `result.hint` に user-global パスが含まれない

#### Scenario: user-global config が malformed → hint が user-global パスを案内する（既存挙動維持）

**Given** `ctx.config.loadError` が設定され、`ctx.config.loadErrorPath` が未設定（`undefined`）
**When** `configFileExistsCheck.check(ctx)` を呼ぶ
**Then** `result.hint` に user-global パス（`~/.config/specrunner/config.json` 相当）が含まれる

---

### Requirement: TC-032 と T-PMI-01 は実装の観測可能な挙動を assert するか、削除されて理由が記録されている

TC-032: ESM intra-module mock の制限により実装挙動を検証できないため削除し、理由をコメントで記録しなければならない（MUST）。
T-PMI-01 の `expect(FAKE_ESCALATION).toContain("MERGED")` という同語反復 assertion は削除しなければならない（MUST）。残る assertion が実装出力（`result.escalation`）を検証することを確認する。

#### Scenario: T-PMI-01 が実装出力を検証する

**Given** `runPostMergeIntegrityCheck` が `{ ok: false, escalation: FAKE_ESCALATION }` を返す
**When** `runMergeThenArchive` を呼ぶ
**Then** `result.exitCode` === 1
         `result.escalation` === FAKE_ESCALATION（実装出力の検証）
         テスト内定数 `FAKE_ESCALATION` に対する直接 assert が存在しない
