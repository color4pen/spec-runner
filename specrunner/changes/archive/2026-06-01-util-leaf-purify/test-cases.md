# Test Cases: util-leaf-purify

## Summary

- **Total**: 29 cases
- **Automated** (unit/integration): 28
- **Manual**: 1
- **Priority**: must: 26, should: 3, could: 0

---

## TC-01 Group: slugify.ts の re-export 除去

### TC-001: slugify.ts に core/ への参照が存在しない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-01 AC, design.md D1

**GIVEN** リファクタリング後の `src/util/slugify.ts`  
**WHEN** ファイル内容を静的に検査する  
**THEN**
- `from "../core/request/store.js"` を含む import/re-export 行が存在しない
- `export { checkSlugCollision }` 行が存在しない
- `src/util/` 配下のいずれのファイルも `../core/` を参照しない

---

### TC-002: slugify.test.ts が checkSlugCollision を core/request/store から直接 import する

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-01 AC, design.md D1

**GIVEN** リファクタリング後の `tests/unit/util/slugify.test.ts`  
**WHEN** ファイル内容を静的に検査する  
**THEN**
- `checkSlugCollision` を `"../../../src/util/slugify.js"` から import する行が存在しない
- `checkSlugCollision` を `"../../../src/core/request/store.js"` から import する行が存在する
- `slugify` は引き続き `"../../../src/util/slugify.js"` から import されている

---

### TC-003: slugify の typecheck が green

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md T-01 AC

**GIVEN** slugify.ts の re-export 除去と slugify.test.ts の import 修正が完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code が 0（compile error なし）

---

### TC-004: slugify のユニットテストが green

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md T-01 AC

**GIVEN** slugify.ts の re-export 除去と slugify.test.ts の import 修正が完了した状態  
**WHEN** `bun run test tests/unit/util/slugify.test.ts` を実行する  
**THEN** 全テストケースが pass（exit code 0）

---

### TC-005: slugify() の公開挙動が不変

- **Category**: unit
- **Priority**: must
- **Source**: request.md 受け入れ基準「slugify の公開挙動が不変」, design.md D1

**GIVEN** リファクタリング後の `src/util/slugify.ts`  
**WHEN** `slugify()` を英語・日本語混在・特殊文字・空文字列で呼び出す  
**THEN** リファクタリング前と同一の戻り値を返す（関数本体は変更なし）

---

### TC-006: checkSlugCollision() の公開挙動が不変

- **Category**: integration
- **Priority**: must
- **Source**: request.md 受け入れ基準「slugify の公開挙動が不変」, design.md D1

**GIVEN** `checkSlugCollision` が `core/request/store` から直接 import される  
**WHEN** `checkSlugCollision(rootDir, slug)` を衝突あり・なし・ディレクトリ不在で呼び出す  
**THEN** 衝突時は SLUG_COLLISION コードで reject、非衝突時は resolve（リファクタリング前と同挙動）

---

## TC-02 Group: copy-artifacts.ts の core/artifact/ への移動

### TC-007: src/util/copy-artifacts.ts が存在しない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-02 AC, design.md D2

**GIVEN** リファクタリング完了後  
**WHEN** `src/util/copy-artifacts.ts` のパスを検査する  
**THEN** ファイルが存在しない

---

### TC-008: src/core/artifact/copy-artifacts.ts が存在し全 export が維持されている

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-02 AC, design.md D2

**GIVEN** リファクタリング完了後  
**WHEN** `src/core/artifact/copy-artifacts.ts` のファイル内容を検査する  
**THEN**
- ファイルが存在する
- `copyRules`、`writeOutputTemplates`、`cleanupOutputTemplates`、`copyDraftUsage`、`rejectSymlink` が全て export されている

---

### TC-009: 移動後ファイルの内部 import path が正しい

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-02

**GIVEN** `src/core/artifact/copy-artifacts.ts`  
**WHEN** ファイル内の import 文を静的に検査する  
**THEN**
- `"../../util/spawn.js"` を import している（旧 `"./spawn.js"`）
- `"../../util/paths.js"` を import している（旧 `"./paths.js"`）
- `"../../prompts/rules.js"` を import している（旧 `"../prompts/rules.js"`）
- `"../../logger/stdout.js"` を import している（旧 `"../logger/stdout.js"`）
- `"../../errors.js"` を import している（旧 `"../errors.js"`）
- `"../../templates/step-output-templates.js"` を import している（旧 `"../templates/step-output-templates.js"`）
- `"../../state/schema.js"` を import している（旧 `"../state/schema.js"`）
- 旧パス（`"./spawn.js"` 等）が残っていない

