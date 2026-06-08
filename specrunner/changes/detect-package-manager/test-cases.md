# Test Cases: パッケージマネージャを自動検出して bun ハードコードを解消する

## Summary

- **Total**: 24 cases
- **Automated** (unit/integration): 22
- **Manual**: 2
- **Priority**: must: 12, should: 8, could: 4

---

## detect-pm.ts — 検出ロジック（unit）

### TC-001: pnpm-lock.yaml が存在する場合 pnpm を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: lockfile からパッケージマネージャを決定的に検出する > Scenario: pnpm-lock.yaml が存在する

---

### TC-002: bun.lockb または bun.lock が存在する場合 bun を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: lockfile からパッケージマネージャを決定的に検出する > Scenario: bun.lockb または bun.lock が存在する

---

### TC-003: yarn.lock が存在する場合 yarn を返す

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: lockfile からパッケージマネージャを決定的に検出する > Scenario: yarn.lock が存在する

---

### TC-004: package-lock.json が存在する場合 npm を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: lockfile からパッケージマネージャを決定的に検出する > Scenario: package-lock.json が存在する

---

### TC-005: lockfile が存在せず packageManager フィールドのみ存在する場合 pnpm を返す

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: lockfile からパッケージマネージャを決定的に検出する > Scenario: lockfile が存在せず packageManager フィールドのみ存在する

---

### TC-006: lockfile も packageManager フィールドも無い場合 npm を返す

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: lockfile からパッケージマネージャを決定的に検出する > Scenario: lockfile も packageManager フィールドも無い

---

### TC-007: 複数 lockfile が同時に存在する場合 固定優先順で先勝ちする

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: lockfile からパッケージマネージャを決定的に検出する > Scenario: 複数 lockfile が同時に存在する

---

### TC-008: install コマンドを PM から正しく導出する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 検出した PM から install / run コマンドを導出する > Scenario: install コマンド導出

---

### TC-009: run コマンドを PM から正しく導出する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 検出した PM から install / run コマンドを導出する > Scenario: run コマンド導出

---

### TC-019: packageManager フィールドの parse が失敗した場合 npm へ fallback する

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-01

**GIVEN** cwd に lockfile が無く、`package.json` の内容が不正な JSON である
**WHEN** `detectPackageManager(cwd)` を呼ぶ
**THEN** 例外を throw せず `"npm"` を返す

---

### TC-020: packageManager フィールドが既知でない PM 名の場合 npm へ fallback する

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-01

**GIVEN** cwd に lockfile が無く、`package.json` の `packageManager` が `"volt@1.0.0"` など未知の PM 名である
**WHEN** `detectPackageManager(cwd)` を呼ぶ
**THEN** `"npm"` を返す

---

### TC-021: bun.lockb と bun.lock が同時に存在する場合 bun.lockb が優先される

**Category**: unit
**Priority**: could
**Source**: design.md > D2（固定優先順序: pnpm-lock.yaml → bun.lockb → bun.lock → …）

**GIVEN** cwd に `bun.lockb` と `bun.lock` が両方存在する
**WHEN** `detectPackageManager(cwd)` を呼ぶ
**THEN** `"bun"` を返し、検出は `bun.lockb` が先勝ちしたことで決定的に決まる（毎回同じ結果）

---

## worktree/manager.ts — install 統合（integration）

### TC-010: pnpm プロジェクトの worktree install に pnpm コマンドが使われる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: worktree 作成時の install は検出した PM コマンドで行う > Scenario: pnpm プロジェクトの worktree install

---

### TC-011: bun プロジェクトの worktree install が後方互換を維持する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: worktree 作成時の install は検出した PM コマンドで行う > Scenario: bun プロジェクトの worktree install（後方互換）

---

### TC-012: lockfile 不在時の worktree install が npm ci になる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: worktree 作成時の install は検出した PM コマンドで行う > Scenario: lockfile 不在時の worktree install

---

### TC-022: install 失敗時のエラーメッセージに検出 PM 名が反映される

**Category**: integration
**Priority**: could
**Source**: tasks.md > T-02

**GIVEN** `repoRoot` に `pnpm-lock.yaml` が存在し、pnpm install が非ゼロ終了する
**WHEN** `create()` が install を実行する
**THEN** エラーメッセージに `"bun install"` ではなく `"pnpm"` を含む文言が出る

---

## verification/runner.ts — run 統合（integration）

### TC-013: pnpm プロジェクトの phase fallback が pnpm run で実行される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: verification phase 実行は検出した PM の run コマンドで行う > Scenario: pnpm プロジェクトの verification

---

### TC-014: bun プロジェクトの phase fallback が後方互換を維持する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: verification phase 実行は検出した PM の run コマンドで行う > Scenario: bun プロジェクトの verification（後方互換）

---

### TC-015: verification.commands 設定時は PM 検出を経由しない

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: verification phase 実行は検出した PM の run コマンドで行う > Scenario: verification.commands は PM 検出に影響されない

---

## doctor checks — PM バイナリ検証（integration）

### TC-016: pnpm プロジェクトで doctor が pnpm --version を pass する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor は検出した PM のバイナリ存在を検証する > Scenario: pnpm プロジェクトの doctor

---

### TC-017: 検出 PM のバイナリが無い場合 doctor が fail を返す

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor は検出した PM のバイナリ存在を検証する > Scenario: 検出 PM のバイナリが無い

---

### TC-023: doctor の check 総数と runtime カテゴリ数が変更前後で不変

**Category**: integration
**Priority**: could
**Source**: design.md > D7 / tasks.md > T-04

**GIVEN** `src/core/doctor/checks/index.ts` が `packageManagerCheck` に差し替え済み
**WHEN** `allChecks` 配列の長さと各カテゴリの check 数を確認する
**THEN** runtime カテゴリの check 数が 3 のままで、`allChecks` 総数が 17 以上である

---

## 外部依存・ビルド検証（manual）

### TC-018: 変更適用後も dependencies が 4 個のまま増えない

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: 外部依存を増やさない > Scenario: dependencies 件数が変わらない

---

### TC-024: typecheck / test / lint がすべて green

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-05

**GIVEN** 本変更が実装済みである
**WHEN** `bun run typecheck && bun run test && bun run lint` を実行する
**THEN** いずれも非ゼロ終了せず、lint は `--max-warnings 0` で警告ゼロ

---

## Result

```yaml
result: completed
total: 24
automated: 22
manual: 2
must: 12
should: 8
could: 4
blocked_reasons: []
```
