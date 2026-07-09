# Cross-Boundary Invariants Review — main-checkout-write-detection

- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: approved

---

## 走査対象

新しい実行経路を以下の 3 経路に分類し、隣接機構の前提を個別に検証した。

- **Path A**: worktree mode の agent step で drift 検出 → `awaiting-resume` 遷移
- **Path B**: worktree mode の agent step で drift なし → 既存フローを素通り
- **Path C**: no-worktree / managed runtime → `guardBefore = null` → 検査スキップ

---

## 検証した不変条件と結果

### 1. タイムアウトエスカレーションパターンとの整合性

`executor.ts` の timeout 経路は確立済みのパターン（`recordFailedStepResult` → `transitionJob("awaiting-resume", ...)` → `appendInterruption` → `appendHistory` → `persist` → `attachStateAndRethrow`）を持つ。

drift 検出経路も同一シーケンスを踏む。差異は 2 点のみ:

- `recordFailedStepResult` の `partial` 引数が `{ startedAt }` のみで、timeout 経路にある `completedAt` と `transientRetryAttempts` を含まない。これは step result の診断データが不完全になる（`completedAt` は呼び出し時点で変数として存在する）。機能的影響はなく、既存テストへの影響もないが、timeout パターンとの一貫性を欠く。
- `patch` に `mainCheckoutDrift` フィールドを追加。`TransitionContext.patch` の型は `Partial<Omit<JobState, "version" | "jobId" | "createdAt" | "status" | "history">>` であり、`mainCheckoutDrift` は `JobState` の optional フィールドとして追加済みのため型適合する。

**判定**: パターン逸脱は `completedAt` 省略のみ。invariant 違反ではない（低影響の診断データ欠損）。

### 2. `Pipeline.runInternal` のエラーキャッチ後の続行動作

`runInternal` は executor の throw をキャッチし `state = errWithState.state`（`awaiting-resume`）を設定する。その後 `getStepOutcome(state, ...)` を呼ぶ。

`getStepOutcome` は `state.status === "failed"` のみ `"error"` を返し、`awaiting-resume` は分岐しない。`recordFailedStepResult` で `verdict: null` が設定されているため verdict チェックも素通りし、`completionVerdict`（例: `"success"`）を返す。

この結果、pipeline が次の step に進もうとする動作は **timeout 経路と同一**。drift 検出が新たに導入した挙動ではない。timeout の既存テストが green を維持しており、この動作は既存設計の一部として成立している。

**判定**: drift 検出が新たな invariant を破るものではない。

### 3. `transitionJob` の `patch` による `mainCheckoutDrift` の伝播

`transitionJob` は `ctx.patch` を `{ ...updated, ...ctx.patch }` でスプレッドする。`mainCheckoutDrift` はこの経路で state に統合される。`persist` が呼ばれることで disk state にも書き込まれ、その後 `handleResult` が `finalState.mainCheckoutDrift` を読める。型・validation ともに問題なし。

**判定**: invariant 保持。

### 4. `snapshotMainCheckoutGuard` の no-worktree / managed 経路への影響

`RuntimeStrategy` は `snapshotMainCheckoutGuard` を optional として宣言。executor は `deps.runtimeStrategy?.snapshotMainCheckoutGuard ? ... : null` で optional chaining を使う。`ManagedRuntime` は常に `null` を返す。`LocalRuntime` は `detectSpecrunnerWorktree(cwd).isSpecrunnerWorktree === false`（no-worktree mode）のとき `null` を返す。

既存の test fake（`RuntimeStrategy` 型）はこのメソッドを宣言せずとも typecheck を通す（optional のため）。`RealRuntimeStrategy` で required に昇格し、実 runtime の compile 時強制は保たれる。

**判定**: no-worktree / managed mode の既存不変条件を破らない。

### 5. `JobState` の後方互換性

`mainCheckoutDrift` は optional フィールドとして追加。`validateJobState` は `mainCheckoutDrift` が不在の既存 state を問題なく受け入れる（TC-022 で固定済み）。`forbiddenSurfaces` に宣言された `state-transitions` path（`src/state/schema.ts`）は spec-change request では conformance 検査の対象外である（design.md 「Risk」節に明記）。

**判定**: persisted-format の後方互換を保持。

### 6. `forbiddenSurfaces` literal `"fast"` 固定による監視集合の定義

`resolveMonitoredGuardGlobs` は常に `resolvePipelineForbiddenSurfaces(config, "fast")` を参照する。fast 以外のパイプライン実行時に `standard` 専用の forbiddenSurfaces が宣言されていても監視されない。これは設計判断（D3）に明示されており、本プロジェクトの forbiddenSurfaces は fast 配下にのみ宣言されているため実害はない。要件 2「pipeline 種別に関わらず監視する」とも整合する（forbiddenSurfaces の宣言場所が fast であるだけで、監視は pipeline 非依存）。

**判定**: 既知の設計選択。invariant 違反ではない。

### 7. `diffGuardSnapshots` の "before only → modified" 分類

before にあり after にない path を `"modified"` と分類する。これは「step 中に git clean / revert / commit によってファイルが clean 状態に戻った」ケースも含む。`"cleaned"` や `"reverted"` ではなく `"modified"` と表示されるため、CLI 出力がやや直感に反する可能性があるが、これは D4 に明示された意図的な設計。escalation が発火すること自体は正しい（main checkout に対する状態変化が起きたという事実は変わらない）。

**判定**: 設計上の trade-off として文書化済み。invariant 違反ではない。

---

## 非問題として確認した項目

- `snapshotMainCheckoutGuard` は `deps.cwd`（worktree path）を受け取り、内部で `detectSpecrunnerWorktree` を通じて `mainCheckoutPath` を導出する。`LocalRuntime.cwd`（main checkout）と一致することを detection ロジックで確認。
- `git status --porcelain -z` のパース: NUL separator、`XY<SP>path` フォーマット、削除検出（`D` in X or Y）、untracked files（`??`）の扱いはいずれも実装と一致。gitignored files（`.specrunner/local/` 等）は `--ignored` なしの status に現れず、自己誘発の誤検出が起きない。
- `guardBefore` capture のタイミング（`prepareStepArtifacts` 前）: `prepareStepArtifacts` は worktree（deps.cwd）にのみ書き込むため、main checkout の snapshot に影響しない。
- `store.fail()` の不在: drift は `awaiting-resume` 遷移（timeout と同型）であり、`failed` 遷移ではないため `store.fail()` を呼ばないのは正しい。
- `InterruptionRecord.reason = "failure"` は union 型 `"timeout" | "signal" | "failure" | "exhaustion"` に含まれる。型適合。

---

## Findings

### F-001 [low] `recordFailedStepResult` に `completedAt` が渡されない

**場所**: `src/core/step/executor.ts`（drift 検出ブロック）

**観測**: timeout 経路は `{ completedAt, startedAt, transientRetryAttempts }` を渡すが、drift 検出経路は `{ startedAt }` のみ。`completedAt` は呼び出し時点（line 401）で変数として存在する。

**影響**: step result に `completedAt` が含まれず、診断データが不完全。機能的影響・既存テスト影響なし。

**再現手順**: agent step 実行後に drift が検出された際の `state.steps[stepName]` の最終エントリを確認すると `completedAt` が undefined になっている。

**対処**: 修正するなら `{ completedAt, startedAt }` を渡すよう変更。ブロッカーではない。
