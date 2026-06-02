# Tasks: must TC の test に実質的な assertion を要求する faithfulness gate

## T-01: `TestCoverageResult` に `assertionlessTcIds` フィールドを追加

- [x] `src/core/verification/test-coverage.ts` の `TestCoverageResult` interface に `assertionlessTcIds: string[]` を追加
- [x] `runTestCoveragePhase` の全 return 文で `assertionlessTcIds: []` を初期値として返す（既存挙動を壊さない）

**Acceptance Criteria**:
- `TestCoverageResult` 型に `assertionlessTcIds` が存在する
- `bun run typecheck` が green

## T-02: assertion 存在検査ロジックを `runTestCoveragePhase` に追加

- [x] assertion パターン定数を定義: `/expect\(|assert\(|assert\./`
- [x] Step 5（TC-ID 出現チェック）の直後に assertion 検査を追加: TC-ID が found になったファイルのうち、assertion パターンが 1 つも存在しないファイルしか持たない TC-ID を `assertionlessTcIds` に追加
  - 具体的には: TC-ID が出現するファイル群のうち、**少なくとも 1 ファイルに** assertion パターンが存在すれば OK。全ファイルに assertion が無い場合のみ assertionless 判定
- [x] `foundTcIds` からは除外しない（TC-ID 自体は found）。`assertionlessTcIds` に追加のみ
- [x] status 判定を更新: `missingTcIds.length === 0 && assertionlessTcIds.length === 0` → `passed`、いずれかに要素があれば `failed`

**Acceptance Criteria**:
- `it("TC-001", () => {})` のような空 stub のみのファイルで TC-ID が found 済みでも `assertionlessTcIds` に含まれる
- `it("TC-001", () => { expect(true).toBe(true); })` のようなファイルでは `assertionlessTcIds` に含まれない
- `assertionlessTcIds` に要素がある場合 status が `failed` になる

## T-03: stdout 報告に assertion 欠如情報を追加

- [x] `runTestCoveragePhase` の stdout 生成部分を更新
  - `assertionlessTcIds` が非空の場合、`Assertionless: TC-001, TC-002` 行を追加
- [x] 既存の `Missing:` 行との共存を確認（両方非空の場合は両行を出力）

**Acceptance Criteria**:
- assertion 欠如 TC がある場合、stdout に `Assertionless:` 行が含まれる
- missing TC と assertionless TC が同時に存在する場合、両方が報告される

## T-04: delta spec 作成（verification-runner capability）

- [x] `specrunner/changes/scenario-test-faithfulness-gate/specs/verification-runner/spec.md` に delta spec を作成
  - 既存 Requirement「test-coverage phase は test-cases.md の must TC ID を tests/ 配下から grep で検証する」を MODIFIED: assertion 存在検査の要件を追加
  - `TestCoverageResult` に `assertionlessTcIds` フィールドが追加される要件を記述
  - Scenario を追加: 空 stub → failed / assertion あり → passed / 両方欠如の混在

**Acceptance Criteria**:
- delta spec が delta spec フォーマットに準拠している（`## Requirements` / `### Requirement:` / `#### Scenario:` 構造）
- 既存 Requirement header が baseline と完全一致している（MODIFIED として自動分類されるため）
- normative keyword（MUST / SHALL）が含まれている

## T-05: 既存テストの修正（assertion 追加）

- [x] `tests/unit/core/verification/test-coverage.test.ts` の既存テストで assertion 検査に影響を受けるケースを確認
  - TC-006 / TC-009 / TC-010 / TC-015 related: test ファイルの中身が `it("TC-001: first", () => {});` のように assertion 無しの場合、新検査で `assertionlessTcIds` に含まれるため、テストの期待値またはテストデータを修正
  - 修正方法: テストデータの test ファイル内容に `expect(` を含む assertion を追加する

**Acceptance Criteria**:
- 既存テストが新ロジックのもとで green になる

## T-06: assertion 検査の unit test 追加

- [x] `tests/unit/core/verification/test-coverage.test.ts` に以下のテストを追加:
  - 空 stub（TC-ID はあるが assertion 無し）→ `status: "failed"` かつ `assertionlessTcIds` に TC-ID が含まれる
  - assertion あり（TC-ID + `expect(` 存在）→ `status: "passed"` かつ `assertionlessTcIds` が空
  - TC-ID が複数ファイルに出現し、1 ファイルに assertion がある場合 → assertionless ではない
  - missing TC と assertionless TC が混在 → 両方報告、status: `failed`
  - stdout に `Assertionless:` 行が含まれることの検証
  - `assert(` / `assert.` パターンでも assertion 検出される

**Acceptance Criteria**:
- 新規テストが全て green
- assertion 検査の正常系・異常系・境界がカバーされている

## T-07: typecheck & test green 確認

- [x] `bun run typecheck` が成功する
- [x] `bun run test` が成功する

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が exit 0
