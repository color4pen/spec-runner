# verification を language-agnostic な commands 配列に抽象化 + spec-runner dogfood で eslint 整備

## Meta

- **type**: spec-change
- **slug**: lint-mechanical-verification
- **base-branch**: main
- **adr**: true

## 背景

PR #402 (silent-exit-keepalive) の事後レビューで、reviewer (= sonnet) が見逃した「脇の甘さ」を 3 つ観察した:

- **F-02**: dead code (= 常に false で呼び出し側でも使われない変数) を残したまま approved
- **F-03**: 意味の無い literal-only assertion (= `expect(REDIRECT_LIMIT).toBe(3)` のような定数と自身の比較) を残したまま approved
- F-01: 設計と実装の乖離 doc 追随漏れ (= 別軸、本 request 対象外)

= 「sonnet model の脇の甘さ」と当初は捉えたが、より構造的に見ると:

- F-02 / F-03 は **LLM に判断させる必要が無い**、機械的に検出可能
- spec-runner repo に **lint が無い** ことが真因 = LLM の責任ではなく **規律の機械化不足**
- [[feedback_llm_uncertainty_principle]] そのもの (= 「判断する場面を消せ」)

### 実機検証で炙り出した既存違反

`eslint + typescript-eslint recommended` を spec-runner repo に一時設定して `src/` に実行:

```
✖ 11 problems (0 errors, 11 warnings)
```

| 種別 | 件数 |
|---|---|
| `@typescript-eslint/no-unused-vars` (= dead import / unused var) | 9 |
| `prefer-const` | 1 |
| unused eslint-disable directive | 1 |
| `@typescript-eslint/no-explicit-any` | 0 (= 既存品質高い) |

具体的な該当 file (= 既に積み重なった dead code):

```
src/cli/job-show.ts                    SpecRunnerError + ERROR_CODES 未使用 import
src/cli/ps.ts                          JobStatus 未使用 import
src/core/command/pipeline-run.ts       path 未使用 import
src/core/command/runner.ts             verbose 変数 未使用
src/core/event/event-bus.ts            redundant eslint-disable
src/core/finish/derive-usage.ts        readUsageFile 未使用 import
src/core/finish/orchestrator.ts        fetchPrViewWithRetry 未使用 import
src/core/finish/spec-merge.ts          reqs を const に
src/prompts/design-system.ts           changeFolderPath 未使用 import
src/store/job-state-store.ts           StepOutcome 未使用 import
```

### 加えて発見した CLI 構造的制約

spec-runner CLI の verification step は **`package.json` script を `bun run <name>` で実行する造り** (= `src/core/verification/phases.ts` の `PHASE_SCRIPTS`):

```typescript
PhaseName = "build" | "typecheck" | "test" | "lint" | "security" | "test-coverage"
PHASE_SCRIPTS: Record<ScriptPhaseName, string> = { build: "build", typecheck: "typecheck", ... }
```

= **Node マター固定**、Python / Go / Rust project では機能しない。spec-runner を他言語で dogfood するには verification の language-agnostic 化が前提。

## 要件

### 1. verification の `commands` 配列抽象化 (= language-agnostic 化)

`<repo-root>/.specrunner/config.json` (= project local) で **任意の command 列**を指定可能にする:

```jsonc
{
  "verification": {
    "commands": [
      "ruff check",                            // 文字列 OK
      { "run": "pytest -v" },                  // object, name 省略 OK
      { "name": "type", "run": "mypy" }        // object + name (= 失敗時に label 表示)
    ]
  }
}
```

**schema**:

- type: `(string | { name?: string; run: string })[]`
- 内部 normalize: `{ name: string | undefined; run: string }` の配列に統一
- 実行: 配列順に sequential 実行、fail-fast (= 1 件失敗で残り skip)
- **実行モデル**: 各 command 文字列は **`sh -c <command>`** 経由で実行する (= shell split、パイプ / リダイレクト / glob / 環境変数展開を使用可能、`"ruff check && mypy"` のような連結 OK)。Windows 環境は本 request 対象外 (= POSIX shell 前提)
- failure output: `name` があれば「`Step '<name>' failed`」、無ければ command 自体を表示
- exit code 0 → passed、それ以外 → failed (= build-fixer に倒れる経路は既存と同じ)

**Backward compatibility**:

- `verification.commands` 未定義時は **現状の phase 検出 fallback** (= `package.json` の `build / typecheck / test / lint / security` script を `bun run` で順次実行)
- 既存 spec-runner dogfood (= TS / Bun project) は config 未設定でも regression なし

**廃止予定 (= 将来別 request)**:

- 旧 `PhaseName` / `PHASE_SCRIPTS` の固定 phase 概念は本 request 後も internal 互換 fallback として残す
- 完全削除は次回別 request で議論 (= 段階的 deprecation)

### 2. spec-runner dogfood で eslint 整備

spec-runner repo (= 本 project 自身) に eslint を追加し、verification pipeline で動かす:

- **依存追加**: `devDependencies` に追加 (= flat config 要件):
  - `eslint@^9` (= flat config を default にした v9+)
  - `typescript-eslint@^8` (= flat config 形式の `configs.recommended` を export する v8+)
  - `@typescript-eslint/parser@^8` (= 同上、parser 単体は通常 typescript-eslint パッケージ経由で十分だが明示)
