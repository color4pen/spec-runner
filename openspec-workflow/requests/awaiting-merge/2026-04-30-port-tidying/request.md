# port-tidying（GitHubClient port purity + fetchSpecReviewResult 削除）

## Meta

- **type**: refactoring
- **date**: 2026-04-30
- **author**: color4pen
- **depends-on**: openspec-workflow/requests/merged/2026-04-29-executor-cleanup（PR #31 で merge 済み executor.ts cleanup）

## ワークフローオプション

- **enabled**: []

## 背景

PR #31（executor-cleanup）の review で 3 件の MEDIUM/LOW finding を「port-tidying follow-up request」に deferred した。具体的に:

1. **MEDIUM #1（architecture）— `fetchSpecReviewResult` が test-only dead production code**: `src/core/step/spec-review.ts:100-170` に retained されているが production 経路は `deps.githubClient.getRawFile` だけが使われ、`GitHubApiClient.getRawFile` は同等の retry/401/404 セマンティクスを持つ。`fetchSpecReviewResult` は test (TC-012/013/014/015) のためだけに残っており、コメントも「Not used by StepExecutor」と明示している。learned-patterns に「test を除いた production 経路で 0 件参照のモジュールは削除候補」が pattern-reviewer / code-reviewer のチェック項目として登録済の anti-pattern。

2. **LOW #2（architecture）— `verifyChangeFolderViaPort` の structural typing leak**: `src/core/step/executor.ts:373` のパラメータ型が `GitHubClient & { verifyPath?: ... }` の交差型になっており、port 契約に存在しない optional method を probe している。PR #26 で既に lesson 化されている再発パターン（learned-patterns: 「port が宣言する method のみ呼び出す（optional probe は禁止）」）。`GitHubApiClient` は既に `verifyPath` を実装しており、port 側の宣言追加だけで解消する。

3. **LOW #3（correctness）— `verifyChangeFolderViaPort` fallback の semantic drift**: line 382-385 で `verifyPath` が無い port に対して `getRawFile(..., changeFolderPath + "/proposal.md")` で folder 存在を判定している。元来は folder 単位の存在確認だが fallback は specific file の存在確認に劣化しており、folder が存在しても `proposal.md` 未着な過渡状態で false を返す。LOW #2 が解消されれば fallback 自体が不要になり連動して解消する。

これらは累積的に、後続の Step 追加 request（implementer / verification / code-review / PR 作成 step）で executor.ts に手を入れる際の cruft として作用する。本 request で先に潰しておくことで、後続 request の review-feedback が clean な executor / port 契約の上で進む。

## 目的

PR #31 で deferred になった port-tidying findings を 1 request で全消化し、後続 Step 追加 request が clean な port 契約と production-path-only の core モジュールの上で走るようにする:

1. `fetchSpecReviewResult` を削除し、関連する test (TC-012/013/014/015) を `GitHubApiClient.getRawFile` の直接テストに移行する
2. `GitHubClient` port に `verifyPath` を必須メソッドとして宣言する
3. `executor.ts:373` の structural typing leak を除去し、fallback ロジックを撤去する

## 対象範囲

- **src/core/step/spec-review.ts**: `fetchSpecReviewResult` / `FetchSpecReviewResultParams` を削除（~70 LOC）
- **src/core/port/github-client.ts**: `GitHubClient` interface に `verifyPath` を必須宣言として追加
- **src/adapter/github/github-client.ts**: `GitHubApiClient.verifyPath` は既に実装済み。port 必須化に伴う型整合のみ確認
- **src/core/step/executor.ts**:
  - `verifyChangeFolderViaPort` のパラメータ型から `& { verifyPath?: ... }` を除去し `GitHubClient` のみに変更
  - fallback ロジック（`githubClient.verifyPath ? ... : await githubClient.getRawFile(...)`）を撤去し `verifyPath` 直接呼び出しに統一
- **tests/spec-review-fetch.test.ts**: TC-012/013/014/015 を `GitHubApiClient.getRawFile` の直接テストに rewrite（または `tests/unit/adapter/github/getRawFile.test.ts` へ移動）
- **tests/spec-review-step.test.ts**: 旧 `fetchSpecReviewResult` 経由の TC-020 等を `githubClient` mock 経由に整理

## 振る舞い不変の確認方法

外部から見た振る舞い（CLI 結果）が変わらないこと:

- **既存 298 テストが全 PASS**（PR #31 merge 後の baseline）
- **specrunner CLI コマンドの挙動維持**: `init` / `login` / `run` / `ps` の stdout / state file / config file 出力に diff が無いこと
- **CLI snapshot test が `--update-snapshot` なしで PASS**（PR #31 で確立した「振る舞い不変の機械的証拠」運用）
- **`verifyPath` の挙動**: `GitHubApiClient.verifyPath` の戻り値（`resp.status !== 404`）と元の fallback `getRawFile(...) !== null` が同一 verdict を返すケースで CLI 結果が変わらないこと。ただし folder 存在 + `proposal.md` 未着の過渡状態では `verifyPath` の方が正しい answer を返すため、ここは strict には「振る舞い改善」になる（finding LOW #3 の semantic drift 解消）

