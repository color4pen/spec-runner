# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション（7 件、全件確認済み）

1. **`src/core/step/write-scope.ts:33-53` — GUARDED_WRITE_STEPS**
   - 確認: `GUARDED_WRITE_STEPS` は `new Set(["implementer","build-fixer","code-fixer","test-materialize","adr-gen"])` として line 33-39 に定義。`stagingModeFor` は line 51-53。request の列挙と一致。

2. **`src/core/step/commit-push.ts:602-605` — guarded staging の `git add -A -- <changedPaths>`**
   - 確認: line 572 から始まる guarded synthesis mode ブロック内。`changedPaths` は line 574 の `getWorktreeChangedPaths(...)` 由来。line 604 の `if (changedPaths.length > 0)` → line 605 の `["add", "-A", "--", ...changedPaths]` で stage。untracked も `paths` に含まれる（`getWorktreeChangedPaths` が `??` status を収集）ことを line 146-151 で確認。request の「untracked のビルド産物も対象」は正確。

3. **`src/core/step/commit-push.ts:490,838` — scoped 経路**
   - 確認: line 490 は scoped mode 内の `["add", "-A", "--", ...stagePaths]`（宣言パス限定）。line 838 は `pushScopedFiles` 内の同構造。

4. **`src/core/step/bite-evidence/test-file-selection.ts` — `matchesGlob`**
   - 確認: line 51-83 に `matchesGlob(filePath, pattern)` が実装済み。`**/` / `*` / `.` 厳密リテラルの動作を comment と実装で確認。bite-evidence 専用の置き場であることを確認。

5. **`src/config/schema/types.ts:236-248` — `PipelineConfig`**
   - 確認: line 236-247 に `PipelineConfig` インターフェース。フィールドは `maxRetries?: number` と `fast?: FastPipelineConfig` のみ。`stagingExcludePatterns` / `maxStagedFiles` は未存在（追加対象）。

6. **`src/config/schema/validation.ts` — `scopedTestPatterns` の validation 前例**
   - 確認: line 271-275 に `scopedTestPatterns: optional(array(nonEmptyString("must be a non-empty string."), ...).check(minLength(1, ...)))` が実装済み。非空文字列配列の validation パターンとして使える前例。

7. **`src/core/step/write-scope.ts:64-74` — `protectedCanonPaths`**
   - 確認: line 64-74 に `protectedCanonPaths(slug): string[]` が実装済み。request / spec / design / tasks / test-cases / attestation の 6 パスを返す。

### docs 確認

- `docs/configuration.md` の `## Pipeline` セクション（line 361-373）に `pipeline.maxRetries` が既存。`stagingExcludePatterns` / `maxStagedFiles` の追記先として適切。

### 依存確認

- `package.json` に glob ライブラリ（glob / minimatch / micromatch / picomatch 等）が追加されていないことを確認。既存 `matchesGlob` の共有で対応できる前提に問題なし。

### 設計整合性

- **除外前チェック（要件 2）**: `findWriteScopeViolations` を `changedPaths`（全変更）に対して適用した後に除外パターンを stage フィルタとして使う、という順序制約は実装上明確。現在のコードは line 586 で `findWriteScopeViolations(step.name, slug, changedPaths, ...)` → line 604-605 で stage、という流れであり、除外を line 604 の `if (changedPaths.length > 0)` ブロックより前で適用しないように書けば要件 2 は自然に満たせる。
- **量ガード位置**: 除外適用後・`git add` 前に件数チェックを挟むことで push 前に決定的に止まる。HTTP 400 の発生源根絶として一貫している。
- **matchesGlob の移設先**: `src/util/` への移設で bite-evidence と guarded staging が同一実装を import できる。既存 `test-file-selection.ts` が re-export または直接 import に切り替えることで single source of truth を保てる。

## 検証できなかった項目

None

## Findings 詳細

None
