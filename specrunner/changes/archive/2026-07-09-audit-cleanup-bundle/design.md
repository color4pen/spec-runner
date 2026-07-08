# Design: audit-cleanup-bundle

## Context

事後監査で検出された小粒不具合 5 件を一括修正する。各修正は数行規模・相互独立で、1 レビューループに収まる。

### 対象ファイルと現状

| # | ファイル | 症状 |
|---|---------|------|
| 1 | `src/core/verification/changed-line-coverage.ts:210-214` | `spawnCommand` 第 4 引数 `root` 未渡し |
| 2 | `src/core/verification/changed-line-coverage.ts:119-130, 145-151` | 閾値未達と全行未実行が同一 reason/メッセージ |
| 3 | `specrunner/adr/2026-07-08-lcov-changed-line-gate.md:57,130` | 例 config が `minChangedLineCoverage: 0`（schema は gt(0) で拒否） |
| 4 | `src/core/doctor/checks/config/file-exists.ts:18-23` | loadError hint が常に user-global パスを案内 |
| 5a | `tests/unit/cli/ps-filter.test.ts:359-393` | TC-032: vi.mock intra-module 問題で mock が介在せず、否定形 assertion のみ |
| 5b | `src/core/archive/__tests__/merge-then-archive.test.ts:264` | T-PMI-01: テスト内定数を assert する同語反復 |

## Goals / Non-Goals

**Goals**:
- 5 件の不具合をそれぞれ最小変更で修正し、受け入れ基準をすべて満たすテストで固定する
- 既存テストを壊さない（要件 5 の 2 テストを除く）

**Non-Goals**:
- coverage gate の判定ロジック・fail-closed 方針の変更
- `spawnCommand` 本体の仕様変更
- doctor の check 構成の再設計
- 要件 5 の対象 2 件以外のテストの書き直し

## Decisions

### D1: coverage gate に `root` を `RunGateOptions` 経由で注入する

`runner.ts` は `detectPackageManager(cwd)` を既に呼び出し `root` を保持している。`runChangedLineCoverageGate` に `root?: string` フィールドを追加し、内部の `spawnCommand` 呼び出しに渡す。

**Rationale**: gate 内で再度 `detectPackageManager` を呼ぶと IO が増え、runner との不整合リスクが生じる。runner がすでに持つ値を受け取るだけにする。

**Alternatives**: gate 内で `detectPackageManager` を独自呼び出し → 重複 IO + 不整合リスク。却下。

### D2: `FailReason` に `"below-threshold"` を追加し、メッセージを分岐させる

閾値未達（一部実行済み）は `reason: "below-threshold"`、全行未実行は `reason: "unexecuted"` で区別する。
`"below-threshold"` のメッセージは実行率と閾値を含む形式にする:
```
  - src/foo.ts: 33% coverage (1/3 changed DA lines executed), threshold 80%
```
`"unexecuted"` のメッセージは既存のまま: `changed DA lines were not executed`

**Rationale**: 同一 reason で異なる状態を表すと診断が困難。reason 型の拡張は型安全で既存コードへの影響を最小化できる。

**Alternatives**: reason は変えずメッセージだけ変える → reason で分岐するダウンストリームコードが誤判定する可能性。却下。

### D3: ADR はドキュメント修正のみ（コード変更なし）

D2 例 config の `"minChangedLineCoverage": 0` を `0.8` に変更する（実用的なデフォルト値）。
D10 の「指定時（0〜1）」を「指定時（>0〜1、例: 0.8）」に変更する。
schema の制約（`gt(0)` `lte(1)`）に合致させるだけで、判定ロジックは不変。

**Rationale**: テキスト修正のみで十分。例示値として `0.8` は実用上わかりやすい。

### D4: `DoctorConfig` に `loadErrorPath?: string` を追加し、hint の分岐を data-driven にする

`loadErrorPath` フィールドを `DoctorConfig` interface に追加する。
`doctor.ts` の `buildDoctorConfig` は `loadErrorPath` を受け取りそのまま格納する。
`runDoctor` の catch ブロックで `configLoadError` に加え `configLoadErrorPath` を決定する:
- エラーメッセージに `"project local config"` が含まれる → `resolveRepoRoot(cwd)` を呼び project-local パスを構築
- エラーメッセージに `"user global config"` が含まれる → `getConfigPath()` を使用
- どちらも含まない（CONFIG_MISSING など）→ `undefined`

`file-exists.ts` の hint は `ctx.config.loadErrorPath ?? configPath` を使う。

**Rationale**: エラーメッセージのラベル（"project local config" / "user global config"）は `parseAndMigrate` が確定的に埋めており、変更には自分で触れるため将来もコロケーションが保たれる。型追加は `DoctorConfig` のみで小さい。

**Alternatives**:
- `SpecRunnerError` にパスフィールドを追加してスローする → エラー型変更が広い。却下。
- `loadConfigWithOverlay` を改修してパスを返す → 今回のスコープより広い。却下。

### D5a: TC-032 は削除しコメントで理由を残す

`vi.mock("ps.js")` で re-export した場合、`runPs` の内部から `checkPrMerged` を呼ぶコードは元のモジュールバインディングを使い続けるため、差し替えた mock は介在しない。否定形 assertion のみで検証能力がない。
依存注入（`checkPrMerged` をパラメータ化）はスコープ外のため、test block を削除しコメントで理由を記録する。

**Rationale**: 検証能力のないテストは coverage を過大申告し、同種の回帰を見逃す（request architect 評価済み）。

### D5b: T-PMI-01 の同語反復 assertion を削除する

`expect(FAKE_ESCALATION).toContain("MERGED")` は検査対象が実装出力ではなくテスト内定数であるため削除する。
`expect("escalation" in result && result.escalation).toBe(FAKE_ESCALATION)` が既に実装出力を検証しており、"MERGED" 含有を間接的に担保している。
冗長な削除のみで、他の assertion は変更しない。

## Risks / Trade-offs

- **[Risk] D2 の FailReason 拡張がダウンストリームを壊す** → `FailReason` を文字列ユニオンで型定義しているため、switch exhaustiveness チェックがある箇所は TS エラーで検出される。`runner.ts` の stdout 生成ではなく `changed-line-coverage.ts` 内のメッセージ生成に閉じているため影響範囲は小さい。
- **[Risk] D4 のエラーメッセージ解析が将来壊れる** → `parseAndMigrate` のラベル文字列（"project local config" / "user global config"）は `store.ts` と `doctor.ts` に分散するが、どちらも本 repo のコードで CODEOWNERS の管理下。変更時に両ファイルを更新すれば済む。

## Open Questions

なし。受け入れ基準はすべて確定しており、設計分岐も解決済み。
