# Tasks: util-leaf-purify

## T-01: slugify.ts の re-export 除去

- [x] `src/util/slugify.ts` の line 6 `export { checkSlugCollision } from "../core/request/store.js";` を削除する
- [x] `tests/unit/util/slugify.test.ts` の import を `"../../../src/util/slugify.js"` から `checkSlugCollision` を除去し、`checkSlugCollision` を `"../../../src/core/request/store.js"` から import するように変更する

**Acceptance Criteria**:
- `src/util/slugify.ts` に `core/` への参照が存在しない
- `bun run typecheck` が green（test 側の import 修正が正しいこと）
- `bun run test tests/unit/util/slugify.test.ts` が green

## T-02: copy-artifacts.ts を core/artifact/ へ移動

- [x] `src/core/artifact/` ディレクトリを作成する
- [x] `src/util/copy-artifacts.ts` を `src/core/artifact/copy-artifacts.ts` に移動する（git mv）
- [x] 移動後のファイル内 import path を修正する:
  - `"./spawn.js"` → `"../../util/spawn.js"`
  - `"./paths.js"` → `"../../util/paths.js"`
  - `"../prompts/rules.js"` → `"../../prompts/rules.js"`
  - `"../logger/stdout.js"` → `"../../logger/stdout.js"`
  - `"../errors.js"` → `"../../errors.js"`
  - `"../templates/step-output-templates.js"` → `"../../templates/step-output-templates.js"`
  - `"../state/schema.js"` → `"../../state/schema.js"`
- [x] importer の import path を更新する:
  - `src/core/step/executor.ts`: `"../../util/copy-artifacts.js"` → `"../artifact/copy-artifacts.js"`
  - `src/core/runtime/local.ts`: `"../../util/copy-artifacts.js"` → `"../artifact/copy-artifacts.js"`
  - `src/core/runtime/managed.ts`: `"../../util/copy-artifacts.js"` → `"../artifact/copy-artifacts.js"`
- [x] テストファイルの import path を更新する:
  - `tests/util/copy-artifacts.test.ts`: `"../../src/util/copy-artifacts.js"` → `"../../src/core/artifact/copy-artifacts.js"`
  - `tests/unit/util/copy-artifacts.test.ts`: `"../../../src/util/copy-artifacts.js"` → `"../../../src/core/artifact/copy-artifacts.js"`

**Acceptance Criteria**:
- `src/util/copy-artifacts.ts` が存在しない
- `src/core/artifact/copy-artifacts.ts` が存在し、全 export が維持されている
- `src/util/` に他の `src/` モジュールへの import が存在しない
- `bun run typecheck` が green
- `bun run test tests/util/copy-artifacts.test.ts tests/unit/util/copy-artifacts.test.ts` が green

## T-03: arch-allowlist.ts の R4 エントリ削除

- [x] `tests/unit/architecture/arch-allowlist.ts` から B-4 invariant / R4 tracking のエントリ 6 件を削除する（line 383〜443 付近の `// ── B-4` セクション全体）:
  - `src/util/copy-artifacts.ts` + `"../errors.js"`
  - `src/util/copy-artifacts.ts` + `"../logger/stdout.js"`
  - `src/util/copy-artifacts.ts` + `"../prompts/rules.js"`
  - `src/util/copy-artifacts.ts` + `"../state/schema.js"`
  - `src/util/copy-artifacts.ts` + `"../templates/step-output-templates.js"`
  - `src/util/slugify.ts` + `"../core/request/store.js"`

**Acceptance Criteria**:
- `ARCH_ALLOWLIST` 配列に `invariant: "B-4"` のエントリが存在しない
- `ARCH_ALLOWLIST` 配列に `tracking: "R4"` のエントリが存在しない
- `bun run test tests/unit/architecture/` が green（enforcement が ratchet 解除後も通ること）

## T-04: 全体検証

- [x] `bun run build && bun run typecheck && bun run lint && bun run test` を実行し全 green を確認する

**Acceptance Criteria**:
- 4 コマンド全てが exit code 0