---

### TC-010: executor.ts の import path が更新されている

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-02

**GIVEN** `src/core/step/executor.ts`  
**WHEN** ファイル内の import 文を静的に検査する  
**THEN**
- `"../../util/copy-artifacts.js"` への参照が存在しない
- `"../artifact/copy-artifacts.js"` から import している

---

### TC-011: local.ts の import path が更新されている

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-02

**GIVEN** `src/core/runtime/local.ts`  
**WHEN** ファイル内の import 文を静的に検査する  
**THEN**
- `"../../util/copy-artifacts.js"` への参照が存在しない
- `"../artifact/copy-artifacts.js"` から import している

---

### TC-012: managed.ts の import path が更新されている

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-02

**GIVEN** `src/core/runtime/managed.ts`  
**WHEN** ファイル内の import 文を静的に検査する  
**THEN**
- `"../../util/copy-artifacts.js"` への参照が存在しない
- `"../artifact/copy-artifacts.js"` から import している

---

### TC-013: tests/util/copy-artifacts.test.ts の import path が更新されている

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-02

**GIVEN** `tests/util/copy-artifacts.test.ts`  
**WHEN** ファイル内の import 文を静的に検査する  
**THEN**
- `"../../src/util/copy-artifacts.js"` への参照が存在しない
- `"../../src/core/artifact/copy-artifacts.js"` から import している

---

### TC-014: tests/unit/util/copy-artifacts.test.ts の import path が更新されている

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-02

**GIVEN** `tests/unit/util/copy-artifacts.test.ts`  
**WHEN** ファイル内の import 文を静的に検査する  
**THEN**
- `"../../../src/util/copy-artifacts.js"` への参照が存在しない
- `"../../../src/core/artifact/copy-artifacts.js"` から import している

---

### TC-015: src/util/ が他の src/ モジュールを一切 import しない（B-4 invariant）

- **Category**: integration
- **Priority**: must
- **Source**: request.md 受け入れ基準（B-4 arch test が green）, design.md D2

**GIVEN** リファクタリング完了後  
**WHEN** `src/util/` 配下の全 .ts ファイルを検査する  
**THEN** `../core/`、`../prompts/`、`../logger/`、`../errors`、`../templates/`、`../state/` への import 文が 0 件

---

### TC-016: copy-artifacts のテストが green

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md T-02 AC

**GIVEN** copy-artifacts.ts の移動と全 importer の import path 更新が完了した状態  
**WHEN** `bun run test tests/util/copy-artifacts.test.ts tests/unit/util/copy-artifacts.test.ts` を実行する  
**THEN** 全テストケースが pass（exit code 0）

---

### TC-017: copy-artifacts の公開挙動が不変

- **Category**: integration
- **Priority**: must
- **Source**: request.md 受け入れ基準「artifact コピーの公開挙動が不変」, design.md D2

**GIVEN** copy-artifacts.ts が `src/core/artifact/` に移動した状態  
**WHEN** `copyRules`、`writeOutputTemplates`、`cleanupOutputTemplates`、`copyDraftUsage`、`rejectSymlink` を呼び出す  
**THEN** リファクタリング前と同じ動作（ファイルコピー・書き出し・クリーンアップ・シンボリックリンク検出の挙動が不変）

---

### TC-018: core/artifact/ の依存方向が architecture model に適合している

- **Category**: unit
- **Priority**: should
- **Source**: design.md D2「全て core→shared-kernel / core→leaf の下向き参照」

**GIVEN** `src/core/artifact/copy-artifacts.ts`  
**WHEN** import の方向を検査する  
**THEN**
- `util/` への参照（core→leaf、下向き）が存在する
- `prompts/`、`logger/`、`errors`、`templates/`、`state/` への参照は core→shared-kernel として適合
- 上向き参照（util→core 等）が存在しない

---

## TC-03 Group: arch-allowlist.ts の R4 エントリ削除

