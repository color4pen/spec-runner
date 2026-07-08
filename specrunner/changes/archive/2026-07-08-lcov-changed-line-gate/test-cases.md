# Test Cases: verification 変更行実行検証（lcov changed-line gate）

## Summary

- **Total**: 33 cases
- **Automated** (unit/integration): 33
- **Manual**: 0
- **Priority**: must: 25, should: 8, could: 0

---

## Config Validation（T-01）

### TC-001: well-formed な coverage config が validation を通る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification.coverage config を宣言できる > Scenario: well-formed な coverage config が validation を通る

### TC-002: include 欠落は validation エラー

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification.coverage config を宣言できる > Scenario: include 欠落は validation エラー

### TC-003: include が空配列は validation エラー

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification.coverage config を宣言できる > Scenario: include が空配列は validation エラー

### TC-004: lcovPath 欠落は validation エラー

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `verification.coverage` に `command` と `include` はあるが `lcovPath` が無い config
**WHEN** config を validate する
**THEN** validation エラーになる

---

## lcov パーサ（T-02）

### TC-005: SF/DA を含む lcov テキストから file→line→count の Map を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `SF:src/foo.ts\nDA:10,3\nDA:11,0\nend_of_record` の lcov テキスト
**WHEN** `parseLcov` を呼ぶ
**THEN** `Map { "src/foo.ts" → Map { 10 → 3, 11 → 0 } }` を返す

### TC-006: SF が絶対パス（cwd 配下）→ repo-root 相対キーに正規化

**Category**: unit
**Priority**: must
**Source**: design.md > D7: lcov は SF:/DA: のみの自前最小パーサ。SF パスは repo-root 相対に正規化

**GIVEN** cwd が `/workspace/repo`、lcov の SF が `SF:/workspace/repo/src/foo.ts`
**WHEN** `parseLcov` を cwd 付きで呼ぶ
**THEN** 返り Map のキーが `src/foo.ts`（cwd プレフィクスを除去した repo-root 相対パス）である

### TC-007: SF が `./` 付きパス → 先頭 `./` 除去で正規化

**Category**: unit
**Priority**: must
**Source**: design.md > D7: lcov は SF:/DA: のみの自前最小パーサ。SF パスは repo-root 相対に正規化

**GIVEN** lcov の SF が `SF:./src/foo.ts`
**WHEN** `parseLcov` を呼ぶ
**THEN** 返り Map のキーが `src/foo.ts`（`./` を除去した相対パス）である

### TC-008: SF が相対パスのまま → キーは変換なし

**Category**: unit
**Priority**: should
**Source**: design.md > D7: lcov は SF:/DA: のみの自前最小パーサ。SF パスは repo-root 相対に正規化

**GIVEN** lcov の SF が `SF:src/foo.ts`（`./` 無し相対パス）
**WHEN** `parseLcov` を呼ぶ
**THEN** 返り Map のキーが `src/foo.ts` である

### TC-009: 空文字列または SF 不在の lcov → 空 Map

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** 空文字列または `SF:` レコードを含まない lcov テキスト
**WHEN** `parseLcov` を呼ぶ
**THEN** 空の Map を返す

---

## diff パーサ（T-03）

### TC-010: hunk `+c,d` 形式 → 追加行の範囲 `[c, c+d-1]` を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** diff hunk ヘッダ `@@ -1,3 +5,4 @@`
**WHEN** `parseUnifiedDiffChangedLines` を呼ぶ
**THEN** Set `{5, 6, 7, 8}` を返す

### TC-011: hunk `,d` 省略（1 行変更） → 1 行のみを返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** diff hunk ヘッダ `@@ -1 +5 @@`（`,d` 省略、1 行変更）
**WHEN** `parseUnifiedDiffChangedLines` を呼ぶ
**THEN** Set `{5}` を返す

### TC-012: hunk `d=0`（純削除） → HEAD 側行なし

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** diff hunk ヘッダ `@@ -3,2 +5,0 @@`（d=0、純削除）
**WHEN** `parseUnifiedDiffChangedLines` を呼ぶ
**THEN** 空 Set を返す（HEAD 側に追加行が無い）

### TC-013: 複数 hunk → 全 hunk の行を統合して返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** diff に `@@ -1,2 +10,2 @@` と `@@ -5,1 +20,3 @@` の 2 hunk がある
**WHEN** `parseUnifiedDiffChangedLines` を呼ぶ
**THEN** Set `{10, 11, 20, 21, 22}` を返す（両 hunk の行を統合）

---

## 判定コア `evaluateChangedLineCoverage`（T-04）

### TC-014: 変更ファイルの DA 行が全て未実行 → failed + ファイル列挙

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 宣言時、ゲートは変更ファイルごとに変更行の実行を判定する > Scenario: 変更ファイルの DA 行が全て未実行 → failed + ファイル列挙

### TC-015: 変更 DA 行が 1 行でも実行 → passed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 宣言時、ゲートは変更ファイルごとに変更行の実行を判定する > Scenario: 変更 DA 行が 1 行でも実行 → passed

### TC-016: 変更行に DA レコードが無い → passed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 宣言時、ゲートは変更ファイルごとに変更行の実行を判定する > Scenario: 変更行に DA レコードが無い → passed

