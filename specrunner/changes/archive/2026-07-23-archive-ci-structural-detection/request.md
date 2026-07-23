# archive --with-merge の CI 有無判定を時間観測から構造判定に変える

## Meta

- **type**: spec-change
- **slug**: archive-ci-structural-detection
- **base-branch**: main
- **adr**: true

## 背景

`job archive --with-merge` の CI 待ちは、PR に checks が 60 秒以内に出現しない場合「CI-less repo」と仮定して merge に進む。GitHub Actions の起動が queue 混雑等で 60 秒を超えて遅延すると、CI のある repo で CI 未検証のまま merge される（fail-open）。実例として、checks 未出現 60 秒で merge が実行され、merge 後に base branch 側で CI が queued になった run が確認されている（repo に CI は存在し、単に起動が遅かった）。

repo が CI を持つかは時間観測ではなく構造（workflow 定義の存在）で判定できる。CI あり判定なら checks 出現まで fail-closed で待つべきである。

## 現状コードの前提

- src/core/archive/merge-then-archive.ts:52 — `NONE_CHECK_GRACE_MS = 60_000`。rollup "none" がこの時間続くと CI-less と仮定する
- src/core/archive/merge-then-archive.ts:608-625 — `rollup.state === "none"` が grace 超過かつ非 BLOCKED の場合「Assuming CI-less repo; proceeding to merge...」で merge に進む
- src/core/archive/merge-then-archive.ts:163 — 待ちの上限は `waitTimeoutMs`（undefined → DEFAULT_MERGE_WAIT_TIMEOUT_MS、null → 無期限）で config の `archive.mergeWaitTimeoutMs` から供給される
- src/core/archive/merge-then-archive.ts:280-290 — archive commit（CI 待ちの対象 SHA）は `runArchiveOrchestrator` が local worktree で作成し push する。したがって判定対象 SHA の tree は local git で検査できる

## 要件

1. repo が CI を持つかを時間観測でなく構造で判定する: PR head（archive commit）の tree に `.github/workflows/` 配下の workflow 定義が存在し、push / pull_request トリガを含むなら「CI あり」と判定する
2. CI あり判定の場合、checks 未出現（rollup "none"）でも merge に進まず、`mergeWaitTimeoutMs` の期限まで待ち続ける。期限超過時は merge せず escalation する（fail-closed）
3. 「CI-less と仮定して merge」は、workflow 定義が存在しない、または push / pull_request トリガを含む workflow が 1 つも無い場合に限定する。CI-less 判定時の既存 grace 挙動は維持してよい
4. トリガ判定は依存追加なしで行う（YAML parser を追加しない）。テキストレベルのトリガ検出で足り、誤検出は待つ側（fail-closed）に倒れるため許容する
5. 判定は local git で行い、GitHub API の呼び出しを増やさない

## スコープ外

- `BLOCKED_CHECK_GRACE_MS`（branch protection 遅延 grace）の変更
- workflow run 実績の API 照会による判定
- `mergeWaitTimeoutMs` の既定値変更
- paths フィルタ等による「この PR では workflow が発火しない」ケースの厳密判定（CI あり判定 → checks 未出現 → timeout escalation となり、安全側に倒れる）

## 受け入れ基準

- [ ] push / pull_request トリガの workflow を持つ tree では、rollup "none" が grace を超えても merge に進まず、`mergeWaitTimeoutMs` 超過で escalation することをテストで固定する
- [ ] workflow 定義の無い tree では従来どおり grace 超過後に merge へ進むことをテストで固定する
- [ ] schedule のみ等、push / pull_request トリガを含まない workflow だけの tree では CI-less 判定になることをテストで固定する
- [ ] 新規 package 依存を追加しない（package.json の dependencies 無変更）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: PR head tree の `.github/workflows/` を local git で検査し、テキストレベルで push / pull_request トリガを検出する。誤検出（トリガ無しを有りと判定）は待つ側に倒れ、timeout escalation で operator に渡るため安全
- **却下**: workflow run 実績の API 照会 — GitHubClient port の拡張と API 呼び出し増を伴い、workflow を追加した直後の repo（実績ゼロ）で誤判定する
- **却下**: YAML parse による厳密なトリガ解釈 — 依存追加が依存極小の原則に反する。テキスト検出との差分は fail-closed 側に吸収される
