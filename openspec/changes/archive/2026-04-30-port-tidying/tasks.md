## 1. 前提確認（baseline と参照点）

> 振る舞い不変の baseline を確定し、依存元 request の merged 状態を確認する。

- [x] 1.1 main ブランチで `bun run build` / `bun run typecheck` / 既存テストが PASS することを worktree 上で確認する（baseline 確認）。テスト総数を記録する（PR #31 merge 後の 298 件想定）
- [x] 1.2 `openspec-workflow/requests/merged/2026-04-29-executor-cleanup/implementation-notes.md` の `fetchSpecReviewResult Decision` セクションを読み、本 request の D1 での「test rewrite で解消可能」判断と矛盾が無いことを確認する
- [x] 1.3 `grep -n "verifyPath" src/core/port/github-client.ts` を実行し、現状 `verifyPath` が未宣言であること、`grep -n "verifyPath" src/adapter/github/github-client.ts` で adapter 側に既実装があることを記録する
- [x] 1.4 `grep -rn "fetchSpecReviewResult\|FetchSpecReviewResultParams" src/ tests/` を実行し、削除前の参照箇所を列挙して記録する（後の grep 残存ゼロ確認の baseline）

## 2. `GitHubClient` port に `verifyPath` 必須宣言を追加（要件 2、design D2）

> port 必須化を先に行い、test mock の追従漏れを build error として顕在化させる。

- [x] 2.1 `src/core/port/github-client.ts` の `GitHubClient` interface に `verifyPath(owner: string, repo: string, branch: string, path: string): Promise<boolean>` を必須メソッドとして追加する
- [x] 2.2 同所に JSDoc を追加し「200 で true、404 で false、401 で `GITHUB_TOKEN_EXPIRED` を throw。folder/path の存在確認用で過渡状態でも folder 単位で正しい answer を返す」を明記する
- [x] 2.3 `bun run typecheck` を実行し、未実装箇所（typecheck error の File:Line）を `implementation-notes.md` に記録する（`src/adapter/github/github-client.ts` は既実装のため error が出ないことを確認）。本 Section の完了条件は **未実装箇所リストの記録** であり、typecheck PASS は Section 3 完了時の条件である
- [x] 2.4 列挙された build error を全て解消する（test mock の追従。Section 3 で `fetchSpecReviewResult` 削除と同時に `tests/spec-review-step.test.ts` 等の `GitHubClient` mock に `verifyPath` を実装する）
  > 注意: ここでは port 宣言の追加のみを完了させ、build error 解消は Section 3 でまとめて行う（同一 commit にまとめるため）。本 task の完了条件は「port 宣言が追加され、未実装箇所のリストが記録された」ことに留める

## 3. `fetchSpecReviewResult` 削除（要件 1、design D1）

> learned-patterns lesson「rename/migration タスクは `全置換 + 旧 export 削除 + テスト書き換え + grep 残存ゼロ確認` の 4 sub-task に分解」を遵守する。本 Section は厳密にこの 4 段階で構成する。

### 3.1 全置換（production 経路の `fetchSpecReviewResult` 呼び出しを `deps.githubClient.getRawFile` 経由に置換）

- [x] 3.1.1 `grep -rn "fetchSpecReviewResult" src/` で production 経路の呼び出し箇所を列挙する（Section 1.4 の baseline と差分照合）
- [x] 3.1.2 列挙された production 呼び出し箇所を `deps.githubClient.getRawFile(owner, repo, branch, path)` 経由の呼び出しに書き換える（既に PR #31 で `deps.githubClient.getRawFile` が canonical 経路となっているため、production 側で実質的な置換が無いことを確認する）
- [x] 3.1.3 置換後 `bun run typecheck` で型エラーが無いことを確認する

### 3.2 旧 export 削除（`fetchSpecReviewResult` / `FetchSpecReviewResultParams` を `src/core/step/spec-review.ts` から削除）

- [x] 3.2.1 `src/core/step/spec-review.ts:106-` の `FetchSpecReviewResultParams` interface を削除する
- [x] 3.2.2 `src/core/step/spec-review.ts:123-` の `fetchSpecReviewResult` 関数本体を削除する
- [x] 3.2.3 同ファイル内の関連 helper（`fetchSpecReviewResult` 専用の private helper があれば）を削除する
- [x] 3.2.4 ファイル冒頭の関連 import / コメントを cleanup する

### 3.3 テスト書き換え（TC-012/013/014/015 を `getRawFile` 直接テストに rewrite + 旧 mock 整理）

- [x] 3.3.1 `tests/spec-review-fetch.test.ts` の TC-012/013/014/015 が検証している retry / 404 / 401 / 200 シナリオの assertion 一覧を表形式で記録する（rewrite 前の semantic snapshot）
- [x] 3.3.2 新規ファイル `tests/unit/adapter/github/get-raw-file.test.ts` を作成し、3.3.1 の各シナリオを `GitHubApiClient.getRawFile` の直接テストとして実装する
- [x] 3.3.3 3.3.1 の表と 3.3.2 の新 TC を 1 対 1 で照合し、全 assertion が等価に網羅されていることを確認する
- [x] 3.3.4 旧ファイル `tests/spec-review-fetch.test.ts` を削除する
- [x] 3.3.5 `tests/spec-review-step.test.ts` で `fetchSpecReviewResult` を経由していたシナリオを `githubClient` mock 経由に整理する。同時に Section 2.4 で残った build error（mock に `verifyPath` 未実装）を全て解消する。`tests/pipeline.test.ts` と `tests/pipeline-integration.test.ts` の `buildMockGithubClient` も `verifyPath` を必須実装する（`GitHubClient` port 必須化に伴う追従対象）
- [x] 3.3.6 `bun test` で全テスト PASS を確認する