### TC-019: ARCH_ALLOWLIST に invariant B-4 のエントリが存在しない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-03 AC, design.md D3

**GIVEN** リファクタリング完了後の `tests/unit/architecture/arch-allowlist.ts`  
**WHEN** `ARCH_ALLOWLIST` 配列を静的に検査する  
**THEN** `invariant: "B-4"` を持つエントリが 0 件

---

### TC-020: ARCH_ALLOWLIST に tracking R4 のエントリが存在しない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-03 AC, design.md D3

**GIVEN** リファクタリング完了後の `tests/unit/architecture/arch-allowlist.ts`  
**WHEN** `ARCH_ALLOWLIST` 配列を静的に検査する  
**THEN** `tracking: "R4"` を持つエントリが 0 件（旧 6 件が全て削除済み）

---

### TC-021: 削除対象 6 エントリが全て除去されている

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-03

**GIVEN** リファクタリング完了後の `tests/unit/architecture/arch-allowlist.ts`  
**WHEN** ファイル内容を静的に検査する  
**THEN** 以下の組み合わせを持つエントリがいずれも存在しない:
- `src/util/copy-artifacts.ts` + `"../errors.js"`
- `src/util/copy-artifacts.ts` + `"../logger/stdout.js"`
- `src/util/copy-artifacts.ts` + `"../prompts/rules.js"`
- `src/util/copy-artifacts.ts` + `"../state/schema.js"`
- `src/util/copy-artifacts.ts` + `"../templates/step-output-templates.js"`
- `src/util/slugify.ts` + `"../core/request/store.js"`

---

### TC-022: アーキテクチャテストスイートが green

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md T-03 AC, request.md 受け入れ基準

**GIVEN** allowlist の R4 エントリ全件削除後  
**WHEN** `bun run test tests/unit/architecture/` を実行する  
**THEN** 全テストケースが pass（exit code 0）

---

### TC-023: B-4 enforcement が util/ の上向き import を ratchet する

- **Category**: manual
- **Priority**: should
- **Source**: request.md「ratchet が fix の完全性を機械強制」, design.md D3

**GIVEN** allowlist の R4 エントリが削除され、B-4 arch test が active な状態  
**WHEN** `src/util/` 配下に仮に他 `src/` モジュールへの import が追加された場合  
**THEN** `bun run test tests/unit/architecture/` が red になり、違反が自動検知される

---

## TC-04 Group: 全体検証

### TC-024: bun run build が green

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md T-04 AC, request.md 受け入れ基準

**GIVEN** 全リファクタリング（T-01・T-02・T-03）が完了した状態  
**WHEN** `bun run build` を実行する  
**THEN** exit code が 0（ビルドエラーなし）

---

### TC-025: bun run typecheck が green

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md T-04 AC

**GIVEN** 全リファクタリングが完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code が 0（型エラーなし、import path 修正漏れなし）

---

### TC-026: bun run lint が green

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md T-04 AC

**GIVEN** 全リファクタリングが完了した状態  
**WHEN** `bun run lint` を実行する  
**THEN** exit code が 0（lint エラーなし）

---

### TC-027: bun run test が green

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md T-04 AC, request.md 受け入れ基準

**GIVEN** 全リファクタリングが完了した状態  
**WHEN** `bun run test` を実行する  
**THEN** exit code が 0（全テストスイートが pass）

---

### TC-028: copy-artifacts の旧 util パス参照がプロジェクト全体に残っていない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-02, design.md D2「import path を 1 箇所でも漏らすと build break」

**GIVEN** 全リファクタリングが完了した状態  
**WHEN** プロジェクト全体のソースファイルを検索する  
**THEN** `util/copy-artifacts.js` または `util/copy-artifacts.ts` を参照する import 文が 0 件（テストファイル含む）

---

### TC-029: src/core/artifact/ ディレクトリが存在する

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md T-02, design.md D2「`core/artifact/` は新ディレクトリ」

**GIVEN** リファクタリング完了後  
**WHEN** ディレクトリ構造を検査する  
**THEN** `src/core/artifact/` ディレクトリが存在し、`copy-artifacts.ts` を含む

---

## Result

```yaml
result: completed
total: 29
automated: 28
manual: 1
must: 26
should: 3
could: 0
blocked_reasons: []
```
