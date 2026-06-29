# archive→merge ゲートを堅牢化する（merge API 委譲＋transient BLOCKED の待機）

## Meta

- **type**: spec-change
- **slug**: archive-merge-gate-hardening
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->
<!-- マージ可否の判定方式を「事前に mergeable/BLOCKED を即断ゲート」から「checks の解決を待ち merge エンドポイントの結果に委ねる」へ変える振る舞い/契約変更のため true -->

## 背景

`job archive --with-merge` は、アーカイブコミットを feature ブランチへ push（head が動く）した後、CI 待ち（Step4 wait ループ）→ マージ直前の mergeable 事前ゲート（Step5）→ squash merge と進む。この経路に、GitHub の**非同期に変化するマージ状態**を permanent 失敗として即 escalation する 2 つの過早ゲートがある。

1. **mergeable 事前ゲート（Step5）**: `mergeable` は GitHub が非同期計算するフィールドで、計算中は `null`（内部表現 `UNKNOWN`）。archive 自身の push が直前に head を動かすため到達時に `null` になりやすく、3 回×5 秒では待ち切れず**ほぼ毎回 UNKNOWN で escalation**する（人手で `gh pr merge` 運用）。
2. **wait ループの BLOCKED 即 escalation（Step4）**: archive コミット push 直後、新コミットの required check（CI）が**まだ pass していない**間、branch protection は `mergeStateStatus = BLOCKED` を返す。wait ループはこれを permanent 扱いして**CI 完了を待たずに即 escalation**する。実例（PR #724）では escalation 直後に CI が pass し `CLEAN/MERGEABLE` になった ＝ BLOCKED は transient だった。

一方、実マージを行う `mergePullRequest` は GitHub の merge エンドポイント（**同期的に可否判定**）を叩き、既存の `isMergeTransientFailure` が「計算ラグ／CI pending race」を transient retry、「conflict／CI failed」を permanent と分類する。本リクエストは 2 つの過早ゲートを是正し、checks の解決を待ったうえでマージ可否の最終判定を merge API に委ねる。

## 現状コードの前提

<!-- 書く直前に grep で再検証する。 -->

- src/core/archive/merge-then-archive.ts:332-342 — Step4 wait ループは `mergeStateStatus === "BLOCKED"` を検出すると即 escalation（"merge gate (branch protection)"）。この判定は headSha 一致待ち（:361）や check status ポーリング（:387 `getCheckStatus`）より**手前**にあり、CI 完了を待たない
- src/core/archive/merge-then-archive.ts:318-329 — 同ループは `mergeStateStatus === "DIRTY"` / `mergeable === "CONFLICTING"` を conflict として escalation（conflict はマージ前に捕捉）
- src/core/archive/merge-then-archive.ts:384-462 — check status ポーリング: `failure`→escalation、`success`→break(merge へ)、`none`→grace、`pending`→timeout まで待機
- src/core/archive/merge-then-archive.ts:466-480 — Step5 で `checkMergeableForMerge` を呼び、`!ok` なら escalation してマージに進まない
- src/core/finish/pr-status.ts:114-192 `checkMergeableForMerge` — `mergeable === "MERGEABLE"` のみ ok。`CONFLICTING`→escalation。`UNKNOWN` は 3 回（`MERGEABLE_RETRY_COUNT = 3` / `MERGEABLE_RETRY_DELAY_MS = 5000`、ハードコード）リトライ後 escalation
- src/adapter/github/github-client.ts:767 `mapMergeable` — REST `mergeable` が `null`/`undefined` のとき `UNKNOWN`（＝GitHub の計算中状態）
- src/adapter/github/github-client.ts:551-607 `mergePullRequest` — PUT merge を `retryWithBackoff(attemptMerge, { shouldRetryResult: isMergeTransientFailure, maxAttempts: mergeMaxAttempts })` で実行。200→merged、405/409 は構造化（"already merged"→idempotent success）
- src/adapter/github/github-client.ts:731-750 `isMergeTransientFailure` — transient(retry): 405"not mergeable" / "required status check ... is expected" / "base branch was modified" / "head branch was modified" / locked。permanent: 409 conflict / 405"required status check ... has failed"
- `checkMergeableForMerge` の呼び出し元は src/core/archive/merge-then-archive.ts:468 のみ（他に production 参照なし。tests/unit/core/finish/pr-status.test.ts と tests/unit/core/archive/merge-then-archive.test.ts が参照）

## 要件

<!-- 実装の最重量部を名指しする。 -->

