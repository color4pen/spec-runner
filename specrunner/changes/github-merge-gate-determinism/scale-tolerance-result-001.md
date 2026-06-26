---
reviewer: scale-tolerance
iteration: 1
---

# Scale-Tolerance Review: github-merge-gate-determinism

## Scope

変更対象ファイル: `src/adapter/github/github-client.ts` のみ（テストを除く）。  
全 7 つの設計決定（D1–D7）を成長コスト観点で評価する。

---

## Findings

### F-01 [note] D5: commit statuses pagination — ポーリング経路での API コスト増

**観点**: GitHub API 一覧系呼び出しのページング追加。  
**場所**: `getCheckStatus()` → `/repos/{owner}/{repo}/commits/{ref}/statuses?per_page=100` + Link 追従ループ。

**旧動作**: `/commits/{ref}/status`（singular） を 1 回呼び出し → 最大 30 件で打ち切り（silent truncation）。  
**新動作**: `/commits/{ref}/statuses`（plural）を `per_page=100` + Link ページネーションで全件取得。

**成長軸**: ある commit SHA に積み上がった status event 件数（= CI が同一コミットに対して投稿した累計イベント数）。  
deduplication（context ごとに最新 1 件のみ保持）は正しいが、ループの**ページ数は unique context 数ではなく総 event 数で決まる**。同一 context に CI が 500 回イベントを投稿した場合、5 ページ (=500/100) のフェッチが必要になる。

**呼び出し元の頻度**:  
`merge-then-archive.ts` の CI ポーリングループから呼ばれる（`specrunner job archive --with-merge` の実行中、`pollIntervalMs` ごとに繰り返し）。ただしこれはユーザーが明示的に起動するコマンドであり、バックグラウンドの定期 tick（cron / inbox tick）ではない。

**判定**: **非ブロッカー（note）**。  
旧実装が抱えていた silent truncation（30 件超で fail-open）を修正するために必然的に生じるコスト増加であり、design.md (Risk/D5) でも認識・記載済み。現実的なリポジトリでは 1 コミットの status event 累計は 100 件を超えることはほとんどなく、かつユーザー起動コマンド内に限定される。background service への影響なし。

---

### F-02 [note] D3: createPullRequest 422 fallback — listPullRequests 追加呼び出し

**観点**: 例外パスで新規 API 呼び出しが追加される。  
**場所**: `createPullRequest()` の 422 ハンドラ → `this.listPullRequests()` を 1 回呼び出し。

**成長軸**: なし（固定 1 回）。`listPullRequests` は `per_page=10` で pagination なしの 1 フェッチ。  
**頻度**: 422 "already exists" は例外パス。通常の PR 作成では発生しない。

**判定**: **非ブロッカー（note）**。コスト増加は局所的で無視できる。

---

### F-03 [pass] D1/D2: API 呼び出し削減

D1（X-RateLimit-Remaining:0 retry 削除）と D2（POST/PUT 5xx retry 削除）は既存のリトライを除去する変更であり、成長コストを減じる。ページング経路・定期実行経路ともに影響なし。

---

### F-04 [pass] D7: validateSameOrigin — 既存ループへの追加

`validateSameOrigin` は `new URL()` による同一オリジン検証を各ページネーションループの先頭に追加するのみ。API 呼び出しは増加しない。  
`searchOpenIssuesByLabel` と `listIssueComments` は `inbox run`（cron 経由の定期実行）から呼ばれるが、追加される計算コストは 1 ループ反復あたり `new URL()` 2 回（< 1 µs）であり無視できる。

---

## Summary

| 決定 | 成長軸 | 呼び出し経路 | 判定 |
|------|--------|-------------|------|
| D1: RateLimit retry 削除 | API 呼び出し減少 | — | pass |
| D2: POST/PUT 5xx retry 削除 | API 呼び出し減少 | — | pass |
| D3: createPullRequest 422 fallback | 固定 1 回の追加 GET | 例外パス（手動） | note |
| D4: mergePullRequest already-merged | なし | — | pass |
| D5: commit statuses pagination | 累積 status event 数 / 100 | ユーザー起動コマンド内ポーリング | note |
| D6: parseRetryAfter | なし | — | pass |
| D7: validateSameOrigin | なし（純粋計算） | 定期 tick 含む全経路 | pass |

F-01 は設計上已むを得ないコスト増（旧 silent truncation の修正対価）で、かつユーザー起動コマンド内に限定される。needs-fix 閾値（定期実行経路に単調増加コストを新規追加）には該当しない。

---

- **verdict**: approved
