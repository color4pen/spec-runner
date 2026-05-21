# request 管理機構の新設

## Meta

- **type**: new-feature
- **slug**: request-manager
- **base-branch**: main
- **date**: 2026-05-14
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

現在 `specrunner run` は request.md のファイルパス指定が必須。request の生成・レビュー・一覧管理は対話セッションや手動操作に依存している。PR #223 で `specrunner request review` を standalone コマンドとして実装したが、request のライフサイクル全体を管理する機構がない。

自然言語入力や外部システム（stdin）からの連携、watch による自動実行を実現するには、request を独立したエンティティとして管理する層が必要。

## 目的

request のライフサイクル（生成・検証・レビュー・一覧・状態遷移）を管理する独立モジュールを `src/core/request/` に新設し、CLI コマンドと自動化フローの両方から利用できるようにする。

## 要件

### モジュール構成

1. `src/core/request/` に以下を新設する
   - `types.ts` — `ParsedRequest` を `src/parser/request-md.ts` から移動（re-export で後方互換維持）。`RequestState = "active" | "merged"` を新設（canceled は現状ディレクトリが存在しないため本リクエストでは対象外）
   - `store.ts` — `specrunner/requests/` 配下のファイルシステム永続化（CRUD）。`checkSlugCollision()` を `src/util/slugify.ts` から移動。パス知識（`specrunner/requests/{active,merged}/<slug>/request.md`）をここに集約する（現在 6 箇所にハードコードされている）
   - `generator.ts` — テキスト入力 → request 構造体の生成（LLM 使用）。`buildScaffoldTemplate()` は移動しない（generator は LLM ベースの生成機能であり、テンプレートベースの scaffold とは別機能のため分離する）
   - `reviewer.ts` — `parseReviewOutput()`, `buildInitialMessage()`, `verdictToExitCode()` を `src/core/command/request-review.ts` から移動。`runReview()` を新設
   - `manager.ts` — thin coordinator。store/generator/reviewer を組み合わせるだけでロジックは持たない。CLI・自動化フローの両方がこれを呼ぶ

### request store

2. request は `specrunner/requests/active/<slug>/request.md` に保存する（既存の配置規約に準拠）
3. 状態遷移: active → merged（finish が `moveRequestsDir()` で git mv する既存フローに合わせる）。store.ts は git 操作を持たない（パス解決・存在確認・読み書きのみ）
4. slug からファイルパスを解決する関数を提供する（`resolve(slug): string`）
5. `list()` で active な request の一覧を返す
6. `collectRequestPatterns()` や `resolve-target.ts` の auto-detect が直接 readdir している箇所は、本リクエストでは store.ts のみ整備する。既存コードの store 経由への切り替えは別 PR で段階的に行う

### request generator

7. テキスト入力（自然言語 or stdin）から request 構造体を LLM で生成する
8. 既存の `buildScaffoldTemplate()` はテンプレートベースの scaffold。generator はそれを拡張し、LLM で入力テキストから type 推定・背景整理・要件構造化を行う
9. SDK: 既存の `query()` ラッパーを使用する。プロンプトは request.md のフォーマット指示 + 入力テキストを渡す one-shot
10. 生成後に `parseRequestMdContent()` でバリデーションする。パース失敗時はエラーで返す（リトライしない）
11. 生成結果を request.md として store に保存する
12. slug は入力テキストから `slugify()` で生成する

### request reviewer

13. PR #223 の `executeReview()` から `runReview(content: string, config: SpecRunnerConfig, cwd: string): Promise<RequestReviewResult>` を切り出す。`query` 関数を注入可能にして testability を確保する
14. `executeReview()` は `runReview()` のラッパーとして残す（後方互換）
15. verdict（approve / needs-discussion / reject）を返す

### CLI コマンド

16. `specrunner request create "<テキスト>"` — generator → validator → store に保存。slug を stdout に出力
17. `specrunner request create --stdin` — stdin からテキスト or JSON を受け取って同上
18. `specrunner request review <slug>` — 既存コマンドを slug 対応に拡張（ファイルパスも引き続き受け付ける）
19. `specrunner request list` — active な request の一覧を表示（slug, type, 状態）
20. `specrunner run <slug>` — manager から request.md のパスを解決して pipeline に渡す。ファイルパス指定も後方互換で動作する

### run コマンドの拡張

21. `src/cli/run.ts` の `runRunCore()` に `fs.existsSync()` 分岐を追加。ファイルなら既存フロー、ファイルでなければ `manager.resolve(slug)` で absolute path を取得して渡す。同名のファイルが存在する場合はファイルを優先する（後方互換）
22. `src/cli/command-registry.ts` の run コマンドの positional 定義（`{ name: "request.md" }`）を更新し、slug も受け付ける旨を usage に反映する
23. preflight・pipeline の内部構造は変更しない（解決済みの absolute path を渡すだけ）

## 受け入れ基準

- [ ] `specrunner request create "テキスト"` で request.md が active/ に生成される
- [ ] `specrunner request create --stdin` で stdin 入力が受け取れる
- [ ] `specrunner request review <slug>` で slug 指定のレビューが動作する
- [ ] `specrunner request list` で active な request が一覧表示される
- [ ] `specrunner run <slug>` で slug から pipeline が実行される
- [ ] `specrunner run <file>` が後方互換で動作する
- [ ] `bun run typecheck && bun run test` が green

## 補足

- pipeline ステップの追加・変更は本リクエストのスコープ外
- watch コマンドは本機構の上に薄いポーリング層として後で実装する
- request-review を pipeline step として組み込むかは別リクエストで検討する
- `moveRequestsDir()`（git mv + commit）は store.ts に含めない。finish orchestrator の責務として残す
- cancel 時の request ディレクトリ操作は現状未定義（canceled ディレクトリが存在しない）。本リクエストでは active → merged のみ対応
- `src/parser/request-md.ts` の `parseRequestMd()` / `parseRequestMdContent()` は 13 ファイルから import されている。型を `types.ts` に移しつつ re-export で段階的に移行する

## module-architect 分析済みの構造判断

- request 関連の責務が 7 箇所に散在（parser, command/request, command/request-review, context/request-patterns, finish/move-requests-dir, util/slugify, util/paths）
- `specrunner/requests/{active,merged}/<slug>/request.md` のパス知識が 6 箇所にハードコード → store.ts に集約
- `executeReview()` は query() を直接呼んでおりユニットテスト不可能 → `runReview()` 切り出しで query 注入可能に
- `slugify()` は汎用ユーティリティとして `src/util/` に残す。`checkSlugCollision()` のみ store に移動
- `resolve-target.ts` の auto-detect ロジックや `collectRequestPatterns()` の store 経由切り替えは本リクエストのスコープ外。store.ts の API を整備するのみで、既存コードの切り替えは別 PR で段階的に行う
