# Design: egress-ledger-push-failure

## Context

egress backstop は「publish range のすべての commit が `synthesizedCommits` 台帳に記録済みであること」を push 前に検証する fail-closed の関所である。この不変式は「commit を作成したら OID は必ず台帳に永続化される」という前提に立つ。

現行実装の逐次 step 経路（`commitAndPush`）はこの前提を満たさない。commit 作成後に `pushOnly` が throw すると、`commitSuccess` に到達しないため `appendSynthesizedCommit` + `store.persist` が実行されない。branch 上には commit が残るが台帳追記は失われる。

並列 round 経路（`parallel-review-round.ts:435-448`）にはこの問題への対処が既に実装されている（push 失敗時も OID をキャプチャして escalation を通じて `commitRound` → `store.persist` へ流す）。本修正は同じ不変式を逐次 step 経路と `commitFinalState`（checkpoint / finalize）に移植する。

実運用での観測された連鎖:
1. synthesis commit 作成 → push 失敗（GitHub 一過性障害）→ OID 台帳未記録
2. `commitFinalState` が checkpoint commit を作成 → egress 検証が手順 1 の OID を unknown と判定 → push skip
3. resume 後、publish range に孤児 commit 2 件が残り → `EGRESS_UNKNOWN_COMMIT` で永久 halt

診断を困難にした副問題:
- `pushOnly` の stderr を `gitExecExitCode` が破棄するため exit code しか残らない
- `verifyEgressLedger` が branch を渡さず空文字をハードコードするため EGRESS_UNKNOWN_COMMIT メッセージに branch 名が表示されない

## Goals / Non-Goals

**Goals**:
- 逐次 step の synthesis commit（scoped / guarded 両モード）を、push 試行前に store へ永続化する
- `commitFinalState` の checkpoint / finalize commit を、push 試行前に store へ永続化する
- `pushOnly` の失敗 detail に git の stderr（最終試行分）を含める
- `verifyEgressLedger` の `EGRESS_UNKNOWN_COMMIT` メッセージに実 branch 名を含める
- 上記を再発防止 pin テストで固定する

**Non-Goals**:
- 台帳がずれた既存 job の事後回復経路（operator 承認による台帳補完）
- push リトライ回数・待機時間の変更
- egress 検証の fail-closed 動作そのものの変更
- 並列 job start の明示ブロック / 排他制御

## Decisions

### D1: commit 作成と OID 永続化を不可分にする（push 前に persist）

**決定**: `commitAndPush` が commit を作成した直後（`pushOnly` 呼び出し前）に `rev-parse HEAD` で OID を取得し、注入された `persistBeforePush` コールバックで store に永続化する。`commitFinalState` でも同様に、checkpoint/finalize commit 直後・push 前に同コールバックを呼ぶ。

**根拠**: push の成否が台帳の完全性に影響しない順序保証（作成 → 記録 → push）を実現する最小の変更。既に `parallel-review-round.ts:435-448` で実証済みの対処の逐次経路への移植であり、新機構の発明ではない。

**却下した代替案**:
- **push 失敗時のみ persist**: 成功/失敗で分岐が生じ、push 結果を `commitAndPush` の呼び出し元まで伝播させる必要がある。経路分岐が増え検証が複雑になる。順序保証の方が単純
- **resume 時に publish range を再走査して未記録 commit を推測補完**: 事故後の推測より事故を起こさない順序保証が先。正当な commit と不審な commit を機械的に区別できず backstop の意味を弱める
- **push 失敗を warn に格下げして走行を続行**: egress 不変式と「push は進捗の保存」という前提を壊す

### D2: `persistBeforePush` の注入経路

**決定**: 
- `commitAndPush` 向け: `CommitPushInfra` インターフェースにオプショナルフィールド `persistBeforePush?: (oid: string) => Promise<void>` を追加する。`LocalRuntime.finalizeStepArtifacts` から `state.jobId` と `slugStoreOpts()` を使って `updateJobState(appendSynthesizedCommit)` を渡す。
- `commitFinalState` 向け: 既存の params オブジェクト（`{ cwd, branch, slug, spawnFn, messageLabel, synthesizedCommits }`）に同名のオプショナルフィールドを追加する。`LocalRuntime.commitFinalState` から同様のコールバックを渡す。