- **設定 file**: `eslint.config.js` (= flat config) を新規作成
  - base: `typescript-eslint.configs.recommended`
  - 追加 rule:
    - `@typescript-eslint/no-unused-vars`: warn (= `^_` prefix で intentional ignore)
    - `@typescript-eslint/no-explicit-any`: warn
    - `@typescript-eslint/no-unused-expressions`: warn
    - `prefer-const`: warn
    - `no-unreachable`: warn
    - `no-empty`: warn
    - `no-constant-condition`: warn
  - ignores: `dist/**`, `node_modules/**`, `tests/**`, `**/*.test.ts`, `**/__tests__/**` (= test 系は別軸、本 request の Phase 2 候補)
- **package.json script**: `"lint": "eslint ./src --max-warnings 0"` (= warning も fail させて strict)
- **project local config**: `<repo-root>/.specrunner/config.json` の `verification.commands` に `"bun run lint"` を追加 (= dogfood の verify pipeline で lint が走るように)

### 3. 既存の 11 件 dead code 修正

empirical 検証で炙り出された 11 件を本 request の中で修正:

- `bunx eslint ./src --fix` で auto fix できる範囲 (= 10 件) を一括
- redundant eslint-disable directive 1 件は手動削除
- `bun run typecheck && bun run test` で regression なし確認

## スコープ外

- **他言語 project での dogfood** (= Python / Go / Rust の verify pipeline 整備) — 本 request は **CLI 抽象化 + TS dogfood** まで、他言語適用は将来別 request
- **Phase 2 custom rule** (= test isolation / literal-only assertion / SpecRunnerError 強制) — 本 request は標準 rule で取れる範囲 (= Phase 1)、custom rule 開発は別 request
- **layer boundary lint (= core / adapter import 規律)** — #370 で別途扱う
- **`process.exit` 経路制限 eslint rule** — PR #402 で確立した規律の機械化、別 request
- **`as unknown as` 制限** — #376 と関連、別 request
- **旧 `PhaseName` / `PHASE_SCRIPTS` の完全削除** — 段階的 deprecation の最終段階は別 request
- **tests/ 配下への eslint 適用** — Phase 2 で custom rule 整備時に統合 (= literal-only assertion 等は test 系の典型問題)

## 受け入れ基準

- [ ] `<repo-root>/.specrunner/config.json` で `verification.commands` を設定可能、配列順に sequential 実行される
- [ ] command schema が `string | { name?: string; run: string }` の union 型として認識される (= validation 通過)
- [ ] `commands` 未定義時、現状の phase 検出 fallback で既存挙動と一致 (= regression なし)
- [ ] failure 時の出力で `name` あれば label 表示、無ければ command 文字列表示
- [ ] spec-runner repo の `eslint.config.js` で `bun run lint` が動き、**0 warnings / 0 errors** になっている
- [ ] 既存 11 件の dead code が解消されている (= empirical 検証時に炙り出した違反全消し)
- [ ] spec-runner repo の `.specrunner/config.json` で `verification.commands` に `"bun run lint"` が追加され、lint が verify pipeline で走る
- [ ] `bun run typecheck && bun run test` が green
- [ ] regression test: `verification.commands` の各 schema variant (= string / object with name / object without name) で normalize が正しく動く unit test
- [ ] regression test: 既存の phase 検出 fallback が `commands` 未定義時に発動する unit test
- [ ] doc 更新: 
  - `specrunner/project.md`: verification セクションに **`verification.commands` schema の説明** (= string / object union 型、`sh -c` 経由実行、fail-fast、未定義時 fallback) と **config 例** を追加
  - `README.md`: troubleshooting に「lint failure が出たら `bun run lint --fix` で auto fix、残り手動修正」程度の 1 段落追記

## architect 評価済みの設計判断

- **commands 配列を string | object の union 型で受ける**: 業界 standard (= GitHub Actions, pre-commit, just) と整合、シンプル設定と label 観測性の両立。yagni 違反だが TS union 型のコスト小で許容範囲
- **phase 概念を捨てる**: 当初 phase ラベルを保持する案 (= hybrid) を検討したが、agent は failure output で意味判断可能、phase 名と command の mismatch (= "lint phase に test command 入れる") の余地を消す方が筋いい
- **backward compat で旧 phase 検出を fallback として残す**: 段階的 deprecation で migration 摩擦を最小化、既存 spec-runner dogfood は config 変更不要で動く
- **eslint は recommended preset を基盤に**: 過剰な custom rule から始めず、標準 rule で取れる範囲 (= F-02 系統 = unused / dead code) を機械化。custom rule (= F-03 literal-only assertion 等) は Phase 2 で別 request
- **既存 11 件 dead code 修正を本 request に統合する理由**: lint 導入 + 既存違反修正は 1 PR で完結する自然なまとまり、別 PR にすると lint 導入時に CI が即 fail する manage コスト発生
- **`--max-warnings 0` で strict 化**: warning を許容すると蓄積する罠 ([[feedback_avoid_patchwork]] と同型)、最初から 0 強制で規律を保つ
- **dogfood 対象は `src/` のみ**: tests/ 配下は Phase 2 で custom rule 整備時に統合、本 request では scope を絞る
