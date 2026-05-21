# Spec Review Result: request-manager

- **reviewer**: spec-reviewer
- **date**: 2026-05-14
- **iteration**: 1
- **verdict**: needs-fix

## Summary

request.md の要件に対してdesign.md / tasks.md / delta specs は概ね網羅的だが、設計とスペックの間に 3 件の不整合、delta spec に 1 件のカバレッジ漏れ、API 設計に 1 件の一貫性問題がある。セキュリティ上の重大リスクは確認されなかった。

## Findings

### F-01: design.md の `executeCreate` フローが REQ-CLI-RC-02 の優先順位規定と矛盾 [HIGH]

**場所**: design.md `src/core/command/request-create.ts` セクション / delta spec REQ-CLI-RC-02

REQ-CLI-RC-02 は「If both `--stdin` and a positional `<text>` are provided, the positional argument takes precedence」と規定している。

しかし design.md の `executeCreate` 実装フローは:
1. `opts.stdin` が true なら stdin を全読みして text とする
2. `text === null` かつ `!opts.stdin` なら error

この順序だと、positional が提供されていても `--stdin` が true なら stdin の内容で上書きされる。正しいフローは:
1. `text !== null`（positional 提供済み）ならそのまま使う
2. `text === null` かつ `opts.stdin` なら stdin を読む
3. `text === null` かつ `!opts.stdin` なら error

**修正対象**: design.md の executeCreate フロー記述 + tasks.md 9.1

### F-02: `store.read()` が delta spec に不在 [MEDIUM]

**場所**: specs/request-management/spec.md

design.md は `store.read(cwd, slug): Promise<ParsedRequest>` を定義し、`manager.list()` の実装で使用している。しかし delta spec の REQ-RM-STORE-* には `read()` に対応する Requirement がない。

`resolve` / `list` / `write` / `checkSlugCollision` は全て明示的な Requirement を持つが、`read` だけが抜けている。

**修正対象**: specs/request-management/spec.md に REQ-RM-STORE-06 として `store.read()` の Requirement を追加

### F-03: `buildScaffoldTemplate()` の移動が design / tasks から脱落 [MEDIUM]

**場所**: request.md 要件 1 vs design.md / tasks.md

request.md の要件 1（モジュール構成）に「`buildScaffoldTemplate()` を `src/core/command/request.ts` から移動」と明記されている。しかし design.md の generator.ts セクションには `generate()` と `buildGeneratePrompt()` のみが記載され、`buildScaffoldTemplate()` の移動には言及がない。tasks.md にも該当タスクがない。

要件 8 で「generator はそれを拡張し」とあり、LLM ベースの生成で機能的に上位互換を提供する設計意図は理解できるが、要件 1 の「移動」指示と design が乖離している。

**選択肢**:
- (a) `buildScaffoldTemplate()` を generator.ts に移動し、`request.ts` から re-export（要件通り）
- (b) request.md を更新して移動対象から外す（設計判断として `request template` コマンドと generator を分離する意図を明示）

**修正対象**: design.md + tasks.md、または request.md の要件 1 を修正

### F-04: `manager.resolve()` と `store.resolve()` のパラメータ順序が逆 [LOW]

**場所**: design.md

- `store.resolve(cwd: string, slug: string): string` — cwd が先
- `manager.resolve(slug: string, cwd: string): string` — slug が先

同一概念の関数でパラメータ順序が逆転しており、実装時・利用時の混乱リスクがある。慣例としてプロジェクト内で `cwd` を第一引数にする関数（`store.list(cwd)`, `store.write(cwd, slug, ...)`, `store.checkSlugCollision(cwd, slug)`）が多いため、`manager.resolve` も `(cwd, slug)` に統一するのが自然。

**修正対象**: design.md の manager.resolve シグネチャ + tasks.md 8.5

### F-05: 事実誤差（import 元ファイル数） [INFO]

**場所**: request.md 補足

request.md は「`parseRequestMd()` / `parseRequestMdContent()` は 13 ファイルから import されている」と記載しているが、実際のコードベースでは 12 ファイルから import されている。design.md も「13 ファイルの既存 import は変更不要」と転記している。機能上の影響はないが、正確性のため修正が望ましい。

## Security Review

### SEC-01: slugify() によるパス安全性 [PASS]

`slugify()` は非 ASCII を除去し、`[^a-z0-9]+` をハイフンに置換するため、`../` や null byte などのパストラバーサル文字列は生成されない。`store.resolve()` が `path.join(cwd, ACTIVE_SUBDIR, slug, "request.md")` を構築する際も、slugify 済みの slug のみが使われるため安全。

### SEC-02: LLM 出力のファイルシステム書き込み [PASS]

`generator.generate()` は LLM 出力を `parseRequestMdContent()` でバリデーション後に `store.write()` する。書き込み先は固定パス（`specrunner/requests/active/<slug>/request.md`）のみで、LLM が書き込み先を制御する余地はない。

### SEC-03: stdin 読み込みのサイズ制限 [INFO]

stdin 読み込みにサイズ上限の規定がない。CLI ツールとしては標準的だが、極端に大きな入力（> 数 MB）で OOM の可能性がある。現時点では非ブロッキング。必要に応じて将来 `--max-input-size` 等で制限可能。

### SEC-04: query() の permissionMode [PASS]

generator は `allowedTools: []` で LLM のツールアクセスを完全に遮断しており、ファイルシステムへの副作用はない。reviewer は既存の `executeReview()` と同じ `allowedTools` / `permissionMode` を使用しており、新たなリスクは導入されない。

## Baseline Spec Compatibility

delta spec `request-management` は baseline の web ベース要件（Server Action, DB schema, workspace-client.tsx）とは異なるレイヤー（CLI + FS ベース）の要件を追加する。これは CLI-first への転換（project status memory 参照）と整合しており、baseline 要件との機能的矛盾はない。

## Checklist

| request.md 要件 | design.md | tasks.md | delta spec | 状態 |
|---|---|---|---|---|
| 1. モジュール構成 | ✓ (buildScaffoldTemplate 移動を除く) | ✓ | ✓ | F-03 |
| 2. request store パス | ✓ | ✓ | ✓ | OK |
| 3. 状態遷移 active→merged | ✓ | — | ✓ | OK |
| 4. slug → パス解決 | ✓ | ✓ | ✓ | OK |
| 5. list() | ✓ | ✓ | ✓ | OK |
| 6. 既存コード切り替えスコープ外 | ✓ | — | ✓ | OK |
| 7-12. generator | ✓ | ✓ | ✓ | OK |
| 13-15. reviewer | ✓ | ✓ | ✓ | OK |
| 16. request create | ✓ | ✓ | ✓ | F-01 |
| 17. request create --stdin | ✓ | ✓ | ✓ | F-01 |
| 18. request review slug 対応 | ✓ | ✓ | ✓ | OK |
| 19. request list | ✓ | ✓ | ✓ | OK |
| 20-23. run slug 対応 | ✓ | ✓ | ✓ | OK |
