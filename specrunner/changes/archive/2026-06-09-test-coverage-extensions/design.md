# Design: test-coverage-extensions

## Context

test-coverage phase（`src/core/verification/test-coverage.ts`）は must TC ID が test code 内に
grep で出現するかを機械的に検証するゲートである。grep 対象の収集は `collectProjectTestFiles(rootDir)`
が担い、プロジェクトルートから再帰走査して **ファイル名の拡張子フィルタ**に合致する test ファイルを集める。

現状（`test-coverage.ts:48-51`）のフィルタは inline の OR 条件でハードコードされている:

```
entry.isFile() &&
(entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts"))
```

このため `*.test.ts` / `*.spec.ts` の 2 拡張子しか収集されない。JavaScript プロジェクト
（`*.test.js` / `*.spec.js`）、React/JSX プロジェクト（`*.test.tsx` / `*.spec.tsx` / `*.test.jsx` /
`*.spec.jsx`）、ESM 明示拡張子（`*.test.mts` / `*.spec.mts` / `*.test.mjs` / `*.spec.mjs`）の
test ファイルは収集されず、これらのエコシステムでは must TC ID が一つも見つからないため
coverage check が 0/0（あるいは全件 missing 手前の収集ゼロ）で素通り、または常時 failed となり、
ゲートが本来の働きをしない。

`collectProjectTestFiles` の走査ロジック（`readdir({ withFileTypes: true })` 再帰、
`node_modules` / `dist` / `.git` の枝刈り、存在しないディレクトリで空配列）は本変更で不変であり、
変更点は「どの拡張子を test ファイルとみなすか」の判定のみである。

制約:
- minimal-deps North Star — 新規依存（glob ライブラリ等）を追加しない。
- `test-coverage.ts` は `bun:*` / `Bun.*` を使わず `node:fs/promises` / `node:path` のみ使用する（既存規律）。
- 後方互換: `*.test.ts` / `*.spec.ts` を引き続き収集する。spec-runner 自身の dogfooding test
  （`tests/**/*.test.ts`）の TC ID 検証が壊れない。
- config 化は不要（architect 評価済み）。JS/TS エコシステム内の拡張子は実質固定であり、
  非 JS/TS（`_test.go` 等）は TC ID grep のフォーマットがそもそも異なるため別の仕組みを要する。

## Goals / Non-Goals

**Goals**:

- `collectProjectTestFiles()` の拡張子フィルタに以下 10 拡張子を追加する:
  `.test.js` / `.spec.js` / `.test.tsx` / `.spec.tsx` / `.test.jsx` / `.spec.jsx` /
  `.test.mts` / `.spec.mts` / `.test.mjs` / `.spec.mjs`。
- 既存の `.test.ts` / `.spec.ts` を合わせた全 12 拡張子を、ハードコードの**定数配列**として定義し、
  `collectProjectTestFiles()` がそれを参照する形にする。
- inline の `endsWith` OR 判定を、定数配列に対する `some()` 判定へ置き換える。
- 後方互換: `*.test.ts` / `*.spec.ts` の収集挙動を維持する。

**Non-Goals**:

- 非 JS/TS の test file 拡張子（`_test.go` / `_test.py` / `_test.rs` 等）。TC ID の grep 対象として
  フォーマットが異なるため、JS/TS 拡張内に留める。
- `SKIP_DIRS` の拡張（`build` / `out` / `target` 等の追加）— 別件。
- 拡張子リストの config 化（`.specrunner/config.json` への設定追加）— architect 評価で不要と判断済み。
- 走査ロジック（再帰・枝刈り・resilience）の変更 — 収集対象拡張子の判定のみを変更する。
- `extractMustTcIds` / assertion 存在ゲート（`ASSERTION_RE`）/ `runTestCoveragePhase` の制御フローの変更。
- `phases.ts` / `runner.ts` / プロンプト（`implementer-system.ts` / `test-case-gen-system.ts`）の変更。

## Decisions

### D1: 拡張子を module スコープの定数配列で持ち、`some()` で判定する

