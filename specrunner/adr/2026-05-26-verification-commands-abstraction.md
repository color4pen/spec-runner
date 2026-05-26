# verification runner の language-agnostic commands 配列抽象化と lint 機械化

**Date**: 2026-05-26
**Status**: accepted

## Context

spec-runner の verification runner は `src/core/verification/phases.ts` の `PHASE_SCRIPTS` で `bun run <phase>` を固定実行する設計だった。

```typescript
PhaseName = "build" | "typecheck" | "test" | "lint" | "security" | "test-coverage"
PHASE_SCRIPTS: Record<ScriptPhaseName, string> = { build: "build", typecheck: "typecheck", ... }
```

この設計には 2 つの構造的問題があった。

**問題 1 — language-agnostic でない**: Node / Bun エコシステム専用で、Python / Go / Rust project では `package.json` が存在しないため verification pipeline が機能しない。spec-runner を他言語プロジェクトで dogfood するには verification の抽象化が前提条件になっていた。

**問題 2 — LLM reviewer の判断負荷**: PR #402 (silent-exit-keepalive) の事後レビューで、reviewer が dead code（unused variable / unused import）を見逃した。これは LLM の問題ではなく、**機械的に検出可能な問題を LLM に判断させていた**規律の機械化不足（= [[feedback_llm_uncertainty_principle]]: 「判断する場面を消す」）。

実機検証で `eslint + typescript-eslint recommended` を一時適用したところ `src/` に 11 件の既存違反（unused import 9 件、prefer-const 1 件、redundant eslint-disable 1 件）が検出された。spec-runner repo に lint がなかったことが蓄積の原因。

## Decision

### D1: `verification.commands` 配列を project local config に追加

`<repo-root>/.specrunner/config.json` に `verification.commands` を追加し、任意の shell command 列を配列指定できるようにした。

```jsonc
{
  "verification": {
    "commands": [
      "ruff check",                            // string shorthand
      { "run": "pytest -v" },                  // object without name
      { "name": "type", "run": "mypy" }        // object with name label
    ]
  }
}
```

schema: `(string | { name?: string; run: string })[]`

内部では `{ name: string | undefined; run: string }` の正規化配列に統一する。

### D2: 実行モデル — `sh -c <command>`

各 command 文字列は `sh -c <command>` 経由で実行する（POSIX shell 前提、Windows は scope 外）。

shell split、パイプ / リダイレクト / glob / 環境変数展開が使用可能になる。`"ruff check && mypy"` のような連結や `"eslint ./src 2>&1 | head -50"` のようなパイプが書ける。既存の `spawnScript()` は `bun run <script>` に固定しているため、新経路は独立した `spawnCommand()` として実装した。

実行セマンティクス:
- 配列順に sequential 実行
- fail-fast: 最初の non-zero exit code で break し残りは `status: "skipped"` で記録
- exit code 0 → passed、non-zero → failed

### D3: failure output — name があれば label 表示

`name` があれば `Step '<name>' failed`、無ければ `Step '<command>' failed`。verification-result.md の Phase Results 表も同様に name → command の順で phase 列を埋める。commands 経路の fail-fast skip メッセージは "_(skipped — previous command failed)_"（phase fallback の "script not found" とは区別）。

### D4: backward compat — fallback 戦略で段階的 deprecation

`verification.commands` 未定義時は既存の phase 検出 fallback（`package.json` の `build / typecheck / test / lint / security` script を `bun run` で順次実行）を維持する。

`runVerification()` 冒頭で project local config を読み、`verification.commands` が定義されていれば commands 経路、未定義なら既存の phase 経路に分岐する。旧 `PhaseName` / `PHASE_SCRIPTS` の完全削除は別 request。

### D5: spec-runner repo に eslint を導入し verification pipeline で機械化

spec-runner 本体に `eslint@9` flat config + `typescript-eslint@8` recommended preset を導入した。

- `eslint.config.js`: `typescript-eslint.configs.recommended` を基盤に、`prefer-const` / `no-unreachable` / `no-empty` / `no-constant-condition` を追加
- `package.json script`: `"lint": "eslint ./src --max-warnings 0"`（warning 蓄積の罠を最初から封じる）
- `.specrunner/config.json` の `verification.commands` に `"bun run lint"` を追加し dogfood pipeline に統合

scope は `src/` のみ。`tests/` 配下は Phase 2（custom rule 整備時）に統合予定。

既存 11 件の dead code は lint 導入と同 PR で修正した（lint 導入後に CI が即 fail する管理コストを避けるため）。

