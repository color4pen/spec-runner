# Tasks: `job archive --with-merge` の `none`（check 未出現）早期 merge を grace 待ちで塞ぐ

## T-01: merge-then-archive の `none` を grace 待し分岐に改修する

`src/core/archive/merge-then-archive.ts` の wait ループで、`none` を `success` から切り離し、初回 `none` 観測を起点とする独立 bounded クロックで grace 待しする。

- [x] module スコープに不変ハードコード定数 `NONE_CHECK_GRACE_MS = 60_000` を追加する（doc コメント: 初回 check 出現を待つ grace 上限。main の wait timeout とは独立で、config 化しない旨を記す）
- [x] Step 4 wait ループの判定 `if (rollup.state === "success" || rollup.state === "none") { break; }`（現 245 行付近）を分割する:
  - `rollup.state === "success"` → 従来どおり即 break して merge へ（メッセージも従来どおり）
  - `rollup.state === "none"` → 即 break せず grace 分岐へ
- [x] grace 分岐を実装する（main の `effectiveTimeoutMs` を一切参照しない独立クロック）:
  - ループ外（`start` 付近）に grace 起点用の変数を `let noneGraceStart: number | null = null;` で用意する（set-once。リセットしない）
  - `none` を観測したら、`noneGraceStart === null` の時のみ `noneGraceStart = nowFn()` を記録する
  - `nowFn() - noneGraceStart >= NONE_CHECK_GRACE_MS` なら grace 超過とみなし break → merge へ進む（CI 無し repo 確定。grace 経過を示す stdout メッセージを出す）
  - 未超過なら check 出現待ちの stdout メッセージを出し、`await sleepFn(pollIntervalMs)` して次周へ（`continue`）
  - 起点記録直後（初回 none、経過 0）は必ず未超過となり即 merge しないこと
- [x] `failure` / `pending` / `MERGED` / `DIRTY` / `CONFLICTING` / `BLOCKED` / headSha 欠如の既存分岐は変更しないこと（grace は `none` の時だけ発動し、check 出現時はそのまま既存分岐に落ちて合流する）
- [x] `pending` 分岐の deadline 判定（`effectiveTimeoutMs`）は grace を参照せず従来どおりであること（2 タイマーの独立を保つ）

**Acceptance Criteria**:
- 初回 `none` で即 merge せず、poll 間隔ごとに再取得して check の出現を待つ
- grace 内に check が出現したら（`pending` / `failure` / `success`）既存の wait ループ判定に合流する
- grace 経過後も `none` なら merge へ進む
- grace は `effectiveTimeoutMs`（`waitTimeoutMs: null` 含む）を参照せず独立に bounded
- grace 長は `NONE_CHECK_GRACE_MS = 60_000` の不変ハードコード定数で、config / flag / input に露出しない
- 変更は `merge-then-archive.ts` に閉じ、`orchestrator.ts` / port / adapter / config schema / CLI を touch しない
- `bun run typecheck` が green

---

## T-02: grace 挙動の unit test を追加・更新する

`tests/unit/core/archive/merge-then-archive.test.ts` に grace 挙動のテストを追加し、既存の `none → 即 merge` 前提テストを新挙動に更新する。`sleepFn` / `nowFn` を注入して時間経過を決定的に制御する。

- [x] 既存 TC-MTA-002（`none` → merge）を更新する: `getCheckStatus` が常に `NONE_ROLLUP` を返す状況で、`nowFn` を grace（60_000ms）超まで進めると merge → archive へ進むことを確認する（`sleepFn` は no-op、`nowFn` で仮想時刻を前進）。初回 none で即 merge していないこと（最低 1 回 `sleepFn` が呼ばれること）も assert する
- [x] 新 TC: 初回 `none` → 再取得で `pending` → さらに `success` の遷移を `getCheckStatus` の連続 mock で表現し、grace 内に check が出現したら既存判定に合流して最終的に merge することを確認する
- [x] 新 TC: 初回 `none` → 再取得で `failure` 出現 → merge せず exit 1 escalation（`failing` の check 名を含む）になり、`mergePullRequest` / `runArchiveOrchestrator` が呼ばれないことを確認する
- [x] 新 TC（要件2 bounded）: `waitTimeoutMs: null`（無制限）かつ `getCheckStatus` が常に `NONE_ROLLUP` の状況で、`nowFn` を grace 超まで進めると、無制限 timeout でも grace 経過後に merge へ進む（永久 hang しない）ことを確認する
- [x] grace 未超過の間は `sleepFn(pollIntervalMs)` が呼ばれ、即 merge していないことを各 TC で検証する
- [x] `success` / `failure` / `pending`→`success` / conflict / timeout / already-merged の既存 TC が引き続き green であることを確認する（grace 分岐が既存挙動を壊していないこと）

**Acceptance Criteria**:
- grace 待し（初回 none）・check 出現での合流（pending / failure / success）・grace 経過後の merge・無制限 timeout でも bounded、をカバーする TC が存在する
- 時間経過は `sleepFn` / `nowFn` 注入で制御され、実時間 60 秒を待たない
- 既存の TC（success / failure / pending / conflict / timeout / already-merged）が回帰なく green
- `bun run typecheck && bun run test` が green
