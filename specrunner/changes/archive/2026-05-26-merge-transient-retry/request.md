# finish Phase 3 (squash merge) の transient failure を exponential backoff retry で吸収する

## Meta

- **type**: bug-fix
- **slug**: merge-transient-retry
- **base-branch**: main
- **adr**: false

## 背景

`specrunner job finish` の Phase 3 (squash merge) が **transient failure で halt し、user の手動 retry が必要** な状態が常態化している。本セッション中だけで PR #389 / #393 / #396 / #397 の **4 回再発**。

### 実例 (本セッションで観測)

```
Phase 2: git push origin feat/...
Pushed feat/... to origin.
Phase 3: merging PR #389...
=== specrunner finish: escalation ===
Failed Step:       Phase 3 (REST API squash merge)
Detected State:    merge failed: Base branch was modified. Review and try the merge again.
```

`bun ./bin/specrunner.ts job finish <slug>` を即再実行すれば必ず通る = **典型的な transient failure**。実際に base が動いた訳ではない (`git rev-list --left-right --count origin/main...PR = 0 N`)。

### 既存の polling 機構

`src/core/finish/pr-status.ts` に 3 段の polling が既に存在:

| 場所 | 名前 | retry 条件 | 設定 |
|---|---|---|---|
| Phase 0 (pre-flight) | `fetchPrViewWithRetry` | `mergeStateStatus === UNKNOWN` | 3 回 × 3 秒 |
| Phase 2 (push 後) | `pollMergeStateAfterPush` | 任意の non-CLEAN | 5 回 × 3 秒 = 最大 15 秒 |
| Phase 3 (merge 前) | `checkMergeableForMerge` | `mergeable === UNKNOWN` | 3 回 × 5 秒 |

つまり Phase 2 → Phase 3 の間に最大 30 秒の polling がある。**それでも transient failure が発生する**。

### 何故 polling では防げないか

#### (a) `pollMergeStateAfterPush` の exhausted fallback

`pr-status.ts:241-243`:
```ts
// Exhausted — return empty string so Phase 3 attempts merge anyway (no escalation)
return { mergeStateStatus: "" };
```

→ 5 回 retry しても CLEAN にならなかったら escalate せず空文字を返して Phase 3 へ進む。**「待ち切れなかった」状態で merge を試行する path がある**。

#### (b) CLEAN を返しても TOCTOU

```
1. polling: mergeStateStatus=CLEAN (= GitHub の再計算終わった)
2. ... ラグ (数百 ms〜数秒) ...
3. merge 実行: GitHub 内部で別の整合性 check → 405 + "Base branch was modified"
```

