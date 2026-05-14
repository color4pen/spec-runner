# Spec Review Result: request-manager

- **reviewer**: spec-reviewer (iteration 2)
- **date**: 2026-05-14
- **iteration**: 2
- **verdict**: needs-fix

## Summary

iteration 1 (spec-review-result-001.md) で指摘された F-01〜F-04 のうち、いずれも現在の spec ファイル群に修正が反映されていない。加えて、コードベース検証で import 数の事実誤差が spec・前回レビューの両方より大きいことを確認した。HIGH 1 件 + MEDIUM 2 件が未解決のため verdict は needs-fix を維持する。

## Open Findings from Iteration 1 (still unfixed)

### F-01: executeCreate の stdin/positional 優先順位が REQ-CLI-RC-02 と矛盾 [HIGH] — UNFIXED

**場所**: design.md `executeCreate` フロー (L240-241) / tasks.md 9.1(a)(b) / delta spec REQ-CLI-RC-02

REQ-CLI-RC-02 は「positional argument takes precedence」と規定しているが、design.md のフローは:
1. `opts.stdin` が true → stdin 全読み
2. `text === null` かつ `!opts.stdin` → error

positional `text` が渡されていても `--stdin` が true なら stdin で上書きされる。正しいフロー:
1. `text !== null` → positional をそのまま使う
2. `text === null` かつ `opts.stdin` → stdin を読む
3. `text === null` かつ `!opts.stdin` → error

**修正対象**: design.md executeCreate フロー + tasks.md 9.1

### F-02: `store.read()` の delta spec Requirement が不在 [MEDIUM] — UNFIXED

**場所**: specs/request-management/spec.md

design.md は `store.read(cwd, slug): Promise<ParsedRequest>` を定義し、tasks.md 2.4 にタスクがあり、`manager.list()` の実装でも使用される。しかし delta spec の REQ-RM-STORE-01〜05 に `read()` の Requirement がない。

**修正対象**: specs/request-management/spec.md に REQ-RM-STORE-06 を追加

### F-03: `buildScaffoldTemplate()` の移動が design/tasks から脱落 [MEDIUM] — UNFIXED

**場所**: request.md 要件 1 vs design.md / tasks.md

request.md 要件 1:「`buildScaffoldTemplate()` を `src/core/command/request.ts` から移動」と明記されている。design.md の generator.ts セクションには `generate()` と `buildGeneratePrompt()` のみ。tasks.md にも対応タスクなし。

request.md の要件 1 を修正して移動対象から外す（generator は LLM ベースの別機能であり、template scaffold とは分離する意図を明示する）か、design.md + tasks.md に移動タスクを追加する必要がある。

**修正対象**: request.md 要件 1 を明確化、または design.md + tasks.md に反映

### F-04: `manager.resolve()` と `store.resolve()` のパラメータ順序が逆 [LOW] — UNFIXED

**場所**: design.md

- `store.resolve(cwd, slug)` — cwd が先
- `manager.resolve(slug, cwd)` — slug が先

プロジェクト全体で `(cwd, ...)` を第一引数にするパターンが多い（`store.list(cwd)`, `store.write(cwd, slug, ...)`, `store.checkSlugCollision(cwd, slug)`, `manager.create(text, cwd, ...)`）。`manager.resolve` も `(cwd, slug)` に統一すべき。

**修正対象**: design.md manager.resolve シグネチャ + tasks.md 8.5

## New Findings (Iteration 2)

### F-06: import ファイル数の事実誤差が spec・前回レビュー双方で不正確 [INFO]

**場所**: request.md 補足 / design.md types.ts セクション

request.md は「13 ファイルから import」、前回レビュー F-05 は「実際は 12 ファイル」と指摘。

コードベース検証の結果:
- `src/` 内で `request-md.ts` から import するファイル: 13 ファイル（`request-md.ts` 自身を除く）
- `tests/` 内: 4 ファイル
- 合計: 17 ファイル

機能上の影響はない（re-export 戦略は import 数に依存しない）。正確性のため修正が望ましいが、ブロッカーではない。

### F-07: ハードコードパス箇所数の事実誤差 [INFO]

**場所**: request.md

request.md は「6 箇所にハードコード」と記載。コードベース検証の結果、source ファイルは 5 つ（slugify.ts, pipeline-run.ts, request-patterns.ts, move-requests-dir.ts, resolve-target.ts）。コメント行を含めれば 12 箇所、実コードのみで 9 箇所。「6 箇所」はどの数え方とも一致しない。

機能・設計上の影響なし。store.ts 集約の妥当性は変わらない。

## Security Review

### SEC-01: slugify() によるパス安全性 [PASS]

`slugify()` は `[^a-z0-9]+` をハイフンに置換し、先頭末尾のハイフンを除去する。`../`, null byte, スペース等のパストラバーサル文字列は生成されない。`store.resolve()` が固定パスパターンを構築するため、slug 経由でのディレクトリ脱出は不可能。

### SEC-02: LLM 出力のファイルシステム書き込み [PASS]

`generator.generate()` は LLM 出力を `parseRequestMdContent()` で構造検証後に `store.write()` で固定パスに書き込む。LLM が書き込み先を制御する余地なし。`allowedTools: []` により LLM のファイルシステムアクセスも完全遮断。

### SEC-03: stdin サイズ制限なし [INFO]

stdin 読み込みにサイズ上限の規定がない。CLI ツールとしては標準的な挙動。極端な入力での OOM リスクは理論上あるが、ユーザー自身が入力を制御する CLI 環境では non-blocking。

### SEC-04: `permissionMode: "bypassPermissions"` [PASS]

generator は `allowedTools: []` でツールアクセスを完全遮断しており実質的な副作用なし。reviewer は既存 `executeReview()` と同じ `allowedTools` / `permissionMode` を継承しており新たなリスクは導入されない。

## Baseline Spec Compatibility

delta spec `cli-commands` は既存 baseline の `specrunner run` ステップ 5（ファイル存在チェック）を拡張する。slug 解決は「ファイルが存在しない場合のフォールバック」として追加されるため、ファイルパスが存在する場合の既存動作は一切変わらない。baseline の fail-fast 順序（ステップ 1〜4）も影響を受けない。

delta spec `request-management` は baseline の web ベース要件（Server Action, DB schema）とは異なるレイヤー（CLI + FS ベース）であり、機能的矛盾なし。

## Required Actions for Approval

| ID | Severity | Action |
|----|----------|--------|
| F-01 | HIGH | design.md + tasks.md 9.1: executeCreate の stdin/positional 優先順位を REQ-CLI-RC-02 と整合させる |
| F-02 | MEDIUM | specs/request-management/spec.md: `store.read()` の Requirement (REQ-RM-STORE-06) を追加 |
| F-03 | MEDIUM | request.md 要件 1 を修正して buildScaffoldTemplate 移動を除外する旨を明示するか、design.md + tasks.md に移動タスクを追加 |
| F-04 | LOW | design.md + tasks.md 8.5: `manager.resolve(slug, cwd)` → `manager.resolve(cwd, slug)` に統一 |

## Checklist

| request.md 要件 | design.md | tasks.md | delta spec | 状態 |
|---|---|---|---|---|
| 1. モジュール構成 | ✓ (buildScaffoldTemplate を除く) | ✓ | ✓ | F-03 |
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
| store.read() | ✓ | ✓ | — | F-02 |
