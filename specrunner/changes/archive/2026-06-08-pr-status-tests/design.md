# Design: pr-status.ts ユニットテスト追加

## Context

`src/core/finish/pr-status.ts` は `archive --with-merge` の PR ステータス確認ロジックを担う 2 つの純関数を export する。

- `fetchPrViewWithRetry`: `getPullRequest` を呼び、`mergeStateStatus` が `UNKNOWN` の間 retry する（最大 `UNKNOWN_RETRY_COUNT=3`）。`state === "MERGED"` かつ `UNKNOWN` のときは retry せず即成功する bypass を持つ。
- `checkMergeableForMerge`: `getPullRequest` の `mergeable` を `MERGEABLE` / `CONFLICTING` / `UNKNOWN` に分岐し、`UNKNOWN` の間 retry する（最大 `MERGEABLE_RETRY_COUNT=3`、これは export 済み）。

両関数とも `sleepFn?: (ms: number) => Promise<void>` を受け取り、retry の待ち時間を注入で差し替えられる。失敗時は `formatEscalation` で組んだ escalation 文字列を `{ ok: false, escalation }` として返す。現状この module に対するテストが 1 件も存在しない。

GitHubClient は `src/core/port/github-client.ts`（再 export 元 `src/kernel/github-client.ts`）の interface。両関数は `getPullRequest(owner, repo, prNumber)` のみを使う。

既存テスト `tests/unit/core/archive/merge-then-archive.test.ts` は、GitHubClient の全メソッドを inline で定義する `makeGitHubClient(overrides)` factory を持ち、`getPullRequest` を `overrides` で差し替えるパターンを確立している。`tests/helpers/github-client-mock.ts` は存在しない。

## Goals / Non-Goals

**Goals**:

- `tests/unit/core/finish/pr-status.test.ts` を新規作成し、`fetchPrViewWithRetry`（5 分岐）と `checkMergeableForMerge`（5 分岐）の計 10 分岐を網羅する characterization test を追加する。
- `sleepFn` を no-op で注入し、wall-clock 待ち時間ゼロで retry semantics（retry 回数）を検証する。
- `bun run typecheck && bun run test && bun run lint` を green に保つ。

**Non-Goals**:

- `pr-status.ts` のプロダクションコード変更（テスト追加のみ）。
- `merge-then-archive.ts` の error path テスト（別 request）。
- GitHubClient mock の共有 factory（`tests/helpers/github-client-mock.ts`）への集約。

## Decisions

### D1: テスト配置は `tests/unit/core/finish/pr-status.test.ts`

`tests/unit/core/finish/`（`archive-change-folder.test.ts`・`resolve-canonical-state-dir.test.ts` と同一ディレクトリ）に置く。テスト対象 module（`src/core/finish/pr-status.ts`）の path をミラーする既存規約に従う。

- Rationale: テスト位置を対象 source の path に対応させる既存規約に揃えると探索性が高い。
- Alternatives considered: `tests/unit/core/archive/` 配下に置く案（merge-then-archive と隣接）。テスト対象が `finish/` 配下のため不採用。

### D2: GitHubClient mock は inline の `makeGitHubClient(overrides)` helper をテストファイル内に定義する

`merge-then-archive.test.ts` の factory と同形の helper をこのテストファイル内にローカル定義し、全 GitHubClient メソッドを `vi.fn()` でスタブする。各テストは `getPullRequest` のみ `overrides` で差し替える。

- Rationale: `tests/helpers/github-client-mock.ts` が存在せず、architect 判断で「共有 factory への集約は別作業」と確定済み。既存テストと同一パターンを踏襲することで学習コストとレビュー摩擦を最小化する。
- Alternatives considered: (a) 共有 helper ファイルを新規作成 → スコープ外。(b) `getPullRequest` だけを持つ最小 partial を `as GitHubClient` cast → 型の偽装になり既存パターンから逸脱するため不採用。

### D3: `sleepFn` を no-op で注入し、retry 回数を呼び出し回数で検証する

