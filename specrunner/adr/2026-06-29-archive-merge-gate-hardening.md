# ADR-20260629: archive→merge ゲートを堅牢化する（merge API 委譲＋transient BLOCKED の待機）

## ステータス

accepted

Supersedes: [ADR-20260603-with-merge-wait-until-green](2026-06-03-with-merge-wait-until-green.md) の D3（`checkMergeableForMerge` を残す決定・Step4 の BLOCKED 即 escalation 挙動）

## コンテキスト

[ADR-20260603-with-merge-wait-until-green](2026-06-03-with-merge-wait-until-green.md) は `job archive --with-merge` を「check rollup が green になるまで wait ループで待ち、green 確定後に merge する」設計として確立した。その D3 は wait ループ後に `checkMergeableForMerge`（`mergeable` フィールドの MERGEABLE 最終 guard）を残すと明記しており、また wait ループ内で `mergeStateStatus === "BLOCKED"` を検出した場合は即 escalation する挙動を保持していた。

この 2 つの判定が、GitHub の**非同期に変化するマージ状態**を permanent 失敗として即 escalation する過早ゲートになっていることが判明した。

**過早ゲート 1 — Step5 mergeable 事前ゲート**（`merge-then-archive.ts:466-480` → `pr-status.ts:114-192`）:
`mergeable` フィールドは GitHub が非同期で計算するフィールドであり、計算中は `null`（REST adapter では `UNKNOWN` にマッピング）を返す。archive 自身の push が直前に PR head を動かすため、Step5 に到達した時点でほぼ常に `UNKNOWN` になる。3 回×5 秒（`MERGEABLE_RETRY_COUNT = 3` / `MERGEABLE_RETRY_DELAY_MS = 5000`、ハードコード）では待ちきれず、ほぼ毎回 UNKNOWN escalation して手動 `gh pr merge` 運用を強いられていた。

**過早ゲート 2 — Step4 BLOCKED 即 escalation**（`merge-then-archive.ts:332-342`）:
archive コミットを feature branch に push した直後、新コミットの required check（CI）がまだ pass していない間、branch protection は `mergeStateStatus = BLOCKED` を返す。wait ループはこれを headSha 一致待ち（:361）や check status ポーリング（:387）より**前に** permanent として escalation しており、CI 完了を待たずに失敗させていた。PR #724 の実例では escalation 直後に CI が pass し `CLEAN/MERGEABLE` になったことが確認されており、この BLOCKED は transient だった。

一方、実マージを行う `mergePullRequest`（`github-client.ts:551-607`）は GitHub の merge エンドポイントを叩き、その `isMergeTransientFailure`（:731-750）が「計算ラグ／CI pending race」（405 "not mergeable" / "is expected"）を transient retry、「conflict（409）/ CI failed（"has failed"）」を permanent として既に正しく分類している。merge エンドポイントは**同期的に**可否を判定する唯一の信頼できる権威であり、上記 2 つの過早ゲートは何も追加しない。

[ADR-20260628-archive-on-branch-first](2026-06-28-archive-on-branch-first.md) により archive 記帳が merge 前に feature branch へ push される設計に変わったため、archive 自身の push が head を動かす挙動はより頻繁かつ意図的になっており、過早ゲートへの到達率が高まっている。

## 決定

### D1: transient な BLOCKED を待機に変え、check ポーリングへ委ねる

**決定**: wait ループから「`mergeStateStatus === "BLOCKED"` なら即 escalation」するブロック（`merge-then-archive.ts:332-342`）を削除する。代わりに per-iteration の `isBlocked` フラグを捕捉し、check status ポーリングの**terminal 判定点**でのみ BLOCKED の継続を評価する。

評価ポリシー:

| check rollup | BLOCKED の扱い |
|---|---|
| `pending` | escalation しない。wait ループで待ち続ける（既存 deadline 準拠）|
| `failure` | check-failure escalation（既存経路、BLOCKED に関係なく発火）|
| `success` / `none`（grace 消化後）| `isBlocked` ならば branch-protection escalation。そうでなければ merge へ |

**採用理由**: PR #724 の障害は「CI pending 中の BLOCKED を permanent と誤断した」ことが原因。BLOCKED の評価を check terminal 判定点に移すと、CI 未完了の間は escalation を発火させず、check が解決してもなお BLOCKED が継続する場合（check 以外の branch protection 要件 — 例: 必須レビュー欠如）にのみ escalation する。この条件は再実行では解決できないため branch-protection escalation が正しい。

**conflict 優先の維持**: Step4 の conflict 検出（`mergeStateStatus === "DIRTY"` / `mergeable === "CONFLICTING"`）は BLOCKED 評価より**手前**にあり、conflict が BLOCKED に紛れない順序を保つ。

