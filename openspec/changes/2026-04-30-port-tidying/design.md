## Context

PR #31（`2026-04-29-executor-cleanup`、merged）で executor.ts helper 抽出と `verify*Legacy` 削除を完了したが、レビューで 3 件の MEDIUM/LOW finding が deferred された:

- MEDIUM #1: `fetchSpecReviewResult` が production 経路から参照ゼロで test-only に劣化（`src/core/step/spec-review.ts:109,123`）
- LOW #2: `verifyChangeFolderViaPort` のパラメータ型が `GitHubClient & { verifyPath?: ... }` の交差型で port 契約の純度を破壊（`src/core/step/executor.ts:373`）
- LOW #3: 同関数の fallback ロジックが folder 単位の存在確認を `proposal.md` の存在確認に劣化させる semantic drift（同 :383-385）

参照 learned-patterns:
- 「port が宣言する method のみ呼び出す（optional probe は禁止）」 — LOW #2 の根拠
- 「test を除いた production 経路で 0 件参照のモジュールは削除候補」 — MEDIUM #1 の根拠
- 「rename/migration タスクは `全置換 + 旧 export 削除 + テスト書き換え + grep 残存ゼロ確認` の 4 sub-task に分解」 — `fetchSpecReviewResult` 削除タスクの規律
- 「migration の完了判定は production 経路の grep」 — `grep -rn fetchSpecReviewResult src/ tests/` 0 件で完了

参照依存元:
- `openspec-workflow/requests/merged/2026-04-29-executor-cleanup/` — 本 request の起点となる 3 finding を deferred した request
- `openspec-workflow/requests/merged/2026-04-29-executor-cleanup/implementation-notes.md` の `fetchSpecReviewResult Decision` セクション — 「TC のため kept」rationale が test rewrite で解消可能と判断する根拠

### 制約

- **振る舞い不変**: 外部 CLI 出力 / state file / config file に diff 無し。既存 298 テスト全 PASS が必須
- **CLI snapshot test の `--update-snapshot` 無し PASS**: PR #31 で確立した「振る舞い不変の機械的証拠」運用。snapshot baseline を本 request で更新してはならない
- **grep ベース完了判定**: `fetchSpecReviewResult` 削除と structural typing leak 除去は production 経路の grep 0 件を完了条件とする
- **port 必須化を build-error で顕在化**: `GitHubClient.verifyPath` を必須化することで、未実装の test mock を build error として顕在化させ機械的に追従する

## Goals / Non-Goals

**Goals:**
- `fetchSpecReviewResult` / `FetchSpecReviewResultParams` を production code から完全削除し、関連テストを `GitHubApiClient.getRawFile` の直接テストに rewrite する
- `GitHubClient` port に `verifyPath` を必須メソッドとして宣言追加し、port 契約の純度を回復する
- `executor.ts:373` の structural typing leak と `:383-385` の fallback semantic drift を同時除去し、`verifyPath` 直接呼び出しに統一する
- `spec-review-session` capability spec の文言を実装に整合させる delta を発行する

**Non-Goals:**
- 新機能・新 capability の追加（pure refactoring）
- 後続 Step（implementer / verification / code-review / PR 作成）の実装（別 request）
- E2E 実機検証（self-hosting 完成まで保留）
- 404 リトライ仕様（1 秒 × 最大 3 回）の変更 — 呼び出し側仕様は不変、adapter `getRawFile` の既存仕様を継承

## Decisions

### D1: `fetchSpecReviewResult` は production code から完全削除し、関連 4 TC を `getRawFile` 直接テストに rewrite する

**Decision**: `src/core/step/spec-review.ts` から `fetchSpecReviewResult` 関数と `FetchSpecReviewResultParams` interface を完全削除する。`tests/spec-review-fetch.test.ts` の TC-012/013/014/015 は `GitHubApiClient.getRawFile` の直接テストとして rewrite し、`tests/unit/adapter/github/get-raw-file.test.ts` に新規配置する。旧ファイル `tests/spec-review-fetch.test.ts` は削除する。

