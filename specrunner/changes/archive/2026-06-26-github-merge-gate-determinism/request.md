# GitHub adapter の merge/finish ゲートの fail-open を塞ぐ（非冪等リトライ・チェック取りこぼし・Retry-After）

## Meta

- **type**: bug-fix
- **slug**: github-merge-gate-determinism
- **base-branch**: main
- **adr**: false

## 背景

deterministic な merge/finish ゲート（CI が通った PR だけマージ・マージは1回・マージ結果を正直に報告）は本プロダクトの最終アウトプットの正しさそのものだが、`src/adapter/github/github-client.ts` の3つの不具合で fail-open する。

- **① 成功した書き込みの二度打ち**: リトライが非冪等 mutation（POST/PUT/DELETE）を再送しうる。特にレート枠ゼロ判定が成功レスポンスの return より前にあるため、成功した mutation でも再送される。→ PR 重複作成、既マージ済みを「マージ失敗」と誤報告。
- **② チェックの読み取りが30件で切れる**: combined commit statuses をページネーション無しで取得するため、既定30件を超えると失敗 status を取りこぼす。→ 赤いチェックを見落としてマージ（fail-open）。
- **③ Retry-After の日付形式で待機が壊れる**: 整数秒のみ解釈するため、HTTP-date 形式だとリトライ予算を待たず一瞬で使い切る。

①③ はチェックの種類に依らず効く。② は commit status を多数（>30）ぶら下げる構成で顕在化する潜在バグ（本 repo の CI は単一の check-run のため現状は当たらないが、他プロジェクト利用・将来の status 増で刺さる）。

## 現状コードの前提

- `src/adapter/github/github-client.ts:52` の `request()` は GET/POST/PUT/DELETE 共通のリトライ付き fetch ラッパで、同一 `init`（method・body を含む）を再送する。リトライ条件は network error / 429 / X-RateLimit-Remaining:0 / 5xx。
- `src/adapter/github/github-client.ts:98-99` — X-RateLimit-Remaining が `"0"` の判定。これは成功レスポンスの `return response`（同ファイル 124行）**より前**にあり、2xx の mutation 応答でも残枠ゼロなら `continue`（再送）する。
- mutation はいずれも `request()` 経由でリトライ対象: `createPullRequest`（POST, 316行付近）/ `createIssueComment`（POST, 463行付近）/ `mergePullRequest`（PUT, 534行付近）/ `deleteRef`（DELETE, 628行）。
- `src/adapter/github/github-client.ts:90` — `Retry-After` を `Math.min(parseInt(retryAfterHeader, 10), 60)` のみで解釈。HTTP-date 形式は `parseInt` が `NaN` を返し、待機が即時化してリトライ予算を消費する。
- `src/adapter/github/github-client.ts:381` の `getCheckStatus`: check-runs は `per_page=100` + Link ヘッダのページネーションで全件取得（389-401行付近）。一方 combined commit statuses は `commits/{ref}/status` を `per_page` 指定・ページネーション無しで1回取得（402-407行付近）→ GitHub 既定の30件のみ取得し、超過分を取りこぼす。
- `request()` は渡された URL すべてに `Authorization: token ...` を付与する（60-66行）。pagination の next URL はサーバの Link ヘッダから `parseNextLink` で verbatim に取得され、同一オリジン検証はない。
- merge ゲートの consumer: `src/core/archive/merge-then-archive.ts:11`（ヘッダ記載の挙動）は「check failure → escalation（no merge）」「check success → proceed to merge」で、check rollup の失敗判定に依存する。失敗の見落としは fail-open でのマージに直結する。

## 要件

1. リトライが**非冪等 mutation（POST/PUT/DELETE）を重複実行しない**ようにする。特に X-RateLimit-Remaining:0 の分岐は、成功（2xx）レスポンスを受けたら `return` し、待機は次リクエストの前に行う形にして、成功した mutation を再送しない。429 / 5xx / network のリトライについても mutation の重複を避ける（再送前の既存リソース確認、または mutation 非リトライ＋呼出側冪等化など。機構は design 判断）。
2. `createPullRequest` / `mergePullRequest` を冪等にする: 「PR が既に存在」「既に merged」を成功として扱い、誤って失敗報告しない。
3. `getCheckStatus` の combined commit statuses を `per_page=100` + Link ページネーションで**全件取得**する（check-runs と同じ作りに揃える）。失敗 status の取りこぼしをなくす。
4. `Retry-After` を整数秒に加え HTTP-date 形式もパースし、解釈不能な値は安全な既定待機（即時リトライにしない）へフォールバックする。
5. pagination で Link の next URL をたどる際、token を付与する前に**同一オリジン（設定済み GitHub host）を検証**し、想定外ホストへトークンを送らない（B-10 host↔token 束縛の延長。pagination 追従が増えるため同時に対応）。

## スコープ外

- merge ゲートのポリシー自体（protected paths 判定・branch protection の扱い等）の変更。本 request は GitHub adapter の正しさのみ。
- レート制限のプロアクティブな事前回避（throttling）。
- 既にマージ済みの #713 / #714 のロールバック（不要）。
- subprocess の credential 封じ込め（別 request: subprocess-credential-seam）。

## 受け入れ基準

- [ ] 成功した mutation（2xx）の応答が `X-RateLimit-Remaining: 0` を含んでも再送されないことをテストで固定する。
- [ ] `mergePullRequest` が「既に merged」を `merged: true` 相当として報告し、`createPullRequest` が「既に存在」を重複作成・誤失敗にしないことをテストで固定する。
- [ ] `getCheckStatus` が commit status を2ページ以上たどり、2ページ目の failure を rollup の `failing` に反映することをテストで固定する。
- [ ] `Retry-After` の HTTP-date 形式が正しい待機へ変換されること、解釈不能値が即時リトライにならないことをテストで固定する。
- [ ] pagination の next URL が別オリジンの場合に token を付与しない（または拒否する）ことをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **採用**: 冪等性の責務配置（`request()` に idempotent フラグを持たせる / mutation は非リトライ＋呼出側で冪等化 / X-RateLimit-Remaining:0 は成功 return 後に次回呼出前で待機）のいずれかを design が選ぶ。**却下: 全リクエストを method 非依存で一律リトライ継続**（mutation 重複の温床であり、本問題の原因そのもの）。
- **採用**: ② は check-runs の既存ページネーション実装を commit statuses に横展開するのみ（新規機構不要）。
- **採用**: ⑤ の同一オリジン検証は B-10（host↔token 束縛）の延長。pagination 追加で next URL 追従が増えるため本 request で同時に入れる。
- **スコープ判断**: ① と ③ はチェック種別に依らず効くため優先。② は本 repo（単一 check-run）では現状当たらないが、クラスとしての取りこぼしを塞ぐ。