**却下案 — BLOCKED のリトライ回数・待機を延長**: flaky な非同期フィールドへの依存が残り、push 直後の状態を待つだけ時間を浪費する。根治でない。

**却下案 — BLOCKED を一律に無視（escalation なし）**: 必須レビュー欠如など check 以外の branch protection 要件まで握り潰すと、マージ不能 PR を延々待つ。check が解決してもなお BLOCKED の場合に限り escalation する形で安全側に残す。

### D2: Step5 mergeable 事前ゲートを撤廃し、最終判定を merge エンドポイントに委ねる

**決定**: `checkMergeableForMerge` の呼び出し（`merge-then-archive.ts:466-480`）と import を削除する。Step4 の wait ループが green check で break した後、直接 `mergePullRequest` を呼ぶ。`mergeable === "UNKNOWN"` はもはや merge 経路をブロックしない。

**採用理由**: `mergeable` フィールドは非同期計算であり、archive の push 直後は信頼できない。merge エンドポイントは同期的に可否を判定する権威であり、既存の `isMergeTransientFailure` が「計算ラグ（transient）」と「conflict/CI 失敗（permanent）」を既に正しく分類している。事前ゲートはこの二重チェックの flaky 版にすぎず、安全上の付加価値がない。

**conflict 安全性**: wait ループが `DIRTY`/`CONFLICTING` を検出する経路（D5 参照）と merge エンドポイントの 409 判定（D4 参照）が残るため、conflict の fail-closed 特性は維持される。

**却下案 — pre-gate を残し UNKNOWN retry を延長**: 非同期フィールド依存が残る。archive 頻度が上がるほど待機コストが増え、根治にならない。

### D3: 未使用になった `checkMergeableForMerge` を production コードから削除する

**決定**: D2 により production caller がなくなる `checkMergeableForMerge` と関連 export（`MERGEABLE_RETRY_COUNT` / `MERGEABLE_RETRY_DELAY_MS` / `CheckMergeableResult`）を `src/core/finish/pr-status.ts` から削除する。`fetchPrViewWithRetry` / `PrViewData` / `PrViewFetchResult` 等の finish-path で使用中のシンボルは対象外。

**採用理由**: 過早ゲートの問題点（flaky な非同期フィールドへの依存）を抱えたまま dead code を残すと、将来の呼び出し元が同じバグを再導入するリスクがある。

**却下案 — exported utility として残す**: 同フィールドに依存する誤った設計を暗黙に正当化し、再導入の足場になる。削除が最も安全。

### D4: merge エンドポイント失敗時の escalation を cause ごとに区別する

**決定**: `mergePullRequest` が transient retry を尽くして `{ merged: false }` を返したとき、`result.message`（lowercase）を以下の 3 バケツに分類し、それぞれ異なる escalation 文言と推奨アクションを提示する。

| 分類 | 条件 | 推奨アクション |
|---|---|---|
| conflict | message に `"conflict"` を含む | base ブランチへ rebase してから再実行 |
| checks-failed | message に `"required status check"` かつ `"has failed"` を含む | 失敗している required check を修正してから再実行 |
| other | 上記以外 | branch protection 要件を確認してから再実行 |

すべての escalation に `specrunner job archive --with-merge` の再実行コマンドを含める。

**採用理由**: 単一の汎用メッセージでは conflict・CI 失敗・その他 branch protection 要件を区別できず、次アクションが分からない。merge エンドポイントの message は同期的権威の診断情報であり、分類の最も信頼できる根拠。

**却下案 — raw message をそのまま表示**: GitHub の文言はユーザーが解釈する必要があり、actionable でない。

### D5: conflict 検出の二重 fail-closed を維持する

**決定**: Step4 の `mergeStateStatus === "DIRTY"` / `mergeable === "CONFLICTING"` 検出（`merge-then-archive.ts:318-329`）を変更しない。merge エンドポイントの 409 conflict → D4 の conflict バケツも維持する。

**採用理由**: D1 / D2 は merge 判定の過早ゲートを取り除くが、いずれも conflict ガードではない。conflict は依然 Step4（pre-merge）と merge エンドポイント（実行時）の 2 層で fail-closed に捕捉される。過早ゲート是正がマージ安全性を低下させないことを明示する。

## 検討した代替案

### A1: BLOCKED / UNKNOWN のリトライ回数と待機時間を大幅に延長する（現行 pre-gate の維持）

`MERGEABLE_RETRY_COUNT` / `MERGEABLE_RETRY_DELAY_MS` を大きくし、BLOCKED の即 escalation にも retry を付ける案。

- **Pros**: 変更量が小さい
- **Cons**: flaky な非同期フィールドへの依存が残る。push 直後の状態を待つだけで時間を浪費し、「何回待てば十分か」を決められない。archive push 頻度が上がるほどコストが増加する。根治でない。
- **Why not**: 過早ゲートの問題は「非同期フィールドに依存する pre-gate そのもの」にあり、retry 延長は対症療法にすぎない。