### TC-017: lcov 不在ファイル → failed（fail-closed）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 宣言時、ゲートは変更ファイルごとに変更行の実行を判定する > Scenario: lcov 不在ファイル → failed（fail-closed）

### TC-018: exclude 宣言ファイル → 対象外

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 宣言時、ゲートは変更ファイルごとに変更行の実行を判定する > Scenario: exclude 宣言ファイル → 対象外

### TC-019: include 外ファイル → 対象外

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 宣言時、ゲートは変更ファイルごとに変更行の実行を判定する > Scenario: include 外ファイル → 対象外

### TC-020: 既定は 1 行実行で pass

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既定閾値は実行された変更行 > 0、config で強化可能 > Scenario: 既定は 1 行実行で pass

### TC-021: `minChangedLineCoverage` 指定時、変更 DA 行の実行率が閾値未満 → failed

**Category**: unit
**Priority**: should
**Source**: design.md > D10: 既定閾値は「実行された変更行 > 0」。`minChangedLineCoverage` で任意強化

**GIVEN** `minChangedLineCoverage: 0.8` を指定し、変更 DA 行 5 行のうち実行済みが 3 行（60%）
**WHEN** `evaluateChangedLineCoverage` を呼ぶ
**THEN** そのファイルは failed になる（60% < 80%）

### TC-022: `minChangedLineCoverage` 指定時、変更 DA 行の実行率が閾値以上 → passed

**Category**: unit
**Priority**: should
**Source**: design.md > D10: 既定閾値は「実行された変更行 > 0」。`minChangedLineCoverage` で任意強化

**GIVEN** `minChangedLineCoverage: 0.8` を指定し、変更 DA 行 5 行のうち実行済みが 4 行（80%）
**WHEN** `evaluateChangedLineCoverage` を呼ぶ
**THEN** そのファイルは passed になる（80% >= 80%）

### TC-023: 複数の失敗ファイルが stdout に全列挙される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 > 失敗ファイルを reason 付きで列挙する

**GIVEN** `src/foo.ts`（全 DA 未実行）と `src/bar.ts`（lcov 不在）の 2 ファイルが変更対象
**WHEN** `evaluateChangedLineCoverage` を呼ぶ
**THEN** status は failed で、stdout に `src/foo.ts` と `src/bar.ts` の両方が reason 付きで列挙される

---

## orchestrator `runChangedLineCoverageGate`（T-05）

### TC-024: coverage コマンドが非 0 で終了 → failed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: coverage コマンド失敗・lcov 不生成は failed > Scenario: coverage コマンドが非 0 で終了 → failed

### TC-025: lcov ファイルが生成されない → failed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: coverage コマンド失敗・lcov 不生成は failed > Scenario: lcov ファイルが生成されない → failed

---

## runner 配線（T-06）

### TC-026: phases path でゲートが実行される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: ゲートは commands path / phases path の両方で主検証の後に実行される > Scenario: phases path でゲートが実行される

### TC-027: commands path でゲートが実行される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: ゲートは commands path / phases path の両方で主検証の後に実行される > Scenario: commands path でゲートが実行される

### TC-028: 未宣言時は skip の note が出て phase は増えない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: config 未宣言ならゲートは skip され既存挙動が不変 > Scenario: 未宣言時は skip の note が出て phase は増えない

### TC-029: coverage 未宣言時、既存 runner テストが無変更で green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** coverage を宣言しない既存の verification 設定
**WHEN** 既存の `runner.test.ts` / `runner-commands.test.ts` をそのまま実行する
**THEN** 全テストが green（phases.length・verdict・phase セクション数が coverage 導入前と同一）

### TC-030: 先行 phase が failed のとき coverage gate は skipped（fail-fast）

**Category**: integration
**Priority**: should
**Source**: design.md > D4: ゲートは主検証後に実行。宣言時のみ phase を足し、未宣言時は非 phase の note で可視化

**GIVEN** coverage を宣言し、先行 phase（test 等）が failed
**WHEN** verification を実行する
**THEN** `changed-line-coverage` phase は status `skipped` として phases に追加され、ゲートのコマンドは実行されない

---

## TC-ID 厳密一致（T-07）

### TC-031: TC-1 が TC-10 にマッチしない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: TC-ID 照合は ID 境界の厳密一致で行う > Scenario: TC-1 が TC-10 にマッチしない

### TC-032: 完全一致する TC-ID は検出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: TC-ID 照合は ID 境界の厳密一致で行う > Scenario: 完全一致する TC-ID は検出される

### TC-033: TC-1 が TC-1-2（後続が `-数字`）にマッチしない

**Category**: unit
**Priority**: should
**Source**: design.md > D9: TC-ID 照合は traceability として残置。substring → ID 境界の厳密一致に修正

**GIVEN** must TC が `TC-1` で、テストファイルに `TC-1-2` は現れるが `TC-1` 単独では現れない
**WHEN** TC-ID 照合を実行する
**THEN** `TC-1` は missing 扱いになる（`TC-1-2` に誤マッチしない）

---

## Result

```yaml
result: completed
total: 33
automated: 33
manual: 0
must: 25
should: 8
could: 0
blocked_reasons: []
```