**根拠**: 
- `CommitPushInfra` は既に `commitAndPush` / `commitScopedPaths` 両方の DI seam として機能している。parallel round は `persistBeforePush` を提供しないため既存テストへの影響なし（optional field）
- `commitFinalState` の params は既に構造体であり、フィールド追加の変更コストが低い
- `commitAndPush` は store を直接知らなくてよい（コールバック経由で疎結合を保つ）

**却下した代替案**:
- **別パラメータとして追加**: シグネチャが広がるが `CommitPushInfra` 拡張と比較して優位性なし
- **`commitAndPush` がストアを直接受け取る**: 依存性が増え、テストでのモック構築が複雑になる

### D3: `pushOnly` の stderr 取得

**決定**: `pushOnly` 内の `gitExecExitCode`（stderr 破棄）を `runSubprocess` に置き換え、最終試行の `stderr` を `pushFailedError` の detail に含める。`commitFinalState` の push 失敗警告にも `push2.stderr` を含める。

**根拠**: `gitExecExitCode` は exit code しか返さず、git の失敗原因が一切残らない。`runSubprocess`（`git-exec.ts` 既存関数）は stdout / stderr / exitCode を返す。インターフェース変更なしに診断情報を改善できる。

**却下した代替案**:
- **`gitExecResult` を使う**: `gitExecResult` は git-exec.ts の `SpawnFn` を引数に取り ok/exitCode を返す。`runSubprocess` の方が stdout/stderr まで取れるため適切

### D4: `verifyEgressLedger` に branch を追加

**決定**: `verifyEgressLedger` の params に `branch?: string` を追加し、`egressUnknownCommitError(oid, params.branch ?? "")` で使用する。`commitFinalState` の呼び出し側で `branch` を渡す（既に引数で受け取っている）。

**根拠**: `runInlineEgressCheck`（:352-381）は既に branch を受け取り同じエラーを生成しており、`verifyEgressLedger` のみが空文字をハードコードしている。整合を取るだけで足りる。

### D5: テスト配置

**決定**: 新テストファイル `src/core/step/__tests__/commit-push-egress-invariant.test.ts` に集約する。

- `commitAndPush` (scoped / guarded) における push 失敗時の `persistBeforePush` 呼び出し検証
- `commitFinalState` における push 成否を問わない OID 永続化検証
- push 失敗 → 再実行時の egress 検証 pin（resume 再現テスト）
- `pushFailedError` stderr 包含
- `verifyEgressLedger` branch 名包含

`parallel-review-round-git-effects.test.ts` 等の既存テストは無変更で green を確認する（`CommitPushInfra` への optional field 追加のみのため既存テストの破壊なし）。

## Risks / Trade-offs

- [Risk] `persistBeforePush` コールバックが失敗した場合、push 前に止まるか無視するかの選択。→ **Mitigation**: throw させて `commitAndPush` を halt させる。台帳への書き込みが確認できなければ push しない方が安全（fail-closed）。ただし `commitFinalState` は best-effort パスのため try-catch で warn に留める。

- [Risk] checkpoint commit 内部の state.json に自身の OID が含まれない。→ **Mitigation**: resume は disk 上の store（state.json ではなく events.jsonl + snapshot）を読む。checkpoint 内部 state と disk store の乖離は許容済み（request.md architect 評価に明記）。

- [Risk] `CommitPushInfra` にフィールドを追加することで parallel round の既存テストが壊れる。→ **Mitigation**: optional field のため既存コードへの影響なし。parallel round の `commitRoundArtifacts` → `commitScopedPaths` 経路は `CommitPushInfra` を受け取るが `persistBeforePush` は不要（parallel round は orchestrator 経由で持つ）。

## Open Questions

なし。architect 評価済みの設計判断で全分岐が確定している。
