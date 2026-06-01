# Design: util-leaf-purify

## Context

`util/` は architecture/model.md §4 B-4 で leaf 層として定義されており、他の `src/` モジュールを import してはならない。現在 2 ファイルが違反している:

1. **`util/slugify.ts`** — `core/request/store` の `checkSlugCollision` を re-export（util→core の上向き参照）。caller は `tests/unit/util/slugify.test.ts` のみ（プロダクションコードは全て `core/request/store` から直接 import 済み）。
2. **`util/copy-artifacts.ts`** — `prompts`/`logger`/`errors`/`templates`/`state` を import。5 つの上向き依存。importer は `core/step/executor.ts`、`core/runtime/local.ts`、`core/runtime/managed.ts`、および 2 つのテストファイル。

`arch-allowlist.ts` に R4 tracking で 6 件のエントリが凍結されている。

## Goals / Non-Goals

**Goals**:

- `src/util/` から他の `src/` モジュールへの import を全て除去し B-4 invariant を満たす
- `arch-allowlist.ts` の R4 エントリ 6 件を削除し ratchet enforcement を有効化する
- 公開挙動は不変（移動と import 経路変更のみ）

**Non-Goals**:

- R1 / R2 / R3 等、他の burn-down の解消
- `util/` 内の slugify / copy-artifacts 以外のファイルへの変更
- 振る舞い変更・API 変更

## Decisions

### D1: slugify.ts の re-export 除去

`util/slugify.ts` line 6 の `export { checkSlugCollision } from "../core/request/store.js"` を削除する。唯一の consumer である `tests/unit/util/slugify.test.ts` の import 元を `../../../src/core/request/store.js` に変更する。

**Rationale**: re-export は便宜的なもので、プロダクションコードの caller（`core/request/generator.ts`, `core/command/request-new.ts`）は既に `core/request/store` から直接 import しているため影響は test のみ。単純除去が最も安全。

**Alternatives considered**:
- `checkSlugCollision` を util に実装を移す → store の内部実装（fs 操作、パス解決）に依存するため不自然
- re-export を残して allowlist で凍結継続 → ratchet の意味がない

### D2: copy-artifacts.ts を `core/artifact/` へ移動

`src/util/copy-artifacts.ts` → `src/core/artifact/copy-artifacts.ts` に移動する。

移動後の import 関係:
- `core/artifact/copy-artifacts.ts` → `../../prompts/rules.js`（shared-kernel → OK）
- `core/artifact/copy-artifacts.ts` → `../../logger/stdout.js`（shared-kernel → OK）
- `core/artifact/copy-artifacts.ts` → `../../errors.js`（shared-kernel → OK）
- `core/artifact/copy-artifacts.ts` → `../../templates/step-output-templates.js`（shared-kernel → OK）
- `core/artifact/copy-artifacts.ts` → `../../state/schema.js`（shared-kernel → OK）
- `core/artifact/copy-artifacts.ts` → `../../util/spawn.js`（leaf → OK）
- `core/artifact/copy-artifacts.ts` → `../../util/paths.js`（leaf → OK）

全て core→shared-kernel / core→leaf の下向き参照であり、architecture model に適合する。

**Rationale**: `copy-artifacts` の関数群（copyRules, writeOutputTemplates, cleanupOutputTemplates, copyDraftUsage, rejectSymlink）は全て pipeline の成果物配置ロジックであり、prompts / state / templates に依存する domain 寄りの処理。`core/artifact/` は既存の core 配下カテゴリ（`core/step/`, `core/runtime/`, `core/pipeline/`）と同粒度で、artifact 管理の責務を明示する。

**Alternatives considered**:
- `core/runtime/` に移動 → executor.ts からも使われるため runtime に閉じない
- `core/step/` に移動 → runtime からも使われるため step に閉じない
- `rejectSymlink` だけ util に残す → 現状 rejectSymlink は常に copy-artifacts の他関数と共に import されており、分離の実益がない。また `SpecRunnerError` に依存するため util に残すと B-4 違反が残る

### D3: arch-allowlist.ts の R4 エントリ全件削除

B-4 (invariant) tracking R4 のエントリ 6 件を `ARCH_ALLOWLIST` 配列から削除する。削除後は B-4 arch test が util→src 参照を自動検出するため、半端な修正は compile / test で検知される。

## Risks / Trade-offs

- [Risk] copy-artifacts の移動先 import path を 1 箇所でも漏らすと build break → **Mitigation**: `bun run typecheck` で全参照を機械検証。allowlist 削除で arch test が enforcement。
- [Risk] テスト内の import path 修正漏れ → **Mitigation**: `bun run test` で全テストが実行される。
- [Trade-off] `core/artifact/` は新ディレクトリ → ディレクトリが増えるが、既存の core 配下パターンと一貫しており発見容易性は問題ない。

## Open Questions

なし。全判断が architect 評価済み。
