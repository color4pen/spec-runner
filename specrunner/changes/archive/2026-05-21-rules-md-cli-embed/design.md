# Design: rules-md-cli-embed

## Overview

`specrunner/rules.md` の source of truth を project repo のファイルから CLI 内部の string constant に移す。`src/prompts/rules.ts` に本文を template literal で export し、`copyRulesToChangeFolder` を `fs.cp` → `fs.writeFile` に書き換える。

## Current State

```
specrunner/rules.md          ← human-editable, source of truth
      ↓ fs.cp (copy-artifacts.ts:29)
specrunner/changes/<slug>/rules.md   ← agent が Read tool で参照
```

- `src/util/paths.ts` が `rulesSourcePath()` (= `"specrunner/rules.md"`) と `rulesDestPath(slug)` の 2 export を持つ
- `src/util/copy-artifacts.ts` の `copyRulesToChangeFolder` が `fs.access` → `fs.cp` で disk copy、ENOENT 時は warning
- `tests/unit/rules-md.test.ts` が `fs.readFile` で disk から content を検証
- `tests/unit/core/runtime/local.test.ts` の TC-LR-014 / TC-LR-017 が copy / ENOENT を test

## Target State

```
src/prompts/rules.ts          ← string constant, source of truth
      ↓ fs.writeFile (copy-artifacts.ts)
specrunner/changes/<slug>/rules.md   ← agent が Read tool で参照（互換）
```

- `specrunner/rules.md` は repo から削除
- `rulesSourcePath()` は削除、`rulesDestPath(slug)` は残存
- `copyRulesToChangeFolder` は spawnFn (git add) のみ外部依存、disk read なし
- ENOENT 経路は unreachable（string constant なので）→ TC-LR-017 削除

## Design Decisions

### D1: embed 方式 — template literal

**選択肢**:
1. Template literal export (`export const RULES_MD_CONTENT = \`...\``)
2. Bun `import ... with { type: 'text' }` (file を bundle 時に string 化)
3. Build step で const 化

**決定**: 選択肢 1 — template literal

**理由**:
- rules.md は ~150 行。string constant として管理可能なサイズ
- Build step 不要、import 方式は Bun 固有で tsc typecheck と干渉リスクあり
- `src/prompts/fragments.ts` の `COMMIT_DISCIPLINE` / `PIPELINE_RULES` と同パターン（= 既存慣例に合致）

### D2: copyRulesToChangeFolder の signature

**決定**: signature は変更しない（`repoRoot, slug, spawnFn`）。内部だけ `fs.cp` → `fs.writeFile` に置換。

**理由**: caller 2 箇所（`local.ts:223`, `managed.ts:113`）の変更を最小化。`repoRoot` は dest path 構築に引き続き必要。

### D3: ENOENT 経路の扱い

**決定**: try-catch + warning の ENOENT guard を削除。string constant を writeFile するだけなので disk read 起因の ENOENT は起きない。

**理由**: unreachable code を残すと test coverage が不必要に下がり、読者を誤解させる。

### D4: テスト方式

**決定**: `tests/unit/rules-md.test.ts` の disk read (`fs.readFile`) を `import { RULES_MD_CONTENT } from "../../src/prompts/rules.js"` に置換。file existence test は削除し、content assertion のみ残す。

## Affected Specs

| Capability | Impact |
|---|---|
| prompt-fragment-registry | MODIFIED: `rules.md の存在と構造的保証` requirement を CLI 内部 string constant ベースに更新 |

## Files Changed

| File | Action | Summary |
|---|---|---|
| `src/prompts/rules.ts` | ADD | rules.md 本文を string constant export |
| `src/util/copy-artifacts.ts` | MODIFY | `fs.cp` → `fs.writeFile` from string constant |
| `src/util/paths.ts` | MODIFY | `rulesSourcePath` export 削除 |
| `specrunner/rules.md` | DELETE | source of truth を CLI に移管 |
| `tests/unit/rules-md.test.ts` | MODIFY | disk read → string constant import |
| `tests/unit/core/runtime/local.test.ts` | MODIFY | TC-LR-014 追従、TC-LR-017 削除 |