## Alternatives Considered

### Alternative 1: phase label を温存した hybrid 設計

`commands` を追加しつつ既存 phase ラベル（`build` / `typecheck` 等）を温存する案。

- **Pros**: phase 名で semantics が明示できる
- **Cons**: agent は failure output から意味を判断できるため phase 名は不要。phase 名と command の mismatch（"lint phase に test command を入れる"）の余地を残す
- **Why not**: commands 配列に name field がある（`{ "name": "lint", "run": "eslint ./src" }`）ため、label 観測性は維持できる。phase 概念を捨てる方が命名の余地を消せる

### Alternative 2: string のみ（object 形式なし）

`commands` を `string[]` のみに制限する案。

- **Pros**: schema がシンプル
- **Cons**: 長い command が failure 時に全文表示されると可読性が悪い。label を付けられない
- **Why not**: `{ name?, run }` の object 形式は GitHub Actions / pre-commit / just 等の業界標準と整合。TS union 型のコストが小さいため許容

### Alternative 3: object のみ（name 必須）

`commands` の要素を `{ name: string; run: string }` に固定し、全 command に name を強制する案。

- **Pros**: failure 時に必ず意味のある label が表示される。"何が落ちたか" が常に明示される
- **Cons**: `"ruff check"` のようにコマンド名自体が自明な場合でも name を書かなければならない。設定の煩雑さが増す
- **Why not**: name を省略した場合は command 文字列そのものを label として使えば十分。union 型で string shorthand と `{ name?, run }` の両方を受けることで設定コストを最小化しつつ label 観測性を確保できる

### Alternative 5: phase 検出 fallback を即廃止

`commands` 未定義時にエラーとして config 必須にする案。

- **Pros**: 設計が単純になる
- **Cons**: 既存の spec-runner dogfood（TS / Bun project）が config 変更なしに regression する。migration 摩擦が高い
- **Why not**: 段階的 deprecation で migration コストを最小化する。既存 dogfood は config 変更不要で動く

### Alternative 6: eslint を recommendation に留め CI では動かさない

lint 設定は入れるが verification pipeline には組み込まない案。

- **Pros**: pipeline に lint を追加しても既存 workflow が変わらない
- **Cons**: 「機械化できるのに機械化しない」は LLM uncertainty principle の違反。蓄積した 11 件の再発が防げない
- **Why not**: `--max-warnings 0` で strict 化し verification pipeline に組み込むことで、機械的検出可能な問題を LLM に判断させる場面を完全に消す

## Consequences

### Positive

- verification pipeline が任意の shell command を受け入れる language-agnostic な構造になり、Python / Go / Rust project での dogfood が技術的に可能になった
- LLM reviewer が dead code / unused import を見逃すケースが機械的に排除される（`@typescript-eslint/no-unused-vars` + `--max-warnings 0`）
- `name` field による failure label 表示で、長い command 文字列を見ずに「何が落ちたか」が即座にわかる
- 既存 spec-runner dogfood（TS / Bun project）は config 変更不要で regression なし

### Negative

- `sh -c` 経由の shell split により、command 文字列に含まれるシェルメタ文字（スペース / `$` 等）のエスケープ責任が設定者側に移る
- `verification.commands` と旧 `PHASE_SCRIPTS` が並存する過渡期間が発生する（完全削除は別 request）
- POSIX shell 前提のため Windows 環境では `sh -c` が動作しない（明示的 scope 外）

### Known Debt

- **他言語 project での dogfood**: 本 ADR は CLI 抽象化 + TS dogfood まで。Python / Go / Rust の verify pipeline 整備は別 request
- **Phase 2 custom eslint rule**: literal-only assertion / SpecRunnerError 強制 / test isolation は標準 rule の範囲外、別 request
- **旧 `PhaseName` / `PHASE_SCRIPTS` の完全削除**: 段階的 deprecation の最終段階、別 request
- **`tests/` 配下への eslint 適用**: Phase 2 で custom rule 整備時に統合

## References

- Request: `specrunner/changes/lint-mechanical-verification/request.md`
- Design: `specrunner/changes/lint-mechanical-verification/design.md`
- Related: `specrunner/adr/2026-05-26-project-config-overlay.md`（project local config の 2 層化基盤）
- Related: `specrunner/adr/2026-05-19-verification-tc-coverage.md`（verification test coverage 設計）
- Related: `specrunner/adr/2026-04-30-verification-cli-resident-step.md`（verification runner の初期設計）
