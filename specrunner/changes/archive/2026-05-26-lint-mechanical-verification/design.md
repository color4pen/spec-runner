## Context

spec-runner repo に lint が無い。PR #402 の事後レビューで reviewer (sonnet) が見逃した dead code (F-02) / literal-only assertion (F-03) は、LLM に判断させる必要が無い機械検出可能な問題。真因は「規律の機械化不足」であり LLM uncertainty principle（= 判断する場面を消せ）に該当する。

実機検証で `eslint + typescript-eslint recommended` を一時適用した結果、`src/` に 11 件の既存違反を確認（unused import 9 件、prefer-const 1 件、redundant eslint-disable 1 件）。

加えて、verification runner が `package.json` の script を `bun run <name>` で実行する固定構造（`PHASE_SCRIPTS`）であり、Python / Go / Rust project では verification pipeline が機能しない。spec-runner を他言語 project で dogfood するには verification の language-agnostic 化が前提。

本 change は 2 軸を同時に処理する:

1. **verification の commands 配列抽象化**: project local config に `verification.commands` を追加し、任意の shell command 列を sequential 実行可能にする
2. **spec-runner dogfood で eslint 整備**: 本 repo に eslint を導入し、既存 11 件の dead code を修正し、verification pipeline に lint を組み込む

stakeholders:

- **作者**: lint 導入で LLM reviewer の判断負荷を下げ、reviewer が見逃す構造的問題を機械的に検出可能にする
- **将来の利用者**: 他言語 project で verification pipeline を使えるようにする

## Goals / Non-Goals

**Goals:**

- `<repo-root>/.specrunner/config.json` の `verification.commands` で任意の command 列を配列指定し、sequential / fail-fast で実行する
- `string | { name?: string; run: string }` の union schema で シンプル設定と label 観測性を両立する
- `commands` 未定義時は既存の phase 検出 fallback（`package.json` script → `bun run`）で regression なし
- spec-runner repo に `eslint@9` + `typescript-eslint@8` flat config を導入し `bun run lint` で 0 warnings / 0 errors を達成する
- 既存 11 件の dead code を修正する
- `.specrunner/config.json` の `verification.commands` に `"bun run lint"` を追加し dogfood pipeline に lint を統合する

**Non-Goals:**

- 他言語 project での dogfood（Python / Go / Rust の verify pipeline 整備）
- Phase 2 custom eslint rule（literal-only assertion / SpecRunnerError 強制 / test isolation）
- layer boundary lint（core / adapter import 規律）— #370 で別途
- `process.exit` 経路制限 rule — 別 request
- `as unknown as` 制限 — #376 と関連、別 request
- 旧 `PhaseName` / `PHASE_SCRIPTS` の完全削除 — 段階的 deprecation の最終段階は別 request
- `tests/` 配下への eslint 適用 — Phase 2 で custom rule 整備時に統合
- Windows 環境対応 — POSIX shell 前提

## Decisions

### D1: `verification.commands` の schema design

**Decision**: `verification.commands` は `(string | { name?: string; run: string })[]` の配列型。

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

内部では `{ name: string | undefined; run: string }` の正規化配列に統一する。

**Rationale**: GitHub Actions / pre-commit / just 等の業界 standard と整合。string shorthand でシンプル設定、object 形式で failure 時の label 観測性を確保。TS union 型のコストが小さいため yagni 許容範囲。

**Alternatives considered**:

- **A. string のみ**: 名前付き label が無く failure 時に「何が落ちたか」が command 文字列全体の表示に依存。長い command だと可読性が悪い
- **B. object のみ（name 必須）**: 全 command に name 強制は設定の煩雑さを増す
- **C. phase label を温存する hybrid**: agent は failure output で意味判断可能、phase 名と command の mismatch（"lint phase に test command 入れる"）の余地を消す方が筋いい

### D2: 実行モデル — `sh -c <command>`

**Decision**: 各 command 文字列は `sh -c <command>` 経由で実行する。

**Rationale**: shell split、パイプ / リダイレクト / glob / 環境変数展開を使用可能にする。`"ruff check && mypy"` のような連結や `"eslint ./src --max-warnings 0 2>&1 | head -50"` のようなパイプが使える。既存の `spawnScript()` は `bun run <script>` に固定しているため、新経路は `sh -c` で統一する。

### D3: fallback 戦略 — 段階的 deprecation

**Decision**: `verification.commands` 未定義時は現状の phase 検出 fallback（`package.json` の script を `bun run` で順次実行）を維持する。

**Rationale**: 既存の spec-runner dogfood（TS / Bun project）は config 変更不要で動く。段階的 deprecation で migration 摩擦を最小化。旧 `PhaseName` / `PHASE_SCRIPTS` の完全削除は別 request。

判定ロジック: `runVerification()` 冒頭で project local config を読み、`verification.commands` が定義されていれば commands 経路、未定義なら既存の phase 経路に分岐する。

### D4: config schema の配置

**Decision**: `verification` section を `SpecRunnerConfig` に追加する。

```typescript
interface VerificationConfig {
  commands?: VerificationCommand[];
}

type VerificationCommand = string | { name?: string; run: string };

interface SpecRunnerConfig {
  // ...existing fields...
  verification?: VerificationConfig;
}
```

project local config の deep merge で user global の verification 設定を repo 単位で上書き可能。`verification` が config に無い（undefined）場合は既存 fallback 経路。

### D5: eslint 設定方針

**Decision**: `eslint@9` flat config + `typescript-eslint@8` recommended preset を基盤に。

- **strict 化**: `--max-warnings 0` で warning 蓄積の罠を最初から封じる
- **scope**: `src/` のみ（`tests/` は Phase 2 で custom rule 整備時に統合）
- **rule 選定**: recommended preset + 明示的に有効化する追加 rule（`prefer-const`, `no-unreachable`, `no-empty`, `no-constant-condition`）

### D6: failure output の表示ルール

**Decision**: `name` があれば `Step '<name>' failed`、無ければ `Step '<command>' failed`。

verification-result.md の phase 表記も同様に、`name` があればそれを表示し、無ければ command 文字列を表示する。既存の phase 名表記（`build`, `typecheck` 等）は fallback 経路でのみ使用。

## Affected Specs

| Capability | Operation | Reason |
|------------|-----------|--------|
| verification-runner | MODIFIED | commands 配列抽象化: `runVerification` に config ベースの command 実行経路を追加 |
| cli-config-store | MODIFIED | `verification` section を config schema に追加 |