1. **transient な BLOCKED を待機に変える（Step4）**: wait ループで `mergeStateStatus === "BLOCKED"` を検出したとき即 escalation せず、check status ポーリングへ進む。required check が `pending`（archive コミットの CI 未完了）なら timeout まで待機を続ける。check が `failure` なら既存の check-failure escalation で止まる。check が `success`（または `none` grace 消化）に解決してもなお BLOCKED が継続する場合（＝check 以外の branch protection 要件、例: 必須レビュー欠如）に限り branch-protection escalation する
2. **mergeable 事前ゲートを撤廃する（Step5）**: `checkMergeableForMerge` 呼び出し（merge-then-archive.ts:466-480）を削除し、CI green 確認（Step4 の break）後は直接 `mergePullRequest` を呼ぶ。マージ可否の最終判定は merge エンドポイントと既存 `isMergeTransientFailure` リトライに委ねる
3. **未使用になった `checkMergeableForMerge` を整理する**: 撤廃後に production 参照が無くなるため `src/core/finish/pr-status.ts` から `checkMergeableForMerge` を削除する（`fetchPrViewWithRetry` 等は対象外）。関連テストを削除/調整する
4. **マージ失敗時の escalation を区別する**: `mergePullRequest` が transient リトライを尽くしても `!merged` の場合、conflict（409）／CI 失敗（"required status check ... has failed"）／その他を区別した escalation 文言で再実行コマンドを案内する
5. **conflict 検出の喪失が無いこと**: Step4 の `DIRTY`/`CONFLICTING` 検出と merge API の 409 により、conflict は依然マージ前および実行時に fail-closed であること

## スコープ外

- Step4 の `none`（CI 未登録）60 秒 grace の設定可能化 — merge API の "required status check ... is expected" transient retry が protected branch で backstop するため本リクエストでは触らない（unprotected かつ CI 登録遅延のみ残存リスク。必要なら別リクエスト）
- `mergeMaxAttempts` 等のリトライ既定値の変更
- branch protection の required checks を問い合わせる新規 GitHub API/port の追加
- `fetchPrViewWithRetry`（mergeStateStatus UNKNOWN リトライ）の挙動変更

## 受け入れ基準

<!-- 機械検証できる文にする。 -->

- [ ] `mergeStateStatus === BLOCKED` かつ required check が `pending` のとき、escalation せず待機を継続し、check が `success` に解決した後にマージへ進むことをテストで固定する
- [ ] `BLOCKED` が継続し check が `success`/`none` に解決してもなお解けない場合（check 以外の要件）に branch-protection escalation することをテストで固定する
- [ ] `mergeable` が `UNKNOWN`（GitHub の計算中 null）でも archive のマージ経路が escalation せず `mergePullRequest` 呼び出しに進むことをテストで固定する
- [ ] 405 "not mergeable" / "required status check ... is expected" が transient retry され後続で merge 成功に至るパスをテストで固定する
- [ ] 409 conflict および 405 "required status check ... has failed" が permanent として `!merged`→escalation になることをテストで固定する
- [ ] Step4 の `DIRTY`/`CONFLICTING` 検出が不変であることをテストで確認する
- [ ] `checkMergeableForMerge` 削除後に production コードへぶら下がり参照が無く `typecheck` が green であることを確認する
- [ ] 上記以外の既存テストは無変更で `bun test` green、`typecheck` green、`bun run build` 成功

## architect 評価済みの設計判断

<!-- 採用した判断＋却下した代替案とその理由。 -->

1. **採用: transient な GitHub マージ状態を待機/委譲し、permanent 即断をやめる** — `mergeable=null`（計算中）と `BLOCKED`（push 直後の CI pending）はどちらも非同期に解決する一時状態であり、archive 自身の push が直前に head を動かすため到達時に踏みやすい。これを即 escalation するのは「解決待ち」を「不可」と誤判定する設計バグ。BLOCKED は check ポーリングに委ね、最終可否は同期判定する merge エンドポイント＋既存 `isMergeTransientFailure` に委ねる。
2. **却下: pre-gate を残し UNKNOWN / BLOCKED のリトライ回数・待機を延長** — flaky な非同期フィールド依存が残り、push 直後の状態を待つだけ時間を浪費。根治でない。
3. **却下: BLOCKED を一律に無視（escalation しない）** — 必須レビュー欠如など check 以外の branch protection 要件まで握り潰すと、マージ不能 PR を延々待つ。check が解決してもなお BLOCKED の場合に限り escalation する形で安全側に残す。
4. **却下: none-grace 設定化を本リクエストに含める** — merge API の "required status check is expected" transient retry が protected branch で backstop するため優先度低。スコープを絞る。
5. **安全性: conflict は二重に fail-closed** — Step4（`DIRTY`/`CONFLICTING`）と merge API（409）で捕捉されるため、過早ゲート是正でマージの安全性は低下しない。