本セッションで観測した実例 (PR #389 / #393 / #396) は **`Post-push polling` の log が出ていない** = 1 回目で CLEAN を返したのに merge 実行で失敗 = TOCTOU 確定。

### 業界の標準パターン

GitHub Actions / Octokit エコシステムでは確立された手法:

- `@octokit/plugin-retry` — REST API 全体への汎用 retry plugin (5xx / rate limit)
- `peter-evans/enable-pull-request-automerge` Action — 422 / 423 (Locked) を transient として GraphQL mutation を retry
- `pascalgn/automerge-action` — 内部 retry あり、`MERGE_RETRY_SLEEP` 環境変数で sleep 時間を設定可能

**spec-runner も同様の retry を `mergePullRequest()` 実行に被せる**のが本 request の趣旨。

## 要件

1. **`mergePullRequest()` の呼び出しに exponential backoff retry を入れる**
   - 対象: `src/core/finish/orchestrator.ts:520-549` の `mergeFeaturePrPhase3()` 内 line 523 周辺
   - retry pattern: `1s → 2s → 4s` の 3 段 backoff (= 合計最大 7 秒待ち)
   - retry 上限 3 回 (= 通常 1〜2 回で通る経験値より)

2. **transient vs permanent の判定基準を明示 (各層の責務分離)**
   - **既存層**: `src/adapter/github/github-client.ts:97-105` の `request()` 内部で **HTTP 5xx を最大 3 回 retry** 済 (= 全 GitHub API 呼び出しに適用される汎用 retry)
   - **本 request で追加する層**: `mergePullRequest()` レベルの retry は **`request()` 層がカバーしない 405/423 系のみ**を対象にする (= 二重 retry にならない設計)
   - transient と判定する条件 (= 本 request の retry 対象):
     - HTTP 405 + message に `"Base branch was modified"` を含む
     - HTTP 405 + message に `"unstable state"` を含む
     - HTTP 423 (Locked) — branch protection の一時 lock
   - **5xx は対象外**: 既存 `request()` 層で吸収済のため、本 request では扱わない
   - permanent と判定する条件 (= retry せず即 escalation):
     - HTTP 403 (権限不足)
     - HTTP 409 (実 conflict)
     - HTTP 422 + Required status check 系 message
     - その他 405 (= "Pull request is not mergeable" 等)
   - 判定ロジックは `src/adapter/github/github-client.ts:385-388` 周辺 (= 既存の 405/409 ハンドリング箇所) に追加

3. **retry 中の log 出力**
   - 既存 polling と整合的な形式: `"<context> merge retry: <message>, retrying (<attempt>/<max>)..."`
   - `<context>` プレースホルダは配置先 (= 要件 4 の adapter vs orchestrator) によって決定:
     - adapter 配置の場合: `"GitHub PR merge retry: ..."` (= phase 概念を持たない)
     - orchestrator 配置の場合: `"Phase 3 merge retry: ..."` (= phase 名で文脈明示)
   - sleep 中も log を出して user が「動いてる」と分かるように

4. **adapter / orchestrator のどちらに retry logic を置くか**
   - 案 (a): `github-client.ts` の `mergePullRequest()` 内部に retry logic を埋め込む (= adapter 内部で透過)
   - 案 (b): `orchestrator.ts` の `mergeFeaturePrPhase3()` 側で wrapper として retry
   - どちらを採用するかは design step で決定。私の意見は (a) — 「PR merge は transient 失敗を吸収する operation」として adapter 責務に閉じる方が綺麗

5. **汎用 retry helper の抽出 (throw + return-value の両方を検査可能に)**
   - `src/util/retry.ts` (新規) に `retryWithBackoff(fn, opts)` を export
   - **重要**: `mergePullRequest()` は 405/423 を **throw せず `{ merged: false, message }` として返す** ため、retry helper は **return 値ベースの transient 判定**もサポートする必要がある
   - 将来他の API 呼び出し (push / status check 等) でも再利用可能な形にする
   - implementation 案 (両方の判定軸を持つ):
     ```ts
     export async function retryWithBackoff<T>(
       fn: () => Promise<T>,
       opts: {
         isTransientError?: (err: unknown) => boolean;       // throw された err の判定
         shouldRetryResult?: (result: T) => boolean;          // return 値の判定 (e.g. { merged: false } の transient case)
         maxAttempts?: number;
         baseDelayMs?: number;
         sleepFn?: (ms: number) => Promise<void>;
         onRetry?: (attempt: number, info: { err?: unknown; result?: T }) => void;
       },
     ): Promise<T>;
     ```
   - `mergePullRequest()` は `shouldRetryResult: (r) => !r.merged && isTransientMessage(r.message)` で 405/423 系の transient を捕捉する

## スコープ外

- **Phase 2 push の retry** — push 自体は git CLI で行われ、別の失敗モードを持つ。本 request は Phase 3 merge API のみ対象
- **既存 polling 機構の改修** — `pollMergeStateAfterPush` / `checkMergeableForMerge` はそのまま維持、本 request は merge 実行側の retry を**追加**する形
- **Octokit / @octokit/plugin-retry の導入** — spec-runner は fetch 直叩きで Octokit を使っていない。依存追加のコストと比較して自前 retry helper の方が小回り効く
- **GraphQL API への移行** — REST API 維持、merge endpoint のみ retry 対応
- **circuit breaker / rate-limit-aware backoff** — 一定時間内に N 回失敗で一時停止する高度な制御は本 request では扱わない、shortest path で transient を吸収するだけ
- **`finish` 以外の GitHub API 呼び出し** (PR view / push / branch check) — 本 request は Phase 3 merge のみ。他の transient 対策は別 request で扱う (= 汎用 helper を export しておけば後続で再利用可能)

## 受け入れ基準

- [ ] `mergePullRequest()` 実行時、transient failure (405 + "Base branch was modified" / 405 + "unstable state" / 423) を検出すると **3 回まで exponential backoff retry** される
- [ ] 1〜2 回目の retry で成功すれば pipeline は escalation せず Phase 4 に進む
- [ ] 3 回 retry 後も失敗した場合は現状と同等の escalation 出力
- [ ] permanent failure (403 / 409 / 422 / branch protection 系) は **retry せず即 escalation** (= 既存挙動維持)
- [ ] retry 中に log が出力される (`"GitHub PR merge retry: ..., retrying (N/3)..."` 形式)
- [ ] `src/util/retry.ts` (新規) に `retryWithBackoff` helper が export され、unit test がある
- [ ] `bun run typecheck && bun run test` が green
- [ ] 関連 test 追加 (retry helper / mergePullRequest の retry 挙動 / transient vs permanent 判定)

## architect 評価済みの設計判断

- **業界標準パターンの取り込み**: 革新的設計は不要、`@octokit/plugin-retry` 相当の最小実装を spec-runner 自前で持つ。retry pattern は exponential backoff (1s → 2s → 4s)、3 回上限
- **transient 判定の根拠**: 本セッションで観測した実例 (405 + "Base branch was modified") を中心に、業界共通の transient HTTP status (423 / 5xx) を combination で判定。文字列 matching に依存する部分は GitHub の error message 変更時に追従が必要 (= 別 axis のメンテコスト)
- **adapter vs orchestrator の責務**: 「PR merge は transient 失敗を吸収する operation」として adapter 内部 (`github-client.ts`) に retry を閉じる方針。orchestrator 側は「失敗したら escalation」というシンプルな contract のまま
- **既存 polling 機構との共存**: polling は「整合性が取れていそうな状態を待つ」、retry は「実 API 実行で確定 + transient ラグを吸収」。両者は直交する別軸の対策で、組み合わせて使う
- **memory `feedback_no_naive_hotfix` への配慮**: 「単に retry を増やす」だけでなく、transient と permanent の判定基準を明示してドキュメント化することで、将来 GitHub の error message が変わったときの調査ガイドになる