### A2: BLOCKED を一律に無視し escalation を完全に撤廃する

BLOCKED を永久に「pass through」して check 結果だけで判定する案。

- **Pros**: 実装が単純になる
- **Cons**: 必須レビュー欠如など check 以外の branch protection 要件を握り潰す。マージ不能 PR に対して merge エンドポイントが何度も reject するまで wait が続く。
- **Why not**: check が terminal に解決してもなお BLOCKED の場合に branch-protection escalation することで安全側を維持する。D1 の「terminal 判定点でのみ評価」で十分。

### A3: `checkMergeableForMerge` を dead code として残す

D2 後も production caller なしで残す案。

- **Pros**: 変更量が最小
- **Cons**: 過早ゲートの問題を抱えた実装が残り、将来の呼び出し元がバグを再導入するリスクがある。
- **Why not**: 安全上の付加価値がなく、削除することで再導入リスクを型レベルで排除できる。

### A4: merge 失敗時に GitHub の raw message をそのまま表示する

`mergePullRequest` が `{ merged: false }` を返したとき、`result.message` を分類せずそのまま escalation メッセージに含める案。

- **Pros**: 実装が単純。GitHub の原文が将来変わっても分類ロジックの更新が不要。
- **Cons**: conflict なのか CI 失敗なのか branch protection 要件なのかが一目で分からず、次アクションをオペレーターが GitHub の文言から自分で解釈する必要がある。actionable でない。
- **Why not**: merge エンドポイントが返す message は同期的権威の診断情報であり、conflict（"conflict"）/ CI 失敗（"required status check ... has failed"）/ その他 という 3 分類はパターンが安定している。分類することで推奨アクション（rebase / CI 修正 / review 取得）を明示でき、オペレーターの判断コストを削減できる。

## 影響

### Positive

- archive 後の自動 merge が人手介入なしに通るケースが大幅に増える。UNKNOWN escalation による手動 `gh pr merge` 運用が不要になる。
- CI pending 中の transient BLOCKED が escalation を発火させなくなり、CI green 後に自動でマージに進む。
- 失敗時の escalation が cause 別に区別されるため、次アクション（rebase / CI 修正 / review 取得）が明確になる。
- `checkMergeableForMerge` と関連定数の削除により dead code が排除され、`pr-status.ts` が整理される。

### Negative

- **残存リスク: check 解決直後に BLOCKED が瞬間的に残るケース**: GitHub が全 check を `success` と報告しつつ、同一 fetch でまだ `mergeStateStatus = BLOCKED` を返す窓がある（計算ラグ）。この場合は branch-protection escalation が発火するが、再実行 1 回で解消する。BLOCKED を terminal 判定点でのみ評価する設計により、従来の「CI pending 中 BLOCKED」という主な問題は解消されるが、この狭い窓は残存する。
- **残存リスク: `none` grace 経過後も BLOCKED のケース（CI 未登録）**: required check が 60 秒 grace 内に登録されなかった場合、grace 消化時点で BLOCKED であれば branch-protection escalation になる。merge エンドポイントの "required status check ... is expected" transient retry が protected branch で backstop するが、unprotected branch でこのケースに当たると escalation になる。再実行で解消可能。

### Known Debt

- **check 解決後 BLOCKED の bounded re-poll 未実装**: 上記「check 解決直後に BLOCKED が瞬間的に残る」リスクに対し、terminal 判定点で 1〜2 回 re-poll する緩和策を検討したが、スコープを絞る判断でスコープ外とした。flaky が実証されれば別 request で対処する。
- **`none` grace 設定可能化の未実装**: CI 登録遅延が頻繁に起きる環境では `NONE_CHECK_GRACE_MS`（60 秒）の拡張が有益だが、protected branch では merge エンドポイントが backstop するため優先度低。必要なら別 request で扱う。

## 参照

- Request: `specrunner/changes/archive-merge-gate-hardening/request.md`
- Design: `specrunner/changes/archive-merge-gate-hardening/design.md`
- Supersedes: [ADR-20260603-with-merge-wait-until-green](2026-06-03-with-merge-wait-until-green.md) — D3 の `checkMergeableForMerge` 存置決定・Step4 BLOCKED 即 escalation 挙動
- Related: [ADR-20260628-archive-on-branch-first](2026-06-28-archive-on-branch-first.md) — archive 記帳を feature branch へ先行 push する設計（本変更の直接的な背景）
- Related: [ADR-20260603-finish-branch-protection-gate](2026-06-03-finish-branch-protection-gate.md) — `isMergeTransientFailure` の pending/failed 分離（本変更で archive 経路に適用）
- Related: [ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md) — client-closed 不変条件（本変更でも `orchestrator.ts` は GitHubClient を import しない）
