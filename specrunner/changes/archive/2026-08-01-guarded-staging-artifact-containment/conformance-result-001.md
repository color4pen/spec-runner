# Conformance Result — guarded-staging-artifact-containment — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

Files reviewed: `src/util/glob-match.ts`, `src/core/step/staging-containment.ts`,
`src/core/step/commit-push.ts` (guarded branch), `src/core/step/bite-evidence/test-file-selection.ts`,
`src/errors.ts`, `src/config/schema/types.ts`, `src/config/schema/validation.ts`,
`docs/configuration.md`, and all new test files.

### J1: spec Requirements (SHALL/MUST) の実装確認

**R1 — Guarded staging SHALL exclude paths matching `pipeline.stagingExcludePatterns`**

- `applyStagingExclusions(paths, excludePatterns)` が `matchesGlob` 経由でフィルタリング。空パターン → 全パス返却（legacy 動作）。✓
- `commitAndPush` の guarded branch で violation check 後に `excludePatterns = resolveStagingExcludePatterns(deps.config)` → `stagePaths = applyStagingExclusions(changedPaths, excludePatterns)` を計算。✓
- `git add -A -- ...stagePaths` / `git commit -- ...stagePaths` がいずれも除外後のセットを使用。✓
- `pipeline.stagingExcludePatterns` 未設定時は `resolveStagingExcludePatterns` が `[]` を返し、全パスが staging 対象（legacy 動作保持）。✓
- Scoped staging 経路は一切変更なし（diff 確認済み）。✓

**R2 — Write-scope enforcement SHALL precede exclusion**

- `findWriteScopeViolations(step.name, slug, changedPaths, declaredWritePaths)` が除外適用前の全 `changedPaths` に対して実行。コード内コメント「IMPORTANT: violation check runs on the FULL changedPaths (before exclusion)」で明示。✓
- 除外パターンに canon path（`specrunner/changes/**`）が含まれても、`changedPaths` への違反検査は機能する。✓

**R3 — Volume guard SHALL halt before commit when stage count exceeds `pipeline.maxStagedFiles`**

- `if (stagePaths.length > limit) throw stagingLimitExceededError(...)` が `git add` より前に配置。✓
- `stagingLimitExceededError` に `STAGING_LIMIT_EXCEEDED` コード、総件数、top-directory 集計、両出口案内（stagingExcludePatterns/.gitignore または maxStagedFiles 引き上げ）が含まれる。✓
- デフォルトは `DEFAULT_MAX_STAGED_FILES = 2000`（未設定時 `resolveMaxStagedFiles` が返却）。✓
- guarded 側の `getWorktreeChangedPaths` に `untrackedMode: "all"` を渡すことで untracked ディレクトリが個別ファイルとして列挙される（D5、ガードに実効性）。✓

**R4 — config validation**

- `validation.ts` に `stagingExcludePatterns: optional(array(nonEmptyString(...)).check(minLength(1, ...)))` — `scopedTestPatterns` の前例と対称。✓
- `maxStagedFiles: optional(number(...).check(int(...), gte(1, ...)))` — `specReview.pollIntervalMs` の前例と対称。✓
- 空配列、空文字要素、非文字列要素 → `CONFIG_INVALID`。✓
- 0、負値、非整数 → `CONFIG_INVALID`。✓
- 両フィールド省略は config レイヤーでデフォルト注入せず検証成功。✓

**R5 — `matchesGlob` SHALL be a single shared implementation**

- `matchesGlob` 本体を `src/util/glob-match.ts` に移設（`globMatch` と同居、コメントで独立実装として注記）。✓
- `test-file-selection.ts` はローカル定義を除去し `import { matchesGlob } from "../../../util/glob-match.js"` と `export { matchesGlob }` を追加。✓
- `staging-containment.ts` は `../../util/glob-match.js` からインポート。✓
- package.json に新規 runtime 依存なし（diff 空）。✓

---

### J2: request.md 受け入れ基準の確認

| 基準 | テスト | 状態 |
|---|---|---|
| 除外テスト（設定あり/なし） | TC-001, TC-002 — `commit-push-guarded-staging.test.ts` | ✓ |
| scope 迂回封じテスト | TC-003 — `commit-push-guarded-staging.test.ts` | ✓ |
| 量ガードテスト（超過/以下） | TC-004, TC-005 — `commit-push-guarded-staging.test.ts` | ✓ |
| 除外と量ガードの合成テスト | TC-006 — `commit-push-guarded-staging.test.ts` | ✓ |
| `matchesGlob` 単一実装の import 構造保証 | TC-009 — `shared-glob-match-imports.test.ts` | ✓ |
| config validation（不正値） | TC-007 — `staging-config-validation.test.ts` | ✓ |
| 新規 runtime 依存なし | package.json diff 空 + build/lint 通過 | ✓ |
| 既存テスト無変更 green | 9 883 tests passed | ✓ |
| `typecheck && test` green | verification-result.md: all 5 phases passed | ✓ |

TC-018 が `--untracked-files=all` の guarded status call への付与を検証（D5 固定）。✓

---

### J3: 設計判断 D1–D6 の遵守確認

| 判断 | 確認 |
|---|---|
| **D1** 二層防御 | 除外と量ガードの両方が実装済み。✓ |
| **D2** `matchesGlob` 移設 | `glob-match.ts` に単一定義、re-export 構造、TC-009 で固定。✓ |
| **D3** scope 検査を除外より前に | guarded branch の順序: `findWriteScopeViolations(changedPaths)` → 除外 → 量ガード → add。✓ |
| **D4** 量ガードを `git add` より前に | `throw stagingLimitExceededError(...)` が `git add` 前に配置。✓ |
| **D5** `--untracked-files=all` | guarded 側のみ `"all"` を指定、scoped は `"normal"` のまま。✓ |
| **D6** config validation 既存前例に準拠 | `scopedTestPatterns` / `pollIntervalMs` と同パターン。✓ |

追加確認: `STAGING_LIMIT_EXCEEDED` は `EXIT_CODE_MAP` に追加されていない（pipeline escalation 経由）。✓

---

### J4: スコープ外の混入がないこと

- Scoped staging 経路は無変更（diff 確認済み）。✓
- push retry 機構なし。✓
- バイトサイズ閾値なし。✓
- .gitignore の自動編集・agent prompt 変更なし。✓
- `package.json` / `.specrunner/config.json` 無変更（diff 空）。✓
- `globMatch` の本体は変更なし（`matchesGlob` の同居のみ）。✓
- 3 つの glob matcher（`globMatch` / `matchesGlob` / `matchGlob`）は統合されていない（Non-Goal 遵守）。✓

---

## 検証できなかった項目

None。全項目をソースコード・テスト・diff・verification-result で確認した。

---

## Findings 詳細

None。すべての要件・受け入れ基準・設計判断・スコープ制約が実装で満たされている。