## 要件

1. **`fetchSpecReviewResult` 削除**:
   - `src/core/step/spec-review.ts` から `fetchSpecReviewResult` と `FetchSpecReviewResultParams` を削除
   - `tests/spec-review-fetch.test.ts` の TC-012/013/014/015 を `GitHubApiClient.getRawFile` の直接テストに rewrite（または `tests/unit/adapter/github/get-raw-file.test.ts` 等へ移動）
   - `tests/spec-review-step.test.ts` の旧 helper 経由テストを `githubClient` mock 経由に整理
   - `grep -rn "fetchSpecReviewResult" src/ tests/` で 0 件であること

2. **`GitHubClient` port に `verifyPath` 必須宣言追加**:
   - `src/core/port/github-client.ts` に `verifyPath(owner, repo, branch, path): Promise<boolean>` を必須メソッドとして追加
   - JSDoc で「folder/path が存在するかを確認する。404 で false、200 で true、401 で `GITHUB_TOKEN_EXPIRED` を throw」を明示
   - `src/adapter/github/github-client.ts:83-99` の既存実装は変更不要（port 側の宣言追加のみ）

3. **`executor.ts:373` の structural typing leak 除去**:
   - `verifyChangeFolderViaPort` のパラメータ型を `githubClient: GitHubClient` に変更（交差型を除去）
   - fallback ロジック（`githubClient.verifyPath ? ... : await githubClient.getRawFile(...) !== null`）を撤去し `await githubClient.verifyPath(owner, repo, branch, changeFolderPath)` 直接呼び出しに統一
   - 関連する test mock も `verifyPath` を必須実装するよう更新

4. **後方互換性**:
   - `GitHubClient` の他の実装（test mock 含む）が `verifyPath` を実装していない場合は build error として顕在化させる。既存の adapter (`GitHubApiClient`) は実装済みのため main 経路は問題なし。test mock 側の追従が本 request のスコープ

## 受け入れ基準

- [ ] 既存 298 テストが全て PASS する（regression 0 件）
- [ ] `grep -rn "fetchSpecReviewResult" src/ tests/` で 0 件である
- [ ] `grep -rn "FetchSpecReviewResultParams" src/ tests/` で 0 件である
- [ ] `grep -rn "fetchSpecReviewResult" openspec/specs/` で 0 件である
- [ ] `grep -rn "FetchSpecReviewResultParams" openspec/specs/` で 0 件である
- [ ] `GitHubClient` interface に `verifyPath` メソッドが必須宣言として存在する
- [ ] `src/core/step/executor.ts:373` 付近のパラメータ型が `GitHubClient` のみで交差型を含まない
- [ ] `executor.ts` 内に `githubClient.verifyPath ?` の optional chaining が存在しない（grep で 0 件）
- [ ] CLI snapshot test が `--update-snapshot` なしで PASS する
- [ ] `bun run build` および `bun run typecheck` が exit 0
- [ ] `tests/unit/adapter/github/get-raw-file.test.ts`（または同等のテスト）が存在し、TC-012/013/014/015 相当の retry / 404 / 401 / 200 シナリオを `GitHubApiClient.getRawFile` 経由で網羅している

## スコープ外

- **implementer / verification / code-review / PR 作成 step の追加**: 後続 request。本 request は「これらが clean な port 契約の上で実装可能」になるための整理
- **test schema lag 防止策**（implementer DoD に build 必須化等）: 後続 request 候補（前回会話で C として提案）。本 request では扱わない
- **E2E 実機検証**: self-hosting 完成までまとめて保留

## 補足

### 参照 PR / review

- PR #31 review コメント（https://github.com/color4pen/spec-runner/pull/31#issuecomment-... に相当する内容） — 本 request の起点となる 3 findings
- PR #31 implementation-notes.md の `fetchSpecReviewResult Decision` セクション — 「TC のため kept」rationale が test rewrite で解消可能と判断する根拠
- PR #28 review-feedback の port-purity 系 LOW（learned-patterns に lesson 化済み）

### 参照 learned-patterns

`openspec-workflow/learned-patterns.md` の以下 lesson を本 request で遵守する:

- 「port が宣言する method のみ呼び出す（optional probe は禁止）」 — finding #2 の根拠
- 「test を除いた production 経路で 0 件参照のモジュールは削除候補」 — finding #1 の根拠
- 「rename タスクが 1 task に集約されていないか」 — `fetchSpecReviewResult` 削除を「全置換 + 旧 export 削除 + テスト書き換え + grep 残存ゼロ確認」の 4 sub-task に分解する規律
- 「migration の完了判定は production 経路の grep」 — `grep -rn "fetchSpecReviewResult" src/` で 0 件を完了条件
