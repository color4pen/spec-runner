## Why

PR #31（`2026-04-29-executor-cleanup`、merged）で executor.ts の helper 抽出と `verify*Legacy` 削除を完了したが、レビュー時に検出された 3 件の MEDIUM/LOW finding が「port-tidying follow-up」として deferred された。本 request はこれらを 1 まとめで解消する pure refactoring である。

deferred された 3 finding:

1. **MEDIUM #1（architecture）— `fetchSpecReviewResult` が test-only dead production code**: `src/core/step/spec-review.ts:109,123` に `FetchSpecReviewResultParams` / `fetchSpecReviewResult` が retained されているが、production 経路は `deps.githubClient.getRawFile` に統一済みで、`fetchSpecReviewResult` は TC-012/013/014/015（`tests/spec-review-fetch.test.ts`）のためだけに生存している。learned-patterns の anti-pattern「test を除いた production 経路で 0 件参照のモジュールは削除候補」に該当。
2. **LOW #2（architecture）— `verifyChangeFolderViaPort` の structural typing leak**: `src/core/step/executor.ts:373` のパラメータ型が `GitHubClient & { verifyPath?: ... }` の交差型になっており、port 契約に存在しない optional method を probe している。learned-patterns lesson「port が宣言する method のみ呼び出す（optional probe は禁止）」の再発。`GitHubApiClient.verifyPath` は既に実装済（`src/adapter/github/github-client.ts:83`）であり、port 側の宣言追加だけで解消する。
3. **LOW #3（correctness）— `verifyChangeFolderViaPort` fallback の semantic drift**: `src/core/step/executor.ts:383-385` で `verifyPath` が無い port に対し `getRawFile(..., changeFolderPath + "/proposal.md")` で folder 存在を判定している。folder 単位の存在確認のはずが specific file の存在確認に劣化しており、folder が存在しても `proposal.md` 未着の過渡状態で誤って false を返す。LOW #2 が解消されれば fallback 自体が不要になり連動して解消する。

これらは累積的に、後続の Step 追加 request（implementer / verification / code-review / PR 作成 step）で executor.ts と port 契約に手を入れる際の cruft として作用する。本 request で先に潰しておくことで、後続 request の review-feedback が clean な executor / port 契約の上で進む。

参照 ADR / learned-patterns:
- `openspec-workflow/requests/merged/2026-04-29-executor-cleanup/`（依存元 request、PR #31）
- learned-patterns lesson「port が宣言する method のみ呼び出す（optional probe は禁止）」
- learned-patterns lesson「test を除いた production 経路で 0 件参照のモジュールは削除候補」
- learned-patterns lesson「rename タスクは `全置換 + 旧 export 削除 + テスト書き換え + grep 残存ゼロ確認` の 4 sub-task に分解」
- learned-patterns lesson「migration の完了判定は production 経路の grep」

## What Changes

- **`fetchSpecReviewResult` の production code からの削除**: `src/core/step/spec-review.ts` から `fetchSpecReviewResult` 関数と `FetchSpecReviewResultParams` interface を削除する。`tests/spec-review-fetch.test.ts` の TC-012/013/014/015 を `GitHubApiClient.getRawFile` の直接テストとして rewrite し、`tests/unit/adapter/github/get-raw-file.test.ts` 等に移動する。`tests/spec-review-step.test.ts` で `fetchSpecReviewResult` を経由していたシナリオを `githubClient` mock 経由に整理する。完了条件は `grep -rn "fetchSpecReviewResult\|FetchSpecReviewResultParams" src/ tests/` で 0 件であること。
- **`GitHubClient` port に `verifyPath` を必須宣言として追加**: `src/core/port/github-client.ts` の `GitHubClient` interface に `verifyPath(owner: string, repo: string, branch: string, path: string): Promise<boolean>` を必須メソッドとして追加する。JSDoc で「folder/path が存在するかを確認する。404 で false、200 で true、401 で `GITHUB_TOKEN_EXPIRED` を throw」のセマンティクスを明示する。`GitHubApiClient.verifyPath`（`src/adapter/github/github-client.ts:83-99`）は既に実装済のため adapter 側の変更は不要。
- **`executor.ts:373` の structural typing leak 除去 + fallback 撤去**: `verifyChangeFolderViaPort` のパラメータ型から `& { verifyPath?: ... }` を除去し `GitHubClient` のみに統一する。`githubClient.verifyPath ? ... : await githubClient.getRawFile(...)` の fallback 分岐を撤去し `await githubClient.verifyPath(...)` 直接呼び出しに統一する。これにより LOW #2（structural typing leak）と LOW #3（semantic drift）が同時に解消する。
- **test mock の追従**: `GitHubClient` を mock している既存テスト（主に `tests/spec-review-step.test.ts`）が `verifyPath` を必須実装するよう更新する。これは port 必須化に伴う build-error として顕在化させ、機械的に追従する。

**振る舞い不変**: 外部 CLI 出力 / state file / config file に diff 無し。既存 298 テスト全 PASS と CLI snapshot test の `--update-snapshot` 無し PASS が完了条件。例外として LOW #3 の semantic drift 解消は厳密には「振る舞い改善」だが、影響を受けるのは「folder 存在 + `proposal.md` 未着の過渡状態」の判定であり、production 経路ではこの過渡状態でも CLI 出力に diff が出ない（snapshot test で確認）。

## Capabilities

### Modified Capabilities

- **`spec-review-session`**: `fetchSpecReviewResult` を production code から削除するため、現在の spec.md（`openspec/specs/spec-review-session/spec.md:63,87,91`）が言及する `fetchSpecReviewResult(deps, slug, branch, iteration)` の Requirement 文言を「verdict ファイルは `deps.githubClient.getRawFile` で取得し」に書き換える delta を発行する。404 リトライ仕様（1 秒 × 最大 3 回）と verdict パース仕様は不変であり、呼び出し側 (executor) の動作は同一。

### New Capabilities

なし。

## Impact

- **影響範囲**: `src/core/port/github-client.ts`, `src/core/step/spec-review.ts`, `src/core/step/executor.ts`, `tests/spec-review-fetch.test.ts`, `tests/spec-review-step.test.ts`, （新規）`tests/unit/adapter/github/get-raw-file.test.ts`
- **adapter は変更なし**: `src/adapter/github/github-client.ts` は `verifyPath` 既実装のため port 必須化に伴う変更不要
- **後方互換性**: `GitHubClient` を実装する全箇所（adapter + test mock）が `verifyPath` を必須実装する必要がある。test mock は本 request で機械的に追従。production code の adapter は既実装のため影響なし
- **依存関係**: 本 request は `openspec-workflow/requests/merged/2026-04-29-executor-cleanup/`（PR #31）の deferred findings を対象としており、PR #31 が main に merge されていることを前提とする
