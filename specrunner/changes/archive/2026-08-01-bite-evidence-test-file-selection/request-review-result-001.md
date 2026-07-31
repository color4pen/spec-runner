# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション（gate.ts）

- **gate.ts:154-157**: `changedFilesResult.files.filter((f) => !isExcludedPath(f))` のみで選別していることを Read で確認。テストファイル判定は一切ない（行番号も正確）。
- **gate.ts:36-38**: `isExcludedPath` が `specrunner/changes/` と `.specrunner/` の prefix 一致のみであることを確認。
- **gate.ts:13**: doc comment の `"strategy-deferred": ... no test files.` を確認。
- **gate.ts:76**: `5. No materialized test files → failed.` を確認。
- **gate.ts:159-165**: 空集合で `verdict: "failed"` を返す実装を確認。doc comment（:13）の "strategy-deferred" と矛盾しており、request の指摘どおり。

### コードアサーション（local.ts）

- **local.ts:1032**: `runTestsAtCommit` のシグネチャを確認。
- scopedTestCommand あり → `sh -c '<cmd> <file>'` の per-file 実行（:1064 付近確認）。
- scopedTestCommand なし + custom commands なし → `bun test <file>` の per-file 実行（:1114 付近確認）。
- scopedTestCommand なし + custom commands あり → `unavailable` を返す（bail path 確認）。

### コードアサーション（achieved-assurance.ts）

- **achieved-assurance.ts:265**: `changedFilesResult.files.filter((f) => !isExcludedPath(f))` のみで選別していることを確認。
- **achieved-assurance.ts:21**: `isExcludedPath` を `gate.ts` から import 済み（単一実装共有の既存パターンが確立されている）。
- **achieved-assurance.ts:92-94付近（:282-283）**: `diffPathsBetweenCommits(baseOid, finalHeadOid, materializedTestFiles, cwd)` が非テストファイルも対象に含む現状を確認。

### コードアサーション（config/schema/types.ts）

- `VerificationConfig` に `scopedTestCommand?: string` が存在する（:162）。
- `scopedTestPatterns` は存在しない（request の前提どおり）。

### docs/configuration.md

- `scopedTestCommand` の記述なし（grep で不在を確認）。
- `scopedTestPatterns` も未記載。要件 5 の doc 追随対象として妥当。

### 設計判断の整合性確認

- 「空集合 = strategy-deferred」はgate.ts:13 の doc comment と一致し、strategy-deferred の存在理由（計測不能）とも整合する。
- 「glob ライブラリ不追加」は Minimal-deps North Star（プロジェクト方針）と整合する。
- `isExcludedPath` の共有パターン（achieved-assurance.ts → gate.ts import）が既存で成立しており、新述語 `isTestFile` を同じ構造で共有する設計は無理がない。
- 「test-materialize 側に宣言させる案の却下」は fail-open 設計になるという分析が正しい。

### 既存テスト（gate.test.ts）

- TC-008: `runTestsAtCommit` が pipeline artifact を除外して呼ばれることをテストで固定済み。
- 現状の TC-008 は `.test.ts` ファイルを渡すシナリオのみ（非テストファイルが混在した場合の挙動はカバーなし）。
- 空集合 → `failed` の現挙動を固定するテストの有無を確認。既存テストにはその明示的なケースは見当たらず（空集合は現時点ではテスト外）。

## 検証できなかった項目

None — すべてのコードアサーションを Read/Grep で直接確認した。

## Findings 詳細

指摘なし。

コードアサーションはすべて正確。問題の説明（非テストファイルが per-file 実行される）は実装で裏付けられ、設計判断の根拠も妥当。受け入れ基準は具体的でテスト可能な形で記載されている。実装上の注意点として、簡易 glob の境界（`**/` prefix と `*` 中間一致の範囲外パターン）は request に明示されており、implementer が超過実装しないよう scope が明確に宣言されている。