`test-coverage.ts` の module スコープに以下の定数を定義し、`collectProjectTestFiles()` 内の inline OR 判定を
配列の `some()` 判定へ置き換える:

```
const TEST_FILE_EXTENSIONS = [
  ".test.ts", ".spec.ts",
  ".test.js", ".spec.js",
  ".test.tsx", ".spec.tsx",
  ".test.jsx", ".spec.jsx",
  ".test.mts", ".spec.mts",
  ".test.mjs", ".spec.mjs",
] as const;
```

判定は `TEST_FILE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))` とする。

- **Rationale**: 拡張子の集合が「単一の真実の場所（single source of truth）」に集約され、追加・確認・
  test が容易になる。要件 2（定数配列として定義し `collectProjectTestFiles()` が参照する）および
  architect 評価済みの設計判断（定数配列 + `some()`）と一致する。`as const` で readonly tuple とし、
  意図しない実行時変更を防ぐ。
- **Alternatives considered**:
  - inline OR を 12 連結に拡張 → 棄却。可読性が低く、定数化要件（受け入れ基準・要件 2）を満たさない。
  - 正規表現 `/\.(test|spec)\.(ts|js|tsx|jsx|mts|mjs)$/` でマッチ → 棄却。要件は「拡張子リストを定数配列で持つ」
    ことを明示しており、正規表現は受け入れ基準（拡張子リストが定数として定義されている）と乖離する。
    また将来の拡張子増減が配列追記で完結する方が見通しが良い。
  - config 化（`.specrunner/config.json`）→ 棄却（Non-Goal、architect 評価で不要）。

### D2: 定数は module スコープ（非 export）で定義する

`TEST_FILE_EXTENSIONS` は `SKIP_DIRS`（既存の module スコープ定数）と同列に置き、export しない。

- **Rationale**: 既存 `SKIP_DIRS` の配置・可視性に倣い一貫性を保つ。収集判定は `collectProjectTestFiles()`
  に閉じており、外部から定数を参照する必要がない。public surface を最小に保つ（minimal-deps の精神に整合）。
- **Alternatives considered**:
  - 定数を export して test から直接参照 → 棄却。拡張子網羅の検証は `collectProjectTestFiles()` の
    実挙動（各拡張子のファイルが収集される）を通して行う方が、内部表現に依存せず堅牢。

### D3: 後方互換は配列が既存 2 拡張子を含むことで担保する

新フィルタ配列は `.test.ts` / `.spec.ts` を先頭に含むため、既存挙動の superset となる。
既存 unit test 群（fixture を `*.test.ts` / `*.spec.ts` で書く TC-001〜TC-031 系および faithfulness gate）は
無改変で green を維持する。

- **Rationale**: 破壊的でない拡張であることを設計レベルで保証する。収集対象が増えるのみで、
  既存の収集対象が外れることはない。

## Risks / Trade-offs

- [Risk: 新拡張子の source ファイルが TC ID 文字列を含み false "found" になる] → Mitigation: フィルタは
  `*.test.*` / `*.spec.*` の test 命名規約に限定されており、通常の source（`.ts` / `.tsx` 等）は対象外。
  既存と同じ「test ファイル命名規約に絞る」方針を維持しており、誤検出リスクは現状から増えない。
- [Risk: 拡張子の網羅が将来の命名規約（例: `.test.cts` / `.spec.cts`）に追従しない] → Mitigation:
  定数配列に集約したことで追加は 1 行追記で済む。本変更は要件の 12 拡張子に限定する（CTS は要件外）。
- [Trade-off: `.test.mts` 等で `.test.ts` の suffix 包含関係に見えるが、`endsWith` は文字列末尾完全一致のため
  `foo.test.mts` は `.test.ts` に一致しない（`.mts` ≠ `.ts` の前に `m` がある）] → 各拡張子は独立に判定され
  誤包含は起きない。`some()` でいずれか 1 つに一致すれば収集される。

## Open Questions

- なし。要件・スコープ・設計判断（定数配列 + `some()`、config 化不要）は architect 評価済みで確定している。
