# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 差分スコープ確認
- `git diff main...HEAD --stat`: 25 ファイル変更、3527 行追加、58 行削除
- 新設: `src/core/step/staging-containment.ts`, `src/util/glob-match.ts`（matchesGlob 移設先）, `src/errors.ts`（stagingLimitExceededError 追加）, `src/config/schema/types.ts`（PipelineConfig 拡張）, `src/config/schema/validation.ts`（validation 追加）, `docs/configuration.md`（ドキュメント追加）
- テスト新設: `commit-push-guarded-staging.test.ts`, `staging-containment.test.ts`, `shared-glob-match-imports.test.ts`, `staging-config-validation.test.ts`

### 実装コード精査

**matchesGlob 共有化（T-01 / TC-009 / TC-022）**
- `src/util/glob-match.ts`: `matchesGlob` を単一定義として export。`globMatch`（既存）と共存、挙動統合は非スコープとしてコメントで明記。
- `src/core/step/bite-evidence/test-file-selection.ts`: `matchesGlob` 本体を削除し `../../util/glob-match.js` からの import + re-export に変更。既存テストの import パス (`./test-file-selection.js`) は変更なし。
- `src/core/step/staging-containment.ts`: `../../util/glob-match.js` から import。
- 双方とも `function matchesGlob` ローカル定義なし。import 構造テスト（TC-009）が regex で固定。

**matchesGlob パターン動作確認（TC-019）**
- `**/.cargo-tmp/**` パターンを `.cargo-tmp/registry/cache.json` に適用:
  - `**/` → `(?:.*/)?`（0個以上のディレクトリセグメント）で空文字にマッチ
  - `\.cargo-tmp/` → literal
  - `**`（末尾、`/` なし）→ `.*`
  - 結果 regex: `^(?:.*/)?\.cargo-tmp/.*$` → マッチ ✓
- `vendor/**` → `^vendor/.*$` → `vendor/lodash/index.js` にマッチ ✓
- `*.ts` → `^[^/]*\.ts$` → `foo/bar.ts` にマッチしない（`/` 不横断）✓

**staging-containment.ts 純粋関数確認（TC-010〜TC-017）**
- `applyStagingExclusions([], patterns)`: パターン空なら `paths` をそのまま返す（新規配列不生成）。使用箇所は `changedPaths`（ローカル変数）なので参照共有の実害なし。
- `resolveMaxStagedFiles`: `typeof configured === "number" && Number.isInteger && > 0` で有効性チェック後デフォルト 2000 を返す。
- `summarizeTopDirectories`: `p.indexOf("/")` で最初のパスセグメントを取得、`-1` なら `"."` にグルーピング。カウント降順→ディレクトリ名昇順でソート。

**commit-push.ts guarded branch 変更確認（TC-001〜TC-006 / TC-018）**
- guarded 分岐: `getWorktreeChangedPaths(..., false, "all")` → `--untracked-files=all` が statusArgs に追加される（D5実装）。
- 順序: scope 検査（`findWriteScopeViolations` on `changedPaths`） → exclusion（`applyStagingExclusions`） → volume guard（`stagePaths.length > limit` → throw before `git add`） → `git add -A -- ...stagePaths` → diff check → commit → egress → push。
- 除外パターン適用が scope 検査の**後**であることを確認（D3実装）。canon path への除外パターンが scope 検査を迂回できない構造は実装・テスト（TC-003）ともに確認。
- `stagePaths.length === 0` 時は `git add` をスキップ。diff check で staged changes なし → early return。既存テストとの互換性維持。

**config validation（TC-007 / TC-008）**
- `validation.ts`: `stagingExcludePatterns: optional(array(nonEmptyString(...)).check(minLength(1, ...)))` — 要素空文字列・`[]`・非文字列要素で CONFIG_INVALID。
- `maxStagedFiles: optional(number(...).check(int(...), gte(1, ...)))` — 0・負・非整数で CONFIG_INVALID。
- 既存 `verification.scopedTestPatterns` / `specReview.pollIntervalMs` パターンとの対称性あり。
- デフォルト値は config 層では注入しない（`staging-containment.ts` の runtime fallback で解決）。

**docs/configuration.md（TC-008 前提）**
- "Guarded staging containment" セクション新設: `stagingExcludePatterns` / `maxStagedFiles` の用途・既定値・guarded steps 限定であることを記載。glob 構文も説明。
- deep-merge 時の array replacement 動作（`forbiddenSurfaces` と同じ挙動）を記載。

**errors.ts（TC-017）**
- `stagingLimitExceededError`: message に `${total} files exceed the limit of ${limit}` + top ディレクトリリスト。hint に `stagingExcludePatterns`・`.gitignore` と `maxStagedFiles` の両出口を案内（日本語）。
- `STAGING_LIMIT_EXCEEDED` が `ERROR_CODES` に追加されている。

**package.json 確認（TC-021）**
- `git diff main -- package.json` → 差分なし。dependencies 変更なし ✓

**verification 結果確認**
- build / typecheck / test / lint すべて passed。
- テスト: 662 ファイル、9883 passed（1 skipped）。新規テストを含む全テストが green。

### 受け入れ基準 全項目の確認

| # | 基準 | 判定 | 証拠 |
|---|------|------|------|
| 1 | 除外テスト（TC-001 / TC-002） | ✓ | commit-push-guarded-staging.test.ts TC-001/002 |
| 2 | scope 迂回封じテスト（TC-003） | ✓ | commit-push-guarded-staging.test.ts TC-003 |
| 3 | 量ガードテスト（TC-004 / TC-005） | ✓ | commit-push-guarded-staging.test.ts TC-004/005 |
| 4 | 除外×量ガード合成テスト（TC-006） | ✓ | commit-push-guarded-staging.test.ts TC-006 |
| 5 | matchesGlob 単一実装（TC-009 / TC-022） | ✓ | shared-glob-match-imports.test.ts |
| 6 | config validation（TC-007） | ✓ | staging-config-validation.test.ts |
| 7 | 新規 runtime 依存なし（TC-021） | ✓ | package.json diff なし |
| 8 | 既存テスト green | ✓ | 9883 tests passed |
| 9 | typecheck && test green | ✓ | verification-result.md |

## 検証できなかった項目

None。全受け入れ基準を機械的に確認済み。

## Findings 詳細

None（指摘なし）。

### 観察事項（ブロッキングなし）

**TC-017 の limit 値アサーション**: `expect(msg).toContain("2000")` はメッセージ中の `"limit of 2000"` にマッチするが、ディレクトリリスト中の `"24000"` や `"20000"` の部分文字列としてもマッチしうる弱いアサーション。実装は `${limit}` を正しくメッセージに埋め込んでいるため正確性に問題はないが、テストの識別力が低い。将来の改良候補。

**applyStagingExclusions の参照返し**: パターン空時に `paths` の同一参照を返す。`changedPaths` はローカル変数のため実害なし。API コントラクトとしては filter 時と異なる参照性を持つが、このモジュールの使用箇所（commit-push.ts のみ）では問題にならない。