### 3.4 grep 残存ゼロ確認

- [x] 3.4.1 `grep -rn "fetchSpecReviewResult" src/ tests/` が **0 件** であることを確認する
- [x] 3.4.2 `grep -rn "FetchSpecReviewResultParams" src/ tests/` が **0 件** であることを確認する
- [x] 3.4.3 上記 grep 結果を implementation-notes.md に記録する

## 4. `executor.ts` の structural typing leak と fallback 撤去（要件 3、design D3）

> Section 2 で port が必須化されているため、optional chaining と fallback はもはや不要。

- [x] 4.1 `src/core/step/executor.ts:373` の `verifyChangeFolderViaPort` シグネチャから `& { verifyPath?: ... }` を除去し、パラメータ型を `githubClient: GitHubClient` のみに変更する
- [x] 4.2 同関数本体（:382-385 付近）の fallback 分岐 `githubClient.verifyPath ? ... : await githubClient.getRawFile(..., changeFolderPath + "/proposal.md") !== null` を撤去し、`await githubClient.verifyPath(owner, repo, branch, changeFolderPath)` 直接呼び出しに統一する
- [x] 4.3 関連 import / コメント（「Use verifyPath if available」コメント等）を cleanup する
- [x] 4.4 `bun run typecheck` で型エラーが無いことを確認する
- [x] 4.5 完了条件を grep で確認する:
  - [x] 4.5.1 `grep -n "verifyPath ?" src/core/step/executor.ts` が **0 件** であること
  - [x] 4.5.2 `grep -rn "& { verifyPath" src/` が **0 件** であること
  - [x] 4.5.3 `grep -n "verifyPath" src/core/step/executor.ts` の出力が `await githubClient.verifyPath(...)` の呼び出しのみで、optional chaining や交差型を含まないこと

## 5. spec-review-session spec delta の整合確認（要件 / design D4）

> spec delta は本 task 群の冒頭で生成済（`openspec/changes/2026-04-30-port-tidying/specs/spec-review-session/spec.md`）。実装完了後に文言と実装の整合を確認する。

- [x] 5.1 `openspec/changes/2026-04-30-port-tidying/specs/spec-review-session/spec.md` を読み、Requirement 文言が `deps.githubClient.getRawFile` 経由に書き換わっており `fetchSpecReviewResult` を言及していないことを確認する
- [x] 5.2 同 delta が MODIFIED Requirements として 2 件（「verdict ファイルは GitHub API で取得し行頭マッチでパースする」「verdict ファイル不在時のフェイルセーフ」）を含むことを確認する
- [x] 5.3 Scenario の構造が変わっていないことを確認する（assertion の意味が同一であること）

## 6. 振る舞い不変の機械的検証（受け入れ基準）

> request.md の受け入れ基準を機械的に確認する。

- [x] 6.1 `bun test` で既存 298 テストが全 PASS する（Section 3 で test count が増減した場合は最終 count を記録）
- [x] 6.2 `bun run build` および `bun run typecheck` が exit 0
- [x] 6.3 `tests/cli-stdout-snapshot.test.ts`（または相当の CLI snapshot test）を `bun test` で実行し、`--update-snapshot` 無しで PASS することを確認する。snapshot baseline の更新は禁止
- [x] 6.4 受け入れ基準の grep を実行し全て満たすことを確認する:
  - [x] 6.4.1 `grep -rn "fetchSpecReviewResult" src/ tests/` が 0 件
  - [x] 6.4.2 `grep -rn "FetchSpecReviewResultParams" src/ tests/` が 0 件
  - [x] 6.4.6 `grep -rn "fetchSpecReviewResult" openspec/specs/` が 0 件
  - [x] 6.4.7 `grep -rn "FetchSpecReviewResultParams" openspec/specs/` が 0 件
  - [x] 6.4.3 `grep -n "verifyPath" src/core/port/github-client.ts` で必須宣言が存在
  - [x] 6.4.4 `src/core/step/executor.ts:373` 付近のパラメータ型が `GitHubClient` のみ（交差型を含まない）
  - [x] 6.4.5 `grep -n "verifyPath ?" src/core/step/executor.ts` が 0 件（optional chaining が無い）

## 7. implementation-notes.md への記録

- [x] 7.1 `implementation-notes.md` に以下を記録する:
  - [x] 7.1.1 Section 1.4 の baseline grep 結果と Section 3.4 の最終 grep 結果（0 件）の対比
  - [x] 7.1.2 Section 3.3.1 の旧 TC assertion 表と新 TC へのマッピング
  - [x] 7.1.3 Section 6.3 の CLI snapshot test の PASS 結果（`--update-snapshot` 無し）
  - [x] 7.1.4 最終テスト総数（旧 298 から増減した場合の差分）
  - [x] 7.1.5 LOW #3 の semantic drift 解消が CLI snapshot test に影響を与えなかったことの確認結果