**Rationale**: PR #31 implementation-notes.md `fetchSpecReviewResult Decision` で記録された「TC のため kept」rationale は test rewrite で解消可能と判定された。`fetchSpecReviewResult` の retry/401/404 セマンティクスは `GitHubApiClient.getRawFile` と同等であり、TC-012/013/014/015 が検証している retry / 404 / 401 / 200 シナリオは adapter 層の `getRawFile` 直接テストで等価に網羅できる。production 経路で 0 件参照のモジュールを test-only で残し続けるのは learned-patterns lesson「test を除いた production 経路で 0 件参照のモジュールは削除候補」に反する。

**完了条件**:
- `grep -rn "fetchSpecReviewResult" src/ tests/` で 0 件
- `grep -rn "FetchSpecReviewResultParams" src/ tests/` で 0 件
- `tests/unit/adapter/github/get-raw-file.test.ts` が retry / 404 / 401 / 200 シナリオを網羅している
- 既存 298 テストの test count が `298 - (旧 TC 数) + (新 TC 数)` で増減し regression 0 件

### D2: `GitHubClient` port に `verifyPath` を必須メソッドとして追加する

**Decision**: `src/core/port/github-client.ts` の `GitHubClient` interface に以下の宣言を追加する:

```typescript
/**
 * folder または path が存在するかを確認する。
 * - 200 → true
 * - 404 → false
 * - 401 → `GITHUB_TOKEN_EXPIRED` を throw
 * - 5xx / network error → `GitHubApiError`（または同等の throwable）を throw する
 *
 * 過渡状態（folder 存在 + 内部ファイル未着）でも folder 単位で正しい answer を返す。
 */
verifyPath(owner: string, repo: string, branch: string, path: string): Promise<boolean>;
```

> **Note（adapter 現状）**: 現在の adapter 実装（`src/adapter/github/github-client.ts:97`）は `return resp.status !== 404` で 5xx も true 扱いになっており、上記 port 契約と乖離がある。port spec のみ tighten し、adapter 修正は別 request のスコープ（implementation-notes.md に記録）。

`GitHubApiClient.verifyPath`（`src/adapter/github/github-client.ts:83-99`）は既に同セマンティクスで実装済であり adapter 側の変更は不要。test mock 側で `verifyPath` を実装していない箇所は build error として顕在化させ、機械的に追従する。

**Rationale**: learned-patterns lesson「port が宣言する method のみ呼び出す（optional probe は禁止）」を遵守する唯一の手段は port に必須宣言を追加することであり、optional method として宣言する案は同 lesson に反するため採用しない。port を必須化することで executor.ts:373 の交差型 `& { verifyPath?: ... }` を除去できる。

**完了条件**:
- `src/core/port/github-client.ts` の `GitHubClient` interface に `verifyPath` が必須宣言として存在する
- `bun run typecheck` が exit 0（test mock 追従後）

### D3: `executor.ts:373` の structural typing leak と fallback を撤去し `verifyPath` 直接呼び出しに統一する

**Decision**: `verifyChangeFolderViaPort` のパラメータ型を `githubClient: GitHubClient` のみに変更（交差型 `& { verifyPath?: ... }` を完全除去）し、関数本体の fallback 分岐 `githubClient.verifyPath ? ... : await githubClient.getRawFile(..., changeFolderPath + "/proposal.md") !== null` を撤去して `await githubClient.verifyPath(owner, repo, branch, changeFolderPath)` 直接呼び出しに統一する。

**Rationale**: D2 で port が `verifyPath` を必須宣言するため、optional chaining と fallback はもはや必要ない。fallback の semantic drift（folder 存在を `proposal.md` 存在で判定）は厳密には誤った実装であり、撤去が「振る舞い改善」になる。CLI 結果に diff が出るのは「folder 存在 + `proposal.md` 未着の過渡状態」のみであり、production 経路ではこの過渡状態でも CLI 出力に diff が出ないことを CLI snapshot test で機械的に確認する。

**完了条件**:
- `executor.ts` の `verifyChangeFolderViaPort` シグネチャが `githubClient: GitHubClient` のみ（交差型を含まない）
- `grep -n "verifyPath ?" src/core/step/executor.ts` が 0 件
- `grep -n "& { verifyPath" src/` が 0 件
- 既存 298 テスト全 PASS
- CLI snapshot test が `--update-snapshot` 無しで PASS

### D4: `spec-review-session` spec.md は MODIFIED delta で文言修正する