`sleepFn` には `vi.fn().mockResolvedValue(undefined)` を渡し、待ち時間を除去する。retry を伴うテストでは `sleepFn` / `getPullRequest` の呼び出し回数を assert して retry semantics を pin する。

- Rationale: 実待ち（`UNKNOWN_RETRY_DELAY_MS=3000` / `MERGEABLE_RETRY_DELAY_MS=5000`）を排除し、テストを高速・決定的にする。呼び出し回数は retry の observable な振る舞い。
- Alternatives considered: fake timer（`vi.useFakeTimers`）。`sleepFn` 注入の方が単純で意図が明確なため不採用。

### D4: retry→成功の分岐は `mockResolvedValueOnce` チェーンで表現する

UNKNOWN→CLEAN / UNKNOWN→MERGEABLE のような「2 回目で解決」分岐は、`getPullRequest` を `vi.fn().mockResolvedValueOnce(<UNKNOWN>).mockResolvedValue(<解決値>)` で構成する。retry 消尽の分岐は `mockResolvedValue(<UNKNOWN>)` で常に UNKNOWN を返す。

- Rationale: 呼び出し順に応じた段階的な戻り値を簡潔に表現できる vitest の標準イディオム。
- Alternatives considered: closure でカウンタを持つ手動スタブ。冗長なため不採用。

### D5: escalation 文字列は `toContain` で要点のみ assert する

escalation の検証は完全一致ではなく、分岐固有の substring を `toContain` で確認する。

- `fetchPrViewWithRetry` throw 分岐: `"getPullRequest"` を含む。
- `fetchPrViewWithRetry` UNKNOWN 消尽分岐: `"UNKNOWN"` を含む。
- `checkMergeableForMerge` CONFLICTING 分岐: `baseBranch`（例 `"main"`）を含む。
- `checkMergeableForMerge` UNKNOWN 消尽分岐: `"UNKNOWN"` を含む。

- Rationale: escalation 文言の言い回しは将来変わりうる。要点 substring のみ assert すれば、振る舞いを pin しつつ文言変更に対する脆さを避けられる。
- Alternatives considered: 完全一致のスナップショット assert。文言の微修正で頻繁に壊れるため不採用。

### D6: retry 回数の期待値は、export 済み定数を使える側はそれを参照する

`MERGEABLE_RETRY_COUNT` は `pr-status.ts` から export 済みのため、`checkMergeableForMerge` の retry 消尽テストはこの定数を import して期待 retry 回数（`MERGEABLE_RETRY_COUNT - 1` 回の `sleepFn` 呼び出し）を導出する。`fetchPrViewWithRetry` 側の `UNKNOWN_RETRY_COUNT` は非 export のため、テストでは 3 回（= 2 回 retry）を直値で表現する。

- Rationale: 結合度を下げられる側は定数参照で retry 回数変更に追従させる。
- Alternatives considered: `UNKNOWN_RETRY_COUNT` を export する変更。プロダクションコード変更はスコープ外のため不採用。

### D7: retry path の stderr 出力をテスト中に抑止する

retry 分岐は `stderrWrite`（`process.stderr.write` を直接呼ぶ）でログを出す。`beforeEach` で `vi.spyOn(process.stderr, "write")` してテスト出力を汚さないようにし、`afterEach` で restore する。

- Rationale: テスト実行時のノイズを抑え、CI ログを読みやすく保つ。`stderrWrite` 経由なので spy で副作用を吸収できる。
- Alternatives considered: 抑止せず放置。test は green になるが出力が汚れるため抑止を採用。

## Risks / Trade-offs

- [Risk] escalation 文言や retry 回数の将来変更でテストが壊れる → Mitigation: D5（substring assert）と D6（export 定数参照）で結合を最小化する。
- [Risk] `makeGitHubClient` の inline 複製により merge-then-archive とコードが重複する → Mitigation: architect 判断で共有 factory 集約は別作業と確定済み。重複は意図的に許容する。
- [Risk] `process.stderr.write` の spy 漏れによるグローバル状態汚染 → Mitigation: D7 で `afterEach` restore を必須とする。

## Open Questions

なし。