**Decision**: `openspec/specs/spec-review-session/spec.md:63,87,91` の `fetchSpecReviewResult` への言及を `deps.githubClient.getRawFile`（または「`githubClient.getRawFile` 経由の raw fetch」）に書き換える delta を `openspec/changes/2026-04-30-port-tidying/specs/spec-review-session/spec.md` で発行する。404 リトライ仕様（1 秒 × 最大 3 回）と verdict パース仕様（`/^- \*\*verdict\*\*:\s*(approved|needs-fix|escalation)\s*$/m`）と escalation 挙動は文言レベルでは不変であり、呼び出し側の Requirement / Scenario も変更しない。

**Rationale**: 実装から `fetchSpecReviewResult` 関数を削除する以上、spec が同関数名を Requirement で言及し続けると spec/code 乖離が生じる。learned-patterns lesson「rename/関数名変更を伴う仕様改訂は MODIFIED delta で reviewer が機械的に新旧を比較できるよう発行」に従う。delta は ADDED ではなく MODIFIED として発行することで、spec-reviewer が文言の差分を機械的にレビューできる。

**完了条件**:
- `openspec/changes/2026-04-30-port-tidying/specs/spec-review-session/spec.md` が MODIFIED delta として存在する
- 同 delta は Requirement / Scenario の構造を変更せず、`fetchSpecReviewResult` の文言のみを書き換える

## Risks / Trade-offs

- **Risk: test mock の `verifyPath` 追従漏れで build error が出る**: `GitHubClient` を mock している箇所が複数ファイルに分散している場合、追従漏れが発生する。**Mitigation**: D2 で必須宣言した直後に `bun run typecheck` を実行し、build error として全ファイルを機械的に列挙してから追従する。
- **Risk: `tests/spec-review-fetch.test.ts` の rewrite で TC のセマンティクスが意図せず変わる**: TC-012/013/014/015 は `fetchSpecReviewResult` 経由で 404/401/retry/200 を検証していたが、`getRawFile` 直接呼び出しでは retry 層が違う可能性がある。**Mitigation**: rewrite 前に旧 TC のシナリオ（assertion）を表形式で記録し、新 TC で同じ assertion を網羅していることを 1 対 1 で照合する。
- **Risk: LOW #3 の semantic drift 解消が「folder 存在 + `proposal.md` 未着」の過渡状態で振る舞いに diff を出す**: 厳密には振る舞い改善だが、CLI snapshot test が捕捉できない過渡状態がある可能性。**Mitigation**: CLI snapshot test の `--update-snapshot` 無し PASS を完了条件とし、もし diff が出たら設計判断として implementation-notes.md に「LOW #3 解消による意図的な振る舞い改善」と rationale を記録した上で snapshot 更新する（更新時はレビュー必須）。
- **Trade-off: port 必須化 vs optional 宣言**: optional 宣言なら test mock の追従コストがゼロになるが、learned-patterns lesson「optional probe 禁止」に直接違反する。本 request は必須化を選び、追従コストを受け入れる。

## Migration Plan

なし。schema 変更や config 変更は無い。test の rewrite と削除は 1 commit で完結させ、production の `fetchSpecReviewResult` 削除と test 移行を同一 commit に含める（learned-patterns lesson「refactoring の HIGH の主因は新旧並存。削除と移行を 1 commit で完結」）。

### Decisions

- spec も grep 対象に含める（production code grep だけでは migration 完了とは言えない）。`openspec/specs/` 配下の grep 0 件を受け入れ基準に含めることで、spec/code 乖離が merge 後に固定化されることを防ぐ。

## Open Questions

（解消済み — 以下は決定の記録）

- **`fetchSpecReviewResult` 削除時の TC 移行先**: `tests/unit/adapter/github/get-raw-file.test.ts` に新規配置する（D1 で確定）。旧ファイル `tests/spec-review-fetch.test.ts` は削除する。
- **port `verifyPath` を必須 / optional のどちらで宣言するか**: 必須（D2 で確定）。optional 宣言は learned-patterns lesson に違反するため採用しない。
- **`spec-review-session` spec の delta 種別**: MODIFIED（D4 で確定）。Requirement / Scenario の構造は変更せず、文言のみを書き換える。
